/** Masters: soort avond, hoogstens één per seizoen, geen online inschrijving. */

import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ANON, as, createDb, createUser, rows, rpc, user } from './harness';

let db: PGlite;
let admin: string;
let seasonId: string;
let otherSeasonId: string;
let playerId: string;

const event = (season: string, date: string, kind?: string) =>
  as(db, user(admin), async () => {
    const [e] = kind
      ? await rows<{ id: string; kind: string }>(db, `insert into events (season_id, event_date, kind) values ($1, $2, $3) returning id, kind`, [season, date, kind])
      : await rows<{ id: string; kind: string }>(db, `insert into events (season_id, event_date) values ($1, $2) returning id, kind`, [season, date]);
    return e;
  });

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  await as(db, user(admin), async () => {
    [{ id: seasonId }] = await rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2099', '2099-01-01', '2099-12-31') returning id`);
    [{ id: otherSeasonId }] = await rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2100', '2100-01-01', '2100-12-31') returning id`);
    [{ id: playerId }] = await rows<{ id: string }>(db, `insert into players (name) values ('Jan Peeters') returning id`);
  });
});

describe('Masters', () => {
  it('bestaande en nieuwe avonden zijn standaard regulier; een onbekende soort wordt geweigerd', async () => {
    expect((await event(seasonId, '2099-01-17')).kind).toBe('regulier');
    await expect(event(seasonId, '2099-02-21', 'finale')).rejects.toThrow(/events_kind_check/);
  });

  it('hoogstens één Masters per seizoen', async () => {
    expect((await event(seasonId, '2099-12-18', 'masters')).kind).toBe('masters');
    await expect(event(seasonId, '2099-12-19', 'masters')).rejects.toThrow(/events_one_masters_per_season/);
    expect((await event(otherSeasonId, '2100-12-17', 'masters')).kind).toBe('masters');
  });

  it('online inschrijven kan niet voor een Masters', async () => {
    const [masters] = await rows<{ id: string }>(db, `select id from events where season_id = $1 and kind = 'masters'`, [seasonId]);
    const res = await as(db, ANON, () => rpc<{ status: string; message?: string }>(db, 'preregister', { p_event_id: masters.id, p_player_id: playerId }));
    expect(res.status).toBe('closed');
    expect(res.message).toMatch(/top van de seizoensranking/);
    expect(await rows(db, `select * from registrations where event_id = $1`, [masters.id])).toEqual([]);
    // Een gewone avond blijft open.
    const regular = await event(seasonId, '2099-03-21');
    expect((await as(db, ANON, () => rpc<{ status: string }>(db, 'preregister', { p_event_id: regular.id, p_player_id: playerId }))).status).toBe('ok');
  });
});
