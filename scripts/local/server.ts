/**
 * Lokale testserver die het deel van de Supabase-API nabootst dat de app
 * gebruikt (REST/PostgREST, RPC en e-mail/wachtwoord-login), bovenop PGlite
 * met exact dezelfde migraties, RLS en functies als in productie.
 *
 * ENKEL voor ontwikkeling en automatische tests: geen echte beveiliging van
 * wachtwoorden of tokens. Realtime wordt niet nagebootst (de app ververst dan
 * elke 30 seconden en na elke eigen wijziging).
 */

import { PGlite, types, type Transaction } from '@electric-sql/pglite';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPABASE_DEFAULT_GRANTS, SUPABASE_STUB } from './stub';

const ROOT = join(import.meta.dirname, '../..');
const IDENT = /^[a-z_][a-z0-9_]*$/;

export interface LocalSupabase {
  url: string;
  db: PGlite;
  server: Server;
  close: () => Promise<void>;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'PGRST000',
  ) {
    super(message);
  }
}

function ident(name: string): string {
  if (!IDENT.test(name)) throw new HttpError(400, `Ongeldige naam: ${name}`);
  return `"${name}"`;
}

function toIso(value: string): string {
  // Postgres: "2026-11-21 18:00:00.123+00" → ISO 8601
  const normalized = value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/** Zelfde vorm als PostgREST: datums en uren als tekst, tijdstippen in ISO, tellingen als getal. */
const PARSERS = {
  [types.DATE]: (v: string) => v,
  [types.TIME]: (v: string) => v,
  [types.TIMESTAMPTZ]: (v: string) => toIso(v),
  [types.INT8]: (v: string) => Number(v),
  [types.NUMERIC]: (v: string) => Number(v),
};

export async function createLocalDb(opts: { seed?: boolean; dataDir?: string } = {}): Promise<PGlite> {
  const db = new PGlite(opts.dataDir, { parsers: PARSERS });
  const ready = await db.query<{ n: number }>(`select count(*)::int as n from pg_namespace where nspname = 'auth'`);
  if (ready.rows[0].n === 0) {
    await db.exec(SUPABASE_STUB);
    const dir = join(ROOT, 'supabase/migrations');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
    await db.exec(SUPABASE_DEFAULT_GRANTS);
    if (opts.seed) await db.exec(readFileSync(join(ROOT, 'supabase/seed.sql'), 'utf8'));
  }
  return db;
}

// ---------------------------------------------------------------------------
// Tokens (niet ondertekend: enkel lokaal gebruiken!)
// ---------------------------------------------------------------------------

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function makeToken(user: { id: string; email: string }) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp })}.lokaal`;
}

function readToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  const parts = auth.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { sub?: string; role?: string };
    return payload.role === 'authenticated' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

interface UserRow {
  id: string;
  email: string;
  encrypted_password: string | null;
  raw_user_meta_data: Record<string, unknown>;
  created_at: string;
}

function userJson(u: UserRow) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.created_at,
    user_metadata: u.raw_user_meta_data,
    app_metadata: { provider: 'email', providers: ['email'] },
    created_at: u.created_at,
    updated_at: u.created_at,
  };
}

function session(u: UserRow) {
  return {
    access_token: makeToken(u),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${u.id}`,
    user: userJson(u),
  };
}

// ---------------------------------------------------------------------------
// PostgREST-filters
// ---------------------------------------------------------------------------

function parseIn(v: string): string[] {
  const inner = v.replace(/^\(/, '').replace(/\)$/, '');
  return inner === '' ? [] : inner.split(',').map((x) => x.replace(/^"|"$/g, ''));
}

