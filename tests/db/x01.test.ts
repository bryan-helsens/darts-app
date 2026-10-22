/**
 * 501 per beurt via de database: submit_legs (momentopname na elke leg), de
 * controle van elke leg (zelfde regels als de engine), de uitslag en de
 * statistieken bij de laatste leg, en de regel "beurten bestaan enkel als ze
 * bij de uitslag passen".
 */

import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createRng,
  DEFAULT_LEGS,
  legStarter,
  legState,
  legsToWin,
  matchStats,
  minCheckoutDarts,
  other,
  simulateLeg,
  startBracket,
  type Leg,
  type Match,
  type Rng,
  type Slot,
} from '../../src/engine';
import { matchToInsert } from '../../src/data/mappers';
import { ANON, as, createDb, createUser, OWNER, rows, rpc, user, type Actor } from './harness';

const PIN = '9876';
let db: PGlite;
let admin: string;
let leader: string;
let seasonId: string;
let eventId: string;
let matches: Match[];
const rng = createRng('x01-db');

type Result = { status: string; message?: string; legs1?: number; legs2?: number; duplicate?: boolean };
interface LegRow {
  leg_no: number;
  starter: number;
  scores: (number | null)[];
  checkout_darts: number | null;
  winner: number | null;
  darts1: number;
  points1: number;
  darts2: number;
  points2: number;
  session_id: string | null;
  created_at: string;
}

const match = (code: string) => {
  const m = matches.find((x) => x.id === code);
  if (!m) throw new Error(code);
  return m;
};

/** Een volledige match die `winner` wint; de verliezer pakt onderweg een leg mee als dat kan. */
function playMatch(r: Rng, bestOf: number, winner: Slot, first: Slot = 1): Leg[] {
  const need = legsToWin(bestOf);
  const won = [0, 0];
  const legs: Leg[] = [];
  while (won[winner - 1] < need) {
    const loser = other(winner);
    const w = legs.length % 2 === 1 && won[loser - 1] < need - 1 ? loser : winner;
    legs.push(simulateLeg(r, legStarter(first, legs.length), w));
    won[w - 1]++;
  }
  return legs;
}

const toJson = (legs: readonly Leg[]) =>
  legs.map((l, i) => ({ leg_no: i + 1, starter: l.starter, scores: l.visits.map((v) => (v.bust ? null : v.score)), checkout_darts: l.checkoutDarts }));

async function submitLegs(
  code: string,
  legs: unknown[],
  opts: { final?: boolean; session?: string | null; clientId?: string; actor?: Actor; pin?: string; players?: [string | null, string | null]; event?: string } = {},
): Promise<Result> {
  const m = match(code);
  return as(db, opts.actor ?? ANON, () =>
    rpc<Result>(db, 'submit_legs', {
      p_event_id: opts.event ?? eventId,
      p_code: code,
      p_pin: opts.pin ?? PIN,
      p_player1: opts.players ? opts.players[0] : m.player1,
      p_player2: opts.players ? opts.players[1] : m.player2,
      p_legs: legs,
      p_final: opts.final ?? false,
      p_session: opts.session ?? null,
      p_client_id: opts.clientId ?? null,
      p_board: null,
    }),
  );
}

const legRows = (code: string) =>
  rows<LegRow>(db, `select l.* from match_legs l join matches m on m.id = l.match_id where m.event_id = $1 and m.code = $2 order by leg_no`, [eventId, code]);
const matchRow = async (code: string) =>
  (
    await rows<{ id: string; legs1: number | null; legs2: number | null; winner_id: string | null; next_code: string | null; next_slot: number | null; result_client_id: string | null }>(
      db,
      `select * from matches where event_id = $1 and code = $2`,
      [eventId, code],
    )
  )[0];
