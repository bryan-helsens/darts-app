import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false zolang VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY niet ingesteld zijn. */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'niet-ingesteld', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sanapolis-darts-auth' },
});
