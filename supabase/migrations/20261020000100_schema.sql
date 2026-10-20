-- Sanapolis Darts: tabellen
--
-- Toernooicodes (pools.id, matches.code) komen uit de engine (src/engine) en
-- zijn uniek per speelavond, bv. "P1-R2-1" of "A-R1-3".

-- Beheerders en wedstrijdleiders (gekoppeld aan Supabase Auth)
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  role text not null default 'aanvraag' check (role in ('admin', 'leider', 'aanvraag', 'geweigerd')),
  created_at timestamptz not null default now()
);

-- Spelers: publiek zichtbaar (enkel naam en bijnaam)
create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  nickname text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  anonymized_at timestamptz
);

-- Contactgegevens: enkel voor beheerders en wedstrijdleiders (GDPR)
create table public.player_contacts (
  player_id uuid primary key references public.players (id) on delete cascade,
  email text,
  phone text,
  updated_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  -- Puntentabel, beste X van Y, legs per ronde, timing, ... (zie src/engine/settings.ts)
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  event_date date not null,
  status text not null default 'gepland' check (status in ('gepland', 'bezig', 'afgelopen')),
  format text not null default 'poules_ab' check (format in ('poules_ab')),
  boards int not null default 6 check (boards between 1 and 16),
  main_board int not null default 1 check (main_board between 1 and 16),
  start_time time not null default '19:00',
  registration_closes time not null default '18:30',
  -- De wedstrijdleider heeft de inschrijving na het sluitingsuur heropend.
  registration_reopened boolean not null default false,
  notes text,
  -- Toernooiconfiguratie van de avond: indeling, doorstromers, legs, ...
  settings jsonb not null default '{}'::jsonb,
  rng_seed text not null default md5(random()::text || clock_timestamp()::text),
  started_at timestamptz,
  -- Deelnemers van het A- en B-schema in seedvolgorde: {"A": [...], "B": [...]}
  knockout jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);
create index events_season_idx on public.events (season_id, event_date);

-- Score-pin per avond (enkel zichtbaar voor staff)
create table public.event_secrets (
  event_id uuid primary key references public.events (id) on delete cascade,
  scorer_pin text not null check (scorer_pin ~ '^[0-9]{4,8}$')
);

create table public.registrations (
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  preregistered boolean not null default false,
  present boolean not null default false,
  paid boolean not null default false,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);
create index registrations_player_idx on public.registrations (player_id);

create table public.pools (
  event_id uuid not null references public.events (id) on delete cascade,
  id text not null,
  label text not null,
  position int not null,
  primary key (event_id, id)
);

create table public.pool_members (
  event_id uuid not null,
  pool_id text not null,
  player_id uuid not null references public.players (id) on delete cascade,
  seed int not null,
  primary key (event_id, player_id),
  foreign key (event_id, pool_id) references public.pools (event_id, id) on delete cascade
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  code text not null,
  stage text not null check (stage in ('pool', 'barrage', 'A', 'B')),
  round int not null,
  position int not null,
  pool_id text,
  player1_id uuid references public.players (id),
  player2_id uuid references public.players (id),
  best_of int not null check (best_of in (1, 3, 5, 7, 9, 11)),
  legs1 int check (legs1 >= 0),
  legs2 int check (legs2 >= 0),
  winner_id uuid references public.players (id),
  walkover boolean not null default false,
  next_code text,
  next_slot smallint check (next_slot in (1, 2)),
  loser_next_code text,
  loser_next_slot smallint check (loser_next_slot in (1, 2)),
  board int,
  scorer_id uuid references public.players (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Idempotentie: een uitslag die offline gebufferd werd, wordt maar één keer verwerkt.
  result_client_id uuid unique,
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);
create index matches_event_idx on public.matches (event_id);
create index matches_player1_idx on public.matches (player1_id);
create index matches_player2_idx on public.matches (player2_id);

create table public.match_stats (
  match_id uuid not null references public.matches (id) on delete cascade,
  -- Dubbel opgeslagen zodat statistieken per avond of seizoen makkelijk op te vragen zijn.
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  count_180 int not null default 0 check (count_180 between 0 and 50),
  highest_finish int check (highest_finish between 2 and 170),
  highest_score int check (highest_score between 0 and 180),
  primary key (match_id, player_id)
);
create index match_stats_event_idx on public.match_stats (event_id);

-- Logboek van de avond: bordwijzigingen, manuele toewijzingen, opgaves, lotingen
create table public.event_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  type text not null check (type in ('boards', 'assign', 'hold', 'release', 'withdraw', 'lot')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index event_log_event_idx on public.event_log (event_id, created_at);

-- Eindplaatsen en punten (vastgelegd bij "Avond afsluiten")
create table public.event_results (
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  place_from int not null,
  place_to int not null,
  placement_points int not null,
  participation_points int not null,
  points int not null,
  primary key (event_id, player_id)
);
create index event_results_player_idx on public.event_results (player_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_key text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_by_label text,
  changed_at timestamptz not null default now()
);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

-- Rem op foute pincodes
create table public.pin_failures (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  failed_at timestamptz not null default now()
);
create index pin_failures_idx on public.pin_failures (event_id, failed_at);

-- Publieke tellers per avond (zonder namen of betaalstatus)
create view public.event_registration_counts as
select
  event_id,
  count(*) filter (where preregistered) as preregistered,
  count(*) filter (where present) as present
from public.registrations
group by event_id;
