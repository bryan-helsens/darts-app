import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeasonBackup, type SeasonBackup, type SeasonTables } from '../../src/data/exports';
import type { PlayerContactRow, PlayerRow, SeasonRow } from '../../src/data/rows';
import { buildDemoDataset, demoOptionsForToday } from '../../src/demo/demoData';
import { as, createDb, createUser, rows, rpc, user } from './harness';

const RESTORE = readFileSync(join(import.meta.dirname, '../../supabase/restore-backup.sql'), 'utf8');
const data = buildDemoDataset(demoOptionsForToday('2026-10-20'));

/** Zoals de app de tabellen ophaalt (select *), maar dan rechtstreeks uit de database. */
async function json<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await rows<{ r: T }>(db, `select to_jsonb(t) as r from (${sql}) t`, params)).map((x) => x.r);
}

async function exportSeason(db: PGlite, seasonId: string): Promise<SeasonBackup> {
  const inSeason = `event_id in (select id from events where season_id = $1)`;
  const tables: SeasonTables = {
    events: await json(db, `select * from events where season_id = $1 order by event_date`, [seasonId]),
    registrations: await json(db, `select * from registrations where ${inSeason}`, [seasonId]),
    pools: await json(db, `select * from pools where ${inSeason}`, [seasonId]),
    pool_members: await json(db, `select * from pool_members where ${inSeason}`, [seasonId]),
    matches: await json(db, `select * from matches where ${inSeason} order by id`, [seasonId]),
    match_stats: await json(db, `select * from match_stats where ${inSeason}`, [seasonId]),
    match_legs: await json(db, `select * from match_legs where ${inSeason} order by match_id, leg_no`, [seasonId]),
    event_log: await json(db, `select * from event_log where ${inSeason} order by id`, [seasonId]),
    event_results: await json(db, `select * from event_results where ${inSeason}`, [seasonId]),
  };
  const [season] = await json<SeasonRow>(db, `select * from seasons where id = $1`, [seasonId]);
  return buildSeasonBackup({
    season,
    tables,
    players: await json<PlayerRow>(db, `select * from players`),
    contacts: await json<PlayerContactRow>(db, `select * from player_contacts`),
    exportedAt: '2026-10-21T10:00:00Z',
  });
}

const PLACEHOLDER = '$backup$\nPLAK HIER DE BACK-UP\n$backup$';
const restore = (db: PGlite, backup: unknown) => db.exec(RESTORE.replace(PLACEHOLDER, `$backup$\n${JSON.stringify(backup)}\n$backup$`));

/** Inhoud van een seizoen, vergelijkbaar tussen twee databases. */
async function snapshot(db: PGlite) {
  return {
    seasons: await json(db, `select id, name, settings from seasons order by id`),
    players: await json(db, `select id, name, nickname, active, pending from players order by id`),
    contacts: await json(db, `select player_id, email, phone from player_contacts order by player_id`),
    events: await json(db, `select id, event_date, status, knockout, settings, rng_seed, started_at, finalized_at from events order by id`),
    registrations: await json(db, `select event_id, player_id, preregistered, present, paid, withdrawn_at from registrations order by 1, 2`),
    pools: await json(db, `select * from pools order by 1, 2`),
    members: await json(db, `select * from pool_members order by 1, 3`),
    matches: await json(db, `select id, code, player1_id, player2_id, legs1, legs2, winner_id, walkover, next_code, board, finished_at from matches order by id`),
    stats: await json(db, `select * from match_stats order by 1, 3`),
    legs: await json(db, `select match_id, event_id, leg_no, starter, scores, checkout_darts, winner, darts1, points1, darts2, points2, session_id from match_legs order by 1, 3`),
    // Per avond in de oorspronkelijke volgorde (de id's zelf worden opnieuw uitgedeeld).
    log: await json(db, `select event_id, type, payload, created_at from event_log order by event_id, id`),
    results: await json(db, `select * from event_results order by 1, 2`),
  };
}

let source: PGlite;
let backup: SeasonBackup;

beforeAll(async () => {
  source = await createDb();
  const admin = await createUser(source, 'admin@example.com');
  await as(source, user(admin), () => rpc(source, 'load_demo_data', { p_data: data }));
  // Een speler die niet in het seizoen speelt, hoort niet in de back-up.
  await source.query(`insert into players (name) values ('Buiten het seizoen')`);
  backup = await exportSeason(source, data.seasons[0].id);
}, 60_000);

describe('back-up terugzetten (supabase/restore-backup.sql)', () => {
  it('heeft precies één plek om de back-up te plakken', () => {
    expect(RESTORE.split(PLACEHOLDER)).toHaveLength(2);
  });

  it('bevat het hele seizoen, enkel met de spelers van dat seizoen', () => {
    expect(backup.events).toHaveLength(7);
    expect(backup.matches.length).toBe(data.matches.length);
    expect(backup.players).toHaveLength(25);
    expect(backup.players.some((p) => p.name === 'Buiten het seizoen')).toBe(false);
    expect(backup.player_contacts?.length).toBe(data.player_contacts.length);
    expect(backup.match_legs.length).toBe(data.match_legs.length);
    expect(backup.match_legs.length).toBeGreaterThan(0);
  });

  it('zet alles terug in een lege database, identiek aan het origineel', async () => {
    const target = await createDb();
    await restore(target, backup);
    const original = await snapshot(source);
    const restored = await snapshot(target);
    expect(restored).toEqual({ ...original, players: original.players.filter((p) => (p as { name: string }).name !== 'Buiten het seizoen') });
    const note = await rows<{ action: string; new_data: { events: number } }>(target, `select action, new_data from audit_log`);
    expect(note).toEqual([{ action: 'restore', new_data: { events: 7, exported_at: '2026-10-21T10:00:00Z' } }]);
  }, 60_000);

  it('kan veilig opnieuw: bestaande avonden blijven ongemoeid, enkel ontbrekende komen terug', async () => {
    const target = await createDb();
    await restore(target, backup);
    const full = await snapshot(target);
    await restore(target, backup);
    expect(await snapshot(target)).toEqual(full);

    // Eén avond kwijt (bv. per ongeluk verwijderd) → enkel die wordt teruggezet.
    const lost = backup.events[2].id;
    await target.exec(`select set_config('app.skip_audit', 'on', false); delete from events where id = '${lost}'; select set_config('app.skip_audit', '', false);`);
    expect((await snapshot(target)).matches.length).toBeLessThan(full.matches.length);
    await restore(target, backup);
    expect(await snapshot(target)).toEqual(full);
  }, 60_000);

  it('weigert een bestand dat geen back-up is', async () => {
    const target = await createDb();
    await expect(restore(target, { hello: 'world' })).rejects.toThrow(/geen back-up/);
    // De SQL Editor rolt een mislukte transactie zelf terug; hier doen we dat met de hand.
    await target.exec('rollback');
    expect(await rows(target, `select * from seasons`)).toEqual([]);
  }, 60_000);
});
