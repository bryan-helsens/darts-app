/**
 * Gegevens ophalen met TanStack Query (cache, ook offline zichtbaar dankzij
 * de persistente cache in App.tsx) en realtime verversen via Supabase.
 */

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  AUDIT_PAGE,
  fetchAuditLog,
  fetchContacts,
  fetchEloMatches,
  fetchEventBundle,
  fetchEvents,
  fetchMatchLegs,
  fetchPlayerData,
  fetchPlayers,
  fetchProfiles,
  fetchRegistrationCounts,
  fetchRegistrations,
  fetchScorerPin,
  fetchSeasonData,
  fetchSeasons,
  hasDemoData,
} from './api';
import type { PlayerRow } from './rows';
import { supabase } from './supabase';

export const keys = {
  seasons: ['seasons'] as const,
  events: ['events'] as const,
  players: ['players'] as const,
  counts: ['registration-counts'] as const,
  event: (id: string) => ['event', id] as const,
  registrations: (id: string) => ['registrations', id] as const,
  pin: (id: string) => ['pin', id] as const,
  season: (id: string) => ['season-data', id] as const,
  profiles: ['profiles'] as const,
  contacts: ['contacts'] as const,
  audit: ['audit'] as const,
  player: (id: string) => ['player', id] as const,
  demo: ['demo'] as const,
  elo: ['elo'] as const,
  matchLegs: (matchId: string) => ['match-legs', matchId] as const,
};

export const useSeasons = () => useQuery({ queryKey: keys.seasons, queryFn: fetchSeasons });
export const useEvents = () => useQuery({ queryKey: keys.events, queryFn: fetchEvents });
export const usePlayers = () => useQuery({ queryKey: keys.players, queryFn: fetchPlayers });
export const useRegistrationCounts = () => useQuery({ queryKey: keys.counts, queryFn: fetchRegistrationCounts });
export const useProfiles = (enabled = true) => useQuery({ queryKey: keys.profiles, queryFn: fetchProfiles, enabled });
export const useContacts = (enabled = true) => useQuery({ queryKey: keys.contacts, queryFn: fetchContacts, enabled });
/** Audit-log per pagina ("Meer laden"); `tables` beperkt tot één soort wijzigingen. */
export const useAuditLog = (filter: string, tables: readonly string[] | undefined, enabled = true) =>
  useInfiniteQuery({
    queryKey: [...keys.audit, filter],
    queryFn: ({ pageParam }) => fetchAuditLog({ before: pageParam, tables }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.length < AUDIT_PAGE ? undefined : last[last.length - 1].id),
    enabled,
  });

/** Alle beurten van één match ("Beurten bekijken"). */
export const useMatchLegs = (matchId: string | undefined) =>
  useQuery({ queryKey: keys.matchLegs(matchId ?? ''), queryFn: () => fetchMatchLegs(matchId as string), enabled: Boolean(matchId) });

export const useEloMatches = () => useQuery({ queryKey: keys.elo, queryFn: fetchEloMatches });

export const useHasDemoData = (enabled = true) => useQuery({ queryKey: keys.demo, queryFn: hasDemoData, enabled });

export const usePlayerData = (playerId: string | undefined) =>
  useQuery({ queryKey: keys.player(playerId ?? ''), queryFn: () => fetchPlayerData(playerId as string), enabled: Boolean(playerId) });

export function useEventBundle(eventId: string | undefined, opts: { live?: boolean } = {}) {
  const query = useQuery({
    queryKey: keys.event(eventId ?? ''),
    queryFn: () => fetchEventBundle(eventId as string),
    enabled: Boolean(eventId),
    // Vangnet als realtime even niet werkt.
    refetchInterval: opts.live ? 30_000 : false,
  });
  useEventRealtime(opts.live ? eventId : undefined);
  return query;
}

export const useRegistrations = (eventId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: keys.registrations(eventId ?? ''),
    queryFn: () => fetchRegistrations(eventId as string),
    enabled: Boolean(eventId) && enabled,
  });

export const useScorerPin = (eventId: string | undefined, enabled = true) =>
  useQuery({ queryKey: keys.pin(eventId ?? ''), queryFn: () => fetchScorerPin(eventId as string), enabled: Boolean(eventId) && enabled });

export const useSeasonData = (seasonId: string | undefined) =>
  useQuery({ queryKey: keys.season(seasonId ?? ''), queryFn: () => fetchSeasonData(seasonId as string), enabled: Boolean(seasonId) });

/** Ververst de gegevens van een avond zodra er iets wijzigt in de database. */
export function useEventRealtime(eventId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!eventId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: keys.event(eventId) });
        void qc.invalidateQueries({ queryKey: keys.registrations(eventId) });
      }, 250);
    };
    const filter = `event_id=eq.${eventId}`;
    const channel = supabase
      .channel(`event-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_legs', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_log', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pools', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_results', filter }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [eventId, qc]);
}

export interface PlayerDirectory {
  list: PlayerRow[];
  byId: Map<string, PlayerRow>;
  name: (id: string | null | undefined) => string;
}

/** Spelerslijst met snelle naamopzoeking. */
export function usePlayerDirectory(): PlayerDirectory & { isLoading: boolean } {
  const { data, isLoading } = usePlayers();
  return useMemo(() => {
    const list = data ?? [];
    const byId = new Map(list.map((p) => [p.id, p]));
    return {
      list,
      byId,
      isLoading,
      name: (id) => (id ? (byId.get(id)?.name ?? '?') : '–'),
    };
  }, [data, isLoading]);
}
