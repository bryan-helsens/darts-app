/** Onderlinge duels op het spelersprofiel: per tegenstander zeges, nederlagen en legs. */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { headToHead, STAGE_NAMES } from '../../engine';
import { toMs } from '../../data/mappers';
import { isMasters } from '../../data/masters';
import type { EventRow, MatchRow } from '../../data/rows';
import { formatDate } from '../../lib/time';
import { Badge, Button, cx, Empty } from './ui';

const SHOWN = 8;

export function HeadToHead({ playerId, matches, events, name }: { playerId: string; matches: readonly MatchRow[]; events: readonly EventRow[]; name: (id: string) => string }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(
    () =>
      headToHead(
        matches.map((m) => ({
          key: m.id,
          player1: m.player1_id,
          player2: m.player2_id,
          winner: m.winner_id,
          legs1: m.legs1,
          legs2: m.legs2,
          walkover: m.walkover,
          finishedAt: toMs(m.finished_at),
        })),
        playerId,
      ),
    [matches, playerId],
  );
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  if (rows.length === 0) return <Empty>Nog geen matchen gespeeld.</Empty>;
  const visible = all ? rows : rows.slice(0, SHOWN);

  return (
    <div className="space-y-2" data-head-to-head>
      <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
        <table className="w-full text-[13px]">
          <thead className="border-b border-zinc-100 bg-zinc-50/80 text-2xs text-zinc-500">
            <tr>
              <th className="py-1.5 pl-3 text-left font-medium">Tegenstander</th>
              <th className="w-16 text-center font-medium" title="Gewonnen–verloren">W–V</th>
              <th className="w-16 pr-3 text-right font-medium">Legs</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const expanded = open === r.opponent;
              return [
                <tr
                  key={r.opponent}
                  className="cursor-pointer border-t border-zinc-100 first:border-t-0 hover:bg-zinc-50"
                  onClick={() => setOpen(expanded ? null : r.opponent)}
                  aria-expanded={expanded}
                >
                  <td className="max-w-0 truncate py-1.5 pl-3">
                    <span className="mr-1 text-2xs text-zinc-400">{expanded ? '▾' : '▸'}</span>
                    <Link to={`/spelers/${r.opponent}`} className="font-medium text-zinc-950 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                      {name(r.opponent)}
                    </Link>
                  </td>
                  <td className={cx('text-center font-semibold tabular-nums', r.won > r.lost ? 'text-brand-700' : r.won < r.lost ? 'text-accent-700' : 'text-zinc-700')}>
                    {r.won}–{r.lost}
                  </td>
                  <td className="pr-3 text-right text-zinc-500 tabular-nums">
                    {r.legsFor}–{r.legsAgainst}
                  </td>
                </tr>,
                expanded && (
                  <tr key={`${r.opponent}-detail`} className="bg-zinc-50/70">
                    <td colSpan={3} className="px-3 py-1.5">
                      <ul className="space-y-0.5 text-xs">
                        {r.matches.map((key) => {
                          const m = byId.get(key) as MatchRow;
                          const event = eventById.get(m.event_id);
                          const mine = m.player1_id === playerId;
                          const won = m.winner_id === playerId;
                          return (
                            <li key={key} className="flex items-center gap-2">
                              <Link to={`/avond/${m.event_id}`} className="w-20 shrink-0 text-zinc-600 tabular-nums hover:text-brand-700">
                                {event ? formatDate(event.event_date) : ''}
                              </Link>
                              <span className="min-w-0 flex-1 truncate text-zinc-500">
                                {STAGE_NAMES[m.stage]}
                                {isMasters(event) && ' · Masters'}
                              </span>
                              <span className="font-semibold tabular-nums">
                                {mine ? m.legs1 : m.legs2}–{mine ? m.legs2 : m.legs1}
                              </span>
                              <Badge tone={won ? 'blue' : 'stone'}>{won ? 'W' : 'V'}</Badge>
                            </li>
                          );
                        })}
                      </ul>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {rows.length > SHOWN && (
        <Button variant="ghost" size="sm" block onClick={() => setAll((a) => !a)}>
          {all ? 'Minder tonen' : `Alle tegenstanders (${rows.length})`}
        </Button>
      )}
    </div>
  );
}
