import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDemoDataset, demoOptionsForToday, previousThirdSaturdays } from '../../src/demo/demoData';
import { as, createDb, createUser, rows, rpc, user } from './harness';

let db: PGlite;
let admin: string;
let leader: string;
const data = buildDemoDataset(demoOptionsForToday('2026-10-20'));

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  leader = await createUser(db, 'leider@example.com');
  await as(db, user(admin), () => rpc(db, 'set_user_role', { p_user_id: leader, p_role: 'leider' }));
  await as(db, user(admin), () => db.query(`insert into players (name) values ('Echte Speler')`));
});

describe('demo-data vanuit de app', () => {
  it('kiest de 6 vorige speelavonden en een oefenavond vandaag', () => {
    expect(previousThirdSaturdays('2026-10-20')).toEqual(['2026-05-16', '2026-06-20', '2026-07-18', '2026-08-15', '2026-09-19', '2026-10-17']);
    expect(previousThirdSaturdays('2027-01-16')).toEqual(['2026-07-18', '2026-08-15', '2026-09-19', '2026-10-17', '2026-11-21', '2026-12-19']);
    expect(data.events.map((e) => e.status)).toEqual([...Array(6).fill('afgelopen'), 'gepland']);
    expect(data.events.at(-1)?.event_date).toBe('2026-10-20');
  });

  it('mag enkel door een admin geladen worden', async () => {
    await expect(as(db, user(leader), () => rpc(db, 'load_demo_data', { p_data: data }))).rejects.toThrow(/beheerders/);
  });

  it('laadt alles in één keer en weigert een tweede keer', async () => {
    const auditBefore = (await rows(db, `select * from audit_log`)).length;
    await as(db, user(admin), () => rpc(db, 'load_demo_data', { p_data: data }));
    expect(await rows(db, `select * from players where id::text like 'de000000-%'`)).toHaveLength(25);
    expect(await rows(db, `select * from events`)).toHaveLength(7);
    expect((await rows(db, `select * from matches`)).length).toBe(data.matches.length);
    expect((await rows(db, `select * from event_results`)).length).toBe(data.event_results.length);
    expect(await as(db, user(admin), () => rpc(db, 'has_demo_data', {}))).toBe(true);
    // De database leidt de winnaars af uit de legs.
    const winners = await rows<{ n: number }>(db, `select count(*)::int as n from matches where winner_id is null`);
    expect(winners[0].n).toBe(0);
    // Geen audit-sporen per rij, enkel één notitie.
    expect((await rows(db, `select * from audit_log`)).length).toBe(auditBefore + 1);
    await expect(as(db, user(admin), () => rpc(db, 'load_demo_data', { p_data: data }))).rejects.toThrow(/al geladen/);
  });

  it('aanvaardt geen rijen zonder demo-id', async () => {
    await as(db, user(admin), () => rpc(db, 'remove_demo_data', {}));
    const sneaky = { ...data, players: [...data.players, { id: '11111111-1111-4111-8111-111111111111', name: 'Geen demo', nickname: null, created_at: data.players[0].created_at }] };
    await as(db, user(admin), () => rpc(db, 'load_demo_data', { p_data: sneaky }));
    expect(await rows(db, `select * from players where name = 'Geen demo'`)).toEqual([]);
  });

  it('verwijdert enkel de demo-data', async () => {
    await as(db, user(admin), () => rpc(db, 'remove_demo_data', {}));
    expect(await rows(db, `select * from events`)).toEqual([]);
    expect(await rows(db, `select * from seasons`)).toEqual([]);
    expect((await rows<{ name: string }>(db, `select name from players`)).map((p) => p.name)).toEqual(['Echte Speler']);
    expect(await as(db, user(admin), () => rpc(db, 'has_demo_data', {}))).toBe(false);
  });
});
