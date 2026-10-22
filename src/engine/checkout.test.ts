import { describe, expect, it } from 'vitest';
import { BOGEY_CHECKOUTS, checkoutOptions, checkoutSuggestion, formatCheckout, minCheckoutDarts, segmentValue, type Segment } from './checkout';

const route = (n: number, darts?: 1 | 2 | 3) => formatCheckout(checkoutSuggestion(n, darts));

/** Brute force: minimum aantal darts om n uit te gooien. */
function bruteMin(n: number): number | null {
  const values: number[] = [];
  for (let i = 1; i <= 20; i++) values.push(i, 2 * i, 3 * i);
  values.push(25, 50);
  const doubles = [...Array.from({ length: 20 }, (_, i) => 2 * (i + 1)), 50];
  if (doubles.includes(n)) return 1;
  if (values.some((a) => doubles.includes(n - a))) return 2;
  if (values.some((a) => values.some((b) => doubles.includes(n - a - b)))) return 3;
  return null;
}

describe('checkout-suggesties', () => {
  it('klassieke routes', () => {
    expect(route(170)).toBe('T20 · T20 · Bull');
    expect(route(167)).toBe('T20 · T19 · Bull');
    expect(route(164)).toBe('T20 · T18 · Bull');
    expect(route(161)).toBe('T20 · T17 · Bull');
    expect(route(160)).toBe('T20 · T20 · D20');
    expect(route(141)).toBe('T20 · T19 · D12');
    expect(route(100)).toBe('T20 · D20');
    expect(route(81)).toBe('T19 · D12');
    expect(route(61)).toBe('T15 · D8');
    expect(route(50)).toBe('Bull');
    expect(route(41)).toBe('9 · D16');
    expect(route(40)).toBe('D20');
    expect(route(32)).toBe('D16');
    expect(route(3)).toBe('1 · D1');
    expect(route(2)).toBe('D1');
  });

  it('geen suggestie bij bogeys, 1 en meer dan 170', () => {
    for (const n of BOGEY_CHECKOUTS) expect(checkoutSuggestion(n)).toBeNull();
    expect(checkoutSuggestion(1)).toBeNull();
    expect(checkoutSuggestion(171)).toBeNull();
    expect(checkoutSuggestion(0)).toBeNull();
  });

  it('minder darts over: enkel wat nog kan', () => {
    expect(route(100, 2)).toBe('T20 · D20');
    expect(checkoutSuggestion(141, 2)).toBeNull();
    expect(route(40, 1)).toBe('D20');
    expect(checkoutSuggestion(41, 1)).toBeNull();
  });

  it('elke rest 2–170: route klopt, eindigt op een dubbel en gebruikt zo weinig mogelijk darts', () => {
    for (let n = 2; n <= 170; n++) {
      const r = checkoutSuggestion(n);
      const min = bruteMin(n);
      if (min === null) {
        expect(r, `${n}`).toBeNull();
        continue;
      }
      expect(r, `${n}`).not.toBeNull();
      const segments = r as Segment[];
      expect(segments.reduce((s, x) => s + segmentValue(x), 0), `${n}`).toBe(n);
      expect(segments[segments.length - 1].kind, `${n}`).toBe('D');
      expect(segments.length, `${n}`).toBe(min);
      expect(minCheckoutDarts(n)).toBe(min);
    }
  });

  it('met hoeveel darts een uitgooi kan', () => {
    expect(checkoutOptions(40)).toEqual([1, 2, 3]);
    expect(checkoutOptions(100)).toEqual([2, 3]);
    expect(checkoutOptions(141)).toEqual([3]);
    expect(checkoutOptions(169)).toEqual([]);
  });
});
