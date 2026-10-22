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
