/**
 * Bordplanning.
 *
 * "Nu op bord X" wordt nergens opgeslagen: elk toestel berekent het zelf door
 * de avond na te spelen (replay) op basis van de servertijdstippen van de
 * uitslagen en het logboek (aantal borden, manuele toewijzingen, uitstel).
 * Dezelfde invoer geeft dus op elk scherm dezelfde planning.
 *
 * Met een duurinschatting rekent dezelfde simulatie verder in de toekomst
 * (forecast): "straks op bord 2" en de verwachte eindtijd.
 *
 * Keuze van de volgende match voor een vrij bord:
 *  1. liefst spelers die even rust hadden (geen twee matchen na elkaar);
 *  2. poules: de poule met de meeste resterende matchen eerst, dan op ronde;
 *     schema's: de langste resterende keten eerst (via winnaar én verliezer,
 *     bij A/B dus de vroegste ronde), dan het schema met de meeste
 *     resterende matchen;
 *  3. de spelers die het langst niet speelden;
 *  4. vaste volgorde.
 * Een speler staat nooit op twee borden tegelijk. De finale van de avond
 * (A-finale, grote finale of finale van het hoofdschema) gaat naar het
 * hoofdbord en wacht (instelbaar) tot alle andere matchen gedaan zijn.
 */

import { isBracketMatch, isEventFinal, type Match, type MatchId } from './types';

export type ScheduleLogEntry =
  | { type: 'boards'; at: number; boards: number[] }
  | { type: 'assign'; at: number; matchId: MatchId; board: number }
  | { type: 'hold'; at: number; matchId: MatchId }
  | { type: 'release'; at: number; matchId: MatchId };

export interface ScheduleConfig {
  start: number;
  /** Actieve borden bij de start. */
  boards: number[];
  mainBoard: number;
  holdFinal: boolean;
  minRestMs: number;
  /** Wachttijd na de poules voor virtuele KO-matchen (prognose). */
  transitionMs?: number;
}

export interface SchedulableMatch extends Match {
  /** Virtuele match (prognose) die pas kan starten na alle poule- en barragematchen. */
  afterPools?: boolean;
}

export interface Assignment {
  matchId: MatchId;
  board: number;
  start: number;
  /** Einde (werkelijk of voorspeld); null = nog bezig. */
  end: number | null;
  /** true als de start in de toekomst ligt (prognose). */
  predicted: boolean;
  /** De match werd van dit bord gehaald (verplaatst of uitgesteld). */
  interrupted: boolean;
  /** Beide spelers hadden voldoende rust. */
  rested: boolean;
  /** Er was een andere speelklare match met uitgeruste spelers (enkel bij automatische toewijzing). */
  restedAlternative: boolean;
}

export interface BoardStatus {
  board: number;
  active: boolean;
  matchId: MatchId | null;
  since: number | null;
}

export interface ScheduleResult {
  at: number;
  boards: BoardStatus[];
  /** Speelklare matchen zonder bord, in volgorde van prioriteit. */
  queue: MatchId[];
  held: MatchId[];
  assignments: Assignment[];
  /** Verwachte eindtijd (enkel bij een prognose waarin alles afgewerkt raakt). */
  end: number | null;
}

type DurationFn = (m: Match) => number;

