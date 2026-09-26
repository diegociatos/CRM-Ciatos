// Camada de dados do CRM no Supabase (schema `crm`).
// Mantém os tipos do front (Lead, User, SalesScript...) e converte para o
// modelo híbrido do banco: colunas reais para filtro/RLS + `dados` jsonb.

import { supabase } from '../lib/supabase';
import {
  Lead, Interaction, User, UserRole, Department, SystemConfig, SalesScript,
  OnboardingTemplate, UserGoal, AgendaEvent,
} from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const novoId = () => crypto.randomUUID();
const uuidOuNull = (v: unknown) => (isUuid(v) ? v : null);
const soDigitos = (v?: string) => (v || '').replace(/\D/g, '') || null;

function falhou(error: { message: string } | null, contexto: string): void {
  if (error) throw new Error(`${contexto}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Papéis
// ---------------------------------------------------------------------------
const PAPEL_PARA_ROLE: Record<string, UserRole> = {
  ADMIN: UserRole.ADMIN,
  MANAGER: UserRole.MANAGER,
  SDR: UserRole.SDR,
  CLOSER: UserRole.CLOSER,
  OPERATIONAL: UserRole.OPERATIONAL,
  CS: UserRole.CS,
  MARKETING: UserRole.MARKETING,
};
export const roleDePapel=(role:string):UserRole=>PAPEL_PARA_ROLE[role]||UserRole.SDR;
export const roleParaPapel = (role: UserRole): string =>
  Object.keys(PAPEL_PARA_ROLE).find(k => PAPEL_PARA_ROLE[k] === role) || 'SDR';

interface ProfileRow {
  id: string; nome: string; email: string; papel: string;
  departamento: string; avatar: string | null; ativo: boolean;
}
const profileParaUser = (p: ProfileRow): User => ({
  id: p.id,
  name: p.nome,
  email: p.email,
  role: PAPEL_PARA_ROLE[p.papel] || UserRole.SDR,
  department: p.departamento as Department,
  avatar: p.avatar || undefined,
});

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
interface LeadRow {
  id: string; nome: string | null; email: string | null; telefone: string | null;
  empresa: string | null; cnpj_raw: string | null; status: string; phase_id: string;
  owner_id: string | null; qualified_by_id: string | null; in_queue: boolean;
  icp_score: number; engagement_score: number; segmento: string | null;
  cidade: string | null; uf: string | null; opt_out: boolean;
  dados: Record<string, any>; created_at: string;
}

interface InteractionRow {
  id: string; lead_id: string; tipo: string; titulo: string | null; conteudo: string | null;
  autor_id: string | null; autor_nome: string | null; score_impact: number | null;
  dados: Record<string, any>; created_at: string;
}

const interactionDeRow = (r: InteractionRow): Interaction => ({
  ...(r.dados || {}),
  id: r.id,
  type: r.tipo as Interaction['type'],
  title: r.titulo || '',
  content: r.conteudo || '',
  date: r.created_at,
  author: r.autor_nome || '',
  authorId: r.autor_id || '',
  scoreImpact: r.score_impact ?? undefined,
});

function leadParaRow(lead: Lead) {
  // interactions vivem em tabela própria; o resto do objeto vai em `dados`.
  const { interactions: _i, id: _id, ...resto } = lead as any;
  return {
    id: lead.id,
    nome: lead.name || null,
    email: lead.email || null,
    telefone: lead.phone || null,
    empresa: lead.company || lead.tradeName || lead.legalName || null,
    cnpj_raw: soDigitos(lead.cnpjRaw || lead.cnpj),
    status: lead.status,
    phase_id: lead.phaseId || 'ph-qualificado',
    owner_id: uuidOuNull(lead.ownerId),
    qualified_by_id: uuidOuNull(lead.qualifiedById),
    in_queue: lead.inQueue ?? true,
    icp_score: Number(lead.icpScore) || 0,
    engagement_score: Number(lead.engagementScore) || 0,
    segmento: lead.segment || null,
    cidade: lead.city || null,
    uf: lead.state || null,
    dados: resto,
  };
}

function leadDeRow(r: LeadRow, interactions: Interaction[]): Lead {
  return {
    tasks: [],
    detailedPartners: [],
    ...(r.dados as any),
    id: r.id,
    organizationId: (r as any).organization_id,
    name: r.nome || '',
    email: r.email || '',
    phone: r.telefone || '',
    company: r.empresa || '',
    cnpjRaw: r.cnpj_raw || '',
    status: r.status,
    phaseId: r.phase_id,
    ownerId: r.owner_id || '',
    qualifiedById: r.qualified_by_id || undefined,
    inQueue: r.in_queue,
    icpScore: Number(r.icp_score),
    engagementScore: Number(r.engagement_score),
    segment: r.segmento || (r.dados?.segment ?? ''),
    city: r.cidade || '',
    state: r.uf || '',
    createdAt: r.created_at,
    interactions,
  };
}

export function createWorkspaceDb(organizationId:string) {
 const requireCompany=()=>{if(!isUuid(organizationId))throw new Error("Selecione uma empresa para continuar.");return organizationId;};
/** Busca todas as linhas paginando (PostgREST limita 1000 por request). */
async function buscarTudo<T>(tabela: string, ordem: string, asc = false): Promise<T[]> {
  const passo = 1000;
  const out: T[] = [];
  for (let de = 0; ; de += passo) {
    const { data, error } = await supabase.from(tabela).select('*')
      .eq('organization_id', requireCompany()).order(ordem, { ascending: asc }).range(de, de + passo - 1);
    falhou(error, `Carregar ${tabela}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < passo) break;
  }
  return out;
}

