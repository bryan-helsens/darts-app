import { describe, expect, it } from 'vitest';
import { simulateEvening, type Match } from '../engine';
import type { EventBundle } from './api';
import { buildEventView } from './eventView';
import type { EventRow, MatchRow } from './rows';

const START = Date.UTC(2026, 10, 21, 18, 0);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function toRow(m: Match): MatchRow {
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

function bundleFor(matches: Match[], extra: Partial<EventRow>, sim: ReturnType<typeof simulateEvening>): EventBundle {
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

describe('avondoverzicht', () => {
  const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}` }));
  const sim = simulateEvening({ players, boards: 6, start: START, seed: 'view', sizes: [4, 4, 4], advance: 2, barragePolicy: 'lot' });

  it('herkent de poulefase en toont wie er speelt', () => {
    const poolMatches = sim.matches.filter((m) => m.stage === 'pool').map((m) => ({ ...m, legs1: null, legs2: null, winner: null, finishedAt: null }));
    const view = buildEventView(bundleFor(poolMatches, {}, sim), START + 60_000);
    expect(view.phase).toBe('poules');
    expect(view.replay?.boards.filter((b) => b.matchId)).toHaveLength(6);
    expect(view.live?.forecast.end).toBeGreaterThan(START);
  });

  it('herkent een volledig gespeelde avond en berekent de eindplaatsen', () => {
    const view = buildEventView(bundleFor(sim.matches, { knockout: sim.participants }, sim), sim.end + 60_000);
    expect(view.phase).toBe('klaar');
    expect(view.placements?.complete).toBe(true);
    expect(view.placements?.placements).toHaveLength(12);
  });
});
