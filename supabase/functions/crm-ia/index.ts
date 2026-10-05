// Edge Function: crm-ia — IA do CRM (OpenAI ou Claude) no servidor. A chave nunca vai ao navegador.
// Ações:
//   objecao  → resposta estruturada a uma objeção de venda
//   email    → personaliza um template de e-mail para um lead
//   O Radar usa crm-snov-search; descoberta de empresas não consome tokens de IA.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AiBillingError, requestOpenAiStructured } from '../_shared/crmIaOpenAi.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROVIDER = Deno.env.get('CRM_AI_PROVIDER') || 'openai';
const MODELO = Deno.env.get(PROVIDER === 'openai' ? 'CRM_OPENAI_MODEL' : 'CRM_CLAUDE_MODEL') || '';
// Chave sem escopo de workspace exige o header anthropic-workspace-id.
const WORKSPACE = Deno.env.get('CRM_ANTHROPIC_WORKSPACE_ID');

const CONTEXTO_CIATOS = `O Grupo Ciatos (Belo Horizonte/MG) vende serviços de contabilidade, planejamento tributário,
recuperação de créditos, holding familiar/planejamento patrimonial e consultoria empresarial para PMEs.
Tom: consultivo, direto, sem jargão excessivo, em português do Brasil.`;

/** Chamada com fallback automático do servidor quando o modelo recusa. */
async function chamarClaude(params: Record<string, unknown>) {
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), ...(WORKSPACE ? { defaultHeaders: { 'anthropic-workspace-id': WORKSPACE } } : {}) });
  let msgs = params.messages as any[];
  // pause_turn: turno longo de ferramenta de servidor — reenviar para continuar.
  for (let i = 0; i < 4; i++) {
    const resp: any = await (anthropic.messages.create as any)({
      model: MODELO,
      ...params,
      messages: msgs,
    });
    if (resp.stop_reason === 'refusal') throw new Error('A IA recusou este pedido.');
    if (resp.stop_reason !== 'pause_turn') return resp;
    msgs = [...msgs, { role: 'assistant', content: resp.content }];
  }
  throw new Error('A IA não concluiu a tarefa a tempo.');
}

const textoDe = (resp: any) =>
  (resp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();

async function chamarIA(params: Record<string, unknown>, schema: Record<string, unknown>, schemaName: string) {
  if (PROVIDER === 'anthropic') {
    const resp = await chamarClaude(params);
    return { text: textoDe(resp) };
  }
  return requestOpenAiStructured(Deno.env.get('OPENAI_API_KEY')!, MODELO, String(params.system || ''),
    String((params.messages as any[])?.[0]?.content || ''), schema, schemaName);
}

// ---------------------------------------------------------------------------
// Objeção
// ---------------------------------------------------------------------------
const SCHEMA_OBJECAO = {
  type: 'object',
  properties: {
    quick_lines: { type: 'array', items: { type: 'string' } },
    long_scripts: { type: 'array', items: { type: 'string' } },
    whatsapp_msg: { type: 'string' },
    follow_up: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      properties: { percentual: { type: 'number' }, 'razão': { type: 'string' } },
      required: ['percentual', 'razão'],
      additionalProperties: false,
    },
  },
  required: ['quick_lines', 'long_scripts', 'whatsapp_msg', 'follow_up', 'tags', 'confidence'],
  additionalProperties: false,
};

async function objecao(p: any) {
  const lead = p.lead || {};
  const resp = await chamarIA({
    max_tokens: 8000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_OBJECAO } },
    system: `${CONTEXTO_CIATOS}\nVocê é um assistente comercial sênior que ajuda SDRs e closers a contornar objeções com empatia e argumentos concretos. Nunca invente números sobre o cliente.`,
    messages: [{
      role: 'user',
      content: `Objeção do cliente: "${String(p.objecao || '').slice(0, 1000)}"
Empresa: ${lead.tradeName || lead.company || '—'} | Segmento: ${lead.segment || '—'} | Porte: ${lead.size || '—'} | Regime: ${lead.taxRegime || '—'}
${p.script ? `Script base da equipe:\n${String(p.script).slice(0, 4000)}` : ''}

Gere: 3 respostas curtas (quick_lines), 2 roteiros mais longos (long_scripts), uma mensagem de WhatsApp, a sugestão de follow-up, tags da objeção e sua confiança (0-100) com a razão.`,
    }],
  }, SCHEMA_OBJECAO, 'crm_objection');
  return JSON.parse(resp.text);
}

