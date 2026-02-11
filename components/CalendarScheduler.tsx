
import React, { useState } from 'react';
import { Lead } from '../types';

interface CalendarSchedulerProps {
  lead: Lead;
  onSchedule: (meetingData: {
    title: string;
    description: string;
    dateTime: string;
    meetingLink: string;
    location: string;
  }) => void;
  onClose: () => void;
  isIntegrated: boolean;
}

const CalendarScheduler: React.FC<CalendarSchedulerProps> = ({ lead, onSchedule, onClose, isIntegrated }) => {
  const [title, setTitle] = useState(`Reunião: ${lead.company} / Ciatos CRM`);
  const [description, setDescription] = useState(`Apresentação comercial e alinhamento de expectativas.`);
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('Google Meet');
  const [isSendingInvites, setIsSendingInvites] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateTime) return;

    setIsSendingInvites(true);
    // Simulate API delay for calendar sync and invite sending
    setTimeout(() => {
      onSchedule({
        title,
        description,
        dateTime: new Date(dateTime).toLocaleString(),
        meetingLink: location === 'Google Meet' ? 'https://meet.google.com/xyz-abc-123' : 'N/A',
        location
      });
      setIsSendingInvites(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[600] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Agendar Reunião</h2>
              <p className="text-xs text-slate-500">Sincronizado com seu calendário corporativo</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isIntegrated ? (
          <div className="p-10 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-800">Calendário não conectado</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">Conecte sua conta do Google ou Outlook em Configurações para agendar reuniões.</p>
            <button onClick={onClose} className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold">Entendido</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Título da Reunião</label>
              <input 
                required 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Data e Hora</label>
                <input 
                  required 
                  type="datetime-local" 
                  value={dateTime}
                  onChange={e => setDateTime(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Local / Plataforma</label>
                <select 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Google Meet">Google Meet (Auto-link)</option>
                  <option value="Microsoft Teams">Teams</option>
                  <option value="Zoom">Zoom</option>
                  <option value="Presencial">Presencial (Sede Cliente)</option>
                  <option value="Escritório Ciatos">Nosso Escritório</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Descrição do Convite</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
              />
            </div>

            <div className="bg-indigo-50 p-3 rounded-lg flex gap-3 border border-indigo-100">
               <div className="shrink-0 text-indigo-600 mt-1">
                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
               </div>
               <p className="text-[10px] text-indigo-700 leading-normal">
                 Um convite de calendário será enviado automaticamente para <strong>{lead.email}</strong> com as informações acima.
               </p>
            </div>

            <div className="pt-4 flex gap-3">
              <button 
                type="submit" 
                disabled={isSendingInvites}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSendingInvites ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {isSendingInvites ? 'Enviando Convites...' : 'Agendar e Sincronizar'}
              </button>
              <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-bold hover:bg-slate-200 transition">Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CalendarScheduler;
