/**
 * Omzetting tussen databaserijen en de types van de engine.
 * Engine-id's van matchen zijn de codes uit de database (uniek per avond).
 */

import {
  DEFAULT_LEGS,
  DEFAULT_TIMING,
  MINUTE,
  type Leg,
  type LegsSettings,
  type Match,
  type Pool,
  type ScheduleConfig,
  type ScheduleLogEntry,
  type ScoringSettings,
  type SeedingSource,
  type TimingSettings,
  type TournamentFormat,
} from '../engine';
import type { LegPayload } from './api';
import type { EventLogRow, EventRow, MatchLegRow, MatchRow, PoolMemberRow, PoolRow } from './rows';

export const toMs = (iso: string | null): number | null => (iso === null ? null : Date.parse(iso));

export function matchFromRow(row: MatchRow): Match {
  return {
    id: row.code,
    stage: row.stage,
    round: row.round,
    position: row.position,
    poolId: row.pool_id,
    player1: row.player1_id,
    player2: row.player2_id,
    bestOf: row.best_of,
    legs1: row.legs1,
    legs2: row.legs2,
    winner: row.winner_id,
    walkover: row.walkover,
    next: row.next_code ? { matchId: row.next_code, slot: row.next_slot ?? 1 } : null,
    loserNext: row.loser_next_code ? { matchId: row.loser_next_code, slot: row.loser_next_slot ?? 1 } : null,
    createdAt: toMs(row.created_at) as number,
    finishedAt: toMs(row.finished_at),
    board: row.board,
  };
}

/** Vorm die de RPC's start_tournament, add_barrages en generate_knockout verwachten. */
export function matchToInsert(m: Match) {
  return {
    code: m.id,
    stage: m.stage,
    round: m.round,
    position: m.position,
    pool_id: m.poolId,
    player1_id: m.player1,
    player2_id: m.player2,
    best_of: m.bestOf,
    next_code: m.next?.matchId ?? null,
    next_slot: m.next?.slot ?? null,
    loser_next_code: m.loserNext?.matchId ?? null,
    loser_next_slot: m.loserNext?.slot ?? null,
  };
}

export function poolsToInsert(pools: readonly Pool[]) {
  return pools.map((p, i) => ({ id: p.id, label: p.label, position: i + 1, players: p.playerIds }));
}

export function poolsFromRows(pools: readonly PoolRow[], members: readonly PoolMemberRow[]): Pool[] {
  return [...pools]
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      id: p.id,
      label: p.label,
      playerIds: members
        .filter((m) => m.pool_id === p.id)
        .sort((a, b) => a.seed - b.seed)
        .map((m) => m.player_id),
    }));
}

export function scheduleLogFromRows(rows: readonly EventLogRow[]): ScheduleLogEntry[] {
  const out: ScheduleLogEntry[] = [];
  for (const r of rows) {
    const at = toMs(r.created_at) as number;
    const p = r.payload as Record<string, unknown>;
    if (r.type === 'boards') out.push({ type: 'boards', at, boards: (p.boards as number[]) ?? [] });
    else if (r.type === 'assign') out.push({ type: 'assign', at, matchId: String(p.match), board: Number(p.board) });
    else if (r.type === 'hold') out.push({ type: 'hold', at, matchId: String(p.match) });
    else if (r.type === 'release') out.push({ type: 'release', at, matchId: String(p.match) });
  }
  return out;
}

export function acceptedLotsFromRows(rows: readonly EventLogRow[]): Set<string> {
  return new Set(rows.filter((r) => r.type === 'lot').map((r) => String((r.payload as { key?: string }).key)));
}

/** Toernooiconfiguratie die bij de start in events.settings.tournament bewaard wordt. */
export interface TournamentConfig {
  /** Format van de avond (ontbreekt bij avonden van vóór de schema-formats: poules_ab). */
  format: TournamentFormat;
  /** Seedvolgorde van het schema (enkel bij de schema-formats; 1e = topseed). */
  seeds?: string[];
  /** Poule-indeling (leeg bij de schema-formats). */
  layoutId: string;
  sizes: number[];
  advance: number;
  legs: LegsSettings;
  timing: TimingSettings;
  boards: number[];
  mainBoard: number;
  holdFinal: boolean;
  /** Gekozen seedingbron bij de start. */
  seeding?: SeedingSource;
  /** Seedingrangen bij de start (momentopname, 1 = sterkste); ook gebruikt bij gelijke stand voor de KO. */
  seedRanks?: Record<string, number>;
  /** Scoremodus en gemiddelde als tiebreak bij de start (ontbreekt bij oudere avonden: snel, geen tiebreak). */
  scoring?: ScoringSettings;
}

export function tournamentConfig(event: EventRow): TournamentConfig | null {
  const t = (event.settings as { tournament?: Partial<TournamentConfig> }).tournament;
  if (!t || (!t.sizes && !t.format)) return null;
  const sizes = t.sizes ?? [];
  return {
    format: t.format ?? event.format ?? 'poules_ab',
    seeds: t.seeds,
    layoutId: t.layoutId ?? sizes.join('-'),
    sizes,
    advance: t.advance ?? 2,
    legs: { ...DEFAULT_LEGS, ...t.legs },
    timing: { ...DEFAULT_TIMING, ...t.timing },
    boards: t.boards ?? Array.from({ length: event.boards }, (_, i) => i + 1),
    mainBoard: t.mainBoard ?? event.main_board,
    holdFinal: t.holdFinal ?? true,
    seeding: t.seeding,
    seedRanks: t.seedRanks,
    scoring: t.scoring,
  };
}

export function scheduleConfig(event: EventRow, config: TournamentConfig): ScheduleConfig {
  return {
    start: toMs(event.started_at) ?? Date.now(),
    boards: config.boards,
    mainBoard: config.mainBoard,
    holdFinal: config.holdFinal,
    minRestMs: config.timing.minRestMinutes * MINUTE,
    transitionMs: config.timing.transitionMinutes * MINUTE,
  };
}

// ---------- 501 per beurt ----------

export const legsToPayload = (legs: readonly Leg[]): LegPayload[] =>
  legs.map((l, i) => ({ leg_no: i + 1, starter: l.starter, scores: l.visits.map((v) => (v.bust ? null : v.score)), checkout_darts: l.checkoutDarts }));

export const legFromRow = (row: Pick<MatchLegRow, 'starter' | 'scores' | 'checkout_darts'>): Leg => ({
  starter: row.starter,
  visits: row.scores.map((score) => (score === null ? { score: 0, bust: true } : { score, bust: false })),
  checkoutDarts: row.checkout_darts,
});
