/**
 * Echte Postgres (PGlite) met een nagebootste Supabase-omgeving:
 * rollen anon/authenticated, schema auth met auth.uid() en de standaard
 * rechten die Supabase op het schema public geeft.
 */

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPABASE_DEFAULT_GRANTS, SUPABASE_STUB } from '../../scripts/local/stub';

const MIGRATIONS = join(import.meta.dirname, '../../supabase/migrations');

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(MIGRATIONS, f));
}

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) await db.exec(readFileSync(file, 'utf8'));
  await db.exec(SUPABASE_DEFAULT_GRANTS);
  return db;
}

/** Maakt een gebruiker aan in auth.users (de trigger maakt het profiel). */
export async function createUser(db: PGlite, email: string): Promise<string> {
  const res = await db.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
  return res.rows[0].id;
}

export type Actor = { kind: 'anon' } | { kind: 'user'; id: string } | { kind: 'owner' };
export const ANON: Actor = { kind: 'anon' };
export const OWNER: Actor = { kind: 'owner' };
export const user = (id: string): Actor => ({ kind: 'user', id });

/** Voert queries uit als een bepaalde rol, zoals PostgREST dat doet. */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  if (actor.kind === 'anon') {
    await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  } else if (actor.kind === 'user') {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${actor.id}', false);`);
  } else {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function rows<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function rpc<T = unknown>(db: PGlite, fn: string, args: Record<string, unknown>): Promise<T> {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as result`;
  const values = names.map((n) => {
    const v = args[n];
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const res = await db.query<{ result: T }>(sql, values);
  return res.rows[0]?.result as T;
}
