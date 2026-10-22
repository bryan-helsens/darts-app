/**
 * De Masters telt niet mee voor de seizoensranking, de klassementen en de
 * seizoensexports (wel voor Elo: die rekent op alle matchen).
 */

import type { EventResultRow, EventRow, MatchRow, MatchStatRow } from './rows';

export const isMasters = (event: Pick<EventRow, 'kind'> | undefined | null) => event?.kind === 'masters';

export interface SeasonDataLike {
  events: EventRow[];
  results: EventResultRow[];
  matches: MatchRow[];
  stats: MatchStatRow[];
}

/** Seizoensgegevens zonder de Masters (zelfde object als er geen Masters is). */
export function withoutMasters<T extends SeasonDataLike>(data: T): T {
  const masters = new Set(data.events.filter(isMasters).map((e) => e.id));
  if (masters.size === 0) return data;
  return {
    ...data,
    events: data.events.filter((e) => !masters.has(e.id)),
    results: data.results.filter((r) => !masters.has(r.event_id)),
    matches: data.matches.filter((m) => !masters.has(m.event_id)),
    stats: data.stats.filter((s) => !masters.has(s.event_id)),
  };
}
