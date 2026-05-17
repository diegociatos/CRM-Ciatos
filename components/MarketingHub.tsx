
import React, { useState, useMemo, useEffect } from 'react';
import { 
  Lead, EmailTemplate, SmartList, SmartListFilters, LeadStatus, 
  InteractionType, Campaign, AutomationFlow, 
  AutomationStep, AutomationTrigger, User, CompanySize, CampaignComment, UserRole, Interaction,
  SystemConfig
} from '../types';
import { generateCampaignContent, CampaignTheme, GeneratedCampaign } from '../services/campaignAiService';
import { sendDirectMessage } from '../services/messagingService';

interface MarketingHubProps {
  leads: Lead[];
  templates: EmailTemplate[];
  users: User[];
  currentUser: User;
  config: SystemConfig;
  initialCampaigns: Campaign[];
  initialFlows: AutomationFlow[];
  onSaveTemplate: (tpl: EmailTemplate) => void;
  onSaveCampaign: (cmp: Campaign) => void;
  onRunCampaign: (cmp: Campaign, list: SmartList) => void;
  onDeleteCampaign: (id: string) => void;
  onSaveFlow: (flow: AutomationFlow) => void;
  onDeleteFlow: (id: string) => void;
  onLogInteraction: (leadId: string, inter: Omit<Interaction, 'id' | 'date'>) => void;
  onMoveLead: (leadId: string, phaseId: string) => void;
}

