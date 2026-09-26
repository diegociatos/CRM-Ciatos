import { createClient } from '@supabase/supabase-js';

// A anon key é pública por design; a segurança vem da RLS no schema `crm`.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigurado = !!(url && anon);

if (!supabaseConfigurado) {
  console.error('[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes. Configure o .env.local.');
}

export const supabase = createClient(url ?? 'http://localhost', anon ?? 'anon', {
  db: { schema: 'crm' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'ciatos_crm_auth',
  },
});
