
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import AiCenter from './components/AiCenter';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ExecutiveDashboard from './components/ExecutiveDashboard';
import KanbanBoard from './components/KanbanBoard';
import Prospector from './components/Prospector';
import QualificationQueue from './components/QualificationQueue';
import Settings from './components/Settings';
import LeadDetails from './components/LeadDetails';
import NewLeadForm from './components/NewLeadForm';
import OperationalDashboard from './components/OperationalDashboard';
import SdrDashboard from './components/SdrDashboard';
import CloserDashboard from './components/CloserDashboard';
import PostSalesDashboard from './components/PostSalesDashboard';
import CustomerDatabase from './components/CustomerDatabase';
import Agenda from './components/Agenda';
import MarketingAutomationDashboard from './components/MarketingAutomation';
import ScriptsLibrary from './components/ScriptsLibrary';
import UserManagementView from './components/UserManagementView';
import UserProfileModal from './components/UserProfileModal';
import LoginPage from './components/LoginPage';
import DefinirSenha from './components/DefinirSenha';
import {
  NavigationState, Lead, LeadStatus, UserRole, User,
  SystemConfig, OnboardingTemplate, UserGoal, AgendaEvent, SalesScript, EmailProvider, Interaction
} from './types';
import { DEFAULT_ONBOARDING_TEMPLATES } from './constants';
import { seedDatabase } from './services/dataGeneratorService';
import { supabase } from './lib/supabase';
import * as db from './services/db';

const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  phases: [
    { id: 'ph-qualificado', name: 'Lead Qualificado', order: 0, color: '#94a3b8', authorizedUserIds: [] },
    { id: 'ph-contato', name: 'Contato Inicial', order: 1, color: '#6366f1', authorizedUserIds: [] },
    { id: 'ph-remarcar', name: 'Remarcar Reunião', order: 2, color: '#f87171', authorizedUserIds: [] },
    { id: 'ph-agend', name: 'Reunião Agendada', order: 3, color: '#f59e0b', authorizedUserIds: [] },
    { id: 'ph-prop', name: 'Proposta Elaborada', order: 4, color: '#c5a059', authorizedUserIds: [] },
    { id: 'ph-nego', name: 'Negociação Final', order: 5, color: '#10b981', authorizedUserIds: [] },
    { id: 'ph-fech', name: 'Contrato Assinado', order: 6, color: '#059669', authorizedUserIds: [] },
  ],
  taskTypes: [
    { id: 'tt-call', name: 'Ligação Fria', channel: 'TELEFONE', color: '#e53e3e', icon: '📞', requireDecisor: true, template: 'Olá {{nome}}, sou do Grupo Ciatos. Podemos agendar 15 minutos?' },
    { id: 'tt-whats', name: 'WhatsApp', channel: 'WHATSAPP', color: '#6366f1', icon: '💬', requireDecisor: true, template: 'Oi {{nome}}, vi que a {{empresa}} possui indicadores interessantes.' },
    { id: 'tt-reuniao', name: 'Reunião Diagnóstica', channel: 'REUNIÃO', color: '#c5a059', icon: '🤝', requireDecisor: true, template: 'Pauta: 1. Apresentação Banca Ciatos; 2. Análise.' },
    { id: 'tt-nps', name: 'Pesquisa NPS', channel: 'TELEFONE', color: '#f59e0b', icon: '📊', requireDecisor: true, template: 'Olá, estamos realizando a pesquisa de satisfação periódica da Ciatos.' }
  ],
  companySizes: ['MICROEMPRESA (ME)', 'PEQUENO PORTE (EPP)', 'MÉDIA EMPRESA', 'GRANDE EMPRESA'],
  taxRegimes: ['SIMPLES NACIONAL', 'LUCRO PRESUMIDO', 'LUCRO REAL', 'IMUNE/ISENTA'],
  serviceTypes: ['PLANEJAMENTO TRIBUTÁRIO', 'HOLDING FAMILIAR', 'CONSULTORIA EMPRESARIAL', 'AUDITORIA FISCAL'],
  messaging: {
    email: {
      senderName: 'Grupo Ciatos',
      senderEmail: 'envio@grupociatos.com.br',
      provider: EmailProvider.CUSTOM_SMTP,
      apiKey: '',
      webhookSecret: '',
      emailSignature: '--\nAtenciosamente,\nGrupo Ciatos\nwww.grupociatos.com.br'
    },
    whatsapp: { apiKey: '' }
  },
  bonus: {
    simpleQualification: 15.00,
    withDecisionMaker: 30.00,
    meetingScheduled: 50.00,
    proposalBonus: 100.00,
    contractBonus: 500.00
  },
  publicSchedulerLink: ''
};

