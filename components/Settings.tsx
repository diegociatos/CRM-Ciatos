
import React, { useState } from 'react';
import { SystemConfig, UserRole, User, Lead, OnboardingTemplate, OnboardingPhaseTemplate, KanbanPhase, TaskType, UserGoal } from '../types';

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
  const [editingTemplate, setEditingTemplate] = useState<OnboardingTemplate | null>(null);
  const [newItemText, setNewItemText] = useState('');

  const handleUpdateConfig = (updates: Partial<SystemConfig>) => {
    onSaveConfig({ ...config, ...updates });
  };

  const addItemToList = (field: 'taxRegimes' | 'serviceTypes' | 'companySizes') => {
    if (!newItemText.trim()) return;
    const currentList = config[field] as string[];
    if (currentList.includes(newItemText)) return;
    handleUpdateConfig({ [field]: [...currentList, newItemText.trim()] });
    setNewItemText('');
  };

  const removeItemFromList = (field: 'taxRegimes' | 'serviceTypes' | 'companySizes', item: string) => {
    const currentList = config[field] as string[];
    handleUpdateConfig({ [field]: currentList.filter(i => i !== item) });
  };

  const handleUpdateGoal = (userId: string, month: number, updates: Partial<UserGoal>) => {
    const year = new Date().getFullYear();
    const existingIdx = userGoals.findIndex(g => g.userId === userId && g.month === month && g.year === year);
    if (existingIdx >= 0) {
      const next = [...userGoals];
      next[existingIdx] = { ...next[existingIdx], ...updates };
      onSaveGoals(next);
    } else {
      onSaveGoals([...userGoals, { id: `goal-${Date.now()}`, userId, month, year, qualsGoal: 0, callsGoal: 0, proposalsGoal: 0, contractsGoal: 0, ...updates }]);
    }
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#c5a059]";

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in">
      <div className="border-b border-slate-200 pb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority">Configurações Gerais</h1>
          <p className="text-slate-500 text-lg font-medium">Customização de Pipeline, Bônus e Parâmetros.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-[2.2rem] border border-slate-200 shadow-inner overflow-x-auto">
           {([['pipeline', '📈 Pipeline'], ['comercial', '💸 Metas & Bôn'], ['parametros', '⚙️ Parâmetros'], ['journeys', '🏁 Jornadas'], ['data', '💾 Sistema']] as const).map(([id, label]) => (
             <button 
               key={id}
               onClick={() => setActiveTab(id)}
               className={`px-8 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === id ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
             >
               {label}
             </button>
           ))}
        </div>
      </div>

      {/* PIPELINE & TAREFAS */}
      {activeTab === 'pipeline' && (
        <section className="space-y-10">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-8 flex items-center gap-3">
                 <span className="w-1.5 h-6 bg-[#c5a059] rounded-full"></span>
                 Etapas do Funil Comercial
              </h3>
              <div className="space-y-4">
                 {config.phases.map(p => (
                   <div key={p.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <input type="color" value={p.color} onChange={e => handleUpdateConfig({ phases: config.phases.map(f => f.id === p.id ? {...f, color: e.target.value} : f)})} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-none" />
                      <input value={p.name} onChange={e => handleUpdateConfig({ phases: config.phases.map(f => f.id === p.id ? {...f, name: e.target.value} : f)})} className="flex-1 bg-transparent font-bold text-sm outline-none" />
                      <button onClick={() => handleUpdateConfig({ phases: config.phases.filter(f => f.id !== p.id)})} className="text-red-400 p-2 hover:bg-red-50 rounded-lg transition-colors">✕</button>
                   </div>
                 ))}
                 <button onClick={() => handleUpdateConfig({ phases: [...config.phases, { id: `ph-${Date.now()}`, name: 'Nova Etapa', color: '#94a3b8', order: config.phases.length, authorizedUserIds: [] }] })} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase text-slate-400 hover:border-[#c5a059] transition-all">+ Adicionar Etapa ao Funil</button>
              </div>
           </div>
           
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-xl font-bold text-[#0a192f] serif-authority flex items-center gap-3">
                    <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                    Tipos de Atividade & Agenda
                 </h3>
                 <button 
                  onClick={() => handleUpdateConfig({ 
                    taskTypes: [...config.taskTypes, { id: `tt-${Date.now()}`, name: 'Nova Atividade', channel: 'Telefone', color: '#6366f1', icon: '⚡', requireDecisor: true, template: 'Novo script...' }] 
                  })}
                  className="px-6 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all"
                 >
                   + Novo Tipo
                 </button>
              </div>
              
              <div className="grid grid-cols-1 gap-6">
                 {config.taskTypes.map(t => (
                   <div key={t.id} className="p-8 bg-slate-50/50 rounded-[2.5rem] border-2 border-slate-100 hover:border-indigo-200 transition-all group">
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                         <div className="space-y-4">
                            <div>
                               <label className={labelClass}>Ícone & Nome</label>
                               <div className="flex gap-2">
                                  <input 
                                    value={t.icon} 
                                    onChange={e => handleUpdateConfig({ taskTypes: config.taskTypes.map(f => f.id === t.id ? {...f, icon: e.target.value} : f)})} 
                                    className="w-12 bg-white border-2 border-slate-200 rounded-xl text-center text-xl focus:border-indigo-400 outline-none" 
                                  />
                                  <input 
                                    value={t.name} 
                                    onChange={e => handleUpdateConfig({ taskTypes: config.taskTypes.map(f => f.id === t.id ? {...f, name: e.target.value} : f)})} 
                                    className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-xs font-black text-[#0a192f] focus:border-indigo-400 outline-none" 
                                  />
                               </div>
                            </div>
                            <div>
                               <label className={labelClass}>Canal de Contato</label>
                               <select 
                                 value={t.channel}
                                 onChange={e => handleUpdateConfig({ taskTypes: config.taskTypes.map(f => f.id === t.id ? {...f, channel: e.target.value} : f)})}
                                 className="w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-widest outline-none focus:border-indigo-400"
                               >
                                  <option>Telefone</option>
                                  <option>WhatsApp</option>
                                  <option>Reunião</option>
                                  <option>E-mail</option>
                                  <option>Visita</option>
                               </select>
                            </div>
                         </div>
                         <div className="lg:col-span-3 relative">
                            <div className="flex justify-between items-center mb-2">
                               <label className={labelClass}>Script / Template de Agenda</label>
                               <button onClick={() => handleUpdateConfig({ taskTypes: config.taskTypes.filter(f => f.id !== t.id)})} className="text-red-400 text-[10px] font-black uppercase hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Remover Tipo</button>
                            </div>
                            <textarea 
                              value={t.template} 
                              onChange={e => handleUpdateConfig({ taskTypes: config.taskTypes.map(f => f.id === t.id ? {...f, template: e.target.value} : f)})} 
                              className="w-full bg-white border-2 border-slate-200 rounded-[1.5rem] px-6 py-4 text-xs h-32 resize-none font-medium text-slate-600 focus:border-indigo-400 outline-none shadow-inner"
                              placeholder="Ex: Olá {{nome}}, agendamos nossa call para a {{empresa}}..."
                            />
                            <p className="text-[8px] text-slate-400 mt-2 italic">Variáveis suportadas: <span className="font-bold text-indigo-400">{"{{nome}}"}</span>, <span className="font-bold text-indigo-400">{"{{empresa}}"}</span></p>
                         </div>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </section>
      )}

      {/* ABA DE PARÂMETROS (RESTORED & IMPROVED) */}
      {activeTab === 'parametros' && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in slide-in-from-bottom-4">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority flex items-center gap-3">
                 <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                 Regimes de Tributação
              </h3>
              <div className="space-y-6">
                 <div className="flex gap-2">
                    <input 
                      className={inputClass} 
                      placeholder="Novo regime (ex: Lucro Arbitrado)" 
                      value={newItemText} 
                      onChange={e => setNewItemText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addItemToList('taxRegimes')}
                    />
                    <button onClick={() => addItemToList('taxRegimes')} className="px-6 bg-[#0a192f] text-white rounded-xl font-black uppercase text-[10px]">Add</button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {config.taxRegimes.map(r => (
                      <span key={r} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase border border-indigo-100 flex items-center gap-3 group">
                        {r}
                        <button onClick={() => removeItemFromList('taxRegimes', r)} className="text-indigo-300 hover:text-red-500 transition-colors">✕</button>
                      </span>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority flex items-center gap-3">
                 <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                 Tipos de Serviços / Soluções
              </h3>
              <div className="space-y-6">
                 <div className="flex gap-2">
                    <input 
                      className={inputClass} 
                      placeholder="Nova solução comercial..." 
                      value={newItemText} 
                      onChange={e => setNewItemText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addItemToList('serviceTypes')}
                    />
                    <button onClick={() => addItemToList('serviceTypes')} className="px-6 bg-[#0a192f] text-white rounded-xl font-black uppercase text-[10px]">Add</button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {config.serviceTypes.map(s => (
                      <span key={s} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase border border-emerald-100 flex items-center gap-3 group">
                        {s}
                        <button onClick={() => removeItemFromList('serviceTypes', s)} className="text-emerald-300 hover:text-red-500 transition-colors">✕</button>
                      </span>
                    ))}
                 </div>
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority flex items-center gap-3">
                 <span className="w-1.5 h-6 bg-amber-500 rounded-full"></span>
                 Portes Corporativos
              </h3>
              <div className="space-y-6">
                 <div className="flex gap-2">
                    <input 
                      className={inputClass} 
                      placeholder="Novo porte (ex: Startups)" 
                      value={newItemText} 
                      onChange={e => setNewItemText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addItemToList('companySizes')}
                    />
                    <button onClick={() => addItemToList('companySizes')} className="px-6 bg-[#0a192f] text-white rounded-xl font-black uppercase text-[10px]">Add</button>
                 </div>
                 <div className="flex flex-wrap gap-2">
                    {config.companySizes.map(s => (
                      <span key={s} className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase border border-amber-100 flex items-center gap-3 group">
                        {s}
                        <button onClick={() => removeItemFromList('companySizes', s)} className="text-amber-300 hover:text-red-500 transition-colors">✕</button>
                      </span>
                    ))}
                 </div>
              </div>
           </div>

           <div className="p-10 bg-[#0a192f] rounded-[3rem] text-white flex flex-col justify-center items-center text-center">
              <div className="w-20 h-20 bg-[#c5a059]/20 rounded-full flex items-center justify-center text-4xl mb-6">⚙️</div>
              <h4 className="text-xl font-bold serif-authority mb-3">Integridade de Dados</h4>
              <p className="text-xs text-slate-400 leading-relaxed px-10">
                A alteração destes parâmetros afeta imediatamente as opções de filtros no Radar Inteligente e nos Dossiês de Lead.
              </p>
           </div>
        </section>
      )}

      {/* METAS & BÔNUS */}
      {activeTab === 'comercial' && (
        <section className="space-y-12">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex justify-between items-center mb-10">
                <div>
                  <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Matriz de Metas Mensais</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-black mt-1">Configuração individual para SDRs e Consultores.</p>
                </div>
                <div className="bg-[#0a192f] text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                  Mês: {new Date().toLocaleString('pt-BR', { month: 'long' })}
                </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="border-b">
                          <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400">Usuário</th>
                          <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 text-center">Qualificações</th>
                          <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 text-center">Ligações (Agend.)</th>
                          <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 text-center">Propostas</th>
                          <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 text-center">Contratos</th>
                       </tr>
                    </thead>
                    <tbody>
                       {allUsers
                        .filter(u => u.role === UserRole.SDR || u.role === UserRole.CLOSER)
                        .map(user => {
                         const goal = userGoals.find(g => g.userId === user.id && g.month === new Date().getMonth()) || { qualsGoal: 0, callsGoal: 0, proposalsGoal: 0, contractsGoal: 0 };
                         const isSdr = user.role === UserRole.SDR;
                         
                         return (
                           <tr key={user.id} className="border-b hover:bg-slate-50/50 transition-colors">
                              <td className="py-5 px-6">
                                 <div className="flex items-center gap-4">
                                    <div className="relative">
                                       <img src={user.avatar} className="w-10 h-10 rounded-2xl border-2 border-white shadow-sm" alt="" />
                                       <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${isSdr ? 'bg-indigo-500' : 'bg-[#c5a059]'}`}></div>
                                    </div>
                                    <div>
                                       <p className={`text-[10px] font-black uppercase tracking-widest ${isSdr ? 'text-indigo-500' : 'text-[#c5a059]'}`}>{user.role}</p>
                                       <p className="text-[10px] text-slate-400 font-bold">{user.email.split('@')[0]}</p>
                                    </div>
                                 </div>
                              </td>
                              <td className="py-5 px-6">
                                 <input 
                                   type="number" 
                                   className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2.5 text-center font-black text-sm outline-none focus:border-[#c5a059]" 
                                   value={goal.qualsGoal} 
                                   onChange={e => handleUpdateGoal(user.id, new Date().getMonth(), { qualsGoal: parseInt(e.target.value) || 0 })} 
                                 />
                              </td>
                              <td className="py-5 px-6">
                                 <input 
                                   type="number" 
                                   className="w-full bg-slate-50 border border-slate-100 rounded-lg py-2.5 text-center font-black text-sm outline-none focus:border-[#c5a059]" 
                                   value={goal.callsGoal} 
                                   onChange={e => handleUpdateGoal(user.id, new Date().getMonth(), { callsGoal: parseInt(e.target.value) || 0 })} 
                                 />
                              </td>
                              <td className="py-5 px-6">
                                 <input 
                                   type="number" 
                                   disabled={isSdr}
                                   placeholder={isSdr ? "—" : "0"}
                                   className={`w-full bg-slate-50 border border-slate-100 rounded-lg py-2.5 text-center font-black text-sm outline-none focus:border-[#c5a059] ${isSdr ? 'opacity-20 bg-slate-200 cursor-not-allowed' : ''}`} 
                                   value={isSdr ? 0 : goal.proposalsGoal} 
                                   onChange={e => handleUpdateGoal(user.id, new Date().getMonth(), { proposalsGoal: parseInt(e.target.value) || 0 })} 
                                 />
                              </td>
                              <td className="py-5 px-6">
                                 <input 
                                   type="number" 
                                   disabled={isSdr}
                                   placeholder={isSdr ? "—" : "0"}
                                   className={`w-full bg-slate-50 border border-slate-100 rounded-lg py-2.5 text-center font-black text-sm outline-none focus:border-[#c5a059] ${isSdr ? 'opacity-20 bg-slate-200 cursor-not-allowed' : ''}`} 
                                   value={isSdr ? 0 : goal.contractsGoal} 
                                   onChange={e => handleUpdateGoal(user.id, new Date().getMonth(), { contractsGoal: parseInt(e.target.value) || 0 })} 
                                 />
                              </td>
                           </tr>
                         );
                       })}
                    </tbody>
                 </table>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
                 <div>
                    <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Matriz de Premiação</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-black mt-1">Valores por Milestone Alcançado.</p>
                 </div>
                 <div className="space-y-4">
                    {[
                      ['simpleQualification', 'Qualificação Simples'],
                      ['withDecisionMaker', 'Qualificação c/ Decisor'],
                      ['meetingScheduled', 'Agendamento Confirmado'],
                      ['proposalBonus', 'Proposta Elaborada'],
                      ['contractBonus', 'Contrato Ganho (SDR)']
                    ].map(([key, label]) => (
                      <div key={key} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
                         <div className="flex items-center gap-2">
                            <span className="text-slate-300 font-bold">R$</span>
                            <input type="number" step="0.5" value={(config.bonus as any)[key]} onChange={e => handleUpdateConfig({ bonus: { ...config.bonus, [key]: parseFloat(e.target.value) } })} className="w-24 bg-white border-2 border-slate-200 rounded-lg px-3 py-2 font-black text-right outline-none focus:border-[#c5a059]" />
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
              
              <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8 flex flex-col justify-between">
                 <div className="space-y-8">
                    <div>
                      <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Canais de Mensageria</h3>
                      <p className="text-[10px] text-slate-400 uppercase font-black mt-1">Integração de E-mail e WhatsApp.</p>
                    </div>
                    <div className="space-y-6">
                       <div>
                          <label className={labelClass}>Servidor SMTP (Host)</label>
                          <input value={config.messaging.smtp?.host} onChange={e => handleUpdateConfig({ messaging: { ...config.messaging, smtp: { ...config.messaging.smtp, host: e.target.value } } })} className={inputClass} />
                       </div>
                       <div>
                          <label className={labelClass}>WhatsApp Business API Key</label>
                          <input type="password" value={config.messaging.whatsapp?.apiKey} onChange={e => handleUpdateConfig({ messaging: { ...config.messaging, whatsapp: { ...config.messaging.whatsapp, apiKey: e.target.value } } })} className={inputClass} />
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </section>
      )}

      {/* JORNADAS / ONBOARDING */}
      {activeTab === 'journeys' && (
        <section className="space-y-8">
           <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Modelos de Onboarding</h3>
              <button 
                onClick={() => setEditingTemplate({ id: `tpl-${Date.now()}`, serviceType: config.serviceTypes[0], name: 'Novo Fluxo', description: '', phases: [], updatedAt: new Date().toISOString(), updatedBy: currentUser.name })}
                className="px-8 py-3 bg-[#0a192f] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest"
              >
                + Criar Template
              </button>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {templates.map(tpl => (
                <div key={tpl.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between">
                   <div>
                      <div className="flex justify-between items-start mb-6">
                         <span className="px-3 py-1 bg-amber-50 text-[#c5a059] rounded-lg text-[8px] font-black uppercase tracking-widest">{tpl.serviceType}</span>
                         <button onClick={() => onSaveTemplates(templates.filter(t => t.id !== tpl.id))} className="text-red-300 hover:text-red-500">✕</button>
                      </div>
                      <h4 className="text-2xl font-bold text-[#0a192f] serif-authority mb-2">{tpl.name}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-6">{tpl.description}</p>
                      <div className="space-y-2">
                         {tpl.phases.sort((a,b) => a.order - b.order).map((p, i) => (
                           <div key={p.id} className="flex items-center gap-3 text-[10px] font-bold text-slate-500">
                              <span className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[8px]">{i+1}</span>
                              {p.name}
                           </div>
                         ))}
                      </div>
                   </div>
                   <div className="flex gap-2 mt-8">
                     <button onClick={() => setEditingTemplate(tpl)} className="flex-1 py-3 bg-slate-50 text-[#0a192f] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">Editar</button>
                   </div>
                </div>
              ))}
           </div>
        </section>
      )}

      {/* DADOS & SISTEMA */}
      {activeTab === 'data' && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-8">Base de Conhecimento</h3>
              <div className="space-y-6">
                 <button onClick={onSeedDatabase} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-lg shadow-indigo-200 active:scale-95 transition-all">
                    🌱 Gerar Carga de Testes (60 Leads)
                 </button>
              </div>
           </div>
           
           <div className="bg-red-50/50 p-10 rounded-[3rem] border border-red-100 shadow-sm">
              <h3 className="text-xl font-bold text-red-800 serif-authority mb-8">Zona de Risco</h3>
              <div className="space-y-6">
                 <button onClick={() => { if(confirm('Toda a base será destruída. Continuar?')) onClearDatabase(); }} className="w-full py-5 bg-white border-2 border-red-200 text-red-600 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] hover:bg-red-600 hover:text-white transition-all">
                    💀 Resetar Fábrica (Limpar Tudo)
                 </button>
              </div>
           </div>
        </section>
      )}

      {/* MODAL EDIÇÃO TEMPLATE */}
      {editingTemplate && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setEditingTemplate(null)}></div>
           <div className="relative bg-white w-full max-w-4xl h-[85vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
              <div className="p-10 border-b bg-slate-50 flex justify-between items-center">
                 <h2 className="text-2xl font-black text-[#0a192f] serif-authority">Configurar Jornada</h2>
                 <button onClick={() => setEditingTemplate(null)} className="text-3xl text-slate-300">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                 <div className="grid grid-cols-2 gap-6">
                    <div>
                       <label className={labelClass}>Nome do Fluxo</label>
                       <input className={inputClass} value={editingTemplate.name} onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})} />
                    </div>
                    <div>
                       <label className={labelClass}>Tipo de Serviço</label>
                       <select className={inputClass} value={editingTemplate.serviceType} onChange={e => setEditingTemplate({...editingTemplate, serviceType: e.target.value})}>
                          {config.serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <h4 className="text-sm font-black uppercase tracking-widest text-slate-400">Etapas Técnicas</h4>
                       <button 
                         onClick={() => setEditingTemplate({...editingTemplate, phases: [...editingTemplate.phases, { id: `p-${Date.now()}`, name: 'Nova Fase', description: '', order: editingTemplate.phases.length, defaultDueDays: 5, mandatory: true }]})}
                         className="text-[10px] font-black text-indigo-600"
                       >
                         + Adicionar Fase
                       </button>
                    </div>
                    
                    <div className="space-y-4">
                       {editingTemplate.phases.map((p, idx) => (
                         <div key={p.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-1 text-xs font-black text-slate-300">{idx+1}</div>
                            <div className="col-span-5">
                               <input className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={p.name} onChange={e => {
                                 const next = [...editingTemplate.phases];
                                 next[idx] = { ...p, name: e.target.value };
                                 setEditingTemplate({...editingTemplate, phases: next});
                               }} />
                            </div>
                            <div className="col-span-3">
                               <div className="flex items-center gap-2">
                                  <input type="number" className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-2 text-xs font-bold text-center" value={p.defaultDueDays} onChange={e => {
                                    const next = [...editingTemplate.phases];
                                    next[idx] = { ...p, defaultDueDays: parseInt(e.target.value) || 0 };
                                    setEditingTemplate({...editingTemplate, phases: next});
                                  }} />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">Dias</span>
                               </div>
                            </div>
                            <div className="col-span-2">
                               <button onClick={() => {
                                 const next = [...editingTemplate.phases];
                                 next.splice(idx, 1);
                                 setEditingTemplate({...editingTemplate, phases: next});
                               }} className="text-red-300 hover:text-red-500">✕</button>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
              <div className="p-10 border-t bg-slate-50">
                 <button 
                   onClick={() => {
                     const idx = templates.findIndex(t => t.id === editingTemplate.id);
                     if (idx >= 0) {
                       const next = [...templates];
                       next[idx] = editingTemplate;
                       onSaveTemplates(next);
                     } else {
                       onSaveTemplates([...templates, editingTemplate]);
                     }
                     setEditingTemplate(null);
                   }}
                   className="w-full py-5 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059]"
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
