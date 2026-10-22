import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import kalender from '../../netlify/functions/kalender.mts';

const EVENTS = [{ id: 'e1', season_id: 's1', event_date: '2026-11-21', start_time: '19:00:00', registration_closes: '18:30:00', notes: null }];
const SEASONS = [{ id: 's1', settings: { endLimit: '23:15' } }];

describe('Netlify-functie /kalender.ics', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sleutel');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/events') ? EVENTS : SEASONS), { status: 200 }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('geeft een iCalendar met de avonden en links naar de eigen site', async () => {
    const res = await kalender(new Request('https://darts.example/kalender.ics'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    const body = await res.text();
    expect(body).toContain('DTSTART:20261121T180000Z');
    expect(body).toContain('URL:https://darts.example/avond/e1');
    // Enkel publieke gegevens, met de apikey-header.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('https://supabase.example/rest/v1/events?select='), expect.objectContaining({ headers: expect.objectContaining({ apikey: 'sleutel' }) }));
  });

  it('meldt een fout als Supabase niet antwoordt of niet ingesteld is', async () => {
    fetchMock.mockResolvedValue(new Response('nee', { status: 503 }));
    expect((await kalender(new Request('https://darts.example/kalender.ics'))).status).toBe(502);
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect((await kalender(new Request('https://darts.example/kalender.ics'))).status).toBe(500);
  });
});
