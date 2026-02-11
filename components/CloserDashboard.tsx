
import React, { useMemo, useState } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, Line, ComposedChart, Bar, Area
} from 'recharts';
import { Lead, SdrQualification, User, SystemConfig, UserGoal, UserRole } from '../types';

interface CloserDashboardProps {
  currentUser: User;
  allUsers: User[];
  leads: Lead[];
  qualifications: SdrQualification[];
  config: SystemConfig;
  userGoals: UserGoal[];
}

const CloserDashboard: React.FC<CloserDashboardProps> = ({ currentUser, allUsers, qualifications, userGoals, leads }) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const closerUsers = useMemo(() => allUsers.filter(u => u.role === UserRole.CLOSER || u.role === UserRole.ADMIN || u.role === UserRole.MANAGER), [allUsers]);
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const metrics = useMemo(() => {
    const monthQuals = qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === selectedMonth);
    const activity = monthQuals.filter(q => q.type === 'MEETING').length;
    const proposals = monthQuals.filter(q => q.type === 'PROPOSAL').length;
    const contracts = monthQuals.filter(q => q.type === 'CONTRACT').length;
    const commission = monthQuals.reduce((acc, q) => acc + q.bonusValue, 0);
    const goal = userGoals.find(g => g.userId === selectedUserId && g.month === selectedMonth);
    
    return { activity, proposals, contracts, commission, goal };
  }, [qualifications, userGoals, selectedUserId, selectedMonth]);

  const chartData = useMemo(() => {
    return months.map((m, idx) => ({
      name: m.substring(0, 3),
      atividades: qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === idx && q.type === 'MEETING').length,
      propostas: qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === idx && q.type === 'PROPOSAL').length,
      contratos: qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === idx && q.type === 'CONTRACT').length,
    }));
  }, [qualifications, selectedUserId]);

  const sidebarLeads = useMemo(() => {
    const monthQuals = qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === selectedMonth);
    return {
      proposals: monthQuals.filter(q => q.type === 'PROPOSAL'),
      contracts: monthQuals.filter(q => q.type === 'CONTRACT')
    };
  }, [qualifications, selectedUserId, selectedMonth]);

  return (
    <div className="flex gap-8 animate-in fade-in duration-700">
      <div className="flex-1 space-y-10">
        {/* HEADER EXECUTIVO */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-5xl font-black text-[#0a192f] serif-authority tracking-tighter mb-1">Performance Consultor</h1>
            <p className="text-slate-400 text-sm font-medium">Insights e crescimento de <span className="text-[#c5a059] font-bold">{allUsers.find(u => u.id === selectedUserId)?.name}</span> em {months[selectedMonth]} de {selectedYear}.</p>
            <div className="flex gap-3 mt-6">
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none focus:border-[#c5a059]">
                {closerUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none focus:border-[#c5a059]">
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none focus:border-[#c5a059]">
                <option value={2024}>2024</option><option value={2025}>2025</option><option value={2026}>2026</option>
              </select>
            </div>
          </div>
          
          <div className="bg-[#0a192f] p-6 rounded-[2rem] border-b-8 border-[#c5a059] text-white shadow-2xl flex flex-col items-center min-w-[220px]">
             <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-1">Comissão no Período</p>
             <p className="text-3xl font-black serif-authority">R$ {metrics.commission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* METRIC CARDS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <span className="text-lg">📉</span> Atividade - Ligações
              </p>
              <div className="flex items-baseline gap-2">
                 <p className="text-7xl font-black text-[#0a192f] serif-authority">{metrics.activity}</p>
                 <span className="text-xs font-bold text-emerald-500 uppercase">Mês</span>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between text-[8px] font-black uppercase text-slate-300">
                 <span>Meta Mensal: —</span>
                 <span className="text-[#0a192f]">Ating. 0%</span>
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative overflow-hidden">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <span className="text-lg">📊</span> Conversão - Propostas
              </p>
              <div className="flex items-baseline gap-2">
                 <p className="text-7xl font-black text-indigo-600 serif-authority">{metrics.proposals}</p>
                 <span className="text-xs font-bold text-indigo-400 uppercase">Mês</span>
              </div>
              <div className="mt-8 pt-6 border-t border-slate-50 flex justify-between text-[8px] font-black uppercase text-slate-300">
                 <span>Meta Propostas: —</span>
                 <span className="text-emerald-500">Atingimento 0%</span>
              </div>
           </div>

           <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
              <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-4 flex items-center gap-2">
                 <span className="text-lg">🏆</span> Sucesso - Contratos
              </p>
              <div className="flex items-baseline gap-2">
                 <p className="text-7xl font-black text-white serif-authority">{metrics.contracts}</p>
                 <span className="text-xs font-bold text-[#c5a059] uppercase">Mês</span>
              </div>
              <div className="mt-8 space-y-4">
                 <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#c5a059]" style={{ width: '0%' }}></div>
                 </div>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Meta Mês — Contratos</p>
              </div>
           </div>
        </div>

        {/* EVOLUÇÃO MoM */}
        <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
           <div className="flex justify-between items-center mb-10">
              <div>
                 <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Evolução de Produtividade (MoM)</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Histórico Mensal de {selectedYear} - Ligações, Propostas e Contratos</p>
              </div>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-slate-300"></div><span className="text-[8px] font-black uppercase text-slate-400">Ligações</span></div>
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-500"></div><span className="text-[8px] font-black uppercase text-slate-400">Propostas</span></div>
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#c5a059]"></div><span className="text-[8px] font-black uppercase text-slate-400">Contratos</span></div>
              </div>
           </div>
           <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={chartData}>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="atividades" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={30} />
                    <Bar dataKey="propostas" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                    <Line type="monotone" dataKey="contratos" stroke="#c5a059" strokeWidth={4} dot={{ r: 6, fill: '#c5a059', strokeWidth: 2, stroke: '#fff' }} />
                 </ComposedChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR: PIPELINE DO PERÍODO */}
      <div className="w-96 space-y-8 animate-in slide-in-from-right-4 duration-1000 flex flex-col h-full min-h-[850px]">
         <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col flex-1">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50">
               <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest serif-authority mb-1">Pipeline do Período</h3>
               <p className="text-[9px] text-slate-400 font-bold">Filtro: {months[selectedMonth]} / {selectedYear}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-10">
               <section>
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                     <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span> Propostas no Período
                  </h4>
                  <div className="space-y-4">
                     {sidebarLeads.proposals.length > 0 ? sidebarLeads.proposals.map(p => (
                        <div key={p.id} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 transition group cursor-pointer">
                           <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{new Date(p.date).toLocaleDateString()}</p>
                           <h5 className="text-xs font-bold text-[#0a192f] serif-authority truncate">{p.companyName}</h5>
                           <p className="text-[10px] text-indigo-600 font-bold mt-2">+ R$ {p.bonusValue.toFixed(2)}</p>
                        </div>
                     )) : (
                        <p className="py-10 text-center text-slate-300 italic text-[10px]">Sem propostas neste período.</p>
                     )}
                  </div>
               </section>

               <section>
                  <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                     <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span> Contratos do Mês
                  </h4>
                  <div className="space-y-4">
                     {sidebarLeads.contracts.length > 0 ? sidebarLeads.contracts.map(c => (
                        <div key={c.id} className="p-5 bg-emerald-50/30 rounded-3xl border border-emerald-100 hover:border-emerald-300 transition group cursor-pointer">
                           <div className="flex justify-between items-start mb-1">
                              <p className="text-[8px] font-black text-emerald-600 uppercase">Contrato Ganho</p>
                              <span className="text-[10px]">🏆</span>
                           </div>
                           <h5 className="text-xs font-bold text-[#0a192f] serif-authority truncate">{c.companyName}</h5>
                           <p className="text-[10px] text-emerald-700 font-black mt-2">R$ {c.bonusValue.toFixed(2)}</p>
                        </div>
                     )) : (
                        <p className="py-10 text-center text-slate-300 italic text-[10px]">Sem vitórias ganhas neste período.</p>
                     )}
                  </div>
               </section>
            </div>

            <div className="p-8 border-t border-slate-50">
               <button className="w-full py-4 bg-[#0a192f] text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl border-b-4 border-[#c5a059] active:translate-y-1 transition-all">
                 Exportar Relatório Mensal
               </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default CloserDashboard;
