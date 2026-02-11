
import React, { useState, useMemo } from 'react';
import { Lead, SystemConfig, CompanySize } from '../types';

interface DigitalPresenceReportProps {
  leads: Lead[];
  config: SystemConfig;
  onSelectLead: (id: string) => void;
}

const DigitalPresenceReport: React.FC<DigitalPresenceReportProps> = ({ leads, config, onSelectLead }) => {
  const [filterPhase, setFilterPhase] = useState('all');
  const [filterSize, setFilterSize] = useState('all');
  const [filterSegment, setFilterSegment] = useState('');
  const [filterCity, setFilterCity] = useState('');

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      const matchPhase = filterPhase === 'all' || l.phaseId === filterPhase;
      const matchSize = filterSize === 'all' || l.size === filterSize;
      const matchSegment = !filterSegment || l.segment.toLowerCase().includes(filterSegment.toLowerCase());
      const matchCity = !filterCity || l.city.toLowerCase().includes(filterCity.toLowerCase());
      return matchPhase && matchSize && matchSegment && matchCity;
    });
  }, [leads, filterPhase, filterSize, filterSegment, filterCity]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    if (total === 0) return { linkedinDM: 0, instagramDM: 0, instagramCompany: 0, linkedinCompany: 0 };
    
    return {
      linkedinDM: (filteredLeads.filter(l => !!l.linkedinDM).length / total) * 100,
      instagramDM: (filteredLeads.filter(l => !!l.instagramDM).length / total) * 100,
      instagramCompany: (filteredLeads.filter(l => !!l.instagramCompany).length / total) * 100,
      linkedinCompany: (filteredLeads.filter(l => !!l.linkedinCompany).length / total) * 100,
    };
  }, [filteredLeads]);

  const exportCSV = () => {
    const headers = ['Empresa', 'Decisor', 'Contato', 'Fase', 'LinkedIn Decisor', 'Insta Decisor', 'LinkedIn Empresa', 'Insta Empresa'];
    const rows = filteredLeads.map(l => [
      l.tradeName,
      l.name,
      l.phone || l.email,
      config.phases.find(p => p.id === l.phaseId)?.name || 'N/A',
      l.linkedinDM ? 'Sim' : 'Não',
      l.instagramDM ? 'Sim' : 'Não',
      l.linkedinCompany ? 'Sim' : 'Não',
      l.instagramCompany ? 'Sim' : 'Não'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `presenca_digital_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const StatusIcon = ({ filled }: { filled?: boolean }) => (
    <div className="flex justify-center">
      {filled ? (
        <span className="text-emerald-500 text-lg" title="Preenchido">✔️</span>
      ) : (
        <span className="text-red-400 text-lg" title="Vazio">❌</span>
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Presença Digital</h1>
          <p className="text-slate-500 text-lg font-medium">Auditoria de engajamento social e mapeamento de perfis.</p>
        </div>
        <button 
          onClick={exportCSV}
          className="bg-[#0a192f] text-white px-8 py-4 rounded-2xl font-black uppercase text-xs shadow-2xl transition hover:bg-slate-800 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'LinkedIn Decisor', val: stats.linkedinDM },
          { label: 'Instagram Decisor', val: stats.instagramDM },
          { label: 'LinkedIn Empresa', val: stats.linkedinCompany },
          { label: 'Instagram Empresa', val: stats.instagramCompany }
        ].map(s => (
          <div key={s.label} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <div className="flex justify-between items-baseline">
              <p className="text-3xl font-black text-[#0a192f] serif-authority">{s.val.toFixed(1)}%</p>
              <p className="text-[10px] font-bold text-slate-300">COBERTURA</p>
            </div>
            <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#c5a059]" style={{ width: `${s.val}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Fase do Pipeline</label>
            <select value={filterPhase} onChange={e => setFilterPhase(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none">
              <option value="all">Todas as Fases</option>
              {config.phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Porte</label>
            <select value={filterSize} onChange={e => setFilterSize(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none">
              <option value="all">Todos os Portes</option>
              {Object.values(CompanySize).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Segmento</label>
            <input type="text" value={filterSegment} onChange={e => setFilterSegment(e.target.value)} placeholder="Filtrar segmento..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Cidade</label>
            <input type="text" value={filterCity} onChange={e => setFilterCity(e.target.value)} placeholder="Filtrar cidade..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[20%]">Empresa / Fase</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[15%]">Decisor</th>
                <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-[15%]">Contato</th>
                <th className="px-2 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">In DM</th>
                <th className="px-2 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Li DM</th>
                <th className="px-2 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">In Co</th>
                <th className="px-2 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Li Co</th>
                <th className="px-6 py-4 text-right w-[10%]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-bold text-[#0a192f] text-xs serif-authority">{lead.tradeName}</p>
                    <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest">
                      {config.phases.find(p => p.id === lead.phaseId)?.name || 'N/A'}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-xs font-bold text-slate-600">{lead.name}</td>
                  <td className="px-4 py-4">
                    <p className="text-[11px] font-bold text-slate-500">{lead.phone || lead.email}</p>
                    <p className="text-[9px] text-slate-300 uppercase font-bold">{lead.city} - {lead.state}</p>
                  </td>
                  <td className="px-2 py-4"><StatusIcon filled={!!lead.instagramDM} /></td>
                  <td className="px-2 py-4"><StatusIcon filled={!!lead.linkedinDM} /></td>
                  <td className="px-2 py-4"><StatusIcon filled={!!lead.instagramCompany} /></td>
                  <td className="px-2 py-4"><StatusIcon filled={!!lead.linkedinCompany} /></td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onSelectLead(lead.id)}
                      className="p-2 bg-slate-100 text-slate-400 rounded-lg hover:bg-[#0a192f] hover:text-white transition"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredLeads.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-slate-400 italic font-medium">Nenhum lead encontrado com os filtros aplicados.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DigitalPresenceReport;
