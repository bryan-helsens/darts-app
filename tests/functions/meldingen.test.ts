import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification } }));

const { default: meldingen } = await import('../../netlify/functions/meldingen.mts');

// Zaterdag 21/11/2026 om 13u30 Belgische tijd: de herinnering mag vertrekken.
const NOW = Date.parse('2026-11-21T12:30:00Z');
const EVENT = {
  id: 'e1',
  season_id: 's1',
  status: 'gepland',
  kind: 'regulier',
  event_date: '2026-11-21',
  start_time: '19:00:00',
  registration_closes: '18:30:00',
};
const SUBS = [
  { id: 'sub-ok', player_id: 'p1', endpoint: 'https://push.example/ok', p256dh: 'k1', auth: 'a1', kinds: ['reminder'] },
  { id: 'sub-weg', player_id: 'p2', endpoint: 'https://push.example/weg', p256dh: 'k2', auth: 'a2', kinds: ['start', 'reminder'] },
];

describe('Netlify-functie meldingen', () => {
  const fetchMock = vi.fn();
  let claimed: Array<{ event_id: string; key: string }> = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.example');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'sb_secret_test');
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'publiek');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'geheim');
    vi.stubEnv('URL', 'https://darts.example');
    vi.stubGlobal('fetch', fetchMock);
    claimed = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (url.includes('/events?')) return json([EVENT]);
      if (url.includes('/push_subscriptions?') && init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.includes('/push_subscriptions?')) return json(SUBS);
      if (url.includes('/push_sent?')) {
        // Zoals de database met "ignore-duplicates": enkel wat nog niet bestond, komt terug.
        const rows = JSON.parse(String(init?.body)) as Array<{ event_id: string; key: string }>;
        const fresh = rows.filter((r) => !claimed.some((c) => c.event_id === r.event_id && c.key === r.key));
        claimed.push(...fresh);
        return json(fresh);
      }
      return new Response('onbekend', { status: 404 });
    });
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith('/weg')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    sendNotification.mockReset();
  });

  it('verstuurt de herinnering één keer en ruimt verdwenen toestellen op', async () => {
    const res = await meldingen();
    expect(await res.json()).toEqual({ messages: 1, sent: 1, removed: 1 });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    const [sub, payload, options] = sendNotification.mock.calls[0];
    expect(sub).toEqual({ endpoint: 'https://push.example/ok', keys: { p256dh: 'k1', auth: 'a1' } });
    expect(JSON.parse(payload)).toMatchObject({ title: 'Vanavond darts', url: '/inschrijven/e1' });
    expect(options.vapidDetails).toEqual({ subject: 'https://darts.example', publicKey: 'publiek', privateKey: 'geheim' });

    // Een nieuwe "sb_secret_…"-sleutel enkel als apikey (geen Authorization).
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ apikey: 'sb_secret_test' });
    expect(init.headers.Authorization).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('https://supabase.example/rest/v1/push_subscriptions?id=eq.sub-weg', expect.objectContaining({ method: 'DELETE' }));

    // Een minuut later: al verstuurd, dus niets meer.
    sendNotification.mockClear();
    vi.setSystemTime(NOW + 60_000);
    expect(await (await meldingen()).json()).toEqual({ messages: 0, sent: 0, removed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('doet niets zolang de meldingen niet ingesteld zijn', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect(await (await meldingen()).json()).toEqual({ skipped: 'Meldingen zijn nog niet ingesteld.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('meldt een fout van Supabase', async () => {
    fetchMock.mockResolvedValue(new Response('kapot', { status: 500 }));
    await expect(meldingen()).rejects.toThrow('Supabase 500');
  });
});
