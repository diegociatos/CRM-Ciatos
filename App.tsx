
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ExecutiveDashboard from './components/ExecutiveDashboard'; // Novo
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
import { 
  NavigationState, Lead, LeadStatus, UserRole, User, 
  SystemConfig, OnboardingTemplate, UserGoal, SdrQualification, AgendaEvent, AutomationFlow, Task, SalesScript, EmailProvider
} from './types';
import { INITIAL_LEADS, DEFAULT_ONBOARDING_TEMPLATES } from './constants';
import { seedDatabase } from './services/dataGeneratorService';
import { authApi, leadsApi, configApi, scriptsApi, templatesApi, goalsApi, agendaApi } from './services/api';

const AUTH_KEY = 'ciatos_auth_v64';

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
      senderName: 'Equipe Banca Ciatos',
      senderEmail: 'contato@grupociatos.com.br',
      provider: EmailProvider.SENDGRID,
      apiKey: '',
      smtpHost: 'smtp.ciatos.com.br',
      webhookSecret: 'ciatos_secret_777',
      emailSignature: '--\nAtenciosamente,\nEquipe Banca Ciatos\nwww.grupociatos.com.br'
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
  publicSchedulerLink: 'https://ciatos.com.br/agenda/diagnostico'
};

const App: React.FC = () => {
  const [nav, setNav] = useState<NavigationState>({ view: 'dashboard' });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [scripts, setScripts] = useState<SalesScript[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>(DEFAULT_ONBOARDING_TEMPLATES);
  const [userGoals, setUserGoals] = useState<UserGoal[]>([]);
  
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    const savedAuth = localStorage.getItem(AUTH_KEY);
    if (savedAuth) {
      const restored = JSON.parse(savedAuth);
      setCurrentUser(restored);
      if (restored.role === UserRole.ADMIN) setNav({ view: 'executive_bi' as any });
    }

    // Load all data from API
    const loadData = async () => {
      try {
        const [apiLeads, apiConfig, apiScripts, apiUsers, apiTemplates, apiGoals, apiEvents] = await Promise.allSettled([
          leadsApi.getAll(),
          configApi.getAll(),
          scriptsApi.getAll(),
          authApi.getUsers(),
          templatesApi.getAll(),
          goalsApi.getAll(),
          agendaApi.getAll(),
        ]);
        if (apiLeads.status === 'fulfilled' && apiLeads.value.length > 0) setLeads(apiLeads.value);
        if (apiConfig.status === 'fulfilled' && Object.keys(apiConfig.value).length > 0) {
          // Merge API config (key-value) into SystemConfig shape
          const merged = { ...DEFAULT_SYSTEM_CONFIG };
          for (const [k, v] of Object.entries(apiConfig.value)) {
            (merged as any)[k] = v;
          }
          setConfig(merged);
        }
        if (apiScripts.status === 'fulfilled') setScripts(apiScripts.value);
        if (apiUsers.status === 'fulfilled' && apiUsers.value.length > 0) setUsers(apiUsers.value);
        if (apiTemplates.status === 'fulfilled' && apiTemplates.value.length > 0) setTemplates(apiTemplates.value);
        if (apiGoals.status === 'fulfilled') setUserGoals(apiGoals.value);
        if (apiEvents.status === 'fulfilled') setEvents(apiEvents.value);
      } catch (err) {
        console.warn('API load failed, using defaults:', err);
      }
    };
    loadData();
  }, []);

  // Persist auth session only
  useEffect(() => {
    if (currentUser) localStorage.setItem(AUTH_KEY, JSON.stringify(currentUser));
    else localStorage.removeItem(AUTH_KEY);
  }, [currentUser]);

  const handleLogin = async (email: string, pass: string) => {
    setIsAuthLoading(true);
    try {
      const user = await authApi.login(email, pass);
      setCurrentUser(user);
      if (user.role === UserRole.ADMIN) setNav({ view: 'executive_bi' as any });
    } catch (err: any) {
      alert(err.message || "E-mail ou senha incorretos.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(AUTH_KEY);
  };

  const handleResetToDefaults = () => {
    if (confirm("Deseja restaurar os padrões de fábrica do sistema?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleSeed = () => {
    if (currentUser) {
       const { leads: seedLeads } = seedDatabase(60, currentUser, users);
       setLeads([...leads, ...seedLeads]);
       alert("60 leads de amostragem gerados.");
    }
  };

  const handleUpdateLead = async (updatedLead: Lead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
    try { await leadsApi.update(updatedLead.id, updatedLead); } catch (e) { console.error('Update lead API error:', e); }
  };

  const handleAddUser = async (user: User) => {
    try {
      const created = await authApi.createUser(user);
      setUsers(prev => [...prev, { ...user, id: created.id || user.id }]);
    } catch (e: any) {
      alert(e.message || 'Erro ao criar usuário');
    }
  };
  const handleUpdateUser = async (updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    if (currentUser?.id === updatedUser.id) setCurrentUser(updatedUser);
    try { await authApi.updateUser(updatedUser.id, updatedUser); } catch (e) { console.error('Update user API error:', e); }
  };
  const handleDeleteUser = async (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    try { await authApi.deleteUser(id); } catch (e) { console.error('Delete user API error:', e); }
  };

  const handleAddLead = async (leadData: any) => {
    const newLead: Lead = {
      ...leadData,
      id: leadData.id || `lead-${Date.now()}`,
      status: leadData.status || LeadStatus.QUALIFICATION,
      phaseId: leadData.phaseId || 'ph-qualificado',
      ownerId: leadData.ownerId || currentUser?.id,
      createdAt: new Date().toISOString(),
      interactions: [],
      tasks: [],
      inQueue: leadData.inQueue ?? true
    };
    setLeads(prev => [newLead, ...prev]);
    try { await leadsApi.create(newLead); } catch (e) { console.error('Create lead API error:', e); }
    return { success: true, message: 'Lead gerado.' };
  };

  if (!currentUser) return <LoginPage onLogin={handleLogin} isLoading={isAuthLoading} />;

  // ---- API-synced handlers for inline mutations ----
  const handleSaveScript = async (s: SalesScript) => {
    setScripts(prev => prev.find(item => item.id === s.id) ? prev.map(item => item.id === s.id ? s : item) : [...prev, s]);
    try {
      const exists = scripts.find(item => item.id === s.id);
      if (exists) await scriptsApi.update(s.id, s);
      else await scriptsApi.create(s);
    } catch (e) { console.error('Save script API error:', e); }
  };
  const handleDeleteScript = async (id: string) => {
    setScripts(prev => prev.filter(s => s.id !== id));
    try { await scriptsApi.delete(id); } catch (e) { console.error('Delete script API error:', e); }
  };
  const handleApproveQual = async (id: string) => {
    const updated = leads.find(l => l.id === id);
    if (updated) {
      const newLead = { ...updated, inQueue: false, qualifiedById: currentUser.id };
      setLeads(leads.map(l => l.id === id ? newLead : l));
      try { await leadsApi.update(id, { inQueue: false, qualifiedById: currentUser.id }); } catch (e) { console.error(e); }
    }
  };
  const handleMoveLead = async (id: string, ph: string) => {
    const ownerId = currentUser.role === UserRole.CLOSER ? currentUser.id : leads.find(l => l.id === id)?.ownerId;
    setLeads(leads.map(l => l.id === id ? { ...l, phaseId: ph, ownerId: ownerId || l.ownerId } : l));
    try { await leadsApi.update(id, { phaseId: ph, ownerId }); } catch (e) { console.error(e); }
  };
  const handleSaveEvent = async (e: AgendaEvent) => {
    setEvents(prev => [...prev, e]);
    try { await agendaApi.create(e); } catch (err) { console.error('Save event API error:', err); }
  };
  const handleDeleteEvent = async (id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    try { await agendaApi.delete(id); } catch (e) { console.error('Delete event API error:', e); }
  };
  const handleSaveConfig = async (newConfig: SystemConfig) => {
    setConfig(newConfig);
    try { await configApi.update(newConfig); } catch (e) { console.error('Save config API error:', e); }
  };
  const handleSaveGoals = async (newGoals: UserGoal[]) => {
    setUserGoals(newGoals);
    try { await goalsApi.bulkSave(newGoals); } catch (e) { console.error('Save goals API error:', e); }
  };
  const handleSaveTemplates = async (newTemplates: OnboardingTemplate[]) => {
    setTemplates(newTemplates);
    // Sync each template
    for (const t of newTemplates) {
      try {
        const exists = templates.find(x => x.id === t.id);
        if (exists) await templatesApi.update(t.id, t);
        else await templatesApi.create(t);
      } catch (e) { console.error(e); }
    }
  };
  const handleDeleteLead = async (id: string) => {
    setLeads(leads.filter(l => l.id !== id));
    try { await leadsApi.delete(id); } catch (e) { console.error('Delete lead API error:', e); }
  };
  const handleAddInteraction = async (id: string, inter: any) => {
    const newInter = { ...inter, id: `int-${Date.now()}`, date: new Date().toISOString() };
    setLeads(leads.map(l => l.id === id ? { ...l, interactions: [newInter, ...l.interactions] } : l));
    try { await leadsApi.addInteraction(id, newInter); } catch (e) { console.error('Add interaction API error:', e); }
  };

  const renderView = () => {
    switch (nav.view) {
      case 'dashboard': return <Dashboard leads={leads} tasks={[]} notifications={[]} currentUser={currentUser} agendaEvents={events} />;
      case 'executive_bi' as any: return <ExecutiveDashboard leads={leads} users={users} config={config} userGoals={userGoals} />;
      case 'user_management': return <UserManagementView users={users} onAddUser={handleAddUser} onDeleteUser={handleDeleteUser} currentUser={currentUser} />;
      case 'scripts': return <ScriptsLibrary scripts={scripts} config={config} currentUser={currentUser} onSaveScript={handleSaveScript} onDeleteScript={handleDeleteScript} />;
      case 'sdr_dashboard': return <SdrDashboard currentUser={currentUser} allUsers={users} leads={leads} qualifications={[]} config={config} userGoals={userGoals} onUpdateStatus={()=>{}} />;
      case 'closer_dashboard': return <CloserDashboard currentUser={currentUser} allUsers={users} leads={leads} qualifications={[]} config={config} userGoals={userGoals} />;
      case 'prospecting': return <Prospector onAddAsLead={handleAddLead} canImport={true} existingLeads={leads} />;
      case 'qualification': return <QualificationQueue leads={leads} config={config} onApprove={handleApproveQual} onUpdateLead={handleUpdateLead} onSelectLead={setSelectedLeadId} onOpenManualLead={() => setShowNewLeadForm(true)} currentUser={currentUser} canEdit={true} canCreate={true} />;
      case 'marketing_automation': return <MarketingAutomationDashboard leads={leads} onUpdateLead={handleUpdateLead} currentUser={currentUser} config={config} allUsers={users} />;
      case 'kanban': return <KanbanBoard leads={leads} phases={config.phases} onMoveLead={handleMoveLead} onSelectLead={setSelectedLeadId} role={currentUser.role} currentUserId={currentUser.id} searchTerm="" users={users} />;
      case 'agenda': return <Agenda events={events} leads={leads} users={users} currentUser={currentUser} config={config} onSaveEvent={handleSaveEvent} onDeleteEvent={handleDeleteEvent} onSelectLead={setSelectedLeadId} />;
      case 'operational_dashboard': return <OperationalDashboard leads={leads} onUpdateLead={handleUpdateLead} currentUser={currentUser} templates={templates} />;
      case 'customers': return <CustomerDatabase leads={leads} currentUser={currentUser} onUpdateCustomer={handleUpdateLead} />;
      case 'post_sales': return <PostSalesDashboard leads={leads} users={users} currentUser={currentUser} onUpdateLead={handleUpdateLead} config={config} templates={templates} />;
      case 'settings': return <Settings config={config} role={currentUser.role} currentUser={currentUser} onSaveConfig={handleSaveConfig} leads={leads} userGoals={userGoals} allUsers={users} onSaveGoals={handleSaveGoals} onSeedDatabase={handleSeed} onClearDatabase={handleResetToDefaults} templates={templates} onSaveTemplates={handleSaveTemplates} onSyncTemplate={()=>{}} />;
      default: return <Dashboard leads={leads} tasks={[]} notifications={[]} currentUser={currentUser} />;
    }
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  return (
    <div className={`min-h-screen ${nav.view === ('executive_bi' as any) ? 'bg-[#050a15]' : 'bg-slate-50'} flex font-serif text-slate-900`}>
      <Sidebar role={currentUser.role} currentView={nav.view} setView={(v) => setNav({ view: v })} onOpenNewLead={() => setShowNewLeadForm(true)} canCreate={true} />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header notifications={[]} onMarkRead={() => {}} onClearAll={() => {}} onOpenNewLead={() => setShowNewLeadForm(true)} currentUser={currentUser} onSwitchRole={(r) => setCurrentUser(users.find(u => u.role === r) || currentUser)} canCreate={true} onOpenUserProfile={() => setShowUserProfileModal(true)} onLogout={handleLogout} />
        <main className={`flex-1 ml-64 pt-28 p-12 max-w-[1800px] ${nav.view === ('executive_bi' as any) ? 'bg-[#050a15]' : ''}`}>{renderView()}</main>
      </div>
      {showNewLeadForm && <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"><NewLeadForm config={config} onSave={handleAddLead} onCancel={() => setShowNewLeadForm(false)} currentUser={currentUser} /></div>}
      {showUserProfileModal && <UserProfileModal user={currentUser} onSave={handleUpdateUser} onClose={() => setShowUserProfileModal(false)} />}
      {selectedLead && <LeadDetails lead={selectedLead} config={config} agendaEvents={events} onClose={() => setSelectedLeadId(null)} onUpdateLead={handleUpdateLead} onDeleteLead={handleDeleteLead} onAddInteraction={handleAddInteraction} onAddAgendaEvent={handleSaveEvent} onDeleteAgendaEvent={handleDeleteEvent} currentUser={currentUser} allUsers={users} scripts={scripts} />}
    </div>
  );
};

export default App;
