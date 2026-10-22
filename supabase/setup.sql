-- Sanapolis Darts: volledige databaseopzet (gegenereerd door scripts/bundle-migrations.ts).
-- Gebruik: Supabase > SQL Editor > New query > dit hele bestand plakken > Run.
-- Enkel uitvoeren op een NIEUW, leeg project.

-- ===== 20261020000100_schema.sql =====

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

-- ===== 20261020000200_security.sql =====

-- Sanapolis Darts: rollen en Row Level Security
--
-- Publiek (anon) leest enkel wat op de website mag staan. Contactgegevens,
-- inschrijvingen (betaalstatus), de score-pin en de audit-log zijn
-- afgeschermd. Interne hulpfuncties staan in het schema "private", dat niet
-- via de API bereikbaar is.

create schema if not exists private;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where user_id = auth.uid() $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.profiles where user_id = auth.uid()), false) $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role in ('admin', 'leider') from public.profiles where user_id = auth.uid()), false) $$;

-- Nieuw account → profiel. Het allereerste account wordt automatisch admin;
-- alle volgende accounts zijn een aanvraag die een admin moet goedkeuren.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case when exists (select 1 from public.profiles) then 'aanvraag' else 'admin' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- RLS aan op alle tabellen
alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.player_contacts enable row level security;
alter table public.seasons enable row level security;
alter table public.events enable row level security;
alter table public.event_secrets enable row level security;
alter table public.registrations enable row level security;
alter table public.pools enable row level security;
alter table public.pool_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_stats enable row level security;
alter table public.event_log enable row level security;
alter table public.event_results enable row level security;
alter table public.audit_log enable row level security;
alter table public.pin_failures enable row level security;

-- Profielen: eigen profiel, admins zien alles. Rollen wijzigen via set_user_role().
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Publiek leesbare tabellen, schrijven door staff
create policy players_select on public.players for select to anon, authenticated using (true);
create policy players_insert on public.players for insert to authenticated with check (public.is_staff());
create policy players_update on public.players for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy players_delete on public.players for delete to authenticated using (public.is_admin());

create policy seasons_select on public.seasons for select to anon, authenticated using (true);
create policy seasons_write on public.seasons for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy events_select on public.events for select to anon, authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (public.is_admin());
create policy events_update on public.events for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy events_delete on public.events for delete to authenticated using (public.is_admin());

create policy pools_select on public.pools for select to anon, authenticated using (true);
create policy pools_write on public.pools for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy pool_members_select on public.pool_members for select to anon, authenticated using (true);
create policy pool_members_write on public.pool_members for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy matches_select on public.matches for select to anon, authenticated using (true);
create policy matches_write on public.matches for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy match_stats_select on public.match_stats for select to anon, authenticated using (true);
create policy match_stats_write on public.match_stats for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy event_log_select on public.event_log for select to anon, authenticated using (true);
create policy event_log_write on public.event_log for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy event_results_select on public.event_results for select to anon, authenticated using (true);
create policy event_results_write on public.event_results for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Enkel staff
create policy player_contacts_staff on public.player_contacts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy event_secrets_staff on public.event_secrets for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy registrations_staff on public.registrations for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Audit-log: enkel lezen door admins (schrijven gebeurt door triggers)
create policy audit_log_admin on public.audit_log for select to authenticated using (public.is_admin());

-- pin_failures: geen policies, enkel bereikbaar via functies.

grant usage on schema public to anon, authenticated;
grant select on public.event_registration_counts to anon, authenticated;

-- ===== 20261020000300_functions.sql =====

-- Sanapolis Darts: triggers en functies (RPC)
--
-- De toernooilogica zelf (poules, schema's, planning) draait in de browser
-- (src/engine). De database bewaakt wat altijd moet kloppen: geldige scores,
-- doorschuiven naar de volgende match, walk-overs na een opgave, de audit-log
-- en de rechten.

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger registrations_touch before update on public.registrations
for each row execute function private.touch_updated_at();

-- Uitslag afleiden en valideren: de winnaar volgt uit de legs.
create or replace function private.matches_before_write() returns trigger
language plpgsql as $$
declare
  v_need int;
begin
  new.updated_at := now();
  if new.legs1 is null and new.legs2 is null then
    new.winner_id := null;
    new.finished_at := null;
    new.walkover := false;
    return new;
  end if;
  if new.legs1 is null or new.legs2 is null then
    raise exception 'Vul voor beide spelers de legs in.';
  end if;
  if new.player1_id is null or new.player2_id is null then
    raise exception 'De spelers van deze match zijn nog niet gekend.';
  end if;
  v_need := new.best_of / 2 + 1;
  if new.walkover then
    if new.legs1 = new.legs2 then
      raise exception 'Een walk-over heeft een winnaar nodig.';
    end if;
  elsif not ((new.legs1 = v_need and new.legs2 < v_need) or (new.legs2 = v_need and new.legs1 < v_need)) then
    raise exception 'Bij best of % moet één speler precies % legs winnen.', new.best_of, v_need;
  end if;
  new.winner_id := case when new.legs1 > new.legs2 then new.player1_id else new.player2_id end;
  if new.finished_at is null then
    new.finished_at := now();
  end if;
  return new;
end;
$$;

create trigger matches_before_write before insert or update on public.matches
for each row execute function private.matches_before_write();

-- Walk-over als een van beide (gekende) spelers opgegeven heeft.
create or replace function private.apply_walkover_if_needed(p_match_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m public.matches;
  w1 boolean;
  w2 boolean;
  v_need int;
  p1_wins boolean;
begin
  select * into m from public.matches where id = p_match_id;
  if not found or m.winner_id is not null or m.player1_id is null or m.player2_id is null then
    return;
  end if;
  select exists (
    select 1 from public.registrations
    where event_id = m.event_id and player_id = m.player1_id and withdrawn_at is not null
  ) into w1;
  select exists (
    select 1 from public.registrations
    where event_id = m.event_id and player_id = m.player2_id and withdrawn_at is not null
  ) into w2;
  if not (w1 or w2) then
    return;
  end if;
  -- De speler die niet opgaf wint; gaven beiden op, dan wint speler 1.
  p1_wins := (not w1) or w2;
  v_need := m.best_of / 2 + 1;
  update public.matches
  set legs1 = case when p1_wins then v_need else 0 end,
      legs2 = case when p1_wins then 0 else v_need end,
      walkover = true
  where id = m.id;
end;
$$;

-- Een speler in een plaats van de volgende match zetten (of weghalen).
create or replace function private.place_player(
  p_event uuid, p_code text, p_slot smallint, p_player uuid, p_previous uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target public.matches;
  v_current uuid;
begin
  if p_code is null then
    return;
  end if;
  select * into v_target from public.matches where event_id = p_event and code = p_code for update;
  if not found then
    raise exception 'Volgende match % bestaat niet.', p_code;
  end if;
  v_current := case p_slot when 1 then v_target.player1_id else v_target.player2_id end;
  if v_current is not distinct from p_player then
    return;
  end if;
  if v_target.winner_id is not null then
    raise exception 'De volgende match is al gespeeld. Corrigeer eerst die match.';
  end if;
  if v_current is not null and v_current is distinct from p_previous then
    raise exception 'Het schema is niet consistent: de volgende plaats is al bezet.';
  end if;
  if p_slot = 1 then
    update public.matches set player1_id = p_player where id = v_target.id;
  else
    update public.matches set player2_id = p_player where id = v_target.id;
  end if;
  perform private.apply_walkover_if_needed(v_target.id);
end;
$$;

-- Doorschuiven na een (gewijzigde) uitslag.
create or replace function private.matches_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_loser uuid;
  v_old_loser uuid;
begin
  if new.winner_id is not distinct from old.winner_id then
    return null;
  end if;
  if coalesce(current_setting('app.skip_advance', true), '') = 'on' then
    return null;
  end if;
  v_loser := case
    when new.winner_id is null then null
    when new.winner_id = new.player1_id then new.player2_id
    else new.player1_id
  end;
  v_old_loser := case
    when old.winner_id is null then null
    when old.winner_id = old.player1_id then old.player2_id
    else old.player1_id
  end;
  perform private.place_player(new.event_id, new.next_code, new.next_slot, new.winner_id, old.winner_id);
  perform private.place_player(new.event_id, new.loser_next_code, new.loser_next_slot, v_loser, v_old_loser);
  return null;
end;
$$;

create trigger matches_after_update after update on public.matches
for each row execute function private.matches_after_update();

-- ---------------------------------------------------------------------------
-- Audit-log
-- ---------------------------------------------------------------------------

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
begin
  if coalesce(current_setting('app.skip_audit', true), '') = 'on' then
    return null;
  end if;
  v_row := coalesce(to_jsonb(new), to_jsonb(old));
  -- Bij matchen enkel uitslagen loggen, niet het doorschuiven van spelers.
  if tg_table_name = 'matches' and tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'legs1', to_jsonb(new) ->> 'legs2', to_jsonb(new) ->> 'winner_id', to_jsonb(new) ->> 'walkover')
       is not distinct from
       (to_jsonb(old) ->> 'legs1', to_jsonb(old) ->> 'legs2', to_jsonb(old) ->> 'winner_id', to_jsonb(old) ->> 'walkover') then
      return null;
    end if;
  end if;
  insert into public.audit_log (table_name, row_key, action, old_data, new_data, changed_by, changed_by_label)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'event_id', v_row ->> 'player_id')),
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid(),
    nullif(current_setting('app.actor', true), '')
  );
  return null;
