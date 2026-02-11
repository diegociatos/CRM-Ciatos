
import React, { useState, useMemo } from 'react';
import { Lead, LeadStatus, CompanySize, Interaction, LeadFilters, SmartList, CalendarConfig } from '../types';
import LeadDetails from './LeadDetails';

interface LeadsManagerProps {
  leads: Lead[];
  smartLists: SmartList[];
  onAddLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'interactions'>) => void;
  onUpdateLead: (lead: Lead) => void;
  onDeleteLead: (id: string) => void;
  onAddInteraction: (leadId: string, interaction: Omit<Interaction, 'id' | 'date'>) => void;
  onEnrichLead: (id: string, enrichmentData: Partial<Lead>) => Promise<void>;
  onSaveSmartList: (list: Omit<SmartList, 'id' | 'createdAt'>) => void;
  onDeleteSmartList: (id: string) => void;
  onScheduleMeeting: (leadId: string, meetingData: any) => void;
  calendarConfig: CalendarConfig;
  onOpenDiscussion: (leadId: string) => void;
}

const LeadsManager: React.FC<LeadsManagerProps> = ({ 
  leads, 
  smartLists,
  onAddLead, 
  onUpdateLead, 
  onDeleteLead, 
  onAddInteraction, 
  onEnrichLead,
  onSaveSmartList,
  onDeleteSmartList,
  onScheduleMeeting,
  calendarConfig,
  onOpenDiscussion
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showSmartListModal, setShowSmartListModal] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<LeadFilters>({
    status: [],
    size: [],
    segment: '',
    location: '',
    hasInteractions: 'any'
  });

  const [formData, setFormData] = useState<Omit<Lead, 'id' | 'createdAt' | 'interactions'>>({
    name: '',
    email: '',
    phone: '',
    company: '',
    segment: '',
    size: CompanySize.ME,
    revenue: '',
    status: LeadStatus.NEW,
    activeAutomations: []
  });

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchStatus = filters.status.length === 0 || filters.status.includes(lead.status);
      const matchSize = filters.size.length === 0 || filters.size.includes(lead.size);
      const matchSegment = !filters.segment || lead.segment.toLowerCase().includes(filters.segment.toLowerCase());
      const matchLocation = !filters.location || (lead.location || '').toLowerCase().includes(filters.location.toLowerCase());
      
      let matchInteractions = true;
      if (filters.hasInteractions === 'none') matchInteractions = lead.interactions.length === 0;
      if (filters.hasInteractions === 'recent') {
        const last = lead.interactions[0];
        if (!last) matchInteractions = false;
        else {
          const diff = Date.now() - new Date(last.date).getTime();
          matchInteractions = diff < (7 * 24 * 60 * 60 * 1000); // 7 days
        }
      }
      if (filters.hasInteractions === 'old') {
        const last = lead.interactions[0];
        if (!last) matchInteractions = true;
        else {
          const diff = Date.now() - new Date(last.date).getTime();
          matchInteractions = diff > (30 * 24 * 60 * 60 * 1000); // 30 days
        }
      }

      return matchStatus && matchSize && matchSegment && matchLocation && matchInteractions;
    });
  }, [leads, filters]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      const existing = leads.find(l => l.id === isEditing);
      if (existing) {
        onUpdateLead({ ...existing, ...formData });
      }
    } else {
      onAddLead(formData);
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '', email: '', phone: '', company: '', segment: '',
      size: CompanySize.ME, revenue: '', status: LeadStatus.NEW, activeAutomations: []
    });
    setIsEditing(null);
    setShowModal(false);
  };

  const applySmartList = (list: SmartList) => {
    setFilters(list.filters);
    setShowFilters(true);
  };

  const toggleFilter = <T,>(list: T[], item: T): T[] => 
    list.includes(item) ? list.filter(i => i !== item) : [...list, item];

  const [smartListName, setSmartListName] = useState('');
  const handleSaveSmartList = () => {
    if (!smartListName) return;
    onSaveSmartList({ name: smartListName, filters });
    setSmartListName('');
    setShowSmartListModal(false);
  };

  const selectedLead = leads.find(l => l.id === selectedLeadId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leads e Clientes</h1>
          <p className="text-slate-500">Gerencie seu portfólio com segmentação inteligente.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 font-bold border ${showFilters ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Segmentação {showFilters ? 'Ativa' : ''}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition flex items-center gap-2 font-bold shadow-lg shadow-indigo-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar Lead
          </button>
        </div>
      </div>

      {/* Advanced Filters Section */}
      {showFilters && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              Filtros Avançados
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setFilters({ status: [], size: [], segment: '', location: '', hasInteractions: 'any' })} className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase">Limpar Todos</button>
              <button onClick={() => setShowSmartListModal(true)} className="text-xs text-indigo-600 hover:underline font-bold uppercase">Salvar como Lista Inteligente</button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Status</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(LeadStatus).map(s => (
                  <button 
                    key={s} 
                    onClick={() => setFilters({...filters, status: toggleFilter(filters.status, s)})}
                    className={`text-[10px] font-bold px-2 py-1 rounded border transition ${filters.status.includes(s) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Porte</label>
              <div className="flex flex-wrap gap-2">
                {Object.values(CompanySize).map(s => (
                  <button 
                    key={s} 
                    onClick={() => setFilters({...filters, size: toggleFilter(filters.size, s)})}
                    className={`text-[10px] font-bold px-2 py-1 rounded border transition ${filters.size.includes(s) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Localização / Segmento</label>
              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="Filtrar segmento..." 
                  value={filters.segment}
                  onChange={e => setFilters({...filters, segment: e.target.value})}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
                <input 
                  type="text" 
                  placeholder="Filtrar localização..." 
                  value={filters.location}
                  onChange={e => setFilters({...filters, location: e.target.value})}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Interação</label>
              <select 
                value={filters.hasInteractions}
                onChange={e => setFilters({...filters, hasInteractions: e.target.value as any})}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
              >
                <option value="any">Qualquer histórico</option>
                <option value="none">Sem interações</option>
                <option value="recent">Últimos 7 dias</option>
                <option value="old">Mais de 30 dias sem contato</option>
              </select>
            </div>
          </div>

          {smartLists.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-100">
               <label className="text-[10px] font-bold text-slate-400 uppercase block mb-3">Minhas Listas Inteligentes</label>
               <div className="flex flex-wrap gap-2">
                 {smartLists.map(list => (
                   <div key={list.id} className="group relative">
                     <button 
                       onClick={() => applySmartList(list)}
                       className="text-xs bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-500 hover:text-indigo-600 transition font-medium flex items-center gap-2"
                     >
                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                       {list.name}
                     </button>
                     <button 
                       onClick={() => onDeleteSmartList(list.id)}
                       className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm text-[8px]"
                     >
                       ×
                     </button>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Empresa / Contato</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Segmento</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Porte / Faturamento</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLeads.map((lead) => (
                <tr 
                  key={lead.id} 
                  onClick={() => setSelectedLeadId(lead.id)}
                  className="hover:bg-indigo-50/30 transition cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition">{lead.company}</div>
                       {lead.enriched && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Enriquecido"></span>}
                    </div>
                    <div className="text-sm text-slate-500">{lead.name} • {lead.email}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-700">{lead.segment}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">{lead.size}</div>
                    <div className="text-xs text-slate-500">{lead.revenue}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      lead.status === LeadStatus.WON ? 'bg-green-100 text-green-700' :
                      lead.status === LeadStatus.LOST ? 'bg-red-100 text-red-700' :
                      lead.status === LeadStatus.NEW ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLeadId(lead.id); // Abre direto para o fluxo de enriquecimento no detalhe
                        }}
                        className="p-1.5 text-slate-400 hover:text-yellow-600 hover:bg-white rounded transition"
                      >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowModal(true); setIsEditing(lead.id); setFormData(lead); }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded transition"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5M18.364 5.636a9 9 0 0112.728 12.728L5.5 17" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLeads.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                    Nenhum lead encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLead && (
        <LeadDetails 
          lead={selectedLead} 
          onClose={() => setSelectedLeadId(null)} 
          onAddInteraction={onAddInteraction}
          onEnrich={onEnrichLead}
          onScheduleMeeting={onScheduleMeeting}
          onUpdateLead={onUpdateLead}
          calendarConfig={calendarConfig}
          onOpenDiscussion={onOpenDiscussion}
        />
      )}

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[400] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Editar Lead' : 'Adicionar Novo Lead'}</h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Nome do Contato</label>
                <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">E-mail</label>
                <input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Telefone</label>
                <input type="text" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Empresa</label>
                <input required type="text" value={formData.company} onChange={(e) => setFormData({...formData, company: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Segmento</label>
                <input type="text" value={formData.segment} onChange={(e) => setFormData({...formData, segment: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Porte</label>
                <select value={formData.size} onChange={(e) => setFormData({...formData, size: e.target.value as CompanySize})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none">
                  {Object.values(CompanySize).map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Faturamento Est.</label>
                <input type="text" value={formData.revenue} onChange={(e) => setFormData({...formData, revenue: e.target.value})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase">Status</label>
                <select value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value as LeadStatus})} className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none">
                  {Object.values(LeadStatus).map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="md:col-span-2 mt-4 flex gap-3">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">
                  {isEditing ? 'Salvar Alterações' : 'Criar Lead'}
                </button>
                <button type="button" onClick={resetForm} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSmartListModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[500] flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
             <h2 className="text-lg font-bold text-slate-800 mb-4">Nova Lista Inteligente</h2>
             <p className="text-xs text-slate-500 mb-4">Esta lista salvará seus filtros atuais para uso posterior em campanhas de e-mail.</p>
             <input 
               type="text" 
               placeholder="Nome da Lista (ex: EPPs sem Contato)"
               value={smartListName}
               onChange={e => setSmartListName(e.target.value)}
               className="w-full border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
             />
             <div className="flex gap-3">
                <button onClick={handleSaveSmartList} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold">Salvar</button>
                <button onClick={() => setShowSmartListModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-lg font-bold">Cancelar</button>
             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default LeadsManager;
