import { env, service, rpc, json } from '../_shared/runtime.ts';
import { renderMessage, sendEmail, decide } from '../_shared/outreach.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env('CRM_WORKER_SECRET') || req.headers.get('Authorization') !== `Bearer ${env('CRM_WORKER_SECRET')}`) return json({ error: 'unauthorized' }, 401);
  const db = service();
  try {
    // One job per invocation keeps each lease inside the function time budget.
    const job = await rpc(db, 'claim_outreach');
    if (!job) return json({ status: 'idle' });
    try {
      // A live enrollment is never silently completed as a simulation.
      if (!job.dry_run && env('CRM_LIVE_SEND_ENABLED') !== 'true') throw new Error('live_disabled');
      let message;
      const base = `${env('SUPABASE_URL')}/functions/v1/crm-unsubscribe?token=${job.optout_token}`;
      if (job.kind === 'EMAIL') message = renderMessage(job.config, job.lead, base);
      const gate = await rpc(db, 'authorize_dispatch', { jid: job.id, token: job.lease });
      if (!gate.allowed) return json({ status: 'blocked', reason: gate.reason });
      let outcome = 'wait'; let mid: string | null = null; let summary: string | null = null;
      if (job.kind === 'EMAIL') {
        if (job.dry_run) outcome = 'simulated';
        else { mid = await sendEmail(env, { from: gate.sender, to: job.lead.email, ...message!, unsubscribe: base, key: job.idempotency_key }); outcome = 'sent'; }
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
      return json({ status: outcome });
    } catch {
      // No provider response, body, key or lead PII is returned/logged.
      await rpc(db, 'finish_outreach', { jid: job.id, token: job.lease, outcome: 'failed', summary: 'Operação falhou. Confira configuração e provedor; não reenvie sem verificar.' });
      return json({ status: 'needs_review' });
    }
  } catch { return json({ error: 'worker_failed' }, 500); }
});
