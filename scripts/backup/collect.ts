/**
 * Nachtelijke back-up: alle seizoenen in hetzelfde formaat als de knop
 * "Volledige back-up (JSON)" in de app (terug te zetten met
 * supabase/restore-backup.sql), plus een lijst met alle spelers.
 * De tabellen komen binnen via een `TableReader`; zo is dit te testen zonder
 * echte Supabase.
 */

import { buildSeasonBackup, type SeasonBackup, type SeasonTables } from '../../src/data/exports';
import type { PlayerContactRow, PlayerRow, SeasonRow } from '../../src/data/rows';
import { fileSlug } from '../../src/lib/csv';

/** Leest alle rijen van een tabel, optioneel enkel voor bepaalde avonden. */
export type TableReader = <T>(table: string, opts: { order: string[]; eventIds?: readonly string[] }) => Promise<T[]>;

export interface BackupFile {
  name: string;
  content: string;
}

const SEASON_TABLES: Array<{ key: Exclude<keyof SeasonTables, 'events'>; order: string[] }> = [
  { key: 'registrations', order: ['event_id', 'player_id'] },
  { key: 'pools', order: ['event_id', 'id'] },
  { key: 'pool_members', order: ['event_id', 'player_id'] },
  { key: 'matches', order: ['id'] },
  { key: 'match_stats', order: ['match_id', 'player_id'] },
  { key: 'match_legs', order: ['match_id', 'leg_no'] },
  { key: 'event_log', order: ['id'] },
  { key: 'event_results', order: ['event_id', 'player_id'] },
];

export async function collectBackups(read: TableReader, exportedAt: string): Promise<BackupFile[]> {
  const [seasons, players, contacts, events] = await Promise.all([
    read<SeasonRow>('seasons', { order: ['starts_on', 'id'] }),
    read<PlayerRow>('players', { order: ['id'] }),
    read<PlayerContactRow>('player_contacts', { order: ['player_id'] }),
    read<SeasonTables['events'][number]>('events', { order: ['event_date', 'id'] }),
  ]);
  const files: BackupFile[] = [];
  const used = new Set<string>();
  for (const season of seasons) {
    const own = events.filter((e) => e.season_id === season.id);
    const ids = own.map((e) => e.id);
    const tables = { events: own } as SeasonTables;
    for (const t of SEASON_TABLES) {
      (tables as unknown as Record<string, unknown[]>)[t.key] = ids.length === 0 ? [] : await read(t.key, { order: t.order, eventIds: ids });
    }
    const backup: SeasonBackup = buildSeasonBackup({ season, tables, players, contacts, exportedAt });
    // Unieke bestandsnaam, ook als twee seizoenen dezelfde naam hebben.
    let name = `seizoen-${fileSlug(season.name)}.json`;
    if (used.has(name)) name = `seizoen-${fileSlug(season.name)}-${season.id.slice(0, 8)}.json`;
    used.add(name);
    files.push({ name, content: JSON.stringify(backup, null, 2) });
  }
  // Ook spelers zonder uitslag (bv. nieuw ingeschreven), met hun contactgegevens.
  files.push({
    name: 'alle-spelers.json',
    content: JSON.stringify({ format: 'sanapolis-darts-players', exported_at: exportedAt, players, player_contacts: contacts }, null, 2),
  });
  return files;
}

/** Lezen via de REST-API van Supabase, per 1000 rijen (meer geeft PostgREST nooit in één keer). */
export function restReader(url: string, key: string, fetchImpl: typeof fetch = fetch, pageSize = 1000): TableReader {
  // Een oude service_role-sleutel is een JWT (ook als Authorization); een nieuwe "sb_secret_…" enkel als apikey.
  const headers: Record<string, string> = { apikey: key, Accept: 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
  return async <T>(table: string, opts: { order: string[]; eventIds?: readonly string[] }) => {
    const out: T[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const params = new URLSearchParams({ select: '*', order: opts.order.map((c) => `${c}.asc`).join(','), limit: String(pageSize), offset: String(offset) });
      if (opts.eventIds) params.set('event_id', `in.(${opts.eventIds.join(',')})`);
      const res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/${table}?${params.toString()}`, { headers });
      if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
      const page = (await res.json()) as T[];
      out.push(...page);
      if (page.length < pageSize) return out;
    }
  };
}
