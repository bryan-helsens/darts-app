/**
 * Alles wat de schermen van een speelavond nodig hebben, berekend uit de
 * ruwe databaserijen met de engine. Puur: dezelfde invoer geeft dezelfde
 * uitvoer op elk toestel.
 */

import {
  formatPlacements,
  forecastLive,
  poolPhaseStatus,
  replaySchedule,
  suggestScorers,
  upcomingByBoard,
  type BracketPlacements,
  type LiveForecast,
  type Match,
  type PlayerId,
  type PoolPhaseStatus,
  type Pool,
  type ScheduleConfig,
  type ScheduleLogEntry,
  type BracketStage,
  type ScheduleResult,
  type TournamentFormat,
} from '../engine';
import type { EventBundle } from './api';
import {
  acceptedLotsFromRows,
  matchFromRow,
  poolsFromRows,
  scheduleConfig,
  scheduleLogFromRows,
  toMs,
  tournamentConfig,
  type TournamentConfig,
} from './mappers';
import type { EventRow, MatchRow, MatchStatRow } from './rows';

export type Phase = 'gepland' | 'poules' | 'barrages' | 'ko-klaar' | 'ko' | 'schema' | 'klaar' | 'afgelopen';

export const PHASE_LABEL: Record<Phase, string> = {
  gepland: 'Gepland',
  poules: 'Poulefase',
  barrages: 'Barrages',
  'ko-klaar': 'Poules afgelopen',
  ko: 'A- en B-schema',
  schema: 'Schema bezig',
  klaar: 'Alle matchen gespeeld',
  afgelopen: 'Afgelopen',
};

/** De schema's van een format, in volgorde van weergave. */
export const SCHEMA_STAGES: Record<TournamentFormat, BracketStage[]> = {
  poules_ab: ['A', 'B'],
  double_elim: ['W', 'L', 'GF'],
  single_elim_plate: ['M', 'P'],
};

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  poules_ab: 'Poules + A/B-schema',
  double_elim: 'Double elimination',
  single_elim_plate: 'Knock-out met plate',
};

export interface EventView {
  event: EventRow;
  /** Format van de avond (poules + A/B of een schema-format). */
  format: TournamentFormat;
  config: TournamentConfig | null;
  matches: Match[];
  byCode: Map<string, Match>;
  rowByCode: Map<string, MatchRow>;
  pools: Pool[];
  poolOf: Map<string, string>;
  withdrawn: Set<string>;
  acceptedLots: Set<string>;
  scheduleLog: ScheduleLogEntry[];
  schedule: ScheduleConfig | null;
  replay: ScheduleResult | null;
  live: LiveForecast | null;
  poolStatus: PoolPhaseStatus | null;
  phase: Phase;
  placements: BracketPlacements | null;
  activeBoards: number[];
  statsByMatch: Map<string, MatchStatRow[]>;
  /** Voorgestelde schrijver per bezet bord (enkel tijdens de avond). */
  scorers: Map<number, PlayerId | null>;
  now: number;
}

export function buildEventView(bundle: EventBundle, clientNow = Date.now()): EventView {
  const { event } = bundle;
  const config = tournamentConfig(event);
  const format: TournamentFormat = event.format ?? 'poules_ab';
  const pooled = format === 'poules_ab';
  const matches = bundle.matches.map(matchFromRow);
  const byCode = new Map(matches.map((m) => [m.id, m]));
  const rowByCode = new Map(bundle.matches.map((r) => [r.code, r]));
  const pools = poolsFromRows(bundle.pools, bundle.members);
  const poolOf = new Map(pools.flatMap((p) => p.playerIds.map((id) => [id, p.id] as const)));
  const withdrawn = new Set(bundle.log.filter((l) => l.type === 'withdraw').map((l) => String(l.payload.player_id)));
  const acceptedLots = acceptedLotsFromRows(bundle.log);
  const scheduleLog = scheduleLogFromRows(bundle.log);
  const statsByMatch = new Map<string, MatchStatRow[]>();
  for (const s of bundle.stats) statsByMatch.set(s.match_id, [...(statsByMatch.get(s.match_id) ?? []), s]);

  // "Nu" nooit vóór de laatst gekende servertijd (klokverschil tussen toestellen).
  const latest = Math.max(
    0,
    toMs(event.started_at) ?? 0,
    ...bundle.matches.map((m) => Math.max(toMs(m.finished_at) ?? 0, toMs(m.created_at) ?? 0)),
    ...bundle.log.map((l) => toMs(l.created_at) ?? 0),
  );
  const now = Math.max(clientNow, latest);

  let schedule: ScheduleConfig | null = null;
  let replay: ScheduleResult | null = null;
  let live: LiveForecast | null = null;
  let poolStatus: PoolPhaseStatus | null = null;
  let placements: BracketPlacements | null = null;
  let scorers = new Map<number, PlayerId | null>();
  let phase: Phase = event.status === 'gepland' ? 'gepland' : event.status === 'afgelopen' ? 'afgelopen' : 'poules';

  if (config && event.started_at) {
    schedule = scheduleConfig(event, config);
    if (pooled) {
      poolStatus = poolPhaseStatus({
        pools,
        matches,
        advance: config.advance,
        lotSeed: event.rng_seed,
        withdrawn,
        acceptedLots,
      });
    }
    if (!pooled || event.knockout) placements = formatPlacements(format, matches, event.knockout);
    if (event.status === 'bezig') {
      if (!pooled) {
        phase = placements?.complete ? 'klaar' : 'schema';
      } else if (!event.knockout) {
        phase = !poolStatus?.poolsComplete ? 'poules' : poolStatus.barrageNeeds.length > 0 || poolStatus.barragesOpen ? 'barrages' : 'ko-klaar';
      } else {
        phase = placements?.complete ? 'klaar' : 'ko';
      }
      replay = replaySchedule(matches, scheduleLog, schedule, now);
      live = forecastLive({
        matches,
        log: scheduleLog,
        config: schedule,
        now,
        timing: config.timing,
        legs: config.legs,
        plannedKnockout: pooled && !event.knockout ? { sizes: config.sizes, advance: config.advance } : null,
      });
      scorers = suggestScorers({ matches, replay, upcoming: upcomingByBoard(live.forecast, now), withdrawn, seed: event.rng_seed });
    }
  }

  let activeBoards = config?.boards ?? Array.from({ length: event.boards }, (_, i) => i + 1);
  for (const e of scheduleLog) if (e.type === 'boards') activeBoards = e.boards;

  return {
    event,
    format,
    config,
    matches,
    byCode,
    rowByCode,
    pools,
    poolOf,
    withdrawn,
    acceptedLots,
    scheduleLog,
    schedule,
    replay,
    live,
    poolStatus,
    phase,
    placements,
    activeBoards,
    statsByMatch,
    scorers,
    now,
  };
}
