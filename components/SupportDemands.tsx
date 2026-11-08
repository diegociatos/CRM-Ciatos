import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useDialog } from '../lib/useDialog';
import SupportDemandsOverview from './SupportDemandsOverview';
import { activeDemandStatuses, demandDate, demandError, demandPriorities, demandStatuses, isDefiniteDemandRejection, isDemandOverdue, toDeadline, toLocalDeadline } from '../lib/supportDemands';
import type { DemandActivity, DemandPriority, DemandStatus, SupportDemand } from '../lib/supportDemands';
import type { Lead, User } from '../types';
import './SupportDemands.css';

type Props = {
  organizationId: string; users: User[]; leads: Lead[]; currentUser: User;
  onOpenLead: (id: string) => void; client?: typeof supabase;
  initialLeadId?: string; initialTitle?: string; onClearInitial?: () => void;
};
type Draft = { title: string; description: string; lead_id: string; status: DemandStatus; priority: DemandPriority; assigned_to: string; due_at: string };
const pageSize = 25;
const columns = 'id,organization_id,lead_id,title,description,status,priority,due_at,assigned_to,created_by,created_at,updated_at,resolved_at,version,confidential';
const emptyDraft = (): Draft => ({ title: '', description: '', lead_id: '', status: 'OPEN', priority: 'NORMAL', assigned_to: '', due_at: '' });
const draftFrom = (row: SupportDemand): Draft => ({ title: row.title, description: row.description, lead_id: row.lead_id || '', status: row.status, priority: row.priority, assigned_to: row.assigned_to || '', due_at: toLocalDeadline(row.due_at) });
const contactName = (lead: Lead) => lead.company || lead.name || lead.email || 'Contato sem nome';

/** The keyed boundary discards drafts and pending responses when the workspace/user changes. */
export default function SupportDemands(props: Props) {
  return <DemandWorkspace key={`${props.organizationId}:${props.currentUser.id}`} {...props} client={props.client || supabase} />;
}

