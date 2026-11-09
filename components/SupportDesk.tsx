import React, { useCallback, useEffect, useState } from 'react';
import type { supabase } from '../lib/supabase';
import { channelNames, channelStatusLabels, formatWait, periodLabels, periodRange, scopeLabels } from '../lib/supportDesk';
import type { DeskCase, DeskCounts, DeskOverview, DeskPeriod, DeskQueue, DeskScope, DeskSettings } from '../lib/supportDesk';
import { UserRole } from '../types';
import type { User } from '../types';
import './SupportDesk.css';

type Client = typeof supabase;
type Props = { organizationId: string; users: User[]; currentUser: User; client: Client; onOpenConversation: (id: string) => void };
const PAGE = 25;
const agentScopes: DeskScope[] = ['mine', 'unassigned', 'awaiting_first', 'awaiting_reply', 'attention', 'open'];
const fail = (error: unknown, fallback: string) => (error as { message?: string })?.message?.includes('Forbidden') ? 'Você não tem permissão para ver isto nesta empresa.' : fallback;

/** Atendimento: fila do atendente e visão do gestor. Os dados vêm de funções do banco que aplicam o perfil e a empresa. */
export default function SupportDesk({ organizationId, users, currentUser, client, onOpenConversation }: Props) {
  const manager = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MANAGER;
  const [tab, setTab] = useState<'queue' | 'manager'>('queue');
  return <section className="desk" aria-label="Atendimento">
    <header className="desk-header">
      <div><p className="desk-eyebrow">ATENDIMENTO · EMPRESA SELECIONADA</p><h1>Atendimento<span>.</span></h1>
        <p>O que chegou pelos canais conectados, quem está cuidando e o que ainda espera retorno. Hoje só entram respostas de e-mail a cadências da empresa.</p></div>
      {manager && <div className="desk-tabs" role="tablist" aria-label="Visão">
        <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'is-on' : ''} onClick={() => setTab('queue')}>Minha fila</button>
        <button role="tab" aria-selected={tab === 'manager'} className={tab === 'manager' ? 'is-on' : ''} onClick={() => setTab('manager')}>Visão do gestor</button>
      </div>}
    </header>
    {tab === 'queue' || !manager ? <AgentView organizationId={organizationId} users={users} client={client} onOpen={onOpenConversation} /> : <ManagerView organizationId={organizationId} users={users} client={client} onOpen={onOpenConversation} />}
  </section>;
}

function AgentView({ organizationId, users, client, onOpen }: { organizationId: string; users: User[]; client: Client; onOpen: (id: string) => void }) {
  const [scope, setScope] = useState<DeskScope>('mine');
  const [counts, setCounts] = useState<DeskCounts | null>(null);
  const [countError, setCountError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true; setCountError('');
    void client.rpc('support_queue_counts', { org: organizationId }).then(({ data, error }: any) => {
      if (!active) return;
      if (error) setCountError(fail(error, 'Não foi possível carregar os contadores. Confira a conexão e se a atualização do banco foi aplicada.')); else setCounts(data as DeskCounts);
    });
    return () => { active = false; };
  }, [client, organizationId, version]);
  return <>
    {countError && <p className="desk-error" role="alert">{countError}</p>}
    <div className="desk-chips" role="group" aria-label="Filas">
      {agentScopes.map(key => <button key={key} aria-pressed={scope === key} className={`desk-chip ${scope === key ? 'is-on' : ''} ${key === 'attention' && counts?.attention ? 'is-alert' : ''}`} onClick={() => setScope(key)}>
        {scopeLabels[key]}<b>{counts ? counts[key as keyof DeskCounts] ?? 0 : '—'}</b></button>)}
    </div>
    <CaseList organizationId={organizationId} users={users} client={client} scope={scope} onOpen={onOpen} onChanged={() => setVersion(v => v + 1)} searchable />
  </>;
}

