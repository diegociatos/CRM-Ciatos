
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ChatThread, ChatMessage, Lead } from '../types';

interface ChatModuleProps {
  threads: ChatThread[];
  messages: ChatMessage[];
  leads: Lead[];
  onSendMessage: (threadId: string, content: string, file?: { name: string, url: string }) => void;
  onNewThread: (title: string, leadId?: string) => void;
  initialThreadId?: string;
}

const ChatModule: React.FC<ChatModuleProps> = ({ threads, messages, leads, onSendMessage, onNewThread, initialThreadId }) => {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId || threads[0]?.id || null);
  const [messageInput, setMessageInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewThreadModal, setShowNewThreadModal] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadLeadId, setNewThreadLeadId] = useState('');
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeThreadId]);

  useEffect(() => {
    if (initialThreadId) {
      setActiveThreadId(initialThreadId);
    }
  }, [initialThreadId]);

  const filteredThreads = useMemo(() => {
    return threads.filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [threads, searchTerm]);

  const activeThread = useMemo(() => threads.find(t => t.id === activeThreadId), [threads, activeThreadId]);
  const activeMessages = useMemo(() => messages.filter(m => m.threadId === activeThreadId), [messages, activeThreadId]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeThreadId) return;
    onSendMessage(activeThreadId, messageInput);
    setMessageInput('');
  };

  const handleFileUpload = () => {
    // Simulated file upload
    const fileName = `Estrategia_${activeThread?.title.replace(/\s/g, '_')}.pdf`;
    onSendMessage(activeThreadId!, "Compartilhei um arquivo importante para a estratégia.", {
      name: fileName,
      url: "#"
    });
  };

  const handleCreateThread = () => {
    if (!newThreadTitle) return;
    onNewThread(newThreadTitle, newThreadLeadId || undefined);
    setNewThreadTitle('');
    setNewThreadLeadId('');
    setShowNewThreadModal(false);
  };

  return (
    <div className="flex bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden h-[calc(100vh-160px)]">
      {/* Threads Sidebar */}
      <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/30">
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-slate-800">Canais e Discussões</h2>
            <button 
              onClick={() => setShowNewThreadModal(true)}
              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Pesquisar conversa..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredThreads.map(thread => (
            <button 
              key={thread.id} 
              onClick={() => setActiveThreadId(thread.id)}
              className={`w-full text-left p-4 hover:bg-white transition flex items-center gap-3 ${activeThreadId === thread.id ? 'bg-white border-l-4 border-indigo-600' : ''}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${thread.leadId ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {thread.leadId ? 'L' : '#'}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-bold text-slate-800 truncate">{thread.title}</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{thread.leadId ? 'Lead Vinculado' : 'Geral Team'}</p>
              </div>
            </button>
          ))}
          {filteredThreads.length === 0 && (
            <div className="p-10 text-center">
              <p className="text-xs text-slate-400 italic">Nenhuma conversa encontrada.</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      {activeThread ? (
        <div className="flex-1 flex flex-col bg-white">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white shadow-sm z-10">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${activeThread.leadId ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                {activeThread.leadId ? 'L' : '#'}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{activeThread.title}</h3>
                {activeThread.leadId && (
                  <p className="text-[10px] text-indigo-600 font-bold uppercase cursor-pointer hover:underline">Ver ficha do Lead</p>
                )}
              </div>
            </div>
            <div className="flex -space-x-2">
               <img className="w-8 h-8 rounded-full border-2 border-white" src="https://ui-avatars.com/api/?name=Admin&background=6366f1&color=fff" />
               <img className="w-8 h-8 rounded-full border-2 border-white" src="https://ui-avatars.com/api/?name=Vendas&background=10b981&color=fff" />
               <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 text-[10px] flex items-center justify-center text-slate-400 font-bold">+3</div>
            </div>
          </div>

          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30"
          >
            {activeMessages.map((msg, i) => {
              const isMine = msg.senderName === 'Admin Executivo';
              const showAvatar = i === 0 || activeMessages[i-1].senderId !== msg.senderId;

              return (
                <div key={msg.id} className={`flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                  {!isMine && showAvatar ? (
                    <img className="w-8 h-8 rounded-full shrink-0" src={`https://ui-avatars.com/api/?name=${msg.senderName}&background=random`} />
                  ) : (
                    <div className="w-8 shrink-0" />
                  )}
                  <div className={`max-w-[70%] space-y-1 ${isMine ? 'text-right' : ''}`}>
                    {showAvatar && (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">{msg.senderName}</p>
                    )}
                    <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${isMine ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                      {msg.content}
                      {msg.fileUrl && (
                        <div className={`mt-3 p-3 rounded-xl border flex items-center gap-3 transition cursor-pointer ${isMine ? 'bg-white/10 border-white/20 hover:bg-white/20' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMine ? 'bg-white/20' : 'bg-indigo-100 text-indigo-600'}`}>
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                          </div>
                          <div className="text-left">
                            <p className={`text-xs font-bold truncate max-w-[150px] ${isMine ? 'text-white' : 'text-slate-700'}`}>{msg.fileName}</p>
                            <p className="text-[10px] opacity-70">2.4 MB • PDF</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 uppercase font-medium">{msg.timestamp}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <form onSubmit={handleSend} className="flex items-center gap-3">
              <button 
                type="button" 
                onClick={handleFileUpload}
                className="p-2 text-slate-400 hover:text-indigo-600 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              </button>
              <input 
                type="text" 
                placeholder="Escreva sua mensagem ou discuta a estratégia..." 
                value={messageInput}
                onChange={e => setMessageInput(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <button 
                type="submit"
                disabled={!messageInput.trim()}
                className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 shadow-lg shadow-indigo-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9-2-9-18-9 18 9 2zm0 0v-8" /></svg>
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-20 text-center bg-white">
           <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-6">
             <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
           </div>
           <h3 className="text-xl font-bold text-slate-800 mb-2">Selecione uma conversa</h3>
           <p className="text-slate-500 max-w-sm">Comece a discutir estratégias ou tirar dúvidas com seu time agora mesmo.</p>
        </div>
      )}

      {/* New Thread Modal */}
      {showNewThreadModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[600] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
             <div className="p-6 border-b border-slate-100 bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">Nova Conversa</h2>
                <p className="text-xs text-slate-500">Crie um canal para discutir estratégias ou um lead específico.</p>
             </div>
             <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Título da Conversa</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Alinhamento de Metas Q4"
                    value={newThreadTitle}
                    onChange={e => setNewThreadTitle(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase block mb-1">Vincular a um Lead (Opcional)</label>
                  <select 
                    value={newThreadLeadId}
                    onChange={e => {
                      setNewThreadLeadId(e.target.value);
                      if (!newThreadTitle && e.target.value) {
                        const lead = leads.find(l => l.id === e.target.value);
                        if (lead) setNewThreadTitle(`Discussão: ${lead.company}`);
                      }
                    }}
                    className="w-full border border-slate-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Geral (Sem vínculo)</option>
                    {leads.map(l => (
                      <option key={l.id} value={l.id}>{l.company}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                   <button onClick={handleCreateThread} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition">Criar Canal</button>
                   <button onClick={() => setShowNewThreadModal(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition">Cancelar</button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatModule;
