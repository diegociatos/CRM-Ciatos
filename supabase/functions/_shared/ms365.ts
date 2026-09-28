// Microsoft 365 / Graph — envio pela caixa do grupo (OAuth delegado), mesmo
// modelo do ContaOne. Segredos cifrados com AES-GCM (CRM_CRYPTO_KEY).
export type Env = (name: string) => string | undefined;
export type Requester = typeof fetch;

export const SCOPE = 'offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read';
const AUTH = (tenant: string) => `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function chave(env: Env, uso: 'cifra' | 'assina') {
  const segredo = env('CRM_CRYPTO_KEY');
  if (!segredo || segredo.length < 32) throw new Error('crypto_not_configured');
  const bruto = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${uso}:${segredo}`)));
  return uso === 'cifra'
    ? crypto.subtle.importKey('raw', bruto, 'AES-GCM', false, ['encrypt', 'decrypt'])
    : crypto.subtle.importKey('raw', bruto, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function cifrar(env: Env, texto: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chave(env, 'cifra'), new TextEncoder().encode(texto)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64(out);
}
export async function decifrar(env: Env, cif: string) {
  const bytes = unb64(cif);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await chave(env, 'cifra'), bytes.slice(12));
  return new TextDecoder().decode(pt);
}

/** state assinado: prova que o "conectar" partiu de um dono autenticado; expira em 10 min. */
export async function assinarState(env: Env, dados: Record<string, unknown>) {
  const corpo = b64url(new TextEncoder().encode(JSON.stringify({ ...dados, t: Date.now() })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await chave(env, 'assina'), new TextEncoder().encode(corpo)));
  return `${corpo}.${b64url(sig)}`;
}
export async function verificarState(env: Env, state: string, maxIdadeMs = 10 * 60 * 1000) {
  const [corpo, sig] = String(state || '').split('.');
  if (!corpo || !sig) return null;
  const pad = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4);
  try {
    const ok = await crypto.subtle.verify('HMAC', await chave(env, 'assina'), unb64(pad(sig)), new TextEncoder().encode(corpo));
    if (!ok) return null;
    const d = JSON.parse(new TextDecoder().decode(unb64(pad(corpo))));
    return d && d.t && Date.now() - d.t <= maxIdadeMs ? d : null;
  } catch { return null; }
}

export interface Integracao {
  tenant_id?: string | null; client_id?: string | null; client_secret_cif?: string | null; refresh_token_cif?: string | null;
  conta_email?: string | null; conta_nome?: string | null; envia_como?: string | null; conectado_em?: string | null;
}

export const statusPublico = (c: Integracao | null) => ({
  appConfigurado: !!(c?.tenant_id && c?.client_id && c?.client_secret_cif),
  tenant_id: c?.tenant_id || '', client_id: c?.client_id || '',
  conectado: !!c?.refresh_token_cif, conta_email: c?.conta_email || '', conta_nome: c?.conta_nome || '',
  envia_como: c?.envia_como || '', conectado_em: c?.conectado_em || '',
});

export function urlAutorizacao(c: Integracao, redirectUri: string, state: string) {
  const q = new URLSearchParams({ client_id: c.client_id!, response_type: 'code', redirect_uri: redirectUri,
    response_mode: 'query', scope: SCOPE, state, prompt: 'select_account' });
  return `${AUTH(c.tenant_id!)}/authorize?${q}`;
}

export async function trocarToken(env: Env, c: Integracao, params: Record<string, string>, request: Requester = fetch) {
  const body = new URLSearchParams({ client_id: c.client_id!, client_secret: await decifrar(env, c.client_secret_cif!), scope: SCOPE, ...params });
  const r = await request(`${AUTH(c.tenant_id!)}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || 'Falha ao autenticar na Microsoft.');
  return j as { access_token: string; refresh_token?: string };
}

/** Access token a partir do refresh token; regrava o refresh quando a Microsoft rotaciona. */
export async function accessToken(env: Env, c: Integracao, salvarRefresh: (cif: string) => Promise<unknown>, request: Requester = fetch) {
  if (!c.refresh_token_cif || !c.client_secret_cif) throw new Error('ms365_not_connected');
  const j = await trocarToken(env, c, { grant_type: 'refresh_token', refresh_token: await decifrar(env, c.refresh_token_cif) }, request);
  if (j.refresh_token) { try { await salvarRefresh(await cifrar(env, j.refresh_token)); } catch { /* segue com o token atual */ } }
  return j.access_token;
}

export interface Mensagem { from: string; fromName?: string | null; to: string; subject: string; html?: string; text?: string; replyTo?: string | null }

/** Envia pela caixa `from` (a conectada ou uma com "Enviar como"). Graph não devolve id: 202 = aceito. */
export async function enviarGraph(token: string, m: Mensagem, request: Requester = fetch) {
  const message: Record<string, unknown> = {
    subject: m.subject,
    body: m.html ? { contentType: 'HTML', content: m.html } : { contentType: 'Text', content: m.text || '' },
    toRecipients: [{ emailAddress: { address: m.to } }],
    from: { emailAddress: { address: m.from, ...(m.fromName ? { name: m.fromName } : {}) } },
  };
  if (m.replyTo) message.replyTo = [{ emailAddress: { address: m.replyTo } }];
  const r = await request(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(m.from)}/sendMail`, {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error?.message || `graph_${r.status}`); }
  return true;
}

/**
 * Remetente de uma sessão de envio: lê a integração com o client service_role,
 * renova o token uma vez e devolve uma função de envio. Respeita o
 * interruptor global CRM_LIVE_SEND_ENABLED (exceto quando `ignorarInterruptor`,
 * usado só para testes para o próprio usuário e convites de acesso).
 */
export async function abrirRemetente(env: Env, db: any, opts: { ignorarInterruptor?: boolean } = {}, request: Requester = fetch) {
  if (!opts.ignorarInterruptor && env('CRM_LIVE_SEND_ENABLED') !== 'true') throw new Error('live_disabled');
  const { data: c, error } = await db.from('mail_integration').select('*').eq('id', 1).maybeSingle();
  if (error || !c?.refresh_token_cif) throw new Error('ms365_not_connected');
  const token = await accessToken(env, c, cif => db.from('mail_integration').update({ refresh_token_cif: cif, updated_at: new Date().toISOString() }).eq('id', 1), request);
  return {
    enviaComoPadrao: (c.envia_como || c.conta_email) as string,
    enviar: (m: Mensagem) => enviarGraph(token, m, request),
  };
}
