/**
 * Alle lees- en schrijfoperaties naar Supabase. Elke functie gooit een Error
 * met een Nederlandstalige boodschap als er iets misgaat.
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AuditLogRow,
  EventLogRow,
  EventResultRow,
  EventRow,
  MatchRow,
  MatchStatRow,
  PlayerContactRow,
  PlayerRow,
  PoolMemberRow,
  PoolRow,
  ProfileRow,
  RegistrationRow,
  Role,
  SeasonRow,
  SubmitScoreResult,
} from './rows';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Herkent netwerkfouten (geen verbinding), die we later opnieuw proberen. */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(msg);
}

function fail(error: PostgrestError | { message: string; code?: string }): never {
  const msg = error.message ?? 'Onbekende fout';
  if ('code' in error && error.code === '42501') throw new ApiError('Je hebt hiervoor geen rechten.', error.code);
  throw new ApiError(msg, 'code' in error ? error.code : undefined);
}

async function must<T>(query: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) fail(error);
  return data as T;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

// ---------- Lezen ----------

export const fetchSeasons = () => must<SeasonRow[]>(supabase.from('seasons').select('*').order('starts_on', { ascending: false }));

export const fetchEvents = () => must<EventRow[]>(supabase.from('events').select('*').order('event_date'));

export const fetchPlayers = () => must<PlayerRow[]>(supabase.from('players').select('*').order('name'));

export const fetchRegistrationCounts = () =>
  must<Array<{ event_id: string; preregistered: number; present: number }>>(supabase.from('event_registration_counts').select('*'));

export interface EventBundle {
  event: EventRow;
  pools: PoolRow[];
  members: PoolMemberRow[];
  matches: MatchRow[];
  log: EventLogRow[];
  stats: MatchStatRow[];
  results: EventResultRow[];
}

export async function fetchEventBundle(eventId: string): Promise<EventBundle> {
  const [event, pools, members, matches, log, stats, results] = await Promise.all([
    must<EventRow>(supabase.from('events').select('*').eq('id', eventId).single()),
    must<PoolRow[]>(supabase.from('pools').select('*').eq('event_id', eventId)),
    must<PoolMemberRow[]>(supabase.from('pool_members').select('*').eq('event_id', eventId)),
    must<MatchRow[]>(supabase.from('matches').select('*').eq('event_id', eventId)),
    must<EventLogRow[]>(supabase.from('event_log').select('*').eq('event_id', eventId).order('id')),
    must<MatchStatRow[]>(supabase.from('match_stats').select('*').eq('event_id', eventId)),
    must<EventResultRow[]>(supabase.from('event_results').select('*').eq('event_id', eventId)),
  ]);
  return { event, pools, members, matches, log, stats, results };
}

export const fetchRegistrations = (eventId: string) =>
  must<RegistrationRow[]>(supabase.from('registrations').select('*').eq('event_id', eventId));

export const fetchScorerPin = async (eventId: string) =>
  (await must<Array<{ scorer_pin: string }>>(supabase.from('event_secrets').select('scorer_pin').eq('event_id', eventId)))[0]?.scorer_pin ?? null;

export async function fetchSeasonData(seasonId: string): Promise<{ events: EventRow[]; results: EventResultRow[]; matches: MatchRow[]; stats: MatchStatRow[] }> {
  const events = await must<EventRow[]>(supabase.from('events').select('*').eq('season_id', seasonId).order('event_date'));
  const ids = events.map((e) => e.id);
  if (ids.length === 0) return { events, results: [], matches: [], stats: [] };
  const [results, matches, stats] = await Promise.all([
    must<EventResultRow[]>(supabase.from('event_results').select('*').in('event_id', ids)),
    must<MatchRow[]>(supabase.from('matches').select('*').in('event_id', ids).not('winner_id', 'is', null)),
    must<MatchStatRow[]>(supabase.from('match_stats').select('*').in('event_id', ids)),
  ]);
  return { events, results, matches, stats };
}

export const fetchProfiles = () => must<ProfileRow[]>(supabase.from('profiles').select('*').order('created_at'));

export const fetchContacts = () => must<PlayerContactRow[]>(supabase.from('player_contacts').select('*'));

export const fetchAuditLog = (limit = 200) =>
  must<AuditLogRow[]>(supabase.from('audit_log').select('*').order('changed_at', { ascending: false }).limit(limit));

// ---------- Schrijven ----------

export const createPlayer = async (input: { name: string; nickname?: string | null; email?: string | null; phone?: string | null }) => {
  const player = await must<PlayerRow>(
    supabase.from('players').insert({ name: input.name.trim(), nickname: input.nickname?.trim() || null }).select('*').single(),
  );
  if (input.email?.trim() || input.phone?.trim()) {
    await must(supabase.from('player_contacts').insert({ player_id: player.id, email: input.email?.trim() || null, phone: input.phone?.trim() || null }));
  }
  return player;
};

export const updatePlayer = async (
  id: string,
  input: { name: string; nickname: string | null; active: boolean; email: string | null; phone: string | null },
) => {
  await must(supabase.from('players').update({ name: input.name.trim(), nickname: input.nickname?.trim() || null, active: input.active }).eq('id', id));
  await must(
    supabase.from('player_contacts').upsert({ player_id: id, email: input.email?.trim() || null, phone: input.phone?.trim() || null, updated_at: new Date().toISOString() }),
  );
};

