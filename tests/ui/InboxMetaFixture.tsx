import React from 'react';
import Inbox from '../../components/Inbox';
import { UserRole } from '../../types';

const org = '00000000-0000-4000-8000-000000000001';
const user = { id: 'user-one', name: 'Diego', email: 'diego@example.test', role: UserRole.ADMIN, department: 'Suporte' } as any;
const conversation: any = { id: 'wa-1', organization_id: org, lead_id: null, channel: 'whatsapp', protocol: 'ATD-000007', status: 'OPEN', assigned_to: null, subject: 'WhatsApp', last_message_at: '2026-11-09T12:00:00Z', created_at: '2026-11-09T12:00:00Z' };
const messages: any[] = [
  { id: 'm1', conversation_id: 'wa-1', organization_id: org, direction: 'INBOUND', sender: '5531999990001', recipient: '109876543210', subject: '', body: 'Preciso da guia', classification: null, author_id: null, delivery_status: null, received_at: '2026-11-09T12:00:00Z' },
  { id: 'm2', conversation_id: 'wa-1', organization_id: org, direction: 'OUTBOUND', sender: '109876543210', recipient: '5531999990001', subject: '', body: 'Já cuidamos disso', classification: null, author_id: 'user-one', delivery_status: 'REVIEW', received_at: '2026-11-09T12:05:00Z' },
];
let nextSend: 'FAILED' | 'ACCEPTED' = 'FAILED';
const fake: any = {
  functions: { async invoke(_n: string, { body }: any) {
    messages.push({ id: `o${messages.length}`, conversation_id: 'wa-1', organization_id: org, direction: 'OUTBOUND', sender: '109876543210', recipient: '5531999990001', subject: '', body: body.body, classification: null, author_id: 'user-one', delivery_status: nextSend, delivery_error: nextSend === 'FAILED' ? 'Recusada pelo canal (HTTP 400, código 131047)' : null, received_at: new Date().toISOString() });
    return { data: { status: nextSend }, error: null };
  } },
  from(table: string) {
    const clauses: Array<(x: any) => boolean> = [];
    const query: any = { select() { return query; }, eq(k: string, v: any) { clauses.push(x => x[k] === v); return query; }, in(k: string, v: any[]) { clauses.push(x => v.includes(x[k])); return query; }, order() { return query; }, limit() { return query; },
      then(resolve: (v: any) => void) { const rows = table === 'inbox_conversations' ? [conversation] : table === 'inbox_messages' ? messages : []; resolve({ data: rows.filter(x => clauses.every(f => f(x))), error: null }); } };
    return query;
  },
  async rpc(name: string, args: any) {
    if (name === 'support_conversation_contacts') return { data: [{ conversation_id: 'wa-1', nome: 'Maria', empresa: null, email: null, telefone: '+5531999990001', opt_out: false, is_person: true }], error: null };
    if (name === 'resolve_support_meta_reply') { const m = messages.find(x => x.id === args.mid)!; if (args.action === 'confirm_sent') Object.assign(m, { delivery_status: 'ACCEPTED', delivery_evidence: 'manual_confirmation' }); else Object.assign(m, { delivery_status: 'FAILED', delivery_error: 'Conferido manualmente: não foi enviada' }); return { data: null, error: null }; }
    return { data: null, error: null };
  },
};
export default function InboxMetaFixture() {
  return <div className="crm-app"><button onClick={() => { nextSend = 'ACCEPTED'; }}>Próximo envio aceito</button>
    <Inbox organizationId={org} users={[user]} currentUser={user} onOpenLead={() => {}} client={fake} canManage={true} initialConversationId="wa-1" /></div>;
}
