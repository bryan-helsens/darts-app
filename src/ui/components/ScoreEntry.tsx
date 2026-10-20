/**
 * Score invoeren in drie tikken: wie won → legs van de verliezer → bevestigen.
 * Optioneel: 180's, hoogste uitgooi en hoogste score per speler.
 */

import { useState } from 'react';
import { legsToWin, type Match } from '../../engine';
import { Button, Stepper, TextInput, cx } from './ui';

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
  const [winner, setWinner] = useState<string | null>(initial ? (initial.legs1 > initial.legs2 ? p1 : p2) : null);
  const [loserLegs, setLoserLegs] = useState<number | null>(initial ? Math.min(initial.legs1, initial.legs2) : need === 1 ? 0 : null);
  const [showExtra, setShowExtra] = useState(false);
  const [stats, setStats] = useState<Record<string, PlayerStats>>({ [p1]: emptyStats(), [p2]: emptyStats() });
  const [confirming, setConfirming] = useState(false);

  const legs1 = winner === p1 ? need : (loserLegs ?? 0);
  const legs2 = winner === p2 ? need : (loserLegs ?? 0);
  const loser = winner === p1 ? p2 : p1;
  const ready = winner !== null && loserLegs !== null;
  const statErrors = [p1, p2].flatMap((p) => [finishError(stats[p].finish), scoreError(stats[p].score)]).filter(Boolean);

  const submit = () =>
    onSubmit({
      legs1,
      legs2,
      stats: [p1, p2]
        .map((p) => ({
          player_id: p,
          count_180: stats[p].count180,
          highest_finish: stats[p].finish ? Number(stats[p].finish) : null,
          highest_score: stats[p].score ? Number(stats[p].score) : null,
        }))
        .filter((s) => s.count_180 > 0 || s.highest_finish !== null || s.highest_score !== null),
    });

  if (confirming) {
    return (
      <div className="space-y-5 text-center">
        <p className="text-stone-600">Klopt deze uitslag?</p>
        <div className="rounded-2xl bg-brand-50 p-5">
          <div className="text-2xl font-bold text-brand-900">{name(winner)}</div>
          <div className="my-1 text-stone-600">wint van</div>
          <div className="text-xl font-semibold">{name(loser)}</div>
          <div className="mt-3 font-mono text-4xl font-bold tabular-nums">
            {Math.max(legs1, legs2)}–{Math.min(legs1, legs2)}
          </div>
        </div>
        <div className="grid gap-2">
          <Button size="xl" variant="success" onClick={submit} disabled={busy}>
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
    <div className="space-y-5">
      {title && <p className="text-center text-sm text-stone-500">{title} · best of {match.bestOf}</p>}
      <div>
        <p className="mb-2 font-semibold">Wie won?</p>
        <div className="grid grid-cols-2 gap-3">
          {[p1, p2].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setWinner(p);
                if (need === 1) setLoserLegs(0);
              }}
              className={cx(
                'min-h-24 rounded-2xl border-2 p-3 text-xl font-bold break-words',
                winner === p ? 'border-brand-800 bg-brand-800 text-white' : 'border-stone-300 bg-white',
              )}
            >
              {name(p)}
            </button>
          ))}
        </div>
      </div>

      {winner && need > 1 && (
        <div>
          <p className="mb-2 font-semibold">Hoeveel legs won {name(loser)}?</p>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: need }, (_, i) => i).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLoserLegs(n)}
                className={cx(
                  'h-16 rounded-2xl border-2 text-2xl font-bold',
                  loserLegs === n ? 'border-brand-800 bg-brand-800 text-white' : 'border-stone-300 bg-white',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <button type="button" className="text-brand-800 underline" onClick={() => setShowExtra((s) => !s)}>
          {showExtra ? 'Extra verbergen' : 'Extra: 180’s en hoge finishes (optioneel)'}
        </button>
        {showExtra && (
          <div className="mt-3 space-y-4">
            {[p1, p2].map((p) => (
              <div key={p} className="rounded-xl border border-stone-200 p-3">
                <p className="mb-2 font-semibold">{name(p)}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-stone-600">180’s</span>
                    <Stepper value={stats[p].count180} onChange={(v) => setStats((s) => ({ ...s, [p]: { ...s[p], count180: v } }))} max={20} />
                  </div>
                  <label className="w-32">
                    <span className="text-sm text-stone-600">Hoogste uitgooi</span>
                    <TextInput
                      inputMode="numeric"
                      placeholder="≥ 100"
                      value={stats[p].finish}
                      onChange={(e) => setStats((s) => ({ ...s, [p]: { ...s[p], finish: e.target.value.replace(/\D/g, '') } }))}
                    />
                  </label>
                  <label className="w-32">
                    <span className="text-sm text-stone-600">Hoogste score</span>
                    <TextInput
                      inputMode="numeric"
                      value={stats[p].score}
                      onChange={(e) => setStats((s) => ({ ...s, [p]: { ...s[p], score: e.target.value.replace(/\D/g, '') } }))}
                    />
                  </label>
                </div>
              </div>
            ))}
            {statErrors.length > 0 && <p className="text-sm text-red-700">{statErrors.join(' · ')}</p>}
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <Button size="xl" disabled={!ready || statErrors.length > 0} onClick={() => setConfirming(true)}>
          Verder
        </Button>
        <Button size="lg" variant="secondary" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </div>
  );
}
