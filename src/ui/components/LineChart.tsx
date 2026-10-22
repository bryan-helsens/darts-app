import { useState } from 'react';
import { formatDate } from '../../lib/time';
import { chartGeometry } from './chartGeometry';
import { cx } from './ui';

const W = 320;
const H = 132;
const PADDING = { top: 12, right: 12, bottom: 22, left: 34 };

/**
 * Kleine lijngrafiek in SVG (geen bibliotheek nodig). Tik op een punt voor de
 * waarde en de datum; zonder tikken staat de laatste waarde gemarkeerd.
 */
export function LineChart({
  points,
  invert,
  integer,
  format = (v) => String(Math.round(v)),
  label,
}: {
  points: ReadonlyArray<{ date: string; value: number }>;
  /** Kleinste waarde bovenaan (plaats in de ranking). */
  invert?: boolean;
  integer?: boolean;
  format?: (v: number) => string;
  label: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const g = chartGeometry(
    points.map((p) => p.value),
    { width: W, height: H, padding: PADDING, invert, integer },
  );
  const active = selected ?? points.length - 1;
  const current = points[active];
  // Hoogstens een vijftal datums onder de as.
  const every = Math.max(1, Math.ceil(points.length / 5));

  return (
    <figure className="rounded-lg border border-zinc-200/80 bg-white p-2 shadow-xs">
      <figcaption className="flex items-baseline justify-between px-1 text-2xs text-zinc-500">
        <span>{label}</span>
        {current && (
          <span>
            <b className="text-[13px] font-semibold text-zinc-950 tabular-nums">{format(current.value)}</b> · {formatDate(current.date)}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={label}>
        {g.ticks.map((t) => (
          <g key={t.value}>
            <line x1={PADDING.left} x2={W - PADDING.right} y1={t.y} y2={t.y} className="stroke-zinc-100" />
            <text x={PADDING.left - 6} y={t.y + 3.5} textAnchor="end" className="fill-zinc-400 text-[10px] tabular-nums">
              {format(t.value)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text
              key={p.date + i}
              x={g.dots[i].x}
              y={H - 6}
              // Eerste en laatste datum binnen de rand houden.
              textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}
              className="fill-zinc-400 text-[10px]"
            >
              {formatDate(p.date).slice(0, 5)}
            </text>
          ) : null,
        )}
        <path d={g.path} fill="none" className="stroke-brand-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {g.dots.map((d, i) => (
          <g key={i} onClick={() => setSelected(i)} className="cursor-pointer">
            {/* Groter tikvlak dan het zichtbare puntje. */}
            <circle cx={d.x} cy={d.y} r={12} fill="transparent" />
            <circle cx={d.x} cy={d.y} r={i === active ? 4.5 : 3} className={cx(i === active ? 'fill-accent-600' : 'fill-brand-600', 'stroke-white')} strokeWidth={1.5} />
          </g>
        ))}
      </svg>
    </figure>
  );
}