const statRows = (code: string) =>
  rows<{ player_id: string; count_180: number; highest_finish: number | null; highest_score: number | null; darts: number | null; points: number | null }>(
    db,
    `select s.* from match_stats s join matches m on m.id = s.match_id where m.event_id = $1 and m.code = $2`,
    [eventId, code],
  );

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  leader = await createUser(db, 'leider@example.com');
  await as(db, user(admin), () => rpc(db, 'set_user_role', { p_user_id: leader, p_role: 'leider' }));
  await as(db, user(admin), async () => {
    const [season] = await rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2027', '2027-01-01', '2027-12-31') returning id`);
    seasonId = season.id;
    const [event] = await rows<{ id: string }>(db, `insert into events (season_id, event_date, boards) values ($1, '2027-03-20', 4) returning id`, [seasonId]);
    eventId = event.id;
    await db.query(`insert into event_secrets (event_id, scorer_pin) values ($1, $2)`, [eventId, PIN]);
    const ids: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const [p] = await rows<{ id: string }>(db, `insert into players (name) values ($1) returning id`, [`Beurt ${i}`]);
      ids.push(p.id);
      await db.query(`insert into registrations (event_id, player_id, present, paid) values ($1, $2, true, true)`, [eventId, p.id]);
    }
    const built = startBracket({ format: 'double_elim', players: ids.map((id) => ({ id })), legs: DEFAULT_LEGS, rng: createRng(eventId), createdAt: Date.now() });
    matches = built.matches;
    await as(db, user(leader), () =>
      rpc(db, 'start_tournament', {
        p_event_id: eventId,
        p_pools: [],
        p_matches: built.matches.map(matchToInsert),
        p_config: { format: 'double_elim', seeds: built.seeds, legs: DEFAULT_LEGS },
      }),
    );
  });
}, 60_000);

describe('controle van een leg', () => {
  it('minimaal aantal darts voor een uitgooi: database = engine', async () => {
    const res = await rows<{ n: number; d: number | null }>(db, `select n, private.checkout_min_darts(n) as d from generate_series(0, 180) n`);
    for (const { n, d } of res) expect(d, `${n}`).toBe(minCheckoutDarts(n));
  });

  it('de trigger rekent winnaar, darts en punten uit zoals de engine', async () => {
    const m = match('W-R1-4');
    const legs = playMatch(rng, m.bestOf, 1);
    const id = (await matchRow(m.id)).id;
    await as(db, user(leader), async () => {
      for (const [i, leg] of toJson(legs).entries()) {
        const [row] = await rows<LegRow>(
          db,
          `insert into match_legs (match_id, event_id, leg_no, starter, scores, checkout_darts) values ($1, $2, $3, $4, $5, $6) returning *`,
          [id, eventId, leg.leg_no, leg.starter, leg.scores, leg.checkout_darts],
        );
        const state = legState(legs[i]);
        expect(row).toMatchObject({ winner: state.winner, darts1: state.darts[0], points1: state.points[0], darts2: state.darts[1], points2: state.points[1] });
      }
      await db.query(`delete from match_legs where match_id = $1`, [id]);
    });
  });

  it('weigert ongeldige legs, ook bij rechtstreeks schrijven', async () => {
    const id = (await matchRow('W-R1-4')).id;
    const insert = (scores: (number | null)[], checkout: number | null) =>
      as(db, user(leader), () =>
        db.query(`insert into match_legs (match_id, event_id, leg_no, starter, scores, checkout_darts) values ($1, $2, 1, 1, $3, $4)`, [id, eventId, scores, checkout]),
      );
    await expect(insert([179], null)).rejects.toThrow(/179/);
    await expect(insert([181], null)).rejects.toThrow(/181/);
    await expect(insert([null], null)).rejects.toThrow(/181 of minder/);
    // Speler 1: 180, 180, 140 → rest 1 is een bust.
    await expect(insert([180, 0, 180, 0, 140], null)).rejects.toThrow(/bust/);
    // 141 uitgooien kan niet met 2 darts; zonder darts ook niet.
    await expect(insert([180, 0, 180, 0, 141], 2)).rejects.toThrow(/uitgooien/);
    await expect(insert([180, 0, 180, 0, 141], null)).rejects.toThrow(/uitgooien/);
    await expect(insert([180, 0, 180, 0, 141, 0], 3)).rejects.toThrow(/al uitgespeeld/);
    await expect(insert([60], 2)).rejects.toThrow(/Uitgooi zonder/);
    expect(await legRows('W-R1-4')).toEqual([]);
  });
});