// ---------------------------------------------------------------------------
// Personalizar e-mail
// ---------------------------------------------------------------------------
const SCHEMA_EMAIL = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
};

async function email(p: any) {
  const lead = p.lead || {};
  const tpl = p.template || {};
  const resp = await chamarIA({
    max_tokens: 4000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA_EMAIL } },
    system: `${CONTEXTO_CIATOS}\nVocê personaliza e-mails comerciais B2B. Mantenha a intenção e a estrutura do template, troque os {{campos}} pelos dados do lead, escreva em até 120 palavras, um único pedido claro (ex.: 15 minutos de conversa). Não invente fatos sobre a empresa; se faltar dado, escreva de forma genérica. Texto puro, sem markdown.`,
    messages: [{
      role: 'user',
      content: `TEMPLATE\nAssunto: ${tpl.subject || ''}\n\n${String(tpl.content || '').slice(0, 6000)}

LEAD
Contato: ${lead.name || '—'} (${lead.role || 'cargo não informado'})
Empresa: ${lead.tradeName || lead.company || '—'} | Segmento: ${lead.segment || '—'} | Cidade: ${lead.city || '—'}/${lead.state || ''}
Porte: ${lead.size || '—'} | Regime: ${lead.taxRegime || '—'}
Dores registradas: ${lead.strategicPains || '—'}`,
    }],
  }, SCHEMA_EMAIL, 'crm_email');
  return JSON.parse(resp.text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (Deno.env.get('CRM_AI_ENABLED') !== 'true' || !MODELO || !['openai','anthropic'].includes(PROVIDER)) return json({ error: 'IA desativada ou provedor/modelo não configurado.' }, 503);
  if (!Deno.env.get(PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY')) return json({ error: 'A chave do provedor de IA selecionado não está configurada no servidor.' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  // Cliente com o JWT do usuário: toda leitura/escrita passa pela RLS do CRM.
  const db = createClient(url, anon, {
    db: { schema: 'crm' },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: me } = await db.auth.getUser();
  if (!me?.user) return json({ error: 'Não autenticado' }, 401);
  let p: any;
  try { p = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const {data:membro,error:memberError}=await db.rpc('tenant_member',{org:p.organization_id,admin_only:false});
  if(memberError||!membro)return json({error:'Sem acesso à empresa.'},403);
  if (!['objecao','email'].includes(p.action)) return json({ error: 'O Radar usa a busca do Snov.io, sem IA.' },410);
  const {data:lead,error}=await db.from('leads').select('id').eq('organization_id',p.organization_id).eq('id',p.lead?.id).maybeSingle();
  if(error||!lead)return json({error:'Lead fora desta empresa.'},403);
  const audit = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'crm' } });
  const { data: runId, error: quotaError } = await audit.rpc('reserve_ai_run', { org: p.organization_id, lid: null });
  if (quotaError) return json({ error: 'Limite de consultas de IA atingido ou configuração indisponível.' },429);
  try {
    const result = p.action === 'objecao' ? await objecao(p) : await email(p);
    const { error: auditError } = await audit.from('ai_runs').update({ provider:PROVIDER,model:MODELO,action:p.action,status:'DONE',completed_at:new Date().toISOString() }).eq('id',runId);
    if (auditError) throw new Error('audit_failed');
    return json(result);
  } catch (err) {
    await audit.from('ai_runs').update({status:'FAILED',completed_at:new Date().toISOString()}).eq('id',runId);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'IA sobrecarregada, tente em instantes.' }, 429);
    if (err instanceof AiBillingError) return json({ code: 'AI_BILLING_REQUIRED', provider: 'openai', error: 'A consulta foi pausada porque a API OpenAI está sem créditos. Confira o faturamento da conta OpenAI e tente novamente.' }, 402);
    if (err instanceof Anthropic.APIError && /credit balance.*too low|insufficient.*credits|billing/i.test(String(err.message))) {
      return json({ code: 'AI_BILLING_REQUIRED', provider: 'anthropic', error: 'A consulta foi pausada porque a API da Anthropic está sem créditos. Confira o saldo em Billing na Console da Anthropic e tente novamente.' }, 402);
    }
    console.error('crm-ia', p.action, err);
    return json({ error: 'Não foi possível concluir a consulta de IA. Tente novamente ou confira a integração.' }, 502);
  }
});
