import { useEffect, useMemo, useState } from 'react';
import { computeElo, placementPoints, seasonRanking, withDefaults, type EloMatch, type EloResult, type RankingRow, type SeasonSettings } from '../engine';
import { matchFromRow, toMs } from '../data/mappers';
import { withoutMasters } from '../data/masters';
import { useEloMatches, useEvents, useSeasonData, useSeasons } from '../data/queries';
import type { EventRow, SeasonRow } from '../data/rows';
import { todayInBrussels } from '../lib/time';

/** Huidige tijd, elke `ms` milliseconden ververst. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function seasonSettings(season: SeasonRow | undefined | null): SeasonSettings {
  return withDefaults((season?.settings ?? {}) as Partial<SeasonSettings>);
}

/** Het seizoen van vandaag, anders het meest recente. */
export function pickCurrentSeason(seasons: readonly SeasonRow[] | undefined): SeasonRow | undefined {
  if (!seasons || seasons.length === 0) return undefined;
  const today = todayInBrussels();
  return seasons.find((s) => s.starts_on <= today && today <= s.ends_on) ?? [...seasons].sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0];
}

export function useCurrentSeason() {
  const seasons = useSeasons();
  return { ...seasons, season: pickCurrentSeason(seasons.data) };
}

/** Volgende speelavond (vandaag inbegrepen) en een eventueel lopende avond. */
export function useUpcoming(): { next?: EventRow; live?: EventRow; events: EventRow[]; isLoading: boolean } {
  const { data, isLoading } = useEvents();
  return useMemo(() => {
    const events = data ?? [];
    const today = todayInBrussels();
    const live = events.find((e) => e.status === 'bezig');
    const next = events.filter((e) => e.status !== 'afgelopen' && e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date))[0];
    return { next, live, events, isLoading };
  }, [data, isLoading]);
}

/**
 * Seizoensranking. `data` zijn de seizoensgegevens zonder de Masters: die telt
 * niet mee voor de ranking, de klassementen en de exports (wel voor Elo).
 */
export function useSeasonRanking(season: SeasonRow | undefined): { rows: RankingRow[]; isLoading: boolean; error: unknown; data: ReturnType<typeof useSeasonData>['data'] } {
  const query = useSeasonData(season?.id);
  const { isLoading, error } = query;
  const data = useMemo(() => (query.data ? withoutMasters(query.data) : undefined), [query.data]);
  const rows = useMemo(() => {
    if (!data || !season) return [];
    const settings = seasonSettings(season);
    // Punten altijd volgens de huidige puntentabel van het seizoen.
    const results = data.results.map((r) => ({
      eventId: r.event_id,
      playerId: r.player_id,
      placeFrom: r.place_from,
      placeTo: r.place_to,
      points: placementPoints(r.place_from, settings.points.table) + settings.points.participation,
    }));
    return seasonRanking(results, data.matches.map(matchFromRow), settings.bestOf, season.id);
  }, [data, season]);
  return { rows, isLoading, error, data };
}

/** Seedingrangen voor de loting: de seizoensranking (zonder punten = geen rang). */
export function seedRanksFrom(rows: readonly RankingRow[]): Map<string, number> {
  return new Map(rows.map((r) => [r.playerId, r.position]));
}

export interface EloState {
  elo: EloResult | null;
  /** Eerste avond ooit per speler ("jjjj-mm-dd"), ook als die enkel walk-overs had. */
  firstSeen: Map<string, string>;
  isLoading: boolean;
}

/** Elo van alle spelers, berekend uit alle gespeelde matchen van alle seizoenen. */
export function useElo(): EloState {
  const matches = useEloMatches();
  const { data: events } = useEvents();
  const { data: seasons } = useSeasons();
  return useMemo(() => {
    if (!matches.data || !events || !seasons) return { elo: null, firstSeen: new Map(), isLoading: matches.isLoading };
    const eventById = new Map(events.map((e) => [e.id, e]));
    const settingsBySeason = new Map(seasons.map((s) => [s.id, seasonSettings(s).elo]));
    const fallback = withDefaults(null).elo;
    const input: Array<EloMatch & { seasonId: string }> = [];
    const firstSeen = new Map<string, string>();
    for (const m of matches.data) {
      const event = eventById.get(m.event_id);
      if (!event || !m.player1_id || !m.player2_id || !m.winner_id) continue;
      for (const p of [m.player1_id, m.player2_id]) {
        const seen = firstSeen.get(p);
        if (!seen || event.event_date < seen) firstSeen.set(p, event.event_date);
      }
      input.push({
        id: m.id,
        eventId: m.event_id,
        seasonId: event.season_id,
        date: event.event_date,
        finishedAt: toMs(m.finished_at),
        player1: m.player1_id,
        player2: m.player2_id,
        winner: m.winner_id,
        walkover: m.walkover,
      });
    }
    const seasonOf = new Map(input.map((m) => [m.id, m.seasonId]));
    const elo = computeElo(input, (m) => settingsBySeason.get(seasonOf.get(m.id) ?? '') ?? fallback);
    return { elo, firstSeen, isLoading: false };
  }, [matches.data, matches.isLoading, events, seasons]);
}
