/**
 * Alle lees- en schrijfoperaties naar Supabase. Elke functie gooit een Error
 * met een Nederlandstalige boodschap als er iets misgaat.
 */

import type { PostgrestError } from '@supabase/supabase-js';
import type { SeasonTables } from './exports';
import type { PushKind } from './push';
import { supabase } from './supabase';
import type {
  AuditLogRow,
  EventKind,
  EventLogRow,
  EventResultRow,
  EventRow,
  MatchLegDetail,
  MatchLegRow,
  MatchLegSummary,
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
  SubmitLegsResult,
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

/** PostgREST geeft standaard maximaal 1000 rijen per verzoek: haal alles op, pagina per pagina (met een vaste volgorde). */
const PAGE = 1000;
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = await must<T[]>(page(from, from + PAGE - 1));
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
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
  /** Legs van matchen die per beurt gescoord worden (ontbreekt in oudere caches). */
  legs?: MatchLegSummary[];
  results: EventResultRow[];
}

export async function fetchEventBundle(eventId: string): Promise<EventBundle> {
  const [event, pools, members, matches, log, stats, legs, results] = await Promise.all([
    must<EventRow>(supabase.from('events').select('*').eq('id', eventId).single()),
    must<PoolRow[]>(supabase.from('pools').select('*').eq('event_id', eventId)),
    must<PoolMemberRow[]>(supabase.from('pool_members').select('*').eq('event_id', eventId)),
    must<MatchRow[]>(supabase.from('matches').select('*').eq('event_id', eventId)),
    must<EventLogRow[]>(supabase.from('event_log').select('*').eq('event_id', eventId).order('id')),
    must<MatchStatRow[]>(supabase.from('match_stats').select('*').eq('event_id', eventId)),
    must<MatchLegSummary[]>(
      supabase.from('match_legs').select('match_id,leg_no,winner,darts1,points1,darts2,points2').eq('event_id', eventId).order('match_id').order('leg_no'),
    ),
    must<EventResultRow[]>(supabase.from('event_results').select('*').eq('event_id', eventId)),
  ]);
  return { event, pools, members, matches, log, stats, legs, results };
}

/** Alle beurten van een reeks avonden (501-statistieken van een seizoen). */
export async function fetchLegsForEvents(eventIds: readonly string[]): Promise<MatchLegDetail[]> {
  if (eventIds.length === 0) return [];
  return fetchAll<MatchLegDetail>((f, t) =>
    supabase.from('match_legs').select('match_id,event_id,leg_no,starter,scores,checkout_darts').in('event_id', [...eventIds]).order('match_id').order('leg_no').range(f, t),
  );
}

/** Alle beurten van één match ("Beurten bekijken"). */
export const fetchMatchLegs = (matchId: string) =>
  must<MatchLegRow[]>(supabase.from('match_legs').select('*').eq('match_id', matchId).order('leg_no'));

export const fetchRegistrations = (eventId: string) =>
  must<RegistrationRow[]>(supabase.from('registrations').select('*').eq('event_id', eventId));

export const fetchScorerPin = async (eventId: string) =>
  (await must<Array<{ scorer_pin: string }>>(supabase.from('event_secrets').select('scorer_pin').eq('event_id', eventId)))[0]?.scorer_pin ?? null;

export async function fetchSeasonData(seasonId: string): Promise<{ events: EventRow[]; results: EventResultRow[]; matches: MatchRow[]; stats: MatchStatRow[] }> {
  const events = await must<EventRow[]>(supabase.from('events').select('*').eq('season_id', seasonId).order('event_date'));
  const ids = events.map((e) => e.id);
  if (ids.length === 0) return { events, results: [], matches: [], stats: [] };
  // Een volledig seizoen telt al snel meer dan 1000 matchen: per pagina ophalen.
  const [results, matches, stats] = await Promise.all([
    fetchAll<EventResultRow>((from, to) => supabase.from('event_results').select('*').in('event_id', ids).order('event_id').order('player_id').range(from, to)),
    fetchAll<MatchRow>((from, to) => supabase.from('matches').select('*').in('event_id', ids).not('winner_id', 'is', null).order('id').range(from, to)),
    fetchAll<MatchStatRow>((from, to) => supabase.from('match_stats').select('*').in('event_id', ids).order('match_id').order('player_id').range(from, to)),
  ]);
  return { events, results, matches, stats };
}

/** Alle tabellen van een seizoen, voor de JSON-back-up. */
export async function fetchSeasonTables(seasonId: string): Promise<SeasonTables> {
  const events = await must<EventRow[]>(supabase.from('events').select('*').eq('season_id', seasonId).order('event_date'));
  const ids = events.map((e) => e.id);
  const empty: SeasonTables = { events, registrations: [], pools: [], pool_members: [], matches: [], match_stats: [], match_legs: [], event_log: [], event_results: [] };
  if (ids.length === 0) return empty;
  const [registrations, pools, pool_members, matches, match_stats, match_legs, event_log, event_results] = await Promise.all([
    fetchAll<RegistrationRow>((f, t) => supabase.from('registrations').select('*').in('event_id', ids).order('event_id').order('player_id').range(f, t)),
    fetchAll<PoolRow>((f, t) => supabase.from('pools').select('*').in('event_id', ids).order('event_id').order('id').range(f, t)),
    fetchAll<PoolMemberRow>((f, t) => supabase.from('pool_members').select('*').in('event_id', ids).order('event_id').order('player_id').range(f, t)),
    fetchAll<MatchRow>((f, t) => supabase.from('matches').select('*').in('event_id', ids).order('id').range(f, t)),
    fetchAll<MatchStatRow>((f, t) => supabase.from('match_stats').select('*').in('event_id', ids).order('match_id').order('player_id').range(f, t)),
    fetchAll<MatchLegRow>((f, t) => supabase.from('match_legs').select('*').in('event_id', ids).order('match_id').order('leg_no').range(f, t)),
    fetchAll<EventLogRow>((f, t) => supabase.from('event_log').select('*').in('event_id', ids).order('id').range(f, t)),
    fetchAll<EventResultRow>((f, t) => supabase.from('event_results').select('*').in('event_id', ids).order('event_id').order('player_id').range(f, t)),
  ]);
  return { events, registrations, pools, pool_members, matches, match_stats, match_legs, event_log, event_results };
}

