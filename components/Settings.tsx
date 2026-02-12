
import React, { useState } from 'react';
import { 
  SystemConfig, UserRole, User, Lead, OnboardingTemplate, 
  KanbanPhase, TaskType, UserGoal, EmailProvider, CompanySize, OnboardingTemplatePhase
} from '../types';

interface SettingsProps {
  config: SystemConfig;
  role: UserRole;
  currentUser: User;
  onSaveConfig: (config: SystemConfig) => void;
  leads: Lead[];
  userGoals: UserGoal[];
  allUsers: User[];
  onSaveGoals: (goals: UserGoal[]) => void;
  onSeedDatabase: () => void;
  onClearDatabase: () => void;
  templates: OnboardingTemplate[];
  onSaveTemplates: (tpls: OnboardingTemplate[]) => void;
  onSyncTemplate: (templateId: string, leadIds: string[]) => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  config, onSaveConfig, leads, userGoals, allUsers, onSaveGoals, onSeedDatabase, onClearDatabase, templates, onSaveTemplates, onSyncTemplate, currentUser 
}) => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'comercial' | 'parametros' | 'journeys' | 'data'>('pipeline');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  // States para o Editor de Templates
  const [isTplModalOpen, setIsTplModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Partial<OnboardingTemplate> | null>(null);

  const handleUpdateConfig = (updates: Partial<SystemConfig>) => {
    onSaveConfig({ ...config, ...updates });
  };

  const handleUpdateGoal = (userId: string, field: keyof UserGoal, value: number) => {
    const existingIndex = userGoals.findIndex(g => g.userId === userId && g.month === selectedMonth);
    let nextGoals = [...userGoals];
    if (existingIndex >= 0) {
      nextGoals[existingIndex] = { ...nextGoals[existingIndex], [field]: value };
    } else {
      nextGoals.push({
        id: `goal-${userId}-${selectedMonth}`,
        userId, month: selectedMonth, year: 2025,
        qualsGoal: 0, callsGoal: 0, proposalsGoal: 0, contractsGoal: 0,
        [field]: value
      });
    }
    onSaveGoals(nextGoals);
  };

  const updateTaskType = (id: string, updates: Partial<TaskType>) => {
    const next = config.taskTypes.map(t => t.id === id ? { ...t, ...updates } : t);
    handleUpdateConfig({ taskTypes: next });
  };

  const removePhase = (id: string) => {
    handleUpdateConfig({ phases: config.phases.filter(p => p.id !== id) });
  };

  // Lógica de Template
  const handleOpenNewTemplate = () => {
    setEditingTpl({
      id: `tpl-${Date.now()}`,
      name: '',
      description: '',
      serviceType: config.serviceTypes[0] || 'Geral',
      phases: []
    });
    setIsTplModalOpen(true);
  };

  const handleEditTemplate = (tpl: OnboardingTemplate) => {
    setEditingTpl({ ...tpl });
    setIsTplModalOpen(true);
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm("Deseja excluir este modelo de jornada permanentemente?")) {
      onSaveTemplates(templates.filter(t => t.id !== id));
    }
  };

  const handleAddPhaseToTpl = () => {
    if (!editingTpl) return;
    const newPhase: OnboardingTemplatePhase = {
      id: `tp-${Date.now()}`,
      name: 'Nova Etapa',
      description: '',
      order: (editingTpl.phases?.length || 0),
      defaultDueDays: 5,
      mandatory: true
    };
    setEditingTpl({
      ...editingTpl,
      phases: [...(editingTpl.phases || []), newPhase]
    });
  };

  const handleUpdateTplPhase = (phaseId: string, updates: Partial<OnboardingTemplatePhase>) => {
    if (!editingTpl) return;
    const nextPhases = editingTpl.phases?.map(p => p.id === phaseId ? { ...p, ...updates } : p);
    setEditingTpl({ ...editingTpl, phases: nextPhases });
  };

  const handleRemoveTplPhase = (phaseId: string) => {
    if (!editingTpl) return;
    const nextPhases = editingTpl.phases?.filter(p => p.id !== phaseId);
    setEditingTpl({ ...editingTpl, phases: nextPhases });
  };

  const handleSaveTpl = () => {
    if (!editingTpl?.name) return alert("Dê um nome ao modelo.");
    if (!editingTpl.phases || editingTpl.phases.length === 0) return alert("Adicione ao menos uma etapa.");

    const finalTpl: OnboardingTemplate = {
      ...editingTpl,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name
    } as OnboardingTemplate;

    const exists = templates.find(t => t.id === finalTpl.id);
    if (exists) {
      onSaveTemplates(templates.map(t => t.id === finalTpl.id ? finalTpl : t));
    } else {
      onSaveTemplates([...templates, finalTpl]);
    }
    setIsTplModalOpen(false);
    setEditingTpl(null);
  };

  // Design Tokens da Ciatos
  const sectionTitleClass = "text-xl font-bold text-[#0a192f] serif-authority flex items-center gap-3 mb-8";
  const cardClass = "bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative";
  const labelHeader = "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block";
  const inputStyled = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-[#0a192f] outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in pb-20">
      {/* HEADER GERAL */}
      <div className="flex justify-between items-end border-b border-slate-200 pb-10">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority">Configurações Gerais</h1>
          <p className="text-slate-500 text-lg font-medium">Customização de Pipeline, Bônus e Parâmetros.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-[2.2rem] border border-slate-200 shadow-inner">
           {([['pipeline', '📝 PIPELINE'], ['comercial', '💸 METAS & BÔN'], ['parametros', '⚙️ PARÂMETROS'], ['journeys', '🏁 JORNADAS'], ['data', '💾 SISTEMA']] as const).map(([id, label]) => (
             <button 
               key={id}
               onClick={() => setActiveTab(id)}
               className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${activeTab === id ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
             >
               {label}
             </button>
           ))}
        </div>
      </div>

      {/* 1. TAB PIPELINE */}
      {activeTab === 'pipeline' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
          <div className={cardClass}>
             <h3 className={sectionTitleClass}>
                <span className="w-1 h-6 bg-amber-500 rounded-full"></span>
                Etapas do Funil Comercial
             </h3>
             <div className="space-y-3">
                {config.phases.map(phase => (
                  <div key={phase.id} className="flex items-center gap-4 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl group transition-all hover:bg-white hover:shadow-sm">
                     <div className="w-6 h-6 rounded shadow-inner" style={{ backgroundColor: phase.color }}></div>
                     <span className="flex-1 font-bold text-sm text-[#0a192f]">{phase.name}</span>
                     <button onClick={() => removePhase(phase.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                ))}
                <button className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[9px] font-black text-slate-400 uppercase tracking-widest hover:border-[#c5a059] hover:text-[#c5a059] transition-all">
                  + ADICIONAR ETAPA AO FUNIL
                </button>
             </div>
          </div>

          <div className="space-y-10">
             <div className="flex justify-between items-center px-4">
                <h3 className={sectionTitleClass}>
                   <span className="w-1 h-6 bg-[#4c51bf] rounded-full"></span>
                   Tipos de Atividade & Agenda
                </h3>
                <button className="bg-indigo-50 text-[#4c51bf] px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest">+ NOVO TIPO</button>
             </div>

             <div className="space-y-8">
                {config.taskTypes.map(type => (
                  <div key={type.id} className={cardClass}>
                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                        <div className="lg:col-span-3 space-y-8">
                           <div>
                              <label className={labelHeader}>ÍCONE & NOME</label>
                              <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center text-xl text-[#e53e3e] shadow-inner">
                                    {type.icon}
                                 </div>
                                 <input className={inputStyled} value={type.name} onChange={e => updateTaskType(type.id, { name: e.target.value })} />
                              </div>
                           </div>
                           <div>
                              <label className={labelHeader}>CANAL DE CONTATO</label>
                              <select className={inputStyled} value={type.channel} onChange={e => updateTaskType(type.id, { channel: e.target.value })}>
                                 <option>TELEFONE</option>
                                 <option>WHATSAPP</option>
                                 <option>REUNIÃO</option>
                              </select>
                           </div>
                        </div>
                        <div className="lg:col-span-9">
                           <label className={labelHeader}>SCRIPT / TEMPLATE DE AGENDA</label>
                           <textarea 
                             className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-8 text-sm font-medium h-32 resize-none outline-none focus:border-[#c5a059] shadow-inner"
                             value={type.template}
                             onChange={e => updateTaskType(type.id, { template: e.target.value })}
                           />
                           <p className="text-[8px] text-slate-300 font-bold uppercase mt-3 italic">Variáveis suportadas: {"{{nome}}, {{empresa}}"}</p>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </section>
      )}

      {/* 2. TAB COMERCIAL */}
      {activeTab === 'comercial' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
           <div className={cardClass}>
              <div className="flex justify-between items-center mb-10">
                 <div>
                    <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Matriz de Metas Mensais</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuração individual para SDRs e Consultores.</p>
                 </div>
                 <button className="bg-[#0a192f] text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl">
                    MÊS: FEVEREIRO
                 </button>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="border-b border-slate-50">
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest">USUÁRIO</th>
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">QUALIFICAÇÕES</th>
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">LIGAÇÕES (AGEND.)</th>
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">PROPOSTAS</th>
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">CONTRATOS</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {allUsers.filter(u => u.role === UserRole.SDR || u.role === UserRole.CLOSER).map(user => {
                         const goal = userGoals.find(g => g.userId === user.id && g.month === selectedMonth);
                         return (
                           <tr key={user.id}>
                              <td className="py-6 flex items-center gap-4">
                                 <div className="w-10 h-10 rounded-full bg-[#6366f1] text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">{user.name.substring(0,2)}</div>
                                 <div>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase leading-none">{user.role}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">{user.email}</p>
                                 </div>
                              </td>
                              <td className="text-center"><input type="number" className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={goal?.qualsGoal || 0} onChange={e => handleUpdateGoal(user.id, 'qualsGoal', parseInt(e.target.value)} /></td>
                              <td className="text-center"><input type="number" className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={goal?.callsGoal || 0} onChange={e => handleUpdateGoal(user.id, 'callsGoal', parseInt(e.target.value))} /></td>
                              <td className="text-center"><input type="number" className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={goal?.proposalsGoal || 0} onChange={e => handleUpdateGoal(user.id, 'proposalsGoal', parseInt(e.target.value))} /></td>
                              <td className="text-center"><input type="number" className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={goal?.contractsGoal || 0} onChange={e => handleUpdateGoal(user.id, 'contractsGoal', parseInt(e.target.value))} /></td>
                           </tr>
                         );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-7 bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm space-y-10">
                 <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Matriz de Premiação</h3>
                 <div className="space-y-4">
                    {[
                      { label: 'QUALIFICAÇÃO SIMPLES', field: 'simpleQualification', val: 15 },
                      { label: 'QUALIFICAÇÃO C/ DECISOR', field: 'withDecisionMaker', val: 30 },
                      { label: 'AGENDAMENTO CONFIRMADO', field: 'meetingScheduled', val: 50 },
                      { label: 'PROPOSTA ELABORADA', field: 'proposalBonus', val: 100 },
                      { label: 'CONTRATO GANHO (SDR)', field: 'contractBonus', val: 500 }
                    ].map(bonus => (
                       <div key={bonus.field} className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border border-slate-100 hover:border-[#c5a059] transition-all">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{bonus.label}</span>
                          <div className="flex items-center gap-6">
                             <span className="text-slate-300 font-bold text-xs uppercase">R$</span>
                             <input 
                               type="number" 
                               className="w-24 bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-sm font-black text-center outline-none focus:border-[#c5a059]" 
                               value={config.bonus[bonus.field] || bonus.val}
                               onChange={e => handleUpdateConfig({ bonus: { ...config.bonus, [bonus.field]: parseFloat(e.target.value) } })}
                             />
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

              <div className="lg:col-span-5 bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm flex flex-col justify-between overflow-hidden">
                 <div className="relative z-10">
                    <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-2">Canais de Mensageria</h3>
                    <div className="space-y-8">
                       <div>
                          <label className={labelHeader}>SERVIDOR SMTP (HOST)</label>
                          <input className={inputStyled} value={config.messaging.email.smtpHost || 'smtp.ciatos.com.br'} />
                       </div>
                       <div>
                          <label className={labelHeader}>WHATSAPP BUSINESS API KEY</label>
                          <input className={inputStyled} type="password" placeholder="Insira a chave da API..." />
                       </div>
                    </div>
                 </div>
                 <div className="mt-12 space-y-4">
                    <button className="w-full py-5 bg-[#0a192f] text-white rounded-[1.8rem] font-black uppercase text-xs shadow-xl border-b-4 border-[#c5a059] transition-all">Testar Conexão</button>
                 </div>
              </div>
           </div>
        </section>
      )}

      {/* 3. TAB PARÂMETROS */}
      {activeTab === 'parametros' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <div className={cardClass}>
                 <h4 className="text-sm font-bold text-[#0a192f] flex items-center gap-3 mb-10">Regimes de Tributação</h4>
                 <div className="flex flex-wrap gap-2">
                    {config.taxRegimes.map((r, i) => (
                      <span key={i} className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border bg-indigo-50 text-indigo-600">
                        {r}
                      </span>
                    ))}
                 </div>
              </div>
              <div className={cardClass}>
                 <h4 className="text-sm font-bold text-[#0a192f] flex items-center gap-3 mb-10">Tipos de Serviços</h4>
                 <div className="flex flex-wrap gap-2">
                    {config.serviceTypes.map((s, i) => (
                      <span key={i} className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border bg-emerald-50 text-emerald-600">
                        {s}
                      </span>
                    ))}
                 </div>
              </div>
              <div className={cardClass}>
                 <h4 className="text-sm font-bold text-[#0a192f] flex items-center gap-3 mb-10">Portes Corporativos</h4>
                 <div className="flex flex-wrap gap-2">
                    {config.companySizes.map((s, i) => (
                      <span key={i} className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border bg-amber-50 text-amber-600">
                        {s}
                      </span>
                    ))}
                 </div>
              </div>
           </div>
        </section>
      )}

      {/* 4. TAB JORNADAS (RESTAURADO E FUNCIONAL) */}
      {activeTab === 'journeys' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
           <div className="flex justify-between items-center px-4">
              <h3 className="text-3xl font-bold text-[#0a192f] serif-authority">Modelos de Onboarding</h3>
              <button 
                onClick={handleOpenNewTemplate}
                className="bg-[#0a192f] text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059]"
              >
                + CRIAR TEMPLATE
              </button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl relative group flex flex-col justify-between min-h-[450px]">
                   <button onClick={() => handleDeleteTemplate(tpl.id)} className="absolute top-10 right-10 text-slate-300 hover:text-red-500 transition-colors">✕</button>
                   <div>
                      <span className="px-5 py-1.5 bg-amber-50 text-[#c5a059] rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-100 inline-block">{tpl.serviceType}</span>
                      <h4 className="text-2xl font-bold text-[#0a192f] serif-authority mt-8 mb-3">{tpl.name}</h4>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed mb-8">{tpl.description}</p>
                      
                      <div className="space-y-4 mb-10">
                         {tpl.phases.map((p, idx) => (
                           <div key={p.id} className="flex items-center gap-4 text-[11px] font-bold text-slate-600">
                              <span className="w-7 h-7 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-300">{idx + 1}</span>
                              {p.name}
                           </div>
                         ))}
                      </div>
                   </div>
                   <button 
                    onClick={() => handleEditTemplate(tpl)}
                    className="w-full py-5 bg-slate-50 text-[#0a192f] rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest border-2 border-slate-100 hover:bg-[#0a192f] hover:text-white transition-all shadow-sm"
                   >
                    EDITAR
                   </button>
                </div>
              ))}
              
              {templates.length === 0 && (
                <div className="col-span-full py-32 text-center opacity-30 italic border-4 border-dashed border-slate-100 rounded-[4rem]">
                   <p className="text-2xl font-bold serif-authority">Nenhum template orquestrado.</p>
                </div>
              )}
           </div>
        </section>
      )}

      {/* 5. TAB SISTEMA */}
      {activeTab === 'data' && (
        <section className="animate-in slide-in-from-bottom-4 bg-white p-16 rounded-[4rem] border border-slate-100 shadow-sm text-center">
           <h3 className="text-3xl font-black text-[#0a192f] serif-authority mb-6 italic">Manutenção do Ecossistema</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-4xl mx-auto p-10">
              <div className="p-12 bg-red-50 rounded-[3.5rem] border-2 border-red-100">
                 <h4 className="text-xs font-black text-red-600 uppercase tracking-widest mb-6">Reset de Fábrica</h4>
                 <button onClick={onClearDatabase} className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-xs shadow-lg">Restaurar Padrões</button>
              </div>
              <div className="p-12 bg-slate-50 rounded-[3.5rem] border-2 border-slate-200">
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Motor de Simulação</h4>
                 <button onClick={onSeedDatabase} className="w-full py-5 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs shadow-lg">Gerar Base Amostral</button>
              </div>
           </div>
        </section>
      )}

      {/* MODAL DO EDITOR DE TEMPLATE */}
      {isTplModalOpen && editingTpl && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-[#0a192f]/90 backdrop-blur-md">
           <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
              <div className="p-10 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                 <div>
                    <h2 className="text-3xl font-black text-[#0a192f] serif-authority">Editor de Modelo Onboarding</h2>
                    <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Defina as fases obrigatórias de entrega técnica.</p>
                 </div>
                 <button onClick={() => setIsTplModalOpen(false)} className="text-3xl text-slate-300 hover:text-[#0a192f]">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar border-t border-slate-50">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
                    <div className="space-y-6">
                       <div>
                          <label className={labelHeader}>NOME DO MODELO</label>
                          <input className={inputStyled} value={editingTpl.name} onChange={e => setEditingTpl({...editingTpl, name: e.target.value})} placeholder="Ex: Jornada Holding 360" />
                       </div>
                       <div>
                          <label className={labelHeader}>SERVIÇO VINCULADO</label>
                          <select className={inputStyled} value={editingTpl.serviceType} onChange={e => setEditingTpl({...editingTpl, serviceType: e.target.value})}>
                             {config.serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                       </div>
                    </div>
                    <div>
                       <label className={labelHeader}>DESCRIÇÃO ESTRATÉGICA</label>
                       <textarea className={`${inputStyled} h-32 resize-none`} value={editingTpl.description} onChange={e => setEditingTpl({...editingTpl, description: e.target.value})} placeholder="Para que serve esta jornada?" />
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                       <h4 className="text-sm font-black text-[#0a192f] uppercase tracking-widest">Etapas da Jornada</h4>
                       <button 
                        onClick={handleAddPhaseToTpl}
                        className="bg-[#c5a059] text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest"
                       >
                         + ADICIONAR FASE
                       </button>
                    </div>

                    <div className="space-y-4">
                       {editingTpl.phases?.map((phase, idx) => (
                         <div key={phase.id} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 flex gap-8 group">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-[#0a192f] shadow-sm border border-slate-100 shrink-0">
                               {idx + 1}
                            </div>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
                               <div className="md:col-span-1">
                                  <label className={labelHeader}>NOME DA ETAPA</label>
                                  <input className={inputStyled} value={phase.name} onChange={e => handleUpdateTplPhase(phase.id, { name: e.target.value })} />
                               </div>
                               <div className="md:col-span-1">
                                  <label className={labelHeader}>PRAZO (DIAS ÚTEIS)</label>
                                  <input type="number" className={inputStyled} value={phase.defaultDueDays} onChange={e => handleUpdateTplPhase(phase.id, { defaultDueDays: parseInt(e.target.value) })} />
                               </div>
                               <div className="md:col-span-1">
                                  <div className="flex justify-between items-center mb-3">
                                     <label className={labelHeader} style={{marginBottom: 0}}>DESCRIÇÃO TÉCNICA</label>
                                     <button onClick={() => handleRemoveTplPhase(phase.id)} className="text-red-300 hover:text-red-500 font-bold text-[9px] uppercase">Remover</button>
                                  </div>
                                  <input className={inputStyled} value={phase.description} onChange={e => handleUpdateTplPhase(phase.id, { description: e.target.value })} placeholder="O que deve ser feito?" />
                               </div>
                            </div>
                         </div>
                       ))}
                       {(!editingTpl.phases || editingTpl.phases.length === 0) && (
                         <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem] opacity-30 italic text-sm">
                            Nenhuma etapa desenhada para este modelo.
                         </div>
                       )}
                    </div>
                 </div>
              </div>

              <div className="p-10 border-t border-slate-100 bg-slate-50 flex justify-end gap-6">
                 <button onClick={() => setIsTplModalOpen(false)} className="px-10 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                 <button 
                  onClick={handleSaveTpl}
                  className="px-16 py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                 >
                   Salvar Modelo de Jornada
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
