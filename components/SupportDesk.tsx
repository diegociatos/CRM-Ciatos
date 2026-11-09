import React, { useCallback, useEffect, useState } from 'react';
import type { supabase } from '../lib/supabase';
import { ackBadge, channelNames, channelStatusLabels, formatWait, periodLabels, periodRange, scopeLabels } from '../lib/supportDesk';
import type { ChannelConfig, MetaAccountsConfig, DeskCase, DeskCounts, DeskOverview, DeskPeriod, DeskQueue, DeskScope, DeskSettings } from '../lib/supportDesk';
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
        <p>O que chegou pelos canais conectados, quem está cuidando e o que ainda espera retorno. Entram as respostas a cadências e, só se a empresa configurar, o e-mail de suporte, o WhatsApp e o Instagram dela.</p></div>
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
            <strong>{row.empresa || row.nome || row.email || (row.whatsapp_id ? `+${row.whatsapp_id}` : 'Contato')}{row.protocol && <small className="desk-protocol"> · {row.protocol}</small>}{row.channel && row.channel !== 'email' && <small className="desk-protocol"> · {channelNames[row.channel]}</small>}</strong><span className="desk-subject">{row.subject || '(sem assunto)'}</span>
            {row.last_text && <span className="desk-snippet">{row.last_text}</span>}
            <div className="desk-badges">
              {row.status === 'CLOSED' ? <em className="b-ok">Concluído</em> : !row.assigned_to ? <em className="b-warn">Sem responsável</em> : <em className="b-neutral">Com {nameOf(row.assigned_to)}</em>}
              {row.awaiting_human && row.status !== 'CLOSED' && <em className={row.reply_overdue ? 'b-alert' : 'b-warn'}>{row.first_human_reply_at ? 'Aguardando retorno' : 'Aguardando 1ª resposta'} há {formatWait(row.last_customer_message_at || row.created_at)}{row.reply_overdue ? ' · prazo vencido' : ''}</em>}
              {row.resolution_overdue && <em className="b-alert">Resolução atrasada</em>}
              {row.uncertain_send && <em className="b-alert">Envio sem confirmação: confira na caixa Microsoft 365</em>}
              {row.ack_status && row.ack_status !== 'CANCELLED' && <em className={row.ack_status === 'FAILED' || row.ack_status === 'UNCERTAIN' ? 'b-alert' : row.ack_status === 'ACCEPTED' ? 'b-neutral' : 'b-warn'}>{ackBadge[row.ack_status].text}</em>}
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
  { scope: 'ack_pending', key: 'ack_pending', label: 'Confirmações pendentes', help: 'Na fila ou em envio. Ainda não aceitas pelo provedor.' },
  { scope: 'ack_failed', key: 'ack_failed', label: 'Confirmações com falha ou incertas', help: 'Exigem conferência; nada é reenviado sem decisão.' },
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
      {metrics.map(m => <li key={m.scope}><button aria-pressed={scope === m.scope} className={`${scope === m.scope ? 'is-on' : ''} ${(m.scope === 'attention' || m.scope === 'overdue_resolution' || m.scope === 'uncertain' || m.scope === 'ack_failed') && Number(overview[m.key]) > 0 ? 'is-alert' : ''}`} onClick={() => setScope(m.scope)} aria-label={`${m.label}: ${String(overview[m.key])}. Abrir lista`}>
        <strong>{String(overview[m.key])}</strong><span>{m.label}</span><small>{m.help}</small></button></li>)}
      <li><div className="desk-metric-static"><strong>{hours(overview.avg_first_response_hours)}</strong><span>Tempo médio até a 1ª resposta</span><small>Só atendimentos do período com resposta humana aceita.</small></div></li>
      <li><div className="desk-metric-static"><strong>{hours(overview.avg_resolution_hours)}</strong><span>Tempo médio de resolução</span><small>Atendimentos concluídos no período.</small></div></li>
      <li><div className="desk-metric-static"><strong>{overview.auto_confirmation.enabled ? 'Habilitada' : 'Não habilitada'}</strong><span>Confirmação automática</span><small>{overview.auto_confirmation.note}</small></div></li>
    </ul>
    <h2 className="desk-h2">{scopeLabels[scope]}</h2>
    <CaseList organizationId={organizationId} users={users} client={client} scope={scope} assignee={assignee || undefined} range={range} onOpen={onOpen} onChanged={() => setVersion(v => v + 1)} />
    <div className="desk-grid">
      <div className="desk-panel"><h2>Carga por atendente</h2>
        {!overview.by_assignee.length ? <p className="desk-empty">Sem atendimentos abertos.</p> : <ul>{overview.by_assignee.map(row => <li key={row.assigned_to || 'none'}><span>{nameOf(row.assigned_to)}</span><span>{row.open} abertos · {row.waiting} aguardando retorno</span></li>)}</ul>}</div>
      <div className="desk-panel"><h2>Saúde e cobertura dos canais</h2>
        <ul>{overview.channels.map(channel => <li key={channel.channel} className="desk-channel"><div><strong>{channel.label || channelNames[channel.channel]}</strong><em className={`ch-${channel.status}`}>{channelStatusLabels[channel.status]}</em></div>
          <small>{channel.coverage}</small>
          {channel.last_sync_at && <small>Última sincronização: {new Date(channel.last_sync_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>}
          {channel.last_error && <small className="desk-error-text">Falha: {channel.last_error}</small>}</li>)}</ul>
        <p className="desk-fine">“Nenhum atendimento” só significa ausência de mensagens importadas; confira o estado do canal acima.</p></div>
    </div>
    <DeskSettingsPanel organizationId={organizationId} users={users} client={client} settings={settings} onSaved={() => setVersion(v => v + 1)} />
    <ChannelPanel organizationId={organizationId} client={client} reloadKey={version} onSaved={() => setVersion(v => v + 1)} />
    <MetaPanel organizationId={organizationId} client={client} reloadKey={version} onSaved={() => setVersion(v => v + 1)} />
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

const sampleText = (text: string) => text.replace('{{protocolo}}', 'ATD-000123').replace('{{nome}}', 'Maria');
function ChannelPanel({ organizationId, client, reloadKey, onSaved }: { organizationId: string; client: Client; reloadKey: number; onSaved: () => void }) {
  const [config, setConfig] = useState<ChannelConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mailbox, setMailbox] = useState('');
  const [ingest, setIngest] = useState(false);
  const [ack, setAck] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let active = true;
    void client.rpc('get_support_channel', { org: organizationId }).then(({ data, error }: any) => {
      if (!active) return;
      if (error) { setLoadError('Não foi possível carregar o canal de e-mail de suporte.'); return; }
      const c = data as ChannelConfig; setLoadError(''); setConfig(c);
      setMailbox(c.account.mailbox || ''); setIngest(c.account.ingest_enabled); setAck(c.account.auto_ack_enabled);
      setSubject(c.template.subject || 'Recebemos sua mensagem · protocolo {{protocolo}}');
      setBody(c.template.body || 'Olá {{nome}}, recebemos sua mensagem e ela foi registrada com o protocolo {{protocolo}}. Uma pessoa da equipe vai analisar e retornar.');
    });
    return () => { active = false; };
  }, [client, organizationId, reloadKey]);
  const run = async (fn: () => PromiseLike<{ error: unknown }>, done: string) => {
    if (busy) return; setBusy(true); setMessage(''); setFailure('');
    const { error } = await fn(); setBusy(false);
    if (error) setFailure((error as { message?: string }).message || 'Não foi possível salvar.'); else { setMessage(done); onSaved(); }
  };
  if (loadError) return <p className="desk-error" role="alert">{loadError}</p>;
  if (!config) return null;
  const canEdit = config.can_manage;
  const status = config.template.status;
  return <details className="desk-settings"><summary>E-mail de suporte e confirmação automática</summary>
    <p className="desk-fine">A leitura começa na ativação e importa só mensagens novas da caixa de entrada; não importa histórico. Nada é lido nem enviado enquanto as chaves do servidor não estiverem ligadas e a caixa Microsoft 365 não estiver autorizada. A confirmação nunca promete prazo e só vale com o texto aprovado.</p>
    <div className="desk-field-pair">
      <label>Caixa de suporte da empresa<input aria-label="Caixa de suporte" type="email" value={mailbox} disabled={!canEdit} onChange={e => setMailbox(e.target.value)} placeholder="suporte@suaempresa.com.br" /></label>
      <div><label className="desk-check"><input type="checkbox" checked={ingest} disabled={!canEdit} onChange={e => { setIngest(e.target.checked); if (!e.target.checked) setAck(false); }} /> Ler a caixa de suporte</label>
        <label className="desk-check"><input type="checkbox" checked={ack} disabled={!canEdit || !ingest || status !== 'APPROVED'} onChange={e => setAck(e.target.checked)} /> Enviar confirmação automática</label></div>
    </div>
    {canEdit && <button className="desk-primary" disabled={busy} onClick={() => void run(() => client.rpc('save_support_channel', { org: organizationId, box: mailbox, ingest, ack }), 'Canal salvo. Só começa a valer quando o servidor estiver autorizado e ligado.')}>Salvar canal</button>}
    <h3>Texto da confirmação <em className={`desk-state s-${status.toLowerCase()}`}>{status === 'APPROVED' ? 'Aprovado' : status === 'DRAFT' ? 'Rascunho: aprove para habilitar' : 'Não criado'}</em></h3>
    <div className="desk-field-pair"><label>Assunto<input aria-label="Assunto da confirmação" value={subject} disabled={!canEdit} onChange={e => setSubject(e.target.value)} /></label></div>
    <label className="desk-textarea">Mensagem<textarea aria-label="Mensagem da confirmação" rows={5} value={body} disabled={!canEdit} onChange={e => setBody(e.target.value)} /></label>
    <p className="desk-fine">Use {'{{protocolo}}'} (obrigatório) e {'{{nome}}'}. Não prometa prazo em horas ou dias.</p>
    <div className="desk-preview" aria-label="Prévia da confirmação"><strong>Prévia (exemplo)</strong><span>Assunto: {sampleText(subject)}</span><p>{sampleText(body)}</p></div>
    {canEdit && <div className="desk-row-actions"><button className="desk-secondary" disabled={busy} onClick={() => void run(() => client.rpc('save_support_ack_template', { org: organizationId, tpl_subject: subject, tpl_body: body }), 'Texto salvo como rascunho. Aprove para poder habilitar.')}>Salvar texto</button>
      <button className="desk-primary" disabled={busy || status !== 'DRAFT'} onClick={() => void run(() => client.rpc('approve_support_ack_template', { org: organizationId }), 'Texto aprovado.')}>Aprovar texto</button></div>}
    {failure && <p className="desk-error" role="alert">{failure}</p>}{message && <p className="desk-notice" role="status">{message}</p>}
    {!canEdit && <p className="desk-fine">Somente administradores alteram o canal e o texto.</p>}
  </details>;
}

