/**
 * Geometrie van een eenvoudige lijngrafiek (zonder bibliotheek): punten,
 * pad en hulplijnen in SVG-coördinaten. Puur en getest.
 */

export interface ChartOptions {
  width: number;
  height: number;
  /** Marges: links voor de labels van de y-as, onder voor de datums. */
  padding: { top: number; right: number; bottom: number; left: number };
  /** Kleinste waarde bovenaan (bv. plaats 1 in de ranking). */
  invert?: boolean;
  /** Enkel gehele getallen op de as (plaatsen). */
  integer?: boolean;
}

export interface ChartGeometry {
  dots: Array<{ x: number; y: number; value: number }>;
  path: string;
  ticks: Array<{ y: number; value: number }>;
}

/** "Mooie" stapgrootte: 1, 2, 5, 10, 20, 50, … */
function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (m * magnitude >= raw) return m * magnitude;
  return 10 * magnitude;
}

export function chartGeometry(values: readonly number[], opts: ChartOptions): ChartGeometry {
  const { width, height, padding } = opts;
  if (values.length === 0) return { dots: [], path: '', ticks: [] };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (opts.invert && opts.integer) min = Math.min(min, 1);
  if (max === min) {
    // Eén waarde (of allemaal gelijk): wat ruimte errond.
    const pad = opts.integer ? 1 : Math.max(10, Math.abs(max) * 0.02);
    max += pad;
    min = opts.integer && opts.invert ? Math.max(1, min - pad) : min - pad;
  }
  const step = Math.max(opts.integer ? 1 : 0, niceStep(max - min, 4));
  const lo = opts.integer && opts.invert ? min : Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo || 1);
    return padding.top + (opts.invert ? t : 1 - t) * plotH;
  };
  const x = (i: number) => padding.left + (values.length === 1 ? plotW / 2 : (i / (values.length - 1)) * plotW);
  const dots = values.map((value, i) => ({ x: x(i), y: y(value), value }));
  const ticks: Array<{ y: number; value: number }> = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push({ y: y(v), value: Math.round(v * 100) / 100 });
  const path = dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ');
  return { dots, path, ticks };
}
