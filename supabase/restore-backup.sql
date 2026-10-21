-- Sanapolis Darts: een seizoen terugzetten uit een JSON-back-up
--
-- De back-up maak je in de app: Beheer → Seizoenen → seizoen → Exporteren →
-- "Volledige back-up (JSON)".
--
-- Gebruik (Supabase → SQL Editor → New query):
--   1. Plak dit hele bestand.
--   2. Open het back-upbestand in Kladblok, kopieer alles en plak het op de
--      regel "PLAK HIER DE BACK-UP" (tussen de twee $backup$-regels).
--   3. Klik op Run.
--
-- Veilig om opnieuw uit te voeren: wat al bestaat (zelfde id) blijft
-- ongemoeid. Een avond die al in de database staat, wordt overgeslagen; enkel
-- ontbrekende avonden worden volledig teruggezet (met inschrijvingen, poules,
-- matchen, statistieken, logboek en eindstand). De pincode voor schrijvers zit
-- niet in de back-up: stel ze opnieuw in bij het openen van de avond.

begin;

select set_config('app.skip_audit', 'on', true);
select set_config('app.skip_advance', 'on', true);

create temporary table restore_backup on commit drop as
select $backup$
PLAK HIER DE BACK-UP
$backup$::jsonb as j;

do $$
begin
  if (select j ->> 'format' from restore_backup) is distinct from 'sanapolis-darts-backup' then
    raise exception 'Dit is geen back-up van Sanapolis Darts.';
  end if;
end;
$$;

-- Avonden die nog niet bestaan: enkel die worden teruggezet.
create temporary table restore_events on commit drop as
select e.*
from jsonb_populate_recordset(null::public.events, (select j -> 'events' from restore_backup)) e
where not exists (select 1 from public.events x where x.id = e.id);

insert into public.seasons (id, name, starts_on, ends_on, settings, created_at)
select s.id, s.name, s.starts_on, s.ends_on, coalesce(s.settings, '{}'::jsonb), coalesce(s.created_at, now())
from jsonb_populate_record(null::public.seasons, (select j -> 'season' from restore_backup)) s
on conflict (id) do nothing;

insert into public.players (id, name, nickname, active, created_at, anonymized_at, pending)
select p.id, p.name, p.nickname, coalesce(p.active, true), coalesce(p.created_at, now()), p.anonymized_at, coalesce(p.pending, false)
from jsonb_populate_recordset(null::public.players, (select j -> 'players' from restore_backup)) p
on conflict (id) do nothing;

insert into public.player_contacts (player_id, email, phone, updated_at)
select c.player_id, c.email, c.phone, coalesce(c.updated_at, now())
from jsonb_populate_recordset(null::public.player_contacts, coalesce((select j -> 'player_contacts' from restore_backup), '[]'::jsonb)) c
on conflict (player_id) do nothing;

insert into public.events (
  id, season_id, event_date, status, format, boards, main_board, start_time, registration_closes,
  registration_reopened, notes, settings, rng_seed, started_at, knockout, finalized_at, created_at
)
select id, season_id, event_date, status, coalesce(format, 'poules_ab'), boards, main_board, start_time, registration_closes,
       coalesce(registration_reopened, false), notes, coalesce(settings, '{}'::jsonb), rng_seed, started_at, knockout, finalized_at,
       coalesce(created_at, now())
from restore_events;

insert into public.registrations (event_id, player_id, preregistered, present, paid, withdrawn_at, created_at, updated_at)
select r.event_id, r.player_id, coalesce(r.preregistered, false), coalesce(r.present, false), coalesce(r.paid, false), r.withdrawn_at,
       coalesce(r.created_at, now()), coalesce(r.updated_at, now())
from jsonb_populate_recordset(null::public.registrations, (select j -> 'registrations' from restore_backup)) r
where r.event_id in (select id from restore_events);

insert into public.pools (event_id, id, label, position)
select p.event_id, p.id, p.label, p.position
from jsonb_populate_recordset(null::public.pools, (select j -> 'pools' from restore_backup)) p
where p.event_id in (select id from restore_events);

insert into public.pool_members (event_id, pool_id, player_id, seed)
select m.event_id, m.pool_id, m.player_id, m.seed
from jsonb_populate_recordset(null::public.pool_members, (select j -> 'pool_members' from restore_backup)) m
where m.event_id in (select id from restore_events);

-- De winnaar volgt opnieuw uit de legs (trigger matches_before_write).
insert into public.matches (
  id, event_id, code, stage, round, position, pool_id, player1_id, player2_id, best_of,
  legs1, legs2, walkover, next_code, next_slot, loser_next_code, loser_next_slot, board, scorer_id,
  created_at, finished_at, result_client_id
)
select m.id, m.event_id, m.code, m.stage, m.round, m.position, m.pool_id, m.player1_id, m.player2_id, m.best_of,
       m.legs1, m.legs2, coalesce(m.walkover, false), m.next_code, m.next_slot, m.loser_next_code, m.loser_next_slot, m.board, m.scorer_id,
       coalesce(m.created_at, now()), m.finished_at, m.result_client_id
from jsonb_populate_recordset(null::public.matches, (select j -> 'matches' from restore_backup)) m
where m.event_id in (select id from restore_events);

insert into public.match_stats (match_id, event_id, player_id, count_180, highest_finish, highest_score)
select s.match_id, s.event_id, s.player_id, coalesce(s.count_180, 0), s.highest_finish, s.highest_score
from jsonb_populate_recordset(null::public.match_stats, (select j -> 'match_stats' from restore_backup)) s
where s.event_id in (select id from restore_events);

-- Logboek van de avond in de oorspronkelijke volgorde (de bordplanning hangt ervan af).
insert into public.event_log (event_id, type, payload, created_by, created_at)
select l.event_id, l.type, coalesce(l.payload, '{}'::jsonb), l.created_by, l.created_at
from jsonb_array_elements((select j -> 'event_log' from restore_backup)) with ordinality as e (x, n),
     jsonb_populate_record(null::public.event_log, e.x) l
where l.event_id in (select id from restore_events)
order by e.n;

insert into public.event_results (event_id, player_id, place_from, place_to, placement_points, participation_points, points)
select r.event_id, r.player_id, r.place_from, r.place_to, r.placement_points, r.participation_points, r.points
from jsonb_populate_recordset(null::public.event_results, (select j -> 'event_results' from restore_backup)) r
where r.event_id in (select id from restore_events);

select set_config('app.skip_audit', '', true);
insert into public.audit_log (table_name, row_key, action, new_data, changed_by_label)
select 'seasons', j -> 'season' ->> 'id', 'restore',
       jsonb_build_object('events', (select count(*) from restore_events), 'exported_at', j ->> 'exported_at'), 'sql-editor'
from restore_backup;

select 'Teruggezet: ' || (select count(*) from restore_events) || ' avond(en).' as resultaat;

commit;
