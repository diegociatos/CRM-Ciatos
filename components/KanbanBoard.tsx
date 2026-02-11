
import React, { useState, useMemo } from 'react';
import { Lead, KanbanPhase, UserRole, LeadStatus, User } from '../types';

interface KanbanBoardProps {
  leads: Lead[];
  phases: KanbanPhase[];
  onMoveLead: (leadId: string, targetPhaseId: string) => void;
  onSelectLead: (leadId: string) => void;
  role: UserRole;
  currentUserId: string;
  searchTerm: string;
  users: User[];
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({ 
  leads, 
  phases, 
  onMoveLead, 
  onSelectLead, 
  role,
  currentUserId,
  searchTerm,
  users
}) => {
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);

  // SDR pode atuar apenas nestas fases
  const sdrPhases = ['ph-qualificado', 'ph-remarcar', 'ph-agend'];

  const canMoveLeads = useMemo(() => {
    if (role === UserRole.ADMIN || role === UserRole.CLOSER || role === UserRole.MANAGER) return true;
    if (role === UserRole.SDR) return true;
    return false;
  }, [role]);

  const visiblePhases = useMemo(() => {
    if (role === UserRole.ADMIN || role === UserRole.SDR || role === UserRole.CLOSER || role === UserRole.MANAGER) return phases;
    if (role === UserRole.OPERATIONAL || role === UserRole.CS) return phases.filter(p => ['ph-fech'].includes(p.id));
    return phases;
  }, [phases, role]);

  const filteredLeads = useMemo(() => {
    // 1. Filtragem inicial (estão fora da fila de qualificação pendente)
    let boardLeads = leads.filter(l => !l.inQueue);

    // 2. LÓGICA DE EXCLUSIVIDADE PARA CONSULTORES
    if (role === UserRole.CLOSER) {
      boardLeads = boardLeads.filter(l => {
        // Fase de pool público (Lead Qualificado) - Todos Closers enxergam
        if (l.phaseId === 'ph-qualificado') return true;
        
        // Fases de negociação - Somente o dono enxerga
        // Se o lead já foi "puxado", ele some para os outros consultores
        return l.ownerId === currentUserId;
      });
    }
    
    // 3. Busca por termo
    if (!searchTerm.trim()) return boardLeads;
    const term = searchTerm.toLowerCase();
    return boardLeads.filter(l => 
      l.tradeName.toLowerCase().includes(term) || 
      l.cnpj.includes(term)
    );
  }, [leads, searchTerm, role, currentUserId]);

  const handleDragStart = (e: React.DragEvent, leadId: string, isRejected: boolean) => {
    if (isRejected || !canMoveLeads) {
      e.preventDefault();
      return;
    }
    setDraggedLeadId(leadId);
    e.dataTransfer.setData('leadId', leadId);
  };

  const handleDrop = (e: React.DragEvent, phaseId: string) => {
    e.preventDefault();
    if (!canMoveLeads) return;

    // Se for SDR, validar se a fase de destino é permitida
    if (role === UserRole.SDR && !['ph-qualificado', 'ph-remarcar', 'ph-agend'].includes(phaseId)) {
      alert("Permissão SDR: Você pode movimentar leads apenas no pool de qualificação ou agendamentos.");
      setDraggedLeadId(null);
      return;
    }

    const leadId = e.dataTransfer.getData('leadId');
    if (leadId) {
      onMoveLead(leadId, phaseId);
    }
    setDraggedLeadId(null);
  };

  const getTempColor = (val: number) => {
    switch (val) {
      case 1: return 'bg-slate-100 text-slate-400';
      case 2: return 'bg-cyan-50 text-cyan-600';
      case 3: return 'bg-amber-50 text-amber-600';
      case 4: return 'bg-orange-50 text-orange-600';
      case 5: return 'bg-rose-50 text-rose-600 border-rose-200';
      default: return 'bg-slate-50 text-slate-400';
    }
  };

  const getUserName = (id?: string) => users.find(u => u.id === id)?.name || '—';

