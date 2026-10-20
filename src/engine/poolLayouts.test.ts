import { describe, expect, it } from 'vitest';
import { defaultAdvance, describeSizes, knockoutSizes, layoutOptions, poolMatchCount, standardSizes } from './poolLayouts';

describe('standaard poule-indeling', () => {
  it('volgt de voorbeelden uit het reglement', () => {
    expect(standardSizes(12)).toEqual([4, 4, 4]);
    expect(standardSizes(13)).toEqual([4, 4, 5]);
    expect(standardSizes(30)).toEqual([4, 4, 4, 4, 4, 5, 5]);
  });

  it('gebruikt poules van 3 enkel waar 4 en 5 niet volstaan', () => {
    expect(standardSizes(6)).toEqual([3, 3]);
    expect(standardSizes(7)).toEqual([4, 3]);
    expect(standardSizes(11)).toEqual([4, 4, 3]);
    for (let n = 6; n <= 40; n++) {
      const sizes = standardSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(sizes.every((s) => s >= 3 && s <= 5)).toBe(true);
      if (![6, 7, 11].includes(n)) expect(sizes).not.toContain(3);
    }
  });

  it('biedt grotere poules als alternatief', () => {
    const ids = (n: number) => layoutOptions(n).map((l) => l.id);
    expect(ids(6)).toEqual(['3-3', '6']);
    expect(ids(7)).toEqual(['4-3', '7']);
    expect(ids(11)).toEqual(['4-4-3', '5-6']);
    expect(ids(12)).toEqual(['4-4-4', '6-6']);
    expect(layoutOptions(30)[0]).toMatchObject({ standard: true, id: '4-4-4-4-4-5-5' });
    for (let n = 6; n <= 40; n++) {
      for (const l of layoutOptions(n)) {
        expect(l.sizes.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...l.sizes)).toBeLessThanOrEqual(l.sizes.length === 1 ? 8 : 7);
      }
    }
  });

  it('kiest standaard de top 2 per poule, en de top 4 bij één poule', () => {
    expect(defaultAdvance([4, 4, 4])).toBe(2);
    expect(defaultAdvance([3, 3])).toBe(2);
    expect(defaultAdvance([6])).toBe(4);
    expect(defaultAdvance([7])).toBe(4);
  });

  it('rekent A/B-groottes en matchen uit', () => {
    expect(knockoutSizes([4, 4, 4], 2)).toEqual({ A: 6, B: 6 });
    expect(knockoutSizes([4, 3], 2)).toEqual({ A: 4, B: 3 });
    expect(poolMatchCount([4, 4, 4, 4, 4, 5, 5])).toBe(50);
    expect(describeSizes([4, 4, 5])).toBe('2 poules van 4 + 1 poule van 5');
  });
});
