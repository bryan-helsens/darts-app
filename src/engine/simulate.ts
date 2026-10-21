/**
 * Simuleert een volledige speelavond met willekeurige uitslagen en
 * speelduren. Gebruikt door de tests (alle spelers- en bordaantallen) en door
 * de seed-generator.
 */

import { startBracket, type BuiltElimination } from './elimination';
import { eliminationPlacements, eventPlacements, type KnockoutParticipants, type Placement } from './placements';
import { standardSizes, defaultAdvance } from './poolLayouts';
import { applyResult, autoWalkovers, legsToWin } from './results';
import { createRng } from './rng';
import { replaySchedule, type Assignment, type ScheduleConfig, type ScheduleLogEntry } from './scheduler';
import { DEFAULT_LEGS, DEFAULT_TIMING, MINUTE, type LegsSettings, type TimingSettings } from './settings';
import { createBarrageMatches, type PoolStanding } from './standings';
import { generateKnockouts, poolPhaseStatus, startPools, type GeneratedKnockouts } from './tournament';
import type { EliminationFormat, EventPlayer, Match, PlayerId, Pool } from './types';
import { isFinished } from './types';

export type SimDisruption =
  | { type: 'boards'; atMinutes: number; boards: number[] }
  | { type: 'withdraw'; atMinutes: number; playerId: PlayerId };

export interface SimulationOptions {
  players: EventPlayer[];
  sizes?: number[];
  advance?: number;
  boards: number;
  mainBoard?: number;
  legs?: LegsSettings;
  timing?: TimingSettings;
  holdFinal?: boolean;
  start: number;
  seed: string;
  disruptions?: SimDisruption[];
  /** Kans dat a wint van b (standaard 50%). */
  winProbability?: (a: PlayerId, b: PlayerId) => number;
  barragePolicy?: 'play' | 'lot';
  /** Minuten per leg, willekeurig tussen deze grenzen. */
  legMinutes?: [number, number];
}

export interface SimulationResult {
  pools: Pool[];
  matches: Match[];
  log: ScheduleLogEntry[];
  config: ScheduleConfig;
  participants: KnockoutParticipants;
  knockout: GeneratedKnockouts;
  placements: Placement[];
  standings: PoolStanding[];
  withdrawn: Set<PlayerId>;
  acceptedLots: Set<string>;
  history: Assignment[];
  knockoutGeneratedAt: number;
  end: number;
}

export class SimulationStuck extends Error {}

