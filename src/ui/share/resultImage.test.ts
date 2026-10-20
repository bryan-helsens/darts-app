import { describe, expect, it } from 'vitest';
import { resultImageData } from './resultImage';

const names: Record<string, string> = { a: 'Arne', b: 'Bram', c: 'Cindy', d: 'Dries', e: 'Eva' };

describe('uitslagafbeelding', () => {
  const data = resultImageData({
    date: 'zaterdag 21 november 2026',
    placements: [
      { playerId: 'c', from: 3, to: 4, stage: 'A' },
      { playerId: 'a', from: 1, to: 1, stage: 'A' },
      { playerId: 'e', from: 5, to: 5, stage: 'B' },
      { playerId: 'b', from: 2, to: 2, stage: 'A' },
      { playerId: 'd', from: 3, to: 4, stage: 'A' },
    ],
    points: new Map([
      ['a', 27],
      ['b', 22],
    ]),
    stats: [
      { player_id: 'b', count_180: 2, highest_finish: 96 },
      { player_id: 'd', count_180: 2, highest_finish: 121 },
      { player_id: 'd', count_180: 0, highest_finish: 64 },
    ],
    matchesPlayed: 12,
    name: (id) => names[id],
    site: 'sanapolis.example',
  });

  it('zet het podium in volgorde met gedeelde derde plaats', () => {
    expect(data.podium.map((p) => [p.place, p.rank, p.name, p.points])).toEqual([
      ['1', 1, 'Arne', 27],
      ['2', 2, 'Bram', 22],
      ['3–4', 3, 'Cindy', null],
      ['3–4', 3, 'Dries', null],
    ]);
  });

  it('kiest de meeste 180’s (gedeeld) en de hoogste finish vanaf 100', () => {
    expect(data.most180).toEqual({ names: ['Bram', 'Dries'], count: 2 });
    expect(data.highestFinish).toEqual({ names: ['Dries'], value: 121 });
    expect(data.players).toBe(5);
  });

  it('laat highlights weg als er geen zijn', () => {
    const empty = resultImageData({ date: 'x', placements: [], points: new Map(), stats: [], matchesPlayed: 0, name: () => '?', site: '' });
    expect(empty.most180).toBeNull();
    expect(empty.highestFinish).toBeNull();
    expect(empty.podium).toEqual([]);
  });
});
