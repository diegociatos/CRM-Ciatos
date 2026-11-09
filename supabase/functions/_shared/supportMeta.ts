// WhatsApp (Cloud API) e Instagram (mensagens diretas) por empresa, via webhook oficial da Meta.
// Tudo aqui e idempotente e so age com CRM_SUPPORT_META_ENABLED=true e a conta habilitada pela empresa no banco.
// Nenhum token fica no banco: o servidor le o segredo pelo NOME derivado (token_ref) devolvido pelo banco.
import type { Env } from './outreach.ts';

const rpc = async (db: any, name: string, args: any = {}) => { const r = await db.rpc(name, args); if (r.error) throw new Error(name); return r.data; };
const GRAPH = 'https://graph.facebook.com/v21.0';
export type Channel = 'whatsapp' | 'instagram';
export type MetaMessage = { kind: 'message'; channel: Channel; account: string; ext_id: string; contact: string; name: string; text: string; at: string };
export type MetaStatus = { kind: 'status'; channel: Channel; account: string; ext_id: string; status: string; at: string; error: string | null };

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
/** Confere X-Hub-Signature-256 (HMAC-SHA256 do corpo bruto com o segredo do app) em tempo constante. */
export async function verifyMetaSignature(secret: string, raw: string, header: string | null) {
  const m = /^sha256=([0-9a-f]{64})$/i.exec(String(header || '').trim());
  if (!secret || !m) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const given = m[1].toLowerCase();
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

const isoAt = (value: unknown, ms: boolean) => {
  const n = Number(value); const now = Date.now();
  if (!Number.isFinite(n) || n <= 0) return new Date(now).toISOString();
  const t = ms ? n : n * 1000;
  return new Date(Math.min(t, now + 5 * 60000)).toISOString(); // relogio errado nao cria mensagem no futuro
};
const digits = (v: unknown, min: number, max: number) => { const s = String(v ?? ''); return new RegExp(`^[0-9]{${min},${max}}$`).test(s) ? s : null; };

function whatsappText(m: any): string | null {
  const type = String(m?.type || '');
  if (type === 'reaction') return null;
  if (type === 'text') return String(m.text?.body || '');
  if (type === 'button') return String(m.button?.text || '');
  if (type === 'interactive') return String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '');
  const safe = /^[a-z_]{1,30}$/.test(type) ? type : 'desconhecido';
  return `[Mensagem do tipo "${safe}" recebida. Abra o WhatsApp para ver o conteúdo.]`;
}

/** Normaliza o corpo do webhook (nao confia em nada: ignora o que nao reconhece). */
export function normalizeMeta(payload: any): { items: (MetaMessage | MetaStatus)[]; ignored: number } {
  const items: (MetaMessage | MetaStatus)[] = []; let ignored = 0;
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  if (payload?.object === 'whatsapp_business_account') {
    for (const e of entries) for (const ch of Array.isArray(e?.changes) ? e.changes : []) {
      const v = ch?.value; const account = digits(v?.metadata?.phone_number_id, 5, 30);
      if (ch?.field !== 'messages' || !account) { ignored++; continue; }
      const names = new Map<string, string>(); for (const c of Array.isArray(v.contacts) ? v.contacts : []) if (digits(c?.wa_id, 8, 15)) names.set(String(c.wa_id), String(c?.profile?.name || '').slice(0, 200));
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        const contact = digits(m?.from, 8, 15); const text = whatsappText(m); const id = String(m?.id || '');
        if (!contact || text === null || !id || id.length > 500) { ignored++; continue; }
        items.push({ kind: 'message', channel: 'whatsapp', account, ext_id: id, contact, name: names.get(contact) || '', text, at: isoAt(m.timestamp, false) });
      }
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) {
        const id = String(s?.id || ''); if (!id || id.length > 500 || !['sent', 'delivered', 'read', 'failed'].includes(String(s?.status))) { ignored++; continue; }
        const err = Array.isArray(s.errors) && s.errors[0] ? `Recusada pelo WhatsApp (código ${String(s.errors[0].code ?? '?').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 12)})` : null;
        items.push({ kind: 'status', channel: 'whatsapp', account, ext_id: id, status: String(s.status), at: isoAt(s.timestamp, false), error: err });
      }
    }
  } else if (payload?.object === 'instagram') {
    for (const e of entries) {
      const account = digits(e?.id, 5, 30);
      for (const ev of Array.isArray(e?.messaging) ? e.messaging : []) {
        const readMid = String(ev?.read?.mid || '');
        if (readMid && account && readMid.length <= 500) { items.push({ kind: 'status', channel: 'instagram', account, ext_id: readMid, status: 'read', at: isoAt(ev.timestamp, true), error: null }); continue; }
        const msg = ev?.message; const contact = digits(ev?.sender?.id, 5, 30); const mid = String(msg?.mid || '');
        if (!account || !msg || msg.is_echo || !contact || contact === account || !mid || mid.length > 500) { ignored++; continue; }
        const text = typeof msg.text === 'string' && msg.text ? msg.text : '[Mensagem sem texto recebida. Abra o Instagram para ver o conteúdo.]';
        items.push({ kind: 'message', channel: 'instagram', account, ext_id: mid, contact, name: '', text, at: isoAt(ev.timestamp, true) });
      }
    }
  } else ignored++;
  return { items, ignored };
}

