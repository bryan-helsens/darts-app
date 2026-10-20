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
