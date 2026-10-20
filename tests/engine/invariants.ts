/**
 * Controles die na elke gesimuleerde avond moeten kloppen.
 * Elke functie geeft een lijst met fouten terug (leeg = in orde).
 */

import {
  bracketSize,
  isFinished,
  knockoutSizes,
  replaySchedule,
  type Assignment,
  type BuiltBracket,
  type Match,
  type PlayerId,
  type SimulationOptions,
  type SimulationResult,
} from '../../src/engine';

export interface CheckContext {
  opts: SimulationOptions;
  sizes: number[];
  advance: number;
  result: SimulationResult;
}

export function checkPools({ opts, sizes, result }: CheckContext): string[] {
  const errors: string[] = [];
  const all = result.pools.flatMap((p) => p.playerIds);
  if (all.length !== opts.players.length || new Set(all).size !== all.length) {
    errors.push('niet elke speler zit in precies één poule');
  }
  const actual = result.pools.map((p) => p.playerIds.length);
  if (actual.join(',') !== sizes.join(',')) errors.push(`poulegroottes ${actual} ≠ ${sizes}`);

  // Topseeds in verschillende poules.
  const ranked = opts.players
    .filter((p) => p.seedRank != null)
    .sort((a, b) => (a.seedRank as number) - (b.seedRank as number));
  const top = ranked.slice(0, result.pools.length).map((p) => p.id);
  const poolOf = new Map(result.pools.flatMap((p) => p.playerIds.map((id) => [id, p.id] as const)));
  if (new Set(top.map((id) => poolOf.get(id))).size !== top.length) errors.push('topseeds zitten samen in een poule');

  // Ieder tegen ieder, precies één keer.
  for (const pool of result.pools) {
    const pairs = new Set(
      result.matches
        .filter((m) => m.stage === 'pool' && m.poolId === pool.id)
        .map((m) => [m.player1, m.player2].sort().join('|')),
    );
    const k = pool.playerIds.length;
    if (pairs.size !== (k * (k - 1)) / 2) errors.push(`${pool.id}: niet iedereen speelde tegen iedereen`);
  }
  return errors;
}

function byes(bracket: BuiltBracket, matches: readonly Match[]): PlayerId[] {
  const r1 = new Set(
    matches.filter((m) => m.stage === bracket.stage && m.round === 1).flatMap((m) => [m.player1, m.player2]),
  );
  return bracket.matches.length === 0 ? [] : bracket.participants.filter((p) => !r1.has(p));
}

export function checkKnockout({ sizes, advance, result }: CheckContext): string[] {
  const errors: string[] = [];
  const expected = knockoutSizes(sizes, advance);
  const { A, B } = result.knockout;
  if (A.participants.length !== expected.A || B.participants.length !== expected.B) {
    errors.push(`A/B-grootte ${A.participants.length}/${B.participants.length} ≠ ${expected.A}/${expected.B}`);
  }
  const everyone = new Set([...A.participants, ...B.participants]);
  if (everyone.size !== result.pools.flatMap((p) => p.playerIds).length) errors.push('niet iedereen zit in A of B');

  const poolOf = new Map(result.pools.flatMap((p) => p.playerIds.map((id) => [id, p.id] as const)));
  const rows = new Map(result.standings.flatMap((s) => s.rows.map((r) => [r.playerId, r] as const)));

  for (const bracket of [A, B]) {
    const m = bracket.participants.length;
    if (m <= 1) continue;
    const size = bracketSize(m);
    // Byes naar de hoogste seeds: alleen spelers uit de bovenste laag.
    const byePlayers = byes(bracket, result.matches);
    if (byePlayers.length !== size - m) errors.push(`${bracket.stage}: ${byePlayers.length} byes, verwacht ${size - m}`);
    if (bracket.stage === 'A' && result.pools.length >= 2) {
      // Byes eerst naar poulewinnaars; zijn er meer byes dan winnaars, dan krijgen alle winnaars er een.
      const winners = bracket.participants.filter((p) => rows.get(p)?.position === 1);
      const byeWinners = byePlayers.filter((p) => rows.get(p)?.position === 1);
      if (byeWinners.length !== Math.min(winners.length, byePlayers.length)) {
        errors.push('A: byes niet eerst naar de poulewinnaars');
      }
      if (byePlayers.length <= winners.length) {
        const best = winners.slice(0, byePlayers.length);
        if (byePlayers.some((p) => !best.includes(p))) errors.push('A: byes niet naar de beste poulewinnaars');
      }
    }

    // Geen poulegenoten in de eerste ronde.
    const r1 = result.matches.filter((x) => x.stage === bracket.stage && x.round === 1 && !x.walkover);
    const sameR1 = r1.filter((x) => poolOf.get(x.player1 as string) === poolOf.get(x.player2 as string));
    if (bracket.level >= 1 && sameR1.length > 0) errors.push(`${bracket.stage}: poulegenoten in ronde 1`);

    // Poulegenoten in verschillende helften (A-schema, minstens 2 poules, max 2 per poule).
    if (bracket.stage === 'A' && result.pools.length >= 2 && advance <= 2) {
      if (bracket.level < 2) errors.push(`A: poulescheiding niet gehaald (niveau ${bracket.level})`);
      const half = bracket.slots.length / 2;
      const halves = new Map<string, Set<number>>();
      bracket.slots.forEach((p, i) => {
        if (!p) return;
        const pool = poolOf.get(p) as string;
        const set = halves.get(pool) ?? new Set<number>();
        if (set.has(i < half ? 0 : 1)) errors.push(`A: poulegenoten van ${pool} in dezelfde helft`);
        set.add(i < half ? 0 : 1);
        halves.set(pool, set);
      });
    }
    if (bracket.stage === 'A' && result.pools.length >= 2 && bracket.level < 1) errors.push('A: ronde-1-scheiding niet gehaald');
  }
  return errors;
}

