/** Alle beurten van een match die per beurt gescoord werd, leg per leg. */

import { legState, START_SCORE, visitSlot, type Leg, type Slot } from '../../engine';
import { legFromRow } from '../../data/mappers';
import { useMatchLegs } from '../../data/queries';
import { formatDecimal } from '../../lib/format';
import { cx, ErrorBox, Spinner } from './ui';

type NameFn = (id: string | null | undefined) => string;

export type LegRound = Partial<Record<Slot, { score: number | 'bust'; rest: number }>>;

/** Beurten per ronde (wie begon en de andere), met de rest na elke beurt. */
export function legRounds(leg: Leg): LegRound[] {
  const rounds: LegRound[] = [];
  const rest: [number, number] = [START_SCORE, START_SCORE];
  leg.visits.forEach((v, i) => {
    const slot = visitSlot(leg.starter, i);
    if (!v.bust) rest[slot - 1] -= v.score;
    const r = Math.floor(i / 2);
    rounds[r] = { ...rounds[r], [slot]: { score: v.bust ? 'bust' : v.score, rest: rest[slot - 1] } };
  });
  return rounds;
}

/** Eén cel: score (180 in blauw, bust in rood) en de rest erna. */
export function RoundCells({ round, slot }: { round: LegRound; slot: Slot }) {
  const v = round[slot];
  return (
    <>
      <td className={cx('py-0.5 font-semibold', v?.score === 'bust' ? 'text-accent-700' : v?.score === 180 ? 'text-brand-700' : 'text-zinc-900')}>{v ? v.score : ''}</td>
      <td className="py-0.5 text-zinc-400">{v ? v.rest : ''}</td>
    </>
  );
}

export function LegsDetail({ matchId, players, name }: { matchId: string; players: [string | null, string | null]; name: NameFn }) {
  const { data, isLoading, error } = useMatchLegs(matchId);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data || data.length === 0) return <p className="text-xs text-zinc-500">Geen beurten bewaard.</p>;
  return (
    <div className="space-y-2" data-legs-detail>
      {data.map((row) => {
        const leg = legFromRow(row);
        const state = legState(leg);
        const rounds = legRounds(leg);
        const w = state.winner;
        return (
          <div key={row.leg_no} className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white">
            <div className="flex items-center justify-between gap-2 bg-zinc-50 px-2.5 py-1 text-2xs text-zinc-500">
              <span className="font-semibold text-zinc-700">Leg {row.leg_no}</span>
              {w && (
                <span className="truncate">
                  {name(players[w - 1])} · {state.darts[w - 1]} darts · gem. {formatDecimal((state.points[w - 1] / state.darts[w - 1]) * 3)}
                </span>
              )}
            </div>
            <table className="w-full text-xs tabular-nums">
              <thead className="text-2xs text-zinc-400">
                <tr>
                  <th className="w-6 py-0.5 text-center font-medium">#</th>
                  {([1, 2] as const).map((slot) => (
                    <th key={slot} colSpan={2} className="truncate py-0.5 text-left font-medium">
                      {leg.starter === slot && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent-600" />}
                      {name(players[slot - 1])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rounds.map((r, i) => (
                  <tr key={i} className="border-t border-zinc-100">
                    <td className="py-0.5 text-center text-zinc-400">{i + 1}</td>
                    <RoundCells round={r} slot={1} />
                    <RoundCells round={r} slot={2} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
