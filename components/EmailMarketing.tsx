
import React, { useState, useMemo } from 'react';
import { Lead, EmailTemplate, SmartList, SystemConfig } from '../types';

interface EmailMarketingProps {
  leads: Lead[];
  templates: EmailTemplate[];
  smartLists: SmartList[];
  config: SystemConfig; // Adicionado config
  onSaveTemplate: (tpl: EmailTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  onLogEmailSend: (leadId: string, subject: string, content: string) => void;
}

const EmailMarketing: React.FC<EmailMarketingProps> = ({ leads, templates, smartLists, config, onSaveTemplate, onDeleteTemplate, onLogEmailSend }) => {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [queueStatus, setQueueStatus] = useState<{ current: number, total: number, lastSent?: string } | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTplName, setNewTplName] = useState('');

  const signature = config.messaging.email.emailSignature || '';

  const applySmartList = (list: SmartList) => {
    const filteredIds = leads.filter(lead => {
      const filters = list.filters;
      const matchStatus = filters.status.length === 0 || filters.status.includes(lead.status);
      const matchSize = filters.size.length === 0 || filters.size.includes(lead.size);
      const matchSegment = !filters.segment || lead.segment.toLowerCase().includes(filters.segment.toLowerCase());
      const matchLocation = !filters.location || (lead.location || '').toLowerCase().includes(filters.location.toLowerCase());
      
      let matchInteractions = true;
      if (filters.hasInteractions === 'none') matchInteractions = lead.interactions.length === 0;
      if (filters.hasInteractions === 'recent') {
        const last = lead.interactions[0];
        if (!last) matchInteractions = false;
        else matchInteractions = (Date.now() - new Date(last.date).getTime()) < (7 * 24 * 60 * 60 * 1000);
      }
      if (filters.hasInteractions === 'old') {
        const last = lead.interactions[0];
        if (!last) matchInteractions = true;
        else matchInteractions = (Date.now() - new Date(last.date).getTime()) > (30 * 24 * 60 * 60 * 1000);
      }

      return matchStatus && matchSize && matchSegment && matchLocation && matchInteractions;
    }).map(l => l.id);
    
    setSelectedLeads(filteredIds);
  };

  const parseVariables = (text: string, lead: Lead) => {
    return text
      .replace(/{{nome_contato}}/g, lead.name)
      .replace(/{{nome_empresa}}/g, lead.tradeName || lead.company);
  };

  const toggleSelectAll = () => {
    if (selectedLeads.length === leads.length) setSelectedLeads([]);
    else setSelectedLeads(leads.map(l => l.id));
  };

  const toggleLead = (id: string) => {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleSendQueue = async () => {
    if (!subject || !content || selectedLeads.length === 0) return;
    setSending(true);
    setQueueStatus({ current: 0, total: selectedLeads.length });

    const leadsToSend = leads.filter(l => selectedLeads.includes(l.id));

    for (let i = 0; i < leadsToSend.length; i++) {
      const lead = leadsToSend[i];
      await new Promise(resolve => setTimeout(resolve, 800)); 
      
      // Concatena assinatura e formata conteúdo final
      const bodyWithSignature = `${content}\n\n${signature}`;
      const parsedContent = parseVariables(bodyWithSignature, lead);
      const parsedSubject = parseVariables(subject, lead);
      
      onLogEmailSend(lead.id, parsedSubject, parsedContent);

      setQueueStatus({ current: i + 1, total: leadsToSend.length, lastSent: lead.email });
    }

    setTimeout(() => {
      setSending(false);
      setQueueStatus(null);
      setSelectedLeads([]);
      setSubject('');
      setContent('');
      alert('Campanha enviada com sucesso!');
    }, 1000);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">E-mail Marketing</h1>
          <p className="text-slate-500">Campanhas direcionadas com tipografia Book Antiqua.</p>
        </div>
        <button onClick={() => setShowTemplateModal(true)} className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition flex items-center gap-2 text-sm font-medium">
          Salvar Template
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-6 lg:col-span-1">
          {smartLists.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col p-4">
              <h3 className="font-semibold text-slate-800 text-xs uppercase mb-3 text-slate-400">Listas Inteligentes</h3>
              <div className="space-y-2">
                {smartLists.map(list => (
                  <button 
                    key={list.id} 
                    onClick={() => applySmartList(list)}
                    className="w-full text-left p-2 rounded hover:bg-indigo-50 text-xs font-medium text-slate-600 hover:text-indigo-600 border border-transparent hover:border-indigo-100 transition"
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[300px]">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">Templates</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {templates.map(tpl => (
                <div key={tpl.id} onClick={() => { setSubject(tpl.subject); setContent(tpl.content); }} className="group p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 cursor-pointer">
                  <p className="text-sm font-medium text-slate-700">{tpl.name}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col h-[300px]">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 text-sm">Contatos ({selectedLeads.length})</h3>
              <button onClick={toggleSelectAll} className="text-[10px] text-indigo-600 font-bold uppercase">{selectedLeads.length === leads.length ? 'Nenhum' : 'Todos'}</button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {leads.map(lead => (
                <div key={lead.id} onClick={() => toggleLead(lead.id)} className={`p-3 cursor-pointer flex items-center gap-3 hover:bg-slate-50 transition ${selectedLeads.includes(lead.id) ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedLeads.includes(lead.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                     {selectedLeads.includes(lead.id) && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" /></svg>}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-medium text-slate-900 truncate">{lead.company}</p>
                    <p className="text-[10px] text-slate-500 truncate">{lead.email}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col h-[700px]">
          <div className="space-y-4 flex-1 flex flex-col">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Assunto</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border border-slate-200 rounded-lg px-4 py-3 outline-none" placeholder="Assunto..." />
            </div>
            <div className="flex-1 flex flex-col">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Mensagem (Book Antiqua 12pt)</label>
              <div className="flex-1 flex flex-col bg-slate-50/30 rounded-lg border border-slate-200 overflow-hidden shadow-inner">
                <textarea 
                  value={content} 
                  onChange={(e) => setContent(e.target.value)} 
                  className="flex-1 p-8 outline-none resize-none bg-transparent" 
                  style={{ fontFamily: "'Book Antiqua', serif", fontSize: '12pt' }}
                  placeholder="Corpo do e-mail..." 
                />
                <div className="p-8 border-t border-slate-100 bg-white/50 opacity-60">
                   <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Sua assinatura fixa:</p>
                   <pre style={{ fontFamily: "'Book Antiqua', serif", fontSize: '12pt' }} className="whitespace-pre-wrap">{signature}</pre>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={handleSendQueue} disabled={sending || selectedLeads.length === 0} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50">
              {sending ? 'Disparando...' : `Disparar para ${selectedLeads.length} leads`}
            </button>
          </div>
        </div>
      </div>

      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold mb-4">Novo Template</h2>
            <input type="text" placeholder="Nome do Template" value={newTplName} onChange={e => setNewTplName(e.target.value)} className="w-full border p-2 rounded-lg mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { onSaveTemplate({ id: Math.random().toString(), name: newTplName, subject, content }); setShowTemplateModal(false); }} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold">Salvar</button>
              <button onClick={() => setShowTemplateModal(false)} className="flex-1 bg-slate-100 py-2 rounded-lg font-bold">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailMarketing;
