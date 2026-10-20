/**
 * Een volledige speelavond via de database: de engine genereert, de database
 * bewaakt scores, doorschuiven en walk-overs. Na elke stap moet de toestand in
 * de database exact overeenkomen met wat de engine zelf berekent.
 */

import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyResult,
  autoWalkovers,
  createBarrageMatches,
  createRng,
  DEFAULT_LEGS,
  DEFAULT_POINTS,
  eventPlacements,
  eventPoints,
  generateKnockouts,
  isFinished,
  legsToWin,
  poolPhaseStatus,
  startPools,
  type Match,
  type Pool,
} from '../../src/engine';
import { acceptedLotsFromRows, matchFromRow, matchToInsert, poolsFromRows, poolsToInsert } from '../../src/data/mappers';
import type { EventLogRow, EventRow, MatchRow, PoolMemberRow, PoolRow } from '../../src/data/rows';
import { ANON, as, createDb, createUser, rows, rpc, user } from './harness';

let db: PGlite;
let admin: string;
let leader: string;
let eventId: string;
let players: string[];
const PIN = '2580';

async function load() {
  const matches = (await rows<MatchRow>(db, `select * from matches where event_id = $1`, [eventId])).map(matchFromRow);
  const pools = poolsFromRows(
    await rows<PoolRow>(db, `select * from pools where event_id = $1`, [eventId]),
    await rows<PoolMemberRow>(db, `select * from pool_members where event_id = $1`, [eventId]),
  );
  const log = await rows<EventLogRow>(db, `select * from event_log where event_id = $1 order by id`, [eventId]);
  const [event] = await rows<EventRow>(db, `select * from events where id = $1`, [eventId]);
  const withdrawn = new Set(
    (await rows<{ player_id: string }>(db, `select player_id from registrations where event_id = $1 and withdrawn_at is not null`, [eventId])).map(
      (r) => r.player_id,
    ),
  );
  return { matches, pools, log, event, withdrawn };
}

/** Vergelijkt de structuur (spelers, winnaars, legs) van database en engine. */
function snapshot(matches: Match[]) {
  return Object.fromEntries(
    [...matches].sort((a, b) => a.id.localeCompare(b.id)).map((m) => [m.id, [m.player1, m.player2, m.winner, m.legs1, m.legs2, m.walkover]]),
  );
}

async function submit(code: string, legs1: number, legs2: number, clientId?: string) {
  return as(db, ANON, () =>
    rpc<{ status: string; message?: string; duplicate?: boolean }>(db, 'submit_score', {
      p_event_id: eventId,
      p_code: code,
      p_pin: PIN,
      p_legs1: legs1,
      p_legs2: legs2,
      p_client_id: clientId ?? null,
      p_stats: [],
    }),
  );
}

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  leader = await createUser(db, 'leider@example.com');
  await as(db, user(admin), () => rpc(db, 'set_user_role', { p_user_id: leader, p_role: 'leider' }));
  await as(db, user(admin), async () => {
    const [season] = await rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2027', '2027-01-01', '2027-12-31') returning id`);
    const [event] = await rows<{ id: string }>(db, `insert into events (season_id, event_date, boards) values ($1, '2027-01-16', 4) returning id`, [season.id]);
    eventId = event.id;
    await db.query(`insert into event_secrets (event_id, scorer_pin) values ($1, $2)`, [eventId, PIN]);
    players = [];
    for (let i = 1; i <= 13; i++) {
      const [p] = await rows<{ id: string }>(db, `insert into players (name) values ($1) returning id`, [`Speler ${i}`]);
      players.push(p.id);
      await db.query(`insert into registrations (event_id, player_id, present, paid) values ($1, $2, true, true)`, [eventId, p.id]);
    }
  });
});

