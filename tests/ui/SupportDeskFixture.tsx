import React, { useState } from 'react';
import SupportDesk from '../../components/SupportDesk';
import { UserRole } from '../../types';

const org = '00000000-0000-4000-8000-000000000001';
const me = { id: 'user-one', name: 'Diego', email: 'qa@example.test', role: UserRole.SUPPORT } as any;
const boss = { ...me, role: UserRole.MANAGER };
const ana = { id: 'user-ana', name: 'Ana', email: 'ana@example.test', role: UserRole.SUPPORT } as any;
const bruno = { id: 'user-bruno', name: 'Bruno', email: 'b@example.test', role: UserRole.SDR } as any;
const now = Date.now();
const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3600e3).toISOString();
const base = { lead_id: 'l', status: 'OPEN', assigned_to: null, awaiting_human: true, first_human_reply_at: null, reopen_count: 0, resolved_at: null, resolution_note: null, nome: 'Contato', email: 'c@x.test', opt_out: false, uncertain_send: false, reply_overdue: false, resolution_overdue: false, reply_due_at: iso(-4), resolution_due_at: iso(-72) };
const cases: any[] = [
  { ...base, id: 'c1', empresa: 'Cliente Exemplo A', subject: 'Dúvida sobre guia', created_at: iso(6), last_customer_message_at: iso(6), last_message_at: iso(6), reply_overdue: true, last_text: 'Preciso da guia deste mês.' },
  { ...base, id: 'c2', empresa: 'Cliente Exemplo B', subject: 'Contrato assinado', created_at: iso(1), last_customer_message_at: iso(1), last_message_at: iso(1), last_text: 'Segue o contrato.' },
  { ...base, id: 'c3', empresa: 'Cliente Exemplo C', subject: 'Segunda via', status: 'IN_PROGRESS', assigned_to: 'user-one', awaiting_human: false, first_human_reply_at: iso(2), uncertain_send: true, reopen_count: 1, created_at: iso(30), last_customer_message_at: iso(30), last_message_at: iso(2), last_text: 'Enviamos a guia.' },
  { ...base, id: 'c4', empresa: 'Cliente Exemplo D', subject: 'Assunto antigo', status: 'IN_PROGRESS', assigned_to: 'user-ana', created_at: iso(5), last_customer_message_at: iso(5), last_message_at: iso(5), last_text: 'Aguardo.' },
];
const inScope = (c: any, scope: string) => ({
  mine: c.status !== 'CLOSED' && c.assigned_to === 'user-one', unassigned: c.status !== 'CLOSED' && !c.assigned_to,
  awaiting_first: c.awaiting_human && !c.first_human_reply_at, awaiting_reply: c.awaiting_human, attention: c.reply_overdue || c.uncertain_send || c.resolution_overdue,
  overdue_resolution: c.resolution_overdue, uncertain: c.uncertain_send, reopened: c.reopen_count > 0, received: true, open: c.status !== 'CLOSED', closed: c.status === 'CLOSED', all: true,
} as any)[scope];
const channel: any = { can_manage: true, account: { mailbox: null, ingest_enabled: false, auto_ack_enabled: false, last_sync_at: null }, template: { subject: null, body: null, status: 'NONE', approved_at: null } };
const channelCalls: any[] = [];
const metaCalls: any[] = []; const metaAccounts: Record<string, { id: string; name: string; enabled: boolean; verified?: boolean }> = {}; const verifyCalls: any[] = [];
let fail = false; let assumeTaken = false; const profileCalls: any[] = [];
const fake = {
  functions: { async invoke(_name: string, opts: any) { verifyCalls.push(opts.body); const c = opts.body.channel; if (metaAccounts[c]) metaAccounts[c].verified = true; return { data: { status: 'verified' }, error: null }; } },
  async rpc(name: string, args: any) {
    if (fail && name === 'support_queue') return { data: null, error: { message: 'Falha simulada' } };
    if (name === 'support_queue_counts') { const r: any = {}; for (const k of ['mine', 'unassigned', 'awaiting_first', 'awaiting_reply', 'attention', 'open']) r[k] = cases.filter(c => inScope(c, k)).length; return { data: r, error: null }; }
    if (name === 'support_queue') {
      const term = String(args.query || '').toLowerCase();
      const rows = cases.filter(c => inScope(c, args.scope) && (!term || `${c.empresa} ${c.subject}`.toLowerCase().includes(term)) && (!args.only_assignee || c.assigned_to === args.only_assignee));
      return { data: { total: rows.length, rows: rows.slice(args.skip_rows, args.skip_rows + args.max_rows) }, error: null };
    }
    if (name === 'support_assume') { const c = cases.find(x => x.id === args.cid)!; if (assumeTaken) { c.assigned_to = 'user-ana'; return { data: false, error: null }; } c.assigned_to = 'user-one'; c.status = 'IN_PROGRESS'; return { data: true, error: null }; }
    if (name === 'get_support_desk_settings') return { data: { first_response_hours: 4, resolution_hours: 72, can_manage: true }, error: null };
    if (name === 'save_support_desk_settings') return { data: null, error: null };
    if (name === 'get_support_channel') return { data: structuredClone(channel), error: null };
    if (name === 'save_support_ack_template') { if (!String(args.tpl_body).includes('{{protocolo}}')) return { data: null, error: { message: 'O texto precisa conter {{protocolo}}' } }; channel.template = { subject: args.tpl_subject, body: args.tpl_body, status: 'DRAFT', approved_at: null }; channel.account.auto_ack_enabled = false; return { data: null, error: null }; }
    if (name === 'approve_support_ack_template') { channel.template.status = 'APPROVED'; return { data: null, error: null }; }
    if (name === 'save_support_channel') { channelCalls.push(args); channel.account = { ...channel.account, mailbox: args.box, ingest_enabled: args.ingest, auto_ack_enabled: args.ack }; return { data: null, error: null }; }
    if (name === 'get_support_meta_accounts') return { data: { can_manage: true, accounts: ['instagram', 'whatsapp'].map(c => ({ channel: c, account_id: metaAccounts[c]?.id ?? null, display_name: metaAccounts[c]?.name ?? null, enabled: !!metaAccounts[c]?.enabled, verified: !!metaAccounts[c]?.verified, last_event_at: null, last_error: null, token_ref: `META_TOKEN_${c.toUpperCase()}_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D` })) }, error: null };
    if (name === 'save_support_meta_account') { if (args.enable && !args.acct) return { data: null, error: { message: 'Informe o identificador da conta' } }; metaCalls.push(args); metaAccounts[args.chan] = { id: args.acct, name: args.name, enabled: args.enable, verified: metaAccounts[args.chan]?.id === args.acct && !!metaAccounts[args.chan]?.verified }; return { data: null, error: null }; }
    if (name === 'set_support_profile') { profileCalls.push(args); return { data: null, error: null }; }
    if (name === 'support_desk_overview') {
      const n = (s: string) => cases.filter(c => inScope(c, s)).length;
      return { data: { period: { from: args.from_at, to: args.to_at }, received: n('received'), awaiting_first: n('awaiting_first'), awaiting_reply: n('awaiting_reply'), unassigned: n('unassigned'), attention: n('attention'), overdue_resolution: 0, uncertain: n('uncertain'), reopened: n('reopened'),
        ack_pending: 1, ack_failed: 1, avg_first_response_hours: null, avg_resolution_hours: 12.5, auto_confirmation: { enabled: false, note: 'Confirmação automática de recebimento ainda não existe. Nenhuma foi enviada.' },
        by_assignee: [{ assigned_to: 'user-ana', open: 1, waiting: 1 }, { assigned_to: null, open: 2, waiting: 2 }],
        channels: [{ channel: 'email', label: 'E-mail de suporte (caixa da empresa)', status: 'not_configured', coverage: 'Mensagens novas da caixa de entrada a partir da ativação.' }, { channel: 'email', label: 'E-mail (respostas a cadências)', status: 'error', last_error: 'Não foi possível ler respostas.', last_sync_at: iso(3), coverage: 'Somente respostas a cadências desta empresa.' }, { channel: 'whatsapp', status: 'not_configured', coverage: 'Não conectado.' }, { channel: 'instagram', status: 'not_configured', coverage: 'Não conectado.' }] }, error: null };
    }
    return { data: null, error: { message: 'Unknown RPC' } };
  },
};
export default function SupportDeskFixture({ manager }: { manager: boolean }) {
  const [opened, setOpened] = useState('');
  return <div className="crm-app" style={{ padding: 16 }}>
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <button onClick={() => { fail = true; }}>Falhar fila</button><button onClick={() => { fail = false; }}>Recuperar fila</button>
      <button onClick={() => { assumeTaken = true; }}>Outra pessoa assume</button>
      <button onClick={() => { document.body.dataset.channelCalls = JSON.stringify(channelCalls); }}>Ver chamadas de canal</button>
      <button onClick={() => { document.body.dataset.metaCalls = JSON.stringify(metaCalls); document.body.dataset.verifyCalls = JSON.stringify(verifyCalls); }}>Ver chamadas Meta</button>
      <button onClick={() => { document.body.dataset.profileCalls = JSON.stringify(profileCalls); }}>Ver chamadas de perfil</button>
      {opened && <span role="status">Conversa aberta: {opened}</span>}
    </div>
    <SupportDesk organizationId={org} users={[me, ana, bruno]} currentUser={manager ? boss : me} client={fake as any} onOpenConversation={setOpened} />
  </div>;
}
