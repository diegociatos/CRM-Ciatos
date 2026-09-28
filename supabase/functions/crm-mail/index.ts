// Edge Function: crm-mail — e-mail de TESTE de comunicado ou cadência.
// Vai só para o próprio usuário logado, com o remetente configurado da empresa,
// para conferir aparência e entrega antes de disparar. Não depende de
// CRM_LIVE_SEND_ENABLED (não atinge nenhum contato), mas exige remetente.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service } from '../_shared/runtime.ts';
import { renderBroadcast, renderMessage, formatFrom } from '../_shared/outreach.ts';

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
  if (!pol?.sender) return json({ error: 'Configure o e-mail remetente da empresa antes do teste.' }, 400);
  const key = env('RESEND_API_KEY');
  if (!key) return json({ error: 'Envio de e-mail não configurado no servidor.' }, 503);

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

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: formatFrom(pol.sender, pol.sender_name || empresa?.nome), to: [me.user.email],
      subject: `[TESTE] ${msg.subject}`, text: msg.text, ...(msg.html ? { html: msg.html } : {}),
      ...(pol.reply_to ? { reply_to: pol.reply_to } : {}),
    }),
  });
  if (!r.ok) {
    let detalhe = '';
    try { detalhe = (await r.json())?.message || ''; } catch { /* sem corpo */ }
    return json({ error: `O provedor recusou o envio${detalhe ? `: ${detalhe}` : ''}. Confira se o domínio do remetente está verificado no Resend.` }, 502);
  }
  return json({ ok: true, para: me.user.email });
});
