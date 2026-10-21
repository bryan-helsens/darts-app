/**
 * Schema-formats via de database: de engine bouwt het schema, de database
 * bewaakt scores, doorschuiven (winnaar én verliezer) en walk-overs. Na elke
 * stap moet de database exact overeenkomen met wat de engine berekent.
 */

import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyResult,
  autoWalkovers,
  createRng,
  DEFAULT_LEGS,
  eliminationPlacements,
  isFinished,
  startBracket,
  walkoverLegs,
  type EliminationFormat,
  type Match,
} from '../../src/engine';
import { matchFromRow, matchToInsert } from '../../src/data/mappers';
import type { EventRow, MatchRow } from '../../src/data/rows';
import { ANON, as, createDb, createUser, rows, rpc, user } from './harness';

const PIN = '1357';
let db: PGlite;
let admin: string;
let leader: string;
let seasonId: string;

async function createEvent(players: number): Promise<{ eventId: string; playerIds: string[] }> {
  return as(db, user(admin), async () => {
    const [event] = await rows<{ id: string }>(db, `insert into events (season_id, event_date, boards) values ($1, '2027-02-20', 4) returning id`, [seasonId]);
    await db.query(`insert into event_secrets (event_id, scorer_pin) values ($1, $2)`, [event.id, PIN]);
    const playerIds: string[] = [];
    for (let i = 1; i <= players; i++) {
      const [p] = await rows<{ id: string }>(db, `insert into players (name) values ($1) returning id`, [`Schema ${event.id.slice(0, 4)} ${i}`]);
      playerIds.push(p.id);
      await db.query(`insert into registrations (event_id, player_id, present, paid) values ($1, $2, true, true)`, [event.id, p.id]);
    }
    return { eventId: event.id, playerIds };
  });
}

async function loadMatches(eventId: string): Promise<Match[]> {
  return (await rows<MatchRow>(db, `select * from matches where event_id = $1`, [eventId])).map(matchFromRow);
}

/** Spelers, winnaars, legs en walk-overs per match. */
function snapshot(matches: readonly Match[]) {
  return Object.fromEntries(
    [...matches].sort((a, b) => a.id.localeCompare(b.id)).map((m) => [m.id, [m.player1, m.player2, m.winner, m.legs1, m.legs2, m.walkover]]),
  );
}

async function start(format: EliminationFormat, eventId: string, playerIds: string[]) {
  const built = startBracket({ format, players: playerIds.map((id) => ({ id })), legs: DEFAULT_LEGS, rng: createRng(eventId), createdAt: Date.now() });
  await as(db, user(leader), () =>
    rpc(db, 'start_tournament', {
      p_event_id: eventId,
      p_pools: [],
      p_matches: built.matches.map(matchToInsert),
      p_config: { format, seeds: built.seeds, legs: DEFAULT_LEGS },
    }),
  );
  return built;
}

async function submit(eventId: string, m: Match, player1Wins: boolean) {
  const legs = walkoverLegs(m.bestOf, player1Wins);
  const res = await as(db, ANON, () =>
    rpc<{ status: string; message?: string }>(db, 'submit_score', { p_event_id: eventId, p_code: m.id, p_pin: PIN, p_legs1: legs.legs1, p_legs2: legs.legs2, p_stats: [] }),
  );
  expect(res, m.id).toEqual({ status: 'ok' });
  return legs;
}

beforeAll(async () => {
  db = await createDb();
  admin = await createUser(db, 'admin@example.com');
  leader = await createUser(db, 'leider@example.com');
  await as(db, user(admin), () => rpc(db, 'set_user_role', { p_user_id: leader, p_role: 'leider' }));
  const [season] = await as(db, user(admin), () =>
    rows<{ id: string }>(db, `insert into seasons (name, starts_on, ends_on) values ('2027', '2027-01-01', '2027-12-31') returning id`),
  );
  seasonId = season.id;
}, 60_000);