function run(
  input: readonly SchedulableMatch[],
  log: readonly ScheduleLogEntry[],
  config: ScheduleConfig,
  nowInput: number,
  durationOf?: DurationFn,
): ScheduleResult {
  const matches = [...input].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(matches.map((m) => [m.id, m]));
  const actualFinishes = matches
    .filter((m) => m.finishedAt !== null)
    .sort((a, b) => (a.finishedAt as number) - (b.finishedAt as number) || (a.id < b.id ? -1 : 1));
  // Wie de klokverschillen tussen toestel en server wil opvangen, geeft zelf een "nu" ≥ de laatste uitslag mee.
  const now = Math.max(nowInput, config.start);
  const entries = [...log].sort((a, b) => a.at - b.at);

  // Wie voedt welke plaats? (voor matchen waarvan de spelers nog niet gekend zijn)
  const feederOf = new Map<string, string>();
  const feeders = new Map<MatchId, MatchId[]>();
  for (const m of matches) {
    for (const [ref, kind] of [
      [m.next, 'w'],
      [m.loserNext, 'l'],
    ] as const) {
      if (!ref || !byId.has(ref.matchId)) continue;
      feederOf.set(`${ref.matchId}:${ref.slot}`, `${kind}:${m.id}`);
      feeders.set(ref.matchId, [...(feeders.get(ref.matchId) ?? []), m.id]);
    }
  }
  const keyCache = new Map<MatchId, string[]>();
  const keysOf = (m: Match): string[] => {
    const cached = keyCache.get(m.id);
    if (cached) return cached;
    const keys: string[] = [];
    for (const slot of [1, 2] as const) {
      const player = slot === 1 ? m.player1 : m.player2;
      const token = feederOf.get(`${m.id}:${slot}`);
      if (player) keys.push(player);
      else if (token) keys.push(token);
    }
    keyCache.set(m.id, keys);
    return keys;
  };

  // Langste keten van matchen die nog op deze match wachten (via winnaar en verliezer).
  // Bij een gewoon KO-schema is dat het aantal rondes tot de finale.
  const chain = new Map<MatchId, number>();
  const chainOf = (m: Match): number => {
    const cached = chain.get(m.id);
    if (cached !== undefined) return cached;
    let length = 0;
    for (const ref of [m.next, m.loserNext]) {
      const target = ref ? byId.get(ref.matchId) : undefined;
      if (target) length = Math.max(length, 1 + chainOf(target));
    }
    chain.set(m.id, length);
    return length;
  };
  const groupOf = (m: Match) => (m.stage === 'pool' ? `pool:${m.poolId}` : m.stage);
  const isPoolPhase = (m: Match) => m.stage === 'pool' || m.stage === 'barrage';

  // Toestand
  const active = new Set(config.boards);
  const occupied = new Map<number, { matchId: MatchId; since: number; assignment: Assignment }>();
  const liveBoard = new Map<MatchId, number>();
  const finished = new Set<MatchId>();
  const held = new Set<MatchId>();
  const busy = new Map<string, number>();
  const lastFinish = new Map<string, number>();
  const remaining = new Map<string, number>();
  const assignments: Assignment[] = [];
  let unfinished = matches.length;
  let poolPhaseOpen = matches.filter(isPoolPhase).length;
  let poolsDoneAt: number | null = poolPhaseOpen === 0 ? config.start : null;
  for (const m of matches) remaining.set(groupOf(m), (remaining.get(groupOf(m)) ?? 0) + 1);

  const free = (matchId: MatchId, t: number, interrupted: boolean) => {
    const board = liveBoard.get(matchId);
    if (board === undefined) return;
    const occ = occupied.get(board);
    if (occ && occ.matchId === matchId) {
      occ.assignment.end = t;
      occ.assignment.interrupted = interrupted;
      occupied.delete(board);
    }
    liveBoard.delete(matchId);
    for (const k of keysOf(byId.get(matchId) as Match)) busy.set(k, (busy.get(k) ?? 1) - 1);
  };

  const occupy = (m: Match, board: number, t: number, restedAlternative = false) => {
    const assignment: Assignment = {
      matchId: m.id,
      board,
      start: t,
      end: null,
      predicted: t > now,
      interrupted: false,
      rested: restOf(m, t) >= config.minRestMs,
      restedAlternative,
    };
    assignments.push(assignment);
    occupied.set(board, { matchId: m.id, since: t, assignment });
    liveBoard.set(m.id, board);
    for (const k of keysOf(m)) busy.set(k, (busy.get(k) ?? 0) + 1);
  };

  const finish = (m: Match, t: number) => {
    if (finished.has(m.id)) return;
    free(m.id, t, false);
    finished.add(m.id);
    held.delete(m.id);
    if (!m.walkover) {
      for (const k of keysOf(m)) lastFinish.set(k, t);
    }
    lastFinish.set(`w:${m.id}`, t);
    lastFinish.set(`l:${m.id}`, t);
    remaining.set(groupOf(m), (remaining.get(groupOf(m)) as number) - 1);
    unfinished--;
    if (isPoolPhase(m)) {
      poolPhaseOpen--;
      if (poolPhaseOpen === 0) poolsDoneAt = t;
    }
  };

  const applyLog = (e: ScheduleLogEntry, t: number) => {
    if (e.type === 'boards') {
      active.clear();
      for (const b of e.boards) active.add(b);
      return;
    }
    const m = byId.get(e.matchId);
    if (!m || finished.has(m.id)) return;
    if (e.type === 'hold') {
      free(m.id, t, true);
      held.add(m.id);
    } else if (e.type === 'release') {
      held.delete(m.id);
    } else {
      held.delete(m.id);
      free(m.id, t, true);
      const occ = occupied.get(e.board);
      if (occ) free(occ.matchId, t, true);
      occupy(m, e.board, t);
    }
  };

  const transitionMs = config.transitionMs ?? 0;
  const isReady = (m: SchedulableMatch, t: number) => {
    if (finished.has(m.id) || liveBoard.has(m.id) || held.has(m.id)) return false;
    if (m.createdAt > t) return false;
    if (m.afterPools && (poolsDoneAt === null || t < poolsDoneAt + transitionMs)) return false;
    for (const f of feeders.get(m.id) ?? []) if (!finished.has(f)) return false;
    if (keysOf(m).length < 2) return false;
    if (config.holdFinal && isEventFinal(m) && unfinished > 1) return false;
    return true;
  };

  const restOf = (m: Match, t: number) => {
    let rest = Number.POSITIVE_INFINITY;
    for (const k of keysOf(m)) {
      const last = lastFinish.get(k);
      if (last !== undefined) rest = Math.min(rest, t - last);
    }
    return rest;
  };

  /** Sorteersleutel: lager = eerder aan de beurt. */
  const priority = (m: Match, t: number): number[] => {
    const rest = restOf(m, t);
    const rem = remaining.get(groupOf(m)) as number;
    const restKey = rest === Number.POSITIVE_INFINITY ? -1e15 : -rest;
    return isBracketMatch(m)
      ? [rest >= config.minRestMs ? 0 : 1, 1, -chainOf(m), -rem, restKey, m.position]
      : [rest >= config.minRestMs ? 0 : 1, 0, -rem, m.round, restKey, m.position];
  };

  const readyQueue = (t: number) =>
    matches
      .filter((m) => isReady(m, t))
      .map((m) => ({ m, k: priority(m, t) }))
      .sort((a, b) => {
        for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
        return a.m.id < b.m.id ? -1 : 1;
      })
      .map((x) => x.m);

  const assignPass = (t: number) => {
    const freeBoards = [...active].filter((b) => !occupied.has(b)).sort((a, b) => a - b);
    if (freeBoards.length === 0) return;
    let candidates = readyQueue(t);
    const mainAvailable = active.has(config.mainBoard);
    for (const board of freeBoards) {
      const eligible = candidates.filter((m) => {
        if (keysOf(m).some((k) => (busy.get(k) ?? 0) > 0)) return false;
        if (isEventFinal(m) && mainAvailable && board !== config.mainBoard) return false;
        return true;
      });
      const pick = eligible[0];
      if (!pick) continue;
      const restedAlternative = eligible.some((m) => m !== pick && restOf(m, t) >= config.minRestMs);
      occupy(pick, board, t, restedAlternative);
      candidates = candidates.filter((m) => m !== pick);
    }
  };

  // Gebeurtenissen afspelen
  let t = config.start;
  let fi = 0;
  let li = 0;
  const createdTimes = [...new Set(matches.map((m) => m.createdAt))].sort((a, b) => a - b);

  const predictedEnd = (matchId: MatchId): number | null => {
    if (!durationOf) return null;
    const m = byId.get(matchId) as Match;
    if (m.finishedAt !== null) return null;
    const since = occupied.get(liveBoard.get(matchId) as number)?.since ?? t;
    return Math.max(now, since + durationOf(m));
  };

  const step = (time: number) => {
    while (fi < actualFinishes.length && (actualFinishes[fi].finishedAt as number) <= time) {
      finish(actualFinishes[fi], Math.max(actualFinishes[fi].finishedAt as number, config.start));
      fi++;
    }
    if (durationOf && time >= now) {
      for (const [matchId] of [...liveBoard]) {
        const end = predictedEnd(matchId);
        if (end !== null && end <= time) finish(byId.get(matchId) as Match, end);
      }
    }
    while (li < entries.length && entries[li].at <= time) {
      applyLog(entries[li], Math.max(entries[li].at, config.start));
      li++;
    }
    assignPass(time);
  };

  step(t);
  for (let guard = 0; guard < 100_000; guard++) {
    const candidates: number[] = [];
    if (fi < actualFinishes.length) candidates.push(actualFinishes[fi].finishedAt as number);
    if (li < entries.length) candidates.push(entries[li].at);
    const nextCreated = createdTimes.find((c) => c > t);
    if (nextCreated !== undefined) candidates.push(nextCreated);
    if (poolsDoneAt !== null && poolsDoneAt + transitionMs > t) candidates.push(poolsDoneAt + transitionMs);
    if (durationOf) {
      for (const [matchId] of liveBoard) {
        const end = predictedEnd(matchId);
        if (end !== null) candidates.push(end);
      }
    }
    const future = candidates.filter((c) => c > t);
    if (future.length === 0) break;
    const next = Math.min(...future);
    if (!durationOf && next > now) break;
    t = next;
    step(t);
  }

  const at = durationOf ? t : now;
  const boardNumbers = [...new Set([...active, ...occupied.keys()])].sort((a, b) => a - b);
  // Bij een prognose tonen we de toestand op "nu", niet op het einde.
  const nowView = durationOf ? snapshotAt(assignments, now, config, log) : null;
  const queueAt = durationOf ? [] : readyQueue(now).map((m) => m.id);
  return {
    at,
    boards:
      nowView ??
      boardNumbers.map((board) => ({
        board,
        active: active.has(board),
        matchId: occupied.get(board)?.matchId ?? null,
        since: occupied.get(board)?.since ?? null,
      })),
    queue: queueAt,
    held: [...held],
    assignments,
    end: durationOf && unfinished === 0 ? Math.max(config.start, ...assignments.map((a) => a.end ?? 0), ...actualFinishes.map((m) => m.finishedAt as number)) : null,
  };
}

