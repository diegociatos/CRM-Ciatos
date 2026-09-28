// Edge Function: crm-mail — e-mail de TESTE de comunicado ou cadência.
// Vai só para o próprio usuário logado, pela caixa do Microsoft 365 e com o
// remetente configurado da empresa, para conferir aparência e entrega antes de
// disparar. Não depende de CRM_LIVE_SEND_ENABLED (não atinge nenhum contato).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service } from '../_shared/runtime.ts';
import { renderBroadcast, renderMessage } from '../_shared/outreach.ts';
import { abrirRemetente } from '../_shared/ms365.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const caller = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, {
    db: { schema: 'crm' }, global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false },
  });
  const { data: me } = await caller.auth.getUser();
  if (!me?.user?.email) return json({ error: 'Não autenticado' }, 401);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  if (p?.action !== 'test') return json({ error: 'Ação desconhecida' }, 400);
  const org = String(p.organization_id || '');
  const { data: pode, error: ePode } = await caller.rpc('pode_administrar', { org });
  if (ePode || !pode) return json({ error: 'Somente administradores da empresa enviam testes.' }, 403);

  const db = service();
  const { data: pol } = await db.from('outreach_policy').select('sender, sender_name, reply_to').eq('organization_id', org).maybeSingle();
  const { data: empresa } = await db.from('organizations').select('nome').eq('id', org).maybeSingle();

  const unsub = `${env('SUPABASE_URL')}/functions/v1/crm-unsubscribe?token=00000000-0000-4000-8000-000000000000`;
  const exemplo = { name: String(p.nome_exemplo || 'Maria Silva'), company: String(p.empresa_exemplo || 'Empresa Exemplo') };
  let msg: { subject: string; text: string; html?: string };
  try {
    msg = p.kind === 'cadence'
      ? renderMessage({ subject: p.assunto, body: p.corpo }, exemplo, unsub)
      : renderBroadcast({ assunto: p.assunto, corpo: p.corpo, empresa_remetente: empresa?.nome || '' }, exemplo, unsub);
  } catch {
    return json({ error: 'Assunto ou mensagem inválidos (use só {{name}} e {{company}}; assunto em uma linha).' }, 400);
  }

  let envio;
  try { envio = await abrirRemetente(env, db, { ignorarInterruptor: true }); }
  catch { return json({ error: 'A caixa do Microsoft 365 não está conectada. Conecte em Comunicados → Configuração de envio.' }, 400); }
  const from = pol?.sender || envio.enviaComoPadrao;
  try {
    await envio.enviar({ from, fromName: pol?.sender_name || empresa?.nome, to: me.user.email, replyTo: pol?.reply_to,
      subject: `[TESTE] ${msg.subject}`, ...(msg.html ? { html: msg.html } : { text: msg.text }) });
  } catch (e) {
    const m = (e as Error).message || '';
    return json({ error: /SendAs|send as|not have permission|ErrorAccessDenied/i.test(m)
      ? `A caixa conectada não tem permissão "Enviar como" para ${from}. Libere no Exchange ou use a própria caixa conectada.`
      : `O Microsoft 365 recusou o envio: ${m.slice(0, 200)}` }, 502);
  }
  return json({ ok: true, para: me.user.email, de: from });
});
