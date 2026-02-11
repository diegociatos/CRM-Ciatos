
import React, { useState, useMemo } from 'react';
import { Lead, User, LeadStatus, NpsSurvey, SuccessTask, WelcomeData, SystemConfig, OnboardingTemplate, OnboardingItem } from '../types';

interface PostSalesDashboardProps {
  leads: Lead[];
  users: User[];
  currentUser: User;
  onUpdateLead: (lead: Lead) => void;
  config: SystemConfig;
  templates: OnboardingTemplate[];
}

const SUCCESS_STAGES = [
  { id: 'stg-welcome', name: 'Boas-Vindas', icon: '🎁' },
  { id: 'stg-onboard', name: 'Integração Operacional', icon: '🏗️' },
  { id: 'stg-nps', name: 'Satisfação (NPS)', icon: '📞' },
  { id: 'stg-expand', name: 'Retenção & Expansão', icon: '📈' }
];

const PostSalesDashboard: React.FC<PostSalesDashboardProps> = ({ 
  leads, users, currentUser, onUpdateLead, config, templates 
}) => {
  const contracts = useMemo(() => leads.filter(l => l.status === LeadStatus.WON), [leads]);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(contracts[0]?.id || null);
  const [activeStageId, setActiveStageId] = useState(SUCCESS_STAGES[0].id);
  const [showNpsRegisterModal, setShowNpsRegisterModal] = useState<NpsSurvey | null>(null);
  const [npsScore, setNpsScore] = useState(10);
  const [npsNotes, setNpsNotes] = useState('');
  const [newExpandTaskTitle, setNewExpandTaskTitle] = useState('');

  const activeContract = useMemo(() => contracts.find(c => c.id === selectedContractId), [contracts, selectedContractId]);

  const ltmStats = useMemo(() => {
    if (!activeContract) return { npsAvg: '0', health: 0 };
    const surveys = activeContract.npsSurveys?.filter(n => n.status === 'Concluido' && n.score !== undefined) || [];
    const avg = surveys.length > 0 ? (surveys.reduce((acc, n) => acc + (n.score || 0), 0) / surveys.length) : 0;
    return { npsAvg: avg.toFixed(1), health: activeContract.healthScore || 85 };
  }, [activeContract]);

  const handleUpdateWelcome = (updates: Partial<WelcomeData>) => {
    if (!activeContract) return;
    onUpdateLead({
      ...activeContract,
      welcomeData: { ...(activeContract.welcomeData || {}), ...updates }
    });
  };

  const handleToggleSuccessTask = (taskId: string) => {
    if (!activeContract) return;
    const nextTasks = activeContract.successTasks?.map(t => 
      t.id === taskId ? { ...t, status: (t.status === 'Concluido' ? 'Pendente' : 'Concluido') as any } : t
    );
    onUpdateLead({ ...activeContract, successTasks: nextTasks });
  };

  const handleAddExpandTask = () => {
    if (!activeContract || !newExpandTaskTitle.trim()) return;
    const newTask: SuccessTask = {
      id: `ext-${Date.now()}`,
      title: newExpandTaskTitle,
      dueDate: new Date().toISOString().split('T')[0],
      status: 'Pendente',
      category: 'Expansao'
    };
    onUpdateLead({ ...activeContract, successTasks: [...(activeContract.successTasks || []), newTask] });
    setNewExpandTaskTitle('');
  };

  const handleOpenNpsModal = () => {
    if (!activeContract) return;
    const pending = activeContract.npsSurveys?.find(n => n.status === 'Pendente');
    if (pending) {
      setShowNpsRegisterModal(pending);
    } else {
      setShowNpsRegisterModal({
        id: `nps-man-${Date.now()}`,
        scheduledAt: new Date().toLocaleDateString(),
        status: 'Pendente',
        type: '90_DAYS',
        channel: 'Telefone'
      });
    }
  };

  const handleFinalizeNps = () => {
    if (!activeContract || !showNpsRegisterModal) return;

    const finalizedNps: NpsSurvey = {
      ...showNpsRegisterModal,
      score: npsScore,
      notes: npsNotes,
      status: 'Concluido',
      performedAt: new Date().toISOString()
    };

    let nextSurveys = [...(activeContract.npsSurveys || [])];
    const exists = nextSurveys.find(n => n.id === finalizedNps.id);
    if (exists) {
      nextSurveys = nextSurveys.map(n => n.id === finalizedNps.id ? finalizedNps : n);
    } else {
      nextSurveys.push(finalizedNps);
    }

    const nextTasks = [...(activeContract.successTasks || [])];
    let healthChange = 0;
    
    if (npsScore <= 6) {
      healthChange = -20;
      nextTasks.push({
        id: `st-crisis-${Date.now()}`,
        title: '⚠️ URGENTE: Gestão de Crise (NPS Detrator)',
        dueDate: new Date().toISOString().split('T')[0],
        status: 'Pendente',
        category: 'NPS_FollowUp'
      });
    } else if (npsScore >= 9) {
      healthChange = 5;
      nextTasks.push({
        id: `st-expand-${Date.now()}`,
        title: '💎 Call de Expansão (Upsell Potencial)',
        dueDate: new Date().toISOString().split('T')[0],
        status: 'Pendente',
        category: 'Expansao'
      });
    }

    onUpdateLead({ 
      ...activeContract, 
      npsSurveys: nextSurveys, 
      successTasks: nextTasks,
      healthScore: Math.min(100, Math.max(0, (activeContract.healthScore || 85) + healthChange))
    });

    setShowNpsRegisterModal(null);
    setNpsNotes('');
    setNpsScore(10);
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-2 block";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="flex gap-8 animate-in fade-in duration-700">
      <div className="flex-1 space-y-10">
        <div className="flex justify-between items-start">
          <div className="max-w-xl">
            <h1 className="text-5xl font-black text-[#0a192f] serif-authority tracking-tighter mb-2">Success Central</h1>
            <p className="text-slate-400 text-sm font-medium">Gestão de LTV e Satisfação para o cliente <span className="text-[#c5a059] font-bold">{activeContract?.tradeName}</span></p>
            <div className="mt-8">
               <select 
                value={selectedContractId || ''} 
                onChange={(e) => setSelectedContractId(e.target.value)}
                className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-[#0a192f] shadow-sm outline-none focus:border-[#c5a059]"
               >
                 {contracts.map(c => <option key={c.id} value={c.id}>{c.tradeName} ({c.serviceType})</option>)}
                 {contracts.length === 0 && <option value="">Sem contratos ganhos</option>}
               </select>
            </div>
          </div>
          
          <div className="bg-[#0a192f] px-10 py-8 rounded-[2.5rem] border-b-[10px] border-[#c5a059] text-white shadow-2xl flex flex-col items-center min-w-[260px] relative overflow-hidden group">
             <div className="absolute top-0 right-0 w-24 h-24 bg-[#c5a059]/10 rounded-full blur-2xl group-hover:scale-150 transition-all"></div>
             <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-1 relative z-10">Health Score Base</p>
             <p className={`text-5xl font-black serif-authority relative z-10 ${ltmStats.health > 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{ltmStats.health}%</p>
          </div>
        </div>

        <div className="flex bg-white p-2 rounded-[2.5rem] border border-slate-100 shadow-sm overflow-x-auto">
          {SUCCESS_STAGES.map(stg => (
            <button 
              key={stg.id}
              onClick={() => setActiveStageId(stg.id)}
              className={`flex-1 min-w-[180px] px-8 py-5 rounded-[2rem] flex items-center gap-4 transition-all ${activeStageId === stg.id ? 'bg-[#0a192f] text-white shadow-xl scale-[1.02]' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <span className="text-2xl">{stg.icon}</span>
              <div className="text-left">
                 <p className={`text-[9px] font-black uppercase tracking-widest ${activeStageId === stg.id ? 'text-[#c5a059]' : 'text-slate-300'}`}>Monitoramento</p>
                 <p className="font-bold text-xs whitespace-nowrap">{stg.name}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm min-h-[400px]">
           {activeStageId === 'stg-welcome' && activeContract && (
              <div className="animate-in slide-in-from-bottom-4 space-y-12">
                 <div>
                    <h2 className="text-2xl font-bold text-[#0a192f] serif-authority">Jornada de Boas-Vindas</h2>
                    <p className="text-sm text-slate-400 font-medium">Controle de engajamento inicial e entrega de kit.</p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-8 bg-slate-50/50 p-10 rounded-[3rem] border border-slate-100">
                       <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">📞</span>
                          Ligação de Boas-Vindas
                       </h3>
                       <div className="space-y-6">
                          <div>
                             <label className={labelClass}>Data do Contato</label>
                             <input 
                                type="date" 
                                className={inputClass} 
                                value={activeContract.welcomeData?.callDate || ''} 
                                onChange={e => handleUpdateWelcome({ callDate: e.target.value })}
                             />
                          </div>
                          <div>
                             <label className={labelClass}>Como foi a conversa? (Ata Rápida)</label>
                             <textarea 
                                className={`${inputClass} h-32 resize-none`} 
                                placeholder="Registre aqui os pontos principais do alinhamento inicial..."
                                value={activeContract.welcomeData?.callNotes || ''}
                                onChange={e => handleUpdateWelcome({ callNotes: e.target.value })}
                             />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-10">
                       <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                          <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest flex items-center gap-3 mb-8">
                             <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shadow-sm">✉️</span>
                             E-mail de Boas-Vindas
                          </h3>
                          <div>
                             <label className={labelClass}>Data de Envio</label>
                             <input 
                                type="date" 
                                className={inputClass} 
                                value={activeContract.welcomeData?.emailDate || ''} 
                                onChange={e => handleUpdateWelcome({ emailDate: e.target.value })}
                             />
                             <p className="text-[9px] text-slate-400 mt-2 font-bold uppercase">Anexe o contrato assinado e a cartilha de onboarding.</p>
                          </div>
                       </div>

                       <div className={`p-10 rounded-[3rem] border-2 transition-all relative overflow-hidden ${activeContract.welcomeData?.kitSent ? 'bg-[#0a192f] border-[#c5a059] text-white shadow-xl' : 'bg-white border-slate-100'}`}>
                          <div className="flex justify-between items-start">
                             <h3 className={`text-sm font-black uppercase tracking-widest flex items-center gap-3 ${activeContract.welcomeData?.kitSent ? 'text-[#c5a059]' : 'text-[#0a192f]'}`}>
                                <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center shadow-sm text-base">🎁</span>
                                Kit Boas-Vindas
                             </h3>
                             <button 
                                onClick={() => handleUpdateWelcome({ kitSent: !activeContract.welcomeData?.kitSent })}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${activeContract.welcomeData?.kitSent ? 'bg-[#c5a059] text-[#0a192f] border-white' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                             >
                                {activeContract.welcomeData?.kitSent ? 'DESPACHADO ✓' : 'MARCAR COMO ENVIADO'}
                             </button>
                          </div>
                          {activeContract.welcomeData?.kitSent && (
                             <div className="mt-8 animate-in slide-in-from-top-2">
                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Data de Despacho</label>
                                <input 
                                   type="date" 
                                   className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none focus:border-[#c5a059]"
                                   value={activeContract.welcomeData?.kitDate || ''}
                                   onChange={e => handleUpdateWelcome({ kitDate: e.target.value })}
                                />
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
           )}

           {activeStageId === 'stg-onboard' && (
              <div className="animate-in slide-in-from-bottom-4 space-y-10">
                 <div className="flex justify-between items-center">
                    <div>
                       <h2 className="text-2xl font-bold text-[#0a192f] serif-authority">Monitoramento da Entrega Técnica</h2>
                       <p className="text-sm text-slate-400 font-medium">Visão espelhada do time operacional para acompanhamento do CS.</p>
                    </div>
                    <div className="flex items-center gap-4">
                       <span className="text-[10px] font-black uppercase text-slate-400">Progresso:</span>
                       <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-600" style={{ width: `${activeContract?.onboardingChecklist ? (activeContract.onboardingChecklist.filter(s => s.status === 'Concluido').length / Math.max(1, activeContract.onboardingChecklist.length)) * 100 : 0}%` }}></div>
                       </div>
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                    {activeContract?.onboardingChecklist?.map((step, idx) => (
                       <div key={step.id} className={`p-6 rounded-[2rem] border-2 flex items-center justify-between ${step.status === 'Concluido' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'}`}>
                          <div className="flex items-center gap-6">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${step.status === 'Concluido' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                {idx + 1}
                             </div>
                             <div>
                                <p className="font-bold text-[#0a192f] text-sm">{step.title}</p>
                                <p className="text-[9px] font-black uppercase text-slate-400">SLA Operacional: {step.status}</p>
                             </div>
                          </div>
                          {step.status === 'Bloqueado' && <span className="bg-rose-50 text-rose-600 px-3 py-1 rounded-lg text-[8px] font-black uppercase">⚠️ Gargalo Detectado</span>}
                       </div>
                    ))}
                    {(!activeContract?.onboardingChecklist || activeContract.onboardingChecklist.length === 0) && (
                       <p className="py-20 text-center opacity-30 italic">Nenhum cronograma operacional vinculado.</p>
                    )}
                 </div>
              </div>
           )}

           {activeStageId === 'stg-nps' && (
              <div className="animate-in slide-in-from-bottom-4 space-y-10">
                 <div className="flex justify-between items-center">
                    <div>
                       <h2 className="text-2xl font-bold text-[#0a192f] serif-authority">Régua de Satisfação</h2>
                       <p className="text-sm text-slate-400 font-medium">Ciclos de feedback essenciais para a blindagem do contrato.</p>
                    </div>
                    <button 
                      onClick={handleOpenNpsModal}
                      className="px-8 py-3 bg-[#0a192f] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                    >
                      🚀 Registrar Nova Pesquisa
                    </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {activeContract?.npsSurveys?.map(survey => (
                       <div key={survey.id} className={`p-8 rounded-[2.5rem] border-2 flex items-center gap-6 transition-all ${survey.status === 'Concluido' ? 'bg-white border-slate-100' : 'bg-amber-50 border-amber-200 shadow-lg'}`}>
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg ${survey.status === 'Concluido' ? (survey.score! >= 9 ? 'bg-emerald-500 text-white' : survey.score! >= 7 ? 'bg-amber-400 text-white' : 'bg-rose-500 text-white') : 'bg-white text-slate-300 border-2 border-dashed'}`}>
                             {survey.score || '?'}
                          </div>
                          <div className="flex-1">
                             <p className="font-bold text-[#0a192f] text-sm">{survey.type === 'ANNUAL' ? 'Ciclo Anual' : 'Acompanhamento'}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">{survey.status === 'Concluido' ? `Finalizado em ${new Date(survey.performedAt!).toLocaleDateString()}` : `Vence em ${survey.scheduledAt}`}</p>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
           )}

           {activeStageId === 'stg-expand' && (
              <div className="animate-in slide-in-from-bottom-4 space-y-10">
                 <div className="flex justify-between items-center">
                    <div>
                       <h2 className="text-2xl font-bold text-[#0a192f] serif-authority">Matriz de Expansão</h2>
                       <p className="text-sm text-slate-400 font-medium">Planejamento de cross-sell e novas teses tributárias.</p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group h-fit">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-2xl group-hover:scale-150 transition-all"></div>
                       <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-6">Nova Oportunidade</p>
                       <input 
                         value={newExpandTaskTitle}
                         onChange={e => setNewExpandTaskTitle(e.target.value)}
                         placeholder="Ex: Oferecer Blindagem Patrimonial"
                         className="w-full bg-white/5 border-2 border-white/10 rounded-2xl px-6 py-4 text-sm font-bold text-white outline-none focus:border-[#c5a059] mb-4"
                       />
                       <button onClick={handleAddExpandTask} className="w-full py-4 bg-[#c5a059] text-[#0a192f] rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95">Lançar Ação</button>
                    </div>

                    <div className="space-y-4">
                       <p className={labelClass}>Ações Planejadas</p>
                       {activeContract?.successTasks?.filter(t => t.category === 'Expansao').map(task => (
                          <div key={task.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group">
                             <span className="font-bold text-[#0a192f] text-xs">{task.title}</span>
                             <button onClick={() => handleToggleSuccessTask(task.id)} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${task.status === 'Concluido' ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white'}`}>
                                {task.status === 'Concluido' ? 'Concluído ✓' : 'Executar'}
                             </button>
                          </div>
                       ))}
                    </div>
                 </div>
              </div>
           )}
        </div>
      </div>

      <div className="w-96 space-y-8 animate-in slide-in-from-right-4 duration-1000 flex flex-col h-full min-h-[750px]">
         <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col h-full">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50">
               <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest serif-authority mb-1">Dossiê de Success</h3>
               <p className="text-[9px] text-slate-400 font-bold uppercase">Monitoramento Integrado</p>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
               <section>
                  <label className={labelClass}>Status da Parceria</label>
                  <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center gap-4">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
                     <span className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">Ativo & Saudável</span>
                  </div>
               </section>

               <section>
                  <label className={labelClass}>Gestor Responsável</label>
                  <div className="flex items-center gap-4">
                     <img src={users.find(u => u.id === activeContract?.ownerId)?.avatar} className="w-10 h-10 rounded-xl shadow-sm border border-slate-100" />
                     <div>
                        <p className="text-xs font-bold text-[#0a192f]">{users.find(u => u.id === activeContract?.ownerId)?.name}</p>
                        <p className="text-[9px] font-black text-slate-300 uppercase">Consultor de Sucesso</p>
                     </div>
                  </div>
               </section>

               <section>
                  <label className={labelClass}>Resumo de Relacionamento</label>
                  <div className="space-y-3">
                     <div className={`p-4 rounded-2xl border ${activeContract?.welcomeData?.callDate ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50/30 border-slate-100 opacity-50'}`}>
                        <p className="text-[9px] font-black uppercase text-slate-400">Ligação Boas-Vindas</p>
                        <p className="text-[10px] font-bold text-[#0a192f]">{activeContract?.welcomeData?.callDate || 'Pendente'}</p>
                     </div>
                     <div className={`p-4 rounded-2xl border ${activeContract?.welcomeData?.kitSent ? 'bg-emerald-50/30 border-emerald-100' : 'bg-slate-50/30 border-slate-100 opacity-50'}`}>
                        <p className="text-[9px] font-black uppercase text-slate-400">Kit Boas-Vindas</p>
                        <p className="text-[10px] font-bold text-[#0a192f]">{activeContract?.welcomeData?.kitSent ? 'Entregue' : 'Pendente'}</p>
                     </div>
                  </div>
               </section>
            </div>

            <div className="p-8 border-t border-slate-50">
               <button className="w-full py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all">
                 Gerar QBR (Relatório de Valor)
               </button>
            </div>
         </div>
      </div>

      {showNpsRegisterModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-[#0a192f]/95 backdrop-blur-md">
           <div className="bg-white w-full max-w-2xl rounded-[4rem] shadow-2xl p-12 animate-in zoom-in-95 duration-300">
              <div className="text-center mb-10">
                 <h2 className="text-3xl font-black text-[#0a192f] serif-authority mb-2">Entrevista de Satisfação</h2>
                 <p className="text-slate-400 font-medium italic">Data: {showNpsRegisterModal.scheduledAt}</p>
              </div>
              
              <div className="space-y-10">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center block mb-6">Escala de Recomendação (0-10)</label>
                    <div className="flex justify-between gap-1">
                       {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                         <button 
                          key={n} 
                          onClick={() => setNpsScore(n)} 
                          className={`w-10 h-10 rounded-xl font-black text-xs border-2 transition-all ${npsScore === n ? 'bg-[#c5a059] text-white border-[#c5a059] shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                         >
                           {n}
                         </button>
                       ))}
                    </div>
                 </div>

                 <div>
                    <label className={labelClass}>Notas Qualitativas</label>
                    <textarea 
                      value={npsNotes} 
                      onChange={e => setNpsNotes(e.target.value)} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 text-sm font-medium h-32 outline-none focus:border-[#c5a059]" 
                      placeholder="O que o cliente mencionou sobre a entrega?"
                    />
                 </div>

                 <div className="flex gap-4 pt-4">
                    <button onClick={handleFinalizeNps} className="flex-1 py-5 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059]">Salvar Feedback</button>
                    <button onClick={() => setShowNpsRegisterModal(null)} className="px-8 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-xs">Cancelar</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default PostSalesDashboard;
