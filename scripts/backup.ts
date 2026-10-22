/**
 * Nachtelijke back-up (GitHub Actions, .github/workflows/backup.yml):
 * schrijft per seizoen een JSON-bestand naar de opgegeven map. De workflow
 * versleutelt die map daarna met 7-Zip; onversleuteld wordt niets bewaard.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/backup.ts backup/
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectBackups, restReader } from './backup/collect';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outDir = process.argv[2] ?? 'backup';
if (!url || !key) {
  console.error('SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zijn nodig.');
  process.exit(1);
}

const files = await collectBackups(restReader(url, key), new Date().toISOString());
mkdirSync(outDir, { recursive: true });
for (const f of files) writeFileSync(join(outDir, f.name), f.content);
console.log(`Back-up: ${files.length} bestand(en) geschreven.`);
