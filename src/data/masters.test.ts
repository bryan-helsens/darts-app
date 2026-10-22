import { describe, expect, it } from 'vitest';
import { seasonRanking } from '../engine';
import { withoutMasters } from './masters';
import type { EventResultRow, EventRow, MatchRow, MatchStatRow } from './rows';

const event = (id: string, kind?: 'regulier' | 'masters') => ({ id, kind }) as EventRow;
const result = (event_id: string, player_id: string, place: number, points: number) =>
  ({ event_id, player_id, place_from: place, place_to: place, placement_points: points, participation_points: 0, points }) as EventResultRow;

describe('Masters buiten de ranking', () => {
  const data = {
    events: [event('e1'), event('e2', 'regulier'), event('m', 'masters')],
    results: [result('e1', 'a', 1, 25), result('e2', 'b', 1, 25), result('e1', 'b', 2, 20), result('m', 'a', 2, 0), result('m', 'c', 1, 0)],
    matches: [{ id: 'x', event_id: 'm' }, { id: 'y', event_id: 'e1' }] as MatchRow[],
    stats: [{ match_id: 'x', event_id: 'm', player_id: 'c', count_180: 3 }] as MatchStatRow[],
  };

  it('laat enkel de Masters weg', () => {
    const out = withoutMasters(data);
    expect(out.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(out.results.map((r) => r.event_id)).toEqual(['e1', 'e2', 'e1']);
    expect(out.matches.map((m) => m.id)).toEqual(['y']);
    expect(out.stats).toEqual([]);
    // Zonder Masters: hetzelfde object (geen onnodige herberekening).
    const plain = { ...data, events: data.events.slice(0, 2) };
    expect(withoutMasters(plain)).toBe(plain);
  });

  it('de winnaar van de Masters krijgt er geen ranking door', () => {
    const out = withoutMasters(data);
    const ranking = seasonRanking(
      out.results.map((r) => ({ eventId: r.event_id, playerId: r.player_id, placeFrom: r.place_from, placeTo: r.place_to, points: r.points })),
      [],
      { enabled: false, count: 8, of: 11 },
      's',
    );
    expect(ranking.map((r) => r.playerId)).toEqual(['b', 'a']);
  });
});
