
import React, { useState, useMemo } from 'react';
import { Lead, Interaction, InteractionType, MarketingHistory, AgendaEvent, User } from '../types';

interface Timeline360Props {
  lead: Lead;
  agendaEvents: AgendaEvent[];
  currentUser: User;
}

type UnifiedEvent = {
  id: string;
  type: InteractionType | 'MARKETING_TRACK' | 'AGENDA_EVENT';
  category: 'EMAIL' | 'CALL' | 'MEETING' | 'NOTE' | 'SYSTEM' | 'TRACK';
  title: string;
  content: string;
  date: string;
  author: string;
  status?: string;
  metadata?: any;
  scoreImpact?: number;
};

const Timeline360: React.FC<Timeline360Props> = ({ lead, agendaEvents, currentUser }) => {
  const [filter, setFilter] = useState<'ALL' | 'EMAIL' | 'MEETING' | 'TRACK' | 'NOTE'>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<UnifiedEvent | null>(null);

  const unifiedStream = useMemo(() => {
    const events: UnifiedEvent[] = [];

    lead.interactions.forEach(i => {
      events.push({
        id: i.id,
        type: i.type,
        category: (i.type === 'EMAIL' || i.type === 'WHATSAPP') ? 'EMAIL' : 
                  (i.type === 'CALL') ? 'CALL' : 
                  (i.type === 'MEETING') ? 'MEETING' : 'NOTE',
        title: i.title,
        content: i.content,
        date: i.date,
        author: i.author,
        status: i.deliveryStatus,
        scoreImpact: i.scoreImpact
      });
    });

    lead.marketingAutomation?.history.forEach(h => {
      events.push({
        id: h.id,
        type: 'MARKETING_TRACK',
        category: (h.action === 'EMAIL_SENT') ? 'EMAIL' : 'TRACK',
        title: h.action.replace('_', ' '),
        content: h.details,
        date: h.timestamp,
        author: 'Marketing Intelligence Hub',
        metadata: { action: h.action }
      });
    });

    const leadMeetings = agendaEvents.filter(e => e.leadId === lead.id);
    leadMeetings.forEach(m => {
      events.push({
        id: m.id,
        type: 'AGENDA_EVENT',
        category: 'MEETING',
        title: `Agendamento: ${m.title}`,
        content: `Reunião confirmada pelo consultor.`,
        date: m.start,
        author: 'Agenda Corporativa',
        status: m.status
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [lead, agendaEvents]);

  const filteredEvents = useMemo(() => {
    if (filter === 'ALL') return unifiedStream;
    return unifiedStream.filter(e => e.category === filter);
  }, [unifiedStream, filter]);

  const getIcon = (category: string, type: string) => {
    if (type === 'EMAIL_OPENED') return '👁️';
    if (type === 'LINK_CLICKED') return '🖱️';
    if (type === 'OPT_OUT') return '🛡️';
    switch (category) {
      case 'EMAIL': return '✉️';
      case 'CALL': return '📞';
      case 'MEETING': return '🤝';
      case 'TRACK': return '🛰️';
      default: return '📌';
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[3rem] overflow-hidden border border-slate-100 shadow-sm">
      <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex flex-wrap gap-3 items-center">
        <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest mr-4">Rastreabilidade 360º</h3>
        <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-inner">
           {['ALL', 'EMAIL', 'TRACK', 'MEETING', 'NOTE'].map(btn => (
             <button 
               key={btn}
               onClick={() => setFilter(btn as any)}
               className={`px-6 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${filter === btn ? 'bg-[#0a192f] text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
             >
               {btn === 'ALL' ? 'Tudo' : btn}
             </button>
           ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-12 relative custom-scrollbar">
        <div className="absolute left-[39px] top-10 bottom-10 w-0.5 bg-slate-100"></div>
        
        {filteredEvents.map((event, idx) => (
          <div key={`${event.id}-${idx}`} className="relative pl-16 animate-in fade-in slide-in-from-left-4 duration-500">
            <div className={`absolute left-0 top-0 w-12 h-12 rounded-2xl border-4 border-white shadow-xl flex items-center justify-center text-xl z-10 transition-transform hover:scale-110 cursor-pointer ${
              event.category === 'TRACK' ? 'bg-[#c5a059]' : 'bg-[#0a192f]'
            } text-white`}>
              {getIcon(event.category, event.metadata?.action || event.type)}
            </div>

            <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100 hover:border-[#c5a059] transition-all cursor-pointer group shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                   <span className="text-[8px] font-black uppercase text-indigo-500 tracking-widest mb-1 block">
                      {event.category} • {event.author}
                   </span>
                   <h4 className="text-sm font-black text-[#0a192f] serif-authority">{event.title}</h4>
                </div>
                <div className="text-right">
                   <p className="text-[10px] font-black text-slate-300 uppercase">{new Date(event.date).toLocaleDateString('pt-BR')}</p>
                   {event.scoreImpact && <span className="text-[9px] font-black text-emerald-500">+{event.scoreImpact} pts</span>}
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed italic line-clamp-2">"{event.content}"</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Timeline360;