end;
$$;

create trigger audit_matches after update or delete on public.matches
for each row execute function private.audit_row();
create trigger audit_registrations after insert or update or delete on public.registrations
for each row execute function private.audit_row();
create trigger audit_players after insert or update or delete on public.players
for each row execute function private.audit_row();
create trigger audit_seasons after insert or update or delete on public.seasons
for each row execute function private.audit_row();
create trigger audit_events after update or delete on public.events
for each row execute function private.audit_row();

create or replace function private.audit_note(p_table text, p_key text, p_action text, p_data jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (table_name, row_key, action, new_data, changed_by, changed_by_label)
  values (p_table, p_key, p_action, p_data, auth.uid(), nullif(current_setting('app.actor', true), ''));
$$;

create or replace function private.require_staff() returns void
language plpgsql as $$
begin
  if not public.is_staff() then
    raise exception 'Enkel voor beheerders en wedstrijdleiders.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_admin() returns void
language plpgsql as $$
begin
  if not public.is_admin() then
    raise exception 'Enkel voor beheerders.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.insert_matches(p_event_id uuid, p_matches jsonb) returns setof uuid
language sql security definer set search_path = public as $$
  insert into public.matches (
    event_id, code, stage, round, position, pool_id, player1_id, player2_id, best_of,
    next_code, next_slot, loser_next_code, loser_next_slot
  )
  select
    p_event_id,
    m ->> 'code',
    m ->> 'stage',
    (m ->> 'round')::int,
    (m ->> 'position')::int,
    m ->> 'pool_id',
    nullif(m ->> 'player1_id', '')::uuid,
    nullif(m ->> 'player2_id', '')::uuid,
    (m ->> 'best_of')::int,
    m ->> 'next_code',
    (m ->> 'next_slot')::smallint,
    m ->> 'loser_next_code',
    (m ->> 'loser_next_slot')::smallint
  from jsonb_array_elements(p_matches) m
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- RPC: score-invoer (pincode of staff)
-- ---------------------------------------------------------------------------

create or replace function public.check_scorer_pin(p_event_id uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_fail int;
begin
  select count(*) into v_fail from public.pin_failures
  where event_id = p_event_id and failed_at > now() - interval '10 minutes';
  if v_fail >= 20 then
    return false;
  end if;
  if exists (select 1 from public.event_secrets where event_id = p_event_id and scorer_pin = p_pin) then
    return true;
  end if;
  insert into public.pin_failures (event_id) values (p_event_id);
  return false;
end;
$$;

create or replace function public.submit_score(
  p_event_id uuid,
  p_code text,
  p_pin text,
  p_legs1 int,
  p_legs2 int,
  p_stats jsonb default '[]'::jsonb,
  p_client_id uuid default null,
  p_board int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff boolean := public.is_staff();
  v_event public.events;
  v_match public.matches;
  v_fail int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Onbekende speelavond.');
  end if;

  if not v_staff then
    select count(*) into v_fail from public.pin_failures
    where event_id = p_event_id and failed_at > now() - interval '10 minutes';
    if v_fail >= 20 then
      return jsonb_build_object('status', 'locked', 'message', 'Te veel foute pogingen. Probeer over enkele minuten opnieuw.');
    end if;
    if not exists (select 1 from public.event_secrets where event_id = p_event_id and scorer_pin = p_pin) then
      insert into public.pin_failures (event_id) values (p_event_id);
      return jsonb_build_object('status', 'bad_pin', 'message', 'Foute pincode.');
    end if;
  end if;

  if v_event.status <> 'bezig' then
    return jsonb_build_object('status', 'closed', 'message', 'Deze speelavond is niet bezig.');
  end if;

  if p_client_id is not null and exists (select 1 from public.matches where result_client_id = p_client_id) then
    return jsonb_build_object('status', 'ok', 'duplicate', true);
  end if;

  select * into v_match from public.matches where event_id = p_event_id and code = p_code for update;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Onbekende match.');
  end if;

  if v_match.winner_id is not null then
    if v_match.legs1 = p_legs1 and v_match.legs2 = p_legs2 then
      return jsonb_build_object('status', 'ok', 'duplicate', true);
    end if;
    if not v_staff then
      return jsonb_build_object(
        'status', 'conflict',
        'message', 'Voor deze match is al een andere uitslag ingevoerd. Vraag de wedstrijdleider om te corrigeren.',
        'legs1', v_match.legs1,
        'legs2', v_match.legs2
      );
    end if;
  end if;

  begin
    perform set_config('app.actor', case when v_staff then '' else 'score-pin' end, true);
    update public.matches
    set legs1 = p_legs1,
        legs2 = p_legs2,
        walkover = false,
        board = coalesce(p_board, board),
        result_client_id = coalesce(p_client_id, result_client_id)
    where id = v_match.id;

    insert into public.match_stats (match_id, event_id, player_id, count_180, highest_finish, highest_score)
    select v_match.id,
           p_event_id,
           (s ->> 'player_id')::uuid,
           coalesce((s ->> 'count_180')::int, 0),
           nullif(s ->> 'highest_finish', '')::int,
           nullif(s ->> 'highest_score', '')::int
    from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) s
    where (s ->> 'player_id')::uuid in (v_match.player1_id, v_match.player2_id)
    on conflict (match_id, player_id) do update
      set count_180 = excluded.count_180,
          highest_finish = excluded.highest_finish,
          highest_score = excluded.highest_score;
  exception when others then
    return jsonb_build_object('status', 'error', 'message', sqlerrm);
  end;

  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: verloop van de avond (staff)
-- ---------------------------------------------------------------------------

-- Poules en poulematchen opslaan en de avond starten (in één transactie).
create or replace function public.start_tournament(
  p_event_id uuid, p_pools jsonb, p_matches jsonb, p_config jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  if exists (select 1 from public.matches where event_id = p_event_id) then
    raise exception 'Het toernooi van deze avond is al gestart.';
  end if;

  insert into public.pools (event_id, id, label, position)
  select p_event_id, p ->> 'id', p ->> 'label', (p ->> 'position')::int
  from jsonb_array_elements(p_pools) p;

  insert into public.pool_members (event_id, pool_id, player_id, seed)
  select p_event_id, p ->> 'id', m.value::uuid, m.ordinality::int
  from jsonb_array_elements(p_pools) p,
       jsonb_array_elements_text(p -> 'players') with ordinality m (value, ordinality);

  perform private.insert_matches(p_event_id, p_matches);

  update public.events
  set status = 'bezig',
      started_at = now(),
      settings = settings || jsonb_build_object('tournament', p_config)
  where id = p_event_id;
end;
$$;

-- Barragematchen toevoegen.
create or replace function public.add_barrages(p_event_id uuid, p_matches jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  perform private.insert_matches(p_event_id, p_matches);
end;
$$;

-- A- en B-schema opslaan.
create or replace function public.generate_knockout(p_event_id uuid, p_matches jsonb, p_knockout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform private.require_staff();
  if (select knockout from public.events where id = p_event_id) is not null then
    raise exception 'De KO-schema''s van deze avond zijn al aangemaakt.';
  end if;
  update public.events set knockout = p_knockout where id = p_event_id;
  for v_id in select private.insert_matches(p_event_id, p_matches) loop
    perform private.apply_walkover_if_needed(v_id);
  end loop;
end;
$$;

-- KO-schema's weer verwijderen (zolang er nog geen KO-match gespeeld is).
create or replace function public.undo_knockout(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  if exists (
    select 1 from public.matches
    where event_id = p_event_id and stage in ('A', 'B') and winner_id is not null and not walkover
  ) then
    raise exception 'Er zijn al KO-matchen gespeeld.';
  end if;
  perform set_config('app.skip_advance', 'on', true);
  delete from public.matches where event_id = p_event_id and stage in ('A', 'B');
  update public.events set knockout = null where id = p_event_id;
end;
$$;

-- Speler geeft op: resterende matchen worden walk-overs.
create or replace function public.withdraw_player(p_event_id uuid, p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform private.require_staff();
  update public.registrations set withdrawn_at = now()
  where event_id = p_event_id and player_id = p_player_id and withdrawn_at is null;
  if not found then
    raise exception 'Deze speler is niet (meer) actief op deze avond.';
  end if;
  insert into public.event_log (event_id, type, payload, created_by)
  values (p_event_id, 'withdraw', jsonb_build_object('player_id', p_player_id), auth.uid());
  for v_id in
    select id from public.matches
    where event_id = p_event_id and winner_id is null
      and (player1_id = p_player_id or player2_id = p_player_id)
    order by created_at, code
  loop
    perform private.apply_walkover_if_needed(v_id);
  end loop;
end;
$$;

-- Avond afsluiten: eindplaatsen en punten vastleggen (opnieuw uit te voeren na correcties).
create or replace function public.finalize_event(p_event_id uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  delete from public.event_results where event_id = p_event_id;
  insert into public.event_results (event_id, player_id, place_from, place_to, placement_points, participation_points, points)
  select p_event_id,
         (r ->> 'player_id')::uuid,
         (r ->> 'place_from')::int,
         (r ->> 'place_to')::int,
         (r ->> 'placement_points')::int,
         (r ->> 'participation_points')::int,
         (r ->> 'points')::int
  from jsonb_array_elements(p_results) r;
  update public.events set status = 'afgelopen', finalized_at = now() where id = p_event_id;
  perform private.audit_note('event_results', p_event_id::text, 'finalize', p_results);
end;
$$;

-- Toernooi volledig terugzetten (bv. verkeerd gestart).
create or replace function public.reset_tournament(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  perform set_config('app.skip_advance', 'on', true);
  perform private.audit_note('events', p_event_id::text, 'reset', null);
  perform set_config('app.skip_audit', 'on', true);
  delete from public.event_results where event_id = p_event_id;
  delete from public.matches where event_id = p_event_id;
  delete from public.pools where event_id = p_event_id;
  delete from public.event_log where event_id = p_event_id;
  update public.registrations set withdrawn_at = null where event_id = p_event_id;
  update public.events
  set status = 'gepland', started_at = null, knockout = null, finalized_at = null,
      settings = settings - 'tournament'
  where id = p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: beheer (admin)
-- ---------------------------------------------------------------------------

create or replace function public.set_user_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  if p_role not in ('admin', 'leider', 'aanvraag', 'geweigerd') then
    raise exception 'Onbekende rol %.', p_role;
  end if;
  if p_role <> 'admin' and (select role from public.profiles where user_id = p_user_id) = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Er moet minstens één admin overblijven.';
  end if;
  update public.profiles set role = p_role where user_id = p_user_id;
  perform private.audit_note('profiles', p_user_id::text, 'role', jsonb_build_object('role', p_role));
end;
$$;

-- Twee spelersfiches samenvoegen (dubbel aangemaakt): alles van p_remove gaat naar p_keep.
create or replace function public.merge_players(p_keep uuid, p_remove uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  if p_keep = p_remove then
    raise exception 'Kies twee verschillende spelers.';
  end if;
  if exists (
    select 1 from public.registrations a
    join public.registrations b on a.event_id = b.event_id
    where a.player_id = p_keep and b.player_id = p_remove
  ) then
    raise exception 'Beide spelers namen deel aan dezelfde speelavond; samenvoegen kan niet.';
  end if;

  perform private.audit_note('players', p_remove::text, 'merge', jsonb_build_object('into', p_keep));
  perform set_config('app.skip_advance', 'on', true);
  perform set_config('app.skip_audit', 'on', true);

  update public.registrations set player_id = p_keep where player_id = p_remove;
  update public.pool_members set player_id = p_keep where player_id = p_remove;
  update public.matches set player1_id = p_keep where player1_id = p_remove;
  update public.matches set player2_id = p_keep where player2_id = p_remove;
  update public.matches set scorer_id = p_keep where scorer_id = p_remove;
  update public.match_stats set player_id = p_keep where player_id = p_remove;
  update public.event_results set player_id = p_keep where player_id = p_remove;

  insert into public.player_contacts (player_id, email, phone)
  select p_keep, email, phone from public.player_contacts where player_id = p_remove
  on conflict (player_id) do update
    set email = coalesce(public.player_contacts.email, excluded.email),
        phone = coalesce(public.player_contacts.phone, excluded.phone);

  delete from public.players where id = p_remove;
  perform set_config('app.skip_audit', '', true);
  perform set_config('app.skip_advance', '', true);
end;
$$;

-- Recht op vergetelheid: naam en contactgegevens wissen, uitslagen blijven anoniem bewaard.
create or replace function public.anonymize_player(p_player_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  perform set_config('app.skip_audit', 'on', true);
  update public.players
  set name = 'Anonieme speler', nickname = null, anonymized_at = now(), active = false
  where id = p_player_id;
  if not found then
    raise exception 'Onbekende speler.';
  end if;
  delete from public.player_contacts where player_id = p_player_id;
  -- Ook oude versies uit de audit-log wissen.
  delete from public.audit_log where table_name in ('players', 'player_contacts') and row_key = p_player_id::text;
  perform set_config('app.skip_audit', '', true);
  perform private.audit_note('players', p_player_id::text, 'anonymize', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.events, public.registrations, public.pools, public.pool_members,
      public.matches, public.match_stats, public.event_log, public.event_results;
  end if;
end;
$$;

-- ===== 20261020130000_demo_data.sql =====

-- Sanapolis Darts: demo-data laden en verwijderen vanuit de app (enkel admins)
--
-- De app bouwt de demo-data zelf (src/demo/demoData.ts) en stuurt ze als JSON.
-- Alleen rijen met een demo-id (beginnend met "de000000-") worden aanvaard, en
-- verwijderen raakt enkel die rijen: echte gegevens blijven altijd ongemoeid.

create or replace function public.has_demo_data() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seasons where id::text like 'de000000-%')
      or exists (select 1 from public.players where id::text like 'de000000-%');
$$;

create or replace function public.load_demo_data(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  if public.has_demo_data() then
    raise exception 'De demo-data is al geladen. Verwijder ze eerst.';
  end if;
  perform set_config('app.skip_audit', 'on', true);
  perform set_config('app.skip_advance', 'on', true);

  insert into public.players (id, name, nickname, created_at)
  select id, name, nickname, created_at
  from jsonb_populate_recordset(null::public.players, p_data -> 'players')
  where id::text like 'de000000-%';

  insert into public.player_contacts (player_id, email, phone)
  select player_id, email, phone
  from jsonb_populate_recordset(null::public.player_contacts, p_data -> 'player_contacts')
  where player_id::text like 'de000000-%';

  insert into public.seasons (id, name, starts_on, ends_on, settings)
  select id, name, starts_on, ends_on, settings
  from jsonb_populate_recordset(null::public.seasons, p_data -> 'seasons')
  where id::text like 'de000000-%';

  insert into public.events (
    id, season_id, event_date, status, boards, main_board, start_time, registration_closes,
    rng_seed, started_at, knockout, finalized_at, settings, notes
  )
  select id, season_id, event_date, status, boards, main_board, start_time, registration_closes,
         rng_seed, started_at, knockout, finalized_at, coalesce(settings, '{}'::jsonb), notes
  from jsonb_populate_recordset(null::public.events, p_data -> 'events')
  where id::text like 'de000000-%';

  insert into public.event_secrets (event_id, scorer_pin)
  select event_id, scorer_pin
  from jsonb_populate_recordset(null::public.event_secrets, p_data -> 'event_secrets')
  where event_id::text like 'de000000-%';

  insert into public.registrations (event_id, player_id, preregistered, present, paid, withdrawn_at)
  select event_id, player_id, preregistered, present, paid, withdrawn_at
  from jsonb_populate_recordset(null::public.registrations, p_data -> 'registrations')
  where event_id::text like 'de000000-%';

  insert into public.pools (event_id, id, label, position)
  select event_id, id, label, position
  from jsonb_populate_recordset(null::public.pools, p_data -> 'pools')
  where event_id::text like 'de000000-%';

  insert into public.pool_members (event_id, pool_id, player_id, seed)
  select event_id, pool_id, player_id, seed
  from jsonb_populate_recordset(null::public.pool_members, p_data -> 'pool_members')
  where event_id::text like 'de000000-%';

  insert into public.matches (
    id, event_id, code, stage, round, position, pool_id, player1_id, player2_id, best_of,
    legs1, legs2, walkover, next_code, next_slot, board, created_at, finished_at
  )
  select id, event_id, code, stage, round, position, pool_id, player1_id, player2_id, best_of,
         legs1, legs2, coalesce(walkover, false), next_code, next_slot, board, created_at, finished_at
  from jsonb_populate_recordset(null::public.matches, p_data -> 'matches')
  where id::text like 'de000000-%';

  insert into public.match_stats (match_id, event_id, player_id, count_180, highest_finish, highest_score)
  select match_id, event_id, player_id, coalesce(count_180, 0), highest_finish, highest_score
  from jsonb_populate_recordset(null::public.match_stats, p_data -> 'match_stats')
  where match_id::text like 'de000000-%';

  insert into public.event_log (event_id, type, payload, created_at)
  select event_id, type, coalesce(payload, '{}'::jsonb), created_at
  from jsonb_populate_recordset(null::public.event_log, p_data -> 'event_log')
  where event_id::text like 'de000000-%';

  insert into public.event_results (event_id, player_id, place_from, place_to, placement_points, participation_points, points)
  select event_id, player_id, place_from, place_to, placement_points, participation_points, points
  from jsonb_populate_recordset(null::public.event_results, p_data -> 'event_results')
  where event_id::text like 'de000000-%';

  perform set_config('app.skip_audit', '', true);
  perform set_config('app.skip_advance', '', true);
  perform private.audit_note('demo', 'demo', 'load', null);
end;
$$;

create or replace function public.remove_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  perform set_config('app.skip_audit', 'on', true);
  perform set_config('app.skip_advance', 'on', true);
  delete from public.events where id::text like 'de000000-%';
  delete from public.seasons where id::text like 'de000000-%';
  -- Demospelers die ook in een echte avond meespeelden, blijven bestaan.
  delete from public.players p
  where p.id::text like 'de000000-%'
    and not exists (select 1 from public.registrations r where r.player_id = p.id)
    and not exists (select 1 from public.matches m where p.id in (m.player1_id, m.player2_id));
  perform set_config('app.skip_audit', '', true);
  perform set_config('app.skip_advance', '', true);
  perform private.audit_note('demo', 'demo', 'remove', null);
end;
$$;

-- ===== 20261020150000_preregistration.sql =====

-- Sanapolis Darts: vooraf online inschrijven (fase 2a)
--
-- Iedereen kan zich zonder account inschrijven voor een geplande speelavond via
-- public.preregister(): ofwel als bestaande speler (gekozen uit de publieke
-- spelerslijst), ofwel als nieuwe speler. Een nieuwe naam wordt een speler met
-- pending = true. Die blijft onzichtbaar op de publieke site tot de
-- wedstrijdleider hem bij de check-in aanwezig zet. Een rem beperkt het aantal
-- pogingen per avond.

alter table public.players add column pending boolean not null default false;

drop policy players_select on public.players;
create policy players_select on public.players for select to anon, authenticated
  using (not pending or public.is_staff());

create table public.registration_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index registration_attempts_event on public.registration_attempts (event_id, attempted_at);

-- Geen policies: enkel bereikbaar via preregister().
alter table public.registration_attempts enable row level security;

create or replace function public.preregister(
  p_event_id uuid,
  p_player_id uuid default null,
  p_name text default null,
  p_email text default null,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_player public.players;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_attempts int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'invalid', 'message', 'Onbekende speelavond.');
  end if;
  -- Online inschrijven kan tot het sluitingsuur op de dag zelf (Belgische tijd).
  if v_event.status <> 'gepland'
     or now() >= (v_event.event_date + v_event.registration_closes) at time zone 'Europe/Brussels' then
    return jsonb_build_object('status', 'closed');
  end if;

  select count(*) into v_attempts from public.registration_attempts
  where event_id = p_event_id and attempted_at > now() - interval '10 minutes';
  if v_attempts >= 40 then
    return jsonb_build_object('status', 'locked');
  end if;
  insert into public.registration_attempts (event_id) values (p_event_id);

  perform set_config('app.actor', 'online-inschrijving', true);

  if p_player_id is not null then
    select * into v_player from public.players where id = p_player_id;
    if not found or v_player.pending or not v_player.active or v_player.anonymized_at is not null then
      return jsonb_build_object('status', 'invalid', 'message', 'Deze speler kan zich niet online inschrijven. Vraag het aan een organisator.');
    end if;
  else
    if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 60 then
      return jsonb_build_object('status', 'invalid', 'message', 'Geef een naam van 2 tot 60 tekens.');
    end if;
    if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      return jsonb_build_object('status', 'invalid', 'message', 'Dit e-mailadres lijkt niet te kloppen.');
    end if;
    if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^[0-9 +()./-]{6,}$') then
      return jsonb_build_object('status', 'invalid', 'message', 'Dit gsm-nummer lijkt niet te kloppen.');
    end if;
    -- Dezelfde naam staat al ingeschreven voor deze avond: niets dubbel aanmaken.
    select p.* into v_player
    from public.players p
    join public.registrations r on r.player_id = p.id and r.event_id = p_event_id
    where lower(p.name) = lower(v_name)
    limit 1;
    if found then
      return jsonb_build_object('status', 'already', 'player_id', v_player.id);
    end if;
    insert into public.players (name, pending) values (v_name, true) returning * into v_player;
    if v_email is not null or v_phone is not null then
      insert into public.player_contacts (player_id, email, phone) values (v_player.id, v_email, v_phone);
    end if;
  end if;

  if exists (select 1 from public.registrations where event_id = p_event_id and player_id = v_player.id) then
    return jsonb_build_object('status', 'already', 'player_id', v_player.id);
  end if;
  insert into public.registrations (event_id, player_id, preregistered) values (p_event_id, v_player.id, true);
  return jsonb_build_object('status', 'ok', 'player_id', v_player.id);
end;
$$;

-- Wie bij de check-in aanwezig gezet wordt, is daarmee bevestigd als speler.
create or replace function private.confirm_player_on_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.present and (tg_op = 'INSERT' or not old.present) then
    update public.players set pending = false where id = new.player_id and pending;
  end if;
  return new;
end;
$$;

create trigger registrations_confirm_player after insert or update of present on public.registrations
  for each row execute function private.confirm_player_on_checkin();

-- ===== 20261021100000_formats.sql =====

-- Sanapolis Darts: schema-formats naast poules + A/B
--
--   double_elim        winnaarsschema (W), verliezersschema (L) en één grote
--                      finale (GF), zonder poules
--   single_elim_plate  hoofdschema (M) en troostschema (P), zonder poules
--
-- De schema's zelf rekent de engine uit in de browser (src/engine/elimination.ts),
-- net als de poules. De database bewaakt dezelfde dingen als voorheen: geldige
-- scores, doorschuiven van winnaar (next_*) en verliezer (loser_next_*) en
-- walk-overs bij een opgave. Bestaande avonden blijven poules_ab.

alter table public.events drop constraint if exists events_format_check;
alter table public.events
  add constraint events_format_check check (format in ('poules_ab', 'double_elim', 'single_elim_plate'));

alter table public.matches drop constraint if exists matches_stage_check;
alter table public.matches
  add constraint matches_stage_check check (stage in ('pool', 'barrage', 'A', 'B', 'W', 'L', 'GF', 'M', 'P'));

-- Een RPC die enkel bij één format hoort (bv. barrages bij poules_ab).
create or replace function private.require_format(p_event_id uuid, p_format text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select format from public.events where id = p_event_id) is distinct from p_format then
    raise exception 'Dit kan niet bij het format van deze speelavond.';
  end if;
end;
$$;

-- Starten: het format komt uit de configuratie (p_config ->> 'format').
create or replace function public.start_tournament(
  p_event_id uuid, p_pools jsonb, p_matches jsonb, p_config jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_format text := coalesce(p_config ->> 'format', 'poules_ab');
  v_stages text[];
begin
  perform private.require_staff();
  if exists (select 1 from public.matches where event_id = p_event_id) then
    raise exception 'Het toernooi van deze avond is al gestart.';
  end if;
  v_stages := case v_format
    when 'poules_ab' then array['pool', 'barrage', 'A', 'B']
    when 'double_elim' then array['W', 'L', 'GF']
    when 'single_elim_plate' then array['M', 'P']
  end;
  if v_stages is null then
    raise exception 'Onbekend format: %', v_format;
  end if;
  if v_format <> 'poules_ab' and jsonb_array_length(coalesce(p_pools, '[]'::jsonb)) > 0 then
    raise exception 'Dit format heeft geen poules.';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) m where not ((m ->> 'stage') = any (v_stages))) then
    raise exception 'De matchen passen niet bij het format %.', v_format;
  end if;

  insert into public.pools (event_id, id, label, position)
  select p_event_id, p ->> 'id', p ->> 'label', (p ->> 'position')::int
  from jsonb_array_elements(coalesce(p_pools, '[]'::jsonb)) p;

  insert into public.pool_members (event_id, pool_id, player_id, seed)
  select p_event_id, p ->> 'id', m.value::uuid, m.ordinality::int
  from jsonb_array_elements(coalesce(p_pools, '[]'::jsonb)) p,
       jsonb_array_elements_text(p -> 'players') with ordinality m (value, ordinality);

  perform private.insert_matches(p_event_id, p_matches);

  update public.events
  set status = 'bezig',
      started_at = now(),
      format = v_format,
      settings = settings || jsonb_build_object('tournament', p_config)
  where id = p_event_id;
end;
$$;

-- Barragematchen toevoegen (enkel poules_ab).
create or replace function public.add_barrages(p_event_id uuid, p_matches jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  perform private.require_format(p_event_id, 'poules_ab');
  perform private.insert_matches(p_event_id, p_matches);
end;
$$;

-- A- en B-schema opslaan (enkel poules_ab).
create or replace function public.generate_knockout(p_event_id uuid, p_matches jsonb, p_knockout jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform private.require_staff();
  perform private.require_format(p_event_id, 'poules_ab');
  if (select knockout from public.events where id = p_event_id) is not null then
    raise exception 'De KO-schema''s van deze avond zijn al aangemaakt.';
  end if;
  update public.events set knockout = p_knockout where id = p_event_id;
  for v_id in select private.insert_matches(p_event_id, p_matches) loop
    perform private.apply_walkover_if_needed(v_id);
  end loop;
end;
$$;

-- KO-schema's weer verwijderen (enkel poules_ab, zolang er nog geen KO-match gespeeld is).
create or replace function public.undo_knockout(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  perform private.require_format(p_event_id, 'poules_ab');
  if exists (
    select 1 from public.matches
    where event_id = p_event_id and stage in ('A', 'B') and winner_id is not null and not walkover
  ) then
    raise exception 'Er zijn al KO-matchen gespeeld.';
  end if;
  perform set_config('app.skip_advance', 'on', true);
  delete from public.matches where event_id = p_event_id and stage in ('A', 'B');
  update public.events set knockout = null where id = p_event_id;
end;
$$;

-- Toernooi volledig terugzetten (bv. verkeerd gestart); het format wordt weer poules_ab.
create or replace function public.reset_tournament(p_event_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_staff();
  perform set_config('app.skip_advance', 'on', true);
  perform private.audit_note('events', p_event_id::text, 'reset', null);
  perform set_config('app.skip_audit', 'on', true);
  delete from public.event_results where event_id = p_event_id;
  delete from public.matches where event_id = p_event_id;
  delete from public.pools where event_id = p_event_id;
  delete from public.event_log where event_id = p_event_id;
  update public.registrations set withdrawn_at = null where event_id = p_event_id;
  update public.events
  set status = 'gepland', started_at = null, knockout = null, finalized_at = null,
      format = 'poules_ab',
      settings = settings - 'tournament'
  where id = p_event_id;
end;
$$;

-- ===== 20261022090000_x01_scorer.sql =====

-- Sanapolis Darts: 501-scorer per beurt
--
-- De schrijver kan een match per beurt scoren (501 double out). De gsm houdt
-- de lopende leg zelf bij en stuurt na elke leg alle afgewerkte legs van de
-- match door (submit_legs, een momentopname: wat onderweg verloren ging,
-- herstelt zich vanzelf). Bij de laatste leg wordt in dezelfde transactie de
-- uitslag gezet (winnaar en doorschuiven via de bestaande triggers) en de
-- statistieken afgeleid: darts, punten (voor het gemiddelde), 180's, hoogste
-- score en hoogste uitgooi (vanaf 100).
--
-- Regel: beurten bestaan enkel als ze bij de uitslag passen. Wijzigt de uitslag
-- of de spelers op een andere manier (correctie, snel invoeren, opgave), dan
-- worden de beurten gewist.
--
-- Alleen toevoegingen: bestaande gegevens blijven ongewijzigd.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.match_legs (
  match_id uuid not null references public.matches (id) on delete cascade,
  -- Dubbel opgeslagen voor realtime-filters en per-avond-opvragingen.
  event_id uuid not null references public.events (id) on delete cascade,
  leg_no smallint not null check (leg_no between 1 and 11),
  -- Wie begon (1 = speler 1 van de match); daarna wisselen de beurten af.
  starter smallint not null check (starter in (1, 2)),
  -- Gegooide punten per beurt, in volgorde; null = bust (0 punten, 3 darts).
  scores smallint[] not null default '{}',
  checkout_darts smallint check (checkout_darts between 1 and 3),
  -- Afgeleid door de trigger hieronder.
  winner smallint check (winner in (1, 2)),
  darts1 int not null default 0,
  points1 int not null default 0,
  darts2 int not null default 0,
  points2 int not null default 0,
  -- Toestel (sessie) dat deze leg bijhield: een tweede toestel krijgt een conflict.
  session_id uuid,
  created_at timestamptz not null default now(),
  primary key (match_id, leg_no)
);
create index match_legs_event_idx on public.match_legs (event_id);

alter table public.match_legs enable row level security;
-- Publiek: enkel scores, geen persoonsgegevens.
create policy match_legs_select on public.match_legs for select to anon, authenticated using (true);
create policy match_legs_write on public.match_legs for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Darts en punten per speler per match (gemiddelde = punten / darts × 3).
alter table public.match_stats
  add column darts int check (darts >= 0),
  add column points int check (points >= 0),
  add constraint match_stats_darts_points check ((darts is null) = (points is null));

-- ---------------------------------------------------------------------------
-- Controle van een leg (zelfde regels als src/engine/x01.ts)
-- ---------------------------------------------------------------------------

-- Minimaal aantal darts om een score uit te gooien (null = niet uit te gooien).
create or replace function private.checkout_min_darts(p_score int) returns int
language sql immutable as $$
  select case
    when p_score < 2 or p_score > 170 or p_score in (159, 162, 163, 165, 166, 168, 169) then null
    when p_score = 50 or (p_score <= 40 and p_score % 2 = 0) then 1
    when p_score <= 110 and p_score not in (99, 102, 103, 105, 106, 108, 109) then 2
    else 3
  end;
$$;

-- Speelt een leg na en geeft winnaar, darts en punten per speler; fout = exception.
create or replace function private.leg_totals(p_starter smallint, p_scores smallint[], p_checkout smallint)
returns table (winner smallint, darts1 int, points1 int, darts2 int, points2 int)
language plpgsql immutable as $$
declare
  v_rem int[] := array[501, 501];
  v_darts int[] := array[0, 0];
  v_points int[] := array[0, 0];
  v_n int := coalesce(array_length(p_scores, 1), 0);
  v_winner smallint := null;
  v_slot int;
  v_score int;
  v_min int;
begin
  for i in 1..v_n loop
    if v_winner is not null then
      raise exception 'Beurt %: de leg was al uitgespeeld.', i;
    end if;
    v_slot := case when i % 2 = 1 then p_starter else 3 - p_starter end;
    v_score := p_scores[i];
    if v_score is null then
      if v_rem[v_slot] > 181 then
        raise exception 'Beurt %: bust kan pas als de rest 181 of minder is.', i;
      end if;
      v_darts[v_slot] := v_darts[v_slot] + 3;
      continue;
    end if;
    if v_score < 0 or v_score > 180 or v_score in (163, 166, 169, 172, 173, 175, 176, 178, 179) then
      raise exception 'Beurt %: % kan je niet gooien met drie darts.', i, v_score;
    end if;
    if v_score > v_rem[v_slot] or v_rem[v_slot] - v_score = 1 then
      raise exception 'Beurt %: % is een bust.', i, v_score;
    end if;
    if v_score = v_rem[v_slot] then
      v_min := private.checkout_min_darts(v_score);
      if v_min is null then
        raise exception 'Beurt %: % is een bust.', i, v_score;
      end if;
      if p_checkout is null or p_checkout < v_min then
        raise exception 'Beurt %: % uitgooien kan niet met % darts.', i, v_score, coalesce(p_checkout::text, '?');
      end if;
      v_darts[v_slot] := v_darts[v_slot] + p_checkout;
      v_winner := v_slot;
    else
      v_darts[v_slot] := v_darts[v_slot] + 3;
    end if;
    v_rem[v_slot] := v_rem[v_slot] - v_score;
    v_points[v_slot] := v_points[v_slot] + v_score;
  end loop;
  if v_winner is null and p_checkout is not null then
    raise exception 'Uitgooi zonder dat de leg uitgespeeld is.';
  end if;
  return query select v_winner, v_darts[1], v_points[1], v_darts[2], v_points[2];
end;
$$;

create or replace function private.match_legs_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t record;
begin
  select * into t from private.leg_totals(new.starter, new.scores, new.checkout_darts);
  new.winner := t.winner;
  new.darts1 := t.darts1;
  new.points1 := t.points1;
  new.darts2 := t.darts2;
  new.points2 := t.points2;
  return new;
end;
$$;

create trigger match_legs_before_write before insert or update on public.match_legs
for each row execute function private.match_legs_before_write();

-- Beurten wissen als de uitslag of de spelers op een andere manier veranderen.
create or replace function private.matches_clear_leg_detail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.skip_advance', true), '') = 'on' then
    return null;
  end if;
  if coalesce(current_setting('app.legs_submit', true), '') = new.id::text then
    return null;
  end if;
  if (new.legs1, new.legs2, new.player1_id, new.player2_id) is not distinct from (old.legs1, old.legs2, old.player1_id, old.player2_id) then
    return null;
  end if;
  delete from public.match_legs where match_id = new.id;
  update public.match_stats set darts = null, points = null where match_id = new.id and darts is not null;
  return null;
end;
$$;

create trigger matches_clear_leg_detail after update of legs1, legs2, player1_id, player2_id on public.matches
for each row execute function private.matches_clear_leg_detail();

-- ---------------------------------------------------------------------------
-- Toegang voor schrijvers: pincode met rem (gedeeld met submit_score)
-- ---------------------------------------------------------------------------

create or replace function private.scorer_gate(p_event_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fail int;
begin
  if public.is_staff() then
    return null;
  end if;
  select count(*) into v_fail from public.pin_failures
  where event_id = p_event_id and failed_at > now() - interval '10 minutes';
  if v_fail >= 20 then
    return jsonb_build_object('status', 'locked', 'message', 'Te veel foute pogingen. Probeer over enkele minuten opnieuw.');
  end if;
  if not exists (select 1 from public.event_secrets where event_id = p_event_id and scorer_pin = p_pin) then
    insert into public.pin_failures (event_id) values (p_event_id);
    return jsonb_build_object('status', 'bad_pin', 'message', 'Foute pincode.');
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: legs doorsturen (momentopname van alle afgewerkte legs van een match)
-- ---------------------------------------------------------------------------

create or replace function public.submit_legs(
  p_event_id uuid,
  p_code text,
  p_pin text,
  p_player1 uuid,
  p_player2 uuid,
  p_legs jsonb,
  p_final boolean default false,
  p_session uuid default null,
  p_client_id uuid default null,
  p_board int default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_staff boolean := public.is_staff();
  v_gate jsonb;
  v_event public.events;
  v_match public.matches;
  v_leg jsonb;
  v_no int := 0;
  v_existing public.match_legs;
  v_starter smallint;
  v_previous smallint;
  v_scores smallint[];
  v_checkout smallint;
  v_need int;
  v_won int[] := array[0, 0];
  v_totals record;
  v_darts int;
  v_points int;
  v_180 int;
  v_high int;
  v_finish int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Onbekende speelavond.');
  end if;
  v_gate := private.scorer_gate(p_event_id, p_pin);
  if v_gate is not null then
    return v_gate;
  end if;
  if v_event.status <> 'bezig' then
    return jsonb_build_object('status', 'closed', 'message', 'Deze speelavond is niet bezig.');
  end if;
  if p_client_id is not null and exists (select 1 from public.matches where result_client_id = p_client_id) then
    return jsonb_build_object('status', 'ok', 'duplicate', true);
  end if;

  select * into v_match from public.matches where event_id = p_event_id and code = p_code for update;
  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Onbekende match.');
  end if;
  if v_match.player1_id is distinct from p_player1 or v_match.player2_id is distinct from p_player2 then
    return jsonb_build_object('status', 'stale', 'message', 'De spelers van deze match zijn intussen veranderd. Begin deze match opnieuw.');
  end if;
  if v_match.winner_id is not null and not v_staff then
    return jsonb_build_object(
      'status', 'conflict',
      'message', 'Voor deze match is al een uitslag ingevoerd. Vraag de wedstrijdleider om te corrigeren.',
      'legs1', v_match.legs1,
      'legs2', v_match.legs2
    );
  end if;
  if jsonb_typeof(p_legs) is distinct from 'array' or jsonb_array_length(p_legs) = 0 then
    return jsonb_build_object('status', 'error', 'message', 'Er zijn geen legs om op te slaan.');
  end if;

  v_need := v_match.best_of / 2 + 1;
  begin
    perform set_config('app.actor', case when v_staff then '' else 'score-pin' end, true);
    -- Een ander toestel houdt deze match al bij.
    if not v_staff and exists (
      select 1 from public.match_legs where match_id = v_match.id and session_id is distinct from p_session
    ) then
      raise exception using errcode = 'SD409', message = 'Deze match wordt al op een ander toestel bijgehouden. Vraag de wedstrijdleider om de lopende beurten te wissen.';
    end if;

    for v_leg in select value from jsonb_array_elements(p_legs) loop
      v_no := v_no + 1;
      if (v_leg ->> 'leg_no')::int is distinct from v_no then
        raise exception 'De legs moeten genummerd zijn van 1 tot %.', jsonb_array_length(p_legs);
      end if;
      v_starter := (v_leg ->> 'starter')::smallint;
      if v_previous is not null and v_starter = v_previous then
        raise exception 'Leg %: wie begint, moet per leg wisselen.', v_no;
      end if;
      v_previous := v_starter;
      v_scores := array(select (s.value #>> '{}')::smallint from jsonb_array_elements(v_leg -> 'scores') with ordinality s order by s.ordinality);
      v_checkout := (v_leg ->> 'checkout_darts')::smallint;
      if v_won[1] >= v_need or v_won[2] >= v_need then
        raise exception 'Leg %: de match was al beslist.', v_no;
      end if;
      select * into v_totals from private.leg_totals(v_starter, v_scores, v_checkout);
      if v_totals.winner is null then
        raise exception 'Leg % is nog niet uitgespeeld.', v_no;
      end if;
      v_won[v_totals.winner] := v_won[v_totals.winner] + 1;

      select * into v_existing from public.match_legs where match_id = v_match.id and leg_no = v_no;
      if found then
        if v_existing.starter = v_starter and v_existing.scores = v_scores and v_existing.checkout_darts is not distinct from v_checkout then
          continue;
        end if;
        update public.match_legs
        set starter = v_starter, scores = v_scores, checkout_darts = v_checkout, session_id = p_session
        where match_id = v_match.id and leg_no = v_no;
      else
        insert into public.match_legs (match_id, event_id, leg_no, starter, scores, checkout_darts, session_id)
        values (v_match.id, p_event_id, v_no, v_starter, v_scores, v_checkout, p_session);
      end if;
    end loop;
    -- De momentopname is volledig: wat erna komt, hoort er niet meer bij.
    delete from public.match_legs where match_id = v_match.id and leg_no > v_no;

    if p_final then
      if v_won[1] < v_need and v_won[2] < v_need then
        raise exception 'De match is nog niet beslist (% – %).', v_won[1], v_won[2];
      end if;
      perform set_config('app.legs_submit', v_match.id::text, true);
      update public.matches
      set legs1 = v_won[1],
          legs2 = v_won[2],
          walkover = false,
          board = coalesce(p_board, board),
          result_client_id = coalesce(p_client_id, result_client_id)
      where id = v_match.id;

      for k in 1..2 loop
        select coalesce(sum(case when k = 1 then l.darts1 else l.darts2 end), 0)::int,
               coalesce(sum(case when k = 1 then l.points1 else l.points2 end), 0)::int
        into v_darts, v_points
        from public.match_legs l where l.match_id = v_match.id;
        select count(*) filter (where v.score = 180)::int, max(v.score)::int
        into v_180, v_high
        from public.match_legs l, unnest(l.scores) with ordinality as v (score, n)
        where l.match_id = v_match.id
          and v.score is not null
          and (case when v.n % 2 = 1 then l.starter else 3 - l.starter end) = k;
        select max(l.scores[array_length(l.scores, 1)])::int into v_finish
        from public.match_legs l where l.match_id = v_match.id and l.winner = k;
        if v_finish < 100 then
          v_finish := null;
        end if;
        insert into public.match_stats (match_id, event_id, player_id, count_180, highest_finish, highest_score, darts, points)
        values (v_match.id, p_event_id, case when k = 1 then v_match.player1_id else v_match.player2_id end, v_180, v_finish, v_high, v_darts, v_points)
        on conflict (match_id, player_id) do update
          set count_180 = excluded.count_180,
              highest_finish = excluded.highest_finish,
              highest_score = excluded.highest_score,
              darts = excluded.darts,
              points = excluded.points;
      end loop;
      perform set_config('app.legs_submit', '', true);
    end if;
  exception
    when sqlstate 'SD409' then
      return jsonb_build_object('status', 'conflict', 'message', sqlerrm);
    when others then
      return jsonb_build_object('status', 'error', 'message', sqlerrm);
  end;

  return jsonb_build_object('status', 'ok', 'legs1', v_won[1], 'legs2', v_won[2]);
end;
$$;

-- ---------------------------------------------------------------------------
-- Demo-data: ook beurten en darts/punten (zelfde functie, uitgebreid)
-- ---------------------------------------------------------------------------

create or replace function public.load_demo_data(p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_admin();
  if public.has_demo_data() then
    raise exception 'De demo-data is al geladen. Verwijder ze eerst.';
  end if;
  perform set_config('app.skip_audit', 'on', true);
  perform set_config('app.skip_advance', 'on', true);

  insert into public.players (id, name, nickname, created_at)
  select id, name, nickname, created_at
  from jsonb_populate_recordset(null::public.players, p_data -> 'players')
  where id::text like 'de000000-%';

  insert into public.player_contacts (player_id, email, phone)
  select player_id, email, phone
  from jsonb_populate_recordset(null::public.player_contacts, p_data -> 'player_contacts')
  where player_id::text like 'de000000-%';

  insert into public.seasons (id, name, starts_on, ends_on, settings)
  select id, name, starts_on, ends_on, settings
  from jsonb_populate_recordset(null::public.seasons, p_data -> 'seasons')
  where id::text like 'de000000-%';

  insert into public.events (
    id, season_id, event_date, status, boards, main_board, start_time, registration_closes,
    rng_seed, started_at, knockout, finalized_at, settings, notes
  )
  select id, season_id, event_date, status, boards, main_board, start_time, registration_closes,
         rng_seed, started_at, knockout, finalized_at, coalesce(settings, '{}'::jsonb), notes
  from jsonb_populate_recordset(null::public.events, p_data -> 'events')
  where id::text like 'de000000-%';

  insert into public.event_secrets (event_id, scorer_pin)
  select event_id, scorer_pin
  from jsonb_populate_recordset(null::public.event_secrets, p_data -> 'event_secrets')
  where event_id::text like 'de000000-%';

  insert into public.registrations (event_id, player_id, preregistered, present, paid, withdrawn_at)
  select event_id, player_id, preregistered, present, paid, withdrawn_at
  from jsonb_populate_recordset(null::public.registrations, p_data -> 'registrations')
  where event_id::text like 'de000000-%';

  insert into public.pools (event_id, id, label, position)
  select event_id, id, label, position
  from jsonb_populate_recordset(null::public.pools, p_data -> 'pools')
  where event_id::text like 'de000000-%';

  insert into public.pool_members (event_id, pool_id, player_id, seed)
  select event_id, pool_id, player_id, seed
  from jsonb_populate_recordset(null::public.pool_members, p_data -> 'pool_members')
  where event_id::text like 'de000000-%';

  insert into public.matches (
    id, event_id, code, stage, round, position, pool_id, player1_id, player2_id, best_of,
    legs1, legs2, walkover, next_code, next_slot, board, created_at, finished_at
  )
  select id, event_id, code, stage, round, position, pool_id, player1_id, player2_id, best_of,
         legs1, legs2, coalesce(walkover, false), next_code, next_slot, board, created_at, finished_at
  from jsonb_populate_recordset(null::public.matches, p_data -> 'matches')
  where id::text like 'de000000-%';

  insert into public.match_stats (match_id, event_id, player_id, count_180, highest_finish, highest_score, darts, points)
  select match_id, event_id, player_id, coalesce(count_180, 0), highest_finish, highest_score, darts, points
  from jsonb_populate_recordset(null::public.match_stats, p_data -> 'match_stats')
  where match_id::text like 'de000000-%';

  -- Beurten per leg (de trigger rekent winnaar, darts en punten zelf uit).
  insert into public.match_legs (match_id, event_id, leg_no, starter, scores, checkout_darts)
  select match_id, event_id, leg_no, starter, scores, checkout_darts
  from jsonb_populate_recordset(null::public.match_legs, coalesce(p_data -> 'match_legs', '[]'::jsonb))
  where match_id::text like 'de000000-%';

  insert into public.event_log (event_id, type, payload, created_at)
  select event_id, type, coalesce(payload, '{}'::jsonb), created_at
  from jsonb_populate_recordset(null::public.event_log, p_data -> 'event_log')
  where event_id::text like 'de000000-%';

  insert into public.event_results (event_id, player_id, place_from, place_to, placement_points, participation_points, points)
  select event_id, player_id, place_from, place_to, placement_points, participation_points, points
  from jsonb_populate_recordset(null::public.event_results, p_data -> 'event_results')
  where event_id::text like 'de000000-%';

  perform set_config('app.skip_audit', '', true);
  perform set_config('app.skip_advance', '', true);
  perform private.audit_note('demo', 'demo', 'load', null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: de legstand van lopende matchen live tonen
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.match_legs;
  end if;
end;
$$;

-- ===== 20261023090000_masters.sql =====

-- Sanapolis Darts: Masters (eindejaarsfinale)
--
-- Een Masters is een aparte speelavond voor de top van de seizoensranking.
-- Ze telt niet mee voor de ranking of de klassementen (dat filtert de app),
-- wel voor Elo: het zijn echte matchen. Hoogstens één Masters per seizoen.
-- Inschrijven gebeurt niet online: de wedstrijdleider zet bij de check-in
-- de geplaatste spelers (en reserves) aanwezig.
--
-- Alleen toevoegingen: bestaande avonden worden 'regulier'.

alter table public.events
  add column kind text not null default 'regulier',
  add constraint events_kind_check check (kind in ('regulier', 'masters'));

create unique index events_one_masters_per_season on public.events (season_id) where kind = 'masters';

-- Online inschrijven: geweigerd voor een Masters (verder ongewijzigd).
create or replace function public.preregister(
  p_event_id uuid,
  p_player_id uuid default null,
  p_name text default null,
  p_email text default null,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event public.events;
  v_player public.players;
  v_name text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_attempts int;
begin
  select * into v_event from public.events where id = p_event_id;
  if not found then
    return jsonb_build_object('status', 'invalid', 'message', 'Onbekende speelavond.');
  end if;
  -- De Masters is enkel voor de top van de seizoensranking: geen online inschrijving.
  if v_event.kind = 'masters' then
    return jsonb_build_object('status', 'closed', 'message', 'De Masters is enkel voor de top van de seizoensranking. Inschrijven is niet nodig.');
  end if;
  -- Online inschrijven kan tot het sluitingsuur op de dag zelf (Belgische tijd).
  if v_event.status <> 'gepland'
     or now() >= (v_event.event_date + v_event.registration_closes) at time zone 'Europe/Brussels' then
    return jsonb_build_object('status', 'closed');
  end if;

  select count(*) into v_attempts from public.registration_attempts
  where event_id = p_event_id and attempted_at > now() - interval '10 minutes';
  if v_attempts >= 40 then
    return jsonb_build_object('status', 'locked');
  end if;
  insert into public.registration_attempts (event_id) values (p_event_id);

  perform set_config('app.actor', 'online-inschrijving', true);

  if p_player_id is not null then
    select * into v_player from public.players where id = p_player_id;
    if not found or v_player.pending or not v_player.active or v_player.anonymized_at is not null then
      return jsonb_build_object('status', 'invalid', 'message', 'Deze speler kan zich niet online inschrijven. Vraag het aan een organisator.');
    end if;
  else
    if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 60 then
      return jsonb_build_object('status', 'invalid', 'message', 'Geef een naam van 2 tot 60 tekens.');
    end if;
    if v_email is not null and (char_length(v_email) > 120 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      return jsonb_build_object('status', 'invalid', 'message', 'Dit e-mailadres lijkt niet te kloppen.');
    end if;
    if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^[0-9 +()./-]{6,}$') then
      return jsonb_build_object('status', 'invalid', 'message', 'Dit gsm-nummer lijkt niet te kloppen.');
    end if;
    -- Dezelfde naam staat al ingeschreven voor deze avond: niets dubbel aanmaken.
    select p.* into v_player
    from public.players p
    join public.registrations r on r.player_id = p.id and r.event_id = p_event_id
    where lower(p.name) = lower(v_name)
    limit 1;
    if found then
      return jsonb_build_object('status', 'already', 'player_id', v_player.id);
    end if;
    insert into public.players (name, pending) values (v_name, true) returning * into v_player;
    if v_email is not null or v_phone is not null then
      insert into public.player_contacts (player_id, email, phone) values (v_player.id, v_email, v_phone);
    end if;
  end if;

  if exists (select 1 from public.registrations where event_id = p_event_id and player_id = v_player.id) then
    return jsonb_build_object('status', 'already', 'player_id', v_player.id);
  end if;
  insert into public.registrations (event_id, player_id, preregistered) values (p_event_id, v_player.id, true);
  return jsonb_build_object('status', 'ok', 'player_id', v_player.id);
end;
$$;