export function checkPlacements({ opts, result }: CheckContext): string[] {
  const errors: string[] = [];
  const ps = result.placements;
  const ids = ps.map((p) => p.playerId);
  if (ids.length !== opts.players.length || new Set(ids).size !== ids.length) {
    errors.push(`plaatsen voor ${new Set(ids).size}/${opts.players.length} spelers`);
    return errors;
  }
  // De gedeelde plaatsen vormen samen exact 1..n.
  const ranges = new Map<string, number>();
  for (const p of ps) ranges.set(`${p.from}-${p.to}`, (ranges.get(`${p.from}-${p.to}`) ?? 0) + 1);
  let expected = 1;
  for (const [key, count] of [...ranges.entries()].sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]))) {
    const [from, to] = key.split('-').map(Number);
    if (from !== expected) errors.push(`plaats ${expected} ontbreekt (gevonden ${key})`);
    if (to - from + 1 !== count) errors.push(`plaats ${key} gedeeld door ${count} spelers`);
    expected = to + 1;
  }
  if (expected !== opts.players.length + 1) errors.push(`plaatsen eindigen op ${expected - 1}`);
  // Winnaar A-schema is eerste.
  const aFinal = result.matches.find((m) => m.stage === 'A' && m.next === null);
  if (aFinal && ps.find((p) => p.from === 1)?.playerId !== aFinal.winner) errors.push('winnaar A-finale is niet eerste');
  return errors;
}

function overlaps(list: Assignment[]): boolean {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i - 1].end as number) > sorted[i].start) return true;
  }
  return false;
}

