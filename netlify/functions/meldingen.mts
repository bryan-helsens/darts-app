/**
 * Pushmeldingen (Netlify Scheduled Function, elke minuut): bepaalt wat er te
 * melden is en verstuurt het (src/data/pushJob.ts). Draait enkel op de
 * gepubliceerde site, niet op deploy previews.
 *
 * Nodig in Netlify (Site configuration > Environment variables):
 *   VITE_SUPABASE_URL          (al ingesteld voor de app)
 *   SUPABASE_SERVICE_ROLE_KEY  (geheim: leest de abonnementen)
 *   VITE_VAPID_PUBLIC_KEY      (publiek, ook gebruikt door de app)
 *   VAPID_PRIVATE_KEY          (geheim)
 * Ontbreekt er iets, dan doet de functie niets.
 */

import webpush from 'web-push';
import { runPushJob, type PushJobResult } from '../../src/data/pushJob';

export default async function meldingen(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  // Netlify zet URL op het adres van de site: dat is het "onderwerp" van de VAPID-sleutel.
  const site = process.env.URL;
  if (!url || !key || !publicKey || !privateKey || !site) return Response.json({ skipped: 'Meldingen zijn nog niet ingesteld.' });

  // Een oude service_role-sleutel is een JWT (ook als Authorization); een nieuwe "sb_secret_…" enkel als apikey.
  const headers: Record<string, string> = {
    apikey: key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
  };
  const rest = `${url.replace(/\/$/, '')}/rest/v1/`;
  const check = async (res: Response) => {
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res;
  };

  const result: PushJobResult = await runPushJob({
    now: Date.now(),
    get: async (path) => (await check(await fetch(rest + path, { headers }))).json(),
    // Bestaat de sleutel al, dan wordt ze genegeerd en niet teruggegeven: enkel nieuwe meldingen vertrekken.
    claim: async (rows) =>
      (
        await check(
          await fetch(`${rest}push_sent?select=event_id,key`, {
            method: 'POST',
            headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
            body: JSON.stringify(rows),
          }),
        )
      ).json(),
    remove: async (id) => {
      await check(await fetch(`${rest}push_subscriptions?id=eq.${id}`, { method: 'DELETE', headers }));
    },
    send: async (sub, payload) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
          TTL: 600,
          urgency: 'high',
          vapidDetails: { subject: site, publicKey, privateKey },
        });
        return 'ok';
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? 'gone' : 'error';
      }
    },
  });
  return Response.json(result);
}

export const config = { schedule: '* * * * *' };
