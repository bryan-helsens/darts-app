/**
 * Tijdsinschatting.
 *
 * Vóór de start: de hele avond wordt gesimuleerd met virtuele spelers en de
 * verwachte duur per match (legs × minuten per leg + wisseltijd). Valt de
 * eindtijd na de limiet, dan worden aanpassingen voorgesteld.
 *
 * Tijdens de avond: dezelfde simulatie vertrekt van de werkelijke toestand en
 * gebruikt de gemeten speelduur per leg.
 */

import { buildKnockout } from './bracket';
import { buildElimination } from './elimination';
import { describeSizes, knockoutSizes, layoutOptions, poolMatchCount } from './poolLayouts';
import { createPoolMatches } from './pools';
import type { Qualifier } from './qualify';
import { legsToWin } from './results';
import {
  forecastSchedule,
  replaySchedule,
  type ScheduleConfig,
  type ScheduleLogEntry,
  type ScheduleResult,
  type SchedulableMatch,
} from './scheduler';
import { MINUTE, type LegsSettings, type TimingSettings } from './settings';
import type { EliminationFormat, Match, Pool } from './types';

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Verwacht aantal legs in een best-of-x tussen twee even sterke spelers. */
export function expectedLegs(bestOf: number, p = 0.5): number {
  const need = legsToWin(bestOf);
  let e = 0;
  for (let k = 0; k < need; k++) {
    const total = need + k;
    const prob = binomial(total - 1, k) * (p ** need * (1 - p) ** k + (1 - p) ** need * p ** k);
    e += total * prob;
  }
  return e;
}

export function matchDurationMs(bestOf: number, timing: TimingSettings, minutesPerLeg = timing.minutesPerLeg): number {
  return (expectedLegs(bestOf) * minutesPerLeg + timing.changeoverMinutes) * MINUTE;
}

export interface PlanInput {
  sizes: number[];
  advance: number;
  boards: number;
  mainBoard?: number;
  legs: LegsSettings;
  timing: TimingSettings;
  holdFinal: boolean;
  start: number;
}

export interface PlanEstimate {
  end: number;
  poolsEnd: number;
  poolMatches: number;
  knockoutMatches: number;
  A: number;
  B: number;
}

function fakeQualifiers(prefix: string, count: number): Qualifier[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `${prefix}${i + 1}`,
    poolId: `${prefix}pool${i + 1}`,
    poolPosition: 1,
    withdrawn: false,
  }));
}

/** Virtuele KO-schema's: kunnen pas starten na alle poulematchen. */
export function virtualKnockout(sizes: number[], advance: number, legs: LegsSettings, createdAt: number): SchedulableMatch[] {
  const { A, B } = knockoutSizes(sizes, advance);
  const a = buildKnockout('A', fakeQualifiers('~a', A), legs.A, createdAt).matches;
  const b = buildKnockout('B', fakeQualifiers('~b', B), legs.B, createdAt).matches;
  return [...a, ...b].map((m) => ({ ...m, afterPools: true }));
}

function virtualPools(sizes: number[], bestOf: number, start: number): Match[] {
  const pools: Pool[] = sizes.map((s, i) => ({
    id: `P${i + 1}`,
    label: `Poule ${i + 1}`,
    playerIds: Array.from({ length: s }, (_, j) => `~p${i + 1}-${j + 1}`),
  }));
  return createPoolMatches(pools, bestOf, start);
}

