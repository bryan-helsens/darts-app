import { describe, expect, it } from 'vitest';
import { seasonLeaderboards, type LeaderboardInput } from './leaderboards';
import type { RankingRow } from './ranking';

const row = (playerId: string, position: number, counted: number): RankingRow => ({
  position,
  playerId,
  counted,
  total: counted,
  events: 1,
  wins: 0,
  bestPlace: 1,
  legsWon: 0,
  countedEventIds: [],
  byLot: false,
});

const input: LeaderboardInput = {
  stats: [
    { playerId: 'a', eventId: 'e1', count180: 2, highestFinish: 120 },
    { playerId: 'a', eventId: 'e2', count180: 1, highestFinish: 101 },
    { playerId: 'b', eventId: 'e1', count180: 3, highestFinish: null },
    { playerId: 'c', eventId: 'e2', count180: 0, highestFinish: 120 },
  ],
  participations: [
    { playerId: 'a', eventId: 'e1' },
    { playerId: 'a', eventId: 'e2' },
    { playerId: 'b', eventId: 'e1' },
    { playerId: 'c', eventId: 'e2' },
  ],
  ranking: [row('a', 1, 40), row('c', 2, 20), row('b', 3, 12)],
  firstSeen: new Map([
    ['a', '2026-01-17'],
    ['b', '2027-01-16'],
    ['c', '2027-02-20'],
  ]),
  seasonStart: '2027-01-01',
  seasonEnd: '2027-12-31',
};

describe('extra klassementen', () => {
  const lb = seasonLeaderboards(input);

  it('telt 180’s op over het seizoen, met gedeelde posities', () => {
    expect(lb.most180.map((r) => [r.playerId, r.value, r.position])).toEqual([
      ['a', 3, 1],
      ['b', 3, 1],
    ]);
  });

  it('neemt de hoogste uitgooi per speler en onthoudt de avond', () => {
    expect(lb.highestFinish).toEqual([
      { playerId: 'a', value: 120, eventId: 'e1', position: 1 },
      { playerId: 'c', value: 120, eventId: 'e2', position: 1 },
    ]);
  });

  it('telt deelnames per avond', () => {
    expect(lb.attendances.map((r) => [r.playerId, r.value, r.position])).toEqual([
      ['a', 2, 1],
      ['b', 1, 2],
      ['c', 1, 2],
    ]);
  });

  it('beste nieuwkomer: enkel wie zijn eerste avond dit seizoen speelde, op seizoenspunten', () => {
    expect(lb.newcomers.map((r) => [r.playerId, r.value, r.position])).toEqual([
      ['c', 20, 1],
      ['b', 12, 2],
    ]);
  });
});
