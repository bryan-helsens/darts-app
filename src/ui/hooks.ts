import { useEffect, useMemo, useState } from 'react';
import { placementPoints, seasonRanking, withDefaults, type RankingRow, type SeasonSettings } from '../engine';
import { matchFromRow } from '../data/mappers';
import { useEvents, useSeasonData, useSeasons } from '../data/queries';
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

export function useSeasonRanking(season: SeasonRow | undefined): { rows: RankingRow[]; isLoading: boolean; error: unknown; data: ReturnType<typeof useSeasonData>['data'] } {
  const { data, isLoading, error } = useSeasonData(season?.id);
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