function condition(column: string, expr: string, params: unknown[]): string {
  const col = ident(column);
  let negate = false;
  let e = expr;
  if (e.startsWith('not.')) {
    negate = true;
    e = e.slice(4);
  }
  const dot = e.indexOf('.');
  const op = e.slice(0, dot);
  const value = e.slice(dot + 1);
  let sql: string;
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  switch (op) {
    case 'eq':
      sql = `${col} = ${p(value)}`;
      break;
    case 'neq':
      sql = `${col} <> ${p(value)}`;
      break;
    case 'gt':
      sql = `${col} > ${p(value)}`;
      break;
    case 'gte':
      sql = `${col} >= ${p(value)}`;
      break;
    case 'lt':
      sql = `${col} < ${p(value)}`;
      break;
    case 'lte':
      sql = `${col} <= ${p(value)}`;
      break;
    case 'is':
      if (!['null', 'true', 'false'].includes(value)) throw new HttpError(400, `is.${value}`);
      sql = `${col} is ${value}`;
      break;
    case 'in': {
      const values = parseIn(value);
      sql = values.length === 0 ? 'false' : `${col}::text in (${values.map((v) => p(v)).join(', ')})`;
      break;
    }
    default:
      throw new HttpError(400, `Filter ${op} niet ondersteund door de lokale testserver`);
  }
  return negate ? `not (${sql})` : sql;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

function whereClause(search: URLSearchParams, params: unknown[]): string {
  const parts: string[] = [];
  for (const [key, value] of search) {
    if (RESERVED.has(key)) continue;
    if (key === 'or') {
      const inner = value.replace(/^\(/, '').replace(/\)$/, '');
      const ors = inner.split(',').map((c) => {
        const [column, ...rest] = c.split('.');
        return condition(column, rest.join('.'), params);
      });
      parts.push(`(${ors.join(' or ')})`);
    } else {
      parts.push(condition(key, value, params));
    }
  }
  return parts.length ? ` where ${parts.join(' and ')}` : '';
}

function selectList(search: URLSearchParams): string {
  const select = search.get('select') ?? '*';
  if (select === '*') return '*';
  return select
    .split(',')
    .map((c) => ident(c.trim()))
    .join(', ');
}

function orderClause(search: URLSearchParams): string {
  const order = search.get('order');
  if (!order) return '';
  return (
    ' order by ' +
    order
      .split(',')
      .map((o) => {
        const [col, dir, nulls] = o.split('.');
        return `${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`;
      })
      .join(', ')
  );
}

function sqlValue(v: unknown): unknown {
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : null;
}

function send(res: ServerResponse, status: number, data?: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

async function asRole<T>(db: PGlite, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [userId ? 'authenticated' : 'anon', userId ?? '']);
    return fn(tx);
  });
}

function pgError(e: unknown): HttpError {
  const err = e as { code?: string; message?: string };
  if (e instanceof HttpError) return e;
  const code = err.code ?? 'P0001';
  const status = code === '42501' ? 403 : code === '23505' ? 409 : code.startsWith('22') || code.startsWith('23') || code === 'P0001' ? 400 : 400;
  return new HttpError(status, err.message ?? String(e), code);
}

