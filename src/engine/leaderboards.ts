/**
 * Extra klassementen van een seizoen: meeste 180's, hoogste uitgooi, meeste
 * deelnames en beste nieuwkomer. Puur: de gegevens komen van buitenaf.
 */

import type { RankingRow } from './ranking';
import type { PlayerId } from './types';

export interface StatInput {
  playerId: PlayerId;
  eventId: string;
  count180: number;
  highestFinish: number | null;
}

export interface LeaderRow {
  playerId: PlayerId;
  /** Gedeelde positie bij gelijke waarde (1, 2, 2, 4, …). */
  position: number;
  value: number;
  /** Avond waarop de waarde behaald werd (enkel bij de hoogste uitgooi). */
  eventId?: string;
}

export interface SeasonLeaderboards {
  most180: LeaderRow[];
  highestFinish: LeaderRow[];
  attendances: LeaderRow[];
  newcomers: LeaderRow[];
}

export interface LeaderboardInput {
  /** Statistieken van de matchen van dit seizoen. */
  stats: readonly StatInput[];
  /** Deelnames (eindplaatsen) van dit seizoen: één rij per speler per avond. */
  participations: ReadonlyArray<{ playerId: PlayerId; eventId: string }>;
  /** Seizoensranking (voor de nieuwkomers). */
  ranking: readonly RankingRow[];
  /** Eerste avond ooit per speler ("jjjj-mm-dd"), over alle seizoenen. */
  firstSeen: ReadonlyMap<PlayerId, string>;
  seasonStart: string;
  seasonEnd: string;
}

/** Hoogste waarde eerst; gelijke waarden delen de positie. */
function ranked(entries: Array<Omit<LeaderRow, 'position'>>): LeaderRow[] {
  const sorted = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
  let position = 0;
  return sorted.map((e, i) => {
    if (i === 0 || sorted[i - 1].value !== e.value) position = i + 1;
    return { ...e, position };
  });
}

export function seasonLeaderboards(input: LeaderboardInput): SeasonLeaderboards {
  const tons = new Map<PlayerId, number>();
  const finish = new Map<PlayerId, { value: number; eventId: string }>();
  for (const s of input.stats) {
    if (s.count180 > 0) tons.set(s.playerId, (tons.get(s.playerId) ?? 0) + s.count180);
    if (s.highestFinish !== null && s.highestFinish > (finish.get(s.playerId)?.value ?? 0)) finish.set(s.playerId, { value: s.highestFinish, eventId: s.eventId });
  }
  const attended = new Map<PlayerId, Set<string>>();
  for (const p of input.participations) attended.set(p.playerId, (attended.get(p.playerId) ?? new Set()).add(p.eventId));

  const newcomers = input.ranking
    .filter((r) => {
      const first = input.firstSeen.get(r.playerId);
      return first !== undefined && first >= input.seasonStart && first <= input.seasonEnd;
    })
    .map((r) => ({ playerId: r.playerId, value: r.counted }));

  return {
    most180: ranked([...tons].map(([playerId, value]) => ({ playerId, value }))),
    highestFinish: ranked([...finish].map(([playerId, f]) => ({ playerId, value: f.value, eventId: f.eventId }))),
    attendances: ranked([...attended].map(([playerId, events]) => ({ playerId, value: events.size }))),
    newcomers: ranked(newcomers),
  };
}
