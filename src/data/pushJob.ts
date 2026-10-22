/**
 * Eén ronde van de Netlify-functie "meldingen" (elke minuut): de lopende
 * avonden en de avond van vandaag ophalen, de meldingen bepalen (push.ts),
 * enkel de nieuwe vastleggen in push_sent en die versturen naar de toestellen
 * van de spelers. Alles wat met de buitenwereld praat, komt binnen via
 * `PushDeps` (te testen zonder Supabase of pushdienst).
 */

import { todayInBrussels } from '../lib/time';
import type { EventBundle } from './api';
import { buildEventView } from './eventView';
import { eventMessages, reminderMessage, type PushKind, type PushMessage } from './push';
import type { EventLogRow, EventRow, MatchRow, PoolMemberRow, PoolRow } from './rows';

export interface PushSubscriptionRow {
  id: string;
  player_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  kinds: PushKind[];
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushDeps {
  /** GET op de REST-API (pad + query), met de service-sleutel. */
  get: <T>(path: string) => Promise<T>;
  /** Legt de sleutels vast; geeft enkel de nieuwe terug (de andere werden al verstuurd). */
  claim: (rows: Array<{ event_id: string; key: string }>) => Promise<Array<{ event_id: string; key: string }>>;
  /** Een toestel dat niet meer bestaat, opruimen. */
  remove: (subscriptionId: string) => Promise<void>;
  /** Versturen: 'gone' = het toestel bestaat niet meer (404/410). */
  send: (sub: PushSubscriptionRow, payload: PushPayload) => Promise<'ok' | 'gone' | 'error'>;
  now: number;
}

export interface PushJobResult {
  messages: number;
  sent: number;
  removed: number;
}

const inList = (ids: readonly string[]) => `in.(${ids.join(',')})`;

export async function runPushJob(deps: PushDeps): Promise<PushJobResult> {
  // Lopende avonden en de avond van vandaag (voor de herinnering).
  const events = await deps.get<EventRow[]>(`events?select=*&or=(status.eq.bezig,event_date.eq.${todayInBrussels(deps.now)})`);
  const live = events.filter((e) => e.status === 'bezig');

  const candidates: Array<{ eventId: string; message: PushMessage }> = [];
  for (const e of events) {
    const reminder = reminderMessage(e, deps.now);
    if (reminder) candidates.push({ eventId: e.id, message: reminder });
  }
  if (live.length > 0) {
    const players = await deps.get<Array<{ id: string; name: string }>>('players?select=id,name');
    const names = new Map(players.map((p) => [p.id, p.name]));
    const name = (id: string | null | undefined) => (id ? (names.get(id) ?? '?') : '?');
    for (const event of live) {
      const filter = `event_id=eq.${event.id}`;
      const [pools, members, matches, log] = await Promise.all([
        deps.get<PoolRow[]>(`pools?select=*&${filter}`),
        deps.get<PoolMemberRow[]>(`pool_members?select=*&${filter}`),
        deps.get<MatchRow[]>(`matches?select=*&${filter}`),
        deps.get<EventLogRow[]>(`event_log?select=*&${filter}&order=id`),
      ]);
      const bundle: EventBundle = { event, pools, members, matches, log, stats: [], legs: [], results: [] };
      const view = buildEventView(bundle, deps.now);
      for (const message of eventMessages(view, name)) candidates.push({ eventId: event.id, message });
    }
  }
  if (candidates.length === 0) return { messages: 0, sent: 0, removed: 0 };

  // Enkel wie meldingen heeft aangezet (en voor die soort): zo blijft push_sent klein.
  const playerIds = [...new Set(candidates.map((c) => c.message.playerId).filter((p): p is string => p !== null))];
  const wantsBroadcast = candidates.some((c) => c.message.playerId === null);
  const [personal, broadcast] = await Promise.all([
    playerIds.length > 0 ? deps.get<PushSubscriptionRow[]>(`push_subscriptions?select=*&player_id=${inList(playerIds)}`) : Promise.resolve([]),
    wantsBroadcast ? deps.get<PushSubscriptionRow[]>('push_subscriptions?select=*&kinds=cs.{reminder}') : Promise.resolve([]),
  ]);
  const recipients = (m: PushMessage) =>
    (m.playerId === null ? broadcast : personal.filter((s) => s.player_id === m.playerId)).filter((s) => s.kinds.includes(m.kind));
  const wanted = candidates.filter((c) => recipients(c.message).length > 0);
  if (wanted.length === 0) return { messages: 0, sent: 0, removed: 0 };

  const fresh = new Set((await deps.claim(wanted.map((c) => ({ event_id: c.eventId, key: c.message.key })))).map((r) => `${r.event_id}|${r.key}`));
  let sent = 0;
  const gone = new Set<string>();
  for (const c of wanted) {
    if (!fresh.has(`${c.eventId}|${c.message.key}`)) continue;
    const { title, body, url, tag } = c.message;
    for (const sub of recipients(c.message)) {
      if (gone.has(sub.id)) continue;
      const result = await deps.send(sub, { title, body, url, tag });
      if (result === 'ok') sent++;
      if (result === 'gone') gone.add(sub.id);
    }
  }
  for (const id of gone) await deps.remove(id);
  return { messages: fresh.size, sent, removed: gone.size };
}