async function handleRest(db: PGlite, req: IncomingMessage, url: URL, userId: string | null, res: ServerResponse) {
  const path = url.pathname.replace(/^\/rest\/v1\//, '');
  const search = url.searchParams;
  const wantsObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const prefer = String(req.headers.prefer ?? '');
  const returnRows = prefer.includes('return=representation');

  if (path.startsWith('rpc/')) {
    const fn = path.slice(4);
    const args = ((await body(req)) ?? {}) as Record<string, unknown>;
    const names = Object.keys(args);
    const params = names.map((n) => sqlValue(args[n]));
    const sql = `select public.${ident(fn)}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')}) as result`;
    const result = await asRole(db, userId, (tx) => tx.query<{ result: unknown }>(sql, params, { parsers: PARSERS }));
    return send(res, 200, result.rows[0]?.result ?? null);
  }

  const table = `public.${ident(path)}`;
  const params: unknown[] = [];
  let sql: string;
  let status = 200;

  if (req.method === 'GET' || req.method === 'HEAD') {
    sql = `select ${selectList(search)} from ${table}${whereClause(search, params)}${orderClause(search)}`;
    if (search.get('limit')) sql += ` limit ${Number(search.get('limit'))}`;
    if (search.get('offset')) sql += ` offset ${Number(search.get('offset'))}`;
  } else if (req.method === 'POST') {
    const payload = await body(req);
    const rows = (Array.isArray(payload) ? payload : [payload]) as Array<Record<string, unknown>>;
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const values = rows.map((r) => `(${columns.map((c) => (c in r ? (params.push(sqlValue(r[c])), `$${params.length}`) : 'default')).join(', ')})`);
    sql = `insert into ${table} (${columns.map(ident).join(', ')}) values ${values.join(', ')}`;
    if (prefer.includes('resolution=merge-duplicates')) {
      const conflict = search.get('on_conflict');
      if (!conflict) throw new HttpError(400, 'on_conflict ontbreekt');
      const target = conflict.split(',').map(ident);
      const updates = columns.filter((c) => !conflict.split(',').includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      sql += ` on conflict (${target.join(', ')}) ${updates.length ? `do update set ${updates.join(', ')}` : 'do nothing'}`;
    }
    sql += ' returning *';
    status = 201;
  } else if (req.method === 'PATCH') {
    const patch = (await body(req)) as Record<string, unknown>;
    const sets = Object.keys(patch).map((c) => {
      params.push(sqlValue(patch[c]));
      return `${ident(c)} = $${params.length}`;
    });
    sql = `update ${table} set ${sets.join(', ')}${whereClause(search, params)} returning *`;
  } else if (req.method === 'DELETE') {
    sql = `delete from ${table}${whereClause(search, params)} returning *`;
  } else {
    throw new HttpError(405, 'Methode niet ondersteund');
  }

  const result = await asRole(db, userId, (tx) => tx.query<Record<string, unknown>>(sql, params, { parsers: PARSERS }));
  if (req.method === 'POST' && result.rows.length === 0 && !prefer.includes('resolution')) {
    throw new HttpError(403, 'new row violates row-level security policy', '42501');
  }
  const rows = result.rows;
  if (req.method !== 'GET' && !returnRows) return send(res, req.method === 'POST' ? 201 : 204);
  if (wantsObject) {
    if (rows.length !== 1) throw new HttpError(406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116');
    return send(res, status, rows[0]);
  }
  return send(res, status, rows);
}

async function handleAuth(db: PGlite, req: IncomingMessage, url: URL, userId: string | null, res: ServerResponse) {
  const path = url.pathname.replace(/^\/auth\/v1\//, '');
  const findUser = async (where: string, value: string) =>
    (await db.query<UserRow>(`select * from auth.users where ${where} = $1`, [value], { parsers: PARSERS })).rows[0];

  if (path === 'signup' && req.method === 'POST') {
    const b = (await body(req)) as { email: string; password: string; data?: Record<string, unknown> };
    if (await findUser('email', b.email)) throw new HttpError(422, 'User already registered', 'user_already_exists');
    const inserted = await db.query<UserRow>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3) returning *`,
      [b.email, b.password, JSON.stringify(b.data ?? {})],
      { parsers: PARSERS },
    );
    return send(res, 200, session(inserted.rows[0]));
  }
  if (path === 'token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const b = (await body(req)) as { email?: string; password?: string; refresh_token?: string };
    if (grant === 'password') {
      const u = await findUser('email', b.email ?? '');
      if (!u || u.encrypted_password !== b.password) throw new HttpError(400, 'Invalid login credentials', 'invalid_credentials');
      return send(res, 200, session(u));
    }
    if (grant === 'refresh_token') {
      const id = (b.refresh_token ?? '').replace(/^refresh-/, '');
      const u = await findUser('id::text', id);
      if (!u) throw new HttpError(400, 'Invalid Refresh Token', 'refresh_token_not_found');
      return send(res, 200, session(u));
    }
  }
  if (path === 'user' && req.method === 'GET') {
    const u = userId ? await findUser('id::text', userId) : undefined;
    if (!u) throw new HttpError(401, 'invalid JWT', 'bad_jwt');
    return send(res, 200, userJson(u));
  }
  if (path === 'logout') return send(res, 204);
  throw new HttpError(404, `Auth-route ${path} niet ondersteund door de lokale testserver`);
}

export async function startLocalSupabase(opts: { port?: number; seed?: boolean; dataDir?: string; quiet?: boolean } = {}): Promise<LocalSupabase> {
  const db = await createLocalDb(opts);
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS,HEAD');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const userId = readToken(req);
    try {
      if (url.pathname.startsWith('/rest/v1/')) return await handleRest(db, req, url, userId, res);
      if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(db, req, url, userId, res);
      // Realtime wordt niet nagebootst: stil weigeren, de app valt terug op verversen.
      if (url.pathname.startsWith('/realtime/')) return send(res, 404);
      throw new HttpError(404, 'Niet gevonden');
    } catch (e) {
      const err = pgError(e);
      if (!opts.quiet) console.warn(`[lokale supabase] ${req.method} ${url.pathname}: ${err.message}`);
      send(res, err.status, { code: err.code, message: err.message, details: null, hint: null, error: err.code, error_description: err.message, msg: err.message });
    }
  });
  await new Promise<void>((resolve) => server.listen(opts.port ?? 54321, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : opts.port;
  return {
    url: `http://localhost:${port}`,
    db,
    server,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
