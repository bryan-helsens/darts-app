-- Verwijdert alle demo-data (id's die beginnen met "de000000-").
-- Supabase > SQL Editor > dit bestand plakken > Run.
begin;
select set_config('app.skip_audit', 'on', true);
select set_config('app.skip_advance', 'on', true);
delete from public.events where id::text like 'de000000-%';
delete from public.seasons where id::text like 'de000000-%';
delete from public.players where id::text like 'de000000-%'
  and not exists (select 1 from public.registrations r where r.player_id = players.id);
commit;