const metaHelp = {
  whatsapp: { title: 'WhatsApp (API oficial da Meta)', idLabel: 'Identificador do número (Phone number ID)', note: 'Use o Phone number ID mostrado no WhatsApp Manager da sua conta Meta Business, não o telefone.' },
  instagram: { title: 'Instagram (mensagens diretas)', idLabel: 'ID da conta profissional do Instagram', note: 'A conta precisa ser profissional e estar vinculada à sua conta Meta Business.' },
} as const;
const webhookUrl = () => `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://SEU-PROJETO.supabase.co'}/functions/v1/crm-support-meta`;
function MetaPanel({ organizationId, client, reloadKey, onSaved }: { organizationId: string; client: Client; reloadKey: number; onSaved: () => void }) {
  const [config, setConfig] = useState<MetaAccountsConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { id: string; name: string; enabled: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let active = true;
    void client.rpc('get_support_meta_accounts', { org: organizationId }).then(({ data, error }: any) => {
      if (!active) return;
      if (error) { setLoadError('Não foi possível carregar os canais WhatsApp e Instagram.'); return; }
      const c = data as MetaAccountsConfig; setLoadError(''); setConfig(c);
      setDrafts(Object.fromEntries(c.accounts.map(a => [a.channel, { id: a.account_id || '', name: a.display_name || '', enabled: a.enabled }])));
    });
    return () => { active = false; };
  }, [client, organizationId, reloadKey]);
  if (loadError) return <p className="desk-error" role="alert">{loadError}</p>;
  if (!config) return null;
  const verify = async (channel: 'whatsapp' | 'instagram') => {
    if (busy) return; setBusy(true); setMessage(''); setFailure('');
    const { data, error } = await client.functions.invoke('crm-support-meta-verify', { body: { organization_id: organizationId, channel } });
    setBusy(false);
    const status = (data as { status?: string } | null)?.status;
    if (status === 'verified') { setMessage('Conta verificada: o token desta empresa acessa a conta na Meta.'); onSaved(); }
    else if (status === 'rejected') setFailure('A Meta não confirmou esta conta com o token desta empresa. Confira o identificador e o segredo no servidor.');
    else setFailure(error || (data as { error?: string } | null)?.error ? 'Não foi possível verificar agora. Confira se o servidor está ligado e o segredo do token foi criado.' : 'Não foi possível verificar agora. Tente novamente.');
  };
  const save = async (channel: 'whatsapp' | 'instagram') => {
    if (busy) return; setBusy(true); setMessage(''); setFailure('');
    const d = drafts[channel];
    const { error } = await client.rpc('save_support_meta_account', { org: organizationId, chan: channel, acct: d.id, name: d.name, enable: d.enabled });
    setBusy(false);
    if (error) setFailure((error as { message?: string }).message || 'Não foi possível salvar.'); else { setMessage(`${metaHelp[channel].title.split(' ')[0]} salvo. Só começa a valer com a conta Meta autorizada e o servidor ligado.`); onSaved(); }
  };
  return <details className="desk-settings"><summary>WhatsApp e Instagram desta empresa</summary>
    <p className="desk-fine">Cada empresa usa a própria conta. Nada é recebido nem enviado até a conta Meta ser conectada ao servidor e o canal ser habilitado aqui. O token da Meta nunca é digitado nesta tela: ele fica como segredo do servidor, no nome indicado abaixo. Respostas livres só são possíveis até 24 horas depois da última mensagem do cliente; fora disso o canal exige modelo aprovado, ainda não suportado.</p>
    <p className="desk-fine">Endereço do webhook para cadastrar na Meta: <code>{webhookUrl()}</code></p>
    {config.accounts.map(a => {
      const help = metaHelp[a.channel]; const d = drafts[a.channel] || { id: '', name: '', enabled: false };
      const set = (patch: Partial<typeof d>) => setDrafts(old => ({ ...old, [a.channel]: { ...d, ...patch } }));
      return <fieldset key={a.channel} className="desk-meta" disabled={!config.can_manage}><legend>{help.title}</legend>
        <div className="desk-field-pair">
          <label>{help.idLabel}<input aria-label={`${help.title}: identificador`} inputMode="numeric" value={d.id} onChange={e => set({ id: e.target.value.trim() })} placeholder="somente números" /></label>
          <label>Nome para exibição (opcional)<input aria-label={`${help.title}: nome`} maxLength={120} value={d.name} onChange={e => set({ name: e.target.value })} /></label>
        </div>
        <p className="desk-fine">{help.note}</p>
        <p className="desk-fine">Segredo do token no servidor: <code>{a.token_ref}</code></p>
        <label className="desk-check"><input type="checkbox" checked={d.enabled} onChange={e => set({ enabled: e.target.checked })} /> Habilitar este canal</label>
        <p className="desk-fine">{!a.account_id ? 'Não habilitado.' : a.verified ? 'Conta verificada com o token desta empresa.' : 'Conta ainda NÃO verificada: nenhuma mensagem é recebida ou enviada até a verificação (salve, crie o segredo no servidor e clique em Verificar conta).'}</p>
        <p className="desk-fine">{a.last_error ? `Falha registrada: ${a.last_error}` : a.last_event_at ? `Última mensagem recebida: ${new Date(a.last_event_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : a.enabled ? 'Habilitado, ainda sem nenhuma mensagem recebida.' : 'Não habilitado.'}</p>
        {config.can_manage && <div className="desk-row-actions"><button type="button" className="desk-primary" disabled={busy} onClick={() => void save(a.channel)}>Salvar {help.title.split(' ')[0]}</button>
          {a.account_id && !a.verified && <button type="button" className="desk-secondary" disabled={busy} onClick={() => void verify(a.channel)}>Verificar conta {help.title.split(' ')[0]}</button>}</div>}
      </fieldset>;
    })}
    {failure && <p className="desk-error" role="alert">{failure}</p>}{message && <p className="desk-notice" role="status">{message}</p>}
    {!config.can_manage && <p className="desk-fine">Somente administradores alteram os canais.</p>}
  </details>;
}