describe('rechten', () => {
  it('iedereen leest beurten, enkel staff schrijft rechtstreeks', async () => {
    const id = (await matchRow('W-R1-4')).id;
    await expect(
      as(db, ANON, () => db.query(`insert into match_legs (match_id, event_id, leg_no, starter, scores) values ($1, $2, 1, 1, '{60}')`, [id, eventId])),
    ).rejects.toThrow();
    await as(db, user(leader), () => db.query(`insert into match_legs (match_id, event_id, leg_no, starter, scores) values ($1, $2, 1, 1, '{60}')`, [id, eventId]));
    expect(await as(db, ANON, () => rows(db, `select * from match_legs where match_id = $1`, [id]))).toHaveLength(1);
    await as(db, ANON, () => db.query(`delete from match_legs where match_id = $1`, [id]));
    expect(await legRows('W-R1-4')).toHaveLength(1);
    // "Lopende beurten wissen" door de leider.
    await as(db, user(leader), () => db.query(`delete from match_legs where match_id = $1`, [id]));
    expect(await legRows('W-R1-4')).toEqual([]);
  });

  it('foute pincode en rem, gedeeld met submit_score', async () => {
    const legs = toJson([simulateLeg(rng, 1, 1)]);
    expect(await submitLegs('W-R1-1', legs, { pin: '0000' })).toMatchObject({ status: 'bad_pin' });
    await as(db, OWNER, () => db.query(`insert into pin_failures (event_id) select $1 from generate_series(1, 19)`, [eventId]));
    expect(await submitLegs('W-R1-1', legs)).toMatchObject({ status: 'locked' });
    const quick = await as(db, ANON, () =>
      rpc<Result>(db, 'submit_score', { p_event_id: eventId, p_code: 'W-R1-1', p_pin: PIN, p_legs1: 2, p_legs2: 0, p_stats: [] }),
    );
    expect(quick).toMatchObject({ status: 'locked' });
    // De leider heeft geen pincode nodig.
    expect(await submitLegs('W-R1-1', legs, { actor: user(leader), pin: '' })).toMatchObject({ status: 'ok' });
    await as(db, OWNER, () => db.exec(`delete from pin_failures; delete from match_legs;`));
  });

  it('enkel als de avond bezig is', async () => {
    const [planned] = await as(db, user(admin), () =>
      rows<{ id: string }>(db, `insert into events (season_id, event_date) values ($1, '2027-04-17') returning id`, [seasonId]),
    );
    await as(db, user(admin), () => db.query(`insert into event_secrets (event_id, scorer_pin) values ($1, $2)`, [planned.id, PIN]));
    expect(await submitLegs('W-R1-1', toJson([simulateLeg(rng, 1, 1)]), { event: planned.id })).toMatchObject({ status: 'closed' });
  });
});

