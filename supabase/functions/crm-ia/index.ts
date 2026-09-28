// Edge Function: crm-ia — IA do CRM (Claude) no servidor. A chave nunca vai ao navegador.
// Ações:
//   objecao  → resposta estruturada a uma objeção de venda
//   email    → personaliza um template de e-mail para um lead
//   radar    → busca empresas reais na web (web search), valida CNPJ na Receita
//              (BrasilAPI) e grava em crm.mining_leads, deduplicando contra crm.leads
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const MODELO = Deno.env.get('CRM_CLAUDE_MODEL') || '';
const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

const CONTEXTO_CIATOS = `O Grupo Ciatos (Belo Horizonte/MG) vende serviços de contabilidade, planejamento tributário,
recuperação de créditos, holding familiar/planejamento patrimonial e consultoria empresarial para PMEs.
Tom: consultivo, direto, sem jargão excessivo, em português do Brasil.`;

/** Chamada com fallback automático do servidor quando o modelo recusa. */
async function chamarClaude(params: Record<string, unknown>) {
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
  throw new Error('A IA não concluiu a busca a tempo.');
}

const textoDe = (resp: any) =>
  (resp.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();

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
  const resp = await chamarClaude({
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
  });
  return JSON.parse(textoDe(resp));
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
  const resp = await chamarClaude({
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
  });
  return JSON.parse(textoDe(resp));
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

function cnpjValido(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(`${d1}${d2}`);
}

const fmtCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
const fmtTel = (t: string) => {
  const d = soDigitos(t);
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  return t || '';
};
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

async function consultarReceita(cnpj: string): Promise<any | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { headers: { 'User-Agent': 'CRM-Ciatos/1.0' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function radar(p: any, db: SupabaseClient<any, any, any>) {
  const jobId = String(p.jobId || '');
  const { data: job, error: eJob } = await db.from('mining_jobs').select('*').eq('organization_id',p.organization_id).eq('id', jobId).maybeSingle();
  if (eJob || !job) throw new Error('Busca do Radar não encontrada.');
  const f = (job.dados?.filters || {}) as Record<string, string>;

  // Empresas já vistas neste job: pedimos para a IA não repetir.
  const { data: vistos } = await db.from('mining_leads').select('dados->>name').eq('job_id', jobId).limit(300);
  const excluir = ((vistos as any[]) || []).map(v => v.name).filter(Boolean);

  const resp = await chamarClaude({
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'BR', city: f.city || undefined, region: f.state || undefined } }],
    system: `Você é um pesquisador de prospecção B2B no Brasil. Encontre empresas REAIS e ATIVAS usando a busca na web. Para cada uma, o CNPJ é obrigatório e precisa ter sido visto numa fonte (site da empresa, cnpj.biz, casadosdados, econodata, Receita etc.). Não invente CNPJ, telefone nem pessoa — deixe vazio o que não encontrar.`,
    messages: [{
      role: 'user',
      content: `Encontre até 10 empresas do segmento "${f.segment || ''}" em ${f.city || ''}/${f.state || ''}.
Porte desejado: ${f.size && f.size !== 'all' ? f.size : 'indiferente'}. Regime tributário desejado: ${f.taxRegime || 'indiferente'}.
${excluir.length ? `NÃO repita estas empresas: ${excluir.slice(0, 150).join('; ')}` : ''}

Responda SOMENTE com um JSON, sem texto antes ou depois, no formato:
{"companies":[{"name":"","tradeName":"","cnpj":"","website":"","phone":"","emailCompany":"","decisionMakerName":"","decisionMakerRole":"","icpScore":3,"reason":""}]}
icpScore de 1 a 5 = quão bom cliente de contabilidade/planejamento tributário ela parece; reason = 1 frase justificando.`,
    }],
  });

  const texto = textoDe(resp);
  const m = texto.match(/\{[\s\S]*\}/);
  let candidatas: any[] = [];
  try { candidatas = m ? (JSON.parse(m[0]).companies || []) : []; } catch { candidatas = []; }
  const fontes = [...new Set((resp.content || [])
    .filter((b: any) => b.type === 'web_search_tool_result' && Array.isArray(b.content))
    .flatMap((b: any) => b.content.map((r: any) => r.url)).filter(Boolean))].slice(0, 20);

  // Dedup contra o CRM e contra o próprio job
  const cnpjs = [...new Set(candidatas.map(c => soDigitos(c.cnpj)).filter(cnpjValido))];
  const jaNoCrm = new Set<string>();
  const jaNoJob = new Set<string>();
  if (cnpjs.length) {
    const { data: l1 } = await db.from('leads').select('cnpj_raw').eq('organization_id',p.organization_id).in('cnpj_raw', cnpjs);
    (l1 || []).forEach((r: any) => jaNoCrm.add(r.cnpj_raw));
    const { data: l2 } = await db.from('mining_leads').select('cnpj_raw').eq('job_id', jobId).in('cnpj_raw', cnpjs);
    (l2 || []).forEach((r: any) => jaNoJob.add(r.cnpj_raw));
  }

  const cidadeAlvo = f.city ? semAcento(f.city) : '';
  const novos: any[] = [];
  let descartadas = 0;
  for (const c of candidatas) {
    const cnpj = soDigitos(c.cnpj);
    if (!cnpjValido(cnpj) || jaNoCrm.has(cnpj) || jaNoJob.has(cnpj)) { descartadas++; continue; }
    const rf = await consultarReceita(cnpj);
    // Só entra empresa com cadastro ATIVO na Receita e na cidade pedida.
    if (!rf || semAcento(String(rf.descricao_situacao_cadastral || '')) !== 'ATIVA') { descartadas++; continue; }
    if (cidadeAlvo && semAcento(String(rf.municipio || '')) !== cidadeAlvo) { descartadas++; continue; }
    const socios: string[] = (rf.qsa || []).map((s: any) => s.nome_socio).filter(Boolean);
    const telefoneRf = fmtTel(String(rf.ddd_telefone_1 || ''));
    novos.push({
      organization_id: p.organization_id,
      job_id: jobId,
      cnpj_raw: cnpj,
      dados: {
        name: rf.razao_social || c.name,
        tradeName: rf.nome_fantasia || c.tradeName || c.name || rf.razao_social,
        cnpj: fmtCnpj(cnpj),
        cnpjRaw: cnpj,
        segment: f.segment,
        city: rf.municipio || f.city,
        state: rf.uf || f.state,
        phone: c.phone || telefoneRf,
        phoneCompany: telefoneRf || c.phone || 'Não localizado',
        emailCompany: rf.email || c.emailCompany || 'Não localizado',
        website: c.website || '',
        partners: socios.length ? socios : ['Não informado'],
        contactName: c.decisionMakerName || socios[0] || 'Proprietário',
        contactPhone: '—',
        contactEmail: '—',
        decisionMakerName: c.decisionMakerName || socios[0] || '',
        scoreIa: Math.min(5, Math.max(1, Number(c.icpScore) || 3)),
        icpScore: Math.min(5, Math.max(1, Number(c.icpScore) || 3)),
        reason: c.reason || '',
        porteReceita: rf.porte || '',
        cnaePrincipal: rf.cnae_fiscal_descricao || '',
        capitalSocial: rf.capital_social ?? null,
        abertura: rf.data_inicio_atividade || '',
        simplesNacional: rf.opcao_pelo_simples ?? null,
        debtStatus: 'Regular',
        debtValueEst: '—',
        sources: fontes.length ? fontes : ['web_search'],
        isGarimpo: true,
        verificadoReceita: true,
      },
    });
    jaNoJob.add(cnpj);
  }

  if (novos.length) {
    const { error } = await db.from('mining_leads').insert(novos);
    if (error) throw error;
  }

  const dados = job.dados || {};
  const encontrados = (dados.foundCount || 0) + novos.length;
  const paginas = (dados.pagesFetched || 0) + 1;
  const semNada = novos.length === 0 ? (dados.paginasVazias || 0) + 1 : 0;
  const concluido = encontrados >= (dados.targetCount || 50) || semNada >= 3;
  const status = concluido ? 'Completed' : job.status;
  await db.from('mining_jobs').update({
    status,
    dados: { ...dados, status, foundCount: encontrados, pagesFetched: paginas, paginasVazias: semNada, updatedAt: new Date().toISOString() },
  }).eq('id', jobId);

  return { adicionadas: novos.length, descartadas, status, foundCount: encontrados };
}

// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (Deno.env.get('CRM_AI_ENABLED') !== 'true' || !MODELO) return json({ error: 'IA desativada ou modelo não configurado.' }, 503);
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json({ error: 'IA não configurada (ANTHROPIC_API_KEY ausente).' }, 503);

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
  if(p.action!=='radar'){
    const {data:lead,error}=await db.from('leads').select('id').eq('organization_id',p.organization_id).eq('id',p.lead?.id).maybeSingle();
    if(error||!lead)return json({error:'Lead fora desta empresa.'},403);
  }
  if (!['objecao','email','radar'].includes(p.action)) return json({ error: 'Ação desconhecida' },400);
  const audit = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'crm' } });
  const { data: runId, error: quotaError } = await audit.rpc('reserve_ai_run', { org: p.organization_id, lid: null });
  if (quotaError) return json({ error: 'Limite de consultas de IA atingido ou configuração indisponível.' },429);
  try {
    const result = p.action === 'objecao' ? await objecao(p) : p.action === 'email' ? await email(p) : await radar(p,db);
    const { error: auditError } = await audit.from('ai_runs').update({ provider:'anthropic',model:MODELO,action:p.action,status:'DONE',completed_at:new Date().toISOString() }).eq('id',runId);
    if (auditError) throw new Error('audit_failed');
    return json(result);
  } catch (err) {
    await audit.from('ai_runs').update({status:'FAILED',completed_at:new Date().toISOString()}).eq('id',runId);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'IA sobrecarregada, tente em instantes.' }, 429);
    console.error('crm-ia', p.action, err);
    // Motivo curto (sem chaves nem dados do lead) para o administrador entender a falha.
    const motivo = err instanceof Anthropic.APIError ? `provedor ${err.status}: ${String(err.message).slice(0, 180)}` : String((err as Error)?.message || err).slice(0, 180);
    return json({ error: `Não foi possível concluir a consulta de IA (${motivo}).` }, 502);
  }
});