function boardList(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function estimatePlan(input: PlanInput): PlanEstimate {
  const pools = virtualPools(input.sizes, input.legs.pool, input.start);
  const ko = virtualKnockout(input.sizes, input.advance, input.legs, input.start);
  const config: ScheduleConfig = {
    start: input.start,
    boards: boardList(input.boards),
    mainBoard: input.mainBoard ?? 1,
    holdFinal: input.holdFinal,
    minRestMs: input.timing.minRestMinutes * MINUTE,
    transitionMs: input.timing.transitionMinutes * MINUTE,
  };
  const result = forecastSchedule([...pools, ...ko], [], config, input.start, (m) => matchDurationMs(m.bestOf, input.timing));
  const poolIds = new Set(pools.map((m) => m.id));
  const poolsEnd = Math.max(input.start, ...result.assignments.filter((a) => poolIds.has(a.matchId)).map((a) => a.end ?? 0));
  const sizes = knockoutSizes(input.sizes, input.advance);
  return {
    end: result.end ?? Number.POSITIVE_INFINITY,
    poolsEnd,
    poolMatches: poolMatchCount(input.sizes),
    knockoutMatches: ko.length,
    A: sizes.A,
    B: sizes.B,
  };
}

export interface Suggestion {
  id: string;
  label: string;
  plan: PlanInput;
  estimate: PlanEstimate;
  meetsLimit: boolean;
}

/** Aanpassingen die de avond korter maken, beste eerst. */
export function suggestAdjustments(input: PlanInput, limit: number): Suggestion[] {
  const base = estimatePlan(input);
  const players = input.sizes.reduce((a, b) => a + b, 0);
  const candidates: Array<{ id: string; label: string; plan: PlanInput }> = [];
  if (input.legs.pool > 1) {
    candidates.push({
      id: 'pool-bo1',
      label: 'Poulematchen best of 1',
      plan: { ...input, legs: { ...input.legs, pool: 1 } },
    });
  }
  if (input.advance > 1) {
    candidates.push({
      id: 'advance-less',
      label: `Top ${input.advance - 1} per poule naar het A-schema`,
      plan: { ...input, advance: input.advance - 1 },
    });
  }
  for (const layout of layoutOptions(players)) {
    if (layout.id === input.sizes.join('-')) continue;
    candidates.push({
      id: `layout-${layout.id}`,
      label: `Andere indeling: ${describeSizes(layout.sizes)}`,
      plan: { ...input, sizes: layout.sizes, advance: layout.advanceToA },
    });
  }
  if (input.legs.A.semi > 3) {
    candidates.push({
      id: 'a-semi-bo3',
      label: 'Halve finales A-schema best of 3',
      plan: { ...input, legs: { ...input.legs, A: { ...input.legs.A, semi: 3 } } },
    });
  }
  if (input.holdFinal) {
    candidates.push({
      id: 'no-hold-final',
      label: 'A-finale niet laten wachten op de rest',
      plan: { ...input, holdFinal: false },
    });
  }
  if (input.boards < 8) {
    candidates.push({ id: 'extra-board', label: 'Eén bord extra', plan: { ...input, boards: input.boards + 1 } });
  }
  const evaluated = candidates
    .map((c) => {
      const estimate = estimatePlan(c.plan);
      return { ...c, estimate, meetsLimit: estimate.end <= limit };
    })
    .filter((s) => s.estimate.end < base.end - MINUTE);
  evaluated.sort((a, b) => a.estimate.end - b.estimate.end);
  return evaluated;
}

// ---------------------------------------------------------------------------
// Schema-formats (double elimination, enkelvoudig met plate)
// ---------------------------------------------------------------------------

export interface BracketPlanInput {
  format: EliminationFormat;
  players: number;
  boards: number;
  mainBoard?: number;
  legs: LegsSettings;
  timing: TimingSettings;
  holdFinal: boolean;
  start: number;
}

export interface BracketPlanEstimate {
  end: number;
  matches: number;
  /** Grootte van het schema (macht van 2). */
  size: number;
  byes: number;
  /** Spelers in de plate (enkel bij single_elim_plate). */
  plateSize: number | null;
}

/** Het schema met virtuele spelers (voor de inschatting vóór de start). */
export function virtualElimination(format: EliminationFormat, players: number, legs: LegsSettings, createdAt: number) {
  return buildElimination(format, Array.from({ length: players }, (_, i) => `~s${i + 1}`), legs, createdAt);
}

export function estimateBracketPlan(input: BracketPlanInput): BracketPlanEstimate {
  const built = virtualElimination(input.format, input.players, input.legs, input.start);
  const config: ScheduleConfig = {
    start: input.start,
    boards: boardList(input.boards),
    mainBoard: input.mainBoard ?? 1,
    holdFinal: input.holdFinal,
    minRestMs: input.timing.minRestMinutes * MINUTE,
  };
  const result = forecastSchedule(built.matches, [], config, input.start, (m) => matchDurationMs(m.bestOf, input.timing));
  return { end: result.end ?? Number.POSITIVE_INFINITY, matches: built.matches.length, size: built.size, byes: built.byes, plateSize: built.plateSize };
}

export interface BracketSuggestion {
  id: string;
  label: string;
  plan: BracketPlanInput;
  estimate: BracketPlanEstimate;
  meetsLimit: boolean;
}

/** Aanpassingen die een schema-avond korter maken, beste eerst. */
export function suggestBracketAdjustments(input: BracketPlanInput, limit: number): BracketSuggestion[] {
  const base = estimateBracketPlan(input);
  const { legs } = input;
  const candidates: Array<{ id: string; label: string; plan: BracketPlanInput }> = [];
  if (legs.A.early > 1 || legs.B.early > 1) {
    candidates.push({
      id: 'early-bo1',
      label: 'Eerste rondes best of 1',
      plan: { ...input, legs: { ...legs, A: { ...legs.A, early: 1 }, B: { ...legs.B, early: 1 } } },
    });
  }
  if (legs.A.semi > 3) {
    candidates.push({ id: 'semi-bo3', label: 'Halve finales best of 3', plan: { ...input, legs: { ...legs, A: { ...legs.A, semi: 3 } } } });
  }
  if (input.format === 'double_elim') {
    candidates.push({ id: 'format-plate', label: 'Enkelvoudige eliminatie met plate', plan: { ...input, format: 'single_elim_plate' } });
  }
  if (input.holdFinal) {
    candidates.push({ id: 'no-hold-final', label: 'Finale niet laten wachten op de rest', plan: { ...input, holdFinal: false } });
  }
  if (input.boards < 8) {
    candidates.push({ id: 'extra-board', label: 'Eén bord extra', plan: { ...input, boards: input.boards + 1 } });
  }
  return candidates
    .map((c) => {
      const estimate = estimateBracketPlan(c.plan);
      return { ...c, estimate, meetsLimit: estimate.end <= limit };
    })
    .filter((s) => s.estimate.end < base.end - MINUTE)
    .sort((a, b) => a.estimate.end - b.estimate.end);
}

/** Gemeten minuten per leg uit de gespeelde matchen (vanaf 3 matchen). */
export function calibrateMinutesPerLeg(
  matches: readonly Match[],
  replay: ScheduleResult,
  timing: TimingSettings,
): { minutesPerLeg: number; samples: number } {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const samples: number[] = [];
  for (const a of replay.assignments) {
    if (a.end === null || a.interrupted) continue;
    const m = byId.get(a.matchId);
    if (!m || m.walkover || m.finishedAt === null) continue;
    const legs = (m.legs1 ?? 0) + (m.legs2 ?? 0);
    if (legs === 0) continue;
    const perLeg = ((a.end - a.start) / MINUTE - timing.changeoverMinutes) / legs;
    if (perLeg > 0) samples.push(Math.min(20, Math.max(2, perLeg)));
  }
  if (samples.length < 3) return { minutesPerLeg: timing.minutesPerLeg, samples: samples.length };
  // Vermengen met de instelling, zodat enkele uitschieters niet alles bepalen.
  const prior = 3;
  const avg = (samples.reduce((a, b) => a + b, 0) + prior * timing.minutesPerLeg) / (samples.length + prior);
  return { minutesPerLeg: avg, samples: samples.length };
}

export interface LiveForecastInput {
  matches: readonly Match[];
  log: readonly ScheduleLogEntry[];
  config: ScheduleConfig;
  now: number;
  timing: TimingSettings;
  legs: LegsSettings;
  /** Zolang de KO-schema's niet aangemaakt zijn: de geplande indeling. */
  plannedKnockout: { sizes: number[]; advance: number } | null;
}

export interface LiveForecast {
  replay: ScheduleResult;
  forecast: ScheduleResult;
  minutesPerLeg: number;
}

export function forecastLive(input: LiveForecastInput): LiveForecast {
  const replay = replaySchedule(input.matches, input.log, input.config, input.now);
  const { minutesPerLeg } = calibrateMinutesPerLeg(input.matches, replay, input.timing);
  const extra = input.plannedKnockout
    ? virtualKnockout(input.plannedKnockout.sizes, input.plannedKnockout.advance, input.legs, input.config.start)
    : [];
  const forecast = forecastSchedule(
    [...input.matches, ...extra],
    input.log,
    { ...input.config, transitionMs: input.config.transitionMs ?? input.timing.transitionMinutes * MINUTE },
    input.now,
    (m) => matchDurationMs(m.bestOf, input.timing, minutesPerLeg),
  );
  return { replay, forecast, minutesPerLeg };
}
