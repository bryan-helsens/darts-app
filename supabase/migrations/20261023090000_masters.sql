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
