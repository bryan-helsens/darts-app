/**
 * Score invoeren: per speler het aantal gewonnen legs aantikken, daarna
 * bevestigen. Optioneel: 180's, hoogste uitgooi en hoogste score per speler.
 */

import { useState } from 'react';
import { legsToWin, validateScore, type Match } from '../../engine';
import { Button, cx, Stepper, TextInput } from './ui';

export interface ScoreInput {
  legs1: number;
  legs2: number;
  stats: Array<{ player_id: string; count_180: number; highest_finish: number | null; highest_score: number | null }>;
}

type NameFn = (id: string | null | undefined) => string;

interface PlayerStats {
  count180: number;
  finish: string;
  score: string;
}

const emptyStats = (): PlayerStats => ({ count180: 0, finish: '', score: '' });

function finishError(v: string): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 100 || n > 170 || [159, 162, 163, 165, 166, 168, 169].includes(n)) return 'Uitgooi tussen 100 en 170';
  return null;
}

function scoreError(v: string): string | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 180) return 'Score tussen 0 en 180';
  return null;
}

/** Eén rij: naam van de speler en knoppen 0 … legs om te winnen. */
function LegsRow({
  slot,
  label,
  value,
  max,
  onChange,
}: {
  slot: 1 | 2;
  label: string;
  value: number | null;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div data-legs-row={slot}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-zinc-950">{label}</span>
        {value === max && <span className="rounded bg-brand-600 px-1.5 py-px text-2xs font-semibold text-white">wint</span>}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${max + 1}, minmax(0, 1fr))` }}>
        {Array.from({ length: max + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} ${n === 1 ? 'leg' : 'legs'}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cx(
              'h-11 rounded-md text-lg font-semibold tabular-nums transition-colors',
              value === n ? 'bg-brand-600 text-white shadow-xs' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ScoreEntry({
  match,
  name,
  title,
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  match: Match;
  name: NameFn;
  title?: string;
  initial?: { legs1: number; legs2: number } | null;
  onSubmit: (input: ScoreInput) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const need = legsToWin(match.bestOf);
  const p1 = match.player1 as string;
  const p2 = match.player2 as string;
  const [legs1, setLegs1] = useState<number | null>(initial?.legs1 ?? null);
  const [legs2, setLegs2] = useState<number | null>(initial?.legs2 ?? null);
  const [showExtra, setShowExtra] = useState(false);
  const [stats, setStats] = useState<Record<string, PlayerStats>>({ [p1]: emptyStats(), [p2]: emptyStats() });
  const [confirming, setConfirming] = useState(false);

  // Wie het maximum krijgt, wint: de andere kan dan niet ook het maximum hebben.
  const set1 = (v: number) => {
    setLegs1(v);
    if (v === need && legs2 === need) setLegs2(null);
  };
  const set2 = (v: number) => {
    setLegs2(v);
    if (v === need && legs1 === need) setLegs1(null);
  };

  const complete = legs1 !== null && legs2 !== null;
  const scoreProblem = complete ? validateScore(match.bestOf, legs1, legs2) : null;
  const statErrors = [p1, p2].flatMap((p) => [finishError(stats[p].finish), scoreError(stats[p].score)]).filter(Boolean);
  const winner = complete && !scoreProblem ? (legs1 > legs2 ? p1 : p2) : null;

  const submit = () =>
    onSubmit({
      legs1: legs1 as number,
      legs2: legs2 as number,
      stats: [p1, p2]
        .map((p) => ({
          player_id: p,
          count_180: stats[p].count180,
          highest_finish: stats[p].finish ? Number(stats[p].finish) : null,
          highest_score: stats[p].score ? Number(stats[p].score) : null,
        }))
        .filter((s) => s.count_180 > 0 || s.highest_finish !== null || s.highest_score !== null),
    });

  if (confirming && winner) {
    return (
      <div className="space-y-3">
        <p className="text-center text-xs text-zinc-500">Klopt deze uitslag?</p>
        <div className="rounded-lg bg-ink px-3 py-3 text-white">
          {[p1, p2].map((p, i) => (
            <div key={p} className="flex items-center justify-between gap-3 py-0.5">
              <span className={cx('truncate text-[15px]', winner === p ? 'font-semibold' : 'text-zinc-400')}>{name(p)}</span>
              <span className={cx('text-2xl font-semibold tabular-nums', winner === p ? 'text-white' : 'text-zinc-500')}>{i === 0 ? legs1 : legs2}</span>
            </div>
          ))}
          <div className="mt-1.5 border-t border-white/10 pt-1.5 text-xs text-zinc-400">
            <span className="font-medium text-white">{name(winner)}</span> wint
          </div>
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <Button size="xl" variant="secondary" onClick={() => setConfirming(false)}>
            Nee, terug
          </Button>
          <Button size="xl" onClick={submit} disabled={busy}>
            {busy ? 'Opslaan…' : 'Ja, opslaan'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {title && (
        <p className="text-xs text-zinc-500">
          {title} · best of {match.bestOf} · eerst aan {need} {need === 1 ? 'leg' : 'legs'}
        </p>
      )}
      <LegsRow slot={1} label={name(p1)} value={legs1} max={need} onChange={set1} />
      <LegsRow slot={2} label={name(p2)} value={legs2} max={need} onChange={set2} />
      {complete && scoreProblem && <p className="text-xs text-accent-700">{scoreProblem}</p>}

      <div>
        <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setShowExtra((s) => !s)}>
          {showExtra ? 'Extra verbergen' : '+ 180’s en hoge finishes (optioneel)'}
        </button>
        {showExtra && (
          <div className="mt-2 space-y-2">
            {[p1, p2].map((p) => (
              <div key={p} className="rounded-lg border border-zinc-200 p-2">
                <p className="mb-1.5 text-xs font-semibold">{name(p)}</p>
                <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                  <label>
                    <span className="mb-1 block text-2xs text-zinc-500">180’s</span>
                    <Stepper value={stats[p].count180} onChange={(v) => setStats((s) => ({ ...s, [p]: { ...s[p], count180: v } }))} max={20} />
                  </label>
                  <label>
                    <span className="mb-1 block text-2xs text-zinc-500">Hoogste uitgooi</span>
                    <TextInput
                      inputMode="numeric"
                      placeholder="≥ 100"
                      value={stats[p].finish}
                      onChange={(e) => setStats((s) => ({ ...s, [p]: { ...s[p], finish: e.target.value.replace(/\D/g, '') } }))}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-2xs text-zinc-500">Hoogste score</span>
                    <TextInput
                      inputMode="numeric"
                      value={stats[p].score}
                      onChange={(e) => setStats((s) => ({ ...s, [p]: { ...s[p], score: e.target.value.replace(/\D/g, '') } }))}
                    />
                  </label>
                </div>
              </div>
            ))}
            {statErrors.length > 0 && <p className="text-xs text-accent-700">{statErrors.join(' · ')}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
        <Button size="xl" variant="secondary" onClick={onCancel}>
          Annuleren
        </Button>
        <Button size="xl" disabled={!winner || statErrors.length > 0} onClick={() => setConfirming(true)}>
          Verder
        </Button>
      </div>
    </div>
  );
}