describe('een volledige avond via de database', () => {
  let engine: Match[] = [];
  let pools: Pool[] = [];

  it('start het toernooi met de poules van de engine', async () => {
    const [event] = await rows<EventRow>(db, `select * from events where id = $1`, [eventId]);
    const started = startPools({
      players: players.map((id, i) => ({ id, seedRank: i < 6 ? i + 1 : null })),
      sizes: [4, 4, 5],
      bestOf: DEFAULT_LEGS.pool,
      rng: createRng(event.rng_seed),
      createdAt: 0,
    });
    await as(db, user(leader), () =>
      rpc(db, 'start_tournament', {
        p_event_id: eventId,
        p_pools: poolsToInsert(started.pools),
        p_matches: started.matches.map(matchToInsert),
        p_config: { sizes: [4, 4, 5], advance: 2, boards: [1, 2, 3, 4], mainBoard: 1, holdFinal: true },
      }),
    );
    const state = await load();
    expect(state.event.status).toBe('bezig');
    expect(state.pools).toEqual(started.pools);
    expect(snapshot(state.matches)).toEqual(snapshot(started.matches));
    await expect(
      as(db, user(leader), () => rpc(db, 'start_tournament', { p_event_id: eventId, p_pools: [], p_matches: [], p_config: {} })),
    ).rejects.toThrow(/al gestart/);
    engine = state.matches;
    pools = state.pools;
  });

  it('weigert een foute pin en een ongeldige score', async () => {
    const code = engine.find((m) => m.stage === 'pool')!.id;
    const bad = await as(db, ANON, () => rpc<{ status: string }>(db, 'submit_score', { p_event_id: eventId, p_code: code, p_pin: '0000', p_legs1: 2, p_legs2: 0 }));
    expect(bad.status).toBe('bad_pin');
    const invalid = await submit(code, 2, 2);
    expect(invalid.status).toBe('error');
    expect(invalid.message).toMatch(/best of 3/);
  });

  it('verwerkt een offline gebufferde uitslag maar één keer', async () => {
    const code = engine.find((m) => m.stage === 'pool')!.id;
    const clientId = '11111111-1111-4111-8111-111111111111';
    expect((await submit(code, 2, 1, clientId)).status).toBe('ok');
    expect(await submit(code, 2, 1, clientId)).toMatchObject({ status: 'ok', duplicate: true });
    // Een andere uitslag van een scorer wordt een conflict, de leider mag wel corrigeren.
    expect((await submit(code, 0, 2)).status).toBe('conflict');
    engine = applyResult(engine, code, { legs1: 2, legs2: 1, finishedAt: 1 });
    const audit = await rows<{ changed_by_label: string }>(db, `select changed_by_label from audit_log where table_name = 'matches'`);
    expect(audit.at(-1)?.changed_by_label).toBe('score-pin');
  });

  it('speelt de poules, met een opgave halverwege', async () => {
    const rng = createRng('poules');
    let count = 0;
    for (const m of engine.filter((x) => x.stage === 'pool' && !isFinished(x))) {
      const current = engine.find((x) => x.id === m.id)!;
      if (isFinished(current)) continue;
      const p1 = rng.next() < 0.5;
      const need = legsToWin(m.bestOf);
      const lost = rng.int(need);
      expect((await submit(m.id, p1 ? need : lost, p1 ? lost : need)).status).toBe('ok');
      engine = applyResult(engine, m.id, { legs1: p1 ? need : lost, legs2: p1 ? lost : need, finishedAt: 1 });
      if (++count === 8) {
        const quitter = pools[2].playerIds[1];
        await as(db, user(leader), () => rpc(db, 'withdraw_player', { p_event_id: eventId, p_player_id: quitter }));
        engine = autoWalkovers(engine, new Set([quitter]), 1);
      }
    }
    const state = await load();
    expect(snapshot(state.matches)).toEqual(snapshot(engine));
    expect(state.matches.filter((m) => m.walkover).length).toBeGreaterThan(0);
  });

  it('maakt barrages of loot, en genereert dan de KO-schema\'s', async () => {
    let state = await load();
    let status = poolPhaseStatus({ pools, matches: state.matches, advance: 2, lotSeed: state.event.rng_seed, withdrawn: state.withdrawn });
    for (const [i, need] of status.barrageNeeds.entries()) {
      if (i % 2 === 0) {
        const barrages = createBarrageMatches(need, DEFAULT_LEGS.barrage, 0, state.matches);
        await as(db, user(leader), () => rpc(db, 'add_barrages', { p_event_id: eventId, p_matches: barrages.map(matchToInsert) }));
        for (const b of barrages) expect((await submit(b.id, 1, 0)).status).toBe('ok');
      } else {
        await as(db, user(leader), () => db.query(`insert into event_log (event_id, type, payload) values ($1, 'lot', $2)`, [eventId, JSON.stringify({ key: need.key })]));
      }
    }
    state = await load();
    status = poolPhaseStatus({
      pools,
      matches: state.matches,
      advance: 2,
      lotSeed: state.event.rng_seed,
      withdrawn: state.withdrawn,
      acceptedLots: acceptedLotsFromRows(state.log),
    });
    expect(status.readyForKnockout).toBe(true);

    const ko = generateKnockouts({ standings: status.standings, advance: 2, legs: DEFAULT_LEGS, lotSeed: state.event.rng_seed, createdAt: 0 });
    await as(db, user(leader), () =>
      rpc(db, 'generate_knockout', { p_event_id: eventId, p_matches: ko.matches.map(matchToInsert), p_knockout: ko.participants }),
    );
    engine = autoWalkovers([...state.matches, ...ko.matches], state.withdrawn, 1);
    state = await load();
    expect(state.event.knockout).toEqual(ko.participants);
    expect(snapshot(state.matches)).toEqual(snapshot(engine));
  });

  it('schuift winnaars door en weigert een correctie na de volgende match', async () => {
    const rng = createRng('ko');
    for (let guard = 0; guard < 100; guard++) {
      const next = engine.find((m) => (m.stage === 'A' || m.stage === 'B') && !isFinished(m) && m.player1 && m.player2);
      if (!next) break;
      const p1 = rng.next() < 0.5;
      const need = legsToWin(next.bestOf);
      expect((await submit(next.id, p1 ? need : 0, p1 ? 0 : need)).status).toBe('ok');
      engine = applyResult(engine, next.id, { legs1: p1 ? need : 0, legs2: p1 ? 0 : need, finishedAt: 1 });
      expect(snapshot((await load()).matches)).toEqual(snapshot(engine));
    }
    expect(engine.every(isFinished)).toBe(true);

    const r1 = engine.find((m) => m.stage === 'A' && m.round === 1 && !m.walkover)!;
    const flipped = r1.legs1! > r1.legs2! ? [0, legsToWin(r1.bestOf)] : [legsToWin(r1.bestOf), 0];
    await expect(
      as(db, user(leader), () => db.query(`update matches set legs1 = $1, legs2 = $2 where event_id = $3 and code = $4`, [...flipped, eventId, r1.id])),
    ).rejects.toThrow(/Corrigeer eerst die match/);
    // Een correctie met dezelfde winnaar mag wel.
    const same = r1.legs1! > r1.legs2! ? [legsToWin(r1.bestOf), 1] : [1, legsToWin(r1.bestOf)];
    await as(db, user(leader), () => db.query(`update matches set legs1 = $1, legs2 = $2 where event_id = $3 and code = $4`, [...same, eventId, r1.id]));
  });

  it('sluit de avond af met eindplaatsen en punten', async () => {
    const state = await load();
    const placements = eventPlacements(state.matches, state.event.knockout!);
    expect(placements.complete).toBe(true);
    const points = eventPoints(placements.placements, DEFAULT_POINTS);
    await as(db, user(leader), () =>
      rpc(db, 'finalize_event', {
        p_event_id: eventId,
        p_results: points.map((p) => ({
          player_id: p.playerId,
          place_from: p.placeFrom,
          place_to: p.placeTo,
          placement_points: p.placementPoints,
          participation_points: p.participationPoints,
          points: p.total,
        })),
      }),
    );
    const results = await as(db, ANON, () => rows<{ points: number; place_from: number }>(db, `select points, place_from from event_results order by place_from`));
    expect(results).toHaveLength(13);
    expect(results[0]).toEqual({ points: 27, place_from: 1 });
    const [event] = await rows<EventRow>(db, `select * from events where id = $1`, [eventId]);
    expect(event.status).toBe('afgelopen');
  });
});

