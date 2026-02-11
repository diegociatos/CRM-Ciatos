
import React, { useState } from 'react';
import { Lead, LeadStatus, User } from '../types';

interface PublicSchedulerProps {
  lead: Lead;
  onConfirm: (leadId: string, date: string, time: string) => void;
  onClose: () => void;
  closers: User[];
}

const PublicScheduler: React.FC<PublicSchedulerProps> = ({ lead, onConfirm, onClose, closers }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const timeSlots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

  const handleConfirm = () => {
    if (!selectedDate || !selectedTime) return;
    setIsSubmitting(true);
    
    // Simulação de processamento de API
    setTimeout(() => {
      onConfirm(lead.id, selectedDate, selectedTime);
      setIsSubmitting(false);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <div className="bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col md:flex-row">
        
        {/* Lado Esquerdo: Info da Banca */}
        <div className="w-full md:w-80 bg-[#0a192f] p-12 text-white flex flex-col justify-between relative overflow-hidden">
           <div className="absolute top-0 left-0 w-full h-full bg-[#c5a059]/5 opacity-20 pointer-events-none"></div>
           <div className="relative z-10">
              <div className="w-16 h-16 bg-[#c5a059] rounded-2xl flex items-center justify-center text-2xl font-black serif-authority mb-10 shadow-xl">CI</div>
              <h2 className="text-3xl font-black serif-authority tracking-tight mb-4">Agendamento Estratégico</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Olá, <span className="text-white font-bold">{lead.name}</span>. <br/>
                Reserve 30 minutos para apresentarmos o diagnóstico fiscal planejado para a <span className="text-[#c5a059] font-bold">{lead.tradeName}</span>.
              </p>
           </div>
           <div className="mt-12 space-y-6 relative z-10">
              <div className="flex items-center gap-4 text-xs font-medium text-slate-300">
                 <span className="text-xl">🤝</span> Reunião Diagnóstica
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-300">
                 <span className="text-xl">💻</span> Google Meet (Auto-Link)
              </div>
           </div>
        </div>

        {/* Lado Direito: Seleção de Data/Hora */}
        <div className="flex-1 p-12 space-y-10 bg-slate-50/30">
           {!isSubmitting ? (
             <>
               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">01. Escolha uma Data</label>
                  <input 
                    type="date" 
                    className="w-full bg-white border-2 border-slate-100 rounded-2xl px-6 py-4 font-bold text-slate-700 outline-none focus:border-[#c5a059] shadow-sm transition-all"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                  />
               </div>

               <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4">02. Horários Disponíveis</label>
                  <div className="grid grid-cols-3 gap-3">
                     {timeSlots.map(time => (
                       <button 
                         key={time} 
                         onClick={() => setSelectedTime(time)}
                         className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${selectedTime === time ? 'bg-[#0a192f] text-white border-[#0a192f] shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                       >
                         {time}
                       </button>
                     ))}
                  </div>
               </div>

               <div className="pt-8 border-t border-slate-100 flex gap-4">
                  <button 
                    disabled={!selectedDate || !selectedTime}
                    onClick={handleConfirm}
                    className="flex-1 py-6 bg-[#c5a059] text-white rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-2xl border-b-4 border-[#b08d4b] active:translate-y-1 transition-all disabled:opacity-50"
                  >
                    Confirmar Agendamento
                  </button>
                  <button onClick={onClose} className="px-10 py-6 bg-white text-slate-300 rounded-[2rem] font-black uppercase text-[10px] border border-slate-100">Cancelar</button>
               </div>
             </>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 border-4 border-slate-100 border-t-[#c5a059] rounded-full animate-spin"></div>
                <h3 className="text-2xl font-bold text-[#0a192f] serif-authority">Sincronizando com Consultor...</h3>
                <p className="text-slate-400 text-sm max-w-xs">Aguarde enquanto geramos o link exclusivo da sua reunião.</p>
             </div>
           )}
        </div>

      </div>
    </div>
  );
};

export default PublicScheduler;
