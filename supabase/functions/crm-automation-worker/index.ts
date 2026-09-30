import { env, service, rpc, json } from '../_shared/runtime.ts';
import { renderMessage, renderBroadcast, decide } from '../_shared/outreach.ts';
import { abrirRemetente, GraphError } from '../_shared/ms365.ts';
import { renderAviso, eventoFase, eventoAgenda } from '../_shared/onboarding.ts';
import { processSdr, cadenceHtml, hotAlertText } from '../_shared/sdr.ts';
import { processSdrInbox } from '../_shared/sdrInbox.ts';

const appUrl = () => (env('CRM_APP_URLS') || 'https://crm.grupociatos.com.br').split(',')[0].trim();

// Avisos do onboarding são transacionais (equipe e cliente em implantação):
// não dependem do interruptor de prospecção, só da caixa conectada.
let remetenteTransacional: Promise<Remetente> | null = null;
const obterTransacional = (db: Db) => (remetenteTransacional ??= abrirRemetente(env, db, { ignorarInterruptor: true }));

async function processOnboarding(db: Db): Promise<string> {
  await rpc(db, 'enqueue_onboarding_reminders');
  const lote = await rpc(db, 'claim_onboarding_notifications', { max_n: 5 });
  if (!lote) return 'idle';
  let envio: Remetente | null = null;
  try { envio = await obterTransacional(db); } catch { /* falha abaixo, com nova tentativa */ }
  let enviados = 0;
  for (const n of lote as any[]) {
    try {
      if (!envio) throw new Error('ms365_not_connected');
      const m = renderAviso(n, appUrl());
      await envio.enviar({ from: envio.enviaComoPadrao, fromName: n.empresa, to: n.para, subject: m.subject, html: m.html, replyTo: m.replyTo });
      await rpc(db, 'finish_onboarding_notification', { nid: n.id, token: n.lease, ok: true });
      enviados++;
    } catch (e) {
      await rpc(db, 'finish_onboarding_notification', { nid: n.id, token: n.lease, ok: false, motivo: (e as Error).message }).catch(() => {});
    }
    await new Promise(res => setTimeout(res, 300));
  }
  return `sent:${enviados}`;
}

/**
 * Convites no Outlook: prazos das fases (dia inteiro) e compromissos da Agenda.
 * Criados no calendário da caixa do grupo; se a conta conectada não tiver
 * acesso a ele, cai no calendário da própria conta conectada.
 */
