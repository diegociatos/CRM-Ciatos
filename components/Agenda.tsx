
import React, { useState, useMemo } from 'react';
import { AgendaEvent, Lead, User, SystemConfig, Participant, TaskType, UserRole } from '../types';

interface AgendaProps {
  events: AgendaEvent[];
  leads: Lead[];
  users: User[];
  currentUser: User;
  config: SystemConfig;
  onSaveEvent: (event: AgendaEvent) => void;
  onDeleteEvent: (id: string) => void;
  onSelectLead: (id: string) => void;
}

const Agenda: React.FC<AgendaProps> = ({ events, leads, users, currentUser, config, onSaveEvent, onDeleteEvent, onSelectLead }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [formData, setFormData] = useState<Partial<AgendaEvent>>({});
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const selectedType = useMemo(() => 
    config.taskTypes.find(t => t.id === formData.typeId),
    [config.taskTypes, formData.typeId]
  );

  const isMeeting = useMemo(() => 
    selectedType?.name.toLowerCase().includes('reunião') || false,
    [selectedType]
  );

  const myEvents = useMemo(() => {
    if (currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER) {
      return events;
    }
    return events.filter(e => e.assignedToId === currentUser.id || e.creatorId === currentUser.id);
  }, [events, currentUser]);

  const dayEvents = useMemo(() => {
    const dStr = selectedDay.toISOString().split('T')[0];
    return myEvents.filter(e => e.start.startsWith(dStr));
  }, [selectedDay, myEvents]);

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= lastDate; i++) days.push(new Date(year, month, i));
    return days;
  }, [currentDate]);

  const openModal = (event?: AgendaEvent) => {
    if (event) {
      setFormData(event);
      setSelectedParticipantIds(event.participants.map(p => p.userId));
    } else {
      const dStr = selectedDay.toISOString().split('T')[0];
      const tStr = new Date().toTimeString().slice(0, 5);
      const defaultType = config.taskTypes[0];
      
      setFormData({
        title: '',
        start: `${dStr}T${tStr}`,
        typeId: defaultType?.id || '',
        description: defaultType?.template || '',
        leadId: '',
        assignedToId: currentUser.id 
      });
      setSelectedParticipantIds([]);
    }
    setShowCreateModal(true);
  };

  const handleTypeChange = (typeId: string) => {
    const type = config.taskTypes.find(t => t.id === typeId);
    const lead = leads.find(l => l.id === formData.leadId);
    
    let processedTemplate = type?.template || '';
    if (lead) {
      processedTemplate = processedTemplate
        .replace(/{{nome}}/g, lead.name)
        .replace(/{{empresa}}/g, lead.tradeName);
    }

    setFormData({
      ...formData,
      typeId,
      description: processedTemplate,
      title: `${type?.name}: ${lead?.tradeName || 'Novo Compromisso'}`,
      // Se não for reunião, volta para o currentUser automaticamente
      assignedToId: !type?.name.toLowerCase().includes('reunião') ? currentUser.id : formData.assignedToId
    });
    
    if (!type?.name.toLowerCase().includes('reunião')) {
      setSelectedParticipantIds([]);
    }
  };

  const handleLeadChange = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    const type = config.taskTypes.find(t => t.id === formData.typeId);
    
    let processedTemplate = type?.template || '';
    if (lead) {
      processedTemplate = processedTemplate
        .replace(/{{nome}}/g, lead.name)
        .replace(/{{empresa}}/g, lead.tradeName);
    }

    setFormData({
      ...formData,
      leadId,
      description: processedTemplate,
      title: lead ? `${type?.name || 'Atividade'}: ${lead.tradeName}` : formData.title
    });
  };

  const toggleParticipant = (userId: string) => {
    setSelectedParticipantIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSave = () => {
    if (!formData.title || !formData.start || !formData.typeId) {
      alert("Por favor, preencha os campos obrigatórios.");
      return;
    }
    const type = config.taskTypes.find(t => t.id === formData.typeId);
    
    const eventToSave: AgendaEvent = {
      ...formData,
      id: formData.id || `evt-${Date.now()}`,
      assignedToId: isMeeting ? (formData.assignedToId || currentUser.id) : currentUser.id,
      creatorId: currentUser.id, 
      department: currentUser.department,
      status: 'Confirmado',
      type: type?.name || 'Geral',
      participants: isMeeting ? selectedParticipantIds.map(id => ({ userId: id, status: 'pending' })) : []
    } as AgendaEvent;

    onSaveEvent(eventToSave);
    setShowCreateModal(false);
  };

  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3.5 font-bold text-[#0a192f] outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="space-y-8 animate-in fade-in duration-500 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm shrink-0">
        <div className="flex items-center gap-8">
          <h1 className="text-4xl font-black text-[#0a192f] serif-authority">Agenda Corporativa</h1>
          <div className="flex items-center bg-slate-50 rounded-2xl p-1 border border-slate-100">
            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-3 text-slate-400 hover:text-[#0a192f]">←</button>
            <span className="px-6 font-bold text-[#0a192f] min-w-[180px] text-center capitalize">
              {currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-3 text-slate-400 hover:text-[#0a192f]">→</button>
          </div>
        </div>
        <button onClick={() => openModal()} className="bg-[#0a192f] text-white px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest border-b-4 border-[#c5a059] shadow-xl active:translate-y-1 transition-all">
          + Novo Agendamento
        </button>
      </div>

      <div className="flex gap-8 flex-1 overflow-hidden">
        <div className="flex-1 bg-white rounded-[3rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 bg-slate-50/50 border-b border-slate-100">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map(d => (
              <div key={d} className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 flex-1 divide-x divide-y divide-slate-50">
            {calendarDays.map((day, idx) => {
              const isToday = day?.toDateString() === new Date().toDateString();
              const isSelected = day?.toDateString() === selectedDay.toDateString();
              const dStr = day?.toISOString().split('T')[0];
              const dayTasks = day ? myEvents.filter(e => e.start.startsWith(dStr!)) : [];

              return (
                <div 
                  key={idx} 
                  onClick={() => day && setSelectedDay(day)}
                  className={`p-4 transition-all cursor-pointer relative group flex flex-col ${day ? 'bg-white hover:bg-slate-50/50' : 'bg-slate-50/10'} ${isSelected ? 'ring-2 ring-inset ring-[#c5a059] bg-amber-50/20' : ''}`}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-black w-7 h-7 flex items-center justify-center rounded-lg mb-2 ${isToday ? 'bg-[#0a192f] text-white shadow-lg' : isSelected ? 'text-[#c5a059]' : 'text-slate-400'}`}>
                        {day.getDate()}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {dayTasks.slice(0, 5).map(t => (
                          <div key={t.id} className="w-1.5 h-1.5 rounded-full bg-[#0a192f]"></div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-96 bg-white rounded-[3rem] border border-slate-100 shadow-sm flex flex-col overflow-hidden">
           <div className="p-8 border-b border-slate-100 bg-slate-50/50">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Compromissos</p>
              <h3 className="text-2xl font-black text-[#0a192f] serif-authority">{selectedDay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</h3>
           </div>
           <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {dayEvents.map(event => (
                  <div key={event.id} onClick={() => openModal(event)} className="p-5 bg-white border border-slate-100 rounded-[2rem] hover:border-[#c5a059] transition-all cursor-pointer shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[9px] font-black uppercase text-[#c5a059] tracking-widest">{event.type}</span>
                        <span className="text-[10px] font-bold text-slate-400">{event.start.split('T')[1]}</span>
                    </div>
                    <h4 className="font-bold text-[#0a192f] text-sm serif-authority">{event.title}</h4>
                    <p className="text-[10px] text-slate-400 mt-2">Dono: {users.find(u => u.id === event.assignedToId)?.name}</p>
                    {event.participants.length > 0 && (
                      <div className="mt-3 flex -space-x-2">
                        {event.participants.map(p => {
                          const u = users.find(user => user.id === p.userId);
                          return <img key={p.userId} src={u?.avatar} title={u?.name} className="w-6 h-6 rounded-full border-2 border-white" />;
                        })}
                      </div>
                    )}
                  </div>
              ))}
              {dayEvents.length === 0 && <p className="py-20 text-center text-slate-300 italic text-sm">Sem eventos.</p>}
           </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0a192f]/95 backdrop-blur-md" onClick={() => setShowCreateModal(false)}></div>
          <div className="relative bg-white w-full max-w-4xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col">
             <div className="p-10 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h2 className="text-3xl font-black text-[#0a192f] serif-authority">{formData.id ? 'Editar Atividade' : 'Agendar Atividade'}</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-2xl text-slate-300">✕</button>
             </div>
             <div className="p-10 space-y-8 overflow-y-auto custom-scrollbar">
                <div className={`grid grid-cols-1 ${isMeeting ? 'md:grid-cols-2' : ''} gap-8`}>
                  <div className="space-y-6">
                    <div>
                      <label className={labelClass}>Tipo de Atividade *</label>
                      <select className={inputClass} value={formData.typeId} onChange={e => handleTypeChange(e.target.value)}>
                        <option value="">Selecionar tipo...</option>
                        {config.taskTypes.map(t => (
                          <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Vínculo de Lead</label>
                      <select className={inputClass} value={formData.leadId} onChange={e => handleLeadChange(e.target.value)}>
                        <option value="">Nenhum</option>
                        {leads.map(l => <option key={l.id} value={l.id}>{l.tradeName}</option>)}
                      </select>
                    </div>
                    {isMeeting && (
                      <div>
                        <label className={labelClass}>Consultor Responsável</label>
                        <select className={inputClass} value={formData.assignedToId} onChange={e => setFormData({...formData, assignedToId: e.target.value})}>
                          {users.filter(u => u.role === UserRole.CLOSER || u.role === UserRole.ADMIN || u.role === UserRole.MANAGER).map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className={labelClass}>Horário Agendado</label>
                      <input type="datetime-local" className={inputClass} value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
                    </div>
                  </div>

                  {isMeeting && (
                    <div className="space-y-6">
                      <div>
                         <label className={labelClass}>Participantes Adicionais (Gestores/Operação)</label>
                         <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                            {users.filter(u => u.id !== (formData.assignedToId || currentUser.id)).map(user => (
                              <div 
                                key={user.id} 
                                onClick={() => toggleParticipant(user.id)}
                                className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all ${selectedParticipantIds.includes(user.id) ? 'bg-[#0a192f] text-white shadow-lg' : 'hover:bg-white'}`}
                              >
                                 <img src={user.avatar} className="w-8 h-8 rounded-full border border-slate-200" />
                                 <div className="flex-1">
                                    <p className="text-xs font-bold">{user.name}</p>
                                    <p className={`text-[8px] uppercase font-black ${selectedParticipantIds.includes(user.id) ? 'text-[#c5a059]' : 'text-slate-400'}`}>{user.role}</p>
                                 </div>
                                 {selectedParticipantIds.includes(user.id) && <span className="text-emerald-400">✓</span>}
                              </div>
                            ))}
                         </div>
                      </div>
                      <div>
                        <label className={labelClass}>Título da Tarefa</label>
                        <input className={inputClass} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Call Diagnóstica" />
                      </div>
                    </div>
                  )}

                  {!isMeeting && (
                    <div>
                      <label className={labelClass}>Título da Tarefa</label>
                      <input className={inputClass} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Retorno de ligação" />
                    </div>
                  )}
                </div>
                <div>
                   <label className={labelClass}>Notas e Script de Abordagem</label>
                   <textarea className={`${inputClass} h-32 resize-none`} placeholder="Notas do agendamento..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
             </div>
             <div className="p-10 bg-slate-50 border-t">
                <button onClick={handleSave} className="w-full py-5 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all">
                  {isMeeting ? 'Confirmar Agendamento e Notificar Time' : 'Salvar Atividade'}
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agenda;
