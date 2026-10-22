import { describe, expect, it } from 'vitest';
import { mastersField } from './masters';

const ranking = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((playerId, i) => ({ playerId, position: i + 1 }));

describe('Masters-veld', () => {
  it('de top N als iedereen er is', () => {
    const f = mastersField(ranking, new Set(['a', 'b', 'c', 'd', 'e']), 4);
    expect(f).toEqual({ field: ['a', 'b', 'c', 'd'], qualified: ['a', 'b', 'c', 'd'], absent: [], replacements: [], reserves: ['e'] });
  });

  it('afwezigen worden vervangen door de volgende in de ranking', () => {
    const f = mastersField([...ranking].reverse(), new Set(['a', 'c', 'd', 'f', 'g']), 4);
    expect(f.field).toEqual(['a', 'c', 'd', 'f']);
    expect(f.absent).toEqual(['b']);
    expect(f.replacements).toEqual(['f']);
    expect(f.reserves).toEqual(['g']);
  });

  it('te weinig aanwezigen: een kleiner veld', () => {
    const f = mastersField(ranking, new Set(['b', 'x']), 4);
    // x staat niet in de ranking en kan dus niet meespelen.
    expect(f.field).toEqual(['b']);
    expect(f.absent).toEqual(['a', 'c', 'd']);
  });
});
