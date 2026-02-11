
import React, { useState, useMemo } from 'react';
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

  const availableScripts = useMemo(() => {
    // Sugere scripts baseados na fase do lead ou tipo de serviço
    return scripts.filter(s => s.funnelPhaseId === lead.phaseId || s.serviceType === lead.serviceType || s.isGlobal);
  }, [scripts, lead.phaseId, lead.serviceType]);

  const activeScript = useMemo(() => scripts.find(s => s.id === selectedScriptId), [scripts, selectedScriptId]);

  const parsedBody = useMemo(() => {
    if (!activeScript) return '';
    const currentVersion = activeScript.versions.find(v => v.id === activeScript.currentVersionId) || activeScript.versions[activeScript.versions.length - 1];
    return currentVersion.body
      .replace(/{{nome}}/g, lead.name)
      .replace(/{{empresa}}/g, lead.tradeName)
      .replace(/{{segmento}}/g, lead.segment)
      .replace(/{{dor}}/g, lead.strategicPains || 'redução da carga tributária')
      .replace(/{{faturamento}}/g, lead.annualRevenue || 'não informado')
      .replace(/{{regime}}/g, lead.taxRegime);
  }, [activeScript, lead]);

  const handleScriptChange = (id: string) => {
    setSelectedScriptId(id);
    const script = scripts.find(s => s.id === id);
    if (script && onScriptSelect) onScriptSelect(script);
  };

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

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-2 block";

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
         <label className={labelClass}>Script Recomendado</label>
         <select 
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3 text-sm font-bold outline-none focus:border-[#c5a059]"
          value={selectedScriptId}
          onChange={e => handleScriptChange(e.target.value)}
         >
            <option value="">Selecione um roteiro de abordagem...</option>
            {availableScripts.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
         </select>
      </div>

      {activeScript ? (
        <div className="flex-1 flex flex-col space-y-6 overflow-hidden">
           <div className="flex-1 bg-slate-900 rounded-[3rem] p-10 text-white relative shadow-2xl overflow-y-auto custom-scrollbar border-l-8 border-[#c5a059]">
              <div className="absolute top-8 right-8 flex gap-2">
                 <span className="px-3 py-1 bg-white/10 rounded-lg text-[8px] font-black uppercase text-[#c5a059] tracking-widest">{activeScript.tone}</span>
                 <span className="px-3 py-1 bg-white/10 rounded-lg text-[8px] font-black uppercase text-slate-400 tracking-widest">{activeScript.estimatedDuration} min</span>
              </div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-8">Teleprompter em Tempo Real</p>
              <div className="text-lg font-medium leading-relaxed whitespace-pre-wrap serif-authority text-slate-100">
                 {parsedBody}
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl space-y-6">
              <div className="grid grid-cols-2 gap-8">
                 <div>
                    <label className={labelClass}>Desfecho da Tentativa</label>
                    <select 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-5 py-3 text-xs font-bold outline-none"
                      value={outcome}
                      onChange={e => setOutcome(e.target.value as any)}
                    >
                       <option value="Interessado">👍 Interessado (Avançar)</option>
                       <option value="Objeção resolvida">⚖️ Objeção resolvida</option>
                       <option value="Precisa de proposta">📄 Precisa de proposta</option>
                       <option value="Não interessado">👎 Não interessado</option>
                    </select>
                 </div>
                 <div className="flex items-end">
                    <button 
                      onClick={handleFinish}
                      className="w-full py-3.5 bg-emerald-600 text-white rounded-xl font-black uppercase text-[9px] tracking-widest shadow-xl border-b-4 border-emerald-800 active:translate-y-1 transition-all flex items-center justify-center gap-2"
                    >
                      💾 Registrar e Encerrar
                    </button>
                 </div>
              </div>
           </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30 italic py-20 border-2 border-dashed border-slate-100 rounded-[3rem] bg-slate-50/30">
           <div className="text-7xl mb-6">🎤</div>
           <p className="serif-authority text-2xl text-[#0a192f]">Aguardando Seleção de Roteiro</p>
           <p className="text-[10px] font-black uppercase tracking-widest mt-2">Os placeholders serão preenchidos automaticamente com os dados do lead.</p>
        </div>
      )}
    </div>
  );
};

export default Teleprompter;
