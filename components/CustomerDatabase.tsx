
import React, { useState, useMemo } from 'react';
import { Lead, LeadStatus, User, CustomerFeedbackPoint, Interaction, InteractionType, LeadPartner, SystemConfig } from '../types';

interface CustomerDatabaseProps {
  leads: Lead[];
  currentUser: User;
  onUpdateCustomer: (customer: Lead) => void;
  onAddCustomer: (data: any) => Promise<any>;
  config: SystemConfig;
}

const CustomerDatabase: React.FC<CustomerDatabaseProps> = ({ leads, currentUser, onUpdateCustomer, onAddCustomer, config }) => {
  const customers = useMemo(() => leads.filter(l => l.status === LeadStatus.WON), [leads]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'perfil' | 'timeline' | 'feedback' | 'onboarding'>('perfil');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackType, setFeedbackType] = useState<'POSITIVE' | 'NEGATIVE'>('POSITIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    tradeName: '', cnpj: '', contactName: '', contactPhone: '', contactEmail: '',
    taxRegime: '', size: '', serviceType: '', contractValue: '', notes: ''
  });

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId), [customers, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.cnpj.includes(searchTerm)
    );
  }, [customers, searchTerm]);

  const unifiedTimeline = useMemo(() => {
    if (!selectedCustomer) return [];
    
    const events: any[] = [];
    
    // 1. Interações comerciais e pós-venda
    selectedCustomer.interactions.forEach(i => events.push({ ...i, group: 'Interação' }));
    
    // 2. Onboarding Steps
    selectedCustomer.onboardingChecklist?.forEach(step => {
      if (step.status === 'Concluido') {
        events.push({
          id: step.id,
          type: 'EDIT' as InteractionType,
          title: `🏗️ Entrega Operacional: ${step.title}`,
          content: 'Fase de implantação finalizada com sucesso e validada pela técnica.',
          date: step.updatedAt,
          author: 'Sistema Operacional',
          group: 'Operacional'
        });
      }
    });

    // 3. Notas do SDR resgatadas
    if (selectedCustomer.notes) {
      events.push({
        id: 'initial-notes',
        type: 'NOTE' as InteractionType,
        title: '📜 Notas Iniciais da Qualificação (SDR)',
        content: selectedCustomer.notes,
        date: selectedCustomer.createdAt,
        author: 'SDR Engine',
        group: 'Histórico'
      });
    }

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedCustomer]);

  const handleAddFeedback = () => {
    if (!selectedCustomer || !feedbackText.trim()) return;
    
    const newPoint: CustomerFeedbackPoint = {
      id: `fb-${Date.now()}`,
      type: feedbackType,
      text: feedbackText,
      date: new Date().toISOString(),
      authorName: currentUser.name
    };

    const nextPoints = [...(selectedCustomer.feedbackPoints || []), newPoint];
    onUpdateCustomer({ ...selectedCustomer, feedbackPoints: nextPoints });
    setFeedbackText('');
  };

  const removeFeedback = (id: string) => {
    if (!selectedCustomer) return;
    const nextPoints = selectedCustomer.feedbackPoints?.filter(p => p.id !== id);
    onUpdateCustomer({ ...selectedCustomer, feedbackPoints: nextPoints });
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";
  const displayLabel = "text-[9px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-1 block";
  const sectionHeader = "text-[11px] font-black text-[#0a192f] uppercase tracking-[0.3em] mb-8 border-b border-slate-50 pb-2";
  const formInputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-[#c5a059]";
  const formLabelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";

  const handleCreateCustomer = async () => {
    if (!newCustomer.tradeName.trim()) return alert('Preencha o nome da empresa.');
    await onAddCustomer({
      tradeName: newCustomer.tradeName,
      cnpj: newCustomer.cnpj || 'Não informado',
      cnpjRaw: newCustomer.cnpj.replace(/\D/g, ''),
      contactName: newCustomer.contactName,
      phone: newCustomer.contactPhone,
      email: newCustomer.contactEmail,
      taxRegime: newCustomer.taxRegime,
      size: newCustomer.size,
      serviceType: newCustomer.serviceType,
      contractValue: parseFloat(newCustomer.contractValue.replace(',', '.')) || 0,
      notes: newCustomer.notes,
      status: LeadStatus.WON,
      phaseId: 'ph-fech',
      contractNumber: `CT-${Date.now()}`,
      contractStart: new Date().toISOString().split('T')[0],
      healthScore: 100,
      inQueue: false
    });
    setShowNewCustomerForm(false);
    setNewCustomer({ tradeName: '', cnpj: '', contactName: '', contactPhone: '', contactEmail: '', taxRegime: '', size: '', serviceType: '', contractValue: '', notes: '' });
  };

  if (!selectedCustomer) {
    return (
      <div className="space-y-10 animate-in fade-in duration-500">
        <div className="flex justify-between items-end border-b border-slate-200 pb-10">
          <div>
            <h1 className="text-5xl font-black text-[#0a192f] mb-2 serif-authority tracking-tighter italic">Base de Clientes Ativos</h1>
            <p className="text-slate-500 text-lg font-medium">Gestão de Relacionamento e Consultoria de Sucesso.</p>
          </div>
          <div className="flex items-center gap-4">
             <button 
               onClick={() => setShowNewCustomerForm(true)}
               className="px-6 py-3 bg-[#c5a059] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#b08d3e] transition-all shadow-lg"
             >
               + Cadastrar Cliente
             </button>
             <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
               <input 
                 type="text" 
                 placeholder="Pesquisar por Nome ou CNPJ..." 
                 className="w-80 px-4 py-2 text-sm outline-none font-bold"
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
               />
               <div className="bg-[#0a192f] text-[#c5a059] px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                 {customers.length} Empresas
               </div>
             </div>
          </div>
        </div>

        {/* MODAL CADASTRAR CLIENTE */}
        {showNewCustomerForm && (
          <div className="fixed inset-0 z-[3000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowNewCustomerForm(false)}>
            <div className="bg-white rounded-[3rem] p-10 w-full max-w-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black text-[#0a192f] serif-authority mb-8">Cadastrar Novo Cliente Ativo</h2>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className={formLabelClass}>Nome da Empresa *</label>
                  <input className={formInputClass} value={newCustomer.tradeName} onChange={e => setNewCustomer({...newCustomer, tradeName: e.target.value})} placeholder="Razão Social ou Nome Fantasia" />
                </div>
                <div>
                  <label className={formLabelClass}>CNPJ</label>
                  <input className={formInputClass} value={newCustomer.cnpj} onChange={e => setNewCustomer({...newCustomer, cnpj: e.target.value})} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className={formLabelClass}>Nome do Contato</label>
                  <input className={formInputClass} value={newCustomer.contactName} onChange={e => setNewCustomer({...newCustomer, contactName: e.target.value})} placeholder="Responsável" />
                </div>
                <div>
                  <label className={formLabelClass}>Telefone</label>
                  <input className={formInputClass} value={newCustomer.contactPhone} onChange={e => setNewCustomer({...newCustomer, contactPhone: e.target.value})} placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className={formLabelClass}>E-mail</label>
                  <input className={formInputClass} value={newCustomer.contactEmail} onChange={e => setNewCustomer({...newCustomer, contactEmail: e.target.value})} placeholder="email@empresa.com" />
                </div>
                <div>
                  <label className={formLabelClass}>Regime Tributário</label>
                  <select className={formInputClass} value={newCustomer.taxRegime} onChange={e => setNewCustomer({...newCustomer, taxRegime: e.target.value})}>
                    <option value="">Selecione...</option>
                    {(config.taxRegimes || []).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={formLabelClass}>Porte</label>
                  <select className={formInputClass} value={newCustomer.size} onChange={e => setNewCustomer({...newCustomer, size: e.target.value})}>
                    <option value="">Selecione...</option>
                    {(config.companySizes || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={formLabelClass}>Serviço Contratado</label>
                  <select className={formInputClass} value={newCustomer.serviceType} onChange={e => setNewCustomer({...newCustomer, serviceType: e.target.value})}>
                    <option value="">Selecione...</option>
                    {(config.serviceTypes || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={formLabelClass}>Valor do Contrato (R$)</label>
                  <input className={formInputClass} type="number" step="0.01" min="0" value={newCustomer.contractValue} onChange={e => setNewCustomer({...newCustomer, contractValue: e.target.value})} placeholder="0,00" />
                </div>
                <div className="col-span-2">
                  <label className={formLabelClass}>Observações</label>
                  <textarea className={formInputClass + ' h-20 resize-none'} value={newCustomer.notes} onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})} placeholder="Observações sobre o cliente..." />
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-8">
                <button onClick={() => setShowNewCustomerForm(false)} className="px-8 py-3 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200">Cancelar</button>
                <button onClick={handleCreateCustomer} className="px-8 py-3 bg-[#0a192f] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#0a192f]/90 shadow-lg border-b-4 border-[#c5a059]">Cadastrar Cliente</button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
           <table className="w-full text-left">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                 <tr>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa / Contato</th>
                    <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Regime / Porte</th>
                    <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Saúde</th>
                    <th className="px-6 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Serviço Ativo</th>
                    <th className="px-10 py-6 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Ação</th>
                 </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {filteredCustomers.map(c => (
                   <tr key={c.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setSelectedCustomerId(c.id)}>
                      <td className="px-10 py-6">
                         <p className="font-bold text-[#0a192f] text-sm serif-authority">{c.tradeName}</p>
                         <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-slate-300 font-mono">{c.cnpj}</span>
                            <span className="text-[8px] bg-indigo-50 text-indigo-500 font-black px-1.5 rounded uppercase">CT: {c.contractNumber || 'GERADO'}</span>
                         </div>
                      </td>
                      <td className="px-6 py-6">
                         <p className="text-xs font-bold text-slate-600">{c.taxRegime}</p>
                         <p className="text-[9px] text-slate-400 uppercase font-black">{c.size}</p>
                      </td>
                      <td className="px-6 py-6">
                         <div className="flex items-center gap-3">
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                               <div className={`h-full ${c.healthScore && c.healthScore > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${c.healthScore || 0}%` }}></div>
                            </div>
                            <span className="text-[10px] font-black text-slate-400">{c.healthScore || 0}%</span>
                         </div>
                      </td>
                      <td className="px-6 py-6">
                         <span className="px-3 py-1 bg-amber-50 text-[#c5a059] rounded-lg text-[9px] font-black uppercase border border-amber-100">{c.serviceType}</span>
                      </td>
                      <td className="px-10 py-6 text-right">
                         <button className="px-6 py-2 bg-slate-100 text-[#0a192f] rounded-xl text-[10px] font-black uppercase hover:bg-[#0a192f] hover:text-white transition-all">Ver Dossiê 360</button>
                      </td>
                   </tr>
                 ))}
                 {filteredCustomers.length === 0 && (
                   <tr>
                     <td colSpan={5} className="py-32 text-center">
                        <p className="text-slate-300 italic serif-authority text-xl">Nenhum cliente ativo localizado.</p>
                     </td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>
      </div>
    );
  }

  // VIEW 360 DO CLIENTE
  return (
    <div className="space-y-10 animate-in slide-in-from-right-10 duration-500">
      {/* BACK & HEADER */}
      <div className="flex justify-between items-start">
        <button 
          onClick={() => setSelectedCustomerId(null)}
          className="flex items-center gap-3 text-slate-400 hover:text-[#0a192f] transition-all group bg-white px-6 py-3 rounded-2xl border border-slate-100 shadow-sm"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          <span className="text-xs font-black uppercase tracking-widest">Voltar para Lista</span>
        </button>

        <div className="flex gap-4">
           <button className="px-8 py-3 bg-[#0a192f] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl border-b-4 border-[#c5a059]">Exportar Audit 360</button>
        </div>
      </div>

      <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-10">
         <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#c5a059]/5 rounded-full blur-[100px] -mr-64 -mt-64"></div>
         <div className="relative z-10 flex items-center gap-8">
            <div className="w-20 h-20 bg-[#0a192f] text-[#c5a059] rounded-3xl flex items-center justify-center text-4xl font-black serif-authority border-4 border-slate-50 shadow-2xl">
               {selectedCustomer.tradeName.charAt(0)}
            </div>
            <div>
               <h2 className="text-4xl font-black text-[#0a192f] serif-authority tracking-tight leading-none mb-2">{selectedCustomer.tradeName}</h2>
               <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 font-mono tracking-widest uppercase">{selectedCustomer.cnpj}</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981]"></div>
                  <span className="text-[10px] font-black uppercase text-[#c5a059] tracking-widest">Status: Cliente Ativo</span>
               </div>
            </div>
         </div>

         <div className="flex gap-8 relative z-10">
            <div className="text-center">
               <p className="text-3xl font-black text-[#0a192f] serif-authority">{selectedCustomer.healthScore}%</p>
               <p className="text-[9px] font-black text-slate-400 uppercase">Health Score</p>
            </div>
            <div className="w-px h-12 bg-slate-100"></div>
            <div className="text-center">
               <p className="text-3xl font-black text-[#0a192f] serif-authority">{selectedCustomer.contractStart || '—'}</p>
               <p className="text-[9px] font-black text-slate-400 uppercase">Vigência Início</p>
            </div>
         </div>
      </div>

      {/* TABS DE GESTÃO */}
      <div className="flex bg-slate-100 p-2 rounded-[2.5rem] border border-slate-200 shadow-inner overflow-x-auto">
        {(['perfil', 'timeline', 'feedback', 'onboarding'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-[180px] px-8 py-4 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[#0a192f] text-white shadow-xl' : 'text-slate-500 hover:bg-white/50'}`}
          >
            {tab === 'perfil' ? '🏢 Dossiê Cadastral' : tab === 'timeline' ? '🕒 Timeline 360' : tab === 'feedback' ? '💎 Feedback Strategist' : '🏗️ Onboarding'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        
        <div className="lg:col-span-2 space-y-8">
           {activeTab === 'perfil' && (
             <div className="animate-in slide-in-from-bottom-4 space-y-10">
                {/* Seção 1: Identificação Completa */}
                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
                   <h3 className={sectionHeader}>Identificação Corporativa</h3>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-8">
                      <div className="col-span-2">
                         <label className={displayLabel}>Razão Social Completa</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.legalName}</p>
                      </div>
                      <div className="col-span-2">
                         <label className={displayLabel}>Nome Fantasia</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.tradeName}</p>
                      </div>
                      <div className="col-span-1">
                         <label className={displayLabel}>Regime Tributário</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.taxRegime}</p>
                      </div>
                      <div className="col-span-1">
                         <label className={displayLabel}>Porte Corporativo</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.size}</p>
                      </div>
                      <div className="col-span-1">
                         <label className={displayLabel}>Telefone Sede</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.companyPhone || 'S/I'}</p>
                      </div>
                      <div className="col-span-1">
                         <label className={displayLabel}>Status Fiscal</label>
                         <p className={`text-sm font-bold ${selectedCustomer.debtStatus === 'Regular' ? 'text-emerald-500' : 'text-rose-500'}`}>{selectedCustomer.debtStatus}</p>
                      </div>
                      <div className="col-span-2">
                         <label className={displayLabel}>Endereço Completo</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.address || selectedCustomer.location || 'S/I'}</p>
                      </div>
                      <div className="col-span-2">
                         <label className={displayLabel}>Website / Canais</label>
                         <p className="text-sm font-bold text-indigo-600 truncate">{selectedCustomer.website || 'N/A'}</p>
                      </div>
                   </div>
                </div>

                {/* Seção 2: Diagnóstico Financeiro */}
                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
                   <h3 className={sectionHeader}>Diagnóstico Financeiro (Mapeado)</h3>
                   <div className="grid grid-cols-3 gap-8">
                      <div>
                         <label className={displayLabel}>Folha Mensal (R$)</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.payrollValue || 'Não Informado'}</p>
                      </div>
                      <div>
                         <label className={displayLabel}>Faturamento Mensal (R$)</label>
                         <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.monthlyRevenue || 'Não Informado'}</p>
                      </div>
                      <div>
                         <label className={displayLabel}>Faturamento Anual (Histórico)</label>
                         <p className="text-sm font-bold text-indigo-600">{selectedCustomer.annualRevenue}</p>
                      </div>
                   </div>
                </div>

                {/* Seção 3: Quadro Societário (QSA) */}
                <div className="bg-slate-50 p-12 rounded-[4rem] border border-slate-100 shadow-inner">
                   <h3 className={sectionHeader}>Quadro Societário (QSA)</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {selectedCustomer.detailedPartners?.map((p, i) => (
                       <div key={i} className="p-6 bg-white rounded-3xl border border-slate-100 flex items-center gap-4 shadow-sm">
                          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-sm shadow-inner">👤</div>
                          <div className="flex-1">
                             <p className="text-xs font-black text-[#0a192f]">{p.name}</p>
                             <div className="flex justify-between items-center mt-1">
                                <span className="text-[9px] text-slate-400 font-mono">{p.cpf || 'CPF NÃO INFORMADO'}</span>
                                <span className="text-[9px] bg-indigo-50 text-indigo-500 font-black px-2 rounded uppercase">{p.sharePercentage} DE COTAS</span>
                             </div>
                          </div>
                       </div>
                     ))}
                     {(!selectedCustomer.detailedPartners || selectedCustomer.detailedPartners.length === 0) && (
                       <p className="col-span-2 text-center py-10 text-[10px] text-slate-300 italic uppercase font-black tracking-widest">Base de Sócios não Migrada</p>
                     )}
                   </div>
                </div>

                {/* Seção 4: Notas Estratégicas */}
                <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
                   <h3 className={sectionHeader}>Memória Estratégica do Lead</h3>
                   <div className="grid grid-cols-2 gap-10">
                      <div>
                         <label className={displayLabel}>Dores Principais</label>
                         <p className="text-xs text-slate-500 font-medium leading-relaxed italic">"{selectedCustomer.strategicPains || 'Sem registros de dores na qualificação.'}"</p>
                      </div>
                      <div>
                         <label className={displayLabel}>Expectativas Coletadas</label>
                         <p className="text-xs text-slate-500 font-medium leading-relaxed italic">"{selectedCustomer.expectations || 'Sem registros de expectativas.'}"</p>
                      </div>
                   </div>
                </div>
             </div>
           )}

           {activeTab === 'timeline' && (
             <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm animate-in fade-in">
                <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-10">Rastreabilidade Total</h3>
                <div className="space-y-10 relative">
                   <div className="absolute left-[19px] top-4 bottom-4 w-0.5 bg-slate-100"></div>
                   {unifiedTimeline.map((item, idx) => (
                     <div key={idx} className="relative pl-14 group">
                        <div className={`absolute left-0 top-0 w-10 h-10 rounded-xl border-4 border-white shadow-md flex items-center justify-center text-xs z-10 ${
                          item.group === 'Interação' ? 'bg-indigo-500' : item.group === 'Operacional' ? 'bg-[#c5a059]' : 'bg-slate-800'
                        } text-white`}>
                           {item.group === 'Interação' ? '📞' : item.group === 'Operacional' ? '🏗️' : '📜'}
                        </div>
                        <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100 group-hover:border-[#c5a059] transition-all">
                           <div className="flex justify-between items-start mb-2">
                              <h4 className="font-bold text-[#0a192f] text-sm">{item.title}</h4>
                              <span className="text-[10px] font-black text-slate-300 uppercase">{new Date(item.date).toLocaleDateString('pt-BR')}</span>
                           </div>
                           <p className="text-xs text-slate-500 italic leading-relaxed">"{item.content}"</p>
                           <div className="mt-4 flex items-center gap-2 border-t border-slate-200/50 pt-3">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.group} • Autor: {item.author}</span>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
           )}

           {activeTab === 'feedback' && (
              <div className="grid grid-cols-1 gap-10 animate-in fade-in">
                 <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm space-y-10">
                    <div>
                       <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Lançamento de Feedback Estratégico</h3>
                       <p className="text-xs text-slate-400 font-medium mt-1">Dados fundamentais para a reunião de prestação de contas (QBR).</p>
                    </div>
                    
                    <div className="space-y-6">
                       <div className="flex gap-4">
                          <button onClick={() => setFeedbackType('POSITIVE')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all ${feedbackType === 'POSITIVE' ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>🎉 Fizemos Bem (+)</button>
                          <button onClick={() => setFeedbackType('NEGATIVE')} className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase border-2 transition-all ${feedbackType === 'NEGATIVE' ? 'bg-red-50 border-red-500 text-red-600 shadow-lg' : 'bg-white border-slate-100 text-slate-400'}`}>⚠️ Onde Erramos (-)</button>
                       </div>
                       <textarea 
                          value={feedbackText}
                          onChange={e => setFeedbackText(e.target.value)}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2.5rem] p-8 text-sm font-medium h-48 outline-none focus:border-[#c5a059] shadow-inner"
                          placeholder="Descreva o evento, feedback do cliente ou observação do gestor..."
                       />
                       <button 
                          onClick={handleAddFeedback}
                          disabled={!feedbackText.trim()}
                          className="w-full py-6 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all disabled:opacity-50"
                       >
                          Salvar Insight de Pós-Venda
                       </button>
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* COLUNA POSITIVA */}
                    <div className="space-y-4">
                       <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-6">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Preservar / Manter
                       </h4>
                       {selectedCustomer.feedbackPoints?.filter(p => p.type === 'POSITIVE').map(p => (
                         <div key={p.id} className="p-8 bg-white rounded-[2.5rem] border-l-8 border-emerald-500 shadow-sm relative group animate-in slide-in-from-left-4">
                            <p className="text-sm text-slate-600 font-medium italic leading-relaxed">"{p.text}"</p>
                            <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-50">
                               <span className="text-[9px] font-black text-slate-300 uppercase">{new Date(p.date).toLocaleDateString()} • {p.authorName}</span>
                               <button onClick={() => removeFeedback(p.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">🗑️</button>
                            </div>
                         </div>
                       ))}
                    </div>

                    {/* COLUNA NEGATIVA */}
                    <div className="space-y-4">
                       <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-2 mb-6">
                          <span className="w-2 h-2 rounded-full bg-red-500"></span> Ajustar / Corrigir
                       </h4>
                       {selectedCustomer.feedbackPoints?.filter(p => p.type === 'NEGATIVE').map(p => (
                         <div key={p.id} className="p-8 bg-white rounded-[2.5rem] border-l-8 border-red-500 shadow-sm relative group animate-in slide-in-from-right-4">
                            <p className="text-sm text-slate-600 font-medium italic leading-relaxed">"{p.text}"</p>
                            <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-50">
                               <span className="text-[9px] font-black text-slate-300 uppercase">{new Date(p.date).toLocaleDateString()} • {p.authorName}</span>
                               <button onClick={() => removeFeedback(p.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">🗑️</button>
                            </div>
                         </div>
                       ))}
                    </div>
                 </div>
              </div>
           )}

           {activeTab === 'onboarding' && (
              <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm animate-in slide-in-from-bottom-4">
                 <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-10">Status de Implantação</h3>
                 <div className="space-y-4">
                    {selectedCustomer.onboardingChecklist?.map((step, idx) => (
                       <div key={step.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-6">
                             <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-white ${step.status === 'Concluido' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-300'}`}>
                                {step.status === 'Concluido' ? '✓' : idx + 1}
                             </div>
                             <div>
                                <p className="font-bold text-[#0a192f] text-sm">{step.title}</p>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">Status: {step.status}</p>
                             </div>
                          </div>
                          <span className="text-[9px] font-black text-slate-300 uppercase">{step.dueDate}</span>
                       </div>
                    ))}
                    {(!selectedCustomer.onboardingChecklist || selectedCustomer.onboardingChecklist.length === 0) && (
                       <p className="py-20 text-center text-slate-300 italic">Cronograma não instanciado.</p>
                    )}
                 </div>
              </div>
           )}
        </div>

        {/* SIDEBAR DE APOIO 360 (DIREITA) */}
        <div className="space-y-8">
           <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-2xl transition-all group-hover:scale-150"></div>
              <h4 className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-8">Interlocutor Principal</h4>
              <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                 <p className="text-xl font-black serif-authority mb-1">{selectedCustomer.name}</p>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{selectedCustomer.role || 'Tomador de Decisão'}</p>
                 <div className="mt-8 space-y-4 text-xs font-bold text-slate-300">
                    <p className="flex items-center gap-3">
                       <span className="text-lg">📞</span> {selectedCustomer.phone}
                    </p>
                    <p className="flex items-center gap-3">
                       <span className="text-lg">✉️</span> {selectedCustomer.email}
                    </p>
                 </div>
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm space-y-8">
              <div>
                 <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumo Operacional</h4>
                 <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-400" style={{ width: `${selectedCustomer.healthScore || 0}%` }}></div>
                 </div>
                 <p className="text-[9px] font-black text-emerald-500 uppercase">Eficiência de Entrega em SLA</p>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-50">
                 <div>
                    <label className="text-[10px] font-black text-[#c5a059] uppercase mb-1">Início de Parceria</label>
                    <p className="text-sm font-bold text-[#0a192f]">{selectedCustomer.contractStart || 'Data não migrada'}</p>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-[#c5a059] uppercase mb-1">Valor de Contrato (Anual)</label>
                    <p className="text-sm font-bold text-indigo-600">{selectedCustomer.contractValue || 'Sob consulta'}</p>
                 </div>
              </div>
           </div>
           
           <div className="p-8 bg-amber-50 rounded-[2.5rem] border border-amber-100">
              <p className="text-[10px] font-black text-amber-800 uppercase mb-2">💡 Nota Strategist</p>
              <p className="text-xs text-amber-900/60 leading-relaxed font-medium italic">
                "Prepare a reunião mensal com base nos feedbacks lançados. Clientes que percebem auditoria de erros e acertos têm 40% mais retenção."
              </p>
           </div>
        </div>

      </div>
    </div>
  );
};

export default CustomerDatabase;
