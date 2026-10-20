/**
 * Rijen zoals ze uit Supabase komen (zie supabase/migrations).
 * Tijdstippen zijn ISO-strings; datums "jjjj-mm-dd"; uren "uu:mm:ss".
 */

export type Role = 'admin' | 'leider' | 'aanvraag' | 'geweigerd';
export type EventStatus = 'gepland' | 'bezig' | 'afgelopen';

export interface ProfileRow {
  user_id: string;
  display_name: string;
  email: string | null;
  role: Role;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  name: string;
  nickname: string | null;
  active: boolean;
  created_at: string;
  anonymized_at: string | null;
}

export interface PlayerContactRow {
  player_id: string;
  email: string | null;
  phone: string | null;
  updated_at: string;
}

export interface SeasonRow {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface EventRow {
  id: string;
  season_id: string;
  event_date: string;
  status: EventStatus;
  format: 'poules_ab';
  boards: number;
  main_board: number;
  start_time: string;
  registration_closes: string;
  registration_reopened: boolean;
  notes: string | null;
  settings: Record<string, unknown>;
  rng_seed: string;
  started_at: string | null;
  knockout: { A: string[]; B: string[] } | null;
  finalized_at: string | null;
  created_at: string;
}

export interface RegistrationRow {
  event_id: string;
  player_id: string;
  preregistered: boolean;
  present: boolean;
  paid: boolean;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoolRow {
  event_id: string;
  id: string;
  label: string;
  position: number;
}

export interface PoolMemberRow {
  event_id: string;
  pool_id: string;
  player_id: string;
  seed: number;
}

export interface MatchRow {
  id: string;
  event_id: string;
  code: string;
  stage: 'pool' | 'barrage' | 'A' | 'B';
  round: number;
  position: number;
  pool_id: string | null;
  player1_id: string | null;
  player2_id: string | null;
  best_of: number;
  legs1: number | null;
  legs2: number | null;
  winner_id: string | null;
  walkover: boolean;
  next_code: string | null;
  next_slot: 1 | 2 | null;
  loser_next_code: string | null;
  loser_next_slot: 1 | 2 | null;
  board: number | null;
  scorer_id: string | null;
  created_at: string;
  finished_at: string | null;
  result_client_id: string | null;
  updated_at: string;
}

export interface MatchStatRow {
  match_id: string;
  player_id: string;
  count_180: number;
  highest_finish: number | null;
  highest_score: number | null;
}

export type EventLogType = 'boards' | 'assign' | 'hold' | 'release' | 'withdraw' | 'lot';

export interface EventLogRow {
  id: number;
  event_id: string;
  type: EventLogType;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface EventResultRow {
  event_id: string;
  player_id: string;
  place_from: number;
  place_to: number;
  placement_points: number;
  participation_points: number;
  points: number;
}

export interface AuditLogRow {
  id: number;
  table_name: string;
  row_key: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_by_label: string | null;
  changed_at: string;
}

export interface SubmitScoreResult {
  status: 'ok' | 'bad_pin' | 'locked' | 'closed' | 'conflict' | 'error';
  message?: string;
  duplicate?: boolean;
  legs1?: number;
  legs2?: number;
}
