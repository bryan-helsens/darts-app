/**
 * Onderlinge duels van een speler: per tegenstander het aantal matchen,
 * zeges, nederlagen en legs. Walk-overs tellen niet mee (zoals bij Elo). Puur.
 */

import type { Match, PlayerId } from './types';

/** Een gespeelde match; `key` is uniek over avonden heen (matchcodes zijn dat niet). */
export type HeadToHeadMatch = Pick<Match, 'player1' | 'player2' | 'winner' | 'legs1' | 'legs2' | 'walkover' | 'finishedAt'> & { key: string };

export interface HeadToHeadRow {
  opponent: PlayerId;
  played: number;
  won: number;
  lost: number;
  legsFor: number;
  legsAgainst: number;
  /** Laatste match (ms), null als onbekend. */
  last: number | null;
  /** Matchen tegen deze tegenstander, de recentste eerst. */
  matches: string[];
}

export function headToHead(matches: readonly HeadToHeadMatch[], playerId: PlayerId): HeadToHeadRow[] {
  const rows = new Map<PlayerId, HeadToHeadRow & { list: HeadToHeadMatch[] }>();
  for (const m of matches) {
    if (m.walkover || m.winner === null || m.legs1 === null || m.legs2 === null) continue;
    const slot = m.player1 === playerId ? 1 : m.player2 === playerId ? 2 : 0;
    if (slot === 0) continue;
    const opponent = slot === 1 ? m.player2 : m.player1;
    if (!opponent) continue;
    const row = rows.get(opponent) ?? { opponent, played: 0, won: 0, lost: 0, legsFor: 0, legsAgainst: 0, last: null, matches: [], list: [] };
    row.played++;
    if (m.winner === playerId) row.won++;
    else row.lost++;
    row.legsFor += slot === 1 ? m.legs1 : m.legs2;
    row.legsAgainst += slot === 1 ? m.legs2 : m.legs1;
    if (m.finishedAt !== null && (row.last === null || m.finishedAt > row.last)) row.last = m.finishedAt;
    row.list.push(m);
    rows.set(opponent, row);
  }
  return [...rows.values()]
    .map(({ list, ...row }) => ({
      ...row,
      matches: [...list].sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0) || a.key.localeCompare(b.key)).map((m) => m.key),
    }))
    .sort((a, b) => b.played - a.played || (b.last ?? 0) - (a.last ?? 0) || a.opponent.localeCompare(b.opponent));
}
