
import React, { useState, useMemo } from 'react';
import { 
  AutomationFlow, AutomationStep, AutomationTrigger, 
  MasterTemplate, LeadStatus, User, SystemConfig 
} from '../types';

interface AutomationManagerProps {
  flows: AutomationFlow[];
  templates: MasterTemplate[];
  users: User[];
  config: SystemConfig;
  onSaveFlow: (flow: AutomationFlow) => void;
  onDeleteFlow: (id: string) => void;
}

const AutomationManager: React.FC<AutomationManagerProps> = ({ flows, templates, users, config, onSaveFlow, onDeleteFlow }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingFlow, setEditingFlow] = useState<AutomationFlow | null>(null);
  const [viewMode, setViewMode] = useState<'designer' | 'analytics'>('designer');

  // Form states
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<AutomationTrigger>('LEAD_QUALIFIED');
  const [triggerSubValue, setTriggerSubValue] = useState('');
  const [steps, setSteps] = useState<AutomationStep[]>([]);

  const handleOpenCreate = () => {
    setName('');
    setTrigger('LEAD_QUALIFIED');
    setTriggerSubValue('');
    setSteps([]);
    setEditingFlow(null);
    setShowModal(true);
  };

  const handleEdit = (flow: AutomationFlow) => {
    setEditingFlow(flow);
    setName(flow.name);
    setTrigger(flow.trigger);
    setTriggerSubValue(flow.triggerSubValue || '');
    setSteps(flow.steps);
    setShowModal(true);
  };

  const handleAddStep = (type: AutomationStep['type']) => {
    const newStep: AutomationStep = {
      id: `step-${Math.random().toString(36).substr(2, 5)}`,
      type,
      templateId: type === 'SEND_MESSAGE' ? (templates[0]?.id || '') : undefined,
      waitDays: type === 'WAIT' ? 1 : undefined,
      status: type === 'CHANGE_STATUS' ? LeadStatus.NEW : undefined,
      userId: type === 'NOTIFY_USER' ? users[0]?.id : undefined
    };
    setSteps([...steps, newStep]);
  };

  const updateStep = (id: string, updates: Partial<AutomationStep>) => {
    setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const handlePublish = () => {
    if (!name.trim()) return alert("Por favor, dê um nome à jornada.");
    if (steps.length === 0) return alert("Adicione pelo menos um passo à jornada.");

    const flow: AutomationFlow = {
      id: editingFlow?.id || `flow-${Date.now()}`,
      name,
      trigger,
      triggerSubValue,
      steps,
      active: true,
      stats: editingFlow?.stats || { enrolled: 0, completed: 0, emailsSent: 0, opens: 0, clicks: 0 },
      logs: editingFlow?.logs || [],
      createdAt: editingFlow?.createdAt || new Date().toISOString()
    };

    onSaveFlow(flow);
    setShowModal(false);
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2";
  const selectClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3 text-sm font-bold focus:border-[#c5a059] outline-none";

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex justify-between items-center bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#c5a059]/10 rounded-full blur-[80px]"></div>
        <div className="relative z-10">
          <h2 className="text-4xl font-black serif-authority mb-2 tracking-tight">Arquiteto de Jornadas</h2>
          <p className="text-slate-400 font-medium">Configure réguas automáticas baseadas em eventos comerciais.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="relative z-10 bg-[#c5a059] text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:scale-105 transition-all border-b-4 border-[#b08d4b]"
        >
          + Desenhar Jornada
        </button>
      </div>

      {/* GRID DE FLUXOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {flows.map(flow => (
          <div key={flow.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between min-h-[350px]">
            <div>
              <div className="flex justify-between items-start mb-6">
                <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${flow.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {flow.active ? 'Ativa' : 'Pausada'}
                </span>
                <button onClick={() => onDeleteFlow(flow.id)} className="text-slate-300 hover:text-red-500">✕</button>
              </div>
              <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-4 group-hover:text-[#c5a059] transition-colors">{flow.name}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Gatilho: {flow.trigger.replace('_', ' ')}</p>
              
              <div className="space-y-3 mb-8">
                 <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                    <span>Leads Impactados</span>
                    <span className="text-[#0a192f]">{flow.stats.enrolled}</span>
                 </div>
                 <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${flow.stats.enrolled > 0 ? (flow.stats.completed/flow.stats.enrolled)*100 : 0}%` }}></div>
                 </div>
              </div>
            </div>
            <button 
              onClick={() => handleEdit(flow)}
              className="w-full py-4 bg-slate-50 text-[#0a192f] rounded-2xl text-[10px] font-black uppercase border border-slate-100 hover:bg-[#0a192f] hover:text-white transition-all"
            >
              Configurar Fluxo
            </button>
          </div>
        ))}
        {flows.length === 0 && (
          <div className="col-span-full py-20 text-center opacity-30 italic border-2 border-dashed border-slate-100 rounded-[3rem]">
            Nenhuma jornada publicada. Clique em "Desenhar Jornada" para começar.
          </div>
        )}
      </div>

      {/* MODAL DESIGNER */}
      {showModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-[#0a192f]/90 backdrop-blur-md">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black text-[#0a192f] serif-authority">Arquiteto de Fluxo</h2>
                <p className="text-slate-400 font-medium">Defina gatilhos e ações sequenciais.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-2xl text-slate-300">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-slate-50/20">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
                  <div className="space-y-6">
                     <div>
                        <label className={labelClass}>Nome da Jornada</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-[#0a192f] outline-none focus:border-[#c5a059]" placeholder="Ex: Régua Nutrição Holding" />
                     </div>
                     <div>
                        <label className={labelClass}>Gatilho de Entrada (Trigger)</label>
                        <select value={trigger} onChange={e => setTrigger(e.target.value as any)} className={selectClass}>
                           <option value="LEAD_QUALIFIED">🎯 Lead é Qualificado pelo SDR</option>
                           <option value="PHASE_CHANGED">🏁 Movimentação no Kanban</option>
                           <option value="PROPOSAL_SENT_SERVICE">💼 Proposta de Serviço Enviada</option>
                           <option value="LINK_CLICKED">🔗 Clique em Link de Marketing</option>
                        </select>
                     </div>

                     {/* GATILHOS CONDICIONAIS */}
                     {trigger === 'PHASE_CHANGED' && (
                       <div className="animate-in slide-in-from-top-2">
                          <label className={labelClass}>Ao entrar na fase:</label>
                          <select value={triggerSubValue} onChange={e => setTriggerSubValue(e.target.value)} className={selectClass}>
                             <option value="">Selecione a fase...</option>
                             {config.phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                       </div>
                     )}

                     {trigger === 'PROPOSAL_SENT_SERVICE' && (
                       <div className="animate-in slide-in-from-top-2">
                          <label className={labelClass}>Para o serviço:</label>
                          <select value={triggerSubValue} onChange={e => setTriggerSubValue(e.target.value)} className={selectClass}>
                             <option value="">Selecione o serviço...</option>
                             {config.serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                       </div>
                     )}
                  </div>

                  <div className="bg-[#0a192f] p-8 rounded-[3rem] text-white flex flex-col justify-center">
                     <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-4">Dica de Strategist</p>
                     <p className="text-sm font-medium leading-relaxed italic text-slate-300">
                        "Para serviços complexos como Holding, use gatilhos de 'Proposta Enviada' para disparar cases de sucesso nos dias seguintes, aumentando a taxa de fechamento."
                     </p>
                  </div>
               </div>

               {/* STEPS EDITOR */}
               <div className="space-y-6">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Sequência de Passos</h3>
                    <div className="flex gap-2">
                       <button onClick={() => handleAddStep('SEND_MESSAGE')} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-100 transition-all">+ Enviar E-mail</button>
                       <button onClick={() => handleAddStep('WAIT')} className="px-4 py-2 bg-amber-50 text-amber-600 rounded-xl text-[10px] font-black uppercase hover:bg-amber-100 transition-all">+ Esperar</button>
                       <button onClick={() => handleAddStep('CREATE_TASK')} className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-100 transition-all">+ Criar Tarefa CRM</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                     {steps.map((step, idx) => (
                       <div key={step.id} className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-100 flex items-center gap-6 shadow-sm group">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center font-black text-xs border border-slate-100">{idx+1}</div>
                          
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-center">
                             <div className="font-bold text-[#0a192f] text-sm uppercase tracking-tighter">
                                {step.type === 'SEND_MESSAGE' ? '✉️ Enviar Mensagem' : step.type === 'WAIT' ? '⏳ Aguardar Tempo' : '📌 Criar Tarefa'}
                             </div>

                             {step.type === 'SEND_MESSAGE' && (
                                <select 
                                  value={step.templateId} 
                                  onChange={e => updateStep(step.id, { templateId: e.target.value })}
                                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold"
                                >
                                   {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                             )}

                             {step.type === 'WAIT' && (
                                <div className="flex items-center gap-3">
                                   <input 
                                     type="number" 
                                     value={step.waitDays} 
                                     onChange={e => updateStep(step.id, { waitDays: parseInt(e.target.value) })}
                                     className="w-16 bg-slate-50 border border-slate-100 rounded-xl px-2 py-2 text-center text-xs font-black" 
                                   />
                                   <span className="text-[10px] font-black text-slate-400 uppercase">Dias</span>
                                </div>
                             )}

                             {step.type === 'CREATE_TASK' && (
                                <input 
                                  value={step.content} 
                                  onChange={e => updateStep(step.id, { content: e.target.value })}
                                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-bold"
                                  placeholder="Descrição da tarefa..."
                                />
                             )}
                          </div>

                          <button onClick={() => removeStep(step.id)} className="text-red-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">✕</button>
                       </div>
                     ))}
                     {steps.length === 0 && (
                       <div className="py-12 text-center text-slate-300 italic text-sm">Nenhum passo adicionado. Use os botões acima.</div>
                     )}
                  </div>
               </div>
            </div>

            <div className="p-10 border-t border-slate-100 bg-white flex justify-between items-center">
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic">Atenção: Novas jornadas passam a valer para novos leads imediatamente.</p>
               <div className="flex gap-6">
                  <button onClick={() => setShowModal(false)} className="px-10 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px]">Cancelar</button>
                  <button 
                    onClick={handlePublish}
                    className="px-16 py-4 bg-[#0a192f] text-white rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                  >
                    🚀 Publicar Jornada
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutomationManager;