export const mergePlayers = (keep: string, remove: string) => rpc('merge_players', { p_keep: keep, p_remove: remove });
export const anonymizePlayer = (id: string) => rpc('anonymize_player', { p_player_id: id });
export const deletePlayer = (id: string) => must(supabase.from('players').delete().eq('id', id));

export const createSeason = (input: { name: string; starts_on: string; ends_on: string; settings: Record<string, unknown> }) =>
  must<SeasonRow>(supabase.from('seasons').insert(input).select('*').single());
export const updateSeason = (id: string, patch: Partial<Pick<SeasonRow, 'name' | 'starts_on' | 'ends_on' | 'settings'>>) =>
  must(supabase.from('seasons').update(patch).eq('id', id));

function randomPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return String(n).padStart(4, '0');
}

export async function createEvent(input: {
  season_id: string;
  event_date: string;
  boards: number;
  start_time: string;
  registration_closes: string;
  notes?: string | null;
}) {
  const event = await must<EventRow>(supabase.from('events').insert(input).select('*').single());
  await must(supabase.from('event_secrets').insert({ event_id: event.id, scorer_pin: randomPin() }));
  return event;
}

export const updateEvent = (id: string, patch: Partial<EventRow>) => must(supabase.from('events').update(patch).eq('id', id));
export const deleteEvent = (id: string) => must(supabase.from('events').delete().eq('id', id));
export const setScorerPin = (eventId: string, pin: string) =>
  must(supabase.from('event_secrets').upsert({ event_id: eventId, scorer_pin: pin }));

export const upsertRegistration = (eventId: string, playerId: string, patch: Partial<Pick<RegistrationRow, 'preregistered' | 'present' | 'paid'>>) =>
  must(supabase.from('registrations').upsert({ event_id: eventId, player_id: playerId, ...patch }, { onConflict: 'event_id,player_id' }));
export const deleteRegistration = (eventId: string, playerId: string) =>
  must(supabase.from('registrations').delete().eq('event_id', eventId).eq('player_id', playerId));

export const startTournament = (eventId: string, pools: unknown, matches: unknown, config: unknown) =>
  rpc('start_tournament', { p_event_id: eventId, p_pools: pools, p_matches: matches, p_config: config });
export const addBarrages = (eventId: string, matches: unknown) => rpc('add_barrages', { p_event_id: eventId, p_matches: matches });
export const generateKnockout = (eventId: string, matches: unknown, knockout: unknown) =>
  rpc('generate_knockout', { p_event_id: eventId, p_matches: matches, p_knockout: knockout });
export const undoKnockout = (eventId: string) => rpc('undo_knockout', { p_event_id: eventId });
export const withdrawPlayer = (eventId: string, playerId: string) => rpc('withdraw_player', { p_event_id: eventId, p_player_id: playerId });
export const finalizeEvent = (eventId: string, results: unknown) => rpc('finalize_event', { p_event_id: eventId, p_results: results });
export const resetTournament = (eventId: string) => rpc('reset_tournament', { p_event_id: eventId });

export const addLogEntry = (eventId: string, type: EventLogRow['type'], payload: Record<string, unknown>) =>
  must(supabase.from('event_log').insert({ event_id: eventId, type, payload }));

export const checkScorerPin = (eventId: string, pin: string) => rpc<boolean>('check_scorer_pin', { p_event_id: eventId, p_pin: pin });

export interface ScoreSubmission {
  eventId: string;
  code: string;
  pin: string | null;
  legs1: number;
  legs2: number;
  stats: Array<{ player_id: string; count_180: number; highest_finish: number | null; highest_score: number | null }>;
  clientId: string;
  board: number | null;
}

export const submitScore = (s: ScoreSubmission) =>
  rpc<SubmitScoreResult>('submit_score', {
    p_event_id: s.eventId,
    p_code: s.code,
    p_pin: s.pin ?? '',
    p_legs1: s.legs1,
    p_legs2: s.legs2,
    p_stats: s.stats,
    p_client_id: s.clientId,
    p_board: s.board,
  });

/** Correctie door de wedstrijdleider (ook na het afsluiten van de avond). */
export const correctScore = (eventId: string, code: string, legs1: number | null, legs2: number | null) =>
  must(supabase.from('matches').update({ legs1, legs2, walkover: false }).eq('event_id', eventId).eq('code', code));

export const setUserRole = (userId: string, role: Role) => rpc('set_user_role', { p_user_id: userId, p_role: role });

export async function fetchPlayerData(playerId: string): Promise<{ results: EventResultRow[]; matches: MatchRow[]; stats: MatchStatRow[] }> {
  const [results, matches, stats] = await Promise.all([
    must<EventResultRow[]>(supabase.from('event_results').select('*').eq('player_id', playerId)),
    must<MatchRow[]>(supabase.from('matches').select('*').or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`).not('winner_id', 'is', null)),
    must<MatchStatRow[]>(supabase.from('match_stats').select('*').eq('player_id', playerId)),
  ]);
  return { results, matches, stats };
}

// ---------- Demo-data (enkel admins) ----------

export const hasDemoData = () => rpc<boolean>('has_demo_data', {});
export const loadDemoData = (data: unknown) => rpc('load_demo_data', { p_data: data });
export const removeDemoData = () => rpc('remove_demo_data', {});
