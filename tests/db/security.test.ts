import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ANON, as, createDb, createUser, rows, rpc, user } from './harness';

let db: PGlite;
let admin: string;
let leader: string;
let applicant: string;
let eventId: string;
let playerId: string;

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  leader = await createUser(db, 'leider@example.com');
  applicant = await createUser(db, 'nieuw@example.com');
  await as(db, user(admin), () => rpc(db, 'set_user_role', { p_user_id: leader, p_role: 'leider' }));
  await as(db, user(admin), async () => {
    const [season] = await rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2027', '2027-01-01', '2027-12-31') returning id`);
    const [event] = await rows<{ id: string }>(db, `insert into events (season_id, event_date) values ($1, '2027-01-16') returning id`, [season.id]);
    eventId = event.id;
    await db.query(`insert into event_secrets (event_id, scorer_pin) values ($1, '4321')`, [eventId]);
    const [p] = await rows<{ id: string }>(db, `insert into players (name) values ('Jan Peeters') returning id`);
    playerId = p.id;
    await db.query(`insert into player_contacts (player_id, email, phone) values ($1, 'jan@example.com', '0470 00 00 00')`, [playerId]);
    await db.query(`insert into registrations (event_id, player_id, present, paid) values ($1, $2, true, true)`, [eventId, playerId]);
  });
});

describe('rollen', () => {
  it('maakt het eerste account admin en de volgende een aanvraag', async () => {
    const profiles = await rows<{ email: string; role: string }>(db, `select email, role from profiles order by created_at, email`);
    expect(profiles.find((p) => p.email === 'admin@example.com')?.role).toBe('admin');
    expect(profiles.find((p) => p.email === 'nieuw@example.com')?.role).toBe('aanvraag');
    expect(profiles.find((p) => p.email === 'leider@example.com')?.role).toBe('leider');
  });

  it('laat enkel admins rollen wijzigen', async () => {
    await expect(as(db, user(leader), () => rpc(db, 'set_user_role', { p_user_id: applicant, p_role: 'admin' }))).rejects.toThrow(/beheerders/);
    await expect(as(db, user(admin), () => rpc(db, 'set_user_role', { p_user_id: admin, p_role: 'leider' }))).rejects.toThrow(/minstens één admin/);
  });

  it('toont gebruikers enkel hun eigen profiel, admins alles', async () => {
    const own = await as(db, user(leader), () => rows(db, `select * from profiles`));
    expect(own).toHaveLength(1);
    const all = await as(db, user(admin), () => rows(db, `select * from profiles`));
    expect(all).toHaveLength(3);
  });
});

describe('publieke toegang', () => {
  it('kan spelers, avonden en uitslagen lezen', async () => {
    const players = await as(db, ANON, () => rows<{ name: string }>(db, `select name from players`));
    expect(players.map((p) => p.name)).toEqual(['Jan Peeters']);
    expect(await as(db, ANON, () => rows(db, `select id from events`))).toHaveLength(1);
    const counts = await as(db, ANON, () => rows<{ present: number }>(db, `select present from event_registration_counts`));
    expect(Number(counts[0].present)).toBe(1);
  });

  it('ziet geen contactgegevens, inschrijvingen, pincodes of audit-log', async () => {
    for (const table of ['player_contacts', 'registrations', 'event_secrets', 'audit_log', 'pin_failures']) {
      const result = await as(db, ANON, () => rows(db, `select * from ${table}`));
      expect(result, table).toEqual([]);
    }
  });

  it('kan niets wijzigen', async () => {
    await expect(as(db, ANON, () => db.query(`insert into players (name) values ('Hacker')`))).rejects.toThrow();
    await as(db, ANON, () => db.query(`update players set name = 'X'`));
    expect((await rows<{ name: string }>(db, `select name from players`))[0].name).toBe('Jan Peeters');
    await expect(as(db, ANON, () => rpc(db, 'withdraw_player', { p_event_id: eventId, p_player_id: playerId }))).rejects.toThrow(/wedstrijdleiders/);
  });

  it('kan de interne functies niet aanroepen', async () => {
    await expect(as(db, ANON, () => db.query(`select private.place_player(null, null, null, null, null)`))).rejects.toThrow();
  });
});

