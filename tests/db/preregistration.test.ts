import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { ANON, as, createDb, createUser, rows, rpc, user } from './harness';

type Result = { status: string; player_id?: string; message?: string };

let db: PGlite;
let admin: string;
let seasonId: string;
let eventId: string;
let janId: string;

const preregister = (args: Record<string, unknown>) => as(db, ANON, () => rpc<Result>(db, 'preregister', args));

async function newEvent(date: string, status = 'gepland'): Promise<string> {
  const [e] = await as(db, user(admin), () =>
    rows<{ id: string }>(db, `insert into events (season_id, event_date, status) values ($1, $2, $3) returning id`, [seasonId, date, status]),
  );
  return e.id;
}

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  await as(db, user(admin), async () => {
    const [season] = await rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2099', '2099-01-01', '2099-12-31') returning id`);
    seasonId = season.id;
    const [jan] = await rows<{ id: string }>(db, `insert into players (name) values ('Jan Peeters') returning id`);
    janId = jan.id;
  });
  eventId = await newEvent('2099-01-17');
});

describe('online inschrijven', () => {
  it('schrijft een bestaande speler in, zonder account', async () => {
    const res = await preregister({ p_event_id: eventId, p_player_id: janId });
    expect(res).toEqual({ status: 'ok', player_id: janId });
    const regs = await rows<{ preregistered: boolean; present: boolean }>(db, `select preregistered, present from registrations where event_id = $1 and player_id = $2`, [eventId, janId]);
    expect(regs).toEqual([{ preregistered: true, present: false }]);
    expect((await preregister({ p_event_id: eventId, p_player_id: janId })).status).toBe('already');
  });

  it('maakt een nieuwe speler aan die publiek onzichtbaar blijft tot de check-in', async () => {
    const res = await preregister({ p_event_id: eventId, p_name: '  Eva   Fierens ', p_email: 'Eva@Example.com', p_phone: '0470 12 34 56' });
    expect(res.status).toBe('ok');
    const id = res.player_id as string;

    const [player] = await rows<{ name: string; pending: boolean }>(db, `select name, pending from players where id = $1`, [id]);
    expect(player).toEqual({ name: 'Eva Fierens', pending: true });
    const [contact] = await rows<{ email: string; phone: string }>(db, `select email, phone from player_contacts where player_id = $1`, [id]);
    expect(contact).toEqual({ email: 'eva@example.com', phone: '0470 12 34 56' });

    // Publiek ziet de nieuwe naam niet, staff wel.
    expect(await as(db, ANON, () => rows(db, `select id from players where id = $1`, [id]))).toHaveLength(0);
    expect(await as(db, user(admin), () => rows(db, `select id from players where id = $1`, [id]))).toHaveLength(1);

    // Dezelfde naam nog eens: geen dubbele speler.
    expect(await preregister({ p_event_id: eventId, p_name: 'eva fierens' })).toEqual({ status: 'already', player_id: id });

    // Aanwezig zetten bij de check-in bevestigt de speler.
    await as(db, user(admin), () => db.query(`update registrations set present = true where event_id = $1 and player_id = $2`, [eventId, id]));
    expect(await as(db, ANON, () => rows(db, `select id from players where id = $1`, [id]))).toHaveLength(1);
  });

  it('weigert ongeldige invoer', async () => {
    expect((await preregister({ p_event_id: eventId, p_name: 'x' })).status).toBe('invalid');
    expect((await preregister({ p_event_id: eventId, p_name: 'Geldige Naam', p_email: 'geen-mail' })).status).toBe('invalid');
    expect((await preregister({ p_event_id: eventId, p_name: 'Geldige Naam', p_phone: 'bel me' })).status).toBe('invalid');
    expect((await preregister({ p_event_id: eventId, p_player_id: '00000000-0000-4000-8000-000000000000' })).status).toBe('invalid');
    expect((await preregister({ p_event_id: '00000000-0000-4000-8000-000000000000', p_player_id: janId })).status).toBe('invalid');
  });

  it('is gesloten voor een avond die voorbij of al gestart is', async () => {
    const past = await newEvent('2020-01-18');
    expect((await preregister({ p_event_id: past, p_player_id: janId })).status).toBe('closed');
    const started = await newEvent('2099-02-21', 'bezig');
    expect((await preregister({ p_event_id: started, p_player_id: janId })).status).toBe('closed');
  });

  it('remt na te veel pogingen per avond', async () => {
    const event = await newEvent('2099-03-21');
    for (let i = 0; i < 40; i++) await preregister({ p_event_id: event, p_name: 'x' });
    expect((await preregister({ p_event_id: event, p_player_id: janId })).status).toBe('locked');
    expect(await rows(db, `select 1 from registrations where event_id = $1`, [event])).toHaveLength(0);
  });

  it('laat anon de pogingen niet lezen en geen inschrijvingen rechtstreeks schrijven', async () => {
    await expect(as(db, ANON, () => rows(db, `select * from registration_attempts`))).resolves.toHaveLength(0);
    await expect(
      as(db, ANON, () => db.query(`insert into registrations (event_id, player_id, preregistered) values ($1, $2, true)`, [eventId, janId])),
    ).rejects.toThrow();
  });

  it('houdt de inschrijving bij in de audit-log', async () => {
    const log = await rows<{ changed_by_label: string | null }>(
      db,
      `select changed_by_label from audit_log where table_name = 'registrations' and row_key like $1 order by id`,
      [`${eventId}:%`],
    );
    expect(log[0]?.changed_by_label).toBe('online-inschrijving');
  });
});
