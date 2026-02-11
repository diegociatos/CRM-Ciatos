
import React from 'react';
import { LeadStatus } from '../types';

interface DataSummaryProps {
  data: any[];
}

const DataSummary: React.FC<DataSummaryProps> = ({ data }) => {
  const counts = {
    qualificacao: data.filter(l => l.inQueue).length,
    contato: data.filter(l => l.phaseId === 'ph-contato').length,
    agendada: data.filter(l => l.phaseId === 'ph-agend').length,
    proposta: data.filter(l => l.phaseId === 'ph-prop').length,
    negociacao: data.filter(l => l.phaseId === 'ph-nego').length,
    ganho: data.filter(l => l.status === 'Fechado (Ganho)').length,
  };

  const examples = {
    qual: data.find(l => l.inQueue),
    pipe: data.find(l => l.phaseId === 'ph-prop'),
    won: data.find(l => l.status === 'Fechado (Ganho)')
  };

  return (
    <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-xl space-y-12 animate-in fade-in duration-700">
      <div>
        <h2 className="text-4xl font-black text-[#0a192f] serif-authority mb-4">Relatório de Carga de Testes</h2>
        <p className="text-slate-500 font-medium">Resumo estatístico da base de dados mock gerada para validação.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        <StatCard label="Qualificação" value={counts.qualificacao} color="bg-slate-100 text-slate-600" />
        <StatCard label="Contato" value={counts.contato} color="bg-indigo-50 text-indigo-600" />
        <StatCard label="Reunião" value={counts.agendada} color="bg-amber-50 text-amber-600" />
        <StatCard label="Proposta" value={counts.proposta} color="bg-indigo-50 text-indigo-600" />
        <StatCard label="Negociação" value={counts.negociacao} color="bg-emerald-50 text-emerald-600" />
        <StatCard label="Contratos" value={counts.ganho} color="bg-[#0a192f] text-[#c5a059]" />
      </div>

      <div className="space-y-8">
        <h3 className="text-[11px] font-black text-[#c5a059] uppercase tracking-[0.3em] border-b border-slate-100 pb-3">Exemplos JSON por Estágio</h3>
        
        <div className="grid grid-cols-1 gap-8">
          <JsonExample title="1. Exemplo de Lead em Qualificação" data={examples.qual} />
          <JsonExample title="2. Exemplo de Lead no Pipeline (Proposta)" data={examples.pipe} />
          <JsonExample title="3. Exemplo de Contrato Fechado" data={examples.won} />
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string, value: number, color: string }) => (
  <div className={`${color} p-6 rounded-3xl text-center shadow-sm`}>
    <p className="text-3xl font-black serif-authority">{value}</p>
    <p className="text-[9px] font-black uppercase tracking-widest mt-1">{label}</p>
  </div>
);

const JsonExample = ({ title, data }: { title: string, data: any }) => (
  <div className="space-y-3">
    <p className="text-sm font-bold text-[#0a192f]">{title}</p>
    <pre className="bg-slate-900 text-emerald-400 p-6 rounded-2xl text-xs overflow-auto max-h-64 custom-scrollbar shadow-inner">
      {JSON.stringify(data, null, 2)}
    </pre>
  </div>
);

export default DataSummary;
