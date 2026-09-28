// Edge Function: crm-ms365 — configura o app do Entra e conecta a caixa do
// Microsoft 365 que envia os e-mails do CRM (comunicados, cadências, convites).
//   POST {action:'status'}                      qualquer membro do CRM
//   POST {action:'save_app', tenant_id, client_id, client_secret?, envia_como?}  dono da plataforma
//   POST {action:'connect', origin}             dono → devolve URL de login da Microsoft
//   POST {action:'disconnect'}                  dono
//   GET  ?code=…&state=…                        retorno do login da Microsoft (verify_jwt=false)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service } from '../_shared/runtime.ts';
import { assinarState, verificarState, cifrar, statusPublico, trocarToken, urlAutorizacao } from '../_shared/ms365.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const redirectUri = () => `${env('SUPABASE_URL')}/functions/v1/crm-ms365`;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function origemPermitida(o: unknown): string {
  const lista = (env('CRM_APP_URLS') || 'https://crm.grupociatos.com.br').split(',').map(s => s.trim()).filter(Boolean);
  return typeof o === 'string' && lista.includes(o) ? o : lista[0];
}

async function retorno(req: Request) {
  const url = new URL(req.url);
  const db = service();
  const st = await verificarState(env, url.searchParams.get('state') || '');
  const destino = (ok: boolean, motivo = '') => Response.redirect(`${origemPermitida(st?.origin)}/?ms365=${ok ? 'ok' : 'erro'}${motivo ? `&motivo=${encodeURIComponent(motivo)}` : ''}`, 302);
  if (!st) return destino(false, 'Link de conexão inválido ou expirado. Tente conectar de novo.');
  if (url.searchParams.get('error')) return destino(false, url.searchParams.get('error_description') || 'Login cancelado.');
  const code = url.searchParams.get('code');
  if (!code) return destino(false, 'A Microsoft não devolveu o código de acesso.');
  try {
    const { data: c } = await db.from('mail_integration').select('*').eq('id', 1).maybeSingle();
    if (!c?.client_secret_cif) return destino(false, 'App do Microsoft 365 não configurado.');
    const tok = await trocarToken(env, c, { grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
    if (!tok.refresh_token) return destino(false, 'A Microsoft não liberou acesso contínuo (offline_access).');
    const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json()).catch(() => ({}));
    const email = String(me.mail || me.userPrincipalName || '').toLowerCase();
    await db.from('mail_integration').update({
      refresh_token_cif: await cifrar(env, tok.refresh_token), conta_email: email || null, conta_nome: me.displayName || null,
      envia_como: c.envia_como || email || null, conectado_em: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', 1);
    return destino(true);
  } catch (e) {
    return destino(false, (e as Error).message.slice(0, 200));
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return retorno(req);
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    db: { schema: 'crm' }, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user) return json({ error: 'Não autenticado' }, 401);
  let p: any;
  try { p = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const db = service();
  const { data: c } = await db.from('mail_integration').select('*').eq('id', 1).maybeSingle();

  if (p.action === 'status') {
    const { data: perfil } = await db.from('profiles').select('ativo').eq('id', me.user.id).maybeSingle();
    if (!perfil?.ativo) return json({ error: 'Sem acesso ao CRM' }, 403);
    return json(statusPublico(c));
  }

  const { data: dono } = await caller.rpc('platform_admin');
  if (!dono) return json({ error: 'Somente o dono da plataforma configura o Microsoft 365.' }, 403);

  try {
    if (p.action === 'save_app') {
      const tenant = String(p.tenant_id || '').trim(), client = String(p.client_id || '').trim(), envia = String(p.envia_como || '').trim().toLowerCase();
      if (!/^[0-9a-f-]{36}$|^[a-z0-9.-]+\.[a-z]{2,}$/i.test(tenant)) return json({ error: 'Tenant ID inválido (GUID ou domínio).' }, 400);
      if (!/^[0-9a-f-]{36}$/i.test(client)) return json({ error: 'Client ID inválido (GUID).' }, 400);
      if (envia && !EMAIL_RE.test(envia)) return json({ error: 'Endereço "enviar como" inválido.' }, 400);
      const patch: Record<string, unknown> = { tenant_id: tenant, client_id: client, envia_como: envia || c?.envia_como || null, updated_at: new Date().toISOString() };
      const segredo = String(p.client_secret || '').trim();
      if (segredo) patch.client_secret_cif = await cifrar(env, segredo);
      else if (!c?.client_secret_cif) return json({ error: 'Informe o client secret.' }, 400);
      // Trocar de app invalida a conexão anterior.
      if (c?.client_id && c.client_id !== client) Object.assign(patch, { refresh_token_cif: null, conta_email: null, conta_nome: null, conectado_em: null });
      await db.from('mail_integration').update(patch).eq('id', 1);
      const { data: novo } = await db.from('mail_integration').select('*').eq('id', 1).maybeSingle();
      return json(statusPublico(novo));
    }
    if (p.action === 'connect') {
      if (!c?.client_secret_cif || !c.tenant_id || !c.client_id) return json({ error: 'Salve o app do Microsoft 365 antes de conectar.' }, 400);
      const state = await assinarState(env, { uid: me.user.id, origin: origemPermitida(p.origin) });
      return json({ url: urlAutorizacao(c, redirectUri(), state, env('CRM_REPLY_READ_ENABLED')==='true'), redirect_uri: redirectUri() });
    }
    if (p.action === 'disconnect') {
      await db.from('mail_integration').update({ refresh_token_cif: null, conta_email: null, conta_nome: null, conectado_em: null, updated_at: new Date().toISOString() }).eq('id', 1);
      return json({ ok: true });
    }
    return json({ error: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message === 'crypto_not_configured' ? 'Chave de criptografia do servidor não configurada.' : 'Não foi possível salvar.' }, 500);
  }
});