function snapshotAt(
  assignments: readonly Assignment[],
  now: number,
  config: ScheduleConfig,
  log: readonly ScheduleLogEntry[],
): BoardStatus[] {
  let active = new Set(config.boards);
  for (const e of [...log].sort((a, b) => a.at - b.at)) {
    if (e.type === 'boards' && e.at <= now) active = new Set(e.boards);
  }
  const live = assignments.filter((a) => a.start <= now && (a.end === null || a.end > now));
  const all = [...new Set([...active, ...live.map((a) => a.board)])].sort((a, b) => a - b);
  return all.map((board) => {
    const current = live.find((a) => a.board === board);
    return { board, active: active.has(board), matchId: current?.matchId ?? null, since: current?.start ?? null };
  });
}

/** Huidige toestand: wie speelt waar, en wat is speelklaar. */
export function replaySchedule(
  matches: readonly SchedulableMatch[],
  log: readonly ScheduleLogEntry[],
  config: ScheduleConfig,
  now: number,
): ScheduleResult {
  return run(matches, log, config, now);
}

/** Prognose: verder simuleren met de verwachte duur per match. */
export function forecastSchedule(
  matches: readonly SchedulableMatch[],
  log: readonly ScheduleLogEntry[],
  config: ScheduleConfig,
  now: number,
  durationOf: DurationFn,
): ScheduleResult {
  return run(matches, log, config, now, durationOf);
}

/** Per bord de eerstvolgende voorspelde match na "nu". */
export function upcomingByBoard(forecast: ScheduleResult, now: number): Map<number, Assignment> {
  const out = new Map<number, Assignment>();
  for (const a of [...forecast.assignments].sort((x, y) => x.start - y.start)) {
    if (a.start <= now || out.has(a.board)) continue;
    out.set(a.board, a);
  }
  return out;
}
