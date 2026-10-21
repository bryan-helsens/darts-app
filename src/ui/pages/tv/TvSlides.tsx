/**
 * Schermen voor de TV-modus: donker, groot en zonder interactie. Alle maten
 * zijn in rem; TvPage schaalt de rem mee met de breedte van het scherm.
 */

import { formatPlace, upcomingByBoard, type BracketStage, type Match, type PoolStanding, type RankingRow } from '../../../engine';
import type { EventView } from '../../../data/eventView';
import type { EventResultRow, MatchStatRow } from '../../../data/rows';
import { bracketLayout } from '../../components/bracketLayout';
import { shortTitle } from '../../components/darts';
import { cx } from '../../components/ui';

type NameFn = (id: string | null | undefined) => string;

const MEDAL = ['bg-amber-400 text-amber-950', 'bg-zinc-300 text-zinc-900', 'bg-orange-300 text-orange-950'];

/** Twee regels: speler + legs, winnaar wit en vet. */
export function TvMatch({ m, name, size = 'md' }: { m: Match; name: NameFn; size?: 'md' | 'lg' }) {
  const done = m.winner !== null;
  return (
    <div className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4', size === 'lg' ? 'text-[1.6rem] leading-9' : 'text-xl leading-8')}>
      {[m.player1, m.player2].map((p, i) => {
        const won = done && m.winner === p;
        return (
          <div key={i} className="contents">
            <span className={cx('truncate', won ? 'font-semibold text-white' : done ? 'text-zinc-500' : 'text-zinc-100')}>{p ? name(p) : '…'}</span>
            <span className={cx('text-right font-semibold tabular-nums', won ? 'text-white' : 'text-zinc-500')}>{done ? (i === 0 ? m.legs1 : m.legs2) : ''}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TvBoards({ view, name }: { view: EventView; name: NameFn }) {
  const replay = view.replay;
  if (!replay) return null;
  const upcoming = view.live ? upcomingByBoard(view.live.forecast, view.now) : new Map();
  const boards = replay.boards.filter((b) => b.active || b.matchId);
  const cols = boards.length <= 4 ? 'grid-cols-2' : boards.length <= 6 ? 'grid-cols-3' : 'grid-cols-4';
  return (
    <div className={cx('grid gap-4', cols)}>
      {boards.map((b) => {
        const m = b.matchId ? view.byCode.get(b.matchId) : undefined;
        const nextId = upcoming.get(b.board)?.matchId;
        const next = nextId && nextId !== b.matchId ? view.byCode.get(nextId) : undefined;
        const scorer = m ? view.scorers.get(b.board) : null;
        return (
          <div key={b.board} className={cx('flex flex-col rounded-2xl border p-5', m ? 'border-white/10 bg-white/[0.06]' : 'border-dashed border-white/10')}>
            <div className="mb-3 flex items-center gap-3">
              <span className={cx('flex h-12 min-w-12 items-center justify-center rounded-xl px-2 text-2xl font-bold tabular-nums', m ? 'bg-accent-600 text-white' : 'bg-white/10 text-zinc-400')}>
                {b.board}
              </span>
              <span className="truncate text-lg text-zinc-400">{m ? `${shortTitle(m, view)} · bo${m.bestOf}` : 'Vrij'}</span>
            </div>
            {m ? <TvMatch m={m} name={name} size="lg" /> : <div className="text-xl text-zinc-500">Wacht op de volgende match</div>}
            <div className="mt-auto space-y-1 pt-4 text-base text-zinc-400">
              {scorer && (
                <div className="truncate">
                  <span className="font-medium text-zinc-200">Schrijver</span> {name(scorer)}
                </div>
              )}
              {next && (
                <div className="truncate">
                  <span className="font-medium text-zinc-200">Straks</span> {name(next.player1)} – {name(next.player2)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TvPools({ standings, view, name }: { standings: PoolStanding[]; view: EventView; name: NameFn }) {
  const advance = view.config?.advance ?? 2;
  const cols = standings.length <= 2 ? 'grid-cols-2' : standings.length <= 6 ? 'grid-cols-3' : 'grid-cols-4';
  return (
    <div className={cx('grid gap-4', cols)}>
      {standings.map((s) => (
        <div key={s.poolId} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
          <div className="flex items-center justify-between bg-white/10 px-4 py-2 text-lg font-semibold">
            {view.pools.find((p) => p.id === s.poolId)?.label ?? s.poolId}
            <span className="text-sm font-normal text-zinc-400">{s.complete ? 'afgelopen' : 'bezig'}</span>
          </div>
          <table className="w-full text-lg">
            <thead className="text-sm text-zinc-500">
              <tr>
                <th className="w-10" />
                <th />
                <th className="w-12 py-1 text-center font-medium">W</th>
                <th className="w-16 py-1 pr-3 text-right font-medium">+/−</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => {
                const through = s.complete && r.position <= advance;
                return (
                  <tr key={r.playerId} className="border-t border-white/5">
                    <td className={cx('w-10 py-1.5 text-center font-semibold tabular-nums', through ? 'text-brand-400' : 'text-zinc-500')}>{r.position}</td>
                    <td className={cx('max-w-0 truncate py-1.5', r.withdrawn ? 'text-zinc-500 line-through' : 'text-zinc-100')}>{name(r.playerId)}</td>
                    <td className="w-12 text-center font-semibold tabular-nums">{r.won}</td>
                    <td className="w-16 pr-3 text-right text-zinc-400 tabular-nums">{r.legDiff > 0 ? `+${r.legDiff}` : r.legDiff}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function TvBracket({ stage, matches, name, live }: { stage: BracketStage; matches: Match[]; name: NameFn; live: Set<string> }) {
  const columns = bracketLayout(stage, matches);
  if (columns.length === 0) return null;
  return (
    <div className="flex h-full gap-4">
      {columns.map((col) => {
        return (
          <div key={col.round} className="flex min-w-0 flex-1 flex-col">
            <div className="mb-2 text-center text-base font-semibold text-zinc-400">{col.name}</div>
            <div className="flex flex-1 flex-col justify-around gap-2">
              {col.slots.map((m, i) =>
                m === null ? (
                  <div key={`bye-${i}`} className="h-[4.5rem] rounded-xl border border-dashed border-white/5" />
                ) : (
                  <div key={m.id} className={cx('rounded-xl border px-3 py-2', live.has(m.id) ? 'border-accent-500 bg-accent-600/15' : 'border-white/10 bg-white/[0.06]')}>
                    <TvMatch m={m} name={name} />
                  </div>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TvRanking({ rows, name }: { rows: RankingRow[]; name: NameFn }) {
  const top = rows.slice(0, 20);
  const columns = [top.slice(0, 10), top.slice(10, 20)].filter((c) => c.length > 0);
  if (top.length === 0) return <div className="text-2xl text-zinc-400">Nog geen punten in dit seizoen.</div>;
  return (
    <div className="grid grid-cols-2 gap-6">
      {columns.map((col, ci) => (
        <div key={ci} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
          {col.map((r) => (
            <div key={r.playerId} className="flex items-center gap-4 border-t border-white/5 px-5 py-2.5 text-2xl first:border-t-0">
              <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold tabular-nums', MEDAL[r.position - 1] ?? 'text-zinc-400')}>
                {r.position}
              </span>
              <span className="min-w-0 flex-1 truncate">{name(r.playerId)}</span>
              <span className="font-semibold tabular-nums">{r.counted}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TvHighlights({ view, stats, name }: { view: EventView; stats: MatchStatRow[]; name: NameFn }) {
  const per180 = new Map<string, number>();
  for (const s of stats) if (s.count_180 > 0) per180.set(s.player_id, (per180.get(s.player_id) ?? 0) + s.count_180);
  const tons = [...per180.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const finishes = stats
    .filter((s) => (s.highest_finish ?? 0) >= 100)
    .sort((a, b) => (b.highest_finish ?? 0) - (a.highest_finish ?? 0))
    .slice(0, 6);
  const recent = view.matches
    .filter((m) => m.finishedAt !== null && !m.walkover)
    .sort((a, b) => (b.finishedAt as number) - (a.finishedAt as number))
    .slice(0, 6);
  const panel = 'rounded-2xl border border-white/10 bg-white/[0.06] p-5';
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className={panel}>
        <h3 className="mb-3 text-xl font-semibold text-accent-500">180’s</h3>
        {tons.length === 0 ? (
          <p className="text-lg text-zinc-500">Nog geen 180 vanavond.</p>
        ) : (
          tons.map(([p, n]) => (
            <div key={p} className="flex justify-between py-1 text-2xl">
              <span className="truncate">{name(p)}</span>
              <span className="font-semibold tabular-nums">{n}×</span>
            </div>
          ))
        )}
      </div>
      <div className={panel}>
        <h3 className="mb-3 text-xl font-semibold text-accent-500">Hoge finishes</h3>
        {finishes.length === 0 ? (
          <p className="text-lg text-zinc-500">Nog geen finish van 100 of meer.</p>
        ) : (
          finishes.map((s) => (
            <div key={`${s.match_id}-${s.player_id}`} className="flex justify-between py-1 text-2xl">
              <span className="truncate">{name(s.player_id)}</span>
              <span className="font-semibold tabular-nums">{s.highest_finish}</span>
            </div>
          ))
        )}
      </div>
      <div className={panel}>
        <h3 className="mb-3 text-xl font-semibold text-accent-500">Laatste uitslagen</h3>
        <div className="space-y-3">
          {recent.length === 0 ? <p className="text-lg text-zinc-500">Nog geen uitslagen.</p> : recent.map((m) => <TvMatch key={m.id} m={m} name={name} />)}
        </div>
      </div>
    </div>
  );
}

export function TvPodium({ results, name }: { results: EventResultRow[]; name: NameFn }) {
  const sorted = [...results].sort((a, b) => a.place_from - b.place_from || b.points - a.points).slice(0, 8);
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06]">
      {sorted.map((r) => (
        <div key={r.player_id} className="flex items-center gap-5 border-t border-white/5 px-6 py-3 text-3xl first:border-t-0">
          <span
            className={cx(
              'flex h-12 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums',
              r.place_from === r.place_to && r.place_from <= 3 ? MEDAL[r.place_from - 1] : 'text-zinc-400',
            )}
          >
            {formatPlace(r.place_from, r.place_to)}
          </span>
          <span className="min-w-0 flex-1 truncate">{name(r.player_id)}</span>
          <span className="text-2xl text-zinc-400 tabular-nums">{r.points} ptn</span>
        </div>
      ))}
    </div>
  );
}