function DemandWorkspace({ organizationId, users, leads, currentUser, onOpenLead, client, initialLeadId, initialTitle, onClearInitial }: Props) {
  const [rows, setRows] = useState<SupportDemand[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('ACTIVE');
  const [priority, setPriority] = useState('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(!!initialLeadId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setRows([]);
    let request = client.from('support_demands').select(columns, { count: 'exact' }).eq('organization_id', organizationId);
    if (['ACTIVE', 'MINE', 'OVERDUE'].includes(filter)) request = request.in('status', activeDemandStatuses);
    if (filter === 'MINE') request = request.eq('assigned_to', currentUser.id);
    if (filter === 'UNASSIGNED') request = request.in('status', activeDemandStatuses).is('assigned_to', null);
    if (filter === 'OVERDUE') request = request.lt('due_at', new Date().toISOString());
    if (filter === 'CLOSED') request = request.in('status', ['RESOLVED', 'CANCELLED']);
    if (priority !== 'ALL') request = request.eq('priority', priority);
    if (query) request = request.ilike('title', `%${query.replace(/[\\%_]/g, '\\$&')}%`);
    void (async () => {
      const result = await request.order('due_at', { ascending: true, nullsFirst: false }).order('id').range(page * pageSize, (page + 1) * pageSize - 1);
      if (!active) return;
      if (result.error) throw result.error;
      if (!(result.data || []).length && page > 0) { setPage(page - 1); return; }
      setRows((result.data || []) as SupportDemand[]); setCount(result.count || 0);
    })().catch(() => { if (active) { setCount(0); setError('Não foi possível carregar as demandas. Confira a conexão e se a atualização do banco foi aplicada.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, currentUser.id, client, page, filter, priority, query, revision]);
  const refresh = () => setRevision(v => v + 1);
  const closeCreation = () => { setCreating(false); onClearInitial?.(); refresh(); };
  return <section className="demands-page" aria-label="Central de demandas">
    <header className="demands-header"><div><p className="demands-eyebrow">ATENDIMENTO E OPERAÇÃO</p><h1>Central de demandas<span>.</span></h1><p>Um responsável, um prazo e o histórico de cada solicitação, dentro do seu CRM.</p></div><button className="btn-navy" onClick={() => { setNotice(''); setCreating(true); }}>＋ Nova demanda</button></header>
    <p className="demands-scope">Espaço interno da empresa selecionada. Registrar ou atualizar uma demanda não envia mensagens ao cliente.</p>
    {notice && <p className="demands-notice" role="status">{notice}</p>}
    <SupportDemandsOverview organizationId={organizationId} users={users} client={client} revision={revision} onOpenDemand={id => setSelected(id)} />
    <div className="demands-filters" role="group" aria-label="Filtrar demandas">{[['ACTIVE', 'Em aberto'], ['MINE', 'Minhas'], ['OVERDUE', 'Atrasadas'], ['UNASSIGNED', 'Sem responsável'], ['CLOSED', 'Encerradas'], ['ALL', 'Todas']].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setPage(0); }}>{label}</button>)}</div>
    <div className="demands-toolbar"><label>Buscar por título<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ex.: Revisão do contrato" maxLength={160} /></label><label>Prioridade<select aria-label="Prioridade" value={priority} onChange={e => { setPriority(e.target.value); setPage(0); }}><option value="ALL">Todas as prioridades</option>{Object.entries(demandPriorities).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><button className="demands-secondary" disabled={loading} onClick={refresh}>Atualizar lista</button></div>
    {error && <p className="demands-error" role="alert">{error}</p>}
    <div className={`demands-layout ${selected ? 'has-detail' : ''}`}>
      <div className="demands-list"><div className="demands-list-caption"><h2>Fila de trabalho</h2><span>{loading ? 'Carregando…' : `${count} ${count === 1 ? 'demanda' : 'demandas'}`}</span></div>
        {loading ? <p className="demands-empty">Carregando demandas…</p> : !rows.length ? <div className="demands-empty"><strong>{error ? 'Lista indisponível' : 'Nenhuma demanda nesta visão.'}</strong><p>{error ? 'Tente atualizar a lista.' : 'Crie uma solicitação ou altere os filtros para encontrar o que precisa.'}</p></div> : <ul>{rows.map(row => <li key={row.id}><button className={`demand-row ${selected === row.id ? 'selected' : ''}`} onClick={() => setSelected(row.id)} aria-current={selected === row.id ? 'true' : undefined}><div className="demand-row-top"><span className={`demand-priority ${row.priority.toLowerCase()}`}>{demandPriorities[row.priority]}</span>{row.confidential && <span className="demand-confidential" title="Visível só para quem criou, o responsável e administradores">🔒 Confidencial</span>}<span>{demandStatuses[row.status]}</span></div><strong>{row.title}</strong><span>{row.lead_id ? contactName(leads.find(l => l.id === row.lead_id) || { name: 'Contato vinculado' } as Lead) : 'Demanda interna'}</span><div className="demand-row-bottom"><span>{users.find(u => u.id === row.assigned_to)?.name || (row.assigned_to ? 'Responsável indisponível' : 'Sem responsável')}</span><span className={isDemandOverdue(row) ? 'demand-overdue' : ''}>{row.due_at ? `${isDemandOverdue(row) ? 'Atrasada · ' : ''}${demandDate(row.due_at)}` : 'Sem prazo'}</span></div></button></li>)}</ul>}
        <div className="demands-pagination"><button disabled={loading || page === 0} onClick={() => setPage(v => v - 1)}>Anterior</button><span>Página {page + 1}</span><button disabled={loading || (page + 1) * pageSize >= count} onClick={() => setPage(v => v + 1)}>Próxima</button></div>
      </div>
      {selected && <DemandDetail key={selected} id={selected} organizationId={organizationId} users={users} leads={leads} currentUser={currentUser} client={client} onOpenLead={onOpenLead} onChanged={refresh} onClose={() => setSelected(null)} />}
    </div>
    {creating && <DemandCreate organizationId={organizationId} users={users} leads={leads} client={client} initialLeadId={initialLeadId} initialTitle={initialTitle} onClose={closeCreation} onCreated={id => { closeCreation(); setSelected(id); setNotice('Demanda registrada. Nenhuma mensagem foi enviada ao cliente.'); refresh(); }} />}
  </section>;
}

function DraftFields({ draft, setDraft, users, leads, editing = false }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; users: User[]; leads: Lead[]; editing?: boolean }) {
  const change = (key: keyof Draft, value: string) => setDraft(old => ({ ...old, [key]: value }));
  return <>
    <label>Título<input required minLength={2} maxLength={160} value={draft.title} onChange={e => change('title', e.target.value)} /></label>
    <label>Descrição<textarea aria-label="Descrição" rows={3} maxLength={8000} value={draft.description} onChange={e => change('description', e.target.value)} placeholder="Qual é a solicitação e qual o próximo passo?" /></label>
    <label>Cliente ou contato<select aria-label="Cliente ou contato" disabled={editing} value={draft.lead_id} onChange={e => change('lead_id', e.target.value)}><option value="">Demanda interna, sem contato</option>{draft.lead_id && !leads.some(l => l.id === draft.lead_id) && <option value={draft.lead_id}>Contato vinculado</option>}{leads.map(lead => <option key={lead.id} value={lead.id}>{contactName(lead)}{lead.name && lead.company ? ` · ${lead.name}` : ''}</option>)}</select>{editing && <small>Vínculo definido na criação. Para outro contato, abra uma nova demanda.</small>}</label>
    <div className="demands-field-pair"><label>Responsável<select aria-label="Responsável" value={draft.assigned_to} onChange={e => change('assigned_to', e.target.value)}><option value="">Sem responsável</option>{draft.assigned_to && !users.some(u => u.id === draft.assigned_to) && <option value={draft.assigned_to}>Responsável indisponível</option>}{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>Prioridade da demanda<select aria-label="Prioridade da demanda" value={draft.priority} onChange={e => change('priority', e.target.value)}>{Object.entries(demandPriorities).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
    <div className="demands-field-pair"><label>Prazo<input type="datetime-local" value={draft.due_at} onChange={e => change('due_at', e.target.value)} /><small>Horário local deste dispositivo. Em branco, usa o prazo da prioridade, contado desde a abertura.</small></label>{editing && <label>Estado<select aria-label="Estado" value={draft.status} onChange={e => change('status', e.target.value)}>{Object.entries(demandStatuses).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}</div>
  </>;
}

function DemandCreate({ organizationId, users, leads, client, initialLeadId, initialTitle, onClose, onCreated }: Pick<Props, 'organizationId' | 'users' | 'leads' | 'client' | 'initialLeadId' | 'initialTitle'> & { onClose: () => void; onCreated: (id: string) => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({ ...emptyDraft(), lead_id: initialLeadId || '', title: (initialTitle || '').slice(0, 160) }));
  const [busy, setBusy] = useState(false);
  const [confidential, setConfidential] = useState(false);
  const confidentialSent = useRef<boolean | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const submitted = useRef<Draft | null>(null);
  const uncertain = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const ref = useDialog(() => { if (!locked.current) onClose(); });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (locked.current || draft.title.trim().length < 2) return;
    locked.current = true; setBusy(true); setError('');
    try {
      const dataToSave = submitted.current || draft;
      const deadline = toDeadline(dataToSave.due_at);
      submitted.current = { ...dataToSave }; setPending(true); confidentialSent.current ??= confidential;
      const { data, error } = await client.rpc('create_support_demand', { org: organizationId, demand_title: dataToSave.title.trim(), demand_description: dataToSave.description.trim(), related_lead: dataToSave.lead_id || null, demand_priority: dataToSave.priority, demand_due_at: deadline, assignee: dataToSave.assigned_to || null, request_id: requestId, is_confidential: confidentialSent.current ?? confidential });
      if (error) throw error;
      if (mounted.current) onCreated(data as string);
    } catch (e) { if (mounted.current) {
      const rejected = !uncertain.current && isDefiniteDemandRejection(e);
      if (rejected) { submitted.current = null; confidentialSent.current = null; setPending(false); }
      else if (submitted.current) uncertain.current = true;
      setError(!submitted.current && !rejected ? demandError(e) : rejected ? `${demandError(e)} Nada foi registrado nesta tentativa. Corrija os campos e tente novamente; seu rascunho foi preservado.` : `${demandError(e)} Seu rascunho continua aqui. Repetir o registro usa o mesmo conteúdo e a mesma solicitação para evitar duplicação. Depois da confirmação, edite nos detalhes.`);
    } }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  return <div className="demands-modal-backdrop"><div className="demands-modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="demand-create-title" tabIndex={-1}><header><div><p className="demands-eyebrow">NOVO ACOMPANHAMENTO</p><h2 id="demand-create-title">Nova demanda</h2></div><button aria-label="Fechar nova demanda" disabled={busy} onClick={onClose}>✕</button></header><form onSubmit={submit}><fieldset disabled={busy || pending}><DraftFields draft={draft} setDraft={setDraft} users={users} leads={leads} /><label className="demands-check"><input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} /><span>Demanda confidencial: só eu, o responsável e os administradores da empresa veremos. Não pode ser alterado depois.</span></label></fieldset>{error && <p className="demands-error" role="alert">{error}</p>}<footer><button type="button" className="demands-secondary" disabled={busy} onClick={onClose}>{pending ? 'Fechar e conferir na lista' : 'Cancelar'}</button><button className="btn-navy" disabled={busy || draft.title.trim().length < 2}>{busy ? 'Registrando…' : 'Registrar demanda'}</button></footer></form></div></div>;
}

function DemandDetail({ id, organizationId, users, leads, currentUser, client, onOpenLead, onChanged, onClose }: Props & { id: string; onChanged: () => void; onClose: () => void }) {
  const [row, setRow] = useState<SupportDemand | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [activities, setActivities] = useState<DemandActivity[]>([]);
  const [activityCount, setActivityCount] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [historyReload, setHistoryReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState('');
  const noteRequest = useRef(crypto.randomUUID());
  const submittedNote = useRef<string | null>(null);
  const noteUncertain = useRef(false);
  const [notePending, setNotePending] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void (async () => {
      const result = await client.from('support_demands').select(columns).eq('organization_id', organizationId).eq('id', id).single();
      if (!active) return;
      if (result.error || !result.data) throw new Error('Demanda indisponível. Atualize a lista ou confira seu acesso à empresa.');
      const next = result.data as SupportDemand; setRow(next); setDraft(draftFrom(next));
    })().catch(e => { if (active) setError(demandError(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, organizationId, client, reload]);
  useEffect(() => {
    let active = true; setHistoryLoading(true); setHistoryError('');
    void (async () => {
      const result = await client.from('support_demand_activity').select('id,demand_id,actor_id,kind,body,changes,created_at', { count: 'exact' }).eq('organization_id', organizationId).eq('demand_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).range(historyPage * pageSize, (historyPage + 1) * pageSize - 1);
      if (!active) return;
      if (result.error) throw result.error;
      const next = (result.data || []) as DemandActivity[];
      setActivities(previous => historyPage === 0 ? next : [...previous, ...next.filter(item => !previous.some(existing => existing.id === item.id))]); setActivityCount(result.count || 0);
    })().catch(() => { if (active) setHistoryError('Não foi possível carregar o histórico. Tente atualizar.'); }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [id, organizationId, client, historyReload, historyPage]);
  const refreshHistory = () => { setHistoryPage(0); setHistoryReload(v => v + 1); };
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return; locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (e) { if (mounted.current) setError(demandError(e)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault(); if (!row || draft.title.trim().length < 2) return;
    void run(async () => {
      const values = { title: draft.title.trim(), description: draft.description.trim(), status: draft.status, priority: draft.priority, assigned_to: draft.assigned_to || null };
      const patch: Record<string, string | null> = Object.fromEntries(Object.entries(values).filter(([key, value]) => row[key as keyof SupportDemand] !== value));
      // Preserve stored seconds/time-zone offsets unless the user actually changed the wall time.
      if (draft.due_at !== toLocalDeadline(row.due_at)) patch.due_at = toDeadline(draft.due_at);
      const result = await client.rpc('update_support_demand', { demand: id, expected_version: row.version, patch });
      if (result.error) throw result.error;
      if (!mounted.current) return;
      setNotice('Demanda atualizada.'); setReload(v => v + 1); refreshHistory(); onChanged();
    });
  };
  const addNote = (event: React.FormEvent) => {
    event.preventDefault(); if (!note.trim()) return;
    void run(async () => {
      submittedNote.current ??= note.trim(); setNotePending(true);
      try {
        const result = await client.rpc('add_support_demand_note', { demand: id, note_body: submittedNote.current, request_id: noteRequest.current });
        if (result.error) throw result.error;
      } catch (e) {
        if (!noteUncertain.current && isDefiniteDemandRejection(e)) {
          submittedNote.current = null;
          if (mounted.current) setNotePending(false);
        } else noteUncertain.current = true;
        throw e;
      }
      if (!mounted.current) return;
      setNote(''); submittedNote.current = null; noteUncertain.current = false; setNotePending(false); noteRequest.current = crypto.randomUUID(); setNotice('Nota interna registrada.'); refreshHistory();
    });
  };
  return <aside className="demand-detail" aria-label="Detalhes da demanda"><header><h2>Detalhes da demanda</h2><button className="demands-secondary" onClick={onClose}>Fechar detalhes</button></header>
    {error && <p className="demands-error" role="alert">{error}</p>}{notice && <p className="demands-notice" role="status">{notice}</p>}
    {loading ? <p>Carregando demanda…</p> : row ? <>
      <p className="demand-meta">Criada em {demandDate(row.created_at)} · Versão {row.version}</p>
      {row.lead_id && <button className="demands-contact" onClick={() => onOpenLead(row.lead_id!)}>Abrir cadastro do contato ↗</button>}
      <form onSubmit={save}><fieldset disabled={busy}><DraftFields draft={draft} setDraft={setDraft} users={users} leads={leads} editing /><div className="demands-actions"><button type="button" className="demands-secondary" onClick={() => setDraft(old => ({ ...old, assigned_to: currentUser.id, status: 'IN_PROGRESS' }))}>Atribuir a mim</button><button className="btn-navy" disabled={!draft.title.trim()}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></div></fieldset></form>
      <form className="demand-note" onSubmit={addNote}><label>Nota interna<textarea aria-label="Nota interna" rows={3} maxLength={4000} value={note} disabled={busy || notePending} onChange={e => setNote(e.target.value)} placeholder="Registre uma atualização para a equipe." /></label>{notePending && !busy && <p>A confirmação não chegou. Tente registrar a mesma nota novamente; a solicitação é única e não será duplicada.</p>}<button className="demands-secondary" disabled={busy || !note.trim()}>Adicionar nota</button></form>
      <section className="demand-history" aria-label="Histórico da demanda"><header><h3>Histórico interno</h3><button disabled={historyLoading} onClick={refreshHistory}>Atualizar histórico</button></header>{historyError && <p role="alert">{historyError}</p>}{historyLoading && <p>Carregando histórico…</p>}<ol>{activities.map(item => <li key={item.id}><div><strong>{item.kind === 'CREATED' ? 'Demanda criada' : item.kind === 'NOTE' ? 'Nota interna' : 'Demanda atualizada'}</strong><time>{demandDate(item.created_at)}</time></div><small>{users.find(user => user.id === item.actor_id)?.name || 'Equipe'}</small>{item.body && <p>{item.body}</p>}{item.kind === 'UPDATED' && <ActivityChanges changes={item.changes} users={users} leads={leads} />}</li>)}</ol>{!historyLoading && !activities.length && !historyError && <p>Nenhum registro no histórico.</p>}{(historyPage + 1) * pageSize < activityCount && <button disabled={historyLoading || !!historyError} onClick={() => setHistoryPage(v => v + 1)}>Carregar histórico anterior</button>}</section>
    </> : null}
    <button className="demands-reload" disabled={busy || loading} onClick={() => setReload(v => v + 1)}>Recarregar dados e descartar alterações do formulário</button>
  </aside>;
}

function ActivityChanges({ changes, users, leads }: { changes: Record<string, unknown>; users: User[]; leads: Lead[] }) {
  const labels: Record<string, string> = { title: 'Título', description: 'Descrição', status: 'Estado', priority: 'Prioridade', due_at: 'Prazo', assigned_to: 'Responsável', lead_id: 'Contato' };
  const display = (key: string, value: unknown): string => {
    if (value === null || value === '') return 'Não definido';
    if (key === 'status') return demandStatuses[value as DemandStatus] || String(value);
    if (key === 'priority') return demandPriorities[value as DemandPriority] || String(value);
    if (key === 'due_at') return demandDate(String(value));
    if (key === 'assigned_to') return users.find(u => u.id === value)?.name || 'Membro da equipe';
    if (key === 'lead_id') { const lead = leads.find(l => l.id === value); return lead ? contactName(lead) : 'Contato vinculado'; }
    return String(value);
  };
  const before = (changes?.before || {}) as Record<string, unknown>;
  const after = changes?.after as Record<string, unknown> | undefined;
  const fields = after ? Object.fromEntries(Object.entries(after).filter(([key, value]) => labels[key] && JSON.stringify(before[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { before: before[key], after: value }])) : changes;
  return <ul>{Object.entries(fields || {}).filter(([key]) => labels[key]).map(([key, value]) => {
    const change = value as { old?: unknown; new?: unknown; before?: unknown; after?: unknown };
    return <li key={key}>{labels[key]}: {value && typeof value === 'object' ? `${display(key, change.old ?? change.before ?? null)} → ${display(key, change.new ?? change.after ?? null)}` : display(key, value)}</li>;
  })}</ul>;
}
