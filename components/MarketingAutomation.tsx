
import React, { useState, useMemo } from 'react';
import { 
  Lead, User, MarketingAutomation, MasterTemplate, 
  AutomationFlow, InteractionType, LeadStatus, SystemConfig 
} from '../types';
import { personalizeMasterTemplateIA } from '../services/geminiService';
import { DEFAULT_MASTER_TEMPLATES } from '../constants';
import AutomationManager from './AutomationManager';

interface MarketingAutomationProps {
  leads: Lead[];
  onUpdateLead: (lead: Lead) => void;
  currentUser: User;
  config: SystemConfig;
  allUsers: User[];
}

const SCORING_RULES = {
  OPEN: 1,
  CLICK: 3,
  REPLY: 6,
  MEETING: 10
};

const MarketingAutomationDashboard: React.FC<MarketingAutomationProps> = ({ leads, onUpdateLead, currentUser, config, allUsers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'TEMPLATES' | 'FLOWS' | 'LGPD'>('MONITOR');
  
  // States for Templates
  const [masterTemplates, setMasterTemplates] = useState<MasterTemplate[]>(DEFAULT_MASTER_TEMPLATES);
  const [editingTemplate, setEditingTemplate] = useState<Partial<MasterTemplate> | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // States for Flows
  const [flows, setFlows] = useState<AutomationFlow[]>([]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      // 1. Filtro de Busca por Nome
      const matchesSearch = l.tradeName.toLowerCase().includes(searchTerm.toLowerCase());
      
      // 2. Filtro de LGPD (Se estiver na aba LGPD mostra os Opt-out, senão esconde)
      const matchesLgpd = activeTab === 'LGPD' ? l.marketingAutomation?.status === 'OPT_OUT' : l.marketingAutomation?.status !== 'OPT_OUT';
      
      // 3. REGRA SOLICITADA: Apenas leads na fase inicial após a qualificação (ph-qualificado)
      // Ignora leads que ainda estão na fila (inQueue) ou em fases avançadas do funil
      const isInitialPhase = l.phaseId === 'ph-qualificado' && !l.inQueue;

      return matchesSearch && matchesLgpd && isInitialPhase;
    });
  }, [leads, searchTerm, activeTab]);

  const stats = useMemo(() => {
    // Estatísticas baseadas apenas nos leads da fase inicial para manter contexto
    const targetLeads = leads.filter(l => l.phaseId === 'ph-qualificado' && !l.inQueue);
    const active = targetLeads.filter(l => l.marketingAutomation?.status === 'RUNNING').length;
    const opened = targetLeads.filter(l => l.marketingAutomation?.status === 'OPENED').length;
    const clicked = targetLeads.filter(l => l.marketingAutomation?.status === 'CLICKED').length;
    return { active, opened, clicked };
  }, [leads]);

  const handleOpenNewTemplate = () => {
    setEditingTemplate({
      id: `tpl-${Date.now()}`,
      name: '',
      category: 'RECUPERACAO',
      subject: '',
      content: '',
      lastUpdated: new Date().toISOString()
    });
    setIsTemplateModalOpen(true);
  };

  const handleSaveMasterTemplate = () => {
    if (!editingTemplate?.name || !editingTemplate?.content) {
      alert("Preencha o nome e o conteúdo do template.");
      return;
    }

    const tpl = editingTemplate as MasterTemplate;
    setMasterTemplates(prev => {
      const exists = prev.find(t => t.id === tpl.id);
      if (exists) return prev.map(t => t.id === tpl.id ? tpl : t);
      return [...prev, tpl];
    });
    
    setIsTemplateModalOpen(false);
    setEditingTemplate(null);
  };

  const handleDeleteMasterTemplate = (id: string) => {
    if (confirm("Deseja excluir este template da biblioteca permanentemente?")) {
      setMasterTemplates(prev => prev.filter(t => t.id !== id));
    }
  };

  const insertVariable = (variable: string) => {
    if (!editingTemplate) return;
    const currentContent = editingTemplate.content || '';
    setEditingTemplate({ ...editingTemplate, content: currentContent + ` {{${variable}}}` });
  };

  const handleSimulateAction = (lead: Lead, action: 'OPEN' | 'CLICK' | 'OPT_OUT') => {
    const points = action === 'OPEN' ? SCORING_RULES.OPEN : action === 'CLICK' ? SCORING_RULES.CLICK : 0;
    const currentScore = lead.engagementScore || 0;
    const newScore = currentScore + points;

    const historyEntry = {
      id: `hist-${Date.now()}`,
      step: lead.marketingAutomation?.currentStepId || 'INITIAL',
      action: action === 'OPEN' ? 'EMAIL_OPENED' : action === 'CLICK' ? 'LINK_CLICKED' : 'OPT_OUT' as any,
      timestamp: new Date().toISOString(),
      details: action === 'OPT_OUT' ? 'Lead solicitou descadastro.' : `Ação simulada: +${points} pontos.`
    };

    onUpdateLead({
      ...lead,
      engagementScore: newScore,
      marketingAutomation: {
        ...lead.marketingAutomation!,
        status: action === 'OPT_OUT' ? 'OPT_OUT' : (action === 'CLICK' ? 'CLICKED' : 'OPENED'),
        history: [...(lead.marketingAutomation?.history || []), historyEntry]
      }
    });
  };

  const getScoreCategory = (score: number = 0) => {
    if (score >= 25) return { label: 'MQL / ELITE', color: 'bg-rose-500', text: 'text-white' };
    if (score >= 15) return { label: 'QUENTE', color: 'bg-orange-400', text: 'text-white' };
    if (score >= 5) return { label: 'MORNO', color: 'bg-amber-100', text: 'text-amber-700' };
    return { label: 'FRIO', color: 'bg-slate-100', text: 'text-slate-400' };
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-2 block";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 bg-[#0a192f] p-12 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden border-b-8 border-[#c5a059]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#c5a059]/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-black serif-authority mb-2 tracking-tight">Ciatos Marketing Intelligence</h1>
          <p className="text-slate-400 font-medium">Foco em Leads Qualificados (Fase Inicial)</p>
        </div>
        
        <div className="grid grid-cols-3 gap-10 relative z-10">
           <div className="text-center">
              <p className="text-4xl font-black serif-authority text-[#c5a059]">{stats.active}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Em Régua</p>
           </div>
           <div className="text-center">
              <p className="text-4xl font-black serif-authority text-indigo-400">{stats.opened}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aberturas</p>
           </div>
           <div className="text-center">
              <p className="text-4xl font-black serif-authority text-emerald-400">{stats.clicked}</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cliques</p>
           </div>
        </div>
      </div>

      <div className="flex bg-slate-100 p-2 rounded-[2.5rem] border border-slate-200 shadow-inner">
         {(['MONITOR', 'TEMPLATES', 'FLOWS', 'LGPD'] as const).map(tab => (
           <button 
             key={tab}
             onClick={() => setActiveTab(tab)}
             className={`flex-1 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[#0a192f] text-white shadow-xl' : 'text-slate-500 hover:bg-white/50'}`}
           >
             {tab === 'MONITOR' ? '🛰️ Monitor de Leads' : tab === 'TEMPLATES' ? '📚 Biblioteca' : tab === 'FLOWS' ? '🛠️ Construtor' : '🛡️ LGPD'}
           </button>
         ))}
      </div>

      {activeTab === 'MONITOR' && (
        <div className="space-y-6">
           <div className="flex justify-between items-center px-4">
              <input 
                type="text" 
                placeholder="Buscar lead na fase inicial..." 
                className="bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 w-96 text-sm font-bold shadow-sm outline-none focus:border-[#c5a059]"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exibindo apenas leads na etapa: <strong className="text-[#0a192f]">Lead Qualificado</strong></span>
           </div>

           <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                 <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                       <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lead / Empresa</th>
                       <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Lead Scoring</th>
                       <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status na Régua</th>
                       <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Modo</th>
                       <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Simulação</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredLeads.map(lead => {
                      const score = lead.engagementScore || 0;
                      const category = getScoreCategory(score);
                      return (
                        <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                           <td className="px-10 py-6">
                              <p className="font-bold text-[#0a192f] text-sm serif-authority">{lead.tradeName}</p>
                              <p className="text-[9px] text-slate-400 uppercase font-black">{lead.segment} • {lead.taxRegime}</p>
                           </td>
                           <td className="px-6 py-6">
                              <div className="flex items-center gap-3">
                                 <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${category.color} ${category.text}`}>
                                    {category.label}
                                 </span>
                                 <span className="font-black text-[#0a192f]">{score} pts</span>
                              </div>
                           </td>
                           <td className="px-6 py-6">
                              <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase border ${
                                lead.marketingAutomation?.status === 'CLICKED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                lead.marketingAutomation?.status === 'OPENED' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' :
                                'bg-slate-50 text-slate-400'
                              }`}>
                                 {lead.marketingAutomation?.status || 'Aguardando'}
                              </span>
                           </td>
                           <td className="px-6 py-6">
                              <button 
                                onClick={() => onUpdateLead({ ...lead, marketingAutomation: { ...lead.marketingAutomation!, isAutomatic: !lead.marketingAutomation?.isAutomatic } })}
                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${lead.marketingAutomation?.isAutomatic ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}
                              >
                                 {lead.marketingAutomation?.isAutomatic ? 'Automático' : 'Manual'}
                              </button>
                           </td>
                           <td className="px-10 py-6 text-right">
                              <div className="flex justify-end gap-2">
                                 <button onClick={() => handleSimulateAction(lead, 'OPEN')} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-100 transition" title="Simular Abertura">👁️</button>
                                 <button onClick={() => handleSimulateAction(lead, 'CLICK')} className="p-2 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase hover:bg-emerald-100 transition" title="Simular Clique">🖱️</button>
                              </div>
                           </td>
                        </tr>
                      )
                    })}
                 </tbody>
              </table>
              {filteredLeads.length === 0 && (
                <div className="py-20 text-center text-slate-300 italic">
                  Nenhum lead aguardando régua inicial nesta fase.
                </div>
              )}
           </div>
        </div>
      )}

      {activeTab === 'TEMPLATES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
           {masterTemplates.map(tpl => (
             <div key={tpl.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-lg transition-all relative group">
                <button 
                  onClick={() => handleDeleteMasterTemplate(tpl.id)} 
                  className="absolute top-8 right-8 text-slate-300 hover:text-red-500 transition-colors z-20"
                  title="Excluir Template"
                >
                  ✕
                </button>
                <div className="absolute top-0 right-0 p-8 mr-6">
                   <span className="bg-amber-50 text-[#c5a059] px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest">{tpl.category}</span>
                </div>
                <div>
                   <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-4 pr-10">{tpl.name}</h3>
                   <p className="text-xs text-slate-400 font-bold mb-6 italic truncate">Assunto: {tpl.subject}</p>
                   <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 mb-8 max-h-40 overflow-hidden relative">
                      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-50 to-transparent"></div>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{tpl.content}</p>
                   </div>
                </div>
                <div className="space-y-4">
                   <div className="flex gap-2">
                      <select id={`lead-sel-${tpl.id}`} className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-[10px] font-bold">
                        <option value="">Personalizar para...</option>
                        {leads.map(l => <option key={l.id} value={l.id}>{l.tradeName}</option>)}
                      </select>
                      <button 
                        onClick={async () => {
                           const sel = document.getElementById(`lead-sel-${tpl.id}`) as HTMLSelectElement;
                           const lead = leads.find(l => l.id === sel.value);
                           if (!lead) return alert("Selecione um lead.");
                           setIsGenerating(true);
                           const res = await personalizeMasterTemplateIA(lead, tpl);
                           alert(`Peça Personalizada:\n\nAssunto: ${res.subject}\n\n${res.body}`);
                           setIsGenerating(false);
                        }}
                        className="bg-[#0a192f] text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase hover:scale-105 transition-all"
                      >
                         {isGenerating ? '...' : 'IA ✨'}
                      </button>
                   </div>
                   <button 
                    onClick={() => { setEditingTemplate(tpl); setIsTemplateModalOpen(true); }}
                    className="w-full py-4 bg-slate-100 text-[#0a192f] rounded-xl text-[10px] font-black uppercase hover:bg-indigo-600 hover:text-white transition-all"
                   >
                     Editar Modelo Mestre
                   </button>
                </div>
             </div>
           ))}
           <button 
            onClick={handleOpenNewTemplate}
            className="bg-slate-50 border-4 border-dashed border-slate-100 rounded-[3.5rem] flex flex-col items-center justify-center p-12 hover:border-[#c5a059] transition-all group"
           >
              <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-3xl shadow-xl group-hover:scale-110 transition-transform">➕</div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-6">Novo Template</p>
           </button>
        </div>
      )}

      {activeTab === 'FLOWS' && (
        <AutomationManager 
          flows={flows} 
          templates={masterTemplates as any} 
          users={allUsers} 
          config={config}
          onSaveFlow={(f) => setFlows([...flows, f])} 
          onDeleteFlow={(id) => setFlows(flows.filter(f => f.id !== id))} 
        />
      )}

      {activeTab === 'LGPD' && (
        <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm animate-in zoom-in-95">
           <h3 className="text-2xl font-black text-red-600 serif-authority mb-6">Lista de Opt-Out (Supressão)</h3>
           <p className="text-slate-500 mb-10">Leads que solicitaram o descadastro manual ou automático de comunicações de marketing.</p>
           
           <div className="space-y-4">
              {filteredLeads.length === 0 && <p className="text-center py-20 text-slate-300 italic">Nenhum registro de Opt-Out encontrado.</p>}
              {filteredLeads.map(lead => (
                 <div key={lead.id} className="p-8 bg-slate-50 rounded-[2.5rem] border border-red-100 flex justify-between items-center">
                    <div>
                       <h4 className="font-bold text-[#0a192f]">{lead.tradeName}</h4>
                       <p className="text-[10px] text-slate-400 font-black uppercase">Data de Bloqueio: {lead.marketingAutomation?.history.find(h => h.action === 'OPT_OUT')?.timestamp.slice(0,10) || 'Hoje'}</p>
                    </div>
                    <button 
                      onClick={() => onUpdateLead({ ...lead, marketingAutomation: { ...lead.marketingAutomation!, status: 'IDLE' } })}
                      className="px-8 py-3 bg-white border border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                    >
                       Reativar Consentimento
                    </button>
                 </div>
              ))}
           </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE TEMPLATE */}
      {isTemplateModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-[#0a192f]/90 backdrop-blur-md">
           <div className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl p-12 animate-in zoom-in-95 overflow-y-auto max-h-[90vh] custom-scrollbar">
              <div className="flex justify-between items-center mb-10">
                 <div>
                    <h2 className="text-3xl font-black text-[#0a192f] serif-authority">Configurar Template Mestre</h2>
                    <p className="text-slate-400 font-medium">Modelagem estratégica de comunicação direta.</p>
                 </div>
                 <button onClick={() => setIsTemplateModalOpen(false)} className="text-3xl text-slate-300">✕</button>
              </div>

              <div className="space-y-8">
                 <div className="grid grid-cols-2 gap-6">
                    <div>
                       <label className={labelClass}>Nome do Modelo</label>
                       <input 
                        value={editingTemplate.name} 
                        onChange={e => setEditingTemplate({...editingTemplate, name: e.target.value})} 
                        className={inputClass} 
                        placeholder="Ex: Recuperação de Crédito V1" 
                       />
                    </div>
                    <div>
                       <label className={labelClass}>Categoria Estratégica</label>
                       <select 
                        value={editingTemplate.category} 
                        onChange={e => setEditingTemplate({...editingTemplate, category: e.target.value})} 
                        className={inputClass}
                       >
                          <option value="RECUPERACAO">Recuperação Tributária</option>
                          <option value="HOLDING">Holding e Sucessão</option>
                          <option value="URGENCIA">Urgência Fiscal</option>
                          <option value="PROPOSTA">Follow-up de Proposta</option>
                       </select>
                    </div>
                 </div>

                 <div>
                    <label className={labelClass}>Assunto do E-mail</label>
                    <input 
                      value={editingTemplate.subject} 
                      onChange={e => setEditingTemplate({...editingTemplate, subject: e.target.value})} 
                      className={inputClass} 
                      placeholder="Utilize gatilhos de ROI no assunto" 
                    />
                 </div>

                 <div>
                    <div className="flex justify-between items-end mb-2">
                       <label className={labelClass}>Corpo da Mensagem</label>
                       <div className="flex gap-2">
                          {['nome_lead', 'empresa', 'segmento', 'valor_divida'].map(v => (
                            <button 
                              key={v} 
                              onClick={() => insertVariable(v)}
                              className="px-3 py-1 bg-amber-50 text-[#c5a059] border border-amber-100 rounded-lg text-[8px] font-black uppercase hover:bg-amber-100 transition-all"
                            >
                               +{v}
                            </button>
                          ))}
                       </div>
                    </div>
                    <textarea 
                      value={editingTemplate.content} 
                      onChange={e => setEditingTemplate({...editingTemplate, content: e.target.value})} 
                      className="w-full h-80 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-8 text-sm font-medium leading-relaxed outline-none shadow-inner focus:border-[#c5a059]"
                      placeholder="Escreva sua copy aqui..."
                    />
                 </div>

                 <div className="pt-6 flex gap-4 border-t border-slate-50">
                    <button 
                      onClick={handleSaveMasterTemplate}
                      className="flex-1 py-6 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                    >
                       Salvar Template Mestre
                    </button>
                    <button 
                      onClick={() => setIsTemplateModalOpen(false)}
                      className="px-10 py-6 bg-slate-100 text-slate-400 rounded-[2rem] font-black uppercase text-[10px] tracking-widest"
                    >
                       Descartar
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default MarketingAutomationDashboard;
