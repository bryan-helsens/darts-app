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
