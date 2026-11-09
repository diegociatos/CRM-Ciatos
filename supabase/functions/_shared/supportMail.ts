// E-mail de suporte espontaneo: leitura da caixa da empresa, confirmacao automatica e reconciliacao.
// Tudo aqui e idempotente e so age com CRM_SUPPORT_MAIL_ENABLED=true E a conta habilitada no banco.
import { replyText } from './sdrInbox.ts';
import type { Env } from './outreach.ts';

const rpc = async (db: any, name: string, args: any = {}) => { const r = await db.rpc(name, args); if (r.error) throw new Error(name); return r.data; };
export type Graph = (method: string, path: string) => Promise<any>;
type Header = { name: string; value: string };
const header = (headers: Header[] | undefined, name: string) => (headers || []).find(h => String(h.name).toLowerCase() === name)?.value;

export type IngestArgs = { org: string; ext_id: string; thread: string; sender: string; sender_name: string; mail_subject: string; mail_body: string; received: string; automatic: boolean; verified: boolean };
export type Mapped = { skip: string } | { args: Omit<IngestArgs, 'org' | 'box'> };

/** Converte uma mensagem do Graph. Ignora rascunho, automaticas, listas, no-reply e o proprio remetente. */
export function mapGraphMessage(m: any, mailbox: string): Mapped {
  if (!m?.id || m.isDraft) return { skip: 'draft' };
  const address = String(m.from?.emailAddress?.address || '').trim().toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) return { skip: 'invalid_sender' };
  if (address === mailbox.toLowerCase()) return { skip: 'own_mailbox' };
  if (/^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounce)/i.test(address.split('@')[0])) return { skip: 'no_reply' };
  const h: Header[] | undefined = m.internetMessageHeaders;
  if (header(h, 'x-ciatos-auto')) return { skip: 'own_auto_message' };
  const auto = header(h, 'auto-submitted');
  if (auto !== undefined && auto.toLowerCase() !== 'no') return { skip: 'auto_submitted' };
  if (header(h, 'x-auto-response-suppress') !== undefined) return { skip: 'auto_response_suppress' };
  if (/^(bulk|list|junk)$/i.test(String(header(h, 'precedence') || ''))) return { skip: 'bulk' };
  if (header(h, 'list-id') !== undefined || header(h, 'list-unsubscribe') !== undefined) return { skip: 'mailing_list' };
  // Remetente autenticado (DMARC/CompAuth) segundo o Exchange: so assim a confirmacao automatica pode ser enviada.
  const verified = /(dmarc|compauth)=pass/i.test(String(header(h, 'authentication-results') || ''));
  const body = replyText(m.uniqueBody) || '(Mensagem sem texto legível; confira a caixa de e-mail.)';
  return { args: { ext_id: `graph:${mailbox.toLowerCase()}:${m.id}`, thread: String(m.conversationId || `msg:${m.id}`).slice(0, 500), sender: address, sender_name: String(m.from?.emailAddress?.name || '').slice(0, 200), mail_subject: String(m.subject || '').slice(0, 250), mail_body: body, received: m.receivedDateTime, automatic: false, verified } };
}

export function supportPagePath(next: string, mailbox: string) {
  const u = new URL(next);
  const prefix = `/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages`;
  if (u.origin !== 'https://graph.microsoft.com' || decodeURIComponent(u.pathname) !== decodeURIComponent(prefix) || u.username || u.password) throw new Error('invalid_graph_page');
  return u.pathname.slice('/v1.0'.length) + u.search;
}