  return (
    <div className="flex flex-col h-[calc(100vh-230px)] overflow-hidden">
      <div className="mb-4 flex gap-4">
        {role === UserRole.SDR && (
          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl flex items-center gap-3">
            <span className="text-sm">🛡️</span>
            <p className="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Modo SDR: Leads prontos para os Consultores.</p>
          </div>
        )}
        {role === UserRole.CLOSER && (
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl flex items-center gap-3">
            <span className="text-sm">🤝</span>
            <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">
              Dica: Ao mover um lead para 'Contato Inicial', ele se torna exclusivo da sua carteira.
            </p>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-x-auto pb-6 scroll-smooth pt-2">
        <div className="flex gap-8 h-full min-w-max px-4">
          {visiblePhases.sort((a,b) => a.order - b.order).map(phase => {
            const phaseLeads = filteredLeads.filter(l => l.phaseId === phase.id);
            const isTargetBlockedForSdr = role === UserRole.SDR && !['ph-qualificado', 'ph-remarcar', 'ph-agend'].includes(phase.id);
            
            return (
              <div 
                key={phase.id}
                onDragOver={(e) => canMoveLeads && e.preventDefault()}
                onDrop={(e) => handleDrop(e, phase.id)}
                className={`kanban-column w-80 rounded-[3rem] flex flex-col border shadow-inner overflow-hidden transition-all ${isTargetBlockedForSdr ? 'bg-slate-100 border-slate-200 opacity-60' : 'bg-white/40 border-slate-200'}`}
              >
                <div className="p-8 flex justify-between items-center border-b border-slate-100 bg-white/60">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full shadow-lg" style={{ backgroundColor: phase.color }}></div>
                    <h3 className="serif-authority text-sm font-black text-[#0a192f] uppercase tracking-widest">{phase.name}</h3>
                  </div>
                  <span className="bg-[#0a192f] px-3 py-1 rounded-full text-[10px] font-black text-white">{phaseLeads.length}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                  {phaseLeads.map(lead => {
                    const isRejected = [LeadStatus.REJECTED, LeadStatus.LOST].includes(lead.status);
                    const isDraggable = !isRejected && canMoveLeads;
                    const isOtherConsultantLead = lead.ownerId && lead.ownerId !== currentUserId && lead.phaseId !== 'ph-qualificado';

                    return (
                      <div 
                        key={lead.id}
                        draggable={isDraggable}
                        onDragStart={(e) => handleDragStart(e, lead.id, isRejected)}
                        onClick={() => onSelectLead(lead.id)}
                        className={`premium-card p-6 rounded-[2.5rem] border bg-white transition-all relative overflow-hidden ${draggedLeadId === lead.id ? 'opacity-30' : 'opacity-100'} ${isRejected ? 'border-red-100 bg-red-50/30' : 'border-slate-100 hover:border-[#c5a059]'} ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                      >
                        <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${lead.closeProbability >= 5 ? 'bg-rose-500' : lead.closeProbability >= 4 ? 'bg-orange-500' : lead.closeProbability >= 3 ? 'bg-amber-400' : lead.closeProbability >= 2 ? 'bg-cyan-400' : 'bg-slate-200'}`}></div>

                        <div className="flex justify-between items-start mb-4">
                           <span className="text-[8px] font-black uppercase bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg border border-indigo-100">{lead.size}</span>
                           <div className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase border ${getTempColor(lead.closeProbability)}`}>
                             <span>🔥</span> Temp {lead.closeProbability}
                           </div>
                        </div>
                        <h4 className="serif-authority font-bold text-sm text-[#0a192f] mb-1 line-clamp-1">{lead.tradeName}</h4>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">{lead.taxRegime}</p>
                        
                        <div className="space-y-2 mb-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                           <div className="flex items-center gap-2">
                              <span className="w-4 h-4 bg-indigo-100 text-indigo-600 rounded flex items-center justify-center text-[7px] font-black">Q</span>
                              <span className="text-[9px] text-slate-400 font-bold truncate">Qualificador: <span className="text-[#0a192f]">{getUserName(lead.qualifiedById)}</span></span>
                           </div>
                           <div className="flex items-center gap-2">
                              <span className="w-4 h-4 bg-amber-100 text-amber-600 rounded flex items-center justify-center text-[7px] font-black">A</span>
                              <span className="text-[9px] text-slate-400 font-bold truncate">Resgatado: <span className="text-[#0a192f]">{getUserName(lead.ownerId)}</span></span>
                           </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                           <div className="flex items-center gap-2">
                              <img className="w-6 h-6 rounded-full border border-white shadow-sm" src={`https://ui-avatars.com/api/?name=${encodeURIComponent(getUserName(lead.ownerId))}&background=0a192f&color=fff`} />
                              <span className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[80px]">{lead.city}</span>
                           </div>
                           <div className="text-right">
                             <p className="text-[9px] font-black text-indigo-600 uppercase">{lead.annualRevenue || 'S/F'}</p>
                             <p className="text-[7px] font-bold text-slate-300 uppercase">Faturamento Est.</p>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                  {phaseLeads.length === 0 && (
                    <div className="py-10 text-center opacity-10 flex flex-col items-center">
                      <div className="w-12 h-12 border-2 border-dashed border-slate-400 rounded-full mb-2"></div>
                      <p className="text-[10px] font-bold uppercase">Vazio</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default KanbanBoard;
