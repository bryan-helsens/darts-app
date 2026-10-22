import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { collectBackups, restReader, type BackupFile, type TableReader } from '../../scripts/backup/collect';
import type { SeasonBackup } from '../../src/data/exports';
import { buildDemoDataset, demoOptionsForToday } from '../../src/demo/demoData';
import { as, createDb, createUser, rows, rpc, user } from '../db/harness';

const RESTORE = readFileSync(join(import.meta.dirname, '../../supabase/restore-backup.sql'), 'utf8');
const PLACEHOLDER = '$backup$\nPLAK HIER DE BACK-UP\n$backup$';
const data = buildDemoDataset(demoOptionsForToday('2026-10-20'));

/** Leest zoals de service-sleutel: zonder RLS, als JSON (zoals PostgREST). */
const pgReader =
  (db: PGlite): TableReader =>
  async <T,>(table: string, opts: { order: string[]; eventIds?: readonly string[] }) => {
    const where = opts.eventIds ? `where event_id = any($1::uuid[])` : '';
    const sql = `select to_jsonb(t) as r from (select * from public.${table} ${where} order by ${opts.order.join(', ')}) t`;
    return (await rows<{ r: T }>(db, sql, opts.eventIds ? [opts.eventIds] : [])).map((x) => x.r);
  };

let db: PGlite;
let files: BackupFile[];

beforeAll(async () => {
  db = await createDb();
  const admin = await createUser(db, 'admin@example.com');
  await as(db, user(admin), () => rpc(db, 'load_demo_data', { p_data: data }));
  // Een speler zonder uitslag staat enkel in alle-spelers.json.
  await db.query(`insert into players (name) values ('Nog nooit gespeeld')`);
  files = await collectBackups(pgReader(db), '2026-10-22T03:00:00Z');
}, 60_000);

describe('nachtelijke back-up', () => {
  it('één bestand per seizoen plus alle spelers', () => {
    expect(files.map((f) => f.name)).toEqual(['seizoen-demoseizoen.json', 'alle-spelers.json']);
    const all = JSON.parse(files[1].content) as { players: Array<{ name: string }>; player_contacts: unknown[] };
    expect(all.players).toHaveLength(26);
    expect(all.players.some((p) => p.name === 'Nog nooit gespeeld')).toBe(true);
    expect(all.player_contacts).toHaveLength(data.player_contacts.length);
  });

  it('het seizoensbestand is een volledige back-up zoals in de app, met beurten en contactgegevens', () => {
    const backup = JSON.parse(files[0].content) as SeasonBackup;
    expect(backup.format).toBe('sanapolis-darts-backup');
    expect(backup.events).toHaveLength(7);
    expect(backup.matches).toHaveLength(data.matches.length);
    expect(backup.match_legs).toHaveLength(data.match_legs.length);
    expect(backup.event_results).toHaveLength(data.event_results.length);
    expect(backup.player_contacts?.length).toBe(data.player_contacts.length);
  });

  it('is terug te zetten met restore-backup.sql', async () => {
    const target = await createDb();
    await target.exec(RESTORE.replace(PLACEHOLDER, `$backup$\n${files[0].content}\n$backup$`));
    const count = async (d: PGlite, table: string) => Number((await rows<{ n: number }>(d, `select count(*)::int as n from ${table}`))[0].n);
    for (const table of ['events', 'matches', 'match_legs', 'event_results', 'registrations', 'player_contacts']) {
      expect(await count(target, table), table).toBe(await count(db, table));
    }
  }, 60_000);
});

describe('lezen via de REST-API', () => {
  it('per pagina, met de sleutel, tot een onvolledige pagina', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const offset = Number(new URL(String(input)).searchParams.get('offset'));
      const page = offset === 0 ? [{ id: 1 }, { id: 2 }] : offset === 2 ? [{ id: 3 }] : [];
      return new Response(JSON.stringify(page), { status: 200 });
    });
    const read = restReader('https://x.supabase.co/', 'eyJgeheim', fetchImpl as unknown as typeof fetch, 2);
    expect(await read('matches', { order: ['event_id', 'id'], eventIds: ['e1', 'e2'] })).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const params = new URL(url).searchParams;
    expect(url.startsWith('https://x.supabase.co/rest/v1/matches?')).toBe(true);
    expect(params.get('order')).toBe('event_id.asc,id.asc');
    expect(params.get('event_id')).toBe('in.(e1,e2)');
    expect(init.headers).toMatchObject({ apikey: 'eyJgeheim', Authorization: 'Bearer eyJgeheim' });
  });

  it('een nieuwe geheime sleutel (sb_secret_…) gaat enkel mee als apikey', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]', { status: 200 }));
    await restReader('https://x', 'sb_secret_abc', fetchImpl as unknown as typeof fetch)('seasons', { order: ['id'] });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toEqual({ apikey: 'sb_secret_abc', Accept: 'application/json' });
  });

  it('een fout van Supabase stopt de back-up', async () => {
    const fetchImpl = async () => new Response('nope', { status: 401 });
    await expect(restReader('https://x', 'k', fetchImpl as unknown as typeof fetch)('seasons', { order: ['id'] })).rejects.toThrow(/seasons: 401/);
  });
});