async function carregarLeads(): Promise<Lead[]> {
  const [rows, inters] = await Promise.all([
    buscarTudo<LeadRow>('leads', 'created_at'),
    buscarTudo<InteractionRow>('interactions', 'created_at'),
  ]);
  const porLead = new Map<string, Interaction[]>();
  for (const i of inters) {
    const arr = porLead.get(i.lead_id) || [];
    arr.push(interactionDeRow(i));
    porLead.set(i.lead_id, arr);
  }
  return rows.map(r => leadDeRow(r, porLead.get(r.id) || []));
}

async function salvarLead(lead: Lead): Promise<void> {
  if ((lead as any).organizationId && (lead as any).organizationId!==requireCompany()) throw new Error('O lead pertence a outra empresa.');
  const { error } = await supabase.from('leads').upsert({...leadParaRow(lead),organization_id:requireCompany()});
  if (error?.code === '23505') throw new Error('Já existe um lead com este CNPJ.');
  falhou(error, 'Salvar lead');
}

async function excluirLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('organization_id',requireCompany()).eq('id', id);
  falhou(error, 'Excluir lead');
}

async function registrarInteracao(leadId: string, inter: Interaction, autorId: string): Promise<void> {
  const { id, type, title, content, author, authorId: _a, date: _d, scoreImpact, ...resto } = inter as any;
  const { error } = await supabase.from('interactions').insert({
    id: isUuid(id) ? id : novoId(),
    organization_id: requireCompany(),
    lead_id: leadId,
    tipo: type,
    titulo: title || null,
    conteudo: content || null,
    autor_id: autorId,
    autor_nome: author || null,
    score_impact: scoreImpact ?? null,
    dados: resto,
  });
  falhou(error, 'Registrar interação');
}

// ---------------------------------------------------------------------------
// Usuários
// ---------------------------------------------------------------------------
async function carregarPerfil(userId: string): Promise<User | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).eq('ativo', true).maybeSingle();
  falhou(error, 'Carregar perfil');
  return data ? profileParaUser(data as ProfileRow) : null;
}

async function carregarUsuarios(): Promise<User[]> {
  const { data, error } = await supabase.rpc('company_users',{org:requireCompany()});
  falhou(error, 'Carregar usuários');
  return (data as ProfileRow[]).map(profileParaUser);
}

async function atualizarMeuPerfil(u: User): Promise<void> {
  const { error } = await supabase.from('profiles')
    .update({ nome: u.name, avatar: u.avatar || null, departamento: u.department })
    .eq('id', u.id);
  falhou(error, 'Atualizar perfil');
}

/** Criação/desativação de usuários passa pela Edge Function (service role). */
async function adminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('crm-admin-users', { body: {...body,organization_id:requireCompany()} });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context.json()).error || msg; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function convidarUsuario(u: { name: string; email: string; role: UserRole; department: Department }) {
  return adminUsers({
    action: 'create',
    nome: u.name,
    email: u.email,
    papel: roleParaPapel(u.role),
    departamento: u.department,
    redirectTo: window.location.origin,
  }) as Promise<{ user: { id: string }; emailEnviado: boolean; inviteLink?: string }>;
}

async function desativarUsuario(id: string) {
  return adminUsers({ action: 'deactivate', id });
}

// ---------------------------------------------------------------------------
// Configuração, scripts, templates, metas, agenda
// ---------------------------------------------------------------------------
async function carregarConfig(): Promise<Partial<SystemConfig> | null> {
  const { data, error } = await supabase.from('config').select('dados').eq('organization_id',requireCompany()).eq('id', 1).maybeSingle();
  falhou(error, 'Carregar configuração');
  const dados = data?.dados as Partial<SystemConfig> | undefined;
  return dados && Object.keys(dados).length ? dados : null;
}

async function salvarConfig(cfg: SystemConfig, userId: string): Promise<void> {
  // Segredos de envio não ficam no banco legível pelo front: vão como secrets
  // das Edge Functions. Removemos apiKey/webhookSecret antes de gravar.
  const limpo: SystemConfig = {
    ...cfg,
    messaging: {
      ...cfg.messaging,
      email: { ...cfg.messaging.email, apiKey: '', webhookSecret: '' },
      whatsapp: { ...cfg.messaging.whatsapp, apiKey: '' },
    },
  };
  const { error } = await supabase.from('config').upsert({id:1,organization_id:requireCompany(),dados:limpo,updated_by:userId},{onConflict:'organization_id,id'});
  falhou(error, 'Salvar configuração');
}

