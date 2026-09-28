import { env, service, rpc, json } from '../_shared/runtime.ts';
import { renderMessage, renderBroadcast, decide } from '../_shared/outreach.ts';
import { abrirRemetente } from '../_shared/ms365.ts';

type Db = ReturnType<typeof service>;
type Remetente = Awaited<ReturnType<typeof abrirRemetente>>;
const unsubscribeUrl = (token: string) => `${env('SUPABASE_URL')}/functions/v1/crm-unsubscribe?token=${token}`;

// Uma renovação de token do Microsoft 365 por invocação, só quando for enviar.
let remetente: Promise<Remetente> | null = null;
const obterRemetente = (db: Db) => (remetente ??= abrirRemetente(env, db));

/** Um passo de cadência por invocação: mantém a lease dentro do tempo da função. */
async function processOutreach(db: Db): Promise<string> {
  const job = await rpc(db, 'claim_outreach');
  if (!job) return 'idle';
  try {
    // A live enrollment is never silently completed as a simulation.
    if (!job.dry_run && env('CRM_LIVE_SEND_ENABLED') !== 'true') throw new Error('live_disabled');
    let message;
    const base = unsubscribeUrl(job.optout_token);
    if (job.kind === 'EMAIL') message = renderMessage(job.config, job.lead, base);
    const gate = await rpc(db, 'authorize_dispatch', { jid: job.id, token: job.lease });
    if (!gate.allowed) return `blocked:${gate.reason}`;
    let outcome = 'wait'; let mid: string | null = null; let summary: string | null = null;
    if (job.kind === 'EMAIL') {
      if (job.dry_run) outcome = 'simulated';
      else {
        const r = await obterRemetente(db);
        await r.enviar({ from: gate.sender, fromName: gate.sender_name, replyTo: gate.reply_to, to: job.lead.email, subject: message!.subject, text: message!.text });
        outcome = 'sent';
      }
    } else if (job.kind === 'AI_DECISION') {
      if (job.dry_run) { outcome = 'handoff'; summary = 'Simulação: revisão humana sem consulta a provedor de IA.'; }
      else {
        const run = await rpc(db, 'reserve_ai_run', { org: job.organization_id, lid: job.lead_id });
        const result = await decide(env, { company: job.lead.company, segment: job.lead.segment });
        await rpc(db, 'complete_ai_run', { rid: run, provider_name: result.provider, model_name: result.model, decision: result.decision, tokens_in: result.tokens_in, tokens_out: result.tokens_out });
        outcome = result.decision.action === 'continue' ? 'wait' : 'handoff'; summary = result.decision.summary;
      }
    } else if (job.kind !== 'WAIT') { outcome = 'handoff'; summary = String(job.config.reason || 'Próxima ação requer revisão humana.'); }
    await rpc(db, 'finish_outreach', { jid: job.id, token: job.lease, outcome, message_id: mid, summary });
    return outcome;
  } catch {
    // No provider response, body, key or lead PII is returned/logged.
    await rpc(db, 'finish_outreach', { jid: job.id, token: job.lease, outcome: 'failed', summary: 'Operação falhou. Confira configuração e provedor; não reenvie sem verificar.' });
    return 'needs_review';
  }
}

/**
 * Um lote de comunicado por invocação. Microsoft 365 aceita 30 mensagens/min
 * por caixa: lote de 20 + 1 passo de cadência fica abaixo, com pausa curta.
 */
async function processBroadcast(db: Db): Promise<string> {
  if (env('CRM_LIVE_SEND_ENABLED') !== 'true') return 'broadcast_disabled';
  const lote = await rpc(db, 'claim_broadcast_batch', { max_n: 20 });
  if (!lote) return 'broadcast_idle';
  let enviados = 0;
  let envio: Remetente | null = null;
  try { envio = await obterRemetente(db); } catch { /* cada destinatário falha abaixo, sem reenvio */ }
  for (const r of lote.recipients as any[]) {
    const unsub = unsubscribeUrl(r.optout_token);
    try {
      if (!envio) throw new Error('ms365_not_connected');
      const m = renderBroadcast(lote, { name: r.nome || '', company: r.empresa || '' }, unsub);
      await envio.enviar({ from: lote.sender, fromName: lote.sender_name, replyTo: lote.reply_to, to: r.email, subject: m.subject, html: m.html });
      await rpc(db, 'finish_broadcast_recipient', { rid: r.id, token: r.lease_token, ok: true });
      enviados++;
    } catch (e) {
      await rpc(db, 'finish_broadcast_recipient', { rid: r.id, token: r.lease_token, ok: false, motivo: (e as Error).message }).catch(() => {});
    }
    await new Promise(res => setTimeout(res, 300));
  }
  return `broadcast_sent:${enviados}`;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env('CRM_WORKER_SECRET') || req.headers.get('Authorization') !== `Bearer ${env('CRM_WORKER_SECRET')}`) return json({ error: 'unauthorized' }, 401);
  const db = service();
  remetente = null;
  const status: Record<string, string> = {};
  try { status.outreach = await processOutreach(db); } catch { status.outreach = 'error'; }
  try { status.broadcast = await processBroadcast(db); } catch { status.broadcast = 'error'; }
  return json({ status });
});
