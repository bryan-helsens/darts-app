import { describe, expect, it } from 'vitest';
import { bundleFor, SIM_START } from '../../tests/data/bundle';
import { simulateEvening, type Match } from '../engine';
import { runPushJob, type PushDeps, type PushPayload, type PushSubscriptionRow } from './pushJob';
import type { EventRow } from './rows';

const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, name: `Speler ${i + 1}` }));
const sim = simulateEvening({ players, boards: 4, start: SIM_START, seed: 'job', sizes: [4, 4, 4], advance: 2, barragePolicy: 'lot' });
const NOW = SIM_START + 60_000;
const pool = sim.matches.filter((m) => m.stage === 'pool').map((m): Match => ({ ...m, legs1: null, legs2: null, winner: null, finishedAt: null }));
const bundle = bundleFor(pool, { settings: { tournament: { sizes: [4, 4, 4], advance: 2, boards: [1, 2, 3, 4], mainBoard: 1, holdFinal: true } } }, sim);
const today = { ...bundle.event, id: 'e2', status: 'gepland', event_date: '2026-11-21' } as EventRow;

function fakeDeps(subs: PushSubscriptionRow[], opts: { gone?: string[]; now?: number; events?: EventRow[] } = {}) {
  const claimed = new Set<string>();
  const sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  const removed: string[] = [];
  const paths: string[] = [];
  let store = [...subs];
  const deps: PushDeps = {
    now: opts.now ?? NOW,
    get: async <T,>(path: string) => {
      paths.push(path);
      const table = path.split('?')[0];
      const data: Record<string, unknown> = {
        events: opts.events ?? [bundle.event],
        players,
        pools: bundle.pools,
        pool_members: bundle.members,
        matches: bundle.matches,
        event_log: bundle.log,
      };
      if (table === 'push_subscriptions') {
        const ids = /player_id=in\.\(([^)]*)\)/.exec(path)?.[1].split(',');
        return (ids ? store.filter((s) => ids.includes(s.player_id)) : store.filter((s) => s.kinds.includes('reminder'))) as T;
      }
      return data[table] as T;
    },
    claim: async (rows) => rows.filter((r) => !claimed.has(`${r.event_id}|${r.key}`) && claimed.add(`${r.event_id}|${r.key}`)),
    remove: async (id) => {
      removed.push(id);
      store = store.filter((s) => s.id !== id);
    },
    send: async (sub, payload) => {
      if (opts.gone?.includes(sub.endpoint)) return 'gone';
      sent.push({ endpoint: sub.endpoint, payload });
      return 'ok';
    },
  };
  return { deps, sent, removed, paths, claimed };
}

const sub = (id: string, player: string, kinds: PushSubscriptionRow['kinds'] = ['start', 'next', 'scorer', 'reminder']): PushSubscriptionRow => ({
  id,
  player_id: player,
  endpoint: `https://push.example/${id}`,
  p256dh: 'k',
  auth: 'a',
  kinds,
});

describe('meldingen versturen', () => {
  // Wie speelt nu op een bord?
  const playing = bundle.matches.filter((m) => m.player1_id && m.player2_id)[0];

  it('enkel naar wie meldingen aanzette, één keer, volgens de gekozen soorten', async () => {
    const f = fakeDeps([sub('a', playing.player1_id as string), sub('b', playing.player2_id as string, ['reminder'])]);
    const first = await runPushJob(f.deps);
    expect(first.sent).toBeGreaterThan(0);
    // b wil enkel herinneringen: geen melding over zijn match.
    expect(f.sent.every((s) => s.endpoint === 'https://push.example/a')).toBe(true);
    expect(f.sent.some((s) => s.payload.title.endsWith('jouw match begint'))).toBe(true);
    // Een tweede ronde verstuurt niets opnieuw.
    const before = f.sent.length;
    expect((await runPushJob(f.deps)).sent).toBe(0);
    expect(f.sent).toHaveLength(before);
    // Enkel sleutels van wie een abonnement heeft.
    expect([...f.claimed].every((k) => k.includes(playing.player1_id as string) || !k.includes(':p'))).toBe(true);
  });

  it('een toestel dat niet meer bestaat, wordt opgeruimd', async () => {
    const f = fakeDeps([sub('weg', playing.player1_id as string)], { gone: ['https://push.example/weg'] });
    const result = await runPushJob(f.deps);
    expect(result).toMatchObject({ sent: 0, removed: 1 });
    expect(f.removed).toEqual(['weg']);
  });

  it('herinnering op de dag zelf naar iedereen die dat wil', async () => {
    const noon = Date.parse('2026-11-21T12:15:00+01:00');
    const f = fakeDeps([sub('a', 'p1'), sub('b', 'p2', ['start'])], { now: noon, events: [today] });
    const result = await runPushJob(f.deps);
    expect(result).toEqual({ messages: 1, sent: 1, removed: 0 });
    expect(f.sent).toEqual([
      { endpoint: 'https://push.example/a', payload: expect.objectContaining({ title: 'Vanavond darts', url: '/inschrijven/e2' }) },
    ]);
  });

  it('niets te doen: enkel de avonden opvragen', async () => {
    const f = fakeDeps([sub('a', 'p1')], { events: [] });
    expect(await runPushJob(f.deps)).toEqual({ messages: 0, sent: 0, removed: 0 });
    expect(f.paths).toHaveLength(1);
  });
});