describe('legs doorsturen', () => {
  const session = randomUUID();
  let legs: Leg[];

  it('een tussenleg: legstand zonder uitslag', async () => {
    const m = match('W-R1-1');
    legs = playMatch(rng, m.bestOf, 2);
    expect(legs.length).toBeGreaterThan(legsToWin(m.bestOf));
    const res = await submitLegs(m.id, toJson(legs.slice(0, 1)), { session });
    const won = legState(legs[0]).winner;
    expect(res).toEqual({ status: 'ok', legs1: won === 1 ? 1 : 0, legs2: won === 2 ? 1 : 0 });
    const row = await matchRow(m.id);
    expect(row).toMatchObject({ legs1: null, legs2: null, winner_id: null });
    const [leg] = await legRows(m.id);
    expect(leg).toMatchObject({ leg_no: 1, starter: legs[0].starter, winner: won, session_id: session });
    expect(leg.scores).toEqual(toJson(legs)[0].scores);
  });

  it('dezelfde momentopname opnieuw: niets verandert', async () => {
    const before = await legRows('W-R1-1');
    expect(await submitLegs('W-R1-1', toJson(legs.slice(0, 1)), { session })).toMatchObject({ status: 'ok' });
    expect(await legRows('W-R1-1')).toEqual(before);
  });

  it('een ander toestel krijgt een conflict; de leider mag overnemen', async () => {
    const res = await submitLegs('W-R1-1', toJson(legs.slice(0, 1)), { session: randomUUID() });
    expect(res).toMatchObject({ status: 'conflict' });
    expect(res.message).toMatch(/ander toestel/);
    const takeover = randomUUID();
    expect(await submitLegs('W-R1-1', toJson(legs.slice(0, 1)), { session: takeover, actor: user(leader) })).toMatchObject({ status: 'ok' });
    // Ongewijzigde legs houden hun sessie; pas een gewijzigde leg krijgt de nieuwe.
    expect((await legRows('W-R1-1'))[0].session_id).toBe(session);
  });

  it('gewijzigde spelers: stale', async () => {
    const m = match('W-R1-1');
    expect(await submitLegs(m.id, toJson(legs.slice(0, 1)), { session, players: [m.player2, m.player1] })).toMatchObject({ status: 'stale' });
  });

  it('weigert ongeldige momentopnames zonder iets te bewaren', async () => {
    const before = await legRows('W-R1-1');
    const json = toJson(legs);
    const bad = async (snapshot: unknown[], pattern: RegExp, final = false) => {
      const res = await submitLegs('W-R1-1', snapshot, { session, final });
      expect(res.status).toBe('error');
      expect(res.message).toMatch(pattern);
    };
    await bad([], /geen legs/);
    await bad([{ ...json[0], leg_no: 2 }], /genummerd/);
    await bad([json[0], { ...json[1], starter: json[0].starter }], /wisselen/);
    await bad([json[0], { ...json[1], scores: json[1].scores.slice(0, -1), checkout_darts: null }], /nog niet uitgespeeld/);
    await bad([json[0], { ...json[1], scores: [...json[1].scores.slice(0, -1), 179] }], /179/);
    await bad([...json, { ...json[0], leg_no: json.length + 1, starter: other(json[json.length - 1].starter as Slot) }], /al beslist/);
    await bad(json.slice(0, 2), /nog niet beslist/, true);
    expect(await legRows('W-R1-1')).toEqual(before);
    expect((await matchRow('W-R1-1')).winner_id).toBeNull();
  });

  it('de laatste leg zet de uitslag, schuift door en bewaart de statistieken', async () => {
    const m = match('W-R1-1');
    const clientId = randomUUID();
    const res = await submitLegs(m.id, toJson(legs), { session, final: true, clientId });
    const need = legsToWin(m.bestOf);
    expect(res).toEqual({ status: 'ok', legs1: legs.length - need, legs2: need });
    const row = await matchRow(m.id);
    expect(row).toMatchObject({ legs1: legs.length - need, legs2: need, winner_id: m.player2, result_client_id: clientId });
    const next = await rows<{ player1_id: string | null; player2_id: string | null }>(db, `select * from matches where event_id = $1 and code = $2`, [
      eventId,
      row.next_code,
    ]);
    expect(row.next_slot === 1 ? next[0].player1_id : next[0].player2_id).toBe(m.player2);
    expect(await legRows(m.id)).toHaveLength(legs.length);

    const stats = await statRows(m.id);
    const expected = matchStats(legs);
    for (const [k, p] of [m.player1, m.player2].entries()) {
      const s = stats.find((x) => x.player_id === p);
      expect(s, `speler ${k + 1}`).toEqual({
        ...s,
        darts: expected[k].darts,
        points: expected[k].points,
        count_180: expected[k].count180,
        highest_score: expected[k].highestScore,
        highest_finish: expected[k].highestFinish,
      });
    }

    // Opnieuw verstuurd (verbinding viel weg): dubbel; zonder client-id: conflict.
    expect(await submitLegs(m.id, toJson(legs), { session, final: true, clientId })).toMatchObject({ status: 'ok', duplicate: true });
    expect(await submitLegs(m.id, toJson(legs), { session, final: true })).toMatchObject({ status: 'conflict' });
  });
});

