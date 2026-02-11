
import React, { useMemo, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area, ComposedChart,
  ScatterChart, Scatter, ZAxis
} from 'recharts';
import { Lead, LeadStatus, Campaign, AutomationFlow, InteractionType } from '../types';

interface ReportsDashboardProps {
  leads: Lead[];
  campaigns?: Campaign[];
  automationFlows?: AutomationFlow[];
}

const COLORS = ['#0a192f', '#c5a059', '#10b981', '#6366f1', '#f59e0b'];
const CHANNEL_COLORS: Record<string, string> = {
  'EMAIL': '#6366f1',
  'WHATSAPP': '#10b981',
  'SMS': '#f59e0b'
};

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ leads, campaigns = [], automationFlows = [] }) => {
  const [activeView, setActiveView] = useState<'funnel' | 'channels' | 'segments'>('funnel');

  const analytics = useMemo(() => {
    const total = leads.length;
    
    // 1. Funil de Conversão (Marketing -> Sales)
    const contacted = leads.filter(l => l.interactions.length > 0).length;
    const qualified = leads.filter(l => l.phaseId !== 'ph-gen' && l.phaseId !== 'ph-qual').length;
    const meetings = leads.filter(l => l.phaseId === 'ph-agend' || l.phaseId === 'ph-prop' || l.phaseId === 'ph-fech').length;

    const funnelData = [
      { step: 'Base Total', value: total, fill: '#0a192f' },
      { step: 'Contatados', value: contacted, fill: '#112240' },
      { step: 'Qualificados', value: qualified, fill: '#1e293b' },
      { step: 'Reuniões', value: meetings, fill: '#c5a059' },
    ];

    // 2. Performance por Canal (Email vs WhatsApp)
    const channelMetrics = [
      { name: 'E-mail', open: 22.4, click: 4.8, response: 1.2, color: CHANNEL_COLORS.EMAIL },
      { name: 'WhatsApp', open: 98.2, click: 42.5, response: 24.8, color: CHANNEL_COLORS.WHATSAPP },
    ];

    // 3. Engajamento por Segmento
    const segments = Array.from(new Set(leads.map(l => l.segment))).filter(Boolean);
    const segmentData = segments.map(seg => {
      const segLeads = leads.filter(l => l.segment === seg);
      const meetingRate = segLeads.length > 0 
        ? (segLeads.filter(l => l.phaseId === 'ph-agend').length / segLeads.length) * 100 
        : 0;
      return {
        name: seg,
        conversion: parseFloat(meetingRate.toFixed(1)),
        leads: segLeads.length
      };
    }).sort((a, b) => b.conversion - a.conversion).slice(0, 5);

    return { funnelData, channelMetrics, segmentData, meetings, conversionRate: total > 0 ? (meetings/total)*100 : 0 };
  }, [leads]);

  const renderFunnel = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
        <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-8 flex items-center gap-3">
          <span className="w-1.5 h-6 bg-[#0a192f] rounded-full"></span>
          Funil de Conversão de Marketing
        </h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.funnelData} layout="vertical" margin={{ left: 40, right: 40 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="step" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} width={100} />
              <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={40}>
                {analytics.funnelData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-50 pt-8">
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Qualificação</p>
              <p className="text-xl font-black text-[#0a192f]">42.5%</p>
           </div>
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Conversão em Reunião</p>
              <p className="text-xl font-black text-[#c5a059]">{analytics.conversionRate.toFixed(1)}%</p>
           </div>
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ciclo Médio (Mkt-Agend)</p>
              <p className="text-xl font-black text-[#0a192f]">4.2 Dias</p>
           </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[#0a192f] p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#c5a059]/10 rounded-full blur-3xl"></div>
          <p className="text-[10px] font-black text-[#c5a059] uppercase tracking-[0.2em] mb-4">Reuniões Geradas (Mês)</p>
          <p className="text-5xl font-black serif-authority mb-2">{analytics.meetings}</p>
          <p className="text-xs text-slate-400 font-medium">Equivalente a <span className="text-emerald-400 font-bold">R$ 1.2M</span> em pipeline potencial.</p>
        </div>
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
           <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Eficiência de Atendimento</h4>
           <div className="space-y-4">
              {[
                { label: 'SDR Response Time', val: '14min', color: 'bg-emerald-500' },
                { label: 'Lead Scoring Accuracy', val: '89%', color: 'bg-[#c5a059]' }
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                   <span className="text-[10px] font-bold text-slate-500 uppercase">{item.label}</span>
                   <span className="text-sm font-black text-[#0a192f]">{item.val}</span>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );

  const renderChannels = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
       <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-8">Comparativo de Engajamento: Email vs Whats</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.channelMetrics} barGap={15}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 'bold' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold' }} />
                <Bar name="Abertura %" dataKey="open" fill="#0a192f" radius={[4, 4, 0, 0]} />
                <Bar name="Clique %" dataKey="click" fill="#c5a059" radius={[4, 4, 0, 0]} />
                <Bar name="Resposta %" dataKey="response" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
       </div>

       <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-10 text-center">ROI por Canal (Projetado)</h3>
          <div className="space-y-12">
             {analytics.channelMetrics.map(c => (
               <div key={c.name} className="space-y-4">
                  <div className="flex justify-between items-end">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">{c.name}</p>
                    <p className="text-2xl font-black text-[#0a192f] serif-authority">{c.response > 10 ? 'Alta Conversão' : 'Nutrição Fria'}</p>
                  </div>
                  <div className="h-4 w-full bg-slate-50 rounded-full border border-slate-100 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${c.color === CHANNEL_COLORS.EMAIL ? 'bg-[#6366f1]' : 'bg-emerald-500'}`} 
                      style={{ width: `${c.response * 3}%` }}
                    ></div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium italic">Baseado em {c.name === 'WhatsApp' ? 'disparos via API Ciatos' : 'campanhas de e-mail marketing'}.</p>
               </div>
             ))}
          </div>
       </div>
    </div>
  );

  const renderSegments = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in zoom-in-95 duration-500">
       <div className="lg:col-span-2 bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm">
          <h3 className="text-xl font-bold text-[#0a192f] serif-authority mb-10">Engajamento por Segmento (Booking Rate %)</h3>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
               <ComposedChart data={analytics.segmentData}>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="conversion" fill="#c5a059" radius={[8, 8, 0, 0]} barSize={50} name="% de Reuniões" />
                  <Line type="monotone" dataKey="leads" stroke="#0a192f" strokeWidth={3} dot={{ r: 6, fill: '#0a192f' }} name="Volume de Leads" />
               </ComposedChart>
            </ResponsiveContainer>
          </div>
       </div>

       <div className="bg-[#0a192f] p-10 rounded-[3rem] text-white flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-black text-[#c5a059] uppercase tracking-[0.3em] mb-8">Vencedor por Segmento</h4>
            <p className="text-3xl font-bold serif-authority mb-4">{analytics.segmentData[0]?.name || 'N/A'}</p>
            <p className="text-sm text-slate-400 leading-relaxed">
              O segmento de <span className="text-white font-bold">{analytics.segmentData[0]?.name}</span> apresenta a melhor resposta às teses tributárias este mês, com <span className="text-[#c5a059] font-bold">{analytics.segmentData[0]?.conversion}%</span> de conversão em reunião.
            </p>
          </div>
          <button className="w-full mt-10 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition">Ver Oportunidades no Setor</button>
       </div>
    </div>
  );

  return (
    <div className="space-y-10">
      {/* Header Corporativo */}
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-[#0a192f] mb-2 serif-authority tracking-tight">Marketing BI & Performance</h1>
          <p className="text-slate-500 text-lg font-medium">Análise granular de conversão e ROI por canal.</p>
        </div>
        <div className="flex bg-slate-100 p-1.5 rounded-[1.5rem] gap-1 shadow-inner border border-slate-200">
          {(['funnel', 'channels', 'segments'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveView(tab)}
              className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === tab ? 'bg-white text-[#0a192f] shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {tab === 'funnel' ? 'Funil de Vendas' : tab === 'channels' ? 'Canais Direct' : 'Por Segmento'}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'funnel' && renderFunnel()}
      {activeView === 'channels' && renderChannels()}
      {activeView === 'segments' && renderSegments()}

      {/* Grid de Relatórios Sugeridos (Footer) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: 'Relatório de CTR', desc: 'Performance de links em e-mails.' },
          { title: 'Conversão WhatsApp', desc: 'Análise de resposta por SDR.' },
          { title: 'Saúde do Funil', desc: 'Tempo médio entre fases.' },
          { title: 'Qualidade da Base', desc: 'Score de ICP médio por região.' }
        ].map(report => (
          <div key={report.title} className="p-6 bg-white border border-slate-100 rounded-2xl hover:border-[#c5a059] transition cursor-pointer group shadow-sm">
             <h5 className="text-[11px] font-black text-[#0a192f] uppercase tracking-widest mb-2 group-hover:text-[#c5a059] transition">{report.title}</h5>
             <p className="text-[10px] text-slate-400 font-medium">{report.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportsDashboard;
