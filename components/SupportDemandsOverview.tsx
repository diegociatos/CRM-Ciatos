import React, { useCallback, useEffect, useState } from 'react';
import type { supabase } from '../lib/supabase';
import { alertKinds, demandDate, demandError, demandPriorities, formatHours } from '../lib/supportDemands';
import type { DemandAlert, DemandPriority, DemandSettings, DemandStats } from '../lib/supportDemands';
import type { User } from '../types';

type Props = {
  organizationId: string; users: User[]; client: typeof supabase;
  revision: number; onOpenDemand: (id: string) => void;
};
const priorityOrder: DemandPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

/** Painel, avisos internos e prazos da empresa selecionada. Nada aqui envia mensagem a clientes. */
export default function SupportDemandsOverview({ organizationId, users, client, revision, onOpenDemand }: Props) {
  const [stats, setStats] = useState<DemandStats | null>(null);
  const [alerts, setAlerts] = useState<DemandAlert[]>([]);
  const [settings, setSettings] = useState<DemandSettings | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    void (async () => {
      const [statsResult, alertsResult, settingsResult] = await Promise.all([
        client.rpc('support_demand_stats', { org: organizationId }),
        client.from('support_demand_alerts').select('id,demand_id,kind,title,created_at,read_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
        client.rpc('get_support_settings', { org: organizationId }),
      ]);
      if (!active) return;
      if (statsResult.error || alertsResult.error || settingsResult.error) throw statsResult.error || alertsResult.error || settingsResult.error;
      setStats(statsResult.data as DemandStats); setAlerts((alertsResult.data || []) as DemandAlert[]); setSettings(settingsResult.data as DemandSettings);
    })().catch(() => { if (active) setError('Não foi possível carregar o painel e os avisos. Confira a conexão e se a atualização do banco foi aplicada.'); });
    return () => { active = false; };
  }, [organizationId, client, revision, reload]);
  const unread = alerts.filter(item => !item.read_at).length;
  const markRead = async () => {
    const { error: failure } = await client.rpc('mark_support_alerts_read', { org: organizationId });
    if (failure) setError(demandError(failure)); else setReload(v => v + 1);
  };
  const nameOf = (id: string | null) => id ? users.find(user => user.id === id)?.name || 'Membro da equipe' : 'Sem responsável';
  if (error) return <p className="demands-error" role="alert">{error}</p>;
  if (!stats || !settings) return null;
  return <section className="demands-overview" aria-label="Painel de atendimento">
    <ul className="demands-stats" aria-label="Resumo das demandas">
      <li><strong>{stats.open}</strong><span>Em aberto</span></li>
      <li className={stats.overdue ? 'is-alert' : ''}><strong>{stats.overdue}</strong><span>Atrasadas</span></li>
      <li><strong>{stats.due_today}</strong><span>Vencem hoje</span></li>
      <li className={stats.unassigned ? 'is-warn' : ''}><strong>{stats.unassigned}</strong><span>Sem responsável</span></li>
      <li><strong>{stats.avg_resolution_hours === null ? '—' : formatHours(Math.round(stats.avg_resolution_hours))}</strong><span>Tempo médio de resolução (90 dias)</span></li>
    </ul>
    <div className="demands-overview-grid">
      <div className="demands-panel"><header><h2>Meus avisos{unread > 0 && <span className="demands-count">{unread}</span>}</h2><button className="demands-secondary" disabled={!unread} onClick={() => void markRead()}>Marcar como lidos</button></header>
        {!alerts.length ? <p className="demands-empty-small">Nenhum aviso por enquanto.</p> : <ul>{alerts.map(item => <li key={item.id} className={item.read_at ? '' : 'is-unread'}><button onClick={() => onOpenDemand(item.demand_id)}><strong>{alertKinds[item.kind] || item.kind}</strong><span>{item.title}</span><time>{demandDate(item.created_at)}</time></button></li>)}</ul>}
      </div>
      <div className="demands-panel"><header><h2>Carga por responsável</h2></header>
        {!stats.by_assignee.length ? <p className="demands-empty-small">Sem demandas em aberto.</p> : <ul>{stats.by_assignee.map(row => <li key={row.assigned_to || 'none'}><span>{nameOf(row.assigned_to)}</span><span>{row.open} em aberto{row.overdue ? ` · ${row.overdue} atrasada${row.overdue > 1 ? 's' : ''}` : ''}</span></li>)}</ul>}
      </div>
    </div>
    <SettingsPanel organizationId={organizationId} users={users} client={client} settings={settings} onSaved={() => setReload(v => v + 1)} />
  </section>;
}

