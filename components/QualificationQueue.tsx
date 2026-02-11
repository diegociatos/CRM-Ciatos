
import React, { useState, useMemo } from 'react';
import { Lead, LeadStatus, SystemConfig, User, UserRole } from '../types';

interface QualificationQueueProps {
  leads: Lead[];
  config: SystemConfig;
  onApprove: (leadId: string) => void;
  onUpdateLead: (lead: Lead) => void;
  onSelectLead: (leadId: string) => void;
  onOpenManualLead: () => void;
  currentUser: User;
  canEdit: boolean;
  canCreate?: boolean;
}

const QualificationQueue: React.FC<QualificationQueueProps> = ({ leads, config, onApprove, onUpdateLead, onSelectLead, onOpenManualLead, currentUser, canEdit, canCreate }) => {
  const [filterOwner, setFilterOwner] = useState<'all' | 'mine'>('all');

  const queueLeads = useMemo(() => {
    let filtered = leads.filter(l => l.inQueue);
    
    if (filterOwner === 'mine') {
      filtered = filtered.filter(l => l.ownerId === currentUser.id || !l.ownerId);
    }
    
    return filtered;
  }, [leads, filterOwner, currentUser.id]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Fila de Qualificação</h1>
          <p className="text-slate-500 text-base font-medium">Controle de entrada: Valide os contatos e decidores antes do comercial.</p>
        </div>
        
        <div className="flex gap-4">
          <div className="bg-slate-100 p-1 rounded-2xl border border-slate-200 flex shadow-inner">
             <button 
               onClick={() => setFilterOwner('all')}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterOwner === 'all' ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
             >
               Todos os Leads
             </button>
             <button 
               onClick={() => setFilterOwner('mine')}
               className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterOwner === 'mine' ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
             >
               Meus Leads
             </button>
          </div>

          {canCreate && (
            <button 
              onClick={onOpenManualLead} 
              className="bg-[#0a192f] text-white px-8 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:bg-slate-800 transition flex items-center gap-3 border-b-4 border-[#c5a059] active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              Novo Lead Manual
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest w-[25%]">Empresa / Contato Sede</th>
                <th className="px-6 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest w-[20%]">Porte / Faturamento</th>
                <th className="px-6 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest w-[25%]">Decisor Principal (Direto)</th>
                <th className="px-6 py-6 text-[11px] font-black text-slate-400 uppercase tracking-widest w-[15%] text-center">Status Fiscal</th>
                <th className="px-8 py-6 text-right text-[11px] font-black text-slate-400 uppercase tracking-widest w-[15%]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {queueLeads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-8 py-6">
                    <p className="font-bold text-[#0a192f] text-sm serif-authority">{lead.tradeName || lead.company}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{lead.cnpj || '—'}</p>
                    <div className="mt-3 space-y-1">
                       <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                         <span className="opacity-60 text-xs">📞</span> {lead.companyPhone || 'Sede não informada'}
                       </p>
                       <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5 truncate max-w-[200px]" title={lead.companyEmail}>
                         <span className="opacity-60 text-xs">📧</span> {lead.companyEmail || 'E-mail não localizado'}
                       </p>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <p className="text-xs font-bold text-slate-600">{lead.size}</p>
                    <p className="text-[10px] text-indigo-600 font-black uppercase tracking-tighter mt-1">{lead.annualRevenue || 'S/F'}</p>
                    <p className="text-[9px] text-slate-300 font-bold uppercase mt-2">{lead.taxRegime}</p>
                  </td>
                  <td className="px-6 py-6">
                    <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl group-hover:bg-white transition-colors shadow-sm">
                      <p className="text-xs font-black text-[#0a192f]">{lead.name || 'Decisor pendente'}</p>
                      <p className="text-[9px] text-[#c5a059] font-black uppercase tracking-widest mb-2">{lead.role || 'Sócio/Diretor'}</p>
                      
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black text-emerald-600 flex items-center gap-1.5">
                           <span className="text-xs">📱</span> {lead.phone || '—'}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 truncate max-w-[180px]" title={lead.email}>
                           <span className="text-xs opacity-60">✉️</span> {lead.email || '—'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-tighter border inline-block ${lead.debtStatus === 'Regular' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                       {lead.debtStatus}
                    </span>
                    <p className="text-[8px] text-slate-300 font-black uppercase mt-2">ICP FIT: {lead.icpScore}/5</p>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => onSelectLead(lead.id)} 
                        className="p-3 bg-slate-100 text-[#0a192f] rounded-2xl hover:bg-slate-200 transition shadow-sm group-hover:scale-110 active:scale-95" 
                        title="Ver e Editar Dossiê"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button 
                        onClick={() => onApprove(lead.id)} 
                        className="p-3 bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition active:scale-90 group-hover:scale-110" 
                        title="Aprovar para Comercial"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {queueLeads.length === 0 && (
          <div className="p-32 text-center flex flex-col items-center">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mb-8 border border-slate-100 shadow-inner">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-[#0a192f] font-bold text-2xl serif-authority mb-2">Tudo qualificado!</h3>
            <p className="text-slate-400 font-medium">Não há leads pendentes nesta visão. Use o Radar para prospectar novos.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QualificationQueue;
