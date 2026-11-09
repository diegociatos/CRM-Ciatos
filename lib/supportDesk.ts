export type DeskScope = 'mine' | 'unassigned' | 'awaiting_first' | 'awaiting_reply' | 'attention' | 'overdue_resolution' | 'uncertain' | 'reopened' | 'received' | 'open' | 'closed' | 'all';

export type DeskCase = {
  id: string; lead_id: string; subject: string; status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED'; assigned_to: string | null;
  created_at: string; last_message_at: string; awaiting_human: boolean; last_customer_message_at: string | null;
  first_human_reply_at: string | null; reopen_count: number; resolved_at: string | null; resolution_note: string | null;
  nome: string | null; empresa: string | null; email: string | null; opt_out: boolean;
  reply_due_at: string; resolution_due_at: string; reply_overdue: boolean; resolution_overdue: boolean;
  uncertain_send: boolean; last_text: string | null;
};
export type DeskQueue = { total: number; rows: DeskCase[] };
export type DeskCounts = Partial<Record<'mine' | 'unassigned' | 'awaiting_first' | 'awaiting_reply' | 'attention' | 'open', number>>;
export type ChannelStatus = 'connected' | 'not_configured' | 'awaiting' | 'error' | 'delayed';
export type DeskChannel = { channel: 'email' | 'whatsapp' | 'instagram'; status: ChannelStatus; mailbox?: string | null; last_sync_at?: string | null; last_error?: string | null; coverage: string };
export type DeskOverview = {
  period: { from: string; to: string };
  received: number; awaiting_first: number; awaiting_reply: number; unassigned: number; attention: number; overdue_resolution: number; uncertain: number; reopened: number;
  avg_first_response_hours: number | null; avg_resolution_hours: number | null;
  auto_confirmation: { enabled: boolean; note: string };
  by_assignee: { assigned_to: string | null; open: number; waiting: number }[];
  channels: DeskChannel[];
};
export type DeskSettings = { first_response_hours: number; resolution_hours: number; can_manage: boolean };

export const scopeLabels: Record<DeskScope, string> = {
  mine: 'Minhas', unassigned: 'Sem responsável', awaiting_first: 'Aguardando 1ª resposta', awaiting_reply: 'Aguardando retorno ao cliente',
  attention: 'Precisam de atenção', overdue_resolution: 'Atrasados na resolução', uncertain: 'Envios a conferir', reopened: 'Reabertos',
  received: 'Recebidos', open: 'Abertos', closed: 'Concluídos', all: 'Todos',
};
export const channelNames = { email: 'E-mail', whatsapp: 'WhatsApp', instagram: 'Instagram' } as const;
export const channelStatusLabels: Record<ChannelStatus, string> = {
  connected: 'Conectado', not_configured: 'Não configurado', awaiting: 'Aguardando autorização', error: 'Com erro', delayed: 'Sincronização atrasada',
};

/** Human wait time: 25 min, 3 h, 2 dias. */
export function formatWait(fromIso: string | null | undefined, now = Date.now()): string {
  if (!fromIso) return '—';
  const minutes = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} dias`;
}

export type DeskPeriod = 'today' | '7d' | '30d';
export const periodLabels: Record<DeskPeriod, string> = { today: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias' };
/** [from, to) in ISO. "Hoje" starts at local midnight. */
export function periodRange(period: DeskPeriod, now = new Date()): { from: string; to: string } {
  const to = new Date(now.getTime() + 60_000);
  const from = new Date(now);
  if (period === 'today') from.setHours(0, 0, 0, 0);
  else from.setTime(now.getTime() - (period === '7d' ? 7 : 30) * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}