function SettingsPanel({ organizationId, users, client, settings, onSaved }: { organizationId: string; users: User[]; client: typeof supabase; settings: DemandSettings; onSaved: () => void }) {
  const [triage, setTriage] = useState(settings.triage_assignee || '');
  const [soon, setSoon] = useState(String(settings.due_soon_hours));
  const [escalate, setEscalate] = useState(String(settings.escalate_after_hours));
  const [hours, setHours] = useState<Record<DemandPriority, string>>(() => ({ LOW: String(settings.policies.LOW), NORMAL: String(settings.policies.NORMAL), HIGH: String(settings.policies.HIGH), URGENT: String(settings.policies.URGENT) }));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const save = useCallback(async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    const numbers = [soon, escalate, ...priorityOrder.map(key => hours[key])].map(Number);
    if (numbers.some(value => !Number.isInteger(value) || value < 1)) { setFailure('Informe números inteiros de horas, maiores que zero.'); setMessage(''); return; }
    setBusy(true); setFailure(''); setMessage('');
    const { error } = await client.rpc('save_support_settings', { org: organizationId, settings: { triage_assignee: triage || null, due_soon_hours: Number(soon), escalate_after_hours: Number(escalate), policies: Object.fromEntries(priorityOrder.map(key => [key, Number(hours[key])])) } });
    setBusy(false);
    if (error) setFailure(demandError(error)); else { setMessage('Configuração salva. Vale para as próximas demandas e avisos.'); onSaved(); }
  }, [busy, soon, escalate, hours, triage, client, organizationId, onSaved]);
  return <details className="demands-settings"><summary>Prazos e responsável de triagem</summary>
    <p className="demands-scope">Se a demanda for criada sem prazo, o prazo vem da prioridade, em horas corridas (sem considerar dias úteis nem feriados). Sem responsável, ela vai para quem faz a triagem.</p>
    {!settings.can_manage ? <ul className="demands-policy-list">{priorityOrder.map(key => <li key={key}>{demandPriorities[key]}: {formatHours(settings.policies[key])}</li>)}<li>Aviso de vencimento: {formatHours(settings.due_soon_hours)} antes</li><li>Escalonamento ao administrador: {formatHours(settings.escalate_after_hours)} após o atraso</li></ul> :
    <form onSubmit={save}><fieldset disabled={busy}>
      <label>Responsável pela triagem<select aria-label="Responsável pela triagem" value={triage} onChange={e => setTriage(e.target.value)}><option value="">Ninguém (demanda fica sem responsável)</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <div className="demands-policy-grid">{priorityOrder.map(key => <label key={key}>Prazo {demandPriorities[key]} (horas)<input inputMode="numeric" value={hours[key]} onChange={e => setHours(old => ({ ...old, [key]: e.target.value }))} /></label>)}</div>
      <div className="demands-field-pair"><label>Avisar antes do vencimento (horas)<input inputMode="numeric" value={soon} onChange={e => setSoon(e.target.value)} /></label><label>Escalar ao administrador após o atraso (horas)<input inputMode="numeric" value={escalate} onChange={e => setEscalate(e.target.value)} /></label></div>
      {failure && <p className="demands-error" role="alert">{failure}</p>}{message && <p className="demands-notice" role="status">{message}</p>}
      <button className="btn-navy">{busy ? 'Salvando…' : 'Salvar configuração'}</button>
    </fieldset></form>}
  </details>;
}