/** Le uma pagina da caixa de suporte. Reprocessar uma pagina e seguro: o banco ignora ids ja importados. */
export async function processSupportMailbox(db: any, env: Env, graph: Graph) {
  if (env('CRM_SUPPORT_MAIL_ENABLED') !== 'true') return 'disabled';
  const acc = await rpc(db, 'claim_support_account');
  if (!acc) return 'idle';
  let through: string = acc.watermark;
  try {
    const base = `/users/${encodeURIComponent(acc.mailbox)}/mailFolders/inbox/messages`;
    const query = new URLSearchParams({ '$select': 'id,subject,from,receivedDateTime,conversationId,isDraft,internetMessageHeaders,uniqueBody', '$filter': `receivedDateTime ge ${new Date(Date.parse(acc.watermark) - 60000).toISOString()}`, '$orderby': 'receivedDateTime asc', '$top': '20' });
    const page = await graph('GET', acc.next_path ? supportPagePath(acc.next_path, acc.mailbox) : `${base}?${query}`);
    if (!Array.isArray(page?.value)) throw new Error('invalid_page');
    for (const m of page.value) {
      if (Date.parse(m.receivedDateTime) > Date.parse(through)) through = m.receivedDateTime;
      const mapped = mapGraphMessage(m, acc.mailbox);
      if ('skip' in mapped) continue;
      await rpc(db, 'ingest_support_email', { org: acc.organization_id, box: acc.mailbox, ...mapped.args });
    }
    const next = page['@odata.nextLink'] || null;
    if (next) supportPagePath(next, acc.mailbox);
    await rpc(db, 'finish_support_account', { org: acc.organization_id, token: acc.lease, next_url: next, through_at: through, failure: null });
    return 'synced';
  } catch {
    await db.rpc('finish_support_account', { org: acc.organization_id, token: acc.lease, next_url: null, through_at: acc.watermark, failure: 'Não foi possível ler a caixa de suporte.' });
    return 'needs_configuration';
  }
}

export type Sender = (m: { from: string; to: string; subject: string; text: string; headers?: Record<string, string> }) => Promise<unknown>;
/** Envia a proxima confirmacao. Falha definitiva (4xx) => FAILED; qualquer outra incerteza => UNCERTAIN (nunca reenvia sozinho). */
export async function processSupportOutbox(db: any, env: Env, send: Sender) {
  if (env('CRM_SUPPORT_MAIL_ENABLED') !== 'true') return 'disabled';
  const job = await rpc(db, 'claim_support_outbox');
  if (!job) return 'idle';
  let outcome: 'ACCEPTED' | 'FAILED' | 'UNCERTAIN' = 'ACCEPTED'; let failure: string | null = null;
  try {
    await send({ from: job.mailbox, to: job.recipient, subject: job.subject, text: job.body, headers: { 'X-Ciatos-Auto': 'ack', 'X-Ciatos-Outbox': job.id, 'X-Auto-Response-Suppress': 'All' } });
  } catch (e: any) {
    const status = Number(e?.status);
    const definitive = status >= 400 && status < 500 && status !== 408 && status !== 429;
    outcome = definitive ? 'FAILED' : 'UNCERTAIN'; failure = definitive ? `Recusada pelo provedor (HTTP ${status})` : 'Sem resposta confiável do provedor';
  }
  // Se registrar o resultado falhar, o item fica SENDING e e tratado como incerto e reconciliado depois.
  await db.rpc('finish_support_outbox', { oid: job.id, outcome, failure });
  return outcome.toLowerCase();
}

export const sentAckMatch = (items: any[] | undefined, id: string) => (items || []).some(i => header(i.internetMessageHeaders, 'x-ciatos-outbox') === id);

/** Confere Itens Enviados para resultados incertos. So conclui "nao enviado" com listagem completa. */
export async function reconcileSupportOutbox(db: any, graph: Graph) {
  const list = await rpc(db, 'list_support_outbox_uncertain');
  let checked = 0;
  for (const o of list as any[]) {
    try {
      const since = new Date(Date.parse(o.started_at) - 60000).toISOString();
      const page = await graph('GET', `/users/${encodeURIComponent(o.mailbox)}/mailFolders/sentitems/messages?${new URLSearchParams({ '$filter': `sentDateTime ge ${since}`, '$select': 'id,sentDateTime,internetMessageHeaders', '$top': '50' })}`);
      if (!Array.isArray(page?.value)) continue;
      const found = sentAckMatch(page.value, o.id);
      if (!found && page['@odata.nextLink']) continue;
      await rpc(db, 'reconcile_support_outbox', { oid: o.id, found_in_sent: found });
      checked++;
    } catch { /* inconclusivo: permanece incerto */ }
  }
  return checked;
}