type ListProps = { organizationId: string; users: User[]; client: Client; scope: DeskScope; onOpen: (id: string) => void; onChanged?: () => void; assignee?: string; range?: { from: string; to: string }; searchable?: boolean; refresh?: number };
function CaseList({ organizationId, users, client, scope, onOpen, onChanged, assignee, range, searchable, refresh }: ListProps) {
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [data, setData] = useState<DeskQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const nameOf = (id: string | null) => id ? users.find(u => u.id === id)?.name || 'Membro da equipe' : 'Sem responsável';
  useEffect(() => { const t = setTimeout(() => setTerm(query), 300); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setNotice(''); }, [scope, term, assignee, organizationId]);
  const args = useCallback((skip: number) => ({ org: organizationId, scope, query: term, max_rows: PAGE, skip_rows: skip, only_assignee: assignee || null, from_at: scope === 'received' || scope === 'reopened' ? range?.from ?? null : null, to_at: scope === 'received' || scope === 'reopened' ? range?.to ?? null : null }), [organizationId, scope, term, assignee, range?.from, range?.to]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void client.rpc('support_queue', args(0)).then(({ data: result, error: failure }: any) => {
      if (!active) return; setLoading(false);
      if (failure) { setError(fail(failure, 'Não foi possível carregar os atendimentos. Confira a conexão.')); setData(null); } else setData(result as DeskQueue);
    });
    return () => { active = false; };
  }, [client, args, reload, refresh]);
  const loadMore = async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    const { data: result, error: failure } = await client.rpc('support_queue', args(data.rows.length));
    setLoadingMore(false);
    if (failure) { setNotice('Não foi possível carregar mais. Tente novamente.'); return; }
    const more = (result as DeskQueue).rows;
    setData(old => old ? { total: (result as DeskQueue).total, rows: [...old.rows, ...more.filter(row => !old.rows.some(known => known.id === row.id))] } : old);
  };
  const assume = async (row: DeskCase) => {
    setNotice('');
    const { data: ok, error: failure } = await client.rpc('support_assume', { cid: row.id });
    if (failure) setNotice(fail(failure, 'Não foi possível assumir. Atualize a lista e tente de novo.'));
    else if (!ok) setNotice('Outra pessoa já assumiu este atendimento.');
    else setNotice('Atendimento assumido por você.');
    setReload(v => v + 1); onChanged?.();
  };
  return <div className="desk-list">
    {searchable && <div className="desk-search"><label htmlFor="desk-search">Buscar atendimento</label><input id="desk-search" placeholder="Contato, empresa, e-mail ou assunto" value={query} onChange={e => setQuery(e.target.value)} /></div>}
    {notice && <p className="desk-notice" role="status">{notice}</p>}
    {error && <p className="desk-error" role="alert">{error}</p>}
    {loading ? <p className="desk-empty">Carregando atendimentos…</p> : !data ? null : !data.rows.length ? <p className="desk-empty">{term ? 'Nenhum atendimento encontrado para esta busca.' : `Nada em “${scopeLabels[scope]}” por enquanto.`}</p> :
      <><p className="desk-count" aria-live="polite">{data.total} {data.total === 1 ? 'atendimento' : 'atendimentos'} em “{scopeLabels[scope]}”</p>
        <ul>{data.rows.map(row => <li key={row.id} className="desk-row">
          <div className="desk-row-main">
            <strong>{row.empresa || row.nome || 'Contato'}</strong><span className="desk-subject">{row.subject || '(sem assunto)'}</span>
            {row.last_text && <span className="desk-snippet">{row.last_text}</span>}
            <div className="desk-badges">
              {row.status === 'CLOSED' ? <em className="b-ok">Concluído</em> : !row.assigned_to ? <em className="b-warn">Sem responsável</em> : <em className="b-neutral">Com {nameOf(row.assigned_to)}</em>}
              {row.awaiting_human && row.status !== 'CLOSED' && <em className={row.reply_overdue ? 'b-alert' : 'b-warn'}>{row.first_human_reply_at ? 'Aguardando retorno' : 'Aguardando 1ª resposta'} há {formatWait(row.last_customer_message_at || row.created_at)}{row.reply_overdue ? ' · prazo vencido' : ''}</em>}
              {row.resolution_overdue && <em className="b-alert">Resolução atrasada</em>}
              {row.uncertain_send && <em className="b-alert">Envio sem confirmação: confira na caixa Microsoft 365</em>}
              {row.reopen_count > 0 && <em className="b-neutral">Reaberto {row.reopen_count}×</em>}
              {row.opt_out && <em className="b-neutral">Não contatar</em>}
            </div>
          </div>
          <div className="desk-row-actions">
            {row.status !== 'CLOSED' && !row.assigned_to && <button className="desk-secondary" onClick={() => void assume(row)} aria-label={`Assumir atendimento de ${row.empresa || row.nome || 'contato'}`}>Assumir</button>}
            <button className="desk-primary" onClick={() => onOpen(row.id)} aria-label={`Abrir atendimento de ${row.empresa || row.nome || 'contato'}`}>Abrir</button>
          </div>
        </li>)}</ul>
        {data.rows.length < data.total && <button className="desk-secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Carregando…' : 'Mostrar mais'}</button>}</>}
  </div>;
}

type Metric = { scope: DeskScope; key: keyof DeskOverview; label: string; help: string };
const metrics: Metric[] = [
  { scope: 'received', key: 'received', label: 'Recebidos no período', help: 'Atendimentos (conversas) iniciados no período. Não conta mensagens.' },
  { scope: 'awaiting_first', key: 'awaiting_first', label: 'Aguardando 1ª resposta humana', help: 'Abertos sem resposta humana aceita pelo provedor.' },
  { scope: 'awaiting_reply', key: 'awaiting_reply', label: 'Aguardando retorno ao cliente', help: 'Cliente escreveu e ainda não houve resposta humana depois.' },
  { scope: 'unassigned', key: 'unassigned', label: 'Sem responsável', help: 'Abertos sem atendente.' },
  { scope: 'attention', key: 'attention', label: 'Precisam de atenção', help: 'Retorno vencido, resolução atrasada ou envio a conferir.' },
  { scope: 'overdue_resolution', key: 'overdue_resolution', label: 'Resolução atrasada', help: 'Abertos além do prazo de resolução da empresa.' },
  { scope: 'uncertain', key: 'uncertain', label: 'Envios a conferir', help: 'Resposta enviada sem confirmação do provedor.' },
  { scope: 'reopened', key: 'reopened', label: 'Reabertos no período', help: 'Atendimentos concluídos que voltaram a abrir.' },
];

function ManagerView({ organizationId, users, client, onOpen }: { organizationId: string; users: User[]; client: Client; onOpen: (id: string) => void }) {
  const [period, setPeriod] = useState<DeskPeriod>('7d');
  const [assignee, setAssignee] = useState('');
  const [range, setRange] = useState(() => periodRange('7d'));
  const [overview, setOverview] = useState<DeskOverview | null>(null);
  const [settings, setSettings] = useState<DeskSettings | null>(null);
  const [scope, setScope] = useState<DeskScope>('attention');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => { setRange(periodRange(period)); }, [period, version]);
  useEffect(() => {
    let active = true; setError('');
    void Promise.all([
      client.rpc('support_desk_overview', { org: organizationId, from_at: range.from, to_at: range.to, only_assignee: assignee || null }),
      client.rpc('get_support_desk_settings', { org: organizationId }),
    ]).then(([o, s]: any[]) => {
      if (!active) return;
      if (o.error || s.error) setError(fail(o.error || s.error, 'Não foi possível carregar a visão do gestor. Confira a conexão e se a atualização do banco foi aplicada.'));
      else { setOverview(o.data as DeskOverview); setSettings(s.data as DeskSettings); }
    });
    return () => { active = false; };
  }, [client, organizationId, range.from, range.to, assignee, version]);
  const nameOf = (id: string | null) => id ? users.find(u => u.id === id)?.name || 'Membro da equipe' : 'Sem responsável';
  if (error) return <p className="desk-error" role="alert">{error}</p>;
  if (!overview || !settings) return <p className="desk-empty">Carregando visão do gestor…</p>;
  const hours = (v: number | null) => v === null ? '—' : `${v} h`;
  return <>
    <div className="desk-filters">
      <label>Período<select aria-label="Período" value={period} onChange={e => setPeriod(e.target.value as DeskPeriod)}>{Object.entries(periodLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Atendente<select aria-label="Atendente" value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Todos</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
      <small>Recebidos, tempos e reabertos usam o período. As demais contagens mostram a situação de agora.</small>
    </div>
    <ul className="desk-metrics" aria-label="Indicadores">
      {metrics.map(m => <li key={m.scope}><button aria-pressed={scope === m.scope} className={`${scope === m.scope ? 'is-on' : ''} ${(m.scope === 'attention' || m.scope === 'overdue_resolution' || m.scope === 'uncertain') && Number(overview[m.key]) > 0 ? 'is-alert' : ''}`} onClick={() => setScope(m.scope)} aria-label={`${m.label}: ${String(overview[m.key])}. Abrir lista`}>
        <strong>{String(overview[m.key])}</strong><span>{m.label}</span><small>{m.help}</small></button></li>)}
      <li><div className="desk-metric-static"><strong>{hours(overview.avg_first_response_hours)}</strong><span>Tempo médio até a 1ª resposta</span><small>Só atendimentos do período com resposta humana aceita.</small></div></li>
      <li><div className="desk-metric-static"><strong>{hours(overview.avg_resolution_hours)}</strong><span>Tempo médio de resolução</span><small>Atendimentos concluídos no período.</small></div></li>
      <li><div className="desk-metric-static"><strong>Não habilitada</strong><span>Confirmação automática</span><small>{overview.auto_confirmation.note}</small></div></li>
    </ul>
    <h2 className="desk-h2">{scopeLabels[scope]}</h2>
    <CaseList organizationId={organizationId} users={users} client={client} scope={scope} assignee={assignee || undefined} range={range} onOpen={onOpen} onChanged={() => setVersion(v => v + 1)} />
    <div className="desk-grid">
      <div className="desk-panel"><h2>Carga por atendente</h2>
        {!overview.by_assignee.length ? <p className="desk-empty">Sem atendimentos abertos.</p> : <ul>{overview.by_assignee.map(row => <li key={row.assigned_to || 'none'}><span>{nameOf(row.assigned_to)}</span><span>{row.open} abertos · {row.waiting} aguardando retorno</span></li>)}</ul>}</div>
      <div className="desk-panel"><h2>Saúde e cobertura dos canais</h2>
        <ul>{overview.channels.map(channel => <li key={channel.channel} className="desk-channel"><div><strong>{channelNames[channel.channel]}</strong><em className={`ch-${channel.status}`}>{channelStatusLabels[channel.status]}</em></div>
          <small>{channel.coverage}</small>
          {channel.last_sync_at && <small>Última sincronização: {new Date(channel.last_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>}
          {channel.last_error && <small className="desk-error-text">Falha: {channel.last_error}</small>}</li>)}</ul>
        <p className="desk-fine">“Nenhum atendimento” só significa ausência de mensagens importadas; confira o estado do canal acima.</p></div>
    </div>
    <DeskSettingsPanel organizationId={organizationId} users={users} client={client} settings={settings} onSaved={() => setVersion(v => v + 1)} />
  </>;
}

function DeskSettingsPanel({ organizationId, users, client, settings, onSaved }: { organizationId: string; users: User[]; client: Client; settings: DeskSettings; onSaved: () => void }) {
  const [first, setFirst] = useState(String(settings.first_response_hours));
  const [resolution, setResolution] = useState(String(settings.resolution_hours));
  const [person, setPerson] = useState('');
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const support = users.filter(u => u.role === UserRole.SUPPORT);
  const candidates = users.filter(u => u.role !== UserRole.SUPPORT && u.role !== UserRole.ADMIN);
  const run = async (fn: () => PromiseLike<{ error: unknown }>, done: string) => {
    if (busy) return; setBusy(true); setMessage(''); setFailure('');
    const { error } = await fn(); setBusy(false);
    if (error) setFailure(fail(error, (error as { message?: string }).message || 'Não foi possível salvar.')); else { setMessage(done); onSaved(); }
  };
  if (!settings.can_manage) return <details className="desk-settings"><summary>Prazos desta empresa</summary><p className="desk-fine">1ª resposta em {settings.first_response_hours} h · resolução em {settings.resolution_hours} h. Somente administradores alteram.</p></details>;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const a = Number(first), b = Number(resolution);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) { setFailure('Informe números inteiros de horas, maiores que zero.'); return; }
    void run(() => client.rpc('save_support_desk_settings', { org: organizationId, first_hours: a, resolution_hours: b }), 'Prazos salvos. Valem para a fila e o painel.');
  };
  return <details className="desk-settings"><summary>Prazos e perfil de Suporte</summary>
    <form onSubmit={save}>
      <p className="desk-fine">Os prazos de primeira resposta e de resolução são separados e contados em horas corridas.</p>
      <div className="desk-field-pair"><label>Prazo de 1ª resposta (horas)<input inputMode="numeric" value={first} onChange={e => setFirst(e.target.value)} /></label><label>Prazo de resolução (horas)<input inputMode="numeric" value={resolution} onChange={e => setResolution(e.target.value)} /></label></div>
      <button className="desk-primary" disabled={busy}>Salvar prazos</button>
    </form>
    <div className="desk-support-people">
      <h3>Pessoas com perfil de Suporte</h3>
      <p className="desk-fine">O perfil de Suporte vê só o Atendimento, o Inbox e as Demandas desta empresa. Não acessa leads, configurações, exportações nem o comercial. Nenhum acesso existente muda sem você escolher a pessoa aqui.</p>
      {support.length ? <ul>{support.map(u => <li key={u.id}><span>{u.name}</span><button className="desk-secondary" disabled={busy} onClick={() => void run(() => client.rpc('set_support_profile', { org: organizationId, person: u.id, enabled: false, fallback_role: 'SDR' }), `${u.name} voltou ao perfil SDR.`)}>Remover perfil</button></li>)}</ul> : <p className="desk-empty">Ninguém com este perfil ainda.</p>}
      <div className="desk-field-pair"><label>Definir como Suporte<select aria-label="Pessoa para o perfil de Suporte" value={person} onChange={e => setPerson(e.target.value)}><option value="">Escolha uma pessoa</option>{candidates.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select></label>
        <button className="desk-secondary" disabled={busy || !person} onClick={() => void run(() => client.rpc('set_support_profile', { org: organizationId, person, enabled: true, fallback_role: 'SDR' }), 'Perfil de Suporte atribuído. O acesso muda no próximo carregamento da pessoa.')}>Atribuir perfil</button></div>
    </div>
    {failure && <p className="desk-error" role="alert">{failure}</p>}{message && <p className="desk-notice" role="status">{message}</p>}
  </details>;
}
