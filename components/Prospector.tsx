
import React, { useState, useEffect, useMemo } from 'react';
import { CompanySize, MiningJob, MiningLead, Lead } from '../types';
import { MiningEngine } from '../services/miningService';
import WorkspaceEmpty from './WorkspaceEmpty';

interface ProspectorProps {
  organizationId:string;
  onGoAgent?:()=>void;
  onAddAsLead: (comp: any) => Promise<{ success: boolean; message: string }>;
  canImport: boolean;
  existingLeads: Lead[];
}

/** Converte um achado do Radar (dados da Receita + web) no formato de Lead do CRM. */
function miningParaLead(m: MiningLead): any {
  return {
    name: m.contactName && m.contactName !== 'Proprietário' ? m.contactName : (m.partners?.[0] || ''),
    email: '',
    phone: m.phone || m.phoneCompany || '',
    company: m.tradeName || m.name,
    tradeName: m.tradeName || m.name,
    legalName: m.name,
    cnpj: m.cnpj,
    cnpjRaw: m.cnpjRaw,
    companyEmail: m.emailCompany && m.emailCompany !== 'Não localizado' ? m.emailCompany : '',
    companyPhone: m.phoneCompany && m.phoneCompany !== 'Não localizado' ? m.phoneCompany : '',
    segment: m.segment,
    city: m.city,
    state: m.state,
    website: m.website,
    icpScore: m.scoreIa || m.icpScore || 3,
    debtStatus: m.debtStatus || 'Regular',
    detailedPartners: (m.partners || []).filter(p => p && p !== 'Não informado').map(p => ({ name: p, sharePercentage: '' })),
    notes: (m as any).reason || '',
    enriched: !!(m as any).verificadoReceita,
    inQueue: true,
    radarJobId: m.jobId,
  };
}