describe('schema-formats in de database', () => {
  it('double elimination: een volledige avond met opgave en correctie', async () => {
    const { eventId, playerIds } = await createEvent(7);
    const built = await start('double_elim', eventId, playerIds);
    const [event] = await rows<EventRow>(db, `select * from events where id = $1`, [eventId]);
    expect(event.format).toBe('double_elim');
    expect(event.status).toBe('bezig');
    let engine = built.matches;
    expect(snapshot(await loadMatches(eventId))).toEqual(snapshot(engine));
    expect(engine).toHaveLength(12);

    const rng = createRng('de-db');
    const withdrawn = new Set<string>();
    let corrected = false;
    for (let step = 0; step < 50; step++) {
      const open = engine.filter((m) => !isFinished(m) && m.player1 && m.player2).sort((a, b) => a.id.localeCompare(b.id));
      if (open.length === 0) break;
      const m = open[0];
      const legs = await submit(eventId, m, rng.next() < 0.5);
      engine = autoWalkovers(applyResult(engine, m.id, { ...legs, finishedAt: step }), withdrawn, step);

      if (step === 2) {
        // Opgave: de resterende matchen van die speler worden walk-overs (ook in het verliezersschema).
        const quitter = playerIds[6];
        await as(db, user(leader), () => rpc(db, 'withdraw_player', { p_event_id: eventId, p_player_id: quitter }));
        withdrawn.add(quitter);
        engine = autoWalkovers(engine, withdrawn, step);
      }
      if (!corrected) {
        // Correctie: een gespeelde match waarvan de volgende matchen (winnaar én verliezer) nog open zijn.
        const byId = new Map(engine.map((x) => [x.id, x]));
        const candidate = engine.find(
          (x) =>
            isFinished(x) &&
            !x.walkover &&
            x.next &&
            x.loserNext &&
            !isFinished(byId.get(x.next.matchId) as Match) &&
            !isFinished(byId.get(x.loserNext.matchId) as Match) &&
            !withdrawn.has(x.player1 as string) &&
            !withdrawn.has(x.player2 as string),
        );
        if (candidate) {
          const flipped = walkoverLegs(candidate.bestOf, candidate.winner !== candidate.player1);
          await as(db, user(leader), () =>
            db.query(`update matches set legs1 = $1, legs2 = $2 where event_id = $3 and code = $4`, [flipped.legs1, flipped.legs2, eventId, candidate.id]),
          );
          engine = autoWalkovers(applyResult(engine, candidate.id, { ...flipped, finishedAt: step }), withdrawn, step);
          corrected = true;
        }
      }
      expect(snapshot(await loadMatches(eventId)), `stap ${step}`).toEqual(snapshot(engine));
    }
    expect(corrected).toBe(true);
    const final = await loadMatches(eventId);
    expect(final.every(isFinished)).toBe(true);
    const { placements, complete } = eliminationPlacements(final);
    expect(complete).toBe(true);
    expect(placements).toHaveLength(7);
    // Wie opgaf, verliest al zijn resterende matchen met een walk-over.
    expect(final.filter((m) => m.walkover && (m.player1 === playerIds[6] || m.player2 === playerIds[6])).length).toBeGreaterThan(0);
    expect(final.filter((m) => m.walkover && m.winner === playerIds[6])).toEqual([]);

    // Barrages en A/B-schema's horen niet bij dit format.
    for (const fn of ['add_barrages', 'generate_knockout'] as const) {
      const args = fn === 'add_barrages' ? { p_event_id: eventId, p_matches: [] } : { p_event_id: eventId, p_matches: [], p_knockout: { A: [], B: [] } };
      await expect(as(db, user(leader), () => rpc(db, fn, args))).rejects.toThrow(/format/);
    }
    await expect(as(db, user(leader), () => rpc(db, 'undo_knockout', { p_event_id: eventId }))).rejects.toThrow(/format/);

    // Terugzetten: weer een gewone, geplande avond.
    await as(db, user(leader), () => rpc(db, 'reset_tournament', { p_event_id: eventId }));
    const [reset] = await rows<EventRow>(db, `select * from events where id = $1`, [eventId]);
    expect(reset.format).toBe('poules_ab');
    expect(reset.status).toBe('gepland');
    expect(await loadMatches(eventId)).toEqual([]);
  }, 60_000);

  it('enkelvoudig met plate: alle matchen spelen, plaatsen 1..n', async () => {
    const { eventId, playerIds } = await createEvent(9);
    const built = await start('single_elim_plate', eventId, playerIds);
    let engine = built.matches;
    const rng = createRng('plate-db');
    for (let step = 0; step < 50; step++) {
      const open = engine.filter((m) => !isFinished(m) && m.player1 && m.player2).sort((a, b) => a.id.localeCompare(b.id));
      if (open.length === 0) break;
      const legs = await submit(eventId, open[0], rng.next() < 0.5);
      engine = applyResult(engine, open[0].id, { ...legs, finishedAt: step });
    }
    const final = await loadMatches(eventId);
    expect(snapshot(final)).toEqual(snapshot(engine));
    expect(final.every(isFinished)).toBe(true);
    const ranges = eliminationPlacements(final).placements.map((p) => [p.from, p.to]);
    expect(ranges).toHaveLength(9);
    expect(Math.max(...ranges.map(([, to]) => to))).toBe(9);
    expect(final.some((m) => m.stage === 'P')).toBe(true);
  }, 60_000);

  it('start_tournament weigert matchen of poules die niet bij het format passen', async () => {
    const { eventId, playerIds } = await createEvent(4);
    const built = startBracket({ format: 'double_elim', players: playerIds.map((id) => ({ id })), legs: DEFAULT_LEGS, rng: createRng('x'), createdAt: 0 });
    const call = (format: string, matches: unknown[], pools: unknown[] = []) =>
      as(db, user(leader), () => rpc(db, 'start_tournament', { p_event_id: eventId, p_pools: pools, p_matches: matches, p_config: { format } }));
    await expect(call('single_elim_plate', built.matches.map(matchToInsert))).rejects.toThrow(/passen niet/);
    await expect(call('double_elim', built.matches.map(matchToInsert), [{ id: 'P1', label: 'Poule 1', position: 1, players: playerIds }])).rejects.toThrow(/geen poules/);
    await expect(call('knockout', [])).rejects.toThrow(/Onbekend format/);
    await expect(call('poules_ab', built.matches.map(matchToInsert))).rejects.toThrow(/passen niet/);
    // Zonder format in de configuratie blijft het poules_ab (oudere app-versies).
    const [event] = await rows<EventRow>(db, `select * from events where id = $1`, [eventId]);
    expect(event.format).toBe('poules_ab');
    expect(event.status).toBe('gepland');
  }, 60_000);

  it('de CHECKs laten enkel bekende formats en stages toe', async () => {
    const { eventId } = await createEvent(4);
    await expect(db.query(`update events set format = 'knockout' where id = $1`, [eventId])).rejects.toThrow(/events_format_check/);
    await expect(
      db.query(`insert into matches (event_id, code, stage, round, position, best_of) values ($1, 'X-R1-1', 'X', 1, 0, 3)`, [eventId]),
    ).rejects.toThrow(/matches_stage_check/);
    await db.query(`insert into matches (event_id, code, stage, round, position, best_of) values ($1, 'GF-R1-1', 'GF', 1, 0, 5)`, [eventId]);
  }, 60_000);
});
