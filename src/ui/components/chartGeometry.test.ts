import { describe, expect, it } from 'vitest';
import { chartGeometry } from './chartGeometry';

const opts = { width: 300, height: 120, padding: { top: 10, right: 10, bottom: 20, left: 30 } };

describe('grafiekgeometrie', () => {
  it('ranking: plaats 1 bovenaan, gehele stappen', () => {
    const g = chartGeometry([3, 1, 2], { ...opts, invert: true, integer: true });
    expect(g.dots.map((d) => d.x)).toEqual([30, 160, 290]);
    // Plaats 1 = bovenrand van het tekengebied, plaats 3 = onderrand.
    expect(g.dots[1].y).toBe(10);
    expect(g.dots[0].y).toBe(100);
    expect(g.ticks.map((t) => t.value)).toEqual([1, 2, 3]);
    expect(g.path.startsWith('M30.0,100.0 L160.0,10.0')).toBe(true);
  });

  it('Elo: hoogste waarde bovenaan, mooie stappen', () => {
    const g = chartGeometry([1500, 1540, 1520], opts);
    expect(g.dots[1].y).toBeLessThan(g.dots[2].y);
    expect(g.dots[2].y).toBeLessThan(g.dots[0].y);
    expect(g.ticks.map((t) => t.value)).toEqual([1500, 1510, 1520, 1530, 1540]);
  });

  it('één punt of gelijke waarden: in het midden, met ruimte', () => {
    const one = chartGeometry([1500], opts);
    expect(one.dots[0].x).toBe(160);
    expect(one.dots[0].y).toBeGreaterThan(10);
    expect(one.dots[0].y).toBeLessThan(100);
    const rank = chartGeometry([1, 1], { ...opts, invert: true, integer: true });
    expect(rank.dots[0].y).toBe(10);
    expect(chartGeometry([], opts)).toEqual({ dots: [], path: '', ticks: [] });
  });
});
