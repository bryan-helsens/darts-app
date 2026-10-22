/** Pushmeldingen: aanzetten per toestel, enkel via de functies, weg bij anonimiseren. */

import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ANON, as, createDb, createUser, rows, rpc, user } from './harness';

let db: PGlite;
let admin: string;
let jan: string;
let piet: string;
let pending: string;

const sub = (endpoint: string, player: string, kinds?: string[]) =>
  as(db, ANON, () =>
    rpc<{ status: string; message?: string }>(db, 'subscribe_push', {
      p_player_id: player,
      p_endpoint: endpoint,
      p_p256dh: 'BKey',
      p_auth: 'auth',
      ...(kinds ? { p_kinds: `{${kinds.join(',')}}` } : {}),
    }),
  );

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  await as(db, user(admin), async () => {
    [{ id: jan }] = await rows<{ id: string }>(db, `insert into players (name) values ('Jan') returning id`);
    [{ id: piet }] = await rows<{ id: string }>(db, `insert into players (name) values ('Piet') returning id`);
    [{ id: pending }] = await rows<{ id: string }>(db, `insert into players (name, pending) values ('Nieuw', true) returning id`);
  });
});

describe('pushmeldingen', () => {
  it('een speler zet meldingen aan op zijn toestel', async () => {
    expect(await sub('https://push.example/a', jan)).toEqual({ status: 'ok' });
    const status = await as(db, ANON, () => rpc<{ player_id: string; kinds: string[] }>(db, 'push_status', { p_endpoint: 'https://push.example/a' }));
    expect(status).toEqual({ player_id: jan, kinds: ['start', 'next', 'scorer', 'reminder'] });
    expect(await as(db, ANON, () => rpc(db, 'push_status', { p_endpoint: 'https://push.example/onbekend' }))).toBeNull();
  });

  it('hetzelfde toestel kan maar voor één speler; soorten zijn te kiezen', async () => {
    expect(await sub('https://push.example/a', piet, ['start', 'reminder'])).toEqual({ status: 'ok' });
    const all = await rows<{ player_id: string; kinds: string[] }>(db, `select player_id, kinds from push_subscriptions`);
    expect(all).toEqual([{ player_id: piet, kinds: ['start', 'reminder'] }]);
  });

  it('weigert onzin', async () => {
    expect((await sub('http://push.example/b', jan)).status).toBe('invalid');
    expect((await sub('https://push.example/b', pending)).status).toBe('invalid');
    expect((await sub('https://push.example/b', jan, ['spam'])).status).toBe('invalid');
    expect((await sub('https://push.example/b', '00000000-0000-4000-8000-000000000000')).status).toBe('invalid');
  });

  it('niemand kan de abonnementen lezen of schrijven via de API', async () => {
    for (const actor of [ANON, user(admin)]) {
      expect(await as(db, actor, () => rows(db, `select * from push_subscriptions`))).toEqual([]);
      expect(await as(db, actor, () => rows(db, `select * from push_sent`))).toEqual([]);
      await expect(
        as(db, actor, () => db.query(`insert into push_subscriptions (player_id, endpoint, p256dh, auth) values ($1, 'https://x/y', 'k', 'a')`, [jan])),
      ).rejects.toThrow();
    }
  });

  it('uitzetten en anonimiseren verwijderen het abonnement', async () => {
    await sub('https://push.example/c', jan);
    await as(db, ANON, () => rpc(db, 'unsubscribe_push', { p_endpoint: 'https://push.example/a' }));
    expect((await rows<{ endpoint: string }>(db, `select endpoint from push_subscriptions`)).map((r) => r.endpoint)).toEqual(['https://push.example/c']);
    await as(db, user(admin), () => rpc(db, 'anonymize_player', { p_player_id: jan }));
    expect(await rows(db, `select * from push_subscriptions`)).toEqual([]);
  });
});
