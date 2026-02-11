
import React from 'react';
import { UserRole } from '../types';
import { PLAYBOOK_DATA } from '../constants';

interface PlaybookProps {
  role: UserRole;
}

const Playbook: React.FC<PlaybookProps> = ({ role }) => {
  // Fix: indexing an empty object type in constants.ts causes 'never' type errors.
  // Using type assertion to any to safely retrieve the role-specific playbook data.
  const data: any = (PLAYBOOK_DATA.roles as any)[role] || (PLAYBOOK_DATA.roles as any)[UserRole.CLOSER] || {};

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Script copiado para a área de transferência!");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center bg-indigo-600 p-10 rounded-[2.5rem] text-white shadow-xl shadow-indigo-200">
         <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tight">{data.title}</h1>
            <p className="text-indigo-100 text-lg opacity-80">{data.goal}</p>
         </div>
         <div className="hidden md:block">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
           <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                 <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                 Guia de Execução
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6 bg-slate-50 p-6 rounded-2xl border border-slate-100 font-medium">
                {data.guide || "Como administrador, seu foco deve ser o gerenciamento da saúde da base e a calibração dos motores de IA em Configurações."}
              </p>
              
              <div className="space-y-4">
                 <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Ações Requisitadas</h3>
                 <div className="grid grid-cols-1 gap-3">
                    {(data.tasks || []).map((task: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 transition bg-white group">
                         <div className="w-8 h-8 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center font-black text-xs group-hover:bg-indigo-600 group-hover:text-white transition">{idx + 1}</div>
                         <span className="text-slate-700 font-bold text-sm">{task}</span>
                      </div>
                    ))}
                 </div>
              </div>
           </section>

           {data.scripts && data.scripts.length > 0 && (
             <section className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                  <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                  Scripts de Abordagem
                </h2>
                <div className="space-y-4">
                  {data.scripts.map((script: { title: string, content: string }, idx: number) => (
                    <div key={idx} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 relative group">
                       <h4 className="text-xs font-black text-indigo-600 uppercase mb-3">{script.title}</h4>
                       <p className="text-sm text-slate-600 leading-relaxed italic pr-10">"{script.content}"</p>
                       <button 
                         onClick={() => copyToClipboard(script.content)}
                         className="absolute top-6 right-6 p-2 bg-white text-slate-400 rounded-xl border border-slate-200 hover:text-indigo-600 hover:border-indigo-600 transition shadow-sm"
                         title="Copiar Script"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3" /></svg>
                       </button>
                    </div>
                  ))}
                </div>
             </section>
           )}
        </div>

        <div className="space-y-8">
           <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl">
              <h3 className="font-bold text-xl mb-6 flex items-center gap-3">
                 <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                 Checklist Obrigatório
              </h3>
              <div className="space-y-4">
                 {(data.checklist || ["Garantir integridade dos dados", "Monitorar alertas de transição", "Atualizar reuniões no calendário"]).map((item: string, idx: number) => (
                   <label key={idx} className="flex items-start gap-3 cursor-pointer group">
                      <div className="mt-1">
                        <input type="checkbox" className="w-5 h-5 rounded-lg border-white/20 bg-white/5 text-indigo-500 transition cursor-pointer" />
                      </div>
                      <span className="text-sm font-medium text-slate-300 group-hover:text-white transition leading-tight">{item}</span>
                   </label>
                 ))}
              </div>
           </div>

           <div className="bg-amber-50 rounded-[2rem] p-8 border border-amber-100">
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 bg-amber-200 rounded-full flex items-center justify-center text-amber-700">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                 </div>
                 <h4 className="font-black text-amber-800 text-xs uppercase tracking-widest">Dica Ciatos IA</h4>
              </div>
              <p className="text-amber-900/70 text-sm font-medium leading-relaxed italic">
                 "A qualidade da informação inserida determina a precisão da IA nas próximas etapas. Detalhes salvam vendas."
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Playbook;
