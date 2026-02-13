
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Lead, SalesScript, User, InteractionType, ScriptUsage } from '../types';

interface TeleprompterProps {
  lead: Lead;
  scripts: SalesScript[];
  onLogUsage: (usage: Omit<ScriptUsage, 'id' | 'date'>, responseText: string) => void;
  currentUser: User;
  onScriptSelect?: (script: SalesScript) => void;
}

const Teleprompter: React.FC<TeleprompterProps> = ({ lead, scripts, onLogUsage, currentUser, onScriptSelect }) => {
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [outcome, setOutcome] = useState<ScriptUsage['outcome']>('Interessado');
  const [scrollSpeed, setScrollSpeed] = useState(0); 
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const availableScripts = useMemo(() => {
    return scripts.filter(s => 
      s.funnelPhaseId === lead.phaseId || s.serviceType === lead.serviceType || s.isGlobal
    );
  }, [scripts, lead.phaseId, lead.serviceType]);

  const activeScript = useMemo(() => scripts.find(s => s.id === selectedScriptId), [scripts, selectedScriptId]);

  const parsedBody = useMemo(() => {
    if (!activeScript) return '';
    
    const version = activeScript.versions.find(v => v.id === activeScript.currentVersionId) || activeScript.versions[activeScript.versions.length - 1];
    if (!version) return 'Texto não localizado.';

    return version.body
      .replace(/{{nome}}/g, lead.name || 'Decisor')
      .replace(/{{empresa}}/g, lead.tradeName || lead.company || 'empresa')
      .replace(/{{segmento}}/g, lead.segment || 'setor')
      .replace(/{{faturamento}}/g, lead.annualRevenue || 'indicadores')
      .replace(/{{regime}}/g, lead.taxRegime || 'regime tributário');
  }, [activeScript, lead]);

  useEffect(() => {
    if (scrollSpeed === 0) return;
    const interval = setInterval(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += 1;
      }
    }, 100 / scrollSpeed);
    return () => clearInterval(interval);
  }, [scrollSpeed]);

  const handleFinish = () => {
    if (!activeScript) return;
    onLogUsage({
      scriptId: activeScript.id,
      versionId: activeScript.currentVersionId,
      leadId: lead.id,
      userId: currentUser.id,
      outcome
    }, parsedBody);
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between">
         <div className="flex-1">
            <label className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-2 block">Script Ativo</label>
            <select 
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3 text-sm font-bold outline-none focus:border-[#c5a059]"
              value={selectedScriptId}
              onChange={e => {
                setSelectedScriptId(e.target.value);
                const s = scripts.find(i => i.id === e.target.value);
                if (s && onScriptSelect) onScriptSelect(s);
              }}
            >
                <option value="">Selecione um roteiro...</option>
                {availableScripts.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
         </div>
         {activeScript && (
           <div className="ml-10 flex gap-2">
              {[0, 1, 2, 3].map(speed => (
                <button 
                  key={speed}
                  onClick={() => setScrollSpeed(speed)}
                  className={`w-10 h-10 rounded-xl font-black text-[10px] border-2 ${scrollSpeed === speed ? 'bg-[#c5a059] border-[#c5a059] text-[#0a192f]' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                >
                  {speed === 0 ? '⏸' : `${speed}x`}
                </button>
              ))}
           </div>
         )}
      </div>

      {activeScript ? (
        <div className="flex-1 flex flex-col space-y-6 overflow-hidden">
           <div 
             ref={scrollContainerRef}
             className="flex-1 bg-[#0a192f] rounded-[3rem] p-12 text-white shadow-2xl overflow-y-auto custom-scrollbar border-l-[12px] border-[#c5a059] scroll-smooth"
           >
              <div className="text-3xl font-medium leading-relaxed whitespace-pre-wrap serif-authority text-slate-100 pb-64">
                 {parsedBody}
              </div>
           </div>

           <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl flex gap-6">
              <select 
                className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 text-xs font-bold"
                value={outcome}
                onChange={e => setOutcome(e.target.value as any)}
              >
                 <option value="Interessado">👍 Interessado</option>
                 <option value="Objeção resolvida">⚖️ Objeção resolvida</option>
                 <option value="Não interessado">👎 Não interessado</option>
                 <option value="Sem contato">🚫 Caixa Postal</option>
              </select>
              <button 
                onClick={handleFinish}
                className="px-10 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] shadow-xl border-b-4 border-emerald-800 active:translate-y-1 transition-all"
              >
                Registrar e Concluir
              </button>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center opacity-30 italic py-20 border-4 border-dashed border-slate-100 rounded-[4rem]">
           <p className="serif-authority text-2xl font-bold">Modo Teleprompter</p>
           <p className="text-[10px] font-black uppercase tracking-widest mt-2">Escolha um roteiro acima.</p>
        </div>
      )}
    </div>
  );
};

export default Teleprompter;
