
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Lead, OnboardingItem, User, LeadStatus, OnboardingComment, OnboardingAttachment, OnboardingTemplate } from '../types';

interface OperationalDashboardProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
  currentUser: User;
  templates: OnboardingTemplate[];
}

const OperationalDashboard: React.FC<OperationalDashboardProps> = ({ leads, onUpdateLead, currentUser, templates }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeContracts = useMemo(() => {
    return leads.filter(l => l.status === LeadStatus.WON);
  }, [leads]);

  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  // Sincroniza a seleção inicial assim que os leads são carregados
  useEffect(() => {
    if (!activeLeadId && activeContracts.length > 0) {
      setActiveLeadId(activeContracts[0].id);
    }
  }, [activeContracts, activeLeadId]);

  const selectedLead = useMemo(() => leads.find(l => l.id === activeLeadId), [leads, activeLeadId]);
  
  const currentStep = useMemo(() => {
    if (!selectedLead || !activeStepId) return null;
    return selectedLead.onboardingChecklist?.find(s => s.id === activeStepId);
  }, [selectedLead, activeStepId]);

  const calculateProgress = (lead: Lead) => {
    if (!lead.onboardingChecklist || lead.onboardingChecklist.length === 0) return 0;
    const done = lead.onboardingChecklist.filter(s => s.status === 'Concluido').length;
    return Math.round((done / lead.onboardingChecklist.length) * 100);
  };

  const handleUpdateStep = (updates: Partial<OnboardingItem>) => {
    if (!selectedLead || !activeStepId) return;
    const nextChecklist = selectedLead.onboardingChecklist?.map(s => 
      s.id === activeStepId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
    );
    onUpdateLead({ ...selectedLead, onboardingChecklist: nextChecklist });
  };

  const handleApplyTemplate = () => {
    if (!selectedLead) return;
    
    // Procura template exato ou por tipo de serviço
    const activeTpl = templates.find(t => t.serviceType === selectedLead.serviceType || t.id === selectedLead.onboardingTemplateId);
    
    if (!activeTpl) {
      alert(`Nenhum template de onboarding encontrado para o serviço "${selectedLead.serviceType}". Crie um template em Configurações > Jornadas.`);
      return;
    }

    const baseDate = selectedLead.contractStart ? new Date(selectedLead.contractStart) : new Date();
    
    const checklist: OnboardingItem[] = activeTpl.phases.map(p => {
      return {
        id: `oi-${Date.now()}-${p.id}`,
        title: p.name,
        description: p.description,
        status: 'Pendente',
        responsibleId: selectedLead.ownerId,
        dueDate: baseDate.toISOString().split('T')[0],
        updatedAt: new Date().toISOString(),
        items: [],
        comments: [],
        attachments: [],
        templatePhaseId: p.id
      };
    });

    onUpdateLead({ 
      ...selectedLead, 
      onboardingChecklist: checklist, 
      onboardingTemplateId: activeTpl.id 
    });
  };

  const addComment = () => {
    if (!commentText.trim() || !currentStep) return;
    const newComment: OnboardingComment = {
      id: `c-${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      text: commentText,
      date: new Date().toISOString()
    };
    handleUpdateStep({ comments: [...currentStep.comments, newComment] });
    setCommentText('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentStep || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    
    const newAttachment: OnboardingAttachment = {
      id: `att-${Date.now()}`,
      name: file.name,
      url: URL.createObjectURL(file),
      date: new Date().toISOString(),
      uploadedBy: currentUser.name
    };
    handleUpdateStep({ attachments: [...currentStep.attachments, newAttachment] });
    alert(`Arquivo "${file.name}" anexado com sucesso!`);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const markAsConcluded = () => {
    if (!currentStep || !selectedLead) return;
    handleUpdateStep({ status: 'Concluido' });
    
    // Auto-seleciona a próxima fase pendente se existir
    const currentIndex = selectedLead.onboardingChecklist?.findIndex(s => s.id === activeStepId) ?? -1;
    if (currentIndex >= 0 && selectedLead.onboardingChecklist && currentIndex < selectedLead.onboardingChecklist.length - 1) {
      const nextStep = selectedLead.onboardingChecklist[currentIndex + 1];
      setActiveStepId(nextStep.id);
    }
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-2 block";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
      />

      {/* HEADER OPERACIONAL */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 bg-[#0a192f] p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden border-b-8 border-[#c5a059]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#c5a059]/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-black serif-authority mb-2 tracking-tight italic">Onboarding do Cliente</h1>
          <p className="text-slate-400 font-medium">Cronograma de Implantação e Cumprimento de SLA</p>
        </div>
        <div className="flex gap-10 relative z-10">
          <div className="text-center">
            <p className="text-4xl font-black serif-authority text-[#c5a059]">{activeContracts.length}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contratos Ativos</p>
          </div>
          <div className="w-px h-12 bg-white/10 self-center"></div>
          <div className="text-center">
            <p className="text-4xl font-black serif-authority text-emerald-400">
              {activeContracts.filter(l => calculateProgress(l) === 100).length}
            </p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Finalizados</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10 min-h-[600px]">
        {/* FILA DE CONTRATOS */}
        <div className="lg:col-span-1 space-y-6 overflow-y-auto custom-scrollbar pr-2 max-h-[700px]">
          <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
             <span className="w-2 h-2 rounded-full bg-[#c5a059]"></span>
             Projetos em Curso
          </h3>
          <div className="space-y-4">
             {activeContracts.map(contract => (
               <div 
                 key={contract.id} 
                 onClick={() => { setActiveLeadId(contract.id); setActiveStepId(null); }}
                 className={`p-6 rounded-[2.5rem] border-2 transition-all cursor-pointer group relative overflow-hidden ${activeLeadId === contract.id ? 'bg-[#0a192f] border-[#c5a059] text-white shadow-xl' : 'bg-white border-slate-100 hover:border-slate-200 text-slate-600'}`}
               >
                 <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${activeLeadId === contract.id ? 'text-[#c5a059]' : 'text-slate-400'}`}>
                   {contract.serviceType}
                 </p>
                 <h4 className="font-bold text-sm serif-authority truncate">{contract.tradeName}</h4>
                 <div className="mt-4 flex justify-between items-center">
                    <div className="w-24 h-1.5 bg-slate-100/20 rounded-full overflow-hidden border border-white/5">
                       <div className={`h-full ${activeLeadId === contract.id ? 'bg-[#c5a059]' : 'bg-indigo-500'}`} style={{ width: `${calculateProgress(contract)}%` }}></div>
                    </div>
                    <span className="text-[9px] font-black uppercase">{calculateProgress(contract)}%</span>
                 </div>
               </div>
             ))}
             {activeContracts.length === 0 && (
               <div className="p-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-center">
                 <p className="text-xs text-slate-400 italic">Nenhum contrato ganho para implantação.</p>
               </div>
             )}
          </div>
        </div>

        {/* WORKFLOW (CENTRO) */}
        <div className="lg:col-span-2 space-y-8 overflow-y-auto custom-scrollbar px-2 max-h-[700px]">
           {selectedLead ? (
             <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl relative animate-in slide-in-from-bottom-4">
                <div className="flex justify-between items-center mb-12">
                   <div>
                     <h3 className="text-2xl font-black text-[#0a192f] serif-authority tracking-tight">Timeline de Entrega</h3>
                     <p className="text-xs text-slate-400 font-medium mt-1">SLA Ativo: {selectedLead.serviceType}</p>
                   </div>
                   <div className="text-right">
                      <span className="px-6 py-2 bg-slate-50 rounded-full border border-slate-100 text-[10px] font-black text-[#c5a059] uppercase tracking-widest">Início: {selectedLead.contractStart || 'N/A'}</span>
                   </div>
                </div>

                <div className="space-y-10 relative">
                    <div className="absolute left-[31px] top-4 bottom-4 w-1 bg-slate-50"></div>
                    {selectedLead.onboardingChecklist && selectedLead.onboardingChecklist.length > 0 ? (
                      selectedLead.onboardingChecklist.map((step, idx) => {
                        const isActive = activeStepId === step.id;
                        return (
                          <div 
                            key={step.id} 
                            onClick={() => setActiveStepId(step.id)}
                            className="relative pl-20 group cursor-pointer"
                          >
                             <div 
                               className={`absolute left-0 top-0 w-16 h-16 rounded-2xl border-4 flex items-center justify-center font-black text-xl transition-all z-10 shadow-lg ${
                                 step.status === 'Concluido' ? 'bg-emerald-500 border-emerald-100 text-white' : 
                                 isActive ? 'bg-[#0a192f] border-indigo-100 text-white scale-110' : 'bg-white border-slate-50 text-slate-200'
                               }`}
                             >
                               {step.status === 'Concluido' ? '✓' : idx + 1}
                             </div>

                             <div className={`p-8 rounded-[2.5rem] border-2 transition-all ${
                               isActive ? 'bg-white border-[#c5a059] shadow-2xl' : 'bg-white border-slate-50 opacity-60 hover:opacity-100'
                             }`}>
                                <div className="flex justify-between items-start mb-2">
                                   <div>
                                      <h4 className="text-lg font-bold serif-authority text-[#0a192f]">{step.title}</h4>
                                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{step.description}</p>
                                   </div>
                                </div>
                             </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-24 text-center flex flex-col items-center animate-in zoom-in-95">
                         <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-5xl mb-6">📋</div>
                         <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Jornada não iniciada</h3>
                         <p className="text-sm text-slate-400 max-w-xs mt-2 mb-8">Este contrato ainda não possui as etapas técnicas mapeadas para entrega.</p>
                         
                         {templates.some(t => t.serviceType === selectedLead.serviceType) ? (
                           <button 
                             onClick={handleApplyTemplate}
                             className="px-10 py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl border-b-4 border-[#c5a059] hover:scale-105 transition-all"
                           >
                             🚀 Gerar Cronograma de Entrega
                           </button>
                         ) : (
                           <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest">
                             ⚠️ Crie um template para "{selectedLead.serviceType}" nas configurações.
                           </div>
                         )}
                      </div>
                    )}
                </div>
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-40">
                <div className="text-8xl mb-8">🛠️</div>
                <h3 className="text-3xl font-black serif-authority">Aguardando Projeto</h3>
                <p className="text-sm font-bold uppercase mt-2">Nenhum contrato selecionado para exibição.</p>
             </div>
           )}
        </div>

        {/* SIDEBAR DETALHES (DIREITA) */}
        <div className="lg:col-span-1 bg-white rounded-[3.5rem] border border-slate-100 shadow-2xl flex flex-col overflow-hidden max-h-[700px]">
           {currentStep ? (
             <div className="flex flex-col h-full">
               <div className="p-8 bg-slate-50/80 border-b border-slate-100">
                  <h4 className="text-[11px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-4">Gestão da Fase</h4>
                  <div className="space-y-4">
                     <div>
                        <label className={labelClass}>Status da Etapa</label>
                        <select 
                          value={currentStep.status}
                          onChange={(e) => handleUpdateStep({ status: e.target.value as any })}
                          className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:border-[#c5a059]"
                        >
                           <option value="Pendente">Pendente</option>
                           <option value="Em Andamento">Em Andamento</option>
                           <option value="Bloqueado">Bloqueado ⚠️</option>
                           <option value="Concluido">Concluído ✓</option>
                        </select>
                     </div>
                     
                     <button 
                       onClick={markAsConcluded}
                       className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg border-b-4 border-emerald-800 active:translate-y-1 transition-all flex items-center justify-center gap-2"
                     >
                        <span>✓</span> Concluir Etapa
                     </button>

                     <button onClick={triggerFileUpload} className="w-full py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg border-b-4 border-[#c5a059] active:translate-y-1 transition-all flex items-center justify-center gap-2">
                        <span>📎</span> Anexar Prova
                     </button>
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
                  {currentStep.attachments.length > 0 && (
                    <section>
                       <h5 className="text-[10px] font-black text-[#c5a059] uppercase mb-4 tracking-widest">Anexos Técnicos</h5>
                       <div className="space-y-2">
                          {currentStep.attachments.map(att => (
                            <div key={att.id} className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between group">
                               <div className="flex items-center gap-2 overflow-hidden">
                                  <span className="text-lg">📄</span>
                                  <p className="text-[10px] font-bold text-indigo-900 truncate" title={att.name}>{att.name}</p>
                               </div>
                               <a href={att.url} download={att.name} className="p-1 hover:bg-white rounded transition text-indigo-400">
                                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                               </a>
                            </div>
                          ))}
                       </div>
                    </section>
                  )}

                  <section>
                    <h5 className="text-[10px] font-black text-slate-400 uppercase mb-6 tracking-widest">Comentários e Histórico</h5>
                    <div className="space-y-4">
                       {currentStep.comments.map(c => (
                         <div key={c.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 italic text-xs text-slate-600">
                           <span className="font-bold text-indigo-600 block not-italic mb-1">{c.authorName}</span>
                           "{c.text}"
                         </div>
                       ))}
                       {currentStep.comments.length === 0 && (
                         <p className="text-center text-[10px] text-slate-300 italic py-4">Sem comentários registrados.</p>
                       )}
                    </div>
                  </section>
               </div>

               <div className="p-8 border-t border-slate-50 bg-slate-50/30">
                  <textarea 
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Nota de andamento..." 
                    className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 text-xs font-medium outline-none focus:border-[#c5a059] h-20 resize-none"
                  />
                  <button onClick={addComment} className="w-full mt-3 py-3 bg-[#0a192f] text-white rounded-xl text-[10px] font-black uppercase shadow-lg">Postar Update</button>
               </div>
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-20">
                <p className="text-[10px] font-black uppercase">Selecione uma fase à esquerda.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default OperationalDashboard;
