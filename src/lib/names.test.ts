import { describe, expect, it } from 'vitest';
import { findSimilar, matchesSearch, nameSimilarity, normalizeName } from './names';

describe('dubbele namen', () => {
  const players = [{ name: 'Jan Peeters' }, { name: 'Kris Vermeulen' }, { name: 'Sofie Claes' }, { name: 'José Dubois' }];

  it('normaliseert accenten en hoofdletters', () => {
    expect(normalizeName('  José   DUBOIS ')).toBe('jose dubois');
  });

  it('vindt tikfouten, omgekeerde volgorde en afkortingen', () => {
    expect(findSimilar('jan peters', players).map((p) => p.name)).toEqual(['Jan Peeters']);
    expect(findSimilar('Peeters Jan', players).map((p) => p.name)).toEqual(['Jan Peeters']);
    expect(findSimilar('Kris V.', players).map((p) => p.name)).toEqual(['Kris Vermeulen']);
    expect(findSimilar('Jose Dubois', players).map((p) => p.name)).toEqual(['José Dubois']);
  });

  it('waarschuwt niet voor verschillende mensen', () => {
    expect(findSimilar('Tom Jacobs', players)).toEqual([]);
    expect(nameSimilarity('Jan Peeters', 'Jan Janssens')).toBeLessThan(0.8);
  });

  it('zoekt op een deel van de naam', () => {
    expect(matchesSearch('José Dubois', 'jose')).toBe(true);
    expect(matchesSearch('Jan Peeters', 'pee ja')).toBe(true);
    expect(matchesSearch('Jan Peeters', 'kris')).toBe(false);
  });
});
