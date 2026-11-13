import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { demandDate, demandStatuses } from '../lib/supportDemands';
import { clientMonthCsv } from '../lib/supportTasks';
import type { ClientMonth } from '../lib/supportTasks';
import type { Lead, User } from '../types';

type Props = { organizationId: string; leads: Lead[]; users: User[]; client: typeof supabase };
export default function SupportClientReport(props: Props) { return <ClientReport key={props.organizationId} {...props} />; }
function ClientReport({ organizationId, leads, users, client }: Props) {
  const [leadId, setLeadId] = useState('');
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()));
  const [report, setReport] = useState<ClientMonth | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setReport(null); setError('');
    if (!leadId || !/^\d{4}-\d{2}$/.test(month)) { setLoading(false); return; }
    setLoading(true);
    void (async () => {
      const result = await client.rpc('support_client_month', { org: organizationId, client_id: leadId, month_start: month + '-01' });
      if (!active) return;
      if (result.error) setError('Relatório indisponível. Confira seu acesso e a atualização do banco.'); else setReport(result.data as ClientMonth);
    })().catch(() => { if (active) setError('Não foi possível carregar o relatório.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, organizationId, leadId, month, revision]);
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([clientMonthCsv(report)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `atendimento-${month}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="support-client-report" aria-label="Relatório mensal do cliente"><h2>Relatório mensal do cliente</h2><p>Demandas vinculadas ao cadastro, dentro da empresa selecionada e do seu acesso. Contatos manuais sem vínculo não são agrupados por nome.</p>
    <div className="demands-toolbar"><label>Cliente do relatório<select value={leadId} onChange={e => setLeadId(e.target.value)}><option value="">Selecione um cliente</option>{leads.map(l => <option key={l.id} value={l.id}>{l.company || l.name || l.email}</option>)}</select></label><label>Mês do relatório<input type="month" required value={month} onChange={e => setMonth(e.target.value)} /></label><button type="button" className="demands-secondary" disabled={!leadId || loading} onClick={() => setRevision(v => v + 1)}>Atualizar relatório</button><button type="button" className="demands-secondary" disabled={!report || loading} onClick={download}>Exportar relatório CSV</button></div>
    {!leads.length && <p>Nenhum cadastro de cliente disponível nesta visão. Abra a Central de demandas com um perfil autorizado ao cadastro comercial.</p>}
    {loading && <p role="status">Carregando relatório…</p>}{error && <p className="demands-error" role="alert">{error}</p>}
    {report && <><ul className="demands-stats"><li><span>Entradas no mês</span><strong>{report.opened}</strong></li><li><span>Últimas resoluções no mês</span><strong>{report.resolved}</strong></li><li><span>Pendentes agora</span><strong>{report.open_now}</strong></li><li><span>Resolução · horas corridas</span><strong>{report.avg_resolution_hours ?? '—'}</strong></li></ul><p>Período no fuso de São Paulo. A média considera a última resolução das demandas atualmente resolvidas; reabertas voltam às pendências. Pendentes agora não é o saldo histórico no fim do mês.</p>
      <ul className="support-task-list">{report.items.map(r => <li key={r.id}><div><strong>{r.title}</strong><span>{demandStatuses[r.status as keyof typeof demandStatuses]} · {users.find(u => u.id === r.assigned_to)?.name || 'Sem responsável disponível'}</span><span>Entrada: {demandDate(r.created_at)}{r.resolved_at ? ` · Resolução: ${demandDate(r.resolved_at)}` : r.due_at ? ` · Prazo: ${demandDate(r.due_at)}` : ''}</span></div></li>)}</ul>
      {!report.items.length && <p>Nenhuma entrada, resolução ou pendência atual para este cliente.</p>}{report.total > report.items.length && <p role="status">Exibindo e exportando {report.items.length} de {report.total} registros. Os indicadores incluem todos; a listagem é limitada a 200.</p>}</>}
  </section>;
}
