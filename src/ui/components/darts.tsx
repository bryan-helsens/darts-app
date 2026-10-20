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

export function matchTitle(m: Match, view: EventView): string {
  if (m.stage === 'A' || m.stage === 'B') {
    const rounds = Math.max(...view.matches.filter((x) => x.stage === m.stage).map((x) => x.round));
    return `${m.stage}-schema · ${roundName(m.round, rounds)}`;
  }
  return stageLabel(m, view);
}

export function MatchLine({ m, name, compact, pending }: { m: Match; name: NameFn; compact?: boolean; pending?: { legs1: number; legs2: number } }) {
  const done = m.winner !== null;
  const legs1 = pending?.legs1 ?? m.legs1;
  const legs2 = pending?.legs2 ?? m.legs2;
  const showLegs = done || pending;
  const p1won = done && m.winner === m.player1;
  const p2won = done && m.winner === m.player2;
  return (
    <div className={cx('grid grid-cols-[1fr_auto_1fr] items-center gap-2', compact ? 'text-sm' : 'text-base')}>
      <span className={cx('truncate text-right', p1won && 'font-bold', done && !p1won && 'text-stone-500')}>{name(m.player1)}</span>
      <span className={cx('rounded-lg px-2 py-0.5 text-center font-mono tabular-nums', showLegs ? 'bg-stone-100' : 'text-stone-400', pending && 'bg-amber-100')}>
        {showLegs ? `${legs1}–${legs2}` : 'vs'}
        {m.walkover && <span className="ml-1 text-xs text-stone-500">w.o.</span>}
      </span>
      <span className={cx('truncate', p2won && 'font-bold', done && !p2won && 'text-stone-500')}>{name(m.player2)}</span>
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
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center justify-between bg-brand-900 px-3 py-2 text-white">
        <span className="font-semibold">{label}</span>
        {standing.complete ? <span className="text-sm opacity-80">afgelopen</span> : <span className="text-sm opacity-80">bezig</span>}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-stone-500">
          <tr>
            <th className="w-8 py-1.5 text-center">#</th>
            <th className="py-1.5 text-left">Speler</th>
            <th className="w-8 text-center" title="Gespeeld">G</th>
            <th className="w-8 text-center" title="Gewonnen">W</th>
            <th className="w-14 text-center" title="Legs voor–tegen">Legs</th>
            <th className="w-10 text-center" title="Legsaldo">+/−</th>
          </tr>
        </thead>
        <tbody>
          {standing.rows.map((r) => (
            <tr key={r.playerId} className={cx('border-t border-stone-100', r.position <= advance && standing.complete && 'bg-emerald-50')}>
              <td className="py-1.5 text-center font-semibold">{r.position}</td>
              <td className="truncate py-1.5">
                {name(r.playerId)}
                {r.withdrawn && <span className="ml-1 text-xs text-red-700">(opgave)</span>}
                {r.byLot && standing.complete && <span className="ml-1 text-xs text-amber-700" title="Gelijke stand, beslist door loting of barrage">⚖</span>}
              </td>
              <td className="text-center tabular-nums">{r.played}</td>
              <td className="text-center font-semibold tabular-nums">{r.won}</td>
              <td className="text-center tabular-nums">
                {r.legsFor}–{r.legsAgainst}
              </td>
              <td className="text-center tabular-nums">{r.legDiff > 0 ? `+${r.legDiff}` : r.legDiff}</td>
            </tr>
          ))}
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
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-3">
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
          const inRound = own.filter((m) => m.round === r).sort((a, b) => a.position - b.position);
          return (
            <div key={r} className="flex w-56 flex-col">
              <div className="mb-2 text-center text-sm font-semibold text-stone-600">
                {roundName(r, rounds)} <span className="font-normal text-stone-400">· bo{inRound[0]?.bestOf}</span>
              </div>
              <div className="flex flex-1 flex-col justify-around gap-2">
                {bracketSlots(inRound, rounds, r).map((m, i) =>
                  m === null ? (
                    <div key={`bye-${i}`} className="flex h-[3.25rem] items-center justify-center rounded-xl border border-dashed border-stone-200 text-xs text-stone-400">
                      bye
                    </div>
                  ) : (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!onMatch}
                    onClick={() => onMatch?.(m)}
                    className={cx(
                      'rounded-xl border bg-white px-2 py-1.5 text-left text-sm shadow-sm',
                      onMatch && 'hover:border-brand-700',
                      highlight?.has(m.id) ? 'border-amber-400 ring-2 ring-amber-200' : 'border-stone-200',
                    )}
                  >
                    {[m.player1, m.player2].map((p, i) => {
                      const legs = i === 0 ? m.legs1 : m.legs2;
                      const won = m.winner !== null && m.winner === p;
                      return (
                        <div key={i} className={cx('flex justify-between gap-2', won && 'font-bold', m.winner && !won && 'text-stone-400')}>
                          <span className="truncate">{p ? name(p) : <span className="text-stone-300">…</span>}</span>
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

export function PlacementsTable({
  placements,
  name,
  points,
}: {
  placements: Placement[];
  name: NameFn;
  points?: Map<string, number>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-stone-500">
          <tr>
            <th className="w-16 py-2 text-center">Plaats</th>
            <th className="py-2 text-left">Speler</th>
            <th className="w-12 text-center">Schema</th>
            {points && <th className="w-16 text-center">Punten</th>}
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => (
            <tr key={p.playerId} className="border-t border-stone-100">
              <td className="py-2 text-center font-semibold">{formatPlace(p.from, p.to)}</td>
              <td className="py-2">{name(p.playerId)}</td>
              <td className="text-center">
                <Badge tone={p.stage === 'A' ? 'green' : 'blue'}>{p.stage}</Badge>
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
    <div className={cx('grid gap-3', big ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2')}>
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
              className={cx('rounded-2xl border bg-white p-3 shadow-sm', !b.active && 'border-dashed opacity-70', m && onMatch && 'cursor-pointer hover:border-brand-700')}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={cx('font-bold text-brand-900', big ? 'text-2xl' : 'text-lg')}>
                  Bord {b.board}
                  {b.board === view.schedule?.mainBoard && <span className="ml-2 text-sm font-normal text-stone-500">hoofdbord</span>}
                </span>
                {!b.active && <Badge tone="amber">wordt weggenomen</Badge>}
                {b.since && <span className="text-sm text-stone-500">sinds {formatTime(b.since)}</span>}
              </div>
              {m ? (
                <div>
                  <div className="mb-1 text-sm text-stone-500">{matchTitle(m, view)} · best of {m.bestOf}</div>
                  <div className={big ? 'text-xl font-semibold' : 'text-lg font-semibold'}>
                    <MatchLine m={m} name={name} />
                  </div>
                </div>
              ) : (
                <div className="py-2 text-stone-400">Vrij</div>
              )}
              {nextMatch && (
                <div className="mt-2 border-t border-stone-100 pt-2 text-sm text-stone-600">
                  <span className="font-medium">Straks:</span> {name(nextMatch.player1)} – {name(nextMatch.player2)}
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
