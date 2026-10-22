/**
 * Zet de demo-data (src/demo/demoData.ts) om naar SQL voor supabase/seed.sql.
 * Vaste datums, zodat het bestand reproduceerbaar is. In de app laadt een
 * admin dezelfde data rond de datum van vandaag via "Demo-data laden".
 */

import { buildDemoDataset, type DemoDataset } from '../../src/demo/demoData';
import { thirdSaturday } from '../../src/lib/time';

export { demoUuid } from '../../src/demo/demoData';

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  // Enkel de beurten (smallint[]) zijn een lijst; null = bust.
  if (Array.isArray(v)) return `'{${v.map((x) => (x === null ? 'NULL' : String(x))).join(',')}}'`;
  if (typeof v === 'object') return `${q(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replaceAll("'", "''")}'`;
};

/** Volgorde waarin de tabellen gevuld worden (vreemde sleutels). */
export const DEMO_TABLES = [
  'players',
  'player_contacts',
  'seasons',
  'events',
  'event_secrets',
  'registrations',
  'pools',
  'pool_members',
  'matches',
  'match_stats',
  'match_legs',
  'event_log',
  'event_results',
] as const satisfies ReadonlyArray<keyof DemoDataset>;

function insert(table: string, rows: ReadonlyArray<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]);
  const values = rows.map((r) => `  (${columns.map((c) => q(r[c])).join(', ')})`).join(',\n');
  return `insert into public.${table} (${columns.join(', ')}) values\n${values};\n`;
}

export function seedDataset(): DemoDataset {
  return buildDemoDataset({
    seasonName: 'Demoseizoen 2026',
    seasonStart: '2026-01-01',
    seasonEnd: '2026-12-31',
    playedDates: [1, 2, 3, 4, 5, 6].map((m) => thirdSaturday(2026, m)),
    practice: { date: thirdSaturday(2026, 11), registrationCloses: '18:30', notes: 'Testavond met de nieuwe app.' },
    createdAt: '2025-12-31T00:00:00.000Z',
  });
}

export function buildSeedSql(): string {
  const data = seedDataset();
  const out = [
    `-- Demo-data voor Sanapolis Darts (gegenereerd door scripts/generate-seed.ts, niet met de hand aanpassen).
-- Laden: Supabase > SQL Editor > dit bestand plakken > Run. Verwijderen: supabase/demo-cleanup.sql.
-- In de app kan een admin dezelfde data laden via Beheer > Demo-data laden.
begin;
select set_config('app.skip_audit', 'on', true);
select set_config('app.skip_advance', 'on', true);
`,
  ];
  for (const table of DEMO_TABLES) out.push(insert(table, data[table]));
  out.push(`select set_config('app.skip_audit', '', true);\nselect set_config('app.skip_advance', '', true);\ncommit;\n`);
  return out.join('');
}
