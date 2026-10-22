import { describe, expect, it } from 'vitest';
import { played } from '../../tests/engine/helpers';
import { simulateEvening, type Match } from '../engine';
import { bundleFor, SIM_START, toRow } from '../../tests/data/bundle';
import type { EventBundle } from './api';
import { buildEventView } from './eventView';
import type { MatchLegSummary, MatchStatRow } from './rows';

const START = SIM_START;
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

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

describe('501 per beurt in het avondoverzicht', () => {
  // Drie spelers die elk één keer winnen met 2–1: alles gelijk, ook onderling.
  const circle = [played('a', 'b', 2, 1, { id: 'P1-R1-1' }), played('b', 'c', 2, 1, { id: 'P1-R2-1' }), played('c', 'a', 2, 1, { id: 'P1-R3-1' })];
  const open = { ...played('a', 'b', 0, 0, { id: 'P1-R4-1' }), legs1: null, legs2: null, winner: null, finishedAt: null };
  const totals: Record<string, [string, number, number][]> = {
    'P1-R1-1': [['a', 24, 501 * 2], ['b', 24, 900]],
    'P1-R2-1': [['b', 21, 501 * 2], ['c', 21, 700]],
    'P1-R3-1': [['c', 30, 501 * 2], ['a', 27, 600]],
  };
  const stats: MatchStatRow[] = Object.entries(totals).flatMap(([code, list]) =>
    list.map(([player_id, darts, points]) => ({ match_id: `uuid-${code}`, event_id: 'e1', player_id, count_180: 0, highest_finish: null, highest_score: null, darts, points })),
  );
  const legs: MatchLegSummary[] = [
    { match_id: 'uuid-P1-R4-1', leg_no: 1, winner: 2, darts1: 18, points1: 400, darts2: 17, points2: 501 },
    // Een leg van een gespeelde match telt niet als "lopend".
    { match_id: 'uuid-P1-R1-1', leg_no: 1, winner: 1, darts1: 9, points1: 501, darts2: 9, points2: 300 },
  ];

  const bundle = (averageTiebreak: boolean | undefined, extra: Match[] = []): EventBundle => ({
    event: {
      id: 'e1',
      season_id: 's1',
      event_date: '2026-11-21',
      status: 'bezig',
      format: 'poules_ab',
      boards: 2,
      main_board: 1,
      start_time: '19:00:00',
      registration_closes: '18:30:00',
      registration_reopened: false,
      notes: null,
      settings: {
        tournament: {
          sizes: [3],
          advance: 1,
          boards: [1, 2],
          mainBoard: 1,
          holdFinal: true,
          ...(averageTiebreak === undefined ? {} : { scoring: { defaultMode: 'visits', averageTiebreak } }),
        },
      },
      rng_seed: 'seed',
      started_at: iso(START),
      knockout: null,
      finalized_at: null,
      created_at: iso(START) as string,
    },
    pools: [{ event_id: 'e1', id: 'P1', label: 'Poule 1', position: 1 }],
    members: ['a', 'b', 'c'].map((id, i) => ({ event_id: 'e1', pool_id: 'P1', player_id: id, seed: i + 1 })),
    matches: [...circle, ...extra].map(toRow),
    log: [],
    stats,
    legs,
    results: [],
  });

  it('legstand van lopende matchen, darts per match en gemiddelden per speler', () => {
    const view = buildEventView(bundle(true, [open]), START + 60_000);
    expect([...view.liveLegs]).toEqual([['P1-R4-1', { legs1: 0, legs2: 1 }]]);
    expect(view.dartsTotals.get('P1-R1-1')?.get('a')).toEqual({ darts: 24, points: 1002 });
    // a: (1002 + 600) / 51 × 3 = 94,24
    expect(view.averages.get('a')).toEqual({ darts: 51, points: 1602, matches: 2, average: 94.24 });
  });

  it('gemiddelde beslist een gelijke stand, enkel als dat bij de start zo ingesteld was', () => {
    // Gemiddelden: a 94,24 · b 126,80 · c 100,12.
    const withTiebreak = buildEventView(bundle(true), START + 60_000);
    expect(withTiebreak.poolStatus?.standings[0].rows.map((r) => r.playerId)).toEqual(['b', 'c', 'a']);
    expect(withTiebreak.poolStatus?.barrageNeeds).toEqual([]);
    for (const old of [bundle(false), bundle(undefined)]) {
      const view = buildEventView(old, START + 60_000);
      expect(view.averages.size).toBe(3);
      // Zonder gemiddelde: een driedubbele gelijke stand over de grens (barrage of lot).
      expect(view.poolStatus?.barrageNeeds.length).toBe(1);
    }
  });
});
