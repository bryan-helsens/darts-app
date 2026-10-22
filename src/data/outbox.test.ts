import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LegSubmission } from './api';

const submitLegs = vi.fn();
vi.mock('./api', () => ({
  submitLegs: (s: LegSubmission) => submitLegs(s),
  submitScore: vi.fn(),
  upsertRegistration: vi.fn(),
  isNetworkError: (e: unknown) => e instanceof Error && /fetch failed/.test(e.message),
}));

const { outbox } = await import('./outbox');

const snapshot = (legs: number, extra: Partial<LegSubmission> = {}): LegSubmission => ({
  eventId: 'e1',
  code: 'P1-R1-1',
  pin: '1234',
  player1: 'a',
  player2: 'b',
  legs: Array.from({ length: legs }, (_, i) => ({ leg_no: i + 1, starter: (i % 2) + 1, scores: [], checkout_darts: null }) as LegSubmission['legs'][number]),
  legs1: legs,
  legs2: 0,
  final: false,
  session: 's1',
  clientId: crypto.randomUUID(),
  board: 1,
  ...extra,
});

describe('outbox: legs van 501 per beurt', () => {
  beforeEach(async () => {
    for (const i of outbox.getSnapshot()) await outbox.dismiss(i.id);
    submitLegs.mockReset();
  });

  it('een nieuwe momentopname vervangt een oudere van dezelfde match en hetzelfde toestel', async () => {
    submitLegs.mockRejectedValue(new Error('fetch failed'));
    await outbox.addLegs(snapshot(1), 'leg 1');
    await outbox.addLegs(snapshot(1, { session: 's2' }), 'ander toestel');
    await outbox.addLegs(snapshot(2), 'leg 2');
    // Leg 1 kan nog in de wachtrij staan als ze net onderweg was toen de verbinding wegviel.
    expect(outbox.getSnapshot().map((i) => i.label).slice(-2)).toEqual(['ander toestel', 'leg 2']);

    submitLegs.mockReset();
    submitLegs.mockResolvedValue({ status: 'ok' });
    const synced: string[] = [];
    const stop = outbox.onSynced((i) => synced.push(i.label));
    // Er kan nog een flush van daarnet bezig zijn: opnieuw tot de wachtrij leeg is.
    await vi.waitFor(async () => {
      await outbox.flush();
      expect(outbox.getSnapshot()).toEqual([]);
    });
    stop();
    expect(synced).toEqual(['ander toestel', 'leg 2']);
    expect(submitLegs).toHaveBeenCalledTimes(2);
  });

  it('een momentopname die al onderweg is, wordt niet vervangen', async () => {
    let release: (v: unknown) => void = () => {};
    submitLegs.mockImplementationOnce(() => new Promise((resolve) => (release = resolve))).mockResolvedValue({ status: 'ok' });
    await outbox.addLegs(snapshot(1), 'leg 1');
    // leg 1 wordt nu verstuurd; leg 2 komt erbij en vervangt leg 1 niet.
    await outbox.addLegs(snapshot(2), 'leg 2');
    expect(outbox.getSnapshot().map((i) => i.label)).toEqual(['leg 1', 'leg 2']);
    release({ status: 'ok' });
    await vi.waitFor(() => expect(outbox.getSnapshot().map((i) => i.label)).toEqual(['leg 2']));
    await outbox.flush();
    expect(outbox.getSnapshot()).toEqual([]);
    expect(submitLegs.mock.calls.map(([s]) => (s as LegSubmission).legs.length)).toEqual([1, 2]);
  });

  it('een geweigerde momentopname blijft staan met de boodschap van de server', async () => {
    submitLegs.mockResolvedValue({ status: 'stale', message: 'De spelers van deze match zijn intussen veranderd.' });
    await outbox.addLegs(snapshot(2, { final: true }), 'slot');
    await vi.waitFor(() => expect(outbox.getSnapshot()[0]?.status).toBe('failed'));
    expect(outbox.getSnapshot()[0].message).toMatch(/veranderd/);
  });
});
