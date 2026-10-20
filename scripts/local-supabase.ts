/**
 * Start een lokale nabootsing van Supabase (enkel voor ontwikkeling).
 *
 *   npm run local:supabase            lege database
 *   npm run local:supabase -- --seed  met demo-data
 *
 * Start daarna in een tweede venster: npm run dev:local
 */

import { startLocalSupabase } from './local/server';

const seed = process.argv.includes('--seed');
const port = Number(process.env.PORT ?? 54321);
const local = await startLocalSupabase({ port, seed });
console.log(`Lokale Supabase draait op ${local.url}${seed ? ' (met demo-data)' : ''}.`);
console.log('Het eerste account dat je aanmaakt via "Account aanvragen" wordt admin.');
