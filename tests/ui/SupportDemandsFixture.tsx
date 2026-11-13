import React, { useState } from 'react';
import SupportDemands from '../../components/SupportDemands';
import { UserRole } from '../../types';

const orgOne = '00000000-0000-4000-8000-000000000001';
const orgTwo = '00000000-0000-4000-8000-000000000002';
const user = { id: 'user-one', name: 'Diego', email: 'qa@example.test', role: UserRole.ADMIN } as any;
const leads = [{ id: 'lead-one', organizationId: orgOne, company: 'Empresa Exemplo', name: 'Ana' }] as any;
const initial = { id: 'demand-one', organization_id: orgOne, lead_id: 'lead-one', title: 'Revisar contrato do cliente', description: 'Conferir documentos recebidos.', status: 'OPEN', priority: 'HIGH', due_at: '2026-01-01T12:00:00Z', assigned_to: null, created_by: user.id, created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z', resolved_at: null, version: 1 };
const rows: Record<string, any[]> = {
  support_demand_tasks: [],
  support_demands: [{ ...initial }, { ...initial, id: 'demand-done', title: 'Cadastro conferido', status: 'RESOLVED', priority: 'NORMAL' }],
  support_demand_alerts: [],
  support_demand_activity: [{ id: 'event-one', organization_id: orgOne, demand_id: initial.id, actor_id: user.id, kind: 'CREATED', body: null, changes: {}, created_at: initial.created_at }],
};
const requests = new Map<string, string>();
let failNext = false;
let rejectNext = false;
let failAfterWrite = false;
let rejectAfterInterruption = false;
let delay = 0;
let writes = 0;
let markedIds: string[] | null = null;
const addEvent = (row: any, kind: string, changes: any, body: string | null = null) => {
  const id = `event-${rows.support_demand_activity.length + 1}`;
  rows.support_demand_activity.push({ id, organization_id: row.organization_id, demand_id: row.id, actor_id: user.id, kind, changes, body, created_at: new Date().toISOString() });
  return id;
};
const fake = {
  from(table: string) {
    const filters: Array<(x: any) => boolean> = []; const orders: Array<[string, any]> = []; let start = 0, end = Infinity, single = false;
    const query = {
      select() { return query; }, eq(key: string, value: any) { filters.push(x => x[key] === value); return query; },
      in(key: string, values: any[]) { filters.push(x => values.includes(x[key])); return query; },
      is(key: string, value: any) { filters.push(x => (x[key] ?? null) === value); return query; },
      limit(n: number) { end = start + n - 1; return query; },
      or(expr: string) { const m = expr.match(/^created_at\.lt\.(.+?),and\(created_at\.eq\.(.+?),id\.gt\.(.+)\)$/); if (m) filters.push(x => x.created_at < m[1] || (x.created_at === m[2] && x.id > m[3])); return query; },
      lt(key: string, value: any) { filters.push(x => x[key] != null && x[key] < value); return query; },
      ilike(key: string, value: string) { const needle = value.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase(); filters.push(x => x[key].toLowerCase().includes(needle)); return query; },
      order(key: string, options?: any) { orders.push([key, options]); return query; }, range(a: number, b: number) { start = a; end = b; return query; },
      single() { single = true; return query; },
      async then(resolve: (value: any) => void) {
        let data = (rows[table] || []).filter(x => filters.every(fn => fn(x))).map(x => structuredClone(x));
        data.sort((a, b) => { for (const [key, options] of orders) { if (a[key] === b[key]) continue; if (a[key] === null) return options?.nullsFirst ? -1 : 1; if (b[key] === null) return options?.nullsFirst ? 1 : -1; return String(a[key]).localeCompare(String(b[key])) * (options?.ascending === false ? -1 : 1); } return 0; });
        const count = data.length; data = data.slice(start, table === 'support_demand_activity' ? Math.min(end + 1, start + 25) : end + 1);
        await new Promise(r => setTimeout(r, delay));
        resolve({ data: single ? data[0] : data, count, error: null });
      },
    }; return query;
  },
  async rpc(name: string, args: any) {
    if (name === 'support_client_month') {
      const items = rows.support_demands.filter(r => r.organization_id === args.org && r.lead_id === args.client_id);
      return { data: { opened: items.length, resolved: items.filter(r => r.status === 'RESOLVED').length, open_now: items.filter(r => !['RESOLVED', 'CANCELLED'].includes(r.status)).length, avg_resolution_hours: null, total: items.length, items }, error: null };
    }
    // Panel/avisos/configuracao: leituras independentes que nao devem consumir as falhas simuladas das gravacoes.
    if (name === 'support_demand_stats') { const open = rows.support_demands.filter(x => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(x.status)); return { data: { open: open.length, overdue: open.filter(x => x.due_at && x.due_at < new Date().toISOString()).length, due_today: 0, unassigned: open.filter(x => !x.assigned_to).length, avg_resolution_hours: null, by_assignee: [] }, error: null }; }
    if (name === 'get_support_settings') return { data: { triage_assignee: null, due_soon_hours: 4, escalate_after_hours: 4, can_manage: true, policies: { URGENT: 4, HIGH: 24, NORMAL: 72, LOW: 120 } }, error: null };
    if (name === 'mark_support_alerts_read') { markedIds = args.alert_ids ?? null; rows.support_demand_alerts.forEach(x => { if (!x.read_at && (!args.alert_ids || args.alert_ids.includes(x.id))) x.read_at = new Date().toISOString(); }); return { data: 0, error: null }; }
    if (name === 'save_support_settings') return { data: 0, error: null };
    if (rejectNext) { rejectNext = false; return { data: null, error: { code: 'P0001', message: 'Responsável inválido.' } }; }
    if (failNext) { failNext = false; return { data: null, error: { message: 'Falha simulada de conexão.' } }; }
    await new Promise(r => setTimeout(r, delay));
    if (name === 'create_support_demand') {
      if (requests.has(args.request_id)) return { data: requests.get(args.request_id), error: null };
      const id = `demand-${rows.support_demands.length + 1}`;
      const row = { ...initial, id, organization_id: args.org, title: args.demand_title, description: args.demand_description, lead_id: args.related_lead, priority: args.demand_priority, due_at: args.demand_due_at, assigned_to: args.assignee, created_at: new Date().toISOString() };
      rows.support_demands.push(row); requests.set(args.request_id, id); addEvent(row, 'CREATED', { after: row }); writes++;
      if (failAfterWrite) { failAfterWrite = false; if (rejectAfterInterruption) { rejectNext = true; rejectAfterInterruption = false; } return { data: null, error: { message: 'Resposta interrompida.' } }; }
      return { data: id, error: null };
    }
    const row = rows.support_demands.find(x => x.id === args.demand);
    if (!row) return { data: null, error: { message: 'Not found' } };
    if (name === 'save_support_task') {
      const existing = rows.support_demand_tasks.find(t => t.id === args.task_id);
      if (existing && Object.entries(args.task_data).every(([k,v]) => existing[k] === v)) return { data: row.version, error: null };
      if (row.version !== args.expected_version) return { data: null, error: { code: '40001', message: 'Version conflict' } };
      if (existing) Object.assign(existing, args.task_data); else rows.support_demand_tasks.push({ id: args.task_id, demand_id: row.id, organization_id: row.organization_id, ...args.task_data, created_at: new Date().toISOString() });
      row.version++; writes++; addEvent(row, 'NOTE', { task_after: { ...args.task_data } }, 'Tarefa setorial: ' + args.task_data.title);
      if (failAfterWrite) { failAfterWrite = false; return { data: null, error: { message: 'Resposta interrompida.' } }; }
      return { data: row.version, error: null };
    }
    if (name === 'update_support_demand') {
      if (args.patch.status === 'RESOLVED' && rows.support_demand_tasks.some(t => t.demand_id === row.id && t.required && t.status === 'OPEN')) return { data: null, error: { code: '23514', message: 'Conclua todas as tarefas obrigatórias antes de resolver a demanda.' } };
      if (row.version !== args.expected_version) return { data: null, error: { message: 'Version conflict' } };
      const before = structuredClone(row); Object.assign(row, args.patch, { version: row.version + 1 }); addEvent(row, 'UPDATED', { before, after: structuredClone(row) }); writes++;
      return { data: row.version, error: null };
    }
    if (name === 'add_support_demand_note') {
      if (requests.has(args.request_id)) return { data: requests.get(args.request_id), error: null };
      const id = addEvent(row, 'NOTE', {}, args.note_body); requests.set(args.request_id, id); writes++;
      return { data: id, error: null };
    }
    return { data: null, error: { message: 'Unknown RPC' } };
  },
};
export default function SupportDemandsFixture({manual=false}:{manual?:boolean}={}) {
  const [org, setOrg] = useState(orgOne);
  const [opened, setOpened] = useState('');
  const [show, setShow] = useState(true);
  if(manual){rows.support_demands[0].lead_id=null;rows.support_demands[0].intake={source:'manual',channel:'phone',name:'Ana de teste',company:'Cliente de teste',phone:'31999999999',email:'ana@example.test',direction:'INBOUND',outcome:'CALLBACK',duration_seconds:120};}
  return <div className="crm-app" style={{ padding: 16 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
      <button onClick={() => setOrg(orgOne)}>Empresa Exemplo</button><button onClick={() => setOrg(orgTwo)}>Outra empresa</button>
      <button onClick={() => { failNext = true; }}>Falhar próximo registro</button><button onClick={() => { failAfterWrite = true; }}>Interromper retorno</button>
      <button onClick={() => { rejectNext = true; }}>Rejeitar próximo registro</button><button onClick={() => { failAfterWrite = true; rejectAfterInterruption = true; }}>Interromper e rejeitar repetição</button>
      <button onClick={() => { rows.support_demands[0].version++; rows.support_demands[0].title = 'Atualizado por colega'; }}>Simular edição simultânea</button>
      <button onClick={() => { delay = 700; }}>Respostas lentas</button><button onClick={() => setShow(v => !v)}>Alternar tela</button>
      <button onClick={() => { for (let i = 0; i < 26; i++) rows.support_demands.push({ ...initial, id: `extra-${i}`, title: `Extra ${i}` }); }}>Popular fila</button>
      <button onClick={() => { for (let i = 1; i <= 60; i++) rows.support_demand_activity.push({ id: `history-${i}`, organization_id: orgOne, demand_id: initial.id, actor_id: user.id, kind: 'NOTE', body: `Registro histórico ${i}`, changes: {}, created_at: new Date(Date.UTC(2026, 1, 1, 0, i)).toISOString() }); }}>Popular histórico</button>
      <button onClick={() => { for (let i = 1; i <= 45; i++) rows.support_demand_alerts.push({ id: `alert-${String(i).padStart(2, '0')}`, organization_id: orgOne, demand_id: initial.id, kind: 'OVERDUE', title: `Aviso ${i}`, created_at: new Date(Date.UTC(2026, 1, 1, 0, i)).toISOString(), read_at: null }); }}>Popular avisos</button>
      <button onClick={() => { rows.support_demand_alerts.push({ id: 'alert-new', organization_id: orgOne, demand_id: initial.id, kind: 'ASSIGNED', title: 'Aviso novo', created_at: new Date(Date.UTC(2026, 2, 1)).toISOString(), read_at: null }); }}>Chegar aviso novo</button>
      <button onClick={() => { document.body.dataset.markedCount = markedIds === null ? 'all' : String(markedIds.length); }}>Contar marcados</button>
      <button onClick={() => { document.body.dataset.writeCount = String(writes); }}>Contar gravações</button>
      {opened && <span role="status">Cadastro aberto: {opened}</span>}
    </div>
    {show && <SupportDemands organizationId={org} users={[user]} leads={org === orgOne ? leads : []} currentUser={user} client={fake as any} initialDemandId={manual?initial.id:undefined} onOpenLead={setOpened} />}
  </div>;
}

export {fake as demandFixtureClient};