describe('beheer', () => {
  it('voegt dubbele spelers samen', async () => {
    const keep = players[0];
    const dup = await as(db, user(admin), async () => {
      const [season] = await rows<{ id: string }>(db, `select season_id as id from events where id = $1`, [eventId]);
      const [other] = await rows<{ id: string }>(db, `insert into events (season_id, event_date) values ($1, '2027-02-20') returning id`, [season.id]);
      const [b] = await rows<{ id: string }>(db, `insert into players (name) values ('Speler 1 (dubbel)') returning id`);
      await db.query(`insert into player_contacts (player_id, phone) values ($1, '0499 99 99 99')`, [b.id]);
      await db.query(`insert into registrations (event_id, player_id, present) values ($1, $2, true)`, [other.id, b.id]);
      await db.query(
        `insert into event_results (event_id, player_id, place_from, place_to, placement_points, participation_points, points) values ($1, $2, 3, 4, 15, 2, 17)`,
        [other.id, b.id],
      );
      return b.id;
    });
    await as(db, user(admin), () => rpc(db, 'merge_players', { p_keep: keep, p_remove: dup }));
    expect(await rows(db, `select * from players where id = $1`, [dup])).toEqual([]);
    expect(await rows(db, `select * from registrations where player_id = $1`, [keep])).toHaveLength(2);
    expect(await rows(db, `select * from event_results where player_id = $1`, [keep])).toHaveLength(2);
    expect((await rows<{ phone: string }>(db, `select phone from player_contacts where player_id = $1`, [keep]))[0]?.phone).toBe('0499 99 99 99');
    // Samenvoegen met een speler van dezelfde avond kan niet, en enkel admins mogen het.
    await expect(as(db, user(admin), () => rpc(db, 'merge_players', { p_keep: players[1], p_remove: players[2] }))).rejects.toThrow(/dezelfde speelavond/);
    await expect(as(db, user(leader), () => rpc(db, 'merge_players', { p_keep: players[1], p_remove: players[2] }))).rejects.toThrow(/beheerders/);
  });

  it('zet een toernooi volledig terug', async () => {
    await as(db, user(leader), () => rpc(db, 'reset_tournament', { p_event_id: eventId }));
    const state = await load();
    expect(state.matches).toEqual([]);
    expect(state.pools).toEqual([]);
    expect(state.event.status).toBe('gepland');
    expect(state.withdrawn.size).toBe(0);
  });
});
