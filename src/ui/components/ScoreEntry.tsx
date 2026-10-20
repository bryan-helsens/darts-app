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
    <div data-legs-row={slot} className="rounded-xl border border-zinc-200 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-base font-semibold text-zinc-950">{label}</span>
        {value === max && <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-xs font-bold text-white">wint</span>}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${max + 1}, minmax(0, 1fr))` }}>
        {Array.from({ length: max + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} ${n === 1 ? 'leg' : 'legs'}`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={cx(
              'h-12 rounded-lg text-xl font-bold tabular-nums transition-colors',
              value === n ? 'bg-brand-600 text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200',
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
      <div className="space-y-4">
        <p className="text-center text-sm text-zinc-500">Klopt deze uitslag?</p>
        <div className="rounded-xl bg-ink px-4 py-5 text-center text-white">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className={cx('truncate text-right text-base', winner === p1 ? 'font-bold' : 'text-zinc-400')}>{name(p1)}</span>
            <span className="font-mono text-4xl font-bold tabular-nums">
              {legs1}–{legs2}
            </span>
            <span className={cx('truncate text-left text-base', winner === p2 ? 'font-bold' : 'text-zinc-400')}>{name(p2)}</span>
          </div>
          <div className="mt-2 text-sm text-zinc-300">
            <span className="font-semibold text-white">{name(winner)}</span> wint
          </div>
        </div>
        <div className="grid gap-2">
          <Button size="xl" onClick={submit} disabled={busy}>
            {busy ? 'Opslaan…' : 'Ja, opslaan'}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setConfirming(false)}>
            Nee, terug
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {title && (
        <p className="text-sm text-zinc-500">
          {title} · best of {match.bestOf} · eerst aan {need} {need === 1 ? 'leg' : 'legs'}
        </p>
      )}
      <LegsRow slot={1} label={name(p1)} value={legs1} max={need} onChange={set1} />
      <LegsRow slot={2} label={name(p2)} value={legs2} max={need} onChange={set2} />
      {complete && scoreProblem && <p className="text-sm text-accent-700">{scoreProblem}</p>}

      <div>
        <button type="button" className="text-sm font-medium text-brand-700 hover:underline" onClick={() => setShowExtra((s) => !s)}>
          {showExtra ? 'Extra verbergen' : '+ 180’s en hoge finishes (optioneel)'}
        </button>
        {showExtra && (
          <div className="mt-2 space-y-2">
            {[p1, p2].map((p) => (
              <div key={p} className="rounded-xl border border-zinc-200 p-2.5">
                <p className="mb-2 text-sm font-semibold">{name(p)}</p>
                <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
                  <label>
                    <span className="mb-1 block text-xs text-zinc-500">180’s</span>
                    <Stepper value={stats[p].count180} onChange={(v) => setStats((s) => ({ ...s, [p]: { ...s[p], count180: v } }))} max={20} />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-zinc-500">Hoogste uitgooi</span>
                    <TextInput
                      inputMode="numeric"
                      placeholder="≥ 100"
                      value={stats[p].finish}
                      onChange={(e) => setStats((s) => ({ ...s, [p]: { ...s[p], finish: e.target.value.replace(/\D/g, '') } }))}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-zinc-500">Hoogste score</span>
                    <TextInput
                      inputMode="numeric"
                      value={stats[p].score}
                      onChange={(e) => setStats((s) => ({ ...s, [p]: { ...s[p], score: e.target.value.replace(/\D/g, '') } }))}
                    />
                  </label>
                </div>
              </div>
            ))}
            {statErrors.length > 0 && <p className="text-sm text-accent-700">{statErrors.join(' · ')}</p>}
          </div>
        )}
      </div>

      <div className="grid gap-2 pt-1">
        <Button size="xl" disabled={!winner || statErrors.length > 0} onClick={() => setConfirming(true)}>
          Verder
        </Button>
        <Button size="lg" variant="secondary" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </div>
  );
}
