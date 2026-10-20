/** Darts-specifieke weergaves: poulestanden, schema's, borden, uitslagen. */

import { formatPlace, roundName, type Match, type Placement, type PoolStanding } from '../../engine';
import type { EventView } from '../../data/eventView';
import type { MatchStatRow } from '../../data/rows';
import { formatTime } from '../../lib/time';
import { Badge, cx, Empty } from './ui';

type NameFn = (id: string | null | undefined) => string;

export function stageLabel(m: Match, view?: Pick<EventView, 'pools'>): string {
  if (m.stage === 'pool') return view?.pools.find((p) => p.id === m.poolId)?.label ?? 'Poule';
  if (m.stage === 'barrage') return 'Barrage';
  return `${m.stage}-schema`;
}

export function matchTitle(m: Match, view: Pick<EventView, 'pools' | 'matches'>): string {
  if (m.stage === 'A' || m.stage === 'B') {
    const rounds = Math.max(...view.matches.filter((x) => x.stage === m.stage).map((x) => x.round));
    return `${m.stage}-schema · ${roundName(m.round, rounds)}`;
  }
  return stageLabel(m, view);
}

/** Speler 1 – score – speler 2, met de winnaar in het vet. */
export function MatchLine({ m, name, compact, pending }: { m: Match; name: NameFn; compact?: boolean; pending?: { legs1: number; legs2: number } }) {
  const done = m.winner !== null;
  const legs1 = pending?.legs1 ?? m.legs1;
  const legs2 = pending?.legs2 ?? m.legs2;
  const showLegs = done || pending;
  const p1won = done && m.winner === m.player1;
  const p2won = done && m.winner === m.player2;
  return (
    <div className={cx('grid grid-cols-[1fr_auto_1fr] items-center gap-2', compact ? 'text-sm' : 'text-[15px]')}>
      <span className={cx('truncate text-right', p1won ? 'font-semibold text-zinc-950' : done ? 'text-zinc-400' : 'text-zinc-800')}>{name(m.player1)}</span>
      <span
        className={cx(
          'min-w-11 rounded-md px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums',
          pending ? 'bg-amber-100 text-amber-900' : showLegs ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-400',
        )}
      >
        {showLegs ? `${legs1}–${legs2}` : 'vs'}
      </span>
      <span className={cx('truncate', p2won ? 'font-semibold text-zinc-950' : done ? 'text-zinc-400' : 'text-zinc-800')}>
        {name(m.player2)}
        {m.walkover && <span className="ml-1 text-xs font-normal text-zinc-400">w.o.</span>}
      </span>
    </div>
  );
}

/** Alle plaatsen van een ronde; null waar een bye zit (zo blijft de boom uitgelijnd). */
export function bracketSlots(inRound: Match[], rounds: number, round: number): Array<Match | null> {
  const expected = 2 ** (rounds - round);
  const byPosition = new Map(inRound.map((m) => [m.position, m]));
  return Array.from({ length: expected }, (_, i) => byPosition.get(i) ?? null);
}