export function simulateEvening(opts: SimulationOptions): SimulationResult {
  const rng = createRng(opts.seed);
  const legs = opts.legs ?? DEFAULT_LEGS;
  const timing = opts.timing ?? DEFAULT_TIMING;
  const sizes = opts.sizes ?? standardSizes(opts.players.length);
  const advance = opts.advance ?? defaultAdvance(sizes);
  const legMinutes = opts.legMinutes ?? [4, 8];
  const winProbability = opts.winProbability ?? (() => 0.5);
  const config: ScheduleConfig = {
    start: opts.start,
    boards: Array.from({ length: opts.boards }, (_, i) => i + 1),
    mainBoard: opts.mainBoard ?? 1,
    holdFinal: opts.holdFinal ?? true,
    minRestMs: timing.minRestMinutes * MINUTE,
  };
  const seedRanks = new Map(opts.players.map((p) => [p.id, p.seedRank ?? null]));

  const started = startPools({ players: opts.players, sizes, bestOf: legs.pool, rng, createdAt: opts.start });
  const pools = started.pools;
  let matches = started.matches;
  const log: ScheduleLogEntry[] = [];
  const withdrawn = new Set<PlayerId>();
  const acceptedLots = new Set<string>();
  const planned = new Map<string, { legs1: number; legs2: number; duration: number }>();
  const disruptions = [...(opts.disruptions ?? [])].sort((a, b) => a.atMinutes - b.atMinutes);
  let di = 0;
  let t = opts.start;
  let participants: KnockoutParticipants | null = null;
  let knockout: GeneratedKnockouts | null = null;
  let standings: PoolStanding[] = [];
  let knockoutGeneratedAt = 0;

  const plan = (m: Match) => {
    const p1Wins = rng.next() < winProbability(m.player1 as PlayerId, m.player2 as PlayerId);
    const need = legsToWin(m.bestOf);
    const lost = rng.int(need);
    const total = need + lost;
    let minutes = timing.changeoverMinutes;
    for (let i = 0; i < total; i++) minutes += legMinutes[0] + rng.next() * (legMinutes[1] - legMinutes[0]);
    return {
      legs1: p1Wins ? need : lost,
      legs2: p1Wins ? lost : need,
      duration: Math.round(minutes * MINUTE),
    };
  };

  for (let guard = 0; guard < 10_000; guard++) {
    const snap = replaySchedule(matches, log, config, t);
    let next: { matchId: string; at: number; board: number } | null = null;
    for (const b of snap.boards) {
      if (!b.matchId) continue;
      const key = `${b.matchId}@${b.since}`;
      const m = matches.find((x) => x.id === b.matchId) as Match;
      if (!planned.has(key)) planned.set(key, plan(m));
      const at = (b.since as number) + (planned.get(key) as { duration: number }).duration;
      if (!next || at < next.at) next = { matchId: b.matchId, at, board: b.board };
    }

    const disruption = disruptions[di];
    const disruptionAt = disruption ? opts.start + disruption.atMinutes * MINUTE : null;
    if (disruption && disruptionAt !== null && (next === null || disruptionAt <= next.at) && matches.some((m) => !isFinished(m))) {
      di++;
      t = Math.max(t, disruptionAt);
      if (disruption.type === 'boards') {
        log.push({ type: 'boards', at: t, boards: disruption.boards });
      } else {
        withdrawn.add(disruption.playerId);
        matches = autoWalkovers(matches, withdrawn, t);
      }
      continue;
    }

    if (next) {
      t = next.at;
      const m = matches.find((x) => x.id === next.matchId) as Match;
      const key = `${next.matchId}@${snap.boards.find((b) => b.matchId === next.matchId)?.since}`;
      const result = planned.get(key) as { legs1: number; legs2: number };
      matches = applyResult(matches, m.id, { legs1: result.legs1, legs2: result.legs2, finishedAt: t, board: next.board });
      matches = autoWalkovers(matches, withdrawn, t);
      continue;
    }

    // Niets bezig op de borden.
    if (!participants) {
      const status = poolPhaseStatus({ pools, matches, advance, lotSeed: opts.seed, withdrawn, acceptedLots });
      if (!status.poolsComplete || status.barragesOpen) {
        throw new SimulationStuck(`Vastgelopen tijdens de poules (wachtrij: ${snap.queue.length})`);
      }
      if (status.barrageNeeds.length > 0) {
        for (const need of status.barrageNeeds) {
          if ((opts.barragePolicy ?? 'play') === 'play') {
            matches = [...matches, ...createBarrageMatches(need, legs.barrage, t, matches)];
          } else {
            acceptedLots.add(need.key);
          }
        }
        continue;
      }
      standings = status.standings;
      knockoutGeneratedAt = t + timing.transitionMinutes * MINUTE;
      const ko = generateKnockouts({ standings, advance, legs, lotSeed: opts.seed, seedRanks, createdAt: knockoutGeneratedAt });
      matches = autoWalkovers([...matches, ...ko.matches], withdrawn, knockoutGeneratedAt);
      participants = ko.participants;
      knockout = ko;
      t = knockoutGeneratedAt;
      continue;
    }

    if (matches.every(isFinished)) break;
    throw new SimulationStuck(`Vastgelopen in de KO-fase (wachtrij: ${snap.queue.length})`);
  }

  if (!participants || !knockout || !matches.every(isFinished)) throw new SimulationStuck('Simulatie niet afgerond');
  const placements = eventPlacements(matches, participants).placements;
  const finalReplay = replaySchedule(matches, log, config, t);
  return {
    pools,
    matches,
    log,
    config,
    participants,
    knockout,
    placements,
    standings,
    withdrawn,
    acceptedLots,
    history: finalReplay.assignments,
    knockoutGeneratedAt,
    end: Math.max(...matches.map((m) => m.finishedAt ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Schema-formats: dezelfde lus, zonder poules.
// ---------------------------------------------------------------------------

export interface BracketSimulationOptions extends Omit<SimulationOptions, 'sizes' | 'advance' | 'barragePolicy'> {
  format: EliminationFormat;
}

export interface BracketSimulationResult {
  bracket: BuiltElimination;
  matches: Match[];
  log: ScheduleLogEntry[];
  config: ScheduleConfig;
  placements: Placement[];
  withdrawn: Set<PlayerId>;
  history: Assignment[];
  end: number;
}

export function simulateBracketEvening(opts: BracketSimulationOptions): BracketSimulationResult {
  const rng = createRng(opts.seed);
  const legs = opts.legs ?? DEFAULT_LEGS;
  const timing = opts.timing ?? DEFAULT_TIMING;
  const legMinutes = opts.legMinutes ?? [4, 8];
  const winProbability = opts.winProbability ?? (() => 0.5);
  const config: ScheduleConfig = {
    start: opts.start,
    boards: Array.from({ length: opts.boards }, (_, i) => i + 1),
    mainBoard: opts.mainBoard ?? 1,
    holdFinal: opts.holdFinal ?? true,
    minRestMs: timing.minRestMinutes * MINUTE,
  };
  const bracket = startBracket({ format: opts.format, players: opts.players, legs, rng, createdAt: opts.start });
  let matches = bracket.matches;
  const log: ScheduleLogEntry[] = [];
  const withdrawn = new Set<PlayerId>();
  const planned = new Map<string, { legs1: number; legs2: number; duration: number }>();
  const disruptions = [...(opts.disruptions ?? [])].sort((a, b) => a.atMinutes - b.atMinutes);
  let di = 0;
  let t = opts.start;

  const plan = (m: Match) => {
    const p1Wins = rng.next() < winProbability(m.player1 as PlayerId, m.player2 as PlayerId);
    const need = legsToWin(m.bestOf);
    const lost = rng.int(need);
    let minutes = timing.changeoverMinutes;
    for (let i = 0; i < need + lost; i++) minutes += legMinutes[0] + rng.next() * (legMinutes[1] - legMinutes[0]);
    return { legs1: p1Wins ? need : lost, legs2: p1Wins ? lost : need, duration: Math.round(minutes * MINUTE) };
  };

  for (let guard = 0; guard < 10_000; guard++) {
    if (matches.every(isFinished)) break;
    const snap = replaySchedule(matches, log, config, t);
    let next: { matchId: string; at: number; board: number; key: string } | null = null;
    for (const b of snap.boards) {
      if (!b.matchId) continue;
      const key = `${b.matchId}@${b.since}`;
      const m = matches.find((x) => x.id === b.matchId) as Match;
      if (!planned.has(key)) planned.set(key, plan(m));
      const at = (b.since as number) + (planned.get(key) as { duration: number }).duration;
      if (!next || at < next.at) next = { matchId: b.matchId, at, board: b.board, key };
    }
    const disruption = disruptions[di];
    const disruptionAt = disruption ? opts.start + disruption.atMinutes * MINUTE : null;
    if (disruption && disruptionAt !== null && (next === null || disruptionAt <= next.at)) {
      di++;
      t = Math.max(t, disruptionAt);
      if (disruption.type === 'boards') log.push({ type: 'boards', at: t, boards: disruption.boards });
      else {
        withdrawn.add(disruption.playerId);
        matches = autoWalkovers(matches, withdrawn, t);
      }
      continue;
    }
    if (!next) throw new SimulationStuck(`Vastgelopen in het schema (wachtrij: ${snap.queue.length})`);
    t = next.at;
    const result = planned.get(next.key) as { legs1: number; legs2: number };
    matches = applyResult(matches, next.matchId, { legs1: result.legs1, legs2: result.legs2, finishedAt: t, board: next.board });
    matches = autoWalkovers(matches, withdrawn, t);
  }
  if (!matches.every(isFinished)) throw new SimulationStuck('Simulatie niet afgerond');
  return {
    bracket,
    matches,
    log,
    config,
    placements: eliminationPlacements(matches).placements,
    withdrawn,
    history: replaySchedule(matches, log, config, t).assignments,
    end: Math.max(...matches.map((m) => m.finishedAt ?? 0)),
  };
}