type EstadoAuth = 'carregando' | 'deslogado' | 'sem_acesso' | 'ok';

const App: React.FC = () => {
  const [nav, setNav] = useState<NavigationState>({ view: 'dashboard' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [scripts, setScripts] = useState<SalesScript[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>(DEFAULT_ONBOARDING_TEMPLATES);
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  // realUser = quem está logado; currentUser pode ter o papel "simulado" (só Admin, só visual).
  const [realUser, setRealUser] = useState<User | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<UserRole | null>(null);
  const [estadoAuth, setEstadoAuth] = useState<EstadoAuth>('carregando');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [definindoSenha, setDefinindoSenha] = useState(() => /type=(recovery|invite)/.test(window.location.hash));

  const currentUser: User | null = realUser
    ? (simulatedRole && realUser.role === UserRole.ADMIN ? { ...realUser, role: simulatedRole } : realUser)
    : null;

  const erro = (e: unknown) => {
    console.error(e);
    alert(e instanceof Error ? e.message : 'Erro inesperado ao falar com o servidor.');
  };

  const carregarTudo = useCallback(async () => {
    setCarregandoDados(true);
    try {
      const [ls, us, cfg, scr, tpl, metas, evs] = await Promise.all([
        db.carregarLeads(),
        db.carregarUsuarios(),
        db.carregarConfig(),
        db.carregarScripts(),
        db.carregarTemplatesOnboarding(),
        db.carregarMetas(),
        db.carregarEventos(),
      ]);
      setLeads(ls);
      setUsers(us);
      setConfig(cfg ? { ...DEFAULT_SYSTEM_CONFIG, ...cfg } as SystemConfig : DEFAULT_SYSTEM_CONFIG);
      setScripts(scr);
      setTemplates(tpl.length ? tpl : DEFAULT_ONBOARDING_TEMPLATES);
      setUserGoals(metas);
      setEvents(evs);
    } catch (e) {
      erro(e);
    } finally {
      setCarregandoDados(false);
    }
  }, []);

  // Sessão do Supabase é a fonte da verdade do login.
  useEffect(() => {
    let ativo = true;
    const aplicarSessao = async (userId: string | null) => {
      if (!userId) {
        setRealUser(null);
        setEstadoAuth('deslogado');
        return;
      }
      try {
        const perfil = await db.carregarPerfil(userId);
        if (!ativo) return;
        if (!perfil) {
          setRealUser(null);
          setEstadoAuth('sem_acesso');
          return;
        }
        setRealUser(perfil);
        setEstadoAuth('ok');
      } catch (e) {
        erro(e);
        setEstadoAuth('deslogado');
      }
    };
    supabase.auth.getSession().then(({ data }) => aplicarSessao(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      if (evento === 'PASSWORD_RECOVERY') setDefinindoSenha(true);
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        // Evita deadlock do supabase-js: não aguardar chamadas dentro do callback.
        setTimeout(() => aplicarSessao(session?.user.id ?? null), 0);
      }
    });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (estadoAuth === 'ok') carregarTudo();
  }, [estadoAuth, carregarTudo]);

  const handleLogin = async (email: string, pass: string) => {
    setIsAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setIsAuthLoading(false);
    if (error) {
      alert(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      return;
    }
    setNav({ view: 'dashboard' });
  };

  const handleEsqueciSenha = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    if (error) return erro(error);
    alert('Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSimulatedRole(null);
    setLeads([]);
  };

  // --- Leads ------------------------------------------------------------------
  const handleUpdateLead = (updatedLead: Lead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    db.salvarLead(updatedLead).catch(e => { erro(e); carregarTudo(); });
  };

  const patchLead = (id: string, patch: Partial<Lead>) => {
    const lead = leads.find(l => l.id === id);
    if (lead) handleUpdateLead({ ...lead, ...patch });
  };

  const handleDeleteLead = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    if (selectedLeadId === id) setSelectedLeadId(null);
    db.excluirLead(id).catch(e => { erro(e); carregarTudo(); });
  };

  const handleAddLead = async (leadData: any) => {
    const newLead: Lead = {
      ...leadData,
      id: db.isUuid(leadData.id) ? leadData.id : db.novoId(),
      status: leadData.status || LeadStatus.QUALIFICATION,
      phaseId: leadData.phaseId || 'ph-qualificado',
      ownerId: leadData.ownerId || currentUser?.id,
      createdAt: new Date().toISOString(),
      interactions: [],
      tasks: [],
      inQueue: leadData.inQueue ?? true
    };
    try {
      await db.salvarLead(newLead);
      setLeads(prev => [newLead, ...prev]);
      return { success: true, message: 'Lead gerado.' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Falha ao salvar lead.' };
    }
  };

  const handleAddInteraction = (leadId: string, inter: Interaction) => {
    if (!realUser) return;
    const nova: Interaction = { ...inter, id: db.novoId(), date: new Date().toISOString() };
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, interactions: [nova, ...l.interactions] } : l));
    db.registrarInteracao(leadId, nova, realUser.id).catch(e => { erro(e); carregarTudo(); });
  };

  const handleSeed = async () => {
    if (!currentUser) return;
    const { leads: seedLeads } = seedDatabase(60, currentUser, users);
    const comIds = seedLeads.map(l => ({ ...l, id: db.novoId(), cnpjRaw: '', cnpj: '', interactions: [] }));
    try {
      await Promise.all(comIds.map(l => db.salvarLead(l)));
      await carregarTudo();
      alert(`${comIds.length} leads de amostragem gerados.`);
    } catch (e) { erro(e); }
  };

  const handleResetToDefaults = async () => {
    if (!realUser || !confirm('Restaurar a configuração padrão (fases, tipos de tarefa, bônus)? Os leads não são apagados.')) return;
    setConfig(DEFAULT_SYSTEM_CONFIG);
    db.salvarConfig(DEFAULT_SYSTEM_CONFIG, realUser.id).catch(erro);
  };

  // --- Usuários -----------------------------------------------------------------
  const handleAddUser = async (user: User) => {
    try {
      const r = await db.convidarUsuario({ name: user.name, email: user.email, role: user.role, department: user.department });
      await carregarTudo();
      if (r.emailEnviado) alert(`Convite enviado para ${user.email}. A pessoa cria a própria senha pelo link do e-mail.`);
      else if (r.inviteLink) {
        prompt('Não foi possível enviar o e-mail. Copie o link de convite e envie para a pessoa:', r.inviteLink);
      }
    } catch (e) { erro(e); }
  };

  const handleUpdateUser = async (updatedUser: User & { password?: string }) => {
    try {
      await db.atualizarMeuPerfil(updatedUser);
      if (updatedUser.password) {
        const { error } = await supabase.auth.updateUser({ password: updatedUser.password });
        if (error) throw error;
      }
      setRealUser(prev => prev && prev.id === updatedUser.id ? { ...prev, name: updatedUser.name, avatar: updatedUser.avatar, department: updatedUser.department } : prev);
      setUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser, password: undefined } : u));
      alert('Perfil atualizado com sucesso!');
    } catch (e) { erro(e); }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === realUser?.id) return alert('Você não pode desativar o próprio acesso.');
    try {
      await db.desativarUsuario(id);
      setUsers(prev => prev.filter(u => u.id !== id));
    } catch (e) { erro(e); }
  };

  // --- Config, scripts, templates, metas, agenda --------------------------------
  const handleSaveConfig = (cfg: SystemConfig) => {
    setConfig(cfg);
    if (realUser) db.salvarConfig(cfg, realUser.id).catch(e => { erro(e); carregarTudo(); });
  };

  const handleSaveScript = async (s: SalesScript) => {
    try {
      const salvo = await db.salvarScript(s);
      setScripts(prev => prev.find(i => i.id === s.id || i.id === salvo.id) ? prev.map(i => (i.id === s.id || i.id === salvo.id) ? salvo : i) : [...prev, salvo]);
    } catch (e) { erro(e); }
  };

  const handleDeleteScript = (id: string) => {
    setScripts(prev => prev.filter(s => s.id !== id));
    db.excluirScript(id).catch(e => { erro(e); carregarTudo(); });
  };

  const handleSaveTemplates = (lista: OnboardingTemplate[]) => {
    setTemplates(lista);
    db.salvarTemplatesOnboarding(lista).catch(e => { erro(e); carregarTudo(); });
  };

  const handleSaveGoals = (metas: UserGoal[]) => {
    setUserGoals(metas);
    db.salvarMetas(metas).catch(e => { erro(e); carregarTudo(); });
  };

  const handleSaveEvent = async (e: AgendaEvent) => {
    try {
      const salvo = await db.salvarEvento(e);
      setEvents(prev => prev.find(x => x.id === e.id || x.id === salvo.id) ? prev.map(x => (x.id === e.id || x.id === salvo.id) ? salvo : x) : [...prev, salvo]);
    } catch (err) { erro(err); }
  };

  const handleDeleteEvent = (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    db.excluirEvento(id).catch(e => { erro(e); carregarTudo(); });
  };

  // --- Telas de estado ------------------------------------------------------------
  if (definindoSenha) {
    return <DefinirSenha onConcluido={() => { setDefinindoSenha(false); window.history.replaceState(null, '', window.location.pathname); }} />;
  }
  if (estadoAuth === 'carregando') {
    return <div className="min-h-screen bg-[#050a15] flex items-center justify-center text-[#c5a059] font-black uppercase tracking-widest text-xs">Carregando…</div>;
  }
  if (estadoAuth === 'sem_acesso') {
    return (
      <div className="min-h-screen bg-[#050a15] flex items-center justify-center p-6">
        <div className="max-w-md text-center text-white space-y-6">
          <h1 className="text-2xl font-black">Sem acesso ao CRM</h1>
          <p className="text-slate-400">Seu login existe, mas ainda não foi liberado no CRM Ciatos. Peça a um administrador para convidar você.</p>
          <button onClick={handleLogout} className="px-8 py-3 bg-[#c5a059] rounded-xl font-black uppercase text-xs">Sair</button>
        </div>
      </div>
    );
  }
  if (!currentUser) return <LoginPage onLogin={handleLogin} onForgotPassword={handleEsqueciSenha} isLoading={isAuthLoading} />;

  const renderView = () => {
    switch (nav.view) {
      case 'dashboard': return <Dashboard leads={leads} tasks={[]} notifications={[]} currentUser={currentUser} agendaEvents={events} />;
      case 'executive_bi' as any: return <ExecutiveDashboard leads={leads} users={users} config={config} userGoals={userGoals} />;
      case 'user_management': return <UserManagementView users={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} currentUser={currentUser} />;
      case 'scripts': return <ScriptsLibrary scripts={scripts} config={config} currentUser={currentUser} onSaveScript={handleSaveScript} onDeleteScript={handleDeleteScript} />;
      case 'sdr_dashboard': return <SdrDashboard currentUser={currentUser} allUsers={users} leads={leads} qualifications={[]} config={config} userGoals={userGoals} onUpdateStatus={()=>{}} />;
      case 'closer_dashboard': return <CloserDashboard currentUser={currentUser} allUsers={users} leads={leads} qualifications={[]} config={config} userGoals={userGoals} />;
      case 'prospecting': return <Prospector onAddAsLead={handleAddLead} canImport={true} existingLeads={leads} />;
      case 'qualification': return <QualificationQueue leads={leads} config={config} onApprove={(id) => patchLead(id, { inQueue: false, qualifiedById: currentUser.id })} onUpdateLead={handleUpdateLead} onDeleteLead={handleDeleteLead} onSelectLead={setSelectedLeadId} onOpenManualLead={() => setShowNewLeadForm(true)} currentUser={currentUser} canEdit={true} canCreate={true} />;
      case 'ai_center': return <AiCenter />;
      case 'marketing_automation': return <MarketingAutomationDashboard leads={leads} onUpdateLead={handleUpdateLead} currentUser={currentUser} config={config} allUsers={users} />;
      case 'kanban': return <KanbanBoard leads={leads} phases={config.phases} onMoveLead={(id, ph) => { const l = leads.find(x => x.id === id); if (l) patchLead(id, { phaseId: ph, ownerId: currentUser.role === UserRole.CLOSER ? currentUser.id : l.ownerId }); }} onSelectLead={setSelectedLeadId} role={currentUser.role} currentUserId={currentUser.id} searchTerm="" users={users} />;
      case 'agenda': return <Agenda events={events} leads={leads} users={users} currentUser={currentUser} config={config} onSaveEvent={handleSaveEvent} onDeleteEvent={handleDeleteEvent} onSelectLead={setSelectedLeadId} />;
      case 'operational_dashboard': return <OperationalDashboard leads={leads} onUpdateLead={handleUpdateLead} currentUser={currentUser} templates={templates} />;
      case 'customers': return <CustomerDatabase leads={leads} currentUser={currentUser} onUpdateCustomer={handleUpdateLead} onDeleteCustomer={handleDeleteLead} />;
      case 'post_sales': return <PostSalesDashboard leads={leads} users={users} currentUser={currentUser} onUpdateLead={handleUpdateLead} config={config} templates={templates} />;
      case 'settings': return <Settings config={config} role={currentUser.role} currentUser={currentUser} onSaveConfig={handleSaveConfig} leads={leads} userGoals={userGoals} allUsers={users} onSaveGoals={handleSaveGoals} onSeedDatabase={handleSeed} onClearDatabase={handleResetToDefaults} templates={templates} onSaveTemplates={handleSaveTemplates} onSyncTemplate={()=>{}} />;
      default: return <Dashboard leads={leads} tasks={[]} notifications={[]} currentUser={currentUser} />;
    }
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);
  const podeSimular = realUser?.role === UserRole.ADMIN;

  return (
    <div className={`min-h-screen ${nav.view === ('executive_bi' as any) ? 'bg-[#050a15]' : 'bg-slate-50'} flex font-serif text-slate-900`}>
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} role={currentUser.role} currentView={nav.view} setView={(v) => { setNav({ view: v }); setMobileMenuOpen(false); }} onOpenNewLead={() => setShowNewLeadForm(true)} canCreate={true} />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <Header leads={leads} onSelectLead={setSelectedLeadId} onToggleMenu={() => setMobileMenuOpen(true)} notifications={[]} onMarkRead={() => {}} onClearAll={() => {}} onOpenNewLead={() => setShowNewLeadForm(true)} currentUser={currentUser} canSwitchRole={podeSimular} onSwitchRole={(r) => podeSimular && setSimulatedRole(r === UserRole.ADMIN ? null : r)} canCreate={true} onOpenUserProfile={() => setShowUserProfileModal(true)} onLogout={handleLogout} />
        <main className={`flex-1 min-w-0 ml-0 md:ml-64 p-4 md:p-12 pt-28 md:pt-28 max-w-[1800px] ${nav.view === ('executive_bi' as any) ? 'bg-[#050a15]' : ''}`}>
          {carregandoDados && <div className="mb-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Sincronizando dados…</div>}
          {renderView()}
        </main>
      </div>
      {showNewLeadForm && <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"><NewLeadForm config={config} onSave={handleAddLead} onCancel={() => setShowNewLeadForm(false)} currentUser={currentUser} /></div>}
      {showUserProfileModal && realUser && <UserProfileModal user={realUser} onSave={handleUpdateUser} onClose={() => setShowUserProfileModal(false)} />}
      {selectedLead && <LeadDetails lead={selectedLead} config={config} agendaEvents={events} onClose={() => setSelectedLeadId(null)} onUpdateLead={handleUpdateLead} onDeleteLead={handleDeleteLead} onAddInteraction={handleAddInteraction} onAddAgendaEvent={handleSaveEvent} onDeleteAgendaEvent={handleDeleteEvent} currentUser={currentUser} allUsers={users} scripts={scripts} />}
    </div>
  );
};

export default App;
