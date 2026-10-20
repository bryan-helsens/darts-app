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
