
import React, { useState } from 'react';
import { Lead, ObjectionAnalysis, SalesScript } from '../types';
import { solveObjectionIA } from '../services/geminiService';

interface ObjectionAssistantProps {
  lead: Lead;
  activeScript?: SalesScript;
  onUseResponse: (text: string) => void;
  onInsertIntoScript?: (text: string) => void;
}

const COMMON_OBJECTIONS = [
  "Não temos orçamento para este ano",
  "Já temos uma consultoria que faz isso",
  "O decisor não tem tempo para reunião agora",
  "Me mande um e-mail para eu analisar",
  "Acho que nosso regime tributário já é o ideal"
];

const ObjectionAssistant: React.FC<ObjectionAssistantProps> = ({ lead, activeScript, onUseResponse }) => {
  const [objectionText, setObjectionText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ObjectionAnalysis | null>(null);

  const handleAnalyze = async (text: string) => {
    const val = text || objectionText;
    if (!val) return;
    setIsAnalyzing(true);
    try {
      const baseBody = activeScript?.versions.find(v => v.id === activeScript.currentVersionId)?.body;
      const analysis = await solveObjectionIA(val, lead, baseBody);
      setResult(analysis);
    } catch (err) {
      alert("Erro ao analisar objeção. Verifique sua chave API.");
    }
    setIsAnalyzing(false);
  };

  const copyToClipboard = (txt: string) => {
    // Processar variáveis antes de copiar se necessário (IA já deve ter preenchido ou deixado o placeholder)
    const processed = txt
      .replace(/{{nome}}/g, lead.name)
      .replace(/{{empresa}}/g, lead.tradeName)
      .replace(/{{link_agenda}}/g, 'https://ciatos.com.br/agenda/diagnostico');
    
    navigator.clipboard.writeText(processed);
    alert("Copy copiado para a área de transferência!");
  };

  const labelClass = "text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-3 block";
  const toneLabels = ["Direto", "Empático", "Consultivo"];

  return (
    <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col h-full animate-in slide-in-from-right-4">
      <div className="p-8 bg-[#0a192f] text-white shrink-0 border-b-4 border-[#c5a059]">
         <h3 className="text-xl font-black serif-authority mb-1 flex items-center gap-2">
            <span className="text-2xl">⚡</span> Assistente Comercial Sênior
         </h3>
         <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em]">Ciatos Redação & Estratégia IA</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-10">
         <section>
            <label className={labelClass}>Qual a objeção do lead?</label>
            <div className="relative">
               <textarea 
                className="w-full h-28 bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 text-sm font-medium outline-none focus:border-[#c5a059] transition-all shadow-inner"
                placeholder="Ex: 'Me mande por e-mail' ou 'Já tenho contador'..."
                value={objectionText}
                onChange={e => setObjectionText(e.target.value)}
               />
               <button 
                disabled={isAnalyzing || !objectionText}
                onClick={() => handleAnalyze('')}
                className="absolute bottom-4 right-4 bg-[#0a192f] text-white px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50 hover:bg-indigo-600 transition-all flex items-center gap-2"
              >
                 {isAnalyzing ? (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                 ) : 'Redigir Respostas'}
               </button>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-2">
               {COMMON_OBJECTIONS.map(obj => (
                 <button 
                  key={obj}
                  onClick={() => { setObjectionText(obj); handleAnalyze(obj); }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-[8px] font-bold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-all"
                 >
                   {obj}
                 </button>
               ))}
            </div>
         </section>

         {result && (
           <div className="space-y-10 animate-in fade-in duration-700 pb-10">
              {/* QUICK LINES COM TONS */}
              <section className="space-y-4">
                 <label className={labelClass}>Respostas Curtas (Quick Lines)</label>
                 <div className="grid grid-cols-1 gap-3">
                    {result.quick_lines.map((line, i) => (
                      <div key={i} className="group relative bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 hover:border-indigo-400 transition-all">
                         <span className="absolute -top-2 left-4 bg-indigo-600 text-white text-[7px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
                           {toneLabels[i] || 'Variação'}
                         </span>
                         <p className="text-xs text-slate-700 font-medium italic pr-8">"{line}"</p>
                         <button 
                           onClick={() => copyToClipboard(line)}
                           className="absolute top-4 right-4 text-indigo-300 hover:text-indigo-600 transition"
                           title="Copiar para clipboard"
                         >
                           📋
                         </button>
                      </div>
                    ))}
                 </div>
              </section>

              {/* LONG SCRIPTS */}
              <section className="space-y-4">
                 <label className={labelClass}>Scripts de Call (Teleprompter)</label>
                 <div className="space-y-4">
                    {result.long_scripts.map((script, i) => (
                      <div key={i} className="bg-slate-900 p-6 rounded-[2rem] border-l-4 border-[#c5a059] shadow-xl relative group">
                        <p className="text-xs text-slate-100 leading-relaxed font-medium">
                          {script}
                        </p>
                        <button 
                          onClick={() => copyToClipboard(script)}
                          className="mt-4 text-[9px] font-black uppercase text-[#c5a059] opacity-40 group-hover:opacity-100 transition-opacity hover:underline"
                        >
                           Usar este script na chamada
                        </button>
                      </div>
                    ))}
                 </div>
              </section>

              {/* WHATSAPP MSG */}
              <section className="bg-emerald-50/50 p-6 rounded-[2.5rem] border border-emerald-100">
                 <div className="flex justify-between items-center mb-4">
                    <label className={labelClass} style={{color: '#059669', marginBottom: 0}}>WhatsApp Redigido</label>
                    <button 
                      onClick={() => copyToClipboard(result.whatsapp_msg)}
                      className="text-[9px] font-black uppercase text-emerald-600 hover:underline"
                    >
                      Copiar Copy
                    </button>
                 </div>
                 <div className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-inner">
                    <p className="text-xs text-slate-600 italic leading-relaxed whitespace-pre-wrap">
                      {result.whatsapp_msg.replace(/{{link_agenda}}/g, '{{link_agenda}}')}
                    </p>
                 </div>
                 <p className="text-[8px] text-emerald-600/50 font-bold uppercase mt-3">Link de agenda: Sincronizado automaticamente</p>
              </section>

              {/* TAGS & CONFIDENCE */}
              <div className="pt-6 border-t border-slate-100 space-y-6">
                 <div className="flex flex-wrap gap-2">
                    {result.tags.map(tag => (
                      <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[8px] font-black uppercase tracking-tighter">#{tag}</span>
                    ))}
                 </div>

                 <div className="bg-[#0a192f] p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 h-1 bg-[#c5a059] transition-all duration-1000" style={{ width: `${result.confidence.percentual}%` }}></div>
                    <div className="flex justify-between items-baseline mb-2">
                       <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest">Assertividade IA</p>
                       <p className="text-2xl font-black text-white">{result.confidence.percentual}%</p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mb-4 uppercase">Próximo Passo Sugerido: <span className="text-emerald-400">{result.follow_up}</span></p>
                    <p className="text-[9px] text-slate-500 italic leading-relaxed pt-3 border-t border-white/5">
                      Raciocínio: {result.confidence.razão}
                    </p>
                 </div>
              </div>
           </div>
         )}
      </div>

      <div className="p-8 bg-slate-50 border-t border-slate-100">
         <p className="text-[8px] text-slate-400 leading-tight uppercase font-black tracking-tighter">
           ⚠️ Inteligência Comercial: Sugestões baseadas na tese de consultoria da Banca Ciatos. Evite dados sensíveis externos.
         </p>
      </div>
    </div>
  );
};

export default ObjectionAssistant;
