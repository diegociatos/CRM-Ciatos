// Worker do e-mail de suporte. Desligado por padrao: exige CRM_SUPPORT_MAIL_ENABLED=true, a conta habilitada
// por um administrador no banco, Mail.Read.Shared (leitura) e CRM_LIVE_SEND_ENABLED=true (confirmacao).
import { env, service, json } from '../_shared/runtime.ts';
import { abrirRemetente } from '../_shared/ms365.ts';
import { processSupportMailbox, processSupportOutbox, reconcileSupportOutbox } from '../_shared/supportMail.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env('CRM_WORKER_SECRET') || req.headers.get('Authorization') !== `Bearer ${env('CRM_WORKER_SECRET')}`) return json({ error: 'unauthorized' }, 401);
  if (env('CRM_SUPPORT_MAIL_ENABLED') !== 'true') return json({ status: 'disabled' });
  const db = service();
  const status: Record<string, string | number> = {};
  try {
    const reader = await abrirRemetente(env, db, { ignorarInterruptor: true, readReplies: true });
    status.ingest = await processSupportMailbox(db, env, reader.graph);
    status.reconciled = await reconcileSupportOutbox(db, reader.graph);
  } catch { status.ingest = 'needs_configuration'; }
  try {
    const sender = await abrirRemetente(env, db);
    let last = 'idle';
    for (let i = 0; i < 5; i++) { last = await processSupportOutbox(db, env, sender.enviar); if (last === 'idle' || last === 'disabled') break; }
    status.ack = last;
  } catch { status.ack = 'send_disabled'; }
  return json({ status });
});
