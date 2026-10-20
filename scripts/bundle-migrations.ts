/**
 * Voegt alle migraties samen tot één bestand (supabase/setup.sql) dat je in
 * één keer in de Supabase SQL Editor kan plakken bij een nieuw project.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function bundleMigrations(dir = join(import.meta.dirname, '../supabase/migrations')): string {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const header = `-- Sanapolis Darts: volledige databaseopzet (gegenereerd door scripts/bundle-migrations.ts).
-- Gebruik: Supabase > SQL Editor > New query > dit hele bestand plakken > Run.
-- Enkel uitvoeren op een NIEUW, leeg project.\n\n`;
  return header + files.map((f) => `-- ===== ${f} =====\n\n${readFileSync(join(dir, f), 'utf8').trim()}\n`).join('\n');
}

if (process.argv[1]?.endsWith('bundle-migrations.ts')) {
  const target = join(import.meta.dirname, '../supabase/setup.sql');
  writeFileSync(target, bundleMigrations());
  console.log(`Databaseopzet geschreven naar ${target}`);
}
