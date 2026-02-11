
import React, { useState, useMemo } from 'react';
import { SalesScript, ScriptVersion, User, SystemConfig, UserRole } from '../types';

interface ScriptsLibraryProps {
  scripts: SalesScript[];
  onSaveScript: (script: SalesScript) => void;
  onDeleteScript: (id: string) => void;
  currentUser: User;
  config: SystemConfig;
}

const ScriptsLibrary: React.FC<ScriptsLibraryProps> = ({ scripts, onSaveScript, onDeleteScript, currentUser, config }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingScript, setEditingScript] = useState<Partial<SalesScript> | null>(null);

  const filteredScripts = useMemo(() => {
    return scripts.filter(s => {
      const matchSearch = s.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchService = filterService === 'all' || s.serviceType === filterService;
      const matchAccess = s.isGlobal || s.authorId === currentUser.id;
      return matchSearch && matchService && matchAccess;
    });
  }, [scripts, searchTerm, filterService, currentUser.id]);

  const handleOpenNew = () => {
    setEditingScript({
      id: `scr-${Date.now()}`,
      title: '',
      objective: 'pitch',
      serviceType: config.serviceTypes[0],
      funnelPhaseId: config.phases[0].id,
      tone: 'consultivo',
      estimatedDuration: 5,
      bullets: ['', '', ''],
      tags: [],
      isGlobal: currentUser.role === UserRole.ADMIN,
      authorId: currentUser.id,
      versions: [{
        id: `v1-${Date.now()}`,
        body: '',
        versionNumber: 1,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.name
      }],
      currentVersionId: '',
      usageStats: { totalUsed: 0, resolvedObjections: 0, convertedToMeeting: 0 }
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!editingScript?.title || !editingScript?.versions?.[0].body) return alert("Preencha título e corpo.");
    const script = {
      ...editingScript,
      currentVersionId: editingScript.versions![editingScript.versions!.length - 1].id,
      tags: editingScript.tags || []
    } as SalesScript;
    onSaveScript(script);
    setShowModal(false);
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-2 block";
  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold outline-none focus:border-[#c5a059] transition-all";

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex justify-between items-end border-b border-slate-200 pb-10">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Sales Playbook</h1>
          <p className="text-slate-500 text-lg font-medium">Biblioteca de Scripts, Pitches e Tratamento de Objeções.</p>
        </div>
        <div className="flex gap-4">
           <input 
            type="text" 
            placeholder="Buscar por título ou tag..." 
            className="w-80 bg-white border border-slate-200 rounded-2xl px-6 py-3 text-sm font-bold shadow-sm"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
           />
           <button 
            onClick={handleOpenNew}
            className="bg-[#0a192f] text-white px-10 py-4 rounded-[1.5rem] font-black uppercase text-xs tracking-widest shadow-2xl border-b-4 border-[#c5a059] hover:scale-105 active:scale-95 transition-all"
           >
             + Criar Script
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredScripts.map(script => {
          const currentVersion = script.versions.find(v => v.id === script.currentVersionId) || script.versions[0];
          return (
            <div key={script.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-xl transition-all group flex flex-col justify-between min-h-[450px]">
              <div>
                <div className="flex justify-between items-start mb-6">
                  <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                    script.isGlobal ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                  }`}>
                    {script.isGlobal ? 'Global / Admin' : 'Pessoal'}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingScript(script); setShowModal(true); }} className="text-slate-300 hover:text-indigo-600 transition">✏️</button>
                    <button onClick={() => onDeleteScript(script.id)} className="text-slate-300 hover:text-red-500 transition">✕</button>
                  </div>
                </div>

                <h3 className="text-2xl font-bold text-[#0a192f] serif-authority mb-4 group-hover:text-[#c5a059] transition-colors leading-tight">{script.title}</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Duração Est.</p>
                      <p className="text-lg font-bold text-[#0a192f]">{script.estimatedDuration} min</p>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Taxa Conv.</p>
                      <p className="text-lg font-bold text-emerald-600">{script.usageStats.totalUsed > 0 ? Math.round((script.usageStats.convertedToMeeting / script.usageStats.totalUsed)*100) : 0}%</p>
                   </div>
                </div>

                <div className="space-y-3 mb-8">
                   <p className="text-[9px] font-black text-[#c5a059] uppercase tracking-widest">3 Bullets de Abordagem</p>
                   {script.bullets.map((b, i) => (
                     <div key={i} className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-200"></span>
                        {b || 'Ponto tático...'}
                     </div>
                   ))}
                </div>
              </div>

              <div className="border-t border-slate-50 pt-8">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                       v{script.versions.length}
                    </div>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Versionamento Ativo</p>
                 </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && editingScript && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-[#0a192f]/95 backdrop-blur-md">
          <div className="bg-white w-full max-w-6xl h-[92vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-12 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div>
                  <h2 className="text-4xl font-black text-[#0a192f] serif-authority">Editor de Playbook</h2>
                  <p className="text-slate-500 font-medium">Modelagem de narrativa comercial e versionamento.</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-4xl text-slate-300 hover:text-slate-900 transition-transform hover:rotate-90">✕</button>
             </div>

             <div className="flex-1 overflow-y-auto p-12 custom-scrollbar flex gap-12">
                <div className="flex-1 space-y-10">
                   <section className="bg-white border-2 border-slate-100 rounded-[3rem] p-10 shadow-inner">
                      <div className="grid grid-cols-2 gap-8 mb-10">
                         <div>
                            <label className={labelClass}>Título do Script</label>
                            <input className={inputClass} value={editingScript.title} onChange={e => setEditingScript({...editingScript, title: e.target.value})} placeholder="Ex: Pitch Inicial Holding" />
                         </div>
                         <div>
                            <label className={labelClass}>Serviço Alvo</label>
                            <select className={inputClass} value={editingScript.serviceType} onChange={e => setEditingScript({...editingScript, serviceType: e.target.value})}>
                               {config.serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                         </div>
                      </div>
                      
                      <div>
                         <label className={labelClass}>Corpo do Script (Markdown Suportado)</label>
                         <textarea 
                          className="w-full h-96 bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-8 text-sm font-medium leading-relaxed outline-none shadow-inner focus:border-[#c5a059]"
                          placeholder="Olá {{nome}}, notei que a {{empresa}}..."
                          value={editingScript.versions?.[editingScript.versions!.length-1].body}
                          onChange={e => {
                            const lastVersion = editingScript.versions![editingScript.versions!.length-1];
                            const updatedVersions = [...editingScript.versions!];
                            updatedVersions[updatedVersions.length-1] = { ...lastVersion, body: e.target.value };
                            setEditingScript({ ...editingScript, versions: updatedVersions });
                          }}
                         />
                         <div className="flex gap-2 mt-4">
                            {['nome', 'empresa', 'segmento', 'dor'].map(v => (
                              <button key={v} className="px-3 py-1 bg-amber-50 text-[#c5a059] border border-amber-100 rounded-lg text-[9px] font-black uppercase" onClick={() => {
                                 const body = editingScript.versions![editingScript.versions!.length-1].body;
                                 const updated = body + ` {{${v}}}`;
                                 const updatedVersions = [...editingScript.versions!];
                                 updatedVersions[updatedVersions.length-1] = { ...updatedVersions[updatedVersions.length-1], body: updated };
                                 setEditingScript({ ...editingScript, versions: updatedVersions });
                              }}>+ {v}</button>
                            ))}
                         </div>
                      </div>
                   </section>
                </div>

                <div className="w-80 space-y-8">
                   <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200">
                      <h4 className={labelClass}>Configurações de Pitch</h4>
                      <div className="space-y-6 mt-6">
                         <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Duração (Min)</label>
                            <input type="number" className={inputClass} value={editingScript.estimatedDuration} onChange={e => setEditingScript({...editingScript, estimatedDuration: parseInt(e.target.value)})} />
                         </div>
                         <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Tom de Voz</label>
                            <select className={inputClass} value={editingScript.tone} onChange={e => setEditingScript({...editingScript, tone: e.target.value as any})}>
                               <option value="formal">Formal / Acadêmico</option>
                               <option value="tecnico">Técnico / Jurídico</option>
                               <option value="consultivo">Consultivo / Estratégico</option>
                               <option value="direto">Direto / Closing</option>
                            </select>
                         </div>
                      </div>
                   </div>

                   <div className="bg-[#0a192f] p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-20 h-20 bg-[#c5a059]/10 rounded-full blur-2xl"></div>
                      <h4 className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-6">Histórico de Versões</h4>
                      <div className="space-y-4">
                         {editingScript.versions?.map((v, i) => (
                           <div key={v.id} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                              <span className="text-[10px] font-bold">v{v.versionNumber}</span>
                              <span className="text-[8px] text-slate-400 uppercase">{new Date(v.createdAt).toLocaleDateString()}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
             </div>

             <div className="p-12 border-t border-slate-100 bg-white flex justify-between items-center">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest italic">Atenção: Salvar criará uma nova versão rastreável na biblioteca.</p>
                <div className="flex gap-6">
                   <button onClick={() => setShowModal(false)} className="px-10 py-5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px]">Descartar</button>
                   <button 
                    onClick={handleSave}
                    className="px-16 py-5 bg-[#0a192f] text-white rounded-[2rem] font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all"
                   >
                     Publicar Script v{editingScript.versions!.length}
                   </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptsLibrary;