const Prospector: React.FC<ProspectorProps> =({ organizationId,onGoAgent,onAddAsLead, canImport, existingLeads }) => {
  const miningEngine=useMemo(()=>new MiningEngine(organizationId),[organizationId]);
  const [activeJobs, setActiveJobs] = useState<MiningJob[]>([]);
  const [showNewJobModal, setShowNewJobModal] = useState(false);
  const [inspectingJob, setInspectingJob] = useState<MiningJob | null>(null);
  const [jobLeads, setJobLeads] = useState<MiningLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingResults,setLoadingResults]=useState(false);
  const [resultError,setResultError]=useState('');

  const [newJob, setNewJob] = useState({
    listName: '',
    segmentName: '',
    state: '',
    city: '',
    size: 'all' as CompanySize | 'all',
    taxRegime: '',
    fiscalFilter: 'Indiferente' as 'Dívida Ativa' | 'Indiferente',
    targetCount: 100,
    autoCreateSegment: true,
    enrich: true
  });

  const [versaoLeads, setVersaoLeads] = useState(0);

  useEffect(() => {
    const load = () => {
      setActiveJobs([...miningEngine.getJobs()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setVersaoLeads(v => v + 1);
    };
    window.addEventListener('ciatos-mining-update', load);
    miningEngine.init();
    load();
    return () => {window.removeEventListener('ciatos-mining-update', load);miningEngine.dispose();};
  }, [miningEngine]);

  useEffect(() => {
    if (!inspectingJob)return;let active=true;setLoadingResults(true);setResultError('');setJobLeads([]);setSelectedLeads(new Set());
    miningEngine.loadLeads(inspectingJob.id).catch(()=>{if(active)setResultError('Não foi possível carregar os resultados. Feche e tente novamente.');}).finally(()=>{if(active)setLoadingResults(false);});
    return()=>{active=false;};
  }, [inspectingJob?.id,miningEngine]);

  useEffect(() => {
    if (inspectingJob) {
      const leads = miningEngine.getLeadsByJob(inspectingJob.id);
      const existingCnpjs = new Set(existingLeads.map(l => l.cnpjRaw));
      const filtered = leads.filter(l => !existingCnpjs.has(l.cnpjRaw));
      setJobLeads(filtered);
    }
  }, [inspectingJob, versaoLeads, existingLeads]);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJob.listName.trim()) return alert("Dê um nome para a lista.");
    if (!newJob.segmentName.trim()) return alert("Preencha o nome do segmento.");

    try {
      await miningEngine.createJob(newJob as any);
    } catch (err) {
      return alert(err instanceof Error ? err.message : 'Falha ao criar a busca.');
    }
    setShowNewJobModal(false);
    setNewJob({
      listName: '', segmentName: '', state: '', city: '', size: 'all',
      taxRegime: '',
      fiscalFilter: 'Indiferente', targetCount: 100,
      autoCreateSegment: true, enrich: true
    });
  };

  const handleBulkImport = async () => {
    if (selectedLeads.size === 0) return;
    setIsProcessing(true);
    const leadsToSend = jobLeads.filter(l => selectedLeads.has(l.id));
    let successCount = 0;

    const falhas: string[] = [];

    for (const lead of leadsToSend) {
       const r = await onAddAsLead(miningParaLead(lead));
       if (r.success) {
         successCount++;
         await miningEngine.markAsImported(lead.jobId, lead.cnpjRaw);
       } else {
         falhas.push(`${lead.tradeName}: ${r.message}`);
       }
    }

    setIsProcessing(false);
    setSelectedLeads(new Set());
    alert(`${successCount} leads importados.${falhas.length ? `\n\nNão importados:\n${falhas.join('\n')}` : ''}`);
  };

  const toggleAll = () => {
    if (selectedLeads.size === jobLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(jobLeads.map(l => l.id)));
    }
  };

  const handleExportCSV = () => {
    if (jobLeads.length === 0) return;

    const headers = ["Nome Fantasia", "CNPJ", "Telefone", "Email", "Socios", "Decisor", "Telefone Decisor", "Porte", "Regime"];
    const rows = jobLeads.map(l => [
      l.tradeName,
      l.cnpj,
      l.phoneCompany,
      l.emailCompany,
      l.partners.join("; "),
      l.contactName,
      l.contactPhone,
      l.size,
      l.taxRegime
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `radar_export_${inspectingJob?.name || 'leads'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const inputClass = "w-full bg-white border-2 border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-[#c5a059]";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Radar de Inteligência</h1>
          <p className="text-slate-500 text-lg font-medium">Crie listas de empresas por segmento e escolha a abrangência: cidade, estado ou Brasil inteiro.</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => setShowNewJobModal(true)}
            className="bg-[#0a192f] text-white px-10 py-4 rounded-[1.8rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl border-b-4 border-[#c5a059] hover:scale-105 transition-all"
          >
            🚀 Configurar Varredura
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-5 flex flex-wrap gap-4 justify-between"><div><h2 className="text-xl font-bold">Seu próximo passo pode ser automático</h2><p>Configure o Agente SDR para preparar os resultados pendentes, verificar e-mails no Snov.io e iniciar a cadência da empresa.</p><p className="text-sm text-slate-600 mt-2">Busca interrompida não apaga os resultados já encontrados. Você pode inspecionar ou retomar.</p></div>{onGoAgent&&<button className="btn-navy" onClick={onGoAgent}>Configurar agente</button>}</div>
      {activeJobs.length === 0 && <WorkspaceEmpty eyebrow="NENHUMA LISTA CRIADA" title="Comece por uma busca com objetivo claro." description="Dê um nome à lista, informe o segmento e escolha os filtros que realmente importam. Cidade, estado, porte e regime tributário são opcionais." steps={['Nomeie a lista e informe o público que quer alcançar.', 'Confira os resultados encontrados antes de importar.', 'Prepare os contatos e a cadência na Central da IA.']} action={{label:'Criar primeira lista',onClick:()=>setShowNewJobModal(true)}} secondary={onGoAgent?{label:'Conhecer o Agente SDR',onClick:onGoAgent}:undefined}/>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {activeJobs.map(job => (
          <div key={job.id} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-between min-h-[380px] hover:shadow-xl transition-all">
            <div>
              <div className="flex justify-between items-start mb-6">
                <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                  job.status === 'Running' ? 'bg-indigo-50 text-indigo-600 animate-pulse border border-indigo-100' :
                  job.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {({Running:'Buscando…',Failed:'Busca interrompida',Completed:'Concluída',Paused:'Pausada',Cancelled:'Cancelada'} as Record<string,string>)[job.status] || job.status}
                </span>
                <div className="flex gap-2">
                   {job.status === 'Running' ? (
                     <button onClick={() => miningEngine.controlJob(job.id, 'pause')} aria-label="Pausar busca" className="p-2 bg-slate-50 rounded-lg text-xs">⏸️</button>
                   ) : ['Paused','Failed'].includes(job.status) ? (
                     <button onClick={() => miningEngine.controlJob(job.id, 'resume')} aria-label="Retomar busca" className="p-2 bg-slate-50 rounded-lg text-xs">▶️</button>
                   ) : null}
                   <button onClick={() => {
                     if(confirm("Deseja excluir este radar e todos os seus resultados?")) {
                       miningEngine.deleteJob(job.id);
                     }
                   }} className="p-2 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition-colors" title="Excluir Radar">🗑️</button>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-[#0a192f] serif-authority mb-1">{job.name}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                {[job.filters.city, job.filters.state].filter(Boolean).join(' / ') || 'Brasil inteiro'}
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                <span className="bg-amber-50 text-[#c5a059] px-3 py-1 rounded-lg text-[9px] font-black uppercase border border-amber-100">{job.filters.size}</span>
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[9px] font-black uppercase border border-indigo-100">{job.filters.taxRegime || 'Todos os regimes'}</span>
              </div>

              <div className="space-y-4">
                 <div className="flex justify-between text-[10px] font-black uppercase text-slate-400">
                    <span>Leads Localizados</span>
                    <span>{job.foundCount} / {job.targetCount}</span>
                 </div>
                 <div className="w-full h-3 bg-slate-50 rounded-full border border-slate-100 overflow-hidden">
                    <div className="h-full bg-[#0a192f] transition-all duration-1000" style={{ width: `${Math.min(100, (job.foundCount/job.targetCount)*100)}%` }}></div>
                 </div>
              </div>
            </div>
            <button onClick={() => setInspectingJob(job)} className="w-full mt-10 py-4 bg-slate-50 text-[#0a192f] rounded-2xl font-black uppercase text-[10px] tracking-widest border border-slate-100 hover:bg-[#0a192f] hover:text-white transition-all">
              Inspecionar Resultados
            </button>
          </div>
        ))}
      </div>

      {showNewJobModal && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/90 backdrop-blur-md" onClick={() => setShowNewJobModal(false)}></div>
          <form onSubmit={handleCreateJob} className="relative bg-white w-full max-w-3xl rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
             <div className="p-10 bg-slate-50 border-b border-slate-100">
                <h2 className="text-4xl font-black text-[#0a192f] serif-authority tracking-tight">Definir busca de empresas</h2>
                <p className="text-slate-500 font-medium mt-2">Escolha o segmento. Estado, cidade e regime são opcionais.</p>
             </div>

             <div className="p-12 grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-6">
                   <div>
                      <label className={labelClass}>Nome da lista *</label>
                      <input required maxLength={100} className={inputClass} value={newJob.listName} onChange={e => setNewJob({...newJob, listName: e.target.value})} placeholder="Ex.: Parceiros contábeis · Brasil" />
                   </div>
                   <div>
                      <label className={labelClass}>Segmento Corporativo *</label>
                      <input required className={inputClass} value={newJob.segmentName} onChange={e => setNewJob({...newJob, segmentName: e.target.value})} placeholder="Ex: Metalúrgicas, Atacadistas..." />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Estado (opcional)</label>
                        <select aria-label="Estado (opcional)" className={inputClass} value={newJob.state} onChange={e => setNewJob({...newJob, state: e.target.value, city: ''})}><option value="">Brasil inteiro</option>{'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ').map(uf => <option key={uf} value={uf}>{uf}</option>)}</select>
                      </div>
                      <div>
                        <label className={labelClass}>Cidade (opcional)</label>
                        <input aria-label="Cidade (opcional)" placeholder="Todas as cidades" className={inputClass} value={newJob.city} onChange={e => setNewJob({...newJob, city: e.target.value})} />
                      </div>
                   </div>
                </div>

                <div className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Porte Estrito</label>
                        <select className={inputClass} value={newJob.size} onChange={e => setNewJob({...newJob, size: e.target.value as any})}>
                           <option value="all">Indiferente</option>
                           <option value={CompanySize.ME}>ME</option>
                           <option value={CompanySize.EPP}>EPP</option>
                           <option value={CompanySize.MEDIUM}>Médio</option>
                           <option value={CompanySize.LARGE}>Grande</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Regime de Tributação</label>
                        <select aria-label="Regime de tributação" className={inputClass} value={newJob.taxRegime} onChange={e => setNewJob({...newJob, taxRegime: e.target.value})}>
                           <option value="">Todos os regimes</option>
                           <option>Simples Nacional</option>
                           <option>Lucro Presumido</option>
                           <option>Lucro Real</option>
                        </select>
                      </div>
                   </div>
                   <div>
                      <label className={labelClass}>Meta de Captura</label>
                      <input type="number" min="10" max="500" className={inputClass} value={newJob.targetCount} onChange={e => setNewJob({...newJob, targetCount: parseInt(e.target.value)})} />
                   </div>
                </div>
             </div>

             <div className="p-12 border-t bg-slate-50 flex gap-6">
                <button type="submit" className="flex-1 py-6 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-xs tracking-[0.2em] shadow-2xl border-b-4 border-[#c5a059]">Iniciar busca</button>
                <button type="button" onClick={() => setShowNewJobModal(false)} className="px-12 py-6 bg-white border border-slate-200 text-slate-400 rounded-[2rem] font-black uppercase text-xs tracking-widest">Cancelar</button>
             </div>
          </form>
        </div>
      )}

      {inspectingJob && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm" onClick={() => !isProcessing && setInspectingJob(null)}></div>
          <div className="relative bg-white w-full max-w-[98vw] h-[95vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-12">
             <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <div>
                   <h2 className="text-3xl font-black text-[#0a192f] serif-authority">{inspectingJob.name}</h2>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Visualizando novos leads localizados.</p>
                </div>
                <div className="flex gap-4">
                    <button
                      onClick={handleExportCSV}
                      className="px-6 py-4 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                      <span>📊</span> EXPORTAR CSV
                    </button>
                   {selectedLeads.size > 0 && (
                    <button
                      disabled={isProcessing}
                      onClick={handleBulkImport}
                      className="px-10 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl disabled:opacity-50"
                    >
                      {isProcessing ? '⏳ TRANSMITINDO...' : `📥 MOVER ${selectedLeads.size} PARA QUALIFICAÇÃO`}
                    </button>
                   )}
                   <button disabled={isProcessing} onClick={() => setInspectingJob(null)} className="p-4 bg-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-[10px] tracking-widest">FECHAR</button>
                </div>
             </div>

             <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[1600px]">
                   <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-20">
                      <tr>
                         <th className="px-8 py-6 w-12 text-center">
                           <input type="checkbox" checked={selectedLeads.size === jobLeads.length && jobLeads.length > 0} onChange={toggleAll} className="w-5 h-5 rounded" />
                         </th>
                         <th className="px-4 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa / Porte / Regime</th>
                         <th className="px-4 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contatos Sede</th>
                         <th className="px-4 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">QSA / Sócios</th>
                         <th className="px-4 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Decisor Direto</th>
                         <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Ação</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {jobLeads.map(lead => (
                        <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                           <td className="px-8 py-6 text-center">
                             <input
                              type="checkbox"
                              checked={selectedLeads.has(lead.id)}
                              onChange={(e) => {
                                const next = new Set(selectedLeads);
                                if (e.target.checked) next.add(lead.id); else next.delete(lead.id);
                                setSelectedLeads(next);
                              }}
                              className="w-5 h-5 rounded"
                             />
                           </td>
                           <td className="px-4 py-6">
                              <p className="text-sm font-bold text-[#0a192f] serif-authority leading-tight">{lead.tradeName}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[9px] font-mono text-slate-400 uppercase">{lead.cnpj}</span>
                                {(lead as any).porteReceita && <span className="text-[8px] bg-amber-50 px-1.5 rounded text-amber-600 font-bold uppercase">{(lead as any).porteReceita}</span>}
                                {(lead as any).simplesNacional != null && <span className="text-[8px] bg-indigo-50 px-1.5 rounded text-indigo-600 font-bold uppercase">{(lead as any).simplesNacional ? 'Simples' : 'Fora do Simples'}</span>}
                                {(lead as any).verificadoReceita && <span className="text-[8px] bg-emerald-50 px-1.5 rounded text-emerald-600 font-bold uppercase" title="CNPJ ativo confirmado na Receita Federal">✓ Receita</span>}
                              </div>
                           </td>
                           <td className="px-4 py-6 text-xs font-bold text-slate-600 space-y-1">
                              <p>📞 {lead.phoneCompany}</p>
                              <p className="text-slate-400 text-[10px]">📧 {lead.emailCompany}</p>
                           </td>
                           <td className="px-4 py-6">
                              <div className="flex flex-wrap gap-1 max-w-[300px]">
                                {lead.partners.map((p, i) => (
                                  <span key={i} className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{p}</span>
                                ))}
                              </div>
                           </td>
                           <td className="px-4 py-6">
                              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                 <p className="text-[11px] font-black text-[#0a192f]">{lead.contactName}</p>
                                 <p className="text-[9px] font-black text-emerald-600 mt-0.5">{lead.contactPhone}</p>
                              </div>
                           </td>
                           <td className="px-8 py-6 text-right">
                              <button
                                onClick={async () => {
                                   const r = await onAddAsLead(miningParaLead(lead));
                                   if (r.success) {
                                      await miningEngine.markAsImported(lead.jobId, lead.cnpjRaw);
                                   } else {
                                      alert(r.message);
                                   }
                                }}
                                className="px-6 py-2 bg-[#0a192f] text-white rounded-xl text-[9px] font-black uppercase hover:scale-105 transition-all"
                              >
                                Triagem
                              </button>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
                {loadingResults ? <p role="status" className="p-8">Carregando resultados…</p> : resultError ? <p role="alert" className="p-8 text-red-700">{resultError}</p> : jobLeads.length === 0 && (
                   <div className="py-40 text-center opacity-30 flex flex-col items-center">
                      <div className="text-6xl mb-6">🎯</div>
                      <p className="text-3xl font-bold serif-authority">Nenhum resultado pendente.</p>
                   </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Prospector;