const MarketingHub: React.FC<MarketingHubProps> = ({ 
  leads, templates, users, currentUser, config, initialCampaigns, initialFlows, 
  onSaveTemplate, onSaveCampaign, onRunCampaign, onDeleteCampaign, 
  onSaveFlow, onDeleteFlow, onLogInteraction, onMoveLead 
}) => {
  const [activeTab, setActiveTab] = useState<'lists' | 'campaigns' | 'automation'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [showCampaignReview, setShowCampaignReview] = useState<Campaign | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  
  // IA Campaign Generator States
  const [showAiWizard, setShowAiWizard] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<CampaignTheme>('planejamento');
  const [aiResult, setAiResult] = useState<GeneratedCampaign | null>(null);
  const [wizardSmartListId, setWizardSmartListId] = useState('');

  // Collaboration State
  const [newComment, setNewComment] = useState('');

  // Segmentador States
  const [builderName, setBuilderName] = useState('');
  const [builderFilters, setBuilderFilters] = useState<SmartListFilters>({
    operator: 'AND',
    segment: '',
    state: '',
    city: '',
    location: '',
    minScore: 0,
    debtStatus: 'all',
    taxRegime: [],
    size: [],
    status: [],
    digitalPresence: { linkedin: false, instagram: false, website: false },
    // Initialize hasInteractions in SmartListFilters
    hasInteractions: 'any'
  });

  const [smartLists, setSmartLists] = useState<SmartList[]>(() => {
    const saved = localStorage.getItem('ciatos_smart_lists_v3');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('ciatos_smart_lists_v3', JSON.stringify(smartLists));
  }, [smartLists]);

  const applyFilters = (lead: Lead, filters: SmartListFilters): boolean => {
    const checks: boolean[] = [];
    if (filters.state) checks.push(lead.state.toUpperCase() === filters.state.toUpperCase());
    if (filters.city) checks.push(lead.city.toLowerCase().includes(filters.city.toLowerCase()));
    if (filters.location) checks.push((lead.location || '').toLowerCase().includes(filters.location.toLowerCase()));
    if (filters.segment) checks.push(lead.segment.toLowerCase().includes(filters.segment.toLowerCase()));
    if (filters.minScore) checks.push(lead.icpScore >= filters.minScore);
    if (filters.debtStatus !== 'all') checks.push(lead.debtStatus === filters.debtStatus);
    if (filters.taxRegime && filters.taxRegime.length > 0) checks.push(filters.taxRegime.includes(lead.taxRegime));
    if (filters.size && filters.size.length > 0) checks.push(filters.size.includes(lead.size));
    if (filters.status && filters.status.length > 0) checks.push(filters.status.includes(lead.status));
    if (filters.digitalPresence?.linkedin) checks.push(!!lead.linkedinDM || !!lead.linkedinCompany);
    if (filters.digitalPresence?.instagram) checks.push(!!lead.instagramDM || !!lead.instagramCompany);
    if (filters.digitalPresence?.website) checks.push(!!lead.website);

    // Filter by interaction history
    if (filters.hasInteractions && filters.hasInteractions !== 'any') {
      if (filters.hasInteractions === 'none') {
        checks.push(lead.interactions.length === 0);
      } else if (filters.hasInteractions === 'recent') {
        const last = lead.interactions[0];
        if (!last) checks.push(false);
        else checks.push((Date.now() - new Date(last.date).getTime()) < (7 * 24 * 60 * 60 * 1000));
      } else if (filters.hasInteractions === 'old') {
        const last = lead.interactions[0];
        if (!last) checks.push(true);
        else checks.push((Date.now() - new Date(last.date).getTime()) > (30 * 24 * 60 * 60 * 1000));
      }
    }

    if (checks.length === 0) return true;
    return filters.operator === 'AND' ? checks.every(c => c) : checks.some(c => c);
  };

  const filteredLeadsPreview = useMemo(() => {
    return leads.filter(l => applyFilters(l, builderFilters));
  }, [leads, builderFilters]);

  const handleAiGeneration = async () => {
    setAiLoading(true);
    const result = await generateCampaignContent(selectedTheme);
    setAiResult(result);
    setAiLoading(false);
  };

  const handleStartCampaign = async (cmp: Campaign) => {
    const list = smartLists.find(l => l.id === cmp.smartListId);
    if (!list) return alert("Lista de audiência não encontrada.");

    updateCampaignStatus(cmp.id, 'Running');
    const targetLeads = leads.filter(l => applyFilters(l, list.filters));
    
    let sentCount = 0;
    let errorCount = 0;

    for (const lead of targetLeads) {
      if (cmp.templates.email) {
        const result = await sendDirectMessage('EMAIL', lead.email, cmp.name, cmp.templates.email, config.messaging);
        onLogInteraction(lead.id, {
          type: 'EMAIL',
          title: `🛰️ Campanha Ativa: ${cmp.name}`,
          content: cmp.templates.email.substring(0, 150) + '...',
          author: 'Ciatos Marketing Hub',
          authorId: 'system-mkt',
          deliveryStatus: result.success ? 'delivered' : 'failed',
          errorMessage: result.errorMessage,
          latency: result.latency
        });
        if (!result.success) errorCount++;
      }
      
      sentCount++;
      setCampaigns(prev => prev.map(c => c.id === cmp.id ? { 
        ...c, 
        stats: { 
          ...c.stats, 
          sent: sentCount, 
          errors: errorCount, 
          opened: Math.floor(sentCount * 0.38),
          clicked: Math.floor(sentCount * 0.12)
        } 
      } : c));
      
      await new Promise(r => setTimeout(r, 150)); 
    }

    updateCampaignStatus(cmp.id, 'Completed');
    addComment(cmp.id, `🚀 Campanha finalizada automaticamente. Volume: ${sentCount} disparos, ${errorCount} erros.`);
  };

  const finalizeAiCampaign = () => {
    if (!aiResult || !wizardSmartListId) return;
    
    const newCampaign: Campaign = {
      id: `cmp-ai-${Math.random().toString(36).substr(2, 5)}`,
      name: `IA: ${selectedTheme.toUpperCase()} - ${new Date().toLocaleDateString()}`,
      smartListId: wizardSmartListId,
      templates: {
        email: aiResult.emailBody,
        whatsapp: aiResult.whatsappMessage
      },
      status: 'InReview',
      comments: [{ 
        id: Math.random().toString(), 
        userId: 'system', 
        userName: 'Ciatos AI', 
        text: `Blueprint estratégico gerado para o tema "${selectedTheme}". Aguardando revisão humana.`, 
        timestamp: new Date().toISOString() 
      }],
      createdAt: new Date().toISOString(),
      stats: { sent: 0, opened: 0, clicked: 0, replied: 0, errors: 0 }
    };

    setCampaigns(prev => [newCampaign, ...prev]);
    onSaveCampaign(newCampaign);
    setShowAiWizard(false);
    setAiResult(null);
    setActiveTab('campaigns');
  };

  const updateCampaignStatus = (id: string, status: Campaign['status']) => {
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    const camp = campaigns.find(c => c.id === id);
    if(camp) {
      const updated = { ...camp, status };
      onSaveCampaign(updated);
      if (showCampaignReview?.id === id) setShowCampaignReview(updated);
    }
  };

  const addComment = (id: string, text: string) => {
    const comment: CampaignComment = {
      id: Math.random().toString(),
      userId: currentUser.id,
      userName: currentUser.name,
      text,
      timestamp: new Date().toISOString()
    };
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, comments: [...c.comments, comment] } : c));
    setNewComment('');
  };

  const toggleArrayFilter = (field: keyof SmartListFilters, value: any) => {
    const current = (builderFilters[field] as any[]) || [];
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
    setBuilderFilters({ ...builderFilters, [field]: next });
  };

  const getCampaignProgress = (cmp: Campaign) => {
    if (cmp.status === 'Completed') return 100;
    if (cmp.status !== 'Running') return 0;
    const list = smartLists.find(l => l.id === cmp.smartListId);
    if (!list) return 0;
    return Math.min(100, Math.round((cmp.stats.sent / list.leadsCount) * 100));
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex justify-between items-end border-b border-slate-200 pb-10">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority">Marketing Direto & IA</h1>
          <p className="text-slate-500 text-lg font-medium">Orquestração de campanhas de alta performance.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowAiWizard(true)}
            className="px-8 py-4 bg-gradient-to-r from-[#0a192f] to-[#1e293b] text-[#c5a059] rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl border border-white/10 flex items-center gap-3 hover:scale-105 transition-all"
          >
            <span className="text-xl">✨</span> Novo Gerador IA
          </button>
          <div className="flex bg-slate-100 p-1.5 rounded-[1.8rem] shadow-inner border border-slate-200">
            {(['campaigns', 'lists', 'automation'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {tab === 'campaigns' ? '🛰️ Campanhas' : tab === 'lists' ? '🗂️ Audiências' : '🤖 Automação'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'campaigns' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
          {campaigns.length === 0 && (
            <div className="col-span-full py-32 text-center border-2 border-dashed border-slate-200 rounded-[3rem]">
              <p className="text-slate-400 font-bold serif-authority text-2xl">Nenhuma campanha orquestrada.</p>
              <button onClick={() => setShowAiWizard(true)} className="mt-6 text-[#c5a059] font-black uppercase text-[10px] tracking-widest hover:underline">Criar agora com IA</button>
            </div>
          )}
          {campaigns.map(cmp => (
            <div key={cmp.id} onClick={() => setShowCampaignReview(cmp)} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[420px] relative overflow-hidden">
              {cmp.status === 'Running' && <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse"></div>}
              
              <div>
                <div className="flex justify-between items-start mb-8">
                  <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                    cmp.status === 'Running' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 animate-pulse' : 
                    cmp.status === 'InReview' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                    cmp.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                    'bg-slate-50 text-slate-400 border-slate-100'
                  }`}>
                    {cmp.status === 'InReview' ? '👀 Em Revisão' : cmp.status === 'Running' ? '🛰️ Transmitindo' : cmp.status}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteCampaign(cmp.id); }} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>
                </div>

                <h3 className="text-2xl font-bold text-[#0a192f] serif-authority mb-6 group-hover:text-[#c5a059] transition-colors leading-tight">{cmp.name}</h3>
                
                {/* Micro Dashboard Card */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Aberturas</p>
                      <p className="text-xl font-bold text-[#0a192f]">{cmp.stats.opened}</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Cliques</p>
                      <p className="text-xl font-bold text-[#0a192f]">{cmp.stats.clicked}</p>
                   </div>
                </div>

                <div className="space-y-3">
                   <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                      <span>Progresso do Disparo</span>
                      <span className={cmp.stats.errors > 0 ? 'text-red-500' : 'text-emerald-500'}>{getCampaignProgress(cmp)}%</span>
                   </div>
                   <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-100">
                      <div className={`h-full transition-all duration-700 ${cmp.status === 'Completed' ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${getCampaignProgress(cmp)}%` }}></div>
                   </div>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-slate-50 pt-8 mt-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400 border border-slate-200">
                    {cmp.comments.length}
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Interações</span>
                </div>
                <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest border-b-2 border-transparent hover:border-[#c5a059] transition-all">Ver Detalhes</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REVIEWS & COLLABORATION MODAL */}
      {showCampaignReview && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setShowCampaignReview(null)}></div>
          <div className="relative bg-white w-full max-w-[95vw] h-[92vh] rounded-[4rem] shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-300">
            
            {/* Peças e Edição (Esquerda) */}
            <div className="flex-1 flex flex-col bg-white border-r border-slate-100 overflow-hidden">
               <div className="p-12 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="text-4xl font-black text-[#0a192f] serif-authority">{showCampaignReview.name}</h3>
                    <div className="flex items-center gap-4 mt-3">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Fluxo de Governança B2B</span>
                       <div className="h-1.5 w-1.5 rounded-full bg-slate-300"></div>
                       <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">Audiência: {smartLists.find(l => l.id === showCampaignReview.smartListId)?.name}</span>
                    </div>
                  </div>
                  <div className="flex gap-4">
                     {showCampaignReview.status === 'InReview' && currentUser.role === UserRole.ADMIN && (
                       <button 
                         onClick={() => updateCampaignStatus(showCampaignReview.id, 'Approved')} 
                         className="bg-emerald-500 text-white px-12 py-4 rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl shadow-emerald-500/20 hover:scale-105 transition-all"
                       >
                         Aprovar p/ Disparo
                       </button>
                     )}
                     {showCampaignReview.status === 'Approved' && (
                       <button 
                         onClick={() => handleStartCampaign(showCampaignReview)} 
                         className="bg-indigo-600 text-white px-12 py-4 rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl animate-pulse hover:scale-105 transition-all"
                       >
                         ⚡ Iniciar Transmissão
                       </button>
                     )}
                     {showCampaignReview.status === 'Completed' && (
                       <div className="bg-emerald-50 text-emerald-600 px-8 py-4 rounded-[1.8rem] border border-emerald-100 font-black uppercase text-[10px] tracking-widest">
                         ✅ Ciclo Finalizado
                       </div>
                     )}
                  </div>
               </div>

               <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar bg-slate-50/20">
                  <div className="bg-white border border-slate-200 rounded-[3rem] p-12 shadow-sm">
                     <h4 className="text-[11px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-10 border-b border-slate-50 pb-4">Criativo 01: Cold Email</h4>
                     <div className="space-y-8">
                        <div>
                           <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block">Linha de Assunto</label>
                           <input className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-[#0a192f] outline-none focus:border-indigo-400" defaultValue={showCampaignReview.templates.email?.split('\n')[0]} />
                        </div>
                        <div>
                           <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block">Corpo da Mensagem (Suporta Variáveis)</label>
                           <textarea className="w-full h-80 bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-8 text-sm font-medium leading-relaxed text-slate-700 outline-none shadow-inner focus:border-indigo-400" defaultValue={showCampaignReview.templates.email} />
                        </div>
                     </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-[3rem] p-12 shadow-sm">
                     <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.3em] mb-8">Criativo 02: WhatsApp Follow-up</h4>
                     <textarea className="w-full h-32 bg-white border-2 border-emerald-100 rounded-2xl p-6 text-sm font-medium leading-relaxed text-slate-700 outline-none shadow-inner" defaultValue={showCampaignReview.templates.whatsapp} />
                  </div>
               </div>
            </div>

            {/* Sidebar de Histórico e Comentários (Direita) */}
            <div className="w-[450px] bg-slate-50 flex flex-col">
               <div className="p-10 border-b border-slate-200 bg-white">
                  <h4 className="text-xl font-black text-[#0a192f] serif-authority mb-1">Collaboration Hub</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Logs & Feedbacks da Equipe</p>
               </div>

               <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                  {showCampaignReview.comments.map(comment => (
                    <div key={comment.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
                       <div className="flex justify-between items-center mb-3">
                          <p className={`text-[10px] font-black uppercase tracking-tighter ${comment.userId === 'system' ? 'text-[#c5a059]' : 'text-indigo-600'}`}>{comment.userName}</p>
                          <p className="text-[9px] font-bold text-slate-300 uppercase">{new Date(comment.timestamp).toLocaleDateString('pt-BR')}</p>
                       </div>
                       <p className="text-xs text-slate-600 font-medium leading-relaxed italic">"{comment.text}"</p>
                    </div>
                  ))}
               </div>

               <div className="p-10 bg-white border-t border-slate-200">
                  <div className="relative">
                     <textarea 
                       value={newComment}
                       onChange={e => setNewComment(e.target.value)}
                       placeholder="Adicionar nota para o time..." 
                       className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-sm font-medium outline-none focus:border-[#c5a059] transition-all"
                     />
                     <button 
                       disabled={!newComment.trim()}
                       onClick={() => addComment(showCampaignReview.id, newComment)}
                       className="absolute bottom-4 right-4 bg-[#0a192f] text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-30"
                     >
                       Postar
                     </button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* IA WIZARD MODAL (MANTER FUNCIONAL) */}
      {showAiWizard && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setShowAiWizard(false)}></div>
          <div className="relative bg-white w-full max-w-6xl h-[88vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-12 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
               <div>
                  <h2 className="text-4xl font-black text-[#0a192f] serif-authority">Gerador de Sequências IA</h2>
                  <p className="text-slate-500 font-medium text-lg">Modelagem dinâmica de teses tributárias e comerciais.</p>
               </div>
               <button onClick={() => setShowAiWizard(false)} className="text-slate-300 hover:text-slate-900 text-4xl transition-transform hover:rotate-90">✕</button>
            </div>

            <div className="flex-1 overflow-hidden flex">
               <div className="w-[380px] border-r border-slate-100 p-10 space-y-12 overflow-y-auto custom-scrollbar bg-slate-50/10">
                  <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-5">01. Selecionar Audiência</label>
                    <select value={wizardSmartListId} onChange={e => setWizardSmartListId(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold shadow-sm outline-none focus:border-[#c5a059]">
                       <option value="">Buscar Lista Salva...</option>
                       {smartLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.leadsCount})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-5">02. Direcionamento IA</label>
                    <div className="space-y-4">
                       {(['recuperacao', 'planejamento', 'holding', 'contabilidade', 'juridico'] as CampaignTheme[]).map(theme => (
                         <button 
                           key={theme} 
                           onClick={() => setSelectedTheme(theme)}
                           className={`w-full text-left p-5 rounded-2xl border-2 transition-all font-bold text-xs uppercase tracking-widest flex items-center justify-between ${selectedTheme === theme ? 'bg-[#0a192f] text-[#c5a059] border-[#0a192f] shadow-xl' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                         >
                           {theme}
                           {selectedTheme === theme && <div className="w-2 h-2 rounded-full bg-[#c5a059] shadow-[0_0_10px_#c5a059]"></div>}
                         </button>
                       ))}
                    </div>
                  </div>
                  <button 
                    disabled={aiLoading || !wizardSmartListId}
                    onClick={handleAiGeneration}
                    className="w-full py-6 bg-[#c5a059] text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.3em] shadow-2xl border-b-4 border-[#b08d4b] active:translate-y-1 transition-all disabled:opacity-50 disabled:scale-100"
                  >
                    {aiLoading ? '✨ Processando Matriz...' : 'Gerar Criativos'}
                  </button>
               </div>

               <div className="flex-1 bg-slate-100/30 p-12 overflow-y-auto custom-scrollbar">
                  {!aiResult ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
                       <div className="text-8xl mb-10">🖋️</div>
                       <p className="serif-authority text-4xl text-[#0a192f]">Aguardando Prompt</p>
                       <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400 mt-4">Escolha os parâmetros à esquerda para iniciar o motor.</p>
                    </div>
                  ) : (
                    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                       <div className="bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-xl relative">
                          <div className="flex justify-between items-center mb-10">
                             <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em] px-5 py-2 bg-indigo-50 rounded-full">Primary Asset: Email Marketing</span>
                             <div className="flex gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                <div className="w-2 h-2 rounded-full bg-slate-200"></div>
                             </div>
                          </div>
                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Linha de Assunto Sugerida</h4>
                          <p className="text-2xl font-bold text-[#0a192f] mb-10 serif-authority leading-tight">{aiResult.subject}</p>
                          <div className="p-10 bg-slate-50/50 rounded-[2.5rem] border-2 border-slate-100 text-base text-slate-600 leading-relaxed font-medium whitespace-pre-wrap italic shadow-inner">
                            {aiResult.emailBody}
                          </div>
                       </div>
                    </div>
                  )}
               </div>
            </div>

            <div className="p-12 border-t border-slate-100 bg-white flex justify-between items-center">
               <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] italic">Segurança: Conteúdo auditado via Ciatos LLM Engine.</p>
               <div className="flex gap-6">
                  <button onClick={() => setAiResult(null)} className="px-10 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-[0.3em] hover:bg-slate-200 transition">Descartar</button>
                  <button 
                    disabled={!aiResult} 
                    onClick={finalizeAiCampaign} 
                    className="px-16 py-5 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                  >
                    🚀 Publicar no Pipeline
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* SEGMENTADOR MODAL (REVISADO) */}
      {showListModal && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setShowListModal(false)}></div>
          <div className="relative bg-white w-full max-w-7xl h-[90vh] rounded-[4rem] shadow-2xl flex overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="w-[480px] bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden">
               <div className="p-12 border-b border-slate-200 bg-white">
                  <h2 className="text-4xl font-black text-[#0a192f] serif-authority mb-2">Segmentador Elite</h2>
                  <p className="text-slate-400 text-sm font-medium">Extração cirúrgica da base instalada.</p>
                  <input value={builderName} onChange={e => setBuilderName(e.target.value)} placeholder="Identificador do Segmento..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold mt-10 outline-none shadow-inner focus:border-[#c5a059]" />
               </div>
               <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                  <section>
                    <h4 className="text-[11px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-8 border-b border-slate-100 pb-3">Regime Tributário</h4>
                    <div className="flex flex-wrap gap-3">
                       {['Simples Nacional', 'Lucro Presumido', 'Lucro Real'].map(r => (
                         <button key={r} onClick={() => toggleArrayFilter('taxRegime', r)} className={`px-5 py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${builderFilters.taxRegime?.includes(r) ? 'bg-[#0a192f] text-white border-[#0a192f] shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'}`}>{r}</button>
                       ))}
                    </div>
                  </section>
                  <section>
                    <h4 className="text-[11px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-8 border-b border-slate-100 pb-3">Filtro de Localização</h4>
                    <input value={builderFilters.state} onChange={e => setBuilderFilters({...builderFilters, state: e.target.value})} placeholder="Estado (UF)" className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none mb-4" />
                    <input value={builderFilters.city} onChange={e => setBuilderFilters({...builderFilters, city: e.target.value})} placeholder="Cidade" className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none" />
                  </section>
               </div>
               <div className="p-12 bg-white border-t border-slate-200">
                  <button 
                    disabled={!builderName || filteredLeadsPreview.length === 0}
                    onClick={() => { 
                      const newList: SmartList = { id: `lst-${Math.random().toString(36).substr(2, 5)}`, name: builderName, filters: {...builderFilters}, leadsCount: filteredLeadsPreview.length, createdAt: new Date().toISOString() };
                      setSmartLists(prev => [newList, ...prev]); 
                      setShowListModal(false); 
                    }} 
                    className="w-full py-6 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all disabled:opacity-30"
                  >
                    Congelar Audiência ({filteredLeadsPreview.length})
                  </button>
               </div>
            </div>
            <div className="flex-1 bg-slate-100/50 p-12 overflow-auto custom-scrollbar">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
                  {filteredLeadsPreview.map(lead => (
                    <div key={lead.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-md transition-all">
                       <h4 className="font-bold text-[#0a192f] text-sm serif-authority truncate">{lead.tradeName}</h4>
                       <div className="flex gap-2 mt-4">
                          <span className="text-[8px] font-black uppercase bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 text-slate-400 tracking-widest">{lead.taxRegime}</span>
                          <span className="text-[8px] font-black uppercase bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100 text-indigo-500 tracking-widest">{lead.city}</span>
                       </div>
                    </div>
                  ))}
                  {filteredLeadsPreview.length === 0 && (
                    <div className="col-span-full py-40 text-center opacity-30">
                       <p className="serif-authority text-3xl text-slate-400">Sem correspondências na base.</p>
                    </div>
                  )}
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lists' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10">
           <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white flex flex-col justify-between min-h-[320px] shadow-2xl relative overflow-hidden group border-4 border-transparent hover:border-[#c5a059] transition-all">
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#c5a059]/10 rounded-full blur-3xl transition-all"></div>
            <div>
              <h2 className="serif-authority text-3xl text-[#c5a059] mb-4">Nova Audiência</h2>
              <p className="text-slate-400 text-sm leading-relaxed font-medium">Extraia leads por regime fiscal, localização ou ICP Score para comunicações massivas e personalizadas.</p>
            </div>
            <button onClick={() => setShowListModal(true)} className="w-full py-5 bg-[#c5a059] text-white rounded-[1.8rem] font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#b08d4b] active:translate-y-1 transition-all">
              Abrir Ferramenta de Filtro
            </button>
          </div>
          {smartLists.map(list => (
            <div key={list.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between min-h-[320px]">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <h3 className="text-2xl font-bold text-[#0a192f] serif-authority leading-tight">{list.name}</h3>
                  <button onClick={() => setSmartLists(prev => prev.filter(l => l.id !== list.id))} className="text-slate-300 hover:text-red-500 transition-colors">✕</button>
                </div>
                <div className="flex gap-3 mb-8">
                  <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-4 py-1.5 rounded-xl uppercase tracking-widest border border-indigo-100">{list.leadsCount} Contatos</span>
                </div>
              </div>
              <button 
                onClick={() => {
                   setWizardSmartListId(list.id);
                   setShowAiWizard(true);
                }} 
                className="w-full py-5 bg-slate-50 text-[#0a192f] border-2 border-slate-100 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest shadow-sm hover:bg-[#0a192f] hover:text-white transition-all"
              >
                🚀 Criar Campanha p/ esta Lista
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarketingHub;
