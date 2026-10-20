import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeedSql } from './seed/build';

const target = join(import.meta.dirname, '../supabase/seed.sql');
writeFileSync(target, buildSeedSql());
console.log(`Seed-data geschreven naar ${target}`);
