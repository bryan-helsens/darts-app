/**
 * Abonneerbare kalender: /kalender.ics (via een rewrite in netlify.toml).
 * Haalt alle speelavonden op via de REST-API van Supabase (publieke gegevens,
 * met de anon-sleutel) en geeft ze terug als iCalendar.
 *
 * Nodig in Netlify (Site configuration > Environment variables): dezelfde
 * VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY als voor de app.
 */

import { CALENDAR_LOCATION, CALENDAR_NAME, toCalendarEvents } from '../../src/data/calendar';
import { buildCalendar } from '../../src/lib/ics';

export default async function kalender(req: Request): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return new Response('De kalender is nog niet ingesteld.', { status: 500 });

  // Enkel de apikey-header: werkt met de oude anon-sleutel en met de nieuwe publishable key.
  const get = async (path: string) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return res.json();
  };
  try {
    const [events, seasons] = await Promise.all([
      get('events?select=id,season_id,event_date,start_time,registration_closes,notes&order=event_date'),
      get('seasons?select=id,settings'),
    ]);
    const site = new URL(req.url).origin;
    const body = buildCalendar(toCalendarEvents(events, seasons, site), { name: CALENDAR_NAME, location: CALENDAR_LOCATION, now: Date.now() });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="sanapolis-darts.ics"',
        // Agenda's halen dit zelden op; 15 minuten cache houdt Supabase rustig.
        'Cache-Control': 'public, max-age=900',
      },
    });
  } catch {
    return new Response('De kalender is tijdelijk niet beschikbaar.', { status: 502 });
  }
}
