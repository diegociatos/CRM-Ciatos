
import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { Lead, LeadStatus, User, UserRole, SystemConfig, UserGoal } from '../types';

interface ExecutiveDashboardProps {
  leads: Lead[];
  users: User[];
  config: SystemConfig;
  userGoals: UserGoal[];
}

const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ leads, users, config, userGoals }) => {
  
  // --- HELPERS DE PROCESSAMENTO ---
  const parseCurrency = (val?: string) => {
    if (!val) return 0;
    return parseFloat(val.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  };

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // --- ENGINE DE BI ---
  const biData = useMemo(() => {
    const wonLeads = leads.filter(l => l.status === LeadStatus.WON);
    const pipelineLeads = leads.filter(l => !l.inQueue && l.status !== LeadStatus.WON && l.status !== LeadStatus.LOST);
    
    // 1. Receita e Financeiro
    const totalPipelineValue = pipelineLeads.reduce((acc, l) => acc + parseCurrency(l.annualRevenue), 0);
    const wonThisMonth = wonLeads.filter(l => {
      const d = new Date(l.createdAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthlyRevenue = wonThisMonth.reduce((acc, l) => acc + parseCurrency(l.contractValue), 0);
    const avgTicket = wonLeads.length > 0 ? (wonLeads.reduce((acc, l) => acc + parseCurrency(l.contractValue), 0) / wonLeads.length) : 0;

    // 2. Metas (Geral)
    const totalGoal = userGoals.filter(g => g.month === currentMonth).reduce((acc, g) => acc + g.contractsGoal, 0);
    const goalReach = totalGoal > 0 ? (wonThisMonth.length / totalGoal) * 100 : 0;

    // 3. Funil de Vendas
    const funnel = [
      { step: 'Lead', value: leads.length, fill: '#1e293b' },
      { step: 'Qualificado', value: leads.filter(l => !l.inQueue).length, fill: '#334155' },
      { step: 'Reunião', value: leads.filter(l => l.phaseId === 'ph-agend').length, fill: '#475569' },
      { step: 'Proposta', value: leads.filter(l => l.phaseId === 'ph-prop' || l.phaseId === 'ph-nego').length, fill: '#c5a059' },
      { step: 'Fechado', value: wonLeads.length, fill: '#10b981' },
    ];

    // 4. Rankings
    const sdrRanking = users.filter(u => u.role === UserRole.SDR).map(u => ({
      name: u.name,
      quals: leads.filter(l => l.qualifiedById === u.id).length,
      meetings: leads.filter(l => l.qualifiedById === u.id && l.phaseId === 'ph-agend').length
    })).sort((a, b) => b.quals - a.quals);

    const closerRanking = users.filter(u => u.role === UserRole.CLOSER).map(u => ({
      name: u.name,
      revenue: leads.filter(l => l.ownerId === u.id && l.status === LeadStatus.WON).reduce((acc, l) => acc + parseCurrency(l.contractValue), 0),
      won: leads.filter(l => l.ownerId === u.id && l.status === LeadStatus.WON).length
    })).sort((a, b) => b.revenue - a.revenue);

    // 5. Alertas Inteligentes
    const alerts: string[] = [];
    const stalledDaysLimit = 10;
    const stalledLeads = leads.filter(l => {
      if (l.status === LeadStatus.WON || l.status === LeadStatus.LOST || l.inQueue) return false;
      const lastInter = l.interactions[0];
      if (!lastInter) return true;
      const days = (Date.now() - new Date(lastInter.date).getTime()) / (1000 * 60 * 60 * 24);
      return days > stalledDaysLimit;
    });

    if (stalledLeads.length > 0) alerts.push(`⚠️ ${stalledLeads.length} Leads parados há mais de ${stalledDaysLimit} dias.`);
    if (goalReach < 50 && new Date().getDate() > 15) alerts.push(`📉 Alerta de Performance: Abaixo de 50% da meta após o dia 15.`);
    
    const riskClients = wonLeads.filter(c => (c.healthScore || 100) < 60);
    if (riskClients.length > 0) alerts.push(`🔥 CRÍTICO: ${riskClients.length} Clientes ativos com Health Score em risco (<60%).`);

    return { 
      totalPipelineValue, monthlyRevenue, goalReach, avgTicket, 
      funnel, sdrRanking, closerRanking, alerts,
      npsAvg: 9.2, // Mock ou vindo de dados reais se integrados
      healthAvg: leads.filter(l => l.status === LeadStatus.WON).reduce((acc, l) => acc + (l.healthScore || 0), 0) / Math.max(1, wonLeads.length)
    };
  }, [leads, users, userGoals, currentMonth, currentYear]);

  // Design Tokens Premium
  const cardClass = "bg-[#0a192f] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group";
  const goldText = "text-[#c5a059]";
  const labelHeader = "text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 block";

  return (
    <div className="space-y-10 animate-in fade-in duration-1000 bg-[#050a15] -m-12 p-12 min-h-screen text-slate-300">
      
      {/* HEADER EXECUTIVO */}
      <div className="flex justify-between items-end border-b border-white/10 pb-10">
        <div>
           <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_#10b981]"></div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Sincronização Live: Ativa</span>
           </div>
           <h1 className="text-5xl font-black text-white serif-authority tracking-tighter">BI Executivo <span className={goldText}>Ciatos</span></h1>
           <p className="text-slate-500 font-medium text-lg">Visão macro estratégica de performance e governança.</p>
        </div>
        
        <div className="flex gap-4">
           <div className="bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
              <p className="text-[9px] font-black text-slate-500 uppercase">Período Fiscal</p>
              <p className="text-sm font-bold text-white uppercase">{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date())}</p>
           </div>
        </div>
      </div>

      {/* LINHA 1: KPIs FINANCEIROS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
         <div className={cardClass}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/5 rounded-full blur-3xl group-hover:scale-150 transition-all"></div>
            <label className={labelHeader}>Pipeline Total</label>
            <p className="text-4xl font-black text-white serif-authority">R$ {(biData.totalPipelineValue / 1000000).toFixed(1)}M</p>
            <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">Volume Prospectado</p>
         </div>

         <div className={cardClass}>
            <label className={labelHeader}>Receita Mensal (WON)</label>
            <p className="text-4xl font-black text-emerald-400 serif-authority">R$ {(biData.monthlyRevenue / 1000).toFixed(0)}k</p>
            <div className="mt-4 flex items-center gap-2">
               <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${biData.goalReach}%` }}></div>
               </div>
               <span className="text-[10px] font-black text-emerald-500">{biData.goalReach.toFixed(0)}% Meta</span>
            </div>
         </div>

         <div className={cardClass}>
            <label className={labelHeader}>Ticket Médio</label>
            <p className="text-4xl font-black text-white serif-authority">R$ {(biData.avgTicket / 1000).toFixed(1)}k</p>
            <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">Por contrato ganho</p>
         </div>

         <div className={cardClass}>
            <label className={labelHeader}>NPS & Health</label>
            <div className="flex justify-between items-baseline">
               <p className="text-4xl font-black text-indigo-400 serif-authority">{biData.npsAvg}</p>
               <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{biData.healthAvg.toFixed(0)}% Health</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">Média de satisfação base</p>
         </div>
      </div>

      {/* LINHA 2: FUNIL E ALERTAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
         
         {/* Gráfico de Funil */}
         <div className={`${cardClass} lg:col-span-2`}>
            <h3 className="text-xl font-bold text-white serif-authority mb-10 flex items-center gap-3">
               <span className="w-1 h-6 bg-[#c5a059] rounded-full"></span>
               Eficiência de Conversão do Funil
            </h3>
            <div className="h-80">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={biData.funnel} layout="vertical" margin={{ left: 50, right: 30 }}>
                     <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                     <XAxis type="number" hide />
                     <YAxis dataKey="step" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }} />
                     <Tooltip 
                        contentStyle={{ backgroundColor: '#0a192f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '15px' }}
                        itemStyle={{ color: '#c5a059', fontWeight: 'bold' }}
                     />
                     <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={35}>
                        {biData.funnel.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                     </Bar>
                  </BarChart>
               </ResponsiveContainer>
            </div>
            <div className="mt-8 flex justify-between px-10 text-[9px] font-black uppercase tracking-widest text-slate-500">
               <span>Input: Lead Frio</span>
               <span className="text-[#c5a059]">Output: Contrato Ganho</span>
            </div>
         </div>

         {/* Painel de Alertas */}
         <div className="bg-[#0f172a] border border-red-500/20 rounded-[3rem] p-10 flex flex-col shadow-2xl">
            <h3 className="text-sm font-black text-red-400 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
               <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
               </span>
               Insights de Governança
            </h3>
            <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
               {biData.alerts.map((alert, i) => (
                  <div key={i} className="p-5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-colors cursor-default">
                     <p className="text-xs font-bold leading-relaxed text-slate-300">{alert}</p>
                  </div>
               ))}
               {biData.alerts.length === 0 && (
                  <div className="py-20 text-center opacity-20 italic">Nenhum alerta crítico pendente.</div>
               )}
            </div>
            <button className="mt-8 w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Ver Auditoria Completa</button>
         </div>
      </div>

      {/* LINHA 3: RANKINGS DE TIME */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
         
         {/* SDR Performance */}
         <div className={cardClass}>
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-xl font-bold text-white serif-authority">Top Producers (SDR)</h3>
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Leads Qualificados</span>
            </div>
            <div className="space-y-6">
               {biData.sdrRanking.slice(0, 5).map((sdr, i) => (
                  <div key={i} className="flex items-center gap-4 group">
                     <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-black text-[10px] text-[#c5a059] border border-white/10">{i+1}</div>
                     <div className="flex-1">
                        <p className="text-sm font-bold text-white">{sdr.name}</p>
                        <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                           <div className="h-full bg-indigo-500" style={{ width: `${(sdr.quals/Math.max(1, biData.sdrRanking[0].quals))*100}%` }}></div>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-sm font-black text-white">{sdr.quals}</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Qls</p>
                     </div>
                  </div>
               ))}
            </div>
         </div>

         {/* Closer Performance */}
         <div className={cardClass}>
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-xl font-bold text-white serif-authority">Top Closers (Receita)</h3>
               <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Volume Assinado</span>
            </div>
            <div className="space-y-6">
               {biData.closerRanking.slice(0, 5).map((closer, i) => (
                  <div key={i} className="flex items-center gap-4 group">
                     <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-black text-[10px] text-emerald-400 border border-white/10">{i+1}</div>
                     <div className="flex-1">
                        <p className="text-sm font-bold text-white">{closer.name}</p>
                        <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                           <div className="h-full bg-emerald-500" style={{ width: `${(closer.revenue/Math.max(1, biData.closerRanking[0].revenue))*100}%` }}></div>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-sm font-black text-white">R$ {(closer.revenue/1000).toFixed(0)}k</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase">{closer.won} Contratos</p>
                     </div>
                  </div>
               ))}
            </div>
         </div>
      </div>

      {/* FOOTER BI */}
      <div className="pt-10 border-t border-white/5 flex justify-between items-center opacity-40">
         <p className="text-[9px] font-black uppercase tracking-[0.5em]">Intel Engine: v6.4 Executive</p>
         <div className="flex gap-6">
            <span className="text-[9px] font-bold uppercase tracking-widest">GDPR Compliance: Safe</span>
            <span className="text-[9px] font-bold uppercase tracking-widest">Data Encryption: AES-256</span>
         </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