describe('staff', () => {
  it('laat een wedstrijdleider spelers en contactgegevens beheren', async () => {
    await as(db, user(leader), async () => {
      const [p] = await rows<{ id: string }>(db, `insert into players (name) values ('Piet Janssens') returning id`);
      await db.query(`insert into player_contacts (player_id, phone) values ($1, '0471 11 11 11')`, [p.id]);
      expect(await rows(db, `select * from player_contacts`)).toHaveLength(2);
    });
  });

  it('laat een aanvraag niets doen', async () => {
    await expect(as(db, user(applicant), () => db.query(`insert into players (name) values ('X')`))).rejects.toThrow();
    expect(await as(db, user(applicant), () => rows(db, `select * from player_contacts`))).toEqual([]);
  });

  it('laat enkel admins seizoenen en avonden aanmaken', async () => {
    await expect(
      as(db, user(leader), () => db.query(`insert into seasons (name, starts_on, ends_on) values ('x', '2028-01-01', '2028-12-31')`)),
    ).rejects.toThrow();
  });

  it('houdt een audit-log bij die enkel admins kunnen lezen', async () => {
    await as(db, user(leader), () => db.query(`update registrations set paid = false where player_id = $1`, [playerId]));
    expect(await as(db, user(leader), () => rows(db, `select * from audit_log`))).toEqual([]);
    const log = await as(db, user(admin), () =>
      rows<{ action: string; changed_by: string }>(db, `select action, changed_by from audit_log where table_name = 'registrations' order by id`),
    );
    expect(log.at(-1)).toEqual({ action: 'update', changed_by: leader });
  });
});

describe('score-pin', () => {
  it('blokkeert na te veel foute pogingen', async () => {
    expect(await as(db, ANON, () => rpc(db, 'check_scorer_pin', { p_event_id: eventId, p_pin: '4321' }))).toBe(true);
    for (let i = 0; i < 20; i++) {
      await as(db, ANON, () => rpc(db, 'check_scorer_pin', { p_event_id: eventId, p_pin: '0000' }));
    }
    expect(await as(db, ANON, () => rpc(db, 'check_scorer_pin', { p_event_id: eventId, p_pin: '4321' }))).toBe(false);
    const res = await as(db, ANON, () =>
      rpc<{ status: string }>(db, 'submit_score', { p_event_id: eventId, p_code: 'x', p_pin: '4321', p_legs1: 2, p_legs2: 0 }),
    );
    expect(res.status).toBe('locked');
  });
});

describe('GDPR', () => {
  it('anonimiseert een speler en wist de oude gegevens uit de audit-log', async () => {
    await as(db, user(admin), () => rpc(db, 'anonymize_player', { p_player_id: playerId }));
    const [p] = await rows<{ name: string; anonymized_at: string | null }>(db, `select name, anonymized_at from players where id = $1`, [playerId]);
    expect(p.name).toBe('Anonieme speler');
    expect(p.anonymized_at).not.toBeNull();
    expect(await rows(db, `select * from player_contacts where player_id = $1`, [playerId])).toEqual([]);
    const audit = await rows<{ data: string }>(db, `select coalesce(old_data::text, '') || coalesce(new_data::text, '') as data from audit_log`);
    expect(audit.some((a) => a.data.includes('Jan Peeters') || a.data.includes('jan@example.com'))).toBe(false);
    // De inschrijving (en dus de uitslagen) blijven bestaan.
    expect(await rows(db, `select * from registrations where player_id = $1`, [playerId])).toHaveLength(1);
  });
});

describe('setup.sql', () => {
  it('is up-to-date met de migraties', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { bundleMigrations } = await import('../../scripts/bundle-migrations');
    expect(readFileSync(join(import.meta.dirname, '../../supabase/setup.sql'), 'utf8')).toBe(bundleMigrations());
  });
});
