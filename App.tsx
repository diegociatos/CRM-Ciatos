
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
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
import { 
  NavigationState, Lead, LeadStatus, UserRole, User, 
  SystemConfig, OnboardingTemplate, UserGoal, SdrQualification, AgendaEvent, AutomationFlow, Task, SalesScript
} from './types';
import { INITIAL_LEADS, DEFAULT_ONBOARDING_TEMPLATES } from './constants';
import { seedDatabase } from './services/dataGeneratorService';

const CONFIG_KEY = 'ciatos_config_v57';
const LEADS_KEY = 'ciatos_leads_v57';
const FLOWS_KEY = 'ciatos_flows_v57';
const SCRIPTS_KEY = 'ciatos_scripts_v57';

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
    { id: 'tt-call', name: 'Ligação Fria', channel: 'Telefone', color: '#6366f1', icon: '📞', requireDecisor: true, template: 'Olá {{nome}}, sou do Grupo Ciatos. Podemos agendar 15 minutos?' },
    { id: 'tt-whats', name: 'WhatsApp', channel: 'WhatsApp', color: '#10b981', icon: '💬', requireDecisor: true, template: 'Oi {{nome}}, vi que a {{empresa}} possui indicadores interessantes.' },
    { id: 'tt-reuniao', name: 'Reunião Diagnóstica', channel: 'Reunião', color: '#c5a059', icon: '🤝', requireDecisor: true, template: 'Pauta: 1. Apresentação Banca Ciatos; 2. Análise.' },
    { id: 'tt-nps', name: 'Pesquisa NPS', channel: 'Telefone', color: '#f59e0b', icon: '📊', requireDecisor: true, template: 'Olá, estamos realizando a pesquisa de satisfação periódica da Ciatos.' }
  ],
  companySizes: ['Microempresa (ME)', 'Pequeno Porte (EPP)', 'Média Empresa', 'Grande Empresa'],
  taxRegimes: ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Imune/Isenta'],
  serviceTypes: ['Planejamento Tributário', 'Holding Familiar', 'Consultoria Empresarial', 'Auditoria Fiscal'],
  messaging: { smtp: { host: 'smtp.ciatos.com.br' }, whatsapp: { apiKey: '' } },
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
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_SYSTEM_CONFIG);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);

  const [allUsers] = useState<User[]>([
    { id: 'user-01', name: 'Diretor Admin', email: 'admin@ciatos.com', role: UserRole.ADMIN, department: 'Comercial', avatar: 'https://ui-avatars.com/api/?name=Admin&background=0a192f&color=c5a059' },
    { id: 'user-mgr', name: 'Gerente Comercial', email: 'gerente@ciatos.com', role: UserRole.MANAGER, department: 'Comercial', avatar: 'https://ui-avatars.com/api/?name=Gerente&background=334155&color=fff' },
    { id: 'user-sdr', name: 'SDR 01', email: 'sdr1@ciatos.com', role: UserRole.SDR, department: 'Comercial', avatar: 'https://ui-avatars.com/api/?name=SDR&background=6366f1&color=fff' },
    { id: 'user-closer', name: 'Consultor Fechamento', email: 'closer@ciatos.com', role: UserRole.CLOSER, department: 'Comercial', avatar: 'https://ui-avatars.com/api/?name=Consultor&background=c5a059&color=fff' }
  ]);
  const [currentUser, setCurrentUser] = useState<User>(allUsers[0]);

  useEffect(() => {
    const savedLeads = localStorage.getItem(LEADS_KEY);
    const savedConfig = localStorage.getItem(CONFIG_KEY);
    const savedScripts = localStorage.getItem(SCRIPTS_KEY);

    if (savedLeads) setLeads(JSON.parse(savedLeads)); else setLeads(INITIAL_LEADS);
    if (savedConfig) setConfig(JSON.parse(savedConfig));
    if (savedScripts) setScripts(JSON.parse(savedScripts));
  }, []);

  useEffect(() => {
    localStorage.setItem(LEADS_KEY, JSON.stringify(leads));
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
  }, [leads, config, scripts]);

  const handleUpdateLead = (updatedLead: Lead) => {
    setLeads(prev => prev.map(l => l.id === updatedLead.id ? updatedLead : l));
  };

  const handleAddLead = async (leadData: any) => {
    const newLead: Lead = {
      ...leadData,
      id: leadData.id || `lead-${Date.now()}`,
      status: leadData.status || LeadStatus.QUALIFICATION,
      phaseId: leadData.phaseId || 'ph-qualificado',
      ownerId: leadData.ownerId || currentUser.id,
      createdAt: new Date().toISOString(),
      interactions: [],
      tasks: [],
      inQueue: leadData.inQueue ?? true
    };
    setLeads(prev => [newLead, ...prev]);
    return { success: true, message: 'Lead gerado com sucesso.' };
  };

  const renderView = () => {
    switch (nav.view) {
      case 'dashboard': 
        return <Dashboard leads={leads} tasks={[]} notifications={[]} currentUser={currentUser} agendaEvents={events} />;
      
      case 'scripts':
        return <ScriptsLibrary scripts={scripts} config={config} currentUser={currentUser} onSaveScript={s => setScripts(prev => {
          const exists = prev.find(item => item.id === s.id);
          return exists ? prev.map(item => item.id === s.id ? s : item) : [...prev, s];
        })} onDeleteScript={id => setScripts(prev => prev.filter(s => s.id !== id))} />;

      case 'sdr_dashboard':
        return <SdrDashboard currentUser={currentUser} allUsers={allUsers} leads={leads} qualifications={[]} config={config} userGoals={[]} onUpdateStatus={()=>{}} />;
      
      case 'closer_dashboard':
        return <CloserDashboard currentUser={currentUser} allUsers={allUsers} leads={leads} qualifications={[]} config={config} userGoals={[]} />;

      case 'prospecting':
        return <Prospector onAddAsLead={handleAddLead} canImport={true} existingLeads={leads} />;

      case 'qualification':
        return <QualificationQueue leads={leads} config={config} onApprove={(id) => setLeads(leads.map(l => l.id === id ? {...l, inQueue: false, qualifiedById: currentUser.id} : l))} onUpdateLead={handleUpdateLead} onSelectLead={setSelectedLeadId} onOpenManualLead={() => setShowNewLeadForm(true)} currentUser={currentUser} canEdit={true} canCreate={true} />;

      case 'marketing_automation': 
        return <MarketingAutomationDashboard leads={leads} onUpdateLead={handleUpdateLead} currentUser={currentUser} config={config} allUsers={allUsers} />;
      
      case 'kanban': 
        return <KanbanBoard leads={leads} phases={config.phases} onMoveLead={(id, ph) => setLeads(leads.map(l => l.id === id ? {...l, phaseId: ph, ownerId: currentUser.role === UserRole.CLOSER ? currentUser.id : l.ownerId} : l))} onSelectLead={setSelectedLeadId} role={currentUser.role} currentUserId={currentUser.id} searchTerm="" users={allUsers} />;
      
      case 'agenda':
        return <Agenda events={events} leads={leads} users={allUsers} currentUser={currentUser} config={config} onSaveEvent={(e) => setEvents(prev => [...prev, e])} onDeleteEvent={(id) => setEvents(prev => prev.filter(e => e.id !== id))} onSelectLead={setSelectedLeadId} />;

      case 'operational_dashboard':
        return <OperationalDashboard leads={leads} onUpdateLead={handleUpdateLead} currentUser={currentUser} templates={[]} />;

      case 'customers':
        return <CustomerDatabase leads={leads} currentUser={currentUser} onUpdateCustomer={handleUpdateLead} />;

      case 'post_sales':
        return <PostSalesDashboard leads={leads} users={allUsers} currentUser={currentUser} onUpdateLead={handleUpdateLead} config={config} templates={[]} />;

      case 'settings':
        return <Settings config={config} role={currentUser.role} currentUser={currentUser} onSaveConfig={setConfig} leads={leads} userGoals={[]} allUsers={allUsers} onSaveGoals={()=>{}} onSeedDatabase={()=>{}} onClearDatabase={() => setLeads([])} templates={[]} onSaveTemplates={()=>{}} onSyncTemplate={()=>{}} />;

      default: 
        return <Dashboard leads={leads} tasks={[]} notifications={[]} currentUser={currentUser} />;
    }
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  return (
    <div className="min-h-screen bg-slate-50 flex font-serif text-slate-900">
      <Sidebar 
        role={currentUser.role} 
        currentView={nav.view} 
        setView={(v) => setNav({ view: v })} 
        onOpenNewLead={() => setShowNewLeadForm(true)} 
        canCreate={true} 
      />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header 
          notifications={[]} 
          onMarkRead={() => {}} 
          onClearAll={() => {}} 
          onOpenNewLead={() => setShowNewLeadForm(true)} 
          currentUser={currentUser} 
          onSwitchRole={(r) => setCurrentUser(allUsers.find(u => u.role === r) || currentUser)} 
          canCreate={true} 
        />
        <main className="flex-1 ml-64 pt-28 p-12 max-w-[1800px]">
           {renderView()}
        </main>
      </div>

      {showNewLeadForm && (
        <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <NewLeadForm 
            config={config} 
            onSave={handleAddLead} 
            onCancel={() => setShowNewLeadForm(false)} 
            currentUser={currentUser} 
          />
        </div>
      )}

      {selectedLead && (
        <LeadDetails 
          lead={selectedLead} 
          config={config} 
          agendaEvents={events} 
          onClose={() => setSelectedLeadId(null)} 
          onUpdateLead={handleUpdateLead} 
          onDeleteLead={(id) => setLeads(leads.filter(l => l.id !== id))} 
          onAddInteraction={(id, inter) => setLeads(leads.map(l => l.id === id ? {...l, interactions: [{...inter, id: `int-${Date.now()}`, date: new Date().toISOString()}, ...l.interactions]} : l))} 
          onAddAgendaEvent={(e) => setEvents([...events, e])}
          onDeleteAgendaEvent={(id) => setEvents(events.filter(e => e.id !== id))}
          currentUser={currentUser} 
          allUsers={allUsers} 
          scripts={scripts}
        />
      )}
    </div>
  );
};

export default App;