async function processCalendar(db: Db): Promise<string> {
  const w = await rpc(db, 'claim_calendar_work', { max_n: 8 });
  if (!w.steps.length && !w.agenda.length && !w.cancelar.length) return 'idle';
  let envio: Remetente;
  try { envio = await obterTransacional(db); } catch { return 'ms365_not_connected'; }
  let base = `/users/${encodeURIComponent(envio.enviaComoPadrao)}`;
  const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
    try { return await envio.graph(metodo, `${base}${caminho}`, corpo); }
    catch (e) {
      if (e instanceof GraphError && (e.status === 403 || /access ?is ?denied|ErrorAccessDenied/i.test(e.message)) && base !== '/me') {
        base = '/me'; return envio.graph(metodo, `${base}${caminho}`, corpo);
      }
      throw e;
    }
  };
  const salvar = async (evId: string | null, corpo: unknown) => {
    if (evId) {
      try { await chamar('PATCH', `/events/${encodeURIComponent(evId)}`, corpo); return evId; }
      catch (e) { if (!(e instanceof GraphError && e.status === 404)) throw e; }
    }
    const novo = await chamar('POST', '/events', corpo) as { id: string };
    return novo.id;
  };
  const cancelar = async (evId: string, motivo: string) => {
    try { await chamar('POST', `/events/${encodeURIComponent(evId)}/cancel`, { comment: motivo }); }
    catch (e) { if (!(e instanceof GraphError && (e.status === 404 || e.status === 400))) throw e; }
  };
  let ok = 0;
  for (const s of w.steps as any[]) {
    try {
      let evId: string | null = s.calendar_event_id;
      if (s.status === 'Concluido' || !s.prazo || !s.resp_email) {
        if (evId) await cancelar(evId, s.status === 'Concluido' ? 'Fase concluída no CRM.' : 'Fase sem prazo ou sem responsável.');
        evId = null;
      } else {
        evId = await salvar(evId, eventoFase(s, appUrl()));
      }
      await rpc(db, 'finish_calendar_item', { kind: 'step', item_id: s.id, ok: true, event_id: evId });
      ok++;
    } catch (e) { await rpc(db, 'finish_calendar_item', { kind: 'step', item_id: s.id, ok: false, motivo: (e as Error).message }).catch(() => {}); }
  }
  for (const a of w.agenda as any[]) {
    try {
      let evId: string | null = a.calendar_event_id;
      if (!a.convidados?.length) { if (evId) await cancelar(evId, 'Compromisso sem participantes.'); evId = null; }
      else evId = await salvar(evId, eventoAgenda(a));
      await rpc(db, 'finish_calendar_item', { kind: 'agenda', item_id: a.id, ok: true, event_id: evId });
      ok++;
    } catch (e) { await rpc(db, 'finish_calendar_item', { kind: 'agenda', item_id: a.id, ok: false, motivo: (e as Error).message }).catch(() => {}); }
  }
  for (const c of w.cancelar as any[]) {
    try { await cancelar(c.event_id, 'Removido no CRM.'); await rpc(db, 'finish_calendar_item', { kind: 'cancel', item_id: String(c.id), ok: true }); ok++; }
    catch (e) { await rpc(db, 'finish_calendar_item', { kind: 'cancel', item_id: String(c.id), ok: false, motivo: (e as Error).message }).catch(() => {}); }
  }
  return `synced:${ok}`;
}

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
        const {data:identity,error:identityError}=await db.from('automation_jobs').select('reply_token,tracking_token').eq('id',job.id).single();
        const {data:settings,error:settingsError}=await db.from('sdr_settings').select('tracking_enabled').eq('organization_id',job.organization_id).maybeSingle();
        if(identityError||settingsError)throw new Error('tracking_configuration_failed');
        const pixel=settings?.tracking_enabled?`${env('SUPABASE_URL')}/functions/v1/crm-email-open?t=${identity.tracking_token}`:undefined;
        await r.enviar({ from: gate.sender, fromName: gate.sender_name, replyTo: gate.reply_to, to: job.lead.email, subject: `${message!.subject} [Ciatos:${identity.reply_token}]`, html:cadenceHtml(message!.text,pixel) });
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
  const workerLease=await rpc(db,'claim_sdr_worker');
  if(!workerLease)return json({status:'already_running'});
  remetente = null; remetenteTransacional = null;
  const aiProvider=env('CRM_AI_PROVIDER')||'openai';
  const aiConfigured=['openai','anthropic'].includes(aiProvider)
    && !!env(aiProvider==='openai'?'CRM_OPENAI_MODEL':'CRM_CLAUDE_MODEL')
    && !!env(aiProvider==='openai'?'OPENAI_API_KEY':'ANTHROPIC_API_KEY');
  const status: Record<string, string> = {
    snov:env('SNOV_CLIENT_ID')&&env('SNOV_CLIENT_SECRET')?(env('CRM_SNOV_ENABLED')==='true'?'configured':'disabled'):'credentials_missing',
    ai:env('CRM_AI_ENABLED')!=='true'?'disabled':aiConfigured?'configured':'credentials_missing',
    ai_provider:aiProvider,
  };
  // Read replies before sending the next step. A failure is observable and new autonomous
  // enrollments remain behind company settings; unrelated onboarding is not affected.
  try {
    if(env('CRM_REPLY_READ_ENABLED')==='true'){
      const r=await abrirRemetente(env,db,{ignorarInterruptor:true,readReplies:true});status.inbox=await processSdrInbox(db,env,r.graph);
    }else status.inbox='read_permission_required';
  }catch{status.inbox='needs_configuration';}
  try { status.agent=await processSdr(db,env); }catch{status.agent='error';}
  try { status.outreach = await processOutreach(db); } catch { status.outreach = 'error'; }
  try { status.broadcast = await processBroadcast(db); } catch { status.broadcast = 'error'; }
  try { status.onboarding = await processOnboarding(db); } catch { status.onboarding = 'error'; }
  try { status.calendar = await processCalendar(db); } catch { status.calendar = 'error'; }
  try {
    const alert=await rpc(db,'claim_sdr_alert');
    if(alert){
      let ok=false;
      try{const r=await obterTransacional(db);await r.enviar({from:alert.sender||r.enviaComoPadrao,to:alert.recipient,subject:'Ciatos CRM · lead quente para atendimento',text:hotAlertText(alert,appUrl())});ok=true;}catch{ /* Uncertain sends are reviewed, never blindly retried. */ }
      await rpc(db,'finish_sdr_alert',{aid:alert.id,token:alert.mail_lease,ok});status.hot_alert=ok?'sent':'review';
    }
  }catch{status.hot_alert='error';}
  await rpc(db,'finish_sdr_worker',{token:workerLease,report:status});
  return json({ status });
});