export const fetchProfiles = () => must<ProfileRow[]>(supabase.from('profiles').select('*').order('created_at'));

export const fetchContacts = () => must<PlayerContactRow[]>(supabase.from('player_contacts').select('*'));

export const AUDIT_PAGE = 100;

/**
 * Audit-log, nieuwste eerst. `before` is een cursor op `id` (oplopend in de
 * volgorde van schrijven; `changed_at` is per transactie gelijk en dus niet uniek).
 */
export function fetchAuditLog(opts: { before?: number; tables?: readonly string[]; limit?: number } = {}) {
  let query = supabase.from('audit_log').select('*');
  if (opts.tables) query = query.in('table_name', [...opts.tables]);
  if (opts.before !== undefined) query = query.lt('id', opts.before);
  return must<AuditLogRow[]>(query.order('id', { ascending: false }).limit(opts.limit ?? AUDIT_PAGE));
}

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
  kind?: EventKind;
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

/** Eén afgewerkte leg zoals submit_legs ze verwacht (null = bust). */
export interface LegPayload {
  leg_no: number;
  starter: 1 | 2;
  scores: (number | null)[];
  checkout_darts: 1 | 2 | 3 | null;
}

/** Momentopname van een match die per beurt gescoord wordt: alle afgewerkte legs tot nu. */
export interface LegSubmission {
  eventId: string;
  code: string;
  pin: string | null;
  player1: string;
  player2: string;
  legs: LegPayload[];
  /** Legstand van deze momentopname (voor de weergave; de server rekent zelf). */
  legs1: number;
  legs2: number;
  /** Laatste leg: zet ook de uitslag. */
  final: boolean;
  /** Toestel dat de match bijhoudt. */
  session: string;
  clientId: string;
  board: number | null;
}

export const submitLegs = (s: LegSubmission) =>
  rpc<SubmitLegsResult>('submit_legs', {
    p_event_id: s.eventId,
    p_code: s.code,
    p_pin: s.pin ?? '',
    p_player1: s.player1,
    p_player2: s.player2,
    p_legs: s.legs,
    p_final: s.final,
    p_session: s.session,
    p_client_id: s.clientId,
    p_board: s.board,
  });

/** Lopende beurten van een match wissen (wedstrijdleider; bv. een toestel dat uitviel). */
export const clearMatchLegs = (matchId: string) => must(supabase.from('match_legs').delete().eq('match_id', matchId));

/** Correctie door de wedstrijdleider (ook na het afsluiten van de avond). */
export const correctScore = (eventId: string, code: string, legs1: number | null, legs2: number | null) =>
  must(supabase.from('matches').update({ legs1, legs2, walkover: false }).eq('event_id', eventId).eq('code', code));

export const setUserRole = (userId: string, role: Role) => rpc('set_user_role', { p_user_id: userId, p_role: role });

// ---------- Elo (alle gespeelde matchen, over alle seizoenen) ----------

export type EloMatchRow = Pick<MatchRow, 'id' | 'event_id' | 'player1_id' | 'player2_id' | 'winner_id' | 'walkover' | 'finished_at'>;

/** Haalt alle gespeelde matchen op, per 1000 (de standaardlimiet van PostgREST). */
export const fetchEloMatches = () =>
  fetchAll<EloMatchRow>((from, to) =>
    supabase.from('matches').select('id,event_id,player1_id,player2_id,winner_id,walkover,finished_at').not('winner_id', 'is', null).order('id').range(from, to),
  );

// ---------- Online inschrijven (publiek, zonder account) ----------

export interface PreregisterResult {
  status: 'ok' | 'already' | 'closed' | 'locked' | 'invalid';
  player_id?: string;
  message?: string;
}

export const preregister = (input: { eventId: string; playerId?: string | null; name?: string; email?: string; phone?: string }) =>
  rpc<PreregisterResult>('preregister', {
    p_event_id: input.eventId,
    p_player_id: input.playerId ?? null,
    p_name: input.name ?? null,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
  });

// ---------- Pushmeldingen (publiek, zonder account; per toestel) ----------

export interface SubscribePushResult {
  status: 'ok' | 'invalid';
  message?: string;
}

export interface PushStatus {
  player_id: string;
  kinds: PushKind[];
}

export const subscribePush = (input: { playerId: string; endpoint: string; p256dh: string; auth: string; kinds: readonly PushKind[] }) =>
  rpc<SubscribePushResult>('subscribe_push', {
    p_player_id: input.playerId,
    p_endpoint: input.endpoint,
    p_p256dh: input.p256dh,
    p_auth: input.auth,
    p_kinds: [...input.kinds],
  });
export const unsubscribePush = (endpoint: string) => rpc('unsubscribe_push', { p_endpoint: endpoint });
export const fetchPushStatus = (endpoint: string) => rpc<PushStatus | null>('push_status', { p_endpoint: endpoint });

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
