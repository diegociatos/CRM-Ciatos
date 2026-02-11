
import React, { useState, useEffect } from 'react';
import { Lead, LeadStatus, SystemConfig, User, LeadPartner, CompanySize } from '../types';

interface NewLeadFormProps {
  config: SystemConfig;
  onSave: (lead: any) => Promise<{ success: boolean; message: string }>;
  onCancel: () => void;
  currentUser: User;
  initialData?: Partial<Lead>;
}

const NewLeadForm: React.FC<NewLeadFormProps> = ({ config, onSave, onCancel, currentUser, initialData }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!initialData?.id;

  const [form, setForm] = useState({
    id: initialData?.id || '',
    legalName: initialData?.legalName || '',
    cnpj: initialData?.cnpj || '',
    tradeName: initialData?.tradeName || initialData?.company || '',
    segment: initialData?.segment || '',
    website: initialData?.website || initialData?.linkedinCompany || '',
    companyPhone: initialData?.companyPhone || '',
    address: initialData?.address || initialData?.location || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    
    taxRegime: initialData?.taxRegime || config.taxRegimes[0] || 'Simples Nacional',
    size: initialData?.size || (config.companySizes[0] as CompanySize) || CompanySize.ME,
    payrollValue: initialData?.payrollValue || '',
    monthlyRevenue: initialData?.monthlyRevenue || '',
    annualRevenue: initialData?.annualRevenue || '',
    debtStatus: initialData?.debtStatus || 'Regular',

    detailedPartners: initialData?.detailedPartners || [] as LeadPartner[],

    name: initialData?.name || '', 
    phone: initialData?.phone || '',
    role: initialData?.role || '',
    email: initialData?.email || '',
    notes: initialData?.notes || '',
    strategicPains: initialData?.strategicPains || '',
    expectations: initialData?.expectations || '',
    closeProbability: initialData?.closeProbability || 1
  });

  const handleAddPartner = () => {
    setForm({
      ...form,
      detailedPartners: [...form.detailedPartners, { name: '', cpf: '', sharePercentage: '' }]
    });
  };

  const handleRemovePartner = (index: number) => {
    const next = [...form.detailedPartners];
    next.splice(index, 1);
    setForm({ ...form, detailedPartners: next });
  };

  const handlePartnerChange = (index: number, field: keyof LeadPartner, value: string) => {
    const next = [...form.detailedPartners];
    next[index] = { ...next[index], [field]: value };
    setForm({ ...form, detailedPartners: next });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const result = await onSave({ 
      ...form, 
      company: form.tradeName || form.legalName,
      cnpjRaw: form.cnpj.replace(/\D/g, '')
    });
    
    if (result.success) onCancel();
    setIsSubmitting(false);
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

  const inputClass = "w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#c5a059] transition-all font-bold placeholder:text-slate-300";
  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] block mb-2";
  const sectionHeader = "text-xs font-black text-[#0a192f] uppercase tracking-[0.3em] mb-8 flex items-center gap-4 before:h-px before:flex-1 before:bg-slate-100 after:h-px after:flex-1 after:bg-slate-100";

  return (
    <div className="max-w-6xl w-full bg-white rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 border border-slate-100">
      <div className="p-10 bg-[#0a192f] text-white border-b-8 border-[#c5a059] flex justify-between items-center">
        <div>
          <h1 className="serif-authority text-4xl font-bold tracking-tight">
            {isEditMode ? 'Atualizar Dossiê SDR' : 'Gerar Novo Lead Estratégico'}
          </h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Inteligência B2B • Módulo de Qualificação</p>
        </div>
        <div className="w-16 h-16 bg-[#c5a059] rounded-2xl flex items-center justify-center font-black text-2xl serif-authority text-white shadow-lg">CI</div>
      </div>

      <form onSubmit={handleSubmit} className="p-12 space-y-16 max-h-[75vh] overflow-y-auto custom-scrollbar bg-slate-50/30">
        <section>
          <h2 className={sectionHeader}>Identificação Corporativa</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <label className={labelClass}>Razão Social *</label>
              <input required className={inputClass} value={form.legalName} onChange={e => setForm({...form, legalName: e.target.value})} placeholder="Ex: Ciatos Consultoria S/A" />
            </div>
            <div>
              <label className={labelClass}>CNPJ *</label>
              <input required disabled={isEditMode} className={inputClass} value={form.cnpj} onChange={e => setForm({...form, cnpj: e.target.value})} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className={labelClass}>Nome Fantasia</label>
              <input className={inputClass} value={form.tradeName} onChange={e => setForm({...form, tradeName: e.target.value})} placeholder="Ex: Banca Ciatos" />
            </div>
            <div>
              <label className={labelClass}>Segmento de Atuação</label>
              <input className={inputClass} value={form.segment} onChange={e => setForm({...form, segment: e.target.value})} placeholder="Ex: Indústria Metalúrgica" />
            </div>
            <div>
               <label className={labelClass}>Temperatura de Fechamento (1-5)</label>
               <div className="flex gap-4 p-4 bg-white border-2 border-slate-100 rounded-2xl">
                  {[1, 2, 3, 4, 5].map(v => (
                    <button 
                      key={v}
                      type="button"
                      onClick={() => setForm({...form, closeProbability: v})}
                      className={`text-2xl transition-all hover:scale-125 ${form.closeProbability >= v ? getTempColor(form.closeProbability) : 'text-slate-100'}`}
                    >
                      🔥
                    </button>
                  ))}
                  <span className="ml-4 text-[10px] font-black uppercase text-slate-400 self-center">
                    {form.closeProbability === 1 ? 'Frio' : form.closeProbability === 3 ? 'Quente' : form.closeProbability === 5 ? 'BRASAL / FECHAMENTO' : ''}
                  </span>
               </div>
            </div>
            <div>
              <label className={labelClass}>Website / LinkedIn Empresa</label>
              <input className={inputClass} value={form.website} onChange={e => setForm({...form, website: e.target.value})} placeholder="https://..." />
            </div>
            <div>
              <label className={labelClass}>Telefone Sede</label>
              <input className={inputClass} value={form.companyPhone} onChange={e => setForm({...form, companyPhone: e.target.value})} placeholder="(00) 0000-0000" />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Endereço Completo</label>
              <input className={inputClass} value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Rua, Número, Bairro, CEP..." />
            </div>
          </div>
        </section>

        <section>
          <h2 className={sectionHeader}>Diagnóstico Fiscal & Financeiro</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <label className={labelClass}>Regime Tributário *</label>
              <select className={inputClass} value={form.taxRegime} onChange={e => setForm({...form, taxRegime: e.target.value})}>
                {config.taxRegimes.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Porte Corporativo *</label>
              <select className={inputClass} value={form.size} onChange={e => setForm({...form, size: e.target.value as CompanySize})}>
                {config.companySizes.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Possui Dívidas Ativas? *</label>
              <select className={inputClass} value={form.debtStatus} onChange={e => setForm({...form, debtStatus: e.target.value})}>
                <option value="Regular">Não (Regular)</option>
                <option value="Dívida Ativa">Sim (Possui Pendências)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Folha de Pagamento Mensal (R$)</label>
              <input className={inputClass} value={form.payrollValue} onChange={e => setForm({...form, payrollValue: e.target.value})} placeholder="R$ 0,00" />
            </div>
            <div>
              <label className={labelClass}>Faturamento Mensal (R$)</label>
              <input className={inputClass} value={form.monthlyRevenue} onChange={e => setForm({...form, monthlyRevenue: e.target.value})} placeholder="R$ 0,00" />
            </div>
            <div>
              <label className={labelClass}>Faturamento Anual / LTM (R$)</label>
              <input className={inputClass} value={form.annualRevenue} onChange={e => setForm({...form, annualRevenue: e.target.value})} placeholder="R$ 0,00" />
            </div>
          </div>
        </section>

        <section className="bg-slate-100/50 p-10 rounded-[3rem] border-2 border-white shadow-inner">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xs font-black text-[#0a192f] uppercase tracking-[0.3em]">Composição Societária (QSA)</h2>
            <button type="button" onClick={handleAddPartner} className="text-[10px] font-black uppercase text-indigo-600 bg-white px-6 py-2 rounded-xl shadow-sm border border-slate-100 hover:bg-indigo-50 transition-all">+ Novo Sócio</button>
          </div>
          
          <div className="space-y-4">
            {form.detailedPartners.length === 0 && (
              <p className="text-center py-10 text-slate-300 italic text-sm">Nenhum sócio mapeado na base até o momento.</p>
            )}
            {form.detailedPartners.map((partner, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-white p-6 rounded-2xl shadow-sm border border-slate-50 animate-in slide-in-from-left-4 duration-300">
                <div className="md:col-span-5">
                  <label className="text-[8px] font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label>
                  <input className={inputClass} value={partner.name} onChange={e => handlePartnerChange(idx, 'name', e.target.value)} placeholder="Identificação do Sócio" />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[8px] font-bold text-slate-400 uppercase mb-1 block">CPF</label>
                  <input className={inputClass} value={partner.cpf} onChange={e => handlePartnerChange(idx, 'cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[8px] font-bold text-slate-400 uppercase mb-1 block">% Participação</label>
                  <input className={inputClass} value={partner.sharePercentage} onChange={e => handlePartnerChange(idx, 'sharePercentage', e.target.value)} placeholder="100.00%" />
                </div>
                <div className="md:col-span-1">
                  <button type="button" onClick={() => handleRemovePartner(idx)} className="w-full h-[46px] flex items-center justify-center bg-red-50 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all">✕</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={sectionHeader}>Análise Estratégica & Dores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label className={labelClass}>Dores Latentes Identificadas</label>
              <textarea 
                className={`${inputClass} h-40 resize-none pt-4`} 
                value={form.strategicPains} 
                onChange={e => setForm({...form, strategicPains: e.target.value})} 
                placeholder="Descreva aqui o que aflige o cliente (ex: passivo tributário, sucessão incerta...)" 
              />
            </div>
            <div>
              <label className={labelClass}>Expectativas do Lead</label>
              <textarea 
                className={`${inputClass} h-40 resize-none pt-4`} 
                value={form.expectations} 
                onChange={e => setForm({...form, expectations: e.target.value})} 
                placeholder="O que o cliente espera alcançar com o projeto?" 
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className={sectionHeader}>Interlocutores Estratégicos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div>
               <label className={labelClass}>Nome do Decisor Principal *</label>
               <input required className={inputClass} value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Nome completo do tomador de decisão" />
             </div>
             <div>
               <label className={labelClass}>WhatsApp Direto *</label>
               <input required className={inputClass} value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(00) 90000-0000" />
             </div>
             <div>
               <label className={labelClass}>Cargo / Carga de Responsabilidade</label>
               <input className={inputClass} value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="Ex: Diretor de Operações (COO)" />
             </div>
             <div>
               <label className={labelClass}>E-mail Pessoal / Direto</label>
               <input className={inputClass} value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="contato.direto@empresa.com.br" />
             </div>
          </div>
        </section>

        <div className="pt-10 flex gap-6 pb-4">
          <button 
            type="submit" 
            disabled={isSubmitting} 
            className="flex-1 bg-[#0a192f] text-white py-6 rounded-[2rem] font-black uppercase text-[10px] tracking-[0.3em] shadow-2xl border-b-8 border-[#c5a059] active:translate-y-1 transition-all flex items-center justify-center gap-4"
          >
            {isSubmitting ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : '💾 Salvar Dossiê SDR'}
          </button>
          <button 
            type="button" 
            onClick={onCancel} 
            className="px-16 bg-white border-2 border-slate-200 text-slate-400 rounded-[2rem] font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all"
          >
            Descartar
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewLeadForm;
