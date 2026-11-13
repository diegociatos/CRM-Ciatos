import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { demandDate, demandError, isDefiniteDemandRejection, toDeadline, toLocalDeadline } from '../lib/supportDemands';
import { supportSectors, taskStates } from '../lib/supportTasks';
import type { SupportTask } from '../lib/supportTasks';
import type { User } from '../types';

type Props = { demandId: string; organizationId: string; version: number; users: User[]; client: typeof supabase; closed: boolean; disabled: boolean; onChanged: () => void };
type Draft = { title: string; sector: keyof typeof supportSectors; assigned_to: string; due_at: string; required: boolean; status: keyof typeof taskStates; result: string };
const empty = (): Draft => ({ title: '', sector: 'ACCOUNTING', assigned_to: '', due_at: '', required: true, status: 'OPEN', result: '' });

export default function SupportTasks({ demandId, organizationId, version, users, client, closed, disabled, onChanged }: Props) {
  const [tasks, setTasks] = useState<SupportTask[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const alive = useRef(true), lock = useRef(false), request = useRef<string>(crypto.randomUUID());
  const submission = useRef<Record<string, unknown> | null>(null), uncertain = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setTasks([]);
    void (async () => {
      const { data, error } = await client.from('support_demand_tasks').select('id,demand_id,sector,title,assigned_to,due_at,required,status,result,completed_at').eq('organization_id', organizationId).eq('demand_id', demandId).order('created_at').order('id').limit(100);
      if (!active) return;
      if (error) setError('Tarefas indisponíveis. Confira se a atualização de tarefas foi aplicada ao banco.'); else setTasks((data || []) as SupportTask[]);
    })().catch(() => { if (active) setError('Não foi possível carregar as tarefas.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, demandId, organizationId, version]);
  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const edit = (task?: SupportTask) => {
    setEditing(task?.id || null); request.current = task?.id || crypto.randomUUID();
    setDraft(task ? { title: task.title, sector: task.sector, assigned_to: task.assigned_to || '', due_at: toLocalDeadline(task.due_at), required: task.required, status: task.status, result: task.result } : empty()); setExpanded(true); setError('');
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (lock.current || disabled || closed) return;
    lock.current = true; setBusy(true); setError('');
    try {
      submission.current ??= { demand: demandId, expected_version: version, task_id: request.current, task_data: { ...draft, title: draft.title.trim(), result: draft.result.trim(), due_at: editing && draft.due_at === toLocalDeadline(tasks.find(t => t.id === editing)?.due_at || null) ? tasks.find(t => t.id === editing)!.due_at : toDeadline(draft.due_at) } };
      setPending(true);
      const { error } = await client.rpc('save_support_task', submission.current);
      if (error) throw error;
      if (!alive.current) return;
      submission.current = null; uncertain.current = false; setPending(false); setExpanded(false); setDraft(empty()); onChanged();
    } catch (e) {
      if (alive.current) {
        if (!uncertain.current && isDefiniteDemandRejection(e)) { submission.current = null; setPending(false); } else uncertain.current = true;
        setError(demandError(e));
      }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <section className="support-tasks" aria-label="Tarefas por setor"><header><div><h3>Execução por setor</h3><p>O responsável da demanda coordena o retorno. Cada setor cuida da sua tarefa.</p></div><button type="button" className="demands-secondary" disabled={closed || disabled || busy || pending || loading} onClick={() => edit()}>Nova tarefa</button></header>
    {disabled && <p>Salve ou descarte as alterações da demanda antes de editar tarefas.</p>}
    {closed && <p>Reabra a demanda para alterar tarefas.</p>}
    {error && <div><p className="demands-error" role="alert">{error}</p><button type="button" className="demands-secondary" disabled={busy || disabled} onClick={onChanged}>Conferir dados e descartar edição da tarefa</button><p>Após um resultado incerto, confira a lista antes de criar outra tarefa.</p></div>}
    {loading ? <p>Carregando tarefas…</p> : !tasks.length ? <p>Nenhuma tarefa setorial registrada.</p> : <ul className="support-task-list">{tasks.map(t => <li key={t.id}><div><strong>{t.title}</strong><span>{supportSectors[t.sector]} · {taskStates[t.status]}{t.required ? ' · Obrigatória' : ' · Opcional'}</span><span>{users.find(u => u.id === t.assigned_to)?.name || 'Executor indisponível — reatribua'} · {demandDate(t.due_at)}</span>{t.result && <p>{t.result}</p>}</div><button type="button" className="demands-secondary" disabled={closed || disabled || busy || pending} onClick={() => edit(t)}>Editar tarefa</button></li>)}</ul>}
    {expanded && <form onSubmit={save}><fieldset disabled={busy || pending || disabled || closed}>
      <label>Título da tarefa<input required minLength={2} maxLength={160} value={draft.title} onChange={e => change('title', e.target.value)} /></label>
      <div className="demands-field-pair"><label>Setor<select aria-label="Setor" value={draft.sector} onChange={e => change('sector', e.target.value as Draft['sector'])}>{Object.entries(supportSectors).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Executor<select aria-label="Executor" required value={draft.assigned_to} onChange={e => change('assigned_to', e.target.value)}><option value="">Selecione</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label></div>
      <div className="demands-field-pair"><label>Prazo da tarefa<input required type="datetime-local" value={draft.due_at} onChange={e => change('due_at', e.target.value)} /></label><label>Situação da tarefa<select aria-label="Situação da tarefa" value={draft.status} onChange={e => change('status', e.target.value as Draft['status'])}>{Object.entries(taskStates).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
      <label>Resultado ou justificativa<textarea rows={2} required={draft.status !== 'OPEN'} minLength={draft.status === 'OPEN' ? undefined : 2} maxLength={4000} value={draft.result} onChange={e => change('result', e.target.value)} /></label>
      <label className="support-task-check"><input type="checkbox" disabled={!!editing} checked={draft.required} onChange={e => change('required', e.target.checked)} />Obrigatória para resolver a demanda</label><p>Obrigatoriedade definida na criação. Para dispensar, informe a justificativa e selecione a situação correspondente.</p>
    </fieldset>{pending && !busy && <p role="status">Resultado pendente: confira novamente com o mesmo conteúdo. Nenhuma mensagem é enviada. Recarregar descarta o rascunho; confira a lista antes de criar outra tarefa.</p>}<div className="demands-actions"><button type="button" className="demands-secondary" disabled={busy || pending} onClick={() => setExpanded(false)}>Cancelar edição da tarefa</button><button className="btn-navy" disabled={busy || disabled || closed}>{busy ? 'Salvando tarefa…' : pending ? 'Conferir registro da tarefa' : 'Salvar tarefa'}</button></div></form>}
  </section>;
}
