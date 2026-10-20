/** Darts-specifieke weergaves: poulestanden, schema's, borden, uitslagen. */

import { formatPlace, roundName, type Match, type Placement, type PoolStanding } from '../../engine';
import type { ReactNode } from 'react';
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

/** Korte titel voor kleine kaarten: "Poule 2", "A · Halve finale". */
export function shortTitle(m: Match, view: Pick<EventView, 'pools' | 'matches'>): string {
  if (m.stage === 'A' || m.stage === 'B') {
    const rounds = Math.max(...view.matches.filter((x) => x.stage === m.stage).map((x) => x.round));
    return `${m.stage} · ${roundName(m.round, rounds)}`;
  }
  return stageLabel(m, view);
}

/**
 * Een match als scorebord: twee regels (speler + gewonnen legs), de winnaar in
 * het vet. Zo past ook een lange naam op een smalle gsm.
 */
export function MatchLine({ m, name, compact, pending }: { m: Match; name: NameFn; compact?: boolean; pending?: { legs1: number; legs2: number } }) {
  const done = m.winner !== null;
  const legs = [pending?.legs1 ?? m.legs1, pending?.legs2 ?? m.legs2];
  const showLegs = done || Boolean(pending);
  return (
    <div className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3', compact ? 'text-[13px] leading-[18px]' : 'text-sm leading-5')}>
      {[m.player1, m.player2].map((p, i) => {
        const won = done && m.winner === p;
        const lost = done && !won;
        return (
          <div key={i} className="contents">
            <span className={cx('truncate', won ? 'font-semibold text-zinc-950' : lost ? 'text-zinc-400' : 'text-zinc-800')}>
              {p ? name(p) : <span className="text-zinc-300">nog niet gekend</span>}
              {m.walkover && lost && <span className="ml-1 text-2xs text-zinc-400">w.o.</span>}
            </span>
            <span
              className={cx(
                'min-w-4 text-right font-semibold tabular-nums',
                pending ? 'text-amber-600' : won ? 'text-zinc-950' : 'text-zinc-400',
              )}
            >
              {showLegs ? legs[i] : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Een match als klein tegeltje (voor rasters van 2–4 kolommen). */
export function MatchTile({
  m,
  name,
  title,
  extra,
  pending,
  dashed,
  onClick,
}: {
  m: Match;
  name: NameFn;
  title?: ReactNode;
  extra?: ReactNode;
  pending?: { legs1: number; legs2: number };
  dashed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cx(
        'flex min-w-0 flex-col rounded-lg border bg-white p-2 text-left shadow-xs transition-colors',
        dashed ? 'border-dashed border-zinc-300' : 'border-zinc-200/80',
        onClick && 'hover:border-brand-500 active:bg-zinc-50',
      )}
    >
      {(title || extra) && (
        <span className="mb-1 flex min-h-4 items-center justify-between gap-1.5 text-2xs text-zinc-500">
          <span className="truncate">{title}</span>
          {extra}
        </span>
      )}
      <MatchLine m={m} name={name} compact pending={pending} />
    </button>
  );
}

/** Raster voor `MatchTile`s en borden. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

/** Alle plaatsen van een ronde; null waar een bye zit (zo blijft de boom uitgelijnd). */
export function bracketSlots(inRound: Match[], rounds: number, round: number): Array<Match | null> {
  const expected = 2 ** (rounds - round);
  const byPosition = new Map(inRound.map((m) => [m.position, m]));
  return Array.from({ length: expected }, (_, i) => byPosition.get(i) ?? null);
}

export function PoolTable({ standing, label, advance, name }: { standing: PoolStanding; label: string; advance: number; name: NameFn }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
      <div className="flex items-center justify-between bg-ink px-2.5 py-1 text-white">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="text-2xs text-zinc-400">{standing.complete ? 'afgelopen' : 'bezig'}</span>
      </div>
      <table className="w-full text-[13px]">
        <thead className="text-2xs text-zinc-400">
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
                <td className={cx('py-1 text-center font-semibold', qualified ? 'text-brand-700' : 'text-zinc-400')}>{r.position}</td>
                <td className="max-w-0 truncate py-1">
                  {name(r.playerId)}
                  {r.withdrawn && <span className="ml-1 text-2xs text-accent-700">(opgave)</span>}
                  {r.byLot && standing.complete && (
                    <span className="ml-1 text-2xs text-amber-700" title="Gelijke stand, beslist door loting of barrage">
                      ⚖
                    </span>
                  )}
                </td>
                <td className="text-center text-zinc-500 tabular-nums">{r.played}</td>
                <td className="text-center font-semibold tabular-nums">{r.won}</td>
                <td className="text-center text-zinc-500 tabular-nums">
                  {r.legsFor}–{r.legsAgainst}
                </td>
                <td className="text-center text-zinc-500 tabular-nums">{r.legDiff > 0 ? `+${r.legDiff}` : r.legDiff}</td>
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
    <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-2">
        {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
          const inRound = own.filter((m) => m.round === r).sort((a, b) => a.position - b.position);
          return (
            <div key={r} className="flex w-40 flex-col">
              <div className="mb-1 text-center text-2xs font-semibold text-zinc-500">
                {roundName(r, rounds)} <span className="font-normal text-zinc-400">· bo{inRound[0]?.bestOf}</span>
              </div>
              <div className="flex flex-1 flex-col justify-around gap-1">
                {bracketSlots(inRound, rounds, r).map((m, i) =>
                  m === null ? (
                    <div key={`bye-${i}`} className="flex h-[46px] items-center justify-center rounded-md border border-dashed border-zinc-200 text-2xs text-zinc-400">
                      bye
                    </div>
                  ) : (
                    <button
                      key={m.id}
                      type="button"
                      disabled={!onMatch}
                      onClick={() => onMatch?.(m)}
                      className={cx(
                        'rounded-md border bg-white px-2 py-1 text-left text-xs leading-[18px] shadow-xs',
                        onMatch && 'hover:border-brand-500',
                        highlight?.has(m.id) ? 'border-accent-500 ring-1 ring-accent-500' : 'border-zinc-200/80',
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
    <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
      <table className="w-full text-[13px]">
        <thead className="text-2xs text-zinc-400">
          <tr className="border-b border-zinc-100">
            <th className="w-14 py-1.5 text-center font-medium">Plaats</th>
            <th className="py-1.5 text-left font-medium">Speler</th>
            <th className="w-12 text-center font-medium">Schema</th>
            {points && <th className="w-12 text-center font-medium">Ptn</th>}
          </tr>
        </thead>
        <tbody>
          {placements.map((p) => (
            <tr key={p.playerId} className="border-t border-zinc-100 first:border-t-0">
              <td className="py-1 text-center">
                {p.from <= 3 && p.from === p.to ? (
                  <span className={cx('inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold', MEDAL[p.from - 1])}>{p.from}</span>
                ) : (
                  <span className="text-xs font-medium text-zinc-500 tabular-nums">{formatPlace(p.from, p.to)}</span>
                )}
              </td>
              <td className="py-1 font-medium text-zinc-900">{name(p.playerId)}</td>
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
    <div className={cx('grid grid-cols-2 gap-2', big ? 'md:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-3')}>
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
                'flex min-w-0 flex-col rounded-lg border p-2 shadow-xs',
                !b.active && 'border-dashed opacity-70',
                m && onMatch && 'cursor-pointer transition-colors hover:border-brand-500 active:bg-zinc-50',
                m ? 'border-zinc-200/80 bg-white' : 'border-zinc-200 bg-zinc-50',
              )}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className={cx('flex items-center justify-center rounded bg-ink font-semibold text-white tabular-nums', big ? 'h-6 min-w-6 px-1 text-sm' : 'h-5 min-w-5 px-1 text-2xs')}>
                  <span className="sr-only">Bord </span>
                  {b.board}
                </span>
                <span className="min-w-0 flex-1 truncate text-2xs text-zinc-500">
                  {m ? `${shortTitle(m, view)} · bo${m.bestOf}` : 'Vrij'}
                  {b.board === view.schedule?.mainBoard && ' · hoofdbord'}
                </span>
                {!b.active && <Badge tone="amber">eruit</Badge>}
                {b.since && m && <span className="shrink-0 text-2xs text-zinc-400 tabular-nums">{formatTime(b.since)}</span>}
              </div>
              {m && <MatchLine m={m} name={name} compact={!big} />}
              {nextMatch && (
                <div className="mt-1.5 truncate border-t border-zinc-100 pt-1 text-2xs text-zinc-500">
                  <span className="font-medium text-zinc-700">Straks</span> {name(nextMatch.player1)} – {name(nextMatch.player2)}
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
