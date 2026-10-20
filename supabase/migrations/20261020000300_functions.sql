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
