
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

  // States para novos itens
  const [newParam, setNewParam] = useState({ regime: '', service: '', size: '' });
  const [newPhaseName, setNewPhaseName] = useState('');

  // States para o Editor de Templates
  const [isTplModalOpen, setIsTplModalOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<Partial<OnboardingTemplate> | null>(null);

  const handleUpdateConfig = (updates: Partial<SystemConfig>) => {
    onSaveConfig({ ...config, ...updates });
  };

  // GESTÃO DE PIPELINE
  const addPhase = () => {
    if (!newPhaseName.trim()) return;
    const newPhase: KanbanPhase = {
      id: `ph-${Date.now()}`,
      name: newPhaseName,
      order: config.phases.length,
      color: '#cbd5e1',
      authorizedUserIds: []
    };
    handleUpdateConfig({ phases: [...config.phases, newPhase] });
    setNewPhaseName('');
  };

  const removePhase = (id: string) => {
    if (config.phases.length <= 1) return alert("O sistema precisa de pelo menos uma etapa no funil.");
    handleUpdateConfig({ phases: config.phases.filter(p => p.id !== id) });
  };

  const movePhase = (index: number, direction: 'up' | 'down') => {
    const nextPhases = [...config.phases].sort((a, b) => a.order - b.order);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= nextPhases.length) return;
    [nextPhases[index], nextPhases[targetIndex]] = [nextPhases[targetIndex], nextPhases[index]];
    const ordered = nextPhases.map((p, idx) => ({ ...p, order: idx }));
    handleUpdateConfig({ phases: ordered });
  };

  // GESTÃO DE TIPOS DE ATIVIDADE
  const addTaskType = () => {
    const newType: TaskType = {
      id: `tt-${Date.now()}`,
      name: 'Nova Atividade',
      channel: 'TELEFONE',
      color: '#c5a059',
      icon: '🔔',
      requireDecisor: true,
      template: 'Template padrão para nova atividade...'
    };
    handleUpdateConfig({ taskTypes: [...config.taskTypes, newType] });
  };

  const removeTaskType = (id: string) => {
    if (config.taskTypes.length <= 1) return alert("Mantenha ao menos um tipo de atividade.");
    handleUpdateConfig({ taskTypes: config.taskTypes.filter(t => t.id !== id) });
  };

  const updateTaskType = (id: string, updates: Partial<TaskType>) => {
    const next = config.taskTypes.map(t => {
      if (t.id === id) {
        return { ...t, ...updates };
      }
      return t;
    });
    handleUpdateConfig({ taskTypes: next });
  };

  // GESTÃO DE BÔNUS
  const handleUpdateBonus = (field: string, value: string) => {
    const numVal = parseFloat(value.replace(',', '.'));
    handleUpdateConfig({
      bonus: {
        ...config.bonus,
        [field]: isNaN(numVal) ? 0 : numVal
      }
    });
  };

  // GESTÃO DE PARÂMETROS
  const addCategory = (field: 'taxRegimes' | 'serviceTypes' | 'companySizes', value: string) => {
    if (!value.trim()) return;
    if (config[field].includes(value)) return alert("Esta categoria já existe.");
    handleUpdateConfig({ [field]: [...config[field], value] });
  };

  const removeCategory = (field: 'taxRegimes' | 'serviceTypes' | 'companySizes', value: string) => {
    handleUpdateConfig({ [field]: config[field].filter(v => v !== value) });
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

  // Added missing handlers for Onboarding Templates to fix compiler errors
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
    if (confirm("Deseja remover este modelo de onboarding?")) {
      onSaveTemplates(templates.filter(t => t.id !== id));
    }
  };

  const handleSaveTpl = () => {
    if (!editingTpl?.name || !editingTpl?.serviceType) {
      return alert("Preencha o nome e o tipo de serviço do modelo.");
    }
    
    const finalTpl: OnboardingTemplate = {
      ...editingTpl,
      id: editingTpl.id || `tpl-${Date.now()}`,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.name,
      phases: editingTpl.phases || []
    } as OnboardingTemplate;

    const exists = templates.find(t => t.id === finalTpl.id);
    const nextTemplates = exists 
      ? templates.map(t => t.id === finalTpl.id ? finalTpl : t)
      : [...templates, finalTpl];
    
    onSaveTemplates(nextTemplates);
    setIsTplModalOpen(false);
    setEditingTpl(null);
  };

  // Design Tokens
  const sectionTitleClass = "text-xl font-bold text-[#0a192f] serif-authority flex items-center gap-3 mb-8";
  const cardClass = "bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm relative";
  const labelHeader = "text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block";
  const inputStyled = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-[#0a192f] outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="max-w-7xl mx-auto space-y-12 animate-in fade-in pb-20">
      {/* HEADER GERAL */}
      <div className="flex justify-between items-end border-b border-slate-200 pb-10">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Configurações Gerais</h1>
          <p className="text-slate-500 text-lg font-medium">Customização de Pipeline, Bônus e Parâmetros.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-[2.2rem] border border-slate-200 shadow-inner overflow-x-auto no-scrollbar">
           {([['pipeline', '📝 PIPELINE'], ['comercial', '💸 METAS & BÔNUS'], ['parametros', '⚙️ PARÂMETROS'], ['journeys', '🏁 JORNADAS'], ['data', '💾 SISTEMA']] as const).map(([id, label]) => (
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
             <div className="flex justify-between items-center mb-8">
               <h3 className={sectionTitleClass}>
                  <span className="w-1 h-6 bg-amber-500 rounded-full"></span>
                  Etapas do Funil Comercial (Pipeline)
               </h3>
               <div className="flex gap-2">
                 <input 
                  value={newPhaseName} 
                  onChange={e => setNewPhaseName(e.target.value)} 
                  placeholder="Nome da Nova Etapa..."
                  className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:border-[#c5a059]"
                 />
                 <button onClick={addPhase} className="bg-[#0a192f] text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border-b-2 border-[#c5a059]">Adicionar Etapa</button>
               </div>
             </div>

             <div className="space-y-3">
                {config.phases.sort((a, b) => a.order - b.order).map((phase, idx) => (
                  <div key={phase.id} className="flex items-center gap-4 p-4 bg-slate-50/50 border border-slate-100 rounded-2xl group transition-all hover:bg-white hover:shadow-sm">
                     <div className="flex flex-col gap-1">
                        <button onClick={() => movePhase(idx, 'up')} className="text-[8px] hover:text-[#c5a059] opacity-30 group-hover:opacity-100 transition-all">▲</button>
                        <button onClick={() => movePhase(idx, 'down')} className="text-[8px] hover:text-[#c5a059] opacity-30 group-hover:opacity-100 transition-all">▼</button>
                     </div>
                     <div className="w-6 h-6 rounded shadow-inner" style={{ backgroundColor: phase.color }}></div>
                     <span className="flex-1 font-bold text-sm text-[#0a192f]">{phase.name}</span>
                     <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Posição: {phase.order + 1}</span>
                     <button onClick={() => removePhase(phase.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2">✕</button>
                  </div>
                ))}
             </div>
          </div>

          <div className="space-y-10">
             <div className="flex justify-between items-center px-4">
                <h3 className={sectionTitleClass}>
                   <span className="w-1 h-6 bg-[#4c51bf] rounded-full"></span>
                   Tipos de Atividade & Agenda
                </h3>
                <button onClick={addTaskType} className="bg-[#0a192f] text-white px-6 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border-b-2 border-[#c5a059]">+ Nova Atividade</button>
             </div>

             <div className="space-y-8">
                {config.taskTypes.map(type => (
                  <div key={type.id} className={cardClass}>
                     <button onClick={() => removeTaskType(type.id)} className="absolute top-8 right-8 text-slate-300 hover:text-red-500">✕</button>
                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                        <div className="lg:col-span-3 space-y-8">
                           <div>
                              <label className={labelHeader}>ÍCONE & NOME</label>
                              <div className="flex items-center gap-4">
                                 <div className="w-12 h-12 rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center text-xl shadow-inner">
                                    <input className="bg-transparent border-none text-center w-full focus:ring-0" value={type.icon} onChange={e => updateTaskType(type.id, { icon: e.target.value })} />
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
                                 <option>PRESENCIAL</option>
                              </select>
                           </div>
                        </div>
                        <div className="lg:col-span-9">
                           <label className={labelHeader}>SCRIPT SUGERIDO / TEMPLATE DE AGENDA</label>
                           <textarea 
                             className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-8 text-sm font-medium h-32 resize-none outline-none focus:border-[#c5a059] shadow-inner"
                             value={type.template}
                             onChange={e => updateTaskType(type.id, { template: e.target.value })}
                           />
                           <p className="text-[8px] text-slate-300 font-bold uppercase mt-3 italic">Variáveis dinâmicas: {"{{nome}}, {{empresa}}"}</p>
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </div>
        </section>
      )}

      {/* 2. TAB COMERCIAL (RESTAURADA COM BÔNUS) */}
      {activeTab === 'comercial' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
           {/* MATRIZ DE PREMIAÇÃO (NOVO) */}
           <div className={cardClass}>
              <h3 className={sectionTitleClass}>
                <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                Matriz de Premiação SDR / Closer (Bônus)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8">
                 <div>
                    <label className={labelHeader}>Qualificação Simples (R$)</label>
                    <input className={inputStyled} type="text" value={config.bonus.simpleQualification} onChange={e => handleUpdateBonus('simpleQualification', e.target.value)} />
                 </div>
                 <div>
                    <label className={labelHeader}>Quali c/ Decisor (R$)</label>
                    <input className={inputStyled} type="text" value={config.bonus.withDecisionMaker} onChange={e => handleUpdateBonus('withDecisionMaker', e.target.value)} />
                 </div>
                 <div>
                    <label className={labelHeader}>Reunião Agendada (R$)</label>
                    <input className={inputStyled} type="text" value={config.bonus.meetingScheduled} onChange={e => handleUpdateBonus('meetingScheduled', e.target.value)} />
                 </div>
                 <div>
                    <label className={labelHeader}>Proposta Enviada (R$)</label>
                    <input className={inputStyled} type="text" value={config.bonus.proposalBonus} onChange={e => handleUpdateBonus('proposalBonus', e.target.value)} />
                 </div>
                 <div>
                    <label className={labelHeader}>Contrato Ganho (R$)</label>
                    <input className={inputStyled} type="text" value={config.bonus.contractBonus} onChange={e => handleUpdateBonus('contractBonus', e.target.value)} />
                 </div>
              </div>
              <p className="mt-8 text-[10px] text-slate-400 font-bold uppercase italic">* Os valores acima são aplicados por ocorrência para cálculo de dashboard individual.</p>
           </div>

           {/* MATRIZ DE METAS */}
           <div className={cardClass}>
              <div className="flex justify-between items-center mb-10">
                 <div>
                    <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Matriz de Metas Mensais</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuração individual para o time de vendas.</p>
                 </div>
              </div>

              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="border-b border-slate-50">
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest">USUÁRIO</th>
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">QUALIFICAÇÕES</th>
                          <th className="py-6 text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">LIGAÇÕES/CALLS</th>
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
                                 <div className="w-10 h-10 rounded-full bg-[#0a192f] text-[#c5a059] flex items-center justify-center font-bold text-xs uppercase shadow-sm">{user.name.substring(0,2)}</div>
                                 <div>
                                    <p className="text-[10px] font-black text-[#0a192f] uppercase leading-none">{user.name}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1">{user.role}</p>
                                 </div>
                              </td>
                              <td className="text-center"><input type="number" className="w-20 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold text-center" value={goal?.qualsGoal || 0} onChange={e => handleUpdateGoal(user.id, 'qualsGoal', parseInt(e.target.value))} /></td>
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
        </section>
      )}

      {/* 3. TAB PARÂMETROS */}
      {activeTab === 'parametros' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              {/* REGIMES */}
              <div className={cardClass}>
                 <h4 className="text-sm font-bold text-[#0a192f] flex items-center gap-3 mb-8">Regimes de Tributação</h4>
                 <div className="flex gap-2 mb-6">
                    <input 
                      value={newParam.regime} 
                      onChange={e => setNewParam({...newParam, regime: e.target.value})} 
                      placeholder="Novo regime..." 
                      className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-bold" 
                    />
                    <button onClick={() => { addCategory('taxRegimes', newParam.regime); setNewParam({...newParam, regime: ''}); }} className="bg-[#0a192f] text-white px-4 rounded-lg text-[9px] font-black uppercase">Add</button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {config.taxRegimes.map((r, i) => (
                      <span key={i} className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border bg-indigo-50 text-indigo-600 group">
                        {r}
                        <button onClick={() => removeCategory('taxRegimes', r)} className="text-indigo-300 hover:text-red-500 font-black">✕</button>
                      </span>
                    ))}
                 </div>
              </div>

              {/* SERVIÇOS */}
              <div className={cardClass}>
                 <h4 className="text-sm font-bold text-[#0a192f] flex items-center gap-3 mb-8">Tipos de Serviços</h4>
                 <div className="flex gap-2 mb-6">
                    <input 
                      value={newParam.service} 
                      onChange={e => setNewParam({...newParam, service: e.target.value})} 
                      placeholder="Novo serviço..." 
                      className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-bold" 
                    />
                    <button onClick={() => { addCategory('serviceTypes', newParam.service); setNewParam({...newParam, service: ''}); }} className="bg-[#0a192f] text-white px-4 rounded-lg text-[9px] font-black uppercase">Add</button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {config.serviceTypes.map((s, i) => (
                      <span key={i} className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border bg-emerald-50 text-emerald-600">
                        {s}
                        <button onClick={() => removeCategory('serviceTypes', s)} className="text-emerald-300 hover:text-red-500 font-black">✕</button>
                      </span>
                    ))}
                 </div>
              </div>

              {/* PORTES */}
              <div className={cardClass}>
                 <h4 className="text-sm font-bold text-[#0a192f] flex items-center gap-3 mb-8">Portes Corporativos</h4>
                 <div className="flex gap-2 mb-6">
                    <input 
                      value={newParam.size} 
                      onChange={e => setNewParam({...newParam, size: e.target.value})} 
                      placeholder="Novo porte..." 
                      className="flex-1 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-bold" 
                    />
                    <button onClick={() => { addCategory('companySizes', newParam.size); setNewParam({...newParam, size: ''}); }} className="bg-[#0a192f] text-white px-4 rounded-lg text-[9px] font-black uppercase">Add</button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {config.companySizes.map((s, i) => (
                      <span key={i} className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border bg-amber-50 text-amber-600">
                        {s}
                        <button onClick={() => removeCategory('companySizes', s)} className="text-amber-300 hover:text-red-500 font-black">✕</button>
                      </span>
                    ))}
                 </div>
              </div>
           </div>
        </section>
      )}

      {activeTab === 'journeys' && (
        <section className="animate-in slide-in-from-bottom-4 space-y-12">
           <div className="flex justify-between items-center px-4">
              <h3 className="text-3xl font-bold text-[#0a192f] serif-authority">Modelos de Onboarding</h3>
              <button onClick={handleOpenNewTemplate} className="bg-[#0a192f] text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059]">
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
                   </div>
                   <button onClick={() => handleEditTemplate(tpl)} className="w-full py-5 bg-slate-50 text-[#0a192f] rounded-[1.8rem] font-black uppercase text-[10px] tracking-widest border-2 border-slate-100 hover:bg-[#0a192f] hover:text-white transition-all shadow-sm">
                    EDITAR
                   </button>
                </div>
              ))}
           </div>
        </section>
      )}

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

      {/* MODAL DO EDITOR DE TEMPLATE (MANTIDO POR SEGURANÇA) */}
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
              {/* Implemented missing editor content to fix component layout */}
              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                 <div className="grid grid-cols-2 gap-8 mb-10">
                    <div>
                       <label className={labelHeader}>NOME DO MODELO</label>
                       <input className={inputStyled} value={editingTpl.name || ''} onChange={e => setEditingTpl({...editingTpl, name: e.target.value})} placeholder="Ex: Jornada de Holding" />
                    </div>
                    <div>
                       <label className={labelHeader}>TIPO DE SERVIÇO VINCULADO</label>
                       <select className={inputStyled} value={editingTpl.serviceType || ''} onChange={e => setEditingTpl({...editingTpl, serviceType: e.target.value})}>
                          {config.serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                    </div>
                    <div className="col-span-2">
                       <label className={labelHeader}>DESCRIÇÃO BREVE</label>
                       <textarea className={`${inputStyled} h-24 resize-none pt-4`} value={editingTpl.description || ''} onChange={e => setEditingTpl({...editingTpl, description: e.target.value})} placeholder="Descreva o objetivo desta jornada..." />
                    </div>
                 </div>

                 <div className="space-y-6">
                    <div className="flex justify-between items-center mb-6">
                       <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Fases da Entrega Técnica</h3>
                       <button onClick={() => {
                          const newPhase: OnboardingTemplatePhase = { 
                            id: `tp-${Date.now()}`, 
                            name: 'Nova Fase', 
                            description: '', 
                            order: editingTpl.phases?.length || 0, 
                            defaultDueDays: 5, 
                            mandatory: true 
                          };
                          setEditingTpl({ ...editingTpl, phases: [...(editingTpl.phases || []), newPhase] });
                       }} className="px-6 py-2 bg-[#0a192f] text-white rounded-xl text-[9px] font-black uppercase tracking-widest border-b-2 border-[#c5a059]">+ Adicionar Fase</button>
                    </div>

                    <div className="space-y-4">
                       {editingTpl.phases?.map((phase, idx) => (
                          <div key={phase.id} className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-inner relative group">
                             <button onClick={() => setEditingTpl({ ...editingTpl, phases: editingTpl.phases?.filter(p => p.id !== phase.id) })} className="absolute top-8 right-8 text-slate-300 hover:text-red-500">✕</button>
                             <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                                <div className="md:col-span-4">
                                   <label className={labelHeader}>NOME DA FASE</label>
                                   <input className={inputStyled} value={phase.name} onChange={e => {
                                      const next = [...(editingTpl.phases || [])];
                                      next[idx] = { ...phase, name: e.target.value };
                                      setEditingTpl({ ...editingTpl, phases: next });
                                   }} />
                                </div>
                                <div className="md:col-span-2">
                                   <label className={labelHeader}>PRAZO (DIAS)</label>
                                   <input type="number" className={inputStyled} value={phase.defaultDueDays} onChange={e => {
                                      const next = [...(editingTpl.phases || [])];
                                      next[idx] = { ...phase, defaultDueDays: parseInt(e.target.value) || 0 };
                                      setEditingTpl({ ...editingTpl, phases: next });
                                   }} />
                                </div>
                                <div className="md:col-span-6">
                                   <label className={labelHeader}>DETALHES DA EXECUÇÃO</label>
                                   <input className={inputStyled} value={phase.description} onChange={e => {
                                      const next = [...(editingTpl.phases || [])];
                                      next[idx] = { ...phase, description: e.target.value };
                                      setEditingTpl({ ...editingTpl, phases: next });
                                   }} placeholder="O que deve ser feito nesta fase?" />
                                </div>
                             </div>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="p-10 border-t border-slate-100 bg-slate-50 flex justify-end gap-6">
                 <button onClick={() => setIsTplModalOpen(false)} className="px-10 py-4 bg-white border border-slate-200 text-slate-400 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                 <button onClick={handleSaveTpl} className="px-16 py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059]">Salvar Modelo</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
