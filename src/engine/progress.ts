/**
 * Verloop van een speler voor de grafieken op het spelersprofiel: de plaats
 * in de seizoensranking na elke avond, de Elo na elke avond en het 3-dart
 * gemiddelde per avond. Puur.
 */

import type { EloPoint } from './elo';
import { threeDartAverage, type DartsTotals } from './x01';
import { seasonRanking, type EventResultRow } from './ranking';
import type { BestOfSettings } from './settings';
import type { Match, PlayerId } from './types';

export interface ProgressPoint {
  eventId: string;
  /** "jjjj-mm-dd" */
  date: string;
  value: number;
}

export interface RankingProgressInput {
  /** Afgelopen avonden van het seizoen. */
  events: ReadonlyArray<{ id: string; date: string }>;
  results: readonly EventResultRow[];
  /** Gespeelde matchen met hun avond (voor de tiebreaker op legs). */
  matches: ReadonlyArray<{ eventId: string; match: Match }>;
  bestOf: BestOfSettings;
  lotSeed: string;
}

/** Plaats in de ranking na elke avond, vanaf de eerste avond waarop de speler punten had. */
export function rankingProgress(input: RankingProgressInput, playerId: PlayerId): ProgressPoint[] {
  const played = new Set(input.results.map((r) => r.eventId));
  const events = [...input.events].filter((e) => played.has(e.id)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out: ProgressPoint[] = [];
  const included = new Set<string>();
  for (const e of events) {
    included.add(e.id);
    const ranking = seasonRanking(
      input.results.filter((r) => included.has(r.eventId)),
      input.matches.filter((m) => included.has(m.eventId)).map((m) => m.match),
      input.bestOf,
      input.lotSeed,
    );
    const row = ranking.find((r) => r.playerId === playerId);
    if (row) out.push({ eventId: e.id, date: e.date, value: row.position });
  }
  return out;
}

/** Elo na elke avond (laatste match van die avond). */
export function eloProgress(history: readonly EloPoint[] | undefined): ProgressPoint[] {
  const out: ProgressPoint[] = [];
  for (const point of history ?? []) {
    const last = out.at(-1);
    if (last && last.eventId === point.eventId) last.value = point.after;
    else out.push({ eventId: point.eventId, date: point.date, value: point.after });
  }
  return out;
}

/**
 * 3-dart gemiddelde per avond (enkel matchen die per beurt gescoord werden),
 * in volgorde van de datum.
 */
export function averageProgress(stats: ReadonlyArray<DartsTotals & { eventId: string; date: string }>): ProgressPoint[] {
  const perEvent = new Map<string, { date: string; darts: number; points: number }>();
  for (const s of stats) {
    if (s.darts <= 0) continue;
    const acc = perEvent.get(s.eventId) ?? { date: s.date, darts: 0, points: 0 };
    perEvent.set(s.eventId, { date: acc.date, darts: acc.darts + s.darts, points: acc.points + s.points });
  }
  return [...perEvent.entries()]
    .map(([eventId, t]) => ({ eventId, date: t.date, value: threeDartAverage(t) as number }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.eventId.localeCompare(b.eventId));
}
