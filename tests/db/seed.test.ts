import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildSeedSql } from '../../scripts/seed/build';
import { matchFromRow } from '../../src/data/mappers';
import type { EventRow, MatchRow } from '../../src/data/rows';
import { eventPlacements } from '../../src/engine';
import { ANON, as, createDb, rows } from './harness';

const SEED = join(import.meta.dirname, '../../supabase/seed.sql');
let db: PGlite;

beforeAll(async () => {
  db = await createDb();
  await db.exec(readFileSync(SEED, 'utf8'));
});

describe('seed-data', () => {
  it('is up-to-date met de generator', () => {
    expect(readFileSync(SEED, 'utf8')).toBe(buildSeedSql());
  });

  it('bevat een seizoen met 25 spelers en 6 gespeelde avonden', async () => {
    expect(await rows(db, `select * from players`)).toHaveLength(25);
    const events = await rows<EventRow>(db, `select * from events order by event_date`);
    expect(events.map((e) => e.status)).toEqual([...Array(6).fill('afgelopen'), 'gepland']);
    for (const e of events.slice(0, 6)) {
      const present = await rows(db, `select * from registrations where event_id = $1`, [e.id]);
      const results = await rows(db, `select * from event_results where event_id = $1`, [e.id]);
      expect(results).toHaveLength(present.length);
    }
  });

  it('heeft uitslagen die kloppen met de eindplaatsen', async () => {
    const events = await rows<EventRow>(db, `select * from events where status = 'afgelopen'`);
    for (const e of events) {
      const matches = (await rows<MatchRow>(db, `select * from matches where event_id = $1`, [e.id])).map(matchFromRow);
      const placements = eventPlacements(matches, e.knockout!);
      expect(placements.complete).toBe(true);
      const stored = await rows<{ player_id: string; place_from: number }>(db, `select player_id, place_from from event_results where event_id = $1`, [e.id]);
      const fromDb = Object.fromEntries(stored.map((r) => [r.player_id, r.place_from]));
      expect(Object.fromEntries(placements.placements.map((p) => [p.playerId, p.from]))).toEqual(fromDb);
    }
  });

  it('is publiek leesbaar en laat geen audit-sporen na', async () => {
    expect(await as(db, ANON, () => rows(db, `select * from event_results`))).not.toHaveLength(0);
    expect(await rows(db, `select * from audit_log`)).toEqual([]);
  });

  it('is volledig te verwijderen', async () => {
    await db.exec(readFileSync(join(import.meta.dirname, '../../supabase/demo-cleanup.sql'), 'utf8'));
    for (const table of ['players', 'seasons', 'events', 'matches', 'registrations', 'event_results']) {
      expect(await rows(db, `select * from ${table}`), table).toEqual([]);
    }
  });
});
