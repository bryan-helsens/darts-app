-- Sanapolis Darts: pushmeldingen
--
-- Een speler zet op zijn eigen gsm meldingen aan (één keer, voor alle
-- avonden): "jouw match begint", "jouw match komt eraan", "jij schrijft" en
-- een herinnering op de dag van een speelavond. De Netlify-functie
-- "meldingen" (netlify/functions/meldingen.mts) rekent elke minuut uit wat er
-- te melden is en verstuurt het met de service-sleutel.
--
-- De abonnementen zijn niet leesbaar via de API (geen policies): enkel via de
-- functies hieronder en met de service-sleutel. Alleen toevoegingen.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  -- Adres van de pushdienst van dit toestel; wie het kent, bezit het toestel.
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  kinds text[] not null default array['start', 'next', 'scorer', 'reminder']
    check (kinds <@ array['start', 'next', 'scorer', 'reminder']),
  created_at timestamptz not null default now()
);
create index push_subscriptions_player_idx on public.push_subscriptions (player_id);
alter table public.push_subscriptions enable row level security;

-- Wat al verstuurd werd (zodat elke melding maar één keer vertrekt).
create table public.push_sent (
  event_id uuid not null references public.events (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, key)
);
alter table public.push_sent enable row level security;

-- Meldingen aanzetten (of wijzigen) voor een speler, op dit toestel.
create or replace function public.subscribe_push(
  p_player_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_kinds text[] default array['start', 'next', 'scorer', 'reminder']
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_player public.players;
begin
  select * into v_player from public.players where id = p_player_id;
  if not found or v_player.pending or not v_player.active or v_player.anonymized_at is not null then
    return jsonb_build_object('status', 'invalid', 'message', 'Voor deze speler kunnen geen meldingen aangezet worden.');
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(char_length(p_p256dh), 0) not between 1 and 200 or coalesce(char_length(p_auth), 0) not between 1 and 100 then
    return jsonb_build_object('status', 'invalid', 'message', 'Dit toestel gaf een ongeldig abonnement.');
  end if;
  if p_kinds is null or not (p_kinds <@ array['start', 'next', 'scorer', 'reminder']) then
    return jsonb_build_object('status', 'invalid', 'message', 'Onbekende soort melding.');
  end if;
  -- Hetzelfde toestel kan maar voor één speler meldingen krijgen.
  insert into public.push_subscriptions (player_id, endpoint, p256dh, auth, kinds)
  values (p_player_id, p_endpoint, p_p256dh, p_auth, p_kinds)
  on conflict (endpoint) do update
    set player_id = excluded.player_id, p256dh = excluded.p256dh, auth = excluded.auth, kinds = excluded.kinds;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Meldingen uitzetten op dit toestel.
create or replace function public.unsubscribe_push(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- Staan de meldingen aan op dit toestel, en voor wie?
create or replace function public.push_status(p_endpoint text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('player_id', player_id, 'kinds', kinds)
  from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- Recht op vergetelheid: een geanonimiseerde speler krijgt geen meldingen meer.
create or replace function private.players_drop_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.anonymized_at is not null and old.anonymized_at is null then
    delete from public.push_subscriptions where player_id = new.id;
  end if;
  return new;
end;
$$;

create trigger players_drop_push after update of anonymized_at on public.players
for each row execute function private.players_drop_push();
