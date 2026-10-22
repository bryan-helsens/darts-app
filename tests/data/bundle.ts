/** Een gesimuleerde avond als databaserijen (voor tests van eventView, meldingen …). */

import type { Match, simulateEvening } from '../../src/engine';
import type { EventBundle } from '../../src/data/api';
import type { EventRow, MatchRow } from '../../src/data/rows';

/** 21/11/2026 19u00 Belgische tijd. */
export const SIM_START = Date.UTC(2026, 10, 21, 18, 0);
const START = SIM_START;
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function toRow(m: Match): MatchRow {
  return {
    id: `uuid-${m.id}`,
    event_id: 'e1',
    code: m.id,
    stage: m.stage,
    round: m.round,
    position: m.position,
    pool_id: m.poolId,
    player1_id: m.player1,
    player2_id: m.player2,
    best_of: m.bestOf,
    legs1: m.legs1,
    legs2: m.legs2,
    winner_id: m.winner,
    walkover: m.walkover,
    next_code: m.next?.matchId ?? null,
    next_slot: m.next?.slot ?? null,
    loser_next_code: null,
    loser_next_slot: null,
    board: m.board,
    scorer_id: null,
    created_at: iso(m.createdAt) as string,
    finished_at: iso(m.finishedAt),
    result_client_id: null,
    updated_at: iso(m.createdAt) as string,
  };
}

export function bundleFor(matches: Match[], extra: Partial<EventRow>, sim: ReturnType<typeof simulateEvening>): EventBundle {
  const event: EventRow = {
    id: 'e1',
    season_id: 's1',
    event_date: '2026-11-21',
    status: 'bezig',
    format: 'poules_ab',
    boards: 6,
    main_board: 1,
    start_time: '19:00:00',
    registration_closes: '18:30:00',
    registration_reopened: false,
    notes: null,
    settings: { tournament: { sizes: [4, 4, 4], advance: 2, boards: [1, 2, 3, 4, 5, 6], mainBoard: 1, holdFinal: true } },
    rng_seed: 'seed',
    started_at: iso(START),
    knockout: null,
    finalized_at: null,
    created_at: iso(START) as string,
    ...extra,
  };
  return {
    event,
    pools: sim.pools.map((p, i) => ({ event_id: 'e1', id: p.id, label: p.label, position: i + 1 })),
    members: sim.pools.flatMap((p) => p.playerIds.map((id, i) => ({ event_id: 'e1', pool_id: p.id, player_id: id, seed: i + 1 }))),
    matches: matches.map(toRow),
    log: [],
    stats: [],
    results: [],
  };
}