export type WebhookResult = { status: number; body: Record<string, unknown> };
/** Trata um POST do webhook: assinatura primeiro, depois roteia por empresa. Falha de banco => 500 (a Meta reenvia; o banco e idempotente). */
export async function processMetaWebhook(db: any, env: Env, raw: string, signature: string | null): Promise<WebhookResult> {
  if (env('CRM_SUPPORT_META_ENABLED') !== 'true') return { status: 503, body: { error: 'disabled' } };
  const secret = env('META_APP_SECRET');
  if (!secret) return { status: 503, body: { error: 'not_configured' } };
  if (!(await verifyMetaSignature(secret, raw, signature))) return { status: 401, body: { error: 'invalid_signature' } };
  let payload: any; try { payload = JSON.parse(raw); } catch { return { status: 400, body: { error: 'invalid_json' } }; }
  const { items, ignored } = normalizeMeta(payload);
  let processed = 0, skipped = ignored, failed = 0;
  // Cada item e independente: um novo contato bloqueado pelo limite nao impede as mensagens de atendimentos existentes do mesmo lote.
  for (const it of items) {
    try {
      const acc = await rpc(db, 'resolve_support_meta_account', { chan: it.channel, acct: it.account });
      if (!acc) { skipped++; continue; }
      if (it.kind === 'message') await rpc(db, 'ingest_support_meta', { org: acc.organization_id, chan: it.channel, acct: it.account, ext_id: it.ext_id, contact: it.contact, contact_name: it.name, msg_body: it.text, received: it.at });
      else await rpc(db, 'apply_support_meta_status', { org: acc.organization_id, chan: it.channel, ext_id: it.ext_id, st: it.status, at: it.at, err: it.error });
      processed++;
    } catch { failed++; }
  }
  // Qualquer falha => 500: a Meta reenvia o lote e o banco ignora o que ja foi gravado.
  if (failed) return { status: 500, body: { error: 'processing_failed', processed, failed } };
  return { status: 200, body: { processed, skipped } };
}

/** Handshake de verificacao do webhook (GET). */
export function metaVerify(env: Env, url: URL): Response {
  const token = env('META_VERIFY_TOKEN'); const challenge = url.searchParams.get('hub.challenge') || '';
  if (env('CRM_SUPPORT_META_ENABLED') !== 'true' || !token || url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== token || !/^[A-Za-z0-9_-]{1,200}$/.test(challenge)) return new Response('forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}

export type Reserved = { send: boolean; status?: string; message_id?: string; channel?: Channel; account_id?: string; token_ref?: string; to?: string; body?: string };
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
const TOKEN_REF = /^META_TOKEN_(WHATSAPP|INSTAGRAM)_[0-9A-F]{32}$/;

/** Envia a resposta reservada. 4xx definitivo => FAILED; qualquer incerteza (timeout, 5xx, 429, resposta sem id) => REVIEW. Nunca reenvia sozinho. */
export async function sendSupportMetaReply(db: any, env: Env, rid: string, r: Reserved, doFetch: Fetcher = fetch): Promise<'ACCEPTED' | 'FAILED' | 'REVIEW'> {
  const finish = (result: string, ext: string | null, failure: string | null) => db.rpc('finish_support_meta_reply', { rid, result, ext_id: ext, failure });
  const token = r.token_ref && TOKEN_REF.test(r.token_ref) ? env(r.token_ref) : undefined;
  if (!token || !r.account_id || !r.to || !r.body || (r.channel !== 'whatsapp' && r.channel !== 'instagram')) { await finish('FAILED', null, 'Credencial do canal não configurada no servidor.'); return 'FAILED'; }
  const payload = r.channel === 'whatsapp'
    ? { messaging_product: 'whatsapp', recipient_type: 'individual', to: r.to, type: 'text', text: { preview_url: false, body: r.body } }
    : { recipient: { id: r.to }, messaging_type: 'RESPONSE', message: { text: r.body } };
  let res: Response;
  try {
    res = await doFetch(`${GRAPH}/${encodeURIComponent(r.account_id)}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
  } catch { await finish('REVIEW', null, 'Sem resposta do canal; confira antes de reenviar.'); return 'REVIEW'; }
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    let code = ''; try { code = String((await res.json())?.error?.code ?? ''); } catch { /* sem corpo */ }
    await finish('FAILED', null, `Recusada pelo canal (HTTP ${res.status}${/^[0-9]{1,8}$/.test(code) ? `, código ${code}` : ''})`); return 'FAILED';
  }
  let id = ''; try { const body = await res.json(); id = String(body?.messages?.[0]?.id || body?.message_id || ''); } catch { /* corpo invalido */ }
  if (res.ok && id) { const { error } = await finish('ACCEPTED', id.slice(0, 500), null); return error ? 'REVIEW' : 'ACCEPTED'; }
  await finish('REVIEW', null, 'Resposta do canal sem confirmação; confira antes de reenviar.'); return 'REVIEW';
}

/** Prova de posse: o token DESTA empresa precisa acessar a conta na Meta. Sem isso, o cadastro nao roteia nenhum evento. */
export async function verifySupportMetaAccount(db: any, env: Env, org: string, channel: string, target: { account_id?: string; token_ref?: string }, doFetch: Fetcher = fetch): Promise<'verified' | 'rejected' | 'unavailable'> {
  const token = target.token_ref && TOKEN_REF.test(target.token_ref) ? env(target.token_ref) : undefined;
  if (!token || !target.account_id || !/^[0-9]{5,30}$/.test(target.account_id) || (channel !== 'whatsapp' && channel !== 'instagram')) return 'unavailable';
  let res: Response;
  try { res = await doFetch(`${GRAPH}/${encodeURIComponent(target.account_id)}?fields=id`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }); } catch { return 'unavailable'; }
  if (res.status >= 500 || res.status === 429 || res.status === 408) return 'unavailable';
  let id = ''; try { id = String((await res.json())?.id || ''); } catch { /* corpo invalido */ }
  if (!res.ok || id !== target.account_id) return 'rejected';
  const { error } = await db.rpc('mark_support_meta_verified', { org, chan: channel, acct: target.account_id });
  return error ? 'unavailable' : 'verified';
}
