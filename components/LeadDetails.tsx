
import React, { useState, useMemo, useEffect } from 'react';
import { Lead, SystemConfig, User, Interaction, InteractionType, LeadStatus, AgendaEvent, OnboardingItem, UserRole, LeadPartner, CompanySize } from '../types';
import Timeline360 from './Timeline360';

interface LeadDetailsProps {
  lead: Lead;
  config: SystemConfig;
  agendaEvents: AgendaEvent[];
  onClose: () => void;
  onUpdateLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
  onAddInteraction: (leadId: string, inter: Omit<Interaction, 'id' | 'date'>) => void;
  onAddAgendaEvent: (event: AgendaEvent) => void;
  onDeleteAgendaEvent: (id: string) => void;
  currentUser: User;
  allUsers: User[];
  canEdit?: boolean;
}

const LeadDetails: React.FC<LeadDetailsProps> = ({ 
  lead, config, agendaEvents, onClose, onUpdateLead, onDeleteLead, onAddInteraction, onAddAgendaEvent, onDeleteAgendaEvent, currentUser, allUsers, canEdit 
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'timeline' | 'agenda' | 'marketing' | 'contrato'>('perfil');
  const [isEditing, setIsEditing] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [quickNote, setQuickNote] = useState('');

  const [editForm, setEditForm] = useState<Lead>(lead);

  useEffect(() => {
    setEditForm(lead);
  }, [lead]);

  const handleSaveDossie = () => {
    onUpdateLead(editForm);
    setIsEditing(false);
    onAddInteraction(lead.id, {
      type: 'EDIT',
      title: '📝 Dossiê SDR Atualizado',
      content: 'As informações cadastrais e estratégicas foram sincronizadas e revisadas.',
      author: currentUser.name,
      authorId: currentUser.id
    });
  };

  const handleAddQuickNote = () => {
    if (!quickNote.trim()) return;
    onAddInteraction(lead.id, {
      type: 'NOTE',
      title: '📌 Nota de Acompanhamento',
      content: quickNote,
      author: currentUser.name,
      authorId: currentUser.id
    });
    setQuickNote('');
  };

  const getTempColor = (val: number) => {
    switch (val) {
      case 1: return 'text-slate-300';
      case 2: return 'text-cyan-400';
      case 3: return 'text-amber-400';
      case 4: return 'text-orange-500';
      case 5: return 'text-rose-600';
      default: return 'text-slate-300';
    }
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] block mb-2";
  const displayLabel = "text-[9px] font-bold text-slate-300 uppercase mb-1 block";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-[#0a192f] outline-none focus:border-[#c5a059] transition-all text-sm";

  return (
    <div className="fixed inset-0 z-[600] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-[90vw] lg:max-w-7xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden">
        
        {/* HEADER DO LEAD */}
        <div className="p-10 bg-[#0a192f] text-white shrink-0 border-b-4 border-[#c5a059] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#c5a059]/5 rounded-full blur-[100px] -mr-64 -mt-64"></div>
          
          <div className="flex justify-between items-start mb-10 relative z-10">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-[#c5a059] rounded-[2rem] flex items-center justify-center font-black text-4xl serif-authority shadow-2xl text-white border-4 border-white/5">CI</div>
              <div>
                <h2 className="serif-authority text-4xl font-black tracking-tight leading-none mb-3">{lead.tradeName || lead.company}</h2>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-mono tracking-widest uppercase">{lead.cnpj}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                  <span className={`text-[11px] font-black uppercase text-[#c5a059] tracking-widest border border-[#c5a059]/30 px-3 py-1 rounded-lg`}>{lead.status}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(v => (
                      <span key={v} className={`text-sm ${lead.closeProbability >= v ? getTempColor(lead.closeProbability) : 'text-white/10'}`}>🔥</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {activeTab === 'perfil' && (
                isEditing ? (
                  <button onClick={handleSaveDossie} className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border-b-4 border-emerald-800 transition-all active:translate-y-1">💾 Salvar Alterações</button>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="px-8 py-3 bg-white/10 text-white border border-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">✏️ Editar Dossiê</button>
                )
              )}
              <button onClick={onClose} className="p-4 hover:bg-white/10 rounded-full transition text-slate-400 hover:text-white text-3xl">✕</button>
            </div>
          </div>
          
          <div className="flex gap-12 relative z-10">
            {(['perfil', 'timeline', 'marketing'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => { setActiveTab(tab); setIsEditing(false); }} 
                className={`pb-4 text-[11px] font-black uppercase tracking-[0.3em] border-b-4 transition-all ${activeTab === tab ? 'border-[#c5a059] text-[#c5a059]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                {tab === 'perfil' ? 'Dossiê SDR' : tab === 'timeline' ? 'Interações 360º' : 'Jornada Marketing'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
          {activeTab === 'perfil' && (
            <div className="p-10 space-y-10 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-10">
                  <section className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
                     <h4 className={labelClass}>Identificação Corporativa</h4>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-10">
                        <div className="col-span-2">
                          <label className={displayLabel}>Razão Social Completa</label>
                          {isEditing ? (
                            <input className={inputClass} value={editForm.legalName} onChange={e => setEditForm({...editForm, legalName: e.target.value})} />
                          ) : <p className="text-sm font-black text-[#0a192f]">{lead.legalName}</p>}
                        </div>
                        <div className="col-span-1">
                          <label className={displayLabel}>Segmento</label>
                          {isEditing ? (
                            <input className={inputClass} value={editForm.segment} onChange={e => setEditForm({...editForm, segment: e.target.value})} />
                          ) : <p className="text-sm font-black text-[#0a192f]">{lead.segment}</p>}
                        </div>
                        <div className="col-span-1">
                          <label className={displayLabel}>Telefone Sede</label>
                          {isEditing ? (
                            <input className={inputClass} value={editForm.companyPhone} onChange={e => setEditForm({...editForm, companyPhone: e.target.value})} />
                          ) : <p className="text-sm font-black text-[#0a192f]">{lead.companyPhone || 'Não inf.'}</p>}
                        </div>
                        <div className="col-span-2">
                          <label className={displayLabel}>Website</label>
                          {isEditing ? (
                            <input className={inputClass} value={editForm.website} onChange={e => setEditForm({...editForm, website: e.target.value})} />
                          ) : <p className="text-sm font-black text-indigo-600 truncate">{lead.website || 'N/A'}</p>}
                        </div>
                        <div className="col-span-2">
                          <label className={displayLabel}>Endereço Completo</label>
                          {isEditing ? (
                            <input className={inputClass} value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} />
                          ) : <p className="text-sm font-black text-[#0a192f]">{lead.address || 'Não inf.'}</p>}
                        </div>
                     </div>
                  </section>

                  {/* QUICK NOTE NA TAB PERFIL TAMBÉM */}
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
                    <h4 className={labelClass}>Lançar Nota Rápida</h4>
                    <div className="flex gap-4 mt-6">
                      <input 
                        value={quickNote}
                        onChange={e => setQuickNote(e.target.value)}
                        placeholder="Ex: Acabei de falar com o decisor via Whats..."
                        className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-[#c5a059]"
                      />
                      <button 
                        onClick={handleAddQuickNote}
                        className="bg-[#0a192f] text-[#c5a059] px-8 rounded-2xl font-black uppercase text-[10px] tracking-widest border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                      >
                        Salvar Nota
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-10">
                   <section className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-2xl group-hover:scale-150 transition-all"></div>
                     <h4 className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-10">Interlocutor Principal</h4>
                     <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/5">
                        <p className="text-2xl font-black serif-authority mb-1">{lead.name}</p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-10">{lead.role || 'Tomador de Decisão'}</p>
                        <div className="space-y-6 text-xs font-bold text-slate-300">
                           <p className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-[#c5a059]/50 transition-colors">
                              <span className="text-xl">📞</span> {lead.phone}
                           </p>
                           <p className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 hover:border-[#c5a059]/50 transition-colors">
                              <span className="text-xl">✉️</span> {lead.email}
                           </p>
                        </div>
                     </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="p-10 h-full animate-in fade-in">
              <Timeline360 lead={lead} agendaEvents={agendaEvents} currentUser={currentUser} />
            </div>
          )}

          {activeTab === 'marketing' && (
            <div className="p-10 space-y-10 animate-in fade-in">
               <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
                  <h3 className="text-2xl font-bold text-[#0a192f] serif-authority mb-10">Fluxo IA de Nutrição</h3>
                  {!lead.marketingAutomation ? (
                    <div className="py-20 text-center opacity-30 flex flex-col items-center">
                       <div className="text-7xl mb-6">🛰️</div>
                       <p className="text-xl font-bold uppercase tracking-widest">Aguardando Início do Fluxo</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                       <div className="space-y-8">
                          <div>
                             <label className={labelClass}>Status do Lead na Régua</label>
                             <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${lead.marketingAutomation.status === 'RUNNING' ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                                <span className="font-bold text-[#0a192f] text-sm uppercase tracking-widest">{lead.marketingAutomation.status}</span>
                             </div>
                          </div>
                          <div>
                             <label className={labelClass}>Copy IA Atualizada</label>
                             <div className="p-8 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] text-sm italic text-slate-600 leading-relaxed font-medium whitespace-pre-wrap shadow-inner">
                                {lead.marketingAutomation.aiContent}
                             </div>
                          </div>
                       </div>
                       <div className="space-y-6">
                          <label className={labelClass}>Últimos Sinais de Tracking</label>
                          <div className="space-y-4">
                             {lead.marketingAutomation.history.slice(-5).reverse().map(h => (
                               <div key={h.id} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm flex justify-between items-center">
                                  <div>
                                     <span className="text-[10px] font-black uppercase text-indigo-600 tracking-tighter block">{h.action}</span>
                                     <p className="text-[11px] text-slate-500 font-medium">{h.details}</p>
                                  </div>
                                  <span className="text-[8px] text-slate-300 font-bold">{new Date(h.timestamp).toLocaleTimeString()}</span>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                  )}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
