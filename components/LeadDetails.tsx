
import React, { useState, useMemo, useEffect } from 'react';
import { Lead, SystemConfig, User, Interaction, InteractionType, LeadStatus, AgendaEvent, LeadPartner, CompanySize, SalesScript } from '../types';
import Timeline360 from './Timeline360';
import Teleprompter from './Teleprompter';
import ObjectionAssistant from './ObjectionAssistant';

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
  scripts?: SalesScript[];
}

const LeadDetails: React.FC<LeadDetailsProps> = ({ 
  lead, config, agendaEvents, onClose, onUpdateLead, onDeleteLead, onAddInteraction, onAddAgendaEvent, onDeleteAgendaEvent, currentUser, allUsers, scripts = [] 
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'timeline' | 'call' | 'agenda' | 'marketing'>('perfil');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Lead>(lead);
  const [activeScript, setActiveScript] = useState<SalesScript | undefined>(undefined);
  
  // Novo estado para nota rápida na timeline
  const [quickNote, setQuickNote] = useState('');

  // Estado para o Novo Agendamento (Modelo Unificado)
  const [quickEvent, setQuickEvent] = useState({
    typeId: config.taskTypes[0].id,
    date: new Date().toISOString().slice(0, 16),
    notes: ''
  });

  useEffect(() => {
    setEditForm(lead);
  }, [lead]);

  const handleSaveDossie = () => {
    onUpdateLead(editForm);
    setIsEditing(false);
    onAddInteraction(lead.id, {
      type: 'EDIT',
      title: '📝 Dossiê Atualizado',
      content: 'As informações estratégicas e cadastrais do lead foram revisadas e atualizadas.',
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

  const handleAddQuickEvent = () => {
    const type = config.taskTypes.find(t => t.id === quickEvent.typeId);
    const newEvt: AgendaEvent = {
      id: `evt-${Date.now()}`,
      title: `${type?.name}: ${lead.tradeName}`,
      start: quickEvent.date,
      end: new Date(new Date(quickEvent.date).getTime() + 30 * 60000).toISOString(),
      assignedToId: currentUser.id,
      leadId: lead.id,
      typeId: quickEvent.typeId,
      type: type?.name || 'Geral',
      description: quickEvent.notes,
      status: 'Agendado',
      participants: [],
      department: currentUser.department,
      creatorId: currentUser.id
    };
    onAddAgendaEvent(newEvt);
    setQuickEvent({ ...quickEvent, notes: '' });
  };

  const leadEvents = useMemo(() => 
    agendaEvents.filter(e => e.leadId === lead.id).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [agendaEvents, lead.id]
  );

  const handleTogglePartner = (index: number, field: keyof LeadPartner, value: string) => {
    const nextPartners = [...(editForm.detailedPartners || [])];
    nextPartners[index] = { ...nextPartners[index], [field]: value };
    setEditForm({ ...editForm, detailedPartners: nextPartners });
  };

  const sectionHeader = "text-[11px] font-black text-[#0a192f] uppercase tracking-[0.3em] mb-8 border-b-2 border-slate-50 pb-2 flex justify-between items-center";
  const displayLabel = "text-[9px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-1 block";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 font-bold text-[#0a192f] outline-none focus:border-[#c5a059] transition-all text-sm";

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

  return (
    <div className="fixed inset-0 z-[600] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-[95vw] lg:max-w-[1400px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden">
        
        {/* HEADER */}
        <div className="p-8 bg-[#0a192f] text-white shrink-0 border-b-4 border-[#c5a059] relative">
          <div className="flex justify-between items-start mb-8 relative z-10">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-[#c5a059] rounded-2xl flex items-center justify-center font-black text-2xl shadow-2xl text-white">
                {lead.tradeName?.charAt(0) || 'L'}
              </div>
              <div>
                <h2 className="serif-authority text-3xl font-black tracking-tight mb-1">{lead.tradeName || lead.company}</h2>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">{lead.cnpj}</span>
                  <span className="bg-white/10 px-3 py-0.5 rounded text-[9px] font-black uppercase text-[#c5a059] border border-white/5">{lead.status}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              {isEditing ? (
                  <button onClick={handleSaveDossie} className="px-8 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border-b-4 border-emerald-800 transition-all active:translate-y-1">💾 Salvar Alterações</button>
              ) : (
                  <button onClick={() => setIsEditing(true)} className="px-8 py-3 bg-white/10 text-white border border-white/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">✏️ Editar Dossiê</button>
              )}
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white text-2xl">✕</button>
            </div>
          </div>
          
          <div className="flex gap-8">
            {(['perfil', 'timeline', 'call', 'agenda', 'marketing'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)} 
                className={`pb-3 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 transition-all ${activeTab === tab ? 'border-[#c5a059] text-[#c5a059]' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
              >
                {tab === 'perfil' ? 'Dossiê Completo' : tab === 'timeline' ? 'Interações' : tab === 'call' ? 'Teleprompter' : tab === 'agenda' ? 'Agenda & Tarefas' : 'Automação'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50/30 custom-scrollbar">
          {activeTab === 'perfil' && (
            <div className="p-8 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* COLUNA PRINCIPAL (8/12) */}
                <div className="lg:col-span-8 space-y-8">
                  
                  {/* IDENTIFICAÇÃO E LOCALIZAÇÃO */}
                  <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <h4 className={sectionHeader}>Identificação & Localização</h4>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
                      <div className="md:col-span-4">
                        <label className={displayLabel}>Razão Social Completa</label>
                        {isEditing ? <input className={inputClass} value={editForm.legalName} onChange={e => setEditForm({...editForm, legalName: e.target.value})} /> : <p className="text-sm font-bold text-[#0a192f]">{lead.legalName || 'S/I'}</p>}
                      </div>
                      <div className="md:col-span-2">
                        <label className={displayLabel}>CNPJ</label>
                        <p className="text-sm font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg">{lead.cnpj}</p>
                      </div>
                      <div className="md:col-span-3">
                        <label className={displayLabel}>Nome Fantasia</label>
                        {isEditing ? <input className={inputClass} value={editForm.tradeName} onChange={e => setEditForm({...editForm, tradeName: e.target.value})} /> : <p className="text-sm font-bold text-[#0a192f]">{lead.tradeName || 'S/I'}</p>}
                      </div>
                      <div className="md:col-span-3">
                        <label className={displayLabel}>Segmento</label>
                        {isEditing ? <input className={inputClass} value={editForm.segment} onChange={e => setEditForm({...editForm, segment: e.target.value})} /> : <p className="text-sm font-bold text-[#0a192f]">{lead.segment || 'S/I'}</p>}
                      </div>
                      <div className="md:col-span-4">
                        <label className={displayLabel}>Endereço Completo</label>
                        {isEditing ? <input className={inputClass} value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} /> : <p className="text-xs font-bold text-slate-500">{editForm.address || lead.location || 'Não informado'}</p>}
                      </div>
                      <div className="md:col-span-2">
                        <label className={displayLabel}>Website / LinkedIn</label>
                        {isEditing ? <input className={inputClass} value={editForm.website} onChange={e => setEditForm({...editForm, website: e.target.value})} /> : <p className="text-sm font-bold text-indigo-600 truncate">{lead.website || 'N/A'}</p>}
                      </div>
                    </div>
                  </section>

                  {/* FINANCEIRO E FISCAL */}
                  <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <h4 className={sectionHeader}>Diagnóstico Fiscal & Financeiro</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div>
                          <label className={displayLabel}>Regime Tributário</label>
                          {isEditing ? (
                            <select className={inputClass} value={editForm.taxRegime} onChange={e => setEditForm({...editForm, taxRegime: e.target.value})}>
                               {config.taxRegimes.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                          ) : <p className="text-sm font-bold text-[#0a192f]">{lead.taxRegime}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Porte</label>
                          {isEditing ? (
                            <select className={inputClass} value={editForm.size} onChange={e => setEditForm({...editForm, size: e.target.value as CompanySize})}>
                               {config.companySizes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : <p className="text-sm font-bold text-[#0a192f]">{lead.size}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Status Fiscal</label>
                          {isEditing ? (
                            <select className={inputClass} value={editForm.debtStatus} onChange={e => setEditForm({...editForm, debtStatus: e.target.value})}>
                               <option value="Regular">Regular</option>
                               <option value="Dívida Ativa">Com Dívida Ativa</option>
                            </select>
                          ) : <p className={`text-sm font-black ${lead.debtStatus === 'Regular' ? 'text-emerald-500' : 'text-rose-500'}`}>{lead.debtStatus}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Faturamento Anual (LTM)</label>
                          {isEditing ? <input className={inputClass} value={editForm.annualRevenue} onChange={e => setEditForm({...editForm, annualRevenue: e.target.value})} /> : <p className="text-sm font-black text-indigo-600">{lead.annualRevenue || 'S/I'}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Folha de Pagamento</label>
                          {isEditing ? <input className={inputClass} value={editForm.payrollValue} onChange={e => setEditForm({...editForm, payrollValue: e.target.value})} /> : <p className="text-sm font-bold text-slate-700">{lead.payrollValue || 'S/I'}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Faturamento Mensal</label>
                          {isEditing ? <input className={inputClass} value={editForm.monthlyRevenue} onChange={e => setEditForm({...editForm, monthlyRevenue: e.target.value})} /> : <p className="text-sm font-bold text-slate-700">{lead.monthlyRevenue || 'S/I'}</p>}
                       </div>
                    </div>
                  </section>

                  {/* QUADRO SOCIETÁRIO (QSA) */}
                  <section className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-inner">
                    <h4 className={sectionHeader}>Quadro Societário (QSA)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       {(editForm.detailedPartners || []).map((p, idx) => (
                         <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center gap-4 group">
                            <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-xs shadow-inner">👤</div>
                            <div className="flex-1">
                               {isEditing ? (
                                 <input className="w-full bg-transparent border-none p-0 text-xs font-black focus:ring-0" value={p.name} onChange={e => handleTogglePartner(idx, 'name', e.target.value)} />
                               ) : <p className="text-xs font-black text-[#0a192f]">{p.name}</p>}
                               <div className="flex justify-between items-center mt-1">
                                  {isEditing ? (
                                    <input className="w-20 bg-transparent border-none p-0 text-[8px] font-mono focus:ring-0" value={p.cpf} onChange={e => handleTogglePartner(idx, 'cpf', e.target.value)} />
                                  ) : <span className="text-[9px] text-slate-400 font-mono">{p.cpf || 'CPF NÃO INFO'}</span>}
                                  <span className="text-[9px] bg-indigo-50 text-indigo-500 font-black px-2 py-0.5 rounded">{p.sharePercentage}</span>
                               </div>
                            </div>
                         </div>
                       ))}
                       {(!editForm.detailedPartners || editForm.detailedPartners.length === 0) && (
                         <p className="col-span-2 text-center py-6 text-[10px] text-slate-300 font-black uppercase">Sócios não mapeados na qualificação</p>
                       )}
                    </div>
                  </section>
                </div>

                {/* COLUNA LATERAL (4/12) */}
                <div className="lg:col-span-4 space-y-8">
                   
                   {/* DECISOR PRINCIPAL */}
                   <section className="bg-[#0a192f] p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-2xl group-hover:scale-150 transition-all"></div>
                     <h4 className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-8">Interlocutor Estratégico</h4>
                     <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5">
                        {isEditing ? (
                          <div className="space-y-4">
                             <div>
                               <label className="text-[8px] font-black text-slate-400 uppercase">Nome Decisor</label>
                               <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-bold" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                             </div>
                             <div>
                               <label className="text-[8px] font-black text-slate-400 uppercase">Cargo</label>
                               <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-bold" value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})} />
                             </div>
                             <div>
                               <label className="text-[8px] font-black text-slate-400 uppercase">WhatsApp</label>
                               <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-bold" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                             </div>
                             <div>
                               <label className="text-[8px] font-black text-slate-400 uppercase">E-mail</label>
                               <input className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs font-bold" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                             </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xl font-black serif-authority mb-1">{lead.name}</p>
                            <p className="text-[9px] text-[#c5a059] font-black uppercase tracking-widest mb-8">{lead.role || 'Tomador de Decisão'}</p>
                            <div className="space-y-4 text-xs font-bold text-slate-300">
                               <p className="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5">📞 {lead.phone}</p>
                               <p className="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5">✉️ {lead.email || 'Não informado'}</p>
                            </div>
                          </>
                        )}
                     </div>
                  </section>

                  {/* DORES E EXPECTATIVAS */}
                  <section className="bg-amber-50 p-8 rounded-[2.5rem] border border-amber-100 shadow-inner">
                    <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                       <span className="w-1.5 h-4 bg-amber-400 rounded-full"></span>
                       Análise de Qualificação
                    </h4>
                    <div className="space-y-6">
                       <div>
                          <label className={displayLabel}>Dores Estratégicas</label>
                          {isEditing ? (
                            <textarea className={`${inputClass} h-24 resize-none`} value={editForm.strategicPains} onChange={e => setEditForm({...editForm, strategicPains: e.target.value})} />
                          ) : <p className="text-xs text-slate-600 leading-relaxed italic">{lead.strategicPains || 'Nenhuma dor mapeada.'}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Expectativas</label>
                          {isEditing ? (
                            <textarea className={`${inputClass} h-24 resize-none`} value={editForm.expectations} onChange={e => setEditForm({...editForm, expectations: e.target.value})} />
                          ) : <p className="text-xs text-slate-600 leading-relaxed italic">{lead.expectations || 'Nenhuma expectativa mapeada.'}</p>}
                       </div>
                       <div>
                          <label className={displayLabel}>Temperatura Comercial</label>
                          <div className="flex gap-2">
                             {[1,2,3,4,5].map(v => (
                               <button 
                                 key={v} 
                                 type="button" 
                                 disabled={!isEditing}
                                 onClick={() => setEditForm({...editForm, closeProbability: v})}
                                 className={`text-lg transition-all ${editForm.closeProbability >= v ? getTempColor(editForm.closeProbability) : 'text-slate-200'}`}
                               >🔥</button>
                             ))}
                          </div>
                       </div>
                    </div>
                  </section>

                  {/* BLOCO DE NOTAS LIVRE */}
                  <section className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                    <h4 className={displayLabel}>Bloco de Notas Estratégicas</h4>
                    {isEditing ? (
                       <textarea className={`${inputClass} h-32 resize-none`} value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} placeholder="Anote tudo o que for relevante sobre o lead aqui..." />
                    ) : (
                       <p className="text-xs text-slate-500 whitespace-pre-wrap leading-relaxed">{lead.notes || 'Sem anotações no bloco de notas.'}</p>
                    )}
                  </section>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="p-8 h-full space-y-6 animate-in fade-in">
              {/* CAMPO DE NOTA RÁPIDA (Onde você anota as notas agora) */}
              <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl space-y-4">
                 <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest">Registrar Nova Nota de Acompanhamento</label>
                    <span className="text-[8px] font-bold text-slate-300 uppercase">Autor: {currentUser.name}</span>
                 </div>
                 <textarea 
                    value={quickNote}
                    onChange={e => setQuickNote(e.target.value)}
                    placeholder="Escreva aqui o que acabou de acontecer com este lead (ex: 'Liguei e pediu retorno amanhã', 'Nota sobre a proposta')..." 
                    className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 text-sm font-medium outline-none focus:border-[#c5a059] shadow-inner resize-none transition-all"
                 />
                 <div className="flex justify-end">
                    <button 
                       disabled={!quickNote.trim()}
                       onClick={handleAddQuickNote}
                       className="px-10 py-3 bg-[#0a192f] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all disabled:opacity-30 disabled:translate-y-0"
                    >
                       💾 Registrar Nota na Linha do Tempo
                    </button>
                 </div>
              </div>

              <div className="flex-1">
                <Timeline360 lead={lead} agendaEvents={agendaEvents} currentUser={currentUser} />
              </div>
            </div>
          )}

          {activeTab === 'agenda' && (
            <div className="p-8 space-y-8 animate-in fade-in">
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* MOTOR DE AGENDAMENTO MODELO UNIFICADO */}
                  <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl space-y-8">
                     <div>
                        <h3 className="text-2xl font-black text-[#0a192f] serif-authority">Agendar Nova Atividade</h3>
                        <p className="text-[10px] text-slate-400 font-black uppercase mt-1">Sincroniza com a Agenda Central do CRM</p>
                     </div>
                     <div className="space-y-5">
                        <div>
                           <label className={displayLabel}>Tipo de Atividade</label>
                           <select 
                            className={inputClass} 
                            value={quickEvent.typeId}
                            onChange={e => setQuickEvent({...quickEvent, typeId: e.target.value})}
                           >
                              {config.taskTypes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
                           </select>
                        </div>
                        <div>
                           <label className={displayLabel}>Data e Horário</label>
                           <input 
                            type="datetime-local" 
                            className={inputClass} 
                            value={quickEvent.date}
                            onChange={e => setQuickEvent({...quickEvent, date: e.target.value})}
                           />
                        </div>
                        <div>
                           <label className={displayLabel}>Pauta / Notas</label>
                           <textarea 
                            className={`${inputClass} h-24 resize-none`}
                            placeholder="Descreva o objetivo deste contato..."
                            value={quickEvent.notes}
                            onChange={e => setQuickEvent({...quickEvent, notes: e.target.value})}
                           />
                        </div>
                        <button 
                          onClick={handleAddQuickEvent}
                          className="w-full py-5 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                        >
                          Confirmar na Agenda
                        </button>
                     </div>
                  </div>

                  {/* LISTA DE COMPROMISSOS VINCULADOS */}
                  <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 shadow-inner overflow-hidden">
                     <h4 className={sectionHeader}>Próximos Passos</h4>
                     <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                        {leadEvents.map(evt => (
                           <div key={evt.id} className="p-5 bg-white rounded-2xl border border-slate-100 flex items-center gap-5 shadow-sm group">
                              <div className="w-12 h-12 bg-slate-50 rounded-xl flex flex-col items-center justify-center font-black">
                                 <span className="text-[7px] text-slate-400 uppercase">{new Date(evt.start).toLocaleString('pt-BR', { month: 'short' })}</span>
                                 <span className="text-lg text-[#0a192f]">{new Date(evt.start).getDate()}</span>
                              </div>
                              <div className="flex-1">
                                 <p className="text-[8px] font-black text-[#c5a059] uppercase mb-0.5">{evt.type}</p>
                                 <h5 className="text-xs font-bold text-[#0a192f] truncate">{evt.title}</h5>
                                 <p className="text-[9px] text-slate-400 mt-1">{new Date(evt.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              <button onClick={() => onDeleteAgendaEvent(evt.id)} className="p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                           </div>
                        ))}
                        {leadEvents.length === 0 && (
                          <div className="py-20 text-center opacity-30 italic flex flex-col items-center">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4">📅</div>
                            <p className="text-sm font-bold uppercase tracking-widest">Sem compromissos marcados</p>
                          </div>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'call' && (
            <div className="p-8 h-full flex gap-8">
               <div className="flex-1 min-w-[600px]">
                  <Teleprompter 
                    lead={lead} 
                    scripts={scripts} 
                    currentUser={currentUser} 
                    onLogUsage={(usage, parsedText) => {
                      onAddInteraction(lead.id, {
                        type: 'SCRIPT_USAGE',
                        title: `🎤 Call Realizada: ${usage.outcome}`,
                        content: parsedText.substring(0, 400) + '...',
                        author: currentUser.name,
                        authorId: currentUser.id
                      });
                      setActiveTab('timeline');
                    }}
                    onScriptSelect={setActiveScript}
                  />
               </div>
               <div className="w-[400px]">
                  <ObjectionAssistant 
                    lead={lead} 
                    activeScript={activeScript}
                    onUseResponse={(txt) => {}} 
                  />
               </div>
            </div>
          )}

          {activeTab === 'marketing' && (
            <div className="p-8 space-y-8 animate-in fade-in">
               <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                  <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                     <div>
                        <h3 className="text-3xl font-black text-[#0a192f] serif-authority">Automação de Marketing Individual</h3>
                        <p className="text-slate-400 font-medium">Controle de réguas de nutrição e engajamento automatizado.</p>
                     </div>
                     <div className="flex items-center gap-4">
                        <span className={`px-5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${lead.marketingAutomation?.status === 'RUNNING' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'}`}>
                           Status: {lead.marketingAutomation?.status || 'Inativo'}
                        </span>
                        <button 
                           onClick={() => onUpdateLead({ ...lead, marketingAutomation: { ...lead.marketingAutomation!, status: lead.marketingAutomation?.status === 'RUNNING' ? 'PAUSED' : 'RUNNING' } })}
                           className="px-6 py-2 bg-[#0a192f] text-white rounded-xl text-[9px] font-black uppercase shadow-lg border-b-2 border-[#c5a059]"
                        >
                           {lead.marketingAutomation?.status === 'RUNNING' ? '⏸ Pausar Régua' : '▶ Retomar Régua'}
                        </button>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                     <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <p className={displayLabel}>Engajamento Score</p>
                        <p className="text-4xl font-black text-[#0a192f] serif-authority">{lead.engagementScore || 0} <span className="text-xs text-slate-300">pts</span></p>
                     </div>
                     <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <p className={displayLabel}>Última Interação</p>
                        <p className="text-xs font-bold text-indigo-600 uppercase mt-2">
                           {lead.marketingAutomation?.history && lead.marketingAutomation.history.length > 0 
                             ? lead.marketingAutomation.history[lead.marketingAutomation.history.length-1].action.replace('_', ' ') 
                             : 'Nenhuma ação registrada'}
                        </p>
                     </div>
                     <div className="md:col-span-2 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <p className={displayLabel}>Próximo Disparo Programado</p>
                        <p className="text-xs font-bold text-slate-500 mt-2">Segunda Peça: Depoimento de Cliente do mesmo segmento (48h).</p>
                     </div>
                  </div>

                  <div className="mt-10 space-y-6">
                     <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                        Logs de Transmissão Recentes
                     </h4>
                     <div className="space-y-2">
                        {(lead.marketingAutomation?.history || []).slice(0, 8).reverse().map(log => (
                           <div key={log.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex justify-between items-center group hover:border-[#c5a059] transition-all shadow-sm">
                              <div className="flex items-center gap-4">
                                 <span className="text-lg">📧</span>
                                 <div>
                                    <p className="text-[11px] font-bold text-[#0a192f]">{log.action.replace('_', ' ')}</p>
                                    <p className="text-[9px] text-slate-400">{log.details}</p>
                                 </div>
                              </div>
                              <span className="text-[9px] font-black text-slate-200 uppercase">{new Date(log.timestamp).toLocaleDateString()}</span>
                           </div>
                        ))}
                        {(!lead.marketingAutomation?.history || lead.marketingAutomation.history.length === 0) && (
                           <p className="text-center py-10 text-[10px] text-slate-300 italic uppercase">Sem histórico de automação.</p>
                        )}
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
