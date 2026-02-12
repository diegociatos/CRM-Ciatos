
import React, { useMemo, useState } from 'react';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, ComposedChart, Line, Area
} from 'recharts';
import { Lead, SdrQualification, User, SystemConfig, UserRole, UserGoal } from '../types';

interface SdrDashboardProps {
  currentUser: User;
  allUsers: User[];
  leads: Lead[];
  qualifications: SdrQualification[];
  config: SystemConfig;
  onUpdateStatus: (id: string, status: SdrQualification['status']) => void;
  userGoals: UserGoal[];
}

const SdrDashboard: React.FC<SdrDashboardProps> = ({ currentUser, allUsers, qualifications, userGoals }) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const sdrUsers = useMemo(() => allUsers.filter(u => u.role === UserRole.SDR || u.role === UserRole.ADMIN || u.role === UserRole.MANAGER), [allUsers]);

  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthQuals = qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === selectedMonth);
    
    // Métricas do Dia
    const activitiesToday = qualifications.filter(q => 
      q.sdrId === selectedUserId && 
      q.date.startsWith(todayStr) && 
      (q.type === 'QUALIFICATION' || q.type === 'MEETING')
    ).length;

    const qualsCount = monthQuals.filter(q => q.type === 'QUALIFICATION').length;
    const meetingsCount = monthQuals.filter(q => q.type === 'MEETING').length;
    const efficiency = qualsCount > 0 ? Math.round((meetingsCount / qualsCount) * 100) : 0;
    const totalBonus = monthQuals.reduce((acc, q) => acc + q.bonusValue, 0);
    const goal = userGoals.find(g => g.userId === selectedUserId && g.month === selectedMonth);
    
    // Cálculo de Meta Diária (Base 22 dias úteis - Usando callsGoal como proxy de atividades)
    const dailyGoal = goal ? Math.ceil(goal.callsGoal / 22) : 0;
    const dailyProgress = dailyGoal > 0 ? Math.min(100, Math.round((activitiesToday / dailyGoal) * 100)) : 0;

    return { qualsCount, meetingsCount, efficiency, totalBonus, goal, activitiesToday, dailyGoal, dailyProgress };
  }, [qualifications, userGoals, selectedUserId, selectedMonth]);

  const chartData = useMemo(() => {
    return months.map((m, idx) => ({
      name: m.substring(0, 3),
      quals: qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === idx && q.type === 'QUALIFICATION').length,
      meetings: qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === idx && q.type === 'MEETING').length,
      meta: metrics.goal?.qualsGoal || 2
    }));
  }, [qualifications, selectedUserId, metrics.goal]);

  const sidebarData = useMemo(() => {
    const monthQuals = qualifications.filter(q => q.sdrId === selectedUserId && new Date(q.date).getMonth() === selectedMonth);
    return {
      meetings: monthQuals.filter(q => q.type === 'MEETING'),
      history: monthQuals.filter(q => q.type === 'QUALIFICATION')
    };
  }, [qualifications, selectedUserId, selectedMonth]);

  return (
    <div className="flex gap-8 animate-in fade-in duration-700">
      <div className="flex-1 space-y-10">
        {/* HEADER EXECUTIVO */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-5xl font-black text-[#0a192f] serif-authority tracking-tighter mb-1">Minha Produção SDR</h1>
            <p className="text-slate-400 text-sm font-medium">Análise de metas e conversão de <span className="text-[#c5a059] font-bold">{allUsers.find(u => u.id === selectedUserId)?.name}</span> em {months[selectedMonth]} de {selectedYear}.</p>
            <div className="flex gap-3 mt-6">
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none focus:border-[#c5a059]">
                {sdrUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none focus:border-[#c5a059]">
                {months.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-xs font-bold shadow-sm outline-none focus:border-[#c5a059]">
                <option value={2024}>2024</option><option value={2025}>2025</option><option value={2026}>2026</option>
              </select>
            </div>
          </div>
          
          <div className="bg-[#0a192f] px-10 py-8 rounded-[2.5rem] border-b-[10px] border-[#c5a059] text-white shadow-2xl flex flex-col items-center min-w-[240px]">
             <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-1">Premiação no Período</p>
             <p className="text-4xl font-black serif-authority">R$ {metrics.totalBonus.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* MÉTRICAS DIÁRIAS (NOVA SEÇÃO) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group border-b-8 border-[#c5a059]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-2xl group-hover:scale-150 transition-all"></div>
              <div className="relative z-10 flex justify-between items-start">
                 <div>
                    <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.3em] mb-4">Ligações / Atividades Dia</p>
                    <div className="flex items-baseline gap-4">
                       <p className="text-7xl font-black serif-authority">{metrics.activitiesToday}</p>
                       <p className="text-xl font-bold text-slate-400">/ {metrics.dailyGoal}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-3xl font-black text-emerald-400 serif-authority">{metrics.dailyProgress}%</p>
                    <p className="text-[8px] font-black uppercase text-slate-500">Objetivo Dia</p>
                 </div>
              </div>
              <div className="mt-8 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-[#c5a059] transition-all duration-1000" style={{ width: `${metrics.dailyProgress}%` }}></div>
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex items-center justify-between group">
              <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Status da Produção Diária</p>
                 <h3 className="text-2xl font-bold text-[#0a192f] serif-authority leading-tight">
                    {metrics.activitiesToday >= metrics.dailyGoal 
                      ? "Meta de Atividades Batida! 🚀" 
                      : `Faltam ${Math.max(0, metrics.dailyGoal - metrics.activitiesToday)} atividades para o alvo diário.`}
                 </h3>
              </div>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl transition-transform group-hover:rotate-12 ${metrics.activitiesToday >= metrics.dailyGoal ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                 {metrics.activitiesToday >= metrics.dailyGoal ? '💎' : '📞'}
              </div>
           </div>
        </div>

        {/* KPI GRID MENSAIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           {/* CARD 1: PRODUÇÃO */}
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative">
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <span className="text-lg">🎯</span> Produção - Qualificações
              </p>
              <div className="flex items-baseline gap-2">
                 <p className="text-7xl font-black text-[#0a192f] serif-authority">{metrics.qualsCount}</p>
                 <span className="text-xs font-bold text-emerald-500 uppercase">No Mês</span>
              </div>
              <div className="mt-10 pt-6 border-t border-slate-50 flex justify-between">
                 <div><p className="text-[8px] font-black text-slate-300 uppercase">Meta Mensal</p><p className="text-sm font-bold text-slate-400">{metrics.goal?.qualsGoal || '—'}</p></div>
                 <div className="text-right"><p className="text-[8px] font-black text-slate-300 uppercase">Ating.</p><p className="text-sm font-black text-[#0a192f]">{metrics.goal?.qualsGoal ? ((metrics.qualsCount/metrics.goal.qualsGoal)*100).toFixed(0) : 0}%</p></div>
              </div>
           </div>

           {/* CARD 2: CONVERSÃO */}
           <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm relative">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <span className="text-lg">📅</span> Conversão - Agendamentos
              </p>
              <div className="flex items-baseline gap-2">
                 <p className="text-7xl font-black text-indigo-600 serif-authority">{metrics.meetingsCount}</p>
                 <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Mês</span>
              </div>
              <div className="mt-10 pt-6 border-t border-slate-50 flex justify-between">
                 <div><p className="text-[8px] font-black text-slate-300 uppercase">Meta Agendamento</p><p className="text-sm font-bold text-slate-400">{metrics.goal?.callsGoal || '—'}</p></div>
                 <div className="text-right"><p className="text-[8px] font-black text-slate-300 uppercase">Ating.</p><p className="text-sm font-black text-[#0a192f]">{metrics.goal?.callsGoal ? ((metrics.meetingsCount/metrics.goal.callsGoal)*100).toFixed(0) : 0}%</p></div>
              </div>
           </div>

           {/* CARD 3: EFICIÊNCIA */}
           <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
              <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-4 flex items-center gap-2">
                 <span className="text-lg">📊</span> Eficiência Quali-Call
              </p>
              <div className="flex items-baseline gap-2">
                 <p className="text-7xl font-black text-white serif-authority">{metrics.efficiency}%</p>
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Taxa</span>
              </div>
              <div className="mt-10">
                 <p className="text-[10px] text-slate-400 leading-relaxed font-bold tracking-tight">
                   SUA TAXA DE AGENDAMENTO ESTÁ <span className="text-emerald-400 font-black">ACIMA DA MÉDIA</span> DA BANCA (12%).
                 </p>
              </div>
           </div>
        </div>

        {/* CURVA DE PRODUÇÃO */}
        <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-sm">
           <div className="flex justify-between items-center mb-10">
              <div>
                 <h3 className="text-xl font-bold text-[#0a192f] serif-authority">Curva de Produção (MoM)</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Histórico de Qualificações e Agendamentos em {selectedYear}</p>
              </div>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-600"></div><span className="text-[8px] font-black uppercase text-slate-400">Qualificações</span></div>
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-indigo-300"></div><span className="text-[8px] font-black uppercase text-slate-400">Agendamentos</span></div>
                 <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-[#c5a059]"></div><span className="text-[8px] font-black uppercase text-slate-400">Meta Quali</span></div>
              </div>
           </div>
           <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                 <ComposedChart data={chartData}>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Area type="monotone" dataKey="quals" fill="#6366f1" fillOpacity={0.05} stroke="#4f46e5" strokeWidth={3} />
                    <Area type="monotone" dataKey="meetings" fill="#818cf8" fillOpacity={0.05} stroke="#a5b4fc" strokeWidth={3} />
                    <Line type="stepAfter" dataKey="meta" stroke="#c5a059" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                 </ComposedChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR: AUDIT DE ATIVIDADE */}
      <div className="w-96 space-y-8 animate-in slide-in-from-right-4 duration-1000 flex flex-col h-full min-h-[850px]">
         <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl overflow-hidden flex flex-col flex-1">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50">
               <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest serif-authority mb-1">Audit de Atividade</h3>
               <p className="text-[9px] text-slate-400 font-bold">Período: {months[selectedMonth]} / {selectedYear}</p>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-10">
               <section>
                  <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                     <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span> Agendamentos do Período
                  </h4>
                  <div className="space-y-4">
                     {sidebarData.meetings.length > 0 ? sidebarData.meetings.map(m => (
                        <div key={m.id} className="p-5 bg-slate-50 rounded-3xl border border-slate-100 hover:border-indigo-200 transition group cursor-pointer">
                           <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{new Date(m.date).toLocaleDateString()}</p>
                           <h5 className="text-xs font-bold text-[#0a192f] serif-authority truncate">{m.companyName}</h5>
                           <p className="text-[9px] text-indigo-600 font-bold mt-2">Reunião agendada</p>
                        </div>
                     )) : (
                        <p className="py-10 text-center text-slate-300 italic text-[10px]">Nenhum agendamento no período.</p>
                     )}
                  </div>
               </section>

               <section>
                  <h4 className="text-[10px] font-black text-[#c5a059] uppercase tracking-widest mb-6 flex items-center gap-2">
                     <span className="w-1.5 h-4 bg-[#c5a059] rounded-full"></span> Histórico de Qualificação
                  </h4>
                  <div className="space-y-4">
                     {sidebarData.history.length > 0 ? sidebarData.history.map(h => (
                        <div key={h.id} className="p-5 bg-amber-50/30 rounded-3xl border border-amber-100 hover:border-amber-300 transition group cursor-pointer">
                           <div className="flex justify-between items-start mb-1">
                              <p className="text-[8px] font-black text-[#c5a059] uppercase">Qualificado</p>
                              <span className="text-[10px]">💎</span>
                           </div>
                           <h5 className="text-xs font-bold text-[#0a192f] serif-authority truncate">{h.companyName}</h5>
                           <p className="text-[10px] text-amber-700 font-black mt-2">+ R$ {h.bonusValue.toFixed(2)}</p>
                        </div>
                     )) : (
                        <p className="py-10 text-center text-slate-300 italic text-[10px]">Sem qualificações no período.</p>
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

export default SdrDashboard;