export function checkSchedule({ opts, result }: CheckContext): string[] {
  const errors: string[] = [];
  const byId = new Map(result.matches.map((m) => [m.id, m]));
  const history = result.history;
  if (history.some((a) => a.end === null)) errors.push('match zonder einde in de historiek');

  // Nooit een bord of speler dubbel.
  const perBoard = new Map<number, Assignment[]>();
  const perPlayer = new Map<string, Assignment[]>();
  for (const a of history) {
    perBoard.set(a.board, [...(perBoard.get(a.board) ?? []), a]);
    const m = byId.get(a.matchId) as Match;
    for (const p of [m.player1, m.player2]) if (p) perPlayer.set(p, [...(perPlayer.get(p) ?? []), a]);
  }
  for (const [board, list] of perBoard) if (overlaps(list)) errors.push(`bord ${board} dubbel bezet`);
  for (const [player, list] of perPlayer) if (overlaps(list)) errors.push(`speler ${player} op twee borden tegelijk`);

  // Twee matchen na elkaar alleen als er geen uitgeruste alternatieve match was.
  const tired = history.find((a) => !a.rested && a.restedAlternative);
  if (tired) errors.push(`${tired.matchId} zonder rust gestart terwijl er een alternatief was`);

  // Elke gespeelde (niet-walk-over) match stond op een bord.
  const played = new Set(history.map((a) => a.matchId));
  const missing = result.matches.filter((m) => !m.walkover && !played.has(m.id));
  if (missing.length > 0) errors.push(`${missing.length} matchen nooit op een bord`);

  // A-finale als laatste, op het hoofdbord.
  const aFinal = result.matches.find((m) => m.stage === 'A' && m.next === null && !m.walkover);
  if (aFinal && (opts.holdFinal ?? true)) {
    const fa = history.find((a) => a.matchId === aFinal.id && !a.interrupted) as Assignment;
    const lastOther = Math.max(...history.filter((a) => a.matchId !== aFinal.id).map((a) => a.end as number));
    if (fa.start < lastOther) errors.push('A-finale startte voor alle andere matchen gedaan waren');
    const boardsAtFinal = activeBoardsAt(result, fa.start);
    if (boardsAtFinal.includes(result.config.mainBoard) && fa.board !== result.config.mainBoard) {
      errors.push(`A-finale niet op het hoofdbord (${fa.board})`);
    }
  }

  // Geen weggenomen bord in gebruik, geen vrij bord terwijl er een match klaarstaat.
  const times = [...new Set(history.flatMap((a) => [a.start, a.end as number]))].sort((a, b) => a - b);
  for (const t of times) {
    const active = activeBoardsAt(result, t);
    const startsHere = history.filter((a) => a.start === t);
    for (const a of startsHere) {
      if (!active.includes(a.board)) errors.push(`match gestart op inactief bord ${a.board}`);
    }
    const snap = replaySchedule(result.matches, result.log, result.config, t);
    const busyPlayers = new Set(
      snap.boards.filter((b) => b.matchId).flatMap((b) => {
        const m = byId.get(b.matchId as string) as Match;
        return [m.player1, m.player2];
      }),
    );
    const freeBoards = snap.boards.filter((b) => b.active && !b.matchId).map((b) => b.board);
    const playable = snap.queue
      .map((id) => byId.get(id) as Match)
      .filter((m) => !busyPlayers.has(m.player1) && !busyPlayers.has(m.player2));
    const blocking = playable.filter((m) => !(m.stage === 'A' && m.next === null) || freeBoards.includes(result.config.mainBoard));
    if (freeBoards.length > 0 && blocking.length > 0) {
      errors.push(`bord vrij om ${new Date(t).toISOString()} terwijl ${blocking[0].id} klaarstaat`);
      break;
    }
  }
  return errors;
}

export function activeBoardsAt(result: SimulationResult, t: number): number[] {
  let active = result.config.boards;
  for (const e of result.log) if (e.type === 'boards' && e.at <= t) active = e.boards;
  return active;
}

export function checkWithdrawals({ opts, result }: CheckContext): string[] {
  const errors: string[] = [];
  for (const d of opts.disruptions ?? []) {
    if (d.type !== 'withdraw') continue;
    const at = opts.start + d.atMinutes * 60_000;
    const later = result.matches.filter(
      (m) => (m.player1 === d.playerId || m.player2 === d.playerId) && (m.finishedAt as number) > at,
    );
    for (const m of later) {
      if (m.winner === d.playerId && !(m.walkover && result.withdrawn.has(m.player1 === d.playerId ? (m.player2 as string) : (m.player1 as string)))) {
        errors.push(`${d.playerId} won ${m.id} na opgave`);
      }
      if (!m.walkover) errors.push(`${d.playerId} speelde ${m.id} na opgave`);
    }
  }
  if (!result.matches.every(isFinished)) errors.push('niet alle matchen afgewerkt');
  return errors;
}

/** Aantal keer dat een speler minder dan minRest na zijn vorige match opnieuw moest spelen. */
export function backToBackCount(result: SimulationResult, stage: Match['stage'] = 'pool'): number {
  const byId = new Map(result.matches.map((m) => [m.id, m]));
  const lastEnd = new Map<string, number>();
  let count = 0;
  for (const a of [...result.history].sort((x, y) => x.start - y.start)) {
    const m = byId.get(a.matchId) as Match;
    for (const p of [m.player1, m.player2] as string[]) {
      const prev = lastEnd.get(p);
      if (m.stage === stage && prev !== undefined && a.start - prev < result.config.minRestMs) count++;
    }
    for (const p of [m.player1, m.player2] as string[]) lastEnd.set(p, Math.max(lastEnd.get(p) ?? 0, a.end as number));
  }
  return count;
}

export function checkAll(ctx: CheckContext): string[] {
  return [
    ...checkPools(ctx),
    ...checkKnockout(ctx),
    ...checkPlacements(ctx),
    ...checkSchedule(ctx),
    ...checkWithdrawals(ctx),
  ];
}