async function carregarScripts(): Promise<SalesScript[]> {
  const rows = await buscarTudo<{ id: string; dados: SalesScript }>('scripts', 'created_at', true);
  return rows.map(r => ({ ...r.dados, id: r.id }));
}

async function salvarScript(s: SalesScript): Promise<SalesScript> {
  const id = isUuid(s.id) ? s.id : novoId();
  const script = { ...s, id };
  const { error } = await supabase.from('scripts').upsert({ id, organization_id:requireCompany(), author_id: uuidOuNull(s.authorId), dados: script });
  falhou(error, 'Salvar script');
  return script;
}

async function excluirScript(id: string): Promise<void> {
  const { error } = await supabase.from('scripts').delete().eq('organization_id',requireCompany()).eq('id', id);
  falhou(error, 'Excluir script');
}

async function carregarTemplatesOnboarding(): Promise<OnboardingTemplate[]> {
  const rows = await buscarTudo<{ id: string; dados: OnboardingTemplate }>('onboarding_templates', 'id', true);
  return rows.map(r => ({ ...r.dados, id: r.id }));
}

async function salvarTemplatesOnboarding(lista: OnboardingTemplate[]): Promise<void> {
  const atuais = await carregarTemplatesOnboarding();
  const manter = new Set(lista.map(t => t.id));
  const remover = atuais.filter(t => !manter.has(t.id)).map(t => t.id);
  if (lista.length) {
    const { error } = await supabase.from('onboarding_templates').upsert(lista.map(t => ({ id: t.id, organization_id:requireCompany(), dados: t })),{onConflict:'organization_id,id'});
    falhou(error, 'Salvar templates de onboarding');
  }
  if (remover.length) {
    const { error } = await supabase.from('onboarding_templates').delete().eq('organization_id',requireCompany()).in('id', remover);
    falhou(error, 'Remover templates de onboarding');
  }
}

async function carregarMetas(): Promise<UserGoal[]> {
  const rows = await buscarTudo<{ id: string; user_id: string; mes: number; ano: number; dados: UserGoal }>('user_goals', 'ano');
  return rows.map(r => ({ ...r.dados, id: r.id, userId: r.user_id, month: r.mes, year: r.ano }));
}

async function salvarMetas(metas: UserGoal[]): Promise<void> {
  const validas = metas.filter(g => isUuid(g.userId));
  if (!validas.length) return;
  const { error } = await supabase.from('user_goals').upsert(
    validas.map(g => ({ organization_id:requireCompany(),user_id: g.userId, mes: g.month, ano: g.year, dados: g })),
    { onConflict: 'organization_id,user_id,mes,ano' },
  );
  falhou(error, 'Salvar metas');
}

async function carregarEventos(): Promise<AgendaEvent[]> {
  const rows = await buscarTudo<{ id: string; titulo: string; inicio: string; fim: string | null; assigned_to_id: string | null; lead_id: string | null; creator_id: string | null; dados: AgendaEvent }>('agenda_events', 'inicio', true);
  return rows.map(r => ({
    ...r.dados,
    id: r.id,
    title: r.titulo,
    start: r.inicio,
    end: r.fim || r.inicio,
    assignedToId: r.assigned_to_id || r.dados.assignedToId,
    leadId: r.lead_id || undefined,
    creatorId: r.creator_id || r.dados.creatorId,
  }));
}

async function salvarEvento(e: AgendaEvent): Promise<AgendaEvent> {
  const id = isUuid(e.id) ? e.id : novoId();
  const evento = { ...e, id };
  const { error } = await supabase.from('agenda_events').upsert({
    id,
    organization_id:requireCompany(),
    titulo: e.title,
    inicio: e.start,
    fim: e.end || null,
    assigned_to_id: uuidOuNull(e.assignedToId),
    lead_id: uuidOuNull(e.leadId),
    creator_id: uuidOuNull(e.creatorId),
    dados: evento,
  });
  falhou(error, 'Salvar evento');
  return evento;
}

async function excluirEvento(id: string): Promise<void> {
  const { error } = await supabase.from('agenda_events').delete().eq('organization_id',requireCompany()).eq('id', id);
  falhou(error, 'Excluir evento');
}

return {isUuid,novoId,carregarLeads,salvarLead,excluirLead,registrarInteracao,carregarPerfil,carregarUsuarios,atualizarMeuPerfil,convidarUsuario,desativarUsuario,carregarConfig,salvarConfig,carregarScripts,salvarScript,excluirScript,carregarTemplatesOnboarding,salvarTemplatesOnboarding,carregarMetas,salvarMetas,carregarEventos,salvarEvento,excluirEvento};
}