export function PoolTable({ standing, label, advance, name }: { standing: PoolStanding; label: string; advance: number; name: NameFn }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between bg-ink px-3 py-1.5 text-white">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-zinc-400">{standing.complete ? 'afgelopen' : 'bezig'}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-100">
            <th className="w-7 py-1 text-center font-medium">#</th>
            <th className="py-1 text-left font-medium">Speler</th>
            <th className="w-7 text-center font-medium" title="Gespeeld">G</th>
            <th className="w-7 text-center font-medium" title="Gewonnen">W</th>
            <th className="w-12 text-center font-medium" title="Legs voor–tegen">Legs</th>
            <th className="w-9 text-center font-medium" title="Legsaldo">+/−</th>
          </tr>
        </thead>
        <tbody>
          {standing.rows.map((r) => {
            const qualified = r.position <= advance && standing.complete;
            return (
              <tr key={r.playerId} className={cx('border-t border-zinc-100 first:border-t-0', qualified && 'bg-brand-50')}>
                <td className={cx('py-1.5 text-center font-semibold', qualified ? 'text-brand-700' : 'text-zinc-500')}>{r.position}</td>
                <td className="max-w-0 truncate py-1.5">
                  {name(r.playerId)}
                  {r.withdrawn && <span className="ml-1 text-xs text-accent-700">(opgave)</span>}
                  {r.byLot && standing.complete && (
                    <span className="ml-1 text-xs text-amber-700" title="Gelijke stand, beslist door loting of barrage">
                      ⚖
                    </span>
                  )}
                </td>
                <td className="text-center text-zinc-600 tabular-nums">{r.played}</td>
                <td className="text-center font-semibold tabular-nums">{r.won}</td>
                <td className="text-center text-zinc-600 tabular-nums">
                  {r.legsFor}–{r.legsAgainst}
                </td>
                <td className="text-center text-zinc-600 tabular-nums">{r.legDiff > 0 ? `+${r.legDiff}` : r.legDiff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Bracket({
  stage,
  matches,
  name,
  onMatch,
  highlight,
}: {
  stage: 'A' | 'B';
  matches: Match[];
  name: NameFn;
  onMatch?: (m: Match) => void;
  highlight?: Set<string>;
}) {
  const own = matches.filter((m) => m.stage === stage);
  if (own.length === 0) return <Empty>Nog geen {stage}-schema.</Empty>;
  const rounds = Math.max(...own.map((m) => m.round));
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex min-w-max gap-2.5">
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
          const inRound = own.filter((m) => m.round === r).sort((a, b) => a.position - b.position);
          return (
            <div key={r} className="flex w-44 flex-col">
              <div className="mb-1.5 text-center text-xs font-semibold text-zinc-500">
                {roundName(r, rounds)} <span className="font-normal text-zinc-400">· bo{inRound[0]?.bestOf}</span>
              </div>
              <div className="flex flex-1 flex-col justify-around gap-1.5">
                {bracketSlots(inRound, rounds, r).map((m, i) =>
                  m === null ? (
                    <div key={`bye-${i}`} className="flex h-[2.85rem] items-center justify-center rounded-lg border border-dashed border-zinc-200 text-[11px] text-zinc-400">
                      bye
                    </div>
                  ) : (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!onMatch}
                      onClick={() => onMatch?.(m)}
                      className={cx(
                        'rounded-lg border bg-white px-2 py-1 text-left text-[13px] leading-5',
                        onMatch && 'hover:border-brand-500',
                        highlight?.has(m.id) ? 'border-accent-500 ring-1 ring-accent-500' : 'border-zinc-200',
                      )}
                    >
                      {[m.player1, m.player2].map((p, idx) => {
                        const legs = idx === 0 ? m.legs1 : m.legs2;
                        const won = m.winner !== null && m.winner === p;
                        return (
                          <div key={idx} className={cx('flex justify-between gap-2', won ? 'font-semibold text-zinc-950' : m.winner ? 'text-zinc-400' : 'text-zinc-800')}>
                            <span className="truncate">{p ? name(p) : <span className="text-zinc-300">…</span>}</span>
                            <span className="tabular-nums">{legs ?? ''}</span>
                          </div>
                        );
                      })}
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MEDAL = ['bg-amber-400 text-amber-950', 'bg-zinc-300 text-zinc-900', 'bg-orange-300 text-orange-950'];

export function PlacementsTable({ placements, name, points }: { placements: Placement[]; name: NameFn; points?: Map<string, number> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="text-xs text-zinc-500">
          <tr className="border-b border-zinc-100">
            <th className="w-16 py-1.5 text-center font-medium">Plaats</th>
            <th className="py-1.5 text-left font-medium">Speler</th>
            <th className="w-12 text-center font-medium">Schema</th>
            {points && <th className="w-14 text-center font-medium">Ptn</th>}
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => (
            <tr key={p.playerId} className="border-t border-zinc-100 first:border-t-0">
              <td className="py-1.5 text-center">
                {p.from <= 3 && p.from === p.to ? (
                  <span className={cx('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', MEDAL[p.from - 1])}>{p.from}</span>
                ) : (
                  <span className="font-semibold text-zinc-600">{formatPlace(p.from, p.to)}</span>
                )}
              </td>
              <td className="py-1.5">{name(p.playerId)}</td>
              <td className="text-center">
                <Badge tone={p.stage === 'A' ? 'blue' : 'stone'}>{p.stage}</Badge>
              </td>
              {points && <td className="text-center font-semibold tabular-nums">{points.get(p.playerId) ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Nu op de borden" en "straks", zoals berekend door de planner. */
export function BoardsOverview({
  view,
  name,
  onMatch,
  big,
}: {
  view: EventView;
  name: NameFn;
  onMatch?: (m: Match, board: number) => void;
  big?: boolean;
}) {
  const replay = view.replay;
  if (!replay) return null;
  const upcoming = new Map<number, string>();
  if (view.live) {
    for (const a of [...view.live.forecast.assignments].sort((x, y) => x.start - y.start)) {
      // Virtuele KO-matchen (nog niet aangemaakt) staan niet in byCode en worden overgeslagen.
      const playingNow = replay.boards.some((b) => b.matchId === a.matchId);
      if (a.start > view.now && !playingNow && !upcoming.has(a.board) && view.byCode.has(a.matchId)) upcoming.set(a.board, a.matchId);
    }
  }
  return (
    <div className={cx('grid gap-2', big ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2')}>
      {replay.boards
        .filter((b) => b.active || b.matchId)
        .map((b) => {
          const m = b.matchId ? view.byCode.get(b.matchId) : undefined;
          const next = upcoming.get(b.board);
          const nextMatch = next ? view.byCode.get(next) : undefined;
          return (
            <div
              key={b.board}
              role={m && onMatch ? 'button' : undefined}
              tabIndex={m && onMatch ? 0 : undefined}
              onClick={() => m && onMatch?.(m, b.board)}
              onKeyDown={(e) => e.key === 'Enter' && m && onMatch?.(m, b.board)}
              className={cx(
                'rounded-xl border bg-white p-2.5',
                !b.active && 'border-dashed opacity-70',
                m && onMatch && 'cursor-pointer hover:border-brand-500',
                m ? 'border-zinc-200' : 'border-zinc-200 bg-zinc-50',
              )}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cx('flex items-center justify-center rounded-md bg-ink font-bold text-white', big ? 'h-8 min-w-8 px-1.5 text-base' : 'h-6 min-w-6 px-1 text-xs')}>
                  <span className="sr-only">Bord </span>
                  {b.board}
                </span>
                <span className="truncate text-xs text-zinc-500">
                  {m ? `${matchTitle(m, view)} · bo${m.bestOf}` : 'Vrij'}
                  {b.board === view.schedule?.mainBoard && ' · hoofdbord'}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  {!b.active && <Badge tone="amber">gaat eruit</Badge>}
                  {b.since && m && <span className="text-xs text-zinc-400 tabular-nums">{formatTime(b.since)}</span>}
                </span>
              </div>
              {m && (
                <div className={big ? 'text-lg' : ''}>
                  <MatchLine m={m} name={name} />
                </div>
              )}
              {nextMatch && (
                <div className="mt-1.5 truncate border-t border-zinc-100 pt-1.5 text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-700">Straks:</span> {name(nextMatch.player1)} – {name(nextMatch.player2)}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

export function statsLine(stats: MatchStatRow[] | undefined, name: NameFn): string | null {
  if (!stats || stats.length === 0) return null;
  const parts: string[] = [];
  for (const s of stats) {
    if (s.count_180 > 0) parts.push(`${name(s.player_id)}: ${s.count_180}× 180`);
    if (s.highest_finish) parts.push(`${name(s.player_id)}: finish ${s.highest_finish}`);
  }
  return parts.length ? parts.join(' · ') : null;
}
