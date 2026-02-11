
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Lead, LeadStatus, Notification, User, UserRole, AgendaEvent } from '../types';

interface DashboardProps {
  leads: Lead[];
  tasks: any[];
  notifications: Notification[];
  currentUser: User;
  agendaEvents?: AgendaEvent[];
}

const Dashboard: React.FC<DashboardProps> = ({ leads, notifications, currentUser, agendaEvents = [] }) => {
  // Helper para parsing de valores financeiros (R$ 1.000,00 -> 1000)
  const parseCurrency = (val: string) => {
    if (!val) return 0;
    return parseFloat(val.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  };

  const dashboardMetrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Pipeline Total (Faturamento Est. de Leads em fases comerciais)
    const commercialLeads = leads.filter(l => !l.inQueue && [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.NEGOTIATION, LeadStatus.WON].includes(l.status));
    const pipelineTotal = commercialLeads
      .filter(l => l.phaseId !== 'ph-fech') // Não somar o que já fechou como "oportunidade"
      .reduce((acc, l) => acc + parseCurrency(l.annualRevenue), 0);

    // 2. Taxa de Conversão (Reunião -> Proposta)
    const inMeeting = leads.filter(l => l.phaseId === 'ph-agend').length;
    const inProposal = leads.filter(l => l.phaseId === 'ph-prop' || l.phaseId === 'ph-nego' || l.phaseId === 'ph-fech').length;
    const convRate = inMeeting > 0 ? (inProposal / (inMeeting + inProposal)) * 100 : 0;

    // 3. Ações do Dia
    const actionsToday = agendaEvents.filter(e => e.start.startsWith(today) && e.assignedToId === currentUser.id).length;

    // 4. Contratos do Mês
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyContracts = leads.filter(l => {
      const d = new Date(l.createdAt);
      return l.status === LeadStatus.WON && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;

    return { pipelineTotal, convRate, actionsToday, monthlyContracts };
  }, [leads, agendaEvents, currentUser.id]);

  // Dados para o Gráfico de Evolução (Qualificados vs Fechados)
  const chartData = [
    { name: 'Semana 1', qualificados: 8, fechados: 2 },
    { name: 'Semana 2', qualificados: 12, fechados: 4 },
    { name: 'Semana 3', qualificados: 15, fechados: 3 },
    { name: 'Semana 4', qualificados: leads.filter(l => !l.inQueue).length % 20, fechados: dashboardMetrics.monthlyContracts },
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* HEADER DE BOAS-VINDAS */}
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Performance Comercial</h1>
          <p className="text-slate-500 text-lg font-medium">Gestor: <span className="text-[#c5a059] font-black uppercase text-sm">{currentUser.name}</span></p>
        </div>
        <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
           <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/20"></div>
           <span className="text-[10px] font-black text-[#0a192f] uppercase tracking-[0.2em]">Ciatos Intelligence Live</span>
        </div>
      </div>

      {/* QUADRO DE INDICADORES (TOP CARDS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="bg-[#0a192f] p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
          <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-4">Pipeline Ativo</p>
          <p className="text-3xl font-black serif-authority mb-2">R$ {(dashboardMetrics.pipelineTotal / 1000000).toFixed(1)}M</p>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Valor sob custódia comercial</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Eficiência de Proposta</p>
          <p className="text-4xl font-black text-indigo-600 serif-authority">{dashboardMetrics.convRate.toFixed(1)}%</p>
          <div className="mt-4 h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600" style={{ width: `${dashboardMetrics.convRate}%` }}></div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm group">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ações p/ Hoje</p>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-[#0a192f] serif-authority">{dashboardMetrics.actionsToday}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Eventos</p>
          </div>
          <p className="text-[9px] text-emerald-500 font-black uppercase tracking-widest mt-4">Disponibilidade de Agenda</p>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Contratos (Mês)</p>
          <p className="text-4xl font-black text-emerald-500 serif-authority">{dashboardMetrics.monthlyContracts}</p>
          <p className="text-[9px] text-slate-300 font-black uppercase tracking-widest mt-4">Meta Mensal: 10</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* GRÁFICO DE EVOLUÇÃO */}
        <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-10">
            <div>
               <h3 className="text-xl font-bold text-[#0a192f] serif-authority tracking-tight">Evolução do Funil Comercial</h3>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Leads Qualificados vs Fechamentos</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={12}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', shadow: 'none', fontWeight: 'bold' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'black', textTransform: 'uppercase' }} />
                <Bar name="Leads Qualificados" dataKey="qualificados" fill="#0a192f" radius={[6, 6, 0, 0]} barSize={40} />
                <Bar name="Contratos Fechados" dataKey="fechados" fill="#c5a059" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FEED DE ATIVIDADES (AUDITORIA LIVE) */}
        <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-sm font-black text-[#0a192f] uppercase tracking-widest serif-authority">Fluxo de Atividades</h3>
              <span className="text-[9px] font-black text-[#c5a059] bg-amber-50 px-2 py-1 rounded shadow-sm">LIVE</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 custom-scrollbar">
              {notifications.length > 0 ? notifications.slice(0, 10).map((note) => (
                <div key={note.id} className="p-6 hover:bg-slate-50 transition group cursor-default">
                   <div className="flex items-center gap-3 mb-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${note.type === 'success' ? 'bg-emerald-500' : note.type === 'warning' ? 'bg-amber-500' : 'bg-indigo-500'}`}></div>
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{note.timestamp}</p>
                   </div>
                   <p className="text-xs font-bold text-[#0a192f] leading-snug group-hover:text-[#c5a059] transition-colors">{note.title}</p>
                   <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">{note.message}</p>
                </div>
              )) : (
                <div className="h-full flex items-center justify-center p-10 opacity-20 italic text-sm font-bold">Aguardando novos eventos...</div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