describe('beurten bestaan enkel als ze bij de uitslag passen', () => {
  it('een correctie door de leider wist de beurten, de 180\'s blijven', async () => {
    const m = match('W-R1-3');
    const legs = playMatch(rng, m.bestOf, 1);
    expect(await submitLegs(m.id, toJson(legs), { final: true })).toMatchObject({ status: 'ok' });
    const before = await statRows(m.id);
    expect(before.every((s) => s.darts !== null)).toBe(true);

    const need = legsToWin(m.bestOf);
    expect(need).toBeGreaterThan(1);
    // Zelfde winnaar, andere legstand.
    const corrected = await as(db, user(leader), () =>
      rpc<Result>(db, 'submit_score', { p_event_id: eventId, p_code: m.id, p_pin: '', p_legs1: need, p_legs2: legs.length === need ? 1 : 0, p_stats: [] }),
    );
    expect(corrected).toMatchObject({ status: 'ok' });
    expect(await legRows(m.id)).toEqual([]);
    const after = await statRows(m.id);
    expect(after.map((s) => [s.darts, s.points])).toEqual(after.map(() => [null, null]));
    expect(after.map((s) => s.count_180).sort()).toEqual(before.map((s) => s.count_180).sort());
  });

  it('snel invoeren op een ander toestel wist de lopende beurten', async () => {
    const m = match('W-R1-2');
    const legs = playMatch(rng, m.bestOf, 1);
    const session = randomUUID();
    expect(await submitLegs(m.id, toJson(legs.slice(0, 1)), { session })).toMatchObject({ status: 'ok' });
    const need = legsToWin(m.bestOf);
    const quick = await as(db, ANON, () =>
      rpc<Result>(db, 'submit_score', { p_event_id: eventId, p_code: m.id, p_pin: PIN, p_legs1: need, p_legs2: 0, p_stats: [] }),
    );
    expect(quick).toMatchObject({ status: 'ok' });
    expect(await legRows(m.id)).toEqual([]);
    expect(await submitLegs(m.id, toJson(legs), { session, final: true })).toMatchObject({ status: 'conflict' });
  });

  it('een opgave (walk-over) wist de lopende beurten', async () => {
    const m = match('W-R1-4');
    const session = randomUUID();
    expect(await submitLegs(m.id, toJson([simulateLeg(rng, 1, 2)]), { session })).toMatchObject({ status: 'ok' });
    await as(db, user(leader), () => rpc(db, 'withdraw_player', { p_event_id: eventId, p_player_id: m.player1 }));
    expect(await matchRow(m.id)).toMatchObject({ winner_id: m.player2 });
    expect(await legRows(m.id)).toEqual([]);
  });

  it('samenvoegen van spelers laat de beurten staan', async () => {
    const m = match('W-R1-1');
    const [fresh] = await as(db, user(admin), () => rows<{ id: string }>(db, `insert into players (name) values ('Beurt dubbel') returning id`));
    // fresh blijft, de speler van de avond verdwijnt erin.
    await as(db, user(admin), () => rpc(db, 'merge_players', { p_keep: fresh.id, p_remove: m.player1 }));
    expect(await rows(db, `select 1 from matches where event_id = $1 and code = $2 and player1_id = $3`, [eventId, m.id, fresh.id])).toHaveLength(1);
    expect((await legRows(m.id)).length).toBeGreaterThan(0);
  });

  it('het toernooi terugzetten verwijdert ook de beurten', async () => {
    expect((await rows(db, `select 1 from match_legs where event_id = $1`, [eventId])).length).toBeGreaterThan(0);
    await as(db, user(leader), () => rpc(db, 'reset_tournament', { p_event_id: eventId }));
    expect(await rows(db, `select 1 from match_legs where event_id = $1`, [eventId])).toEqual([]);
  });
});
