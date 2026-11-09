// Prova de posse da conta WhatsApp/Instagram da empresa: o administrador (JWT) pede a verificacao e o servidor confere,
// com o token SECRETO desta empresa, que a conta existe na Meta. Publicar COM verificacao de JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service, bodyLimited } from '../_shared/runtime.ts';
import { verifySupportMetaAccount } from '../_shared/supportMeta.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'Método não permitido.' }, 405);
  if (env('CRM_SUPPORT_META_ENABLED') !== 'true') return respond({ error: 'Canal desativado no servidor.' }, 403);
  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { db: { schema: 'crm' }, global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return respond({ error: 'Entre novamente.' }, 401);
  let input: Record<string, unknown>;
  try { input = JSON.parse(await bodyLimited(req, 2000)); } catch { return respond({ error: 'Pedido inválido.' }, 400); }
  const org = String(input.organization_id || ''), channel = String(input.channel || '');
  if (!uuid.test(org) || (channel !== 'whatsapp' && channel !== 'instagram')) return respond({ error: 'Pedido inválido.' }, 400);
  // O banco confere que quem pede administra esta empresa e devolve o nome (derivado) do segredo.
  const { data: target, error } = await caller.rpc('get_support_meta_target', { org, chan: channel });
  if (error || !target) return respond({ error: error?.message?.includes('Forbidden') ? 'Somente administradores verificam a conta.' : (error?.message || 'Cadastre o identificador antes de verificar.') }, 403);
  const status = await verifySupportMetaAccount(service(), env, org, channel, target);
  return respond({ status }, status === 'unavailable' ? 503 : 200);
});
