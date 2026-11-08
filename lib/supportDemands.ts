export const demandStatuses = {
  OPEN: 'Aberta', IN_PROGRESS: 'Em andamento', WAITING: 'Aguardando retorno',
  RESOLVED: 'Resolvida', CANCELLED: 'Cancelada',
} as const;
export const demandPriorities = { LOW: 'Baixa', NORMAL: 'Normal', HIGH: 'Alta', URGENT: 'Urgente' } as const;
export type DemandStatus = keyof typeof demandStatuses;
export type DemandPriority = keyof typeof demandPriorities;
export type SupportDemand = {
  id: string; organization_id: string; lead_id: string | null; title: string; description: string;
  status: DemandStatus; priority: DemandPriority; due_at: string | null; assigned_to: string | null;
  created_by: string | null; created_at: string; updated_at: string; resolved_at: string | null; version: number; confidential?: boolean;
};
export type DemandActivity = {
  id: string; demand_id: string; actor_id: string | null; kind: 'CREATED' | 'UPDATED' | 'NOTE';
  body: string | null; changes: Record<string, unknown>; created_at: string;
};
export const activeDemandStatuses: DemandStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];
export const isDemandOverdue = (demand: Pick<SupportDemand, 'status' | 'due_at'>, now = Date.now()) =>
  activeDemandStatuses.includes(demand.status) && !!demand.due_at && new Date(demand.due_at).getTime() < now;

/** datetime-local represents browser local time, never a UTC date with its suffix removed. */
export function toLocalDeadline(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function toDeadline(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || toLocalDeadline(date.toISOString()) !== value) {
    throw new Error('Informe uma data e um horário válidos para o prazo.');
  }
  return date.toISOString();
}
export const demandDate = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
/** Only explicit validation/auth failures confirm that no mutation was committed. */
export function isDefiniteDemandRejection(error: unknown): boolean {
  const code = (error as { code?: string })?.code || '';
  return /^(22|23|28|42)[0-9A-Z]{3}$/.test(code) || ['P0001', '40001', 'PGRST202', 'PGRST204', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code);
}
export function demandError(error: unknown): string {
  const message = (error as { message?: string })?.message || '';
  if ((error as { code?: string })?.code === '40001' || /version|concurrent|conflito|alterad|stale|changed.*reload/i.test(message)) return 'Outra pessoa atualizou esta demanda. Seu rascunho foi preservado. Recarregue os dados antes de salvar novamente.';
  return message || 'Não foi possível concluir. Confira a conexão e tente novamente.';
}

export const alertKinds = { ASSIGNED: 'Atribuída a você', DUE_SOON: 'Vence em breve', OVERDUE: 'Atrasada', UNASSIGNED: 'Sem responsável', ESCALATED: 'Atraso escalado' } as const;
export type AlertKind = keyof typeof alertKinds;
export type DemandAlert = { id: string; demand_id: string; kind: AlertKind; title: string; created_at: string; read_at: string | null };
export type DemandStats = { open: number; overdue: number; due_today: number; unassigned: number; avg_resolution_hours: number | null; by_assignee: { assigned_to: string | null; open: number; overdue: number }[] };
export type DemandSettings = { triage_assignee: string | null; due_soon_hours: number; escalate_after_hours: number; can_manage: boolean; policies: Record<DemandPriority, number> };
/** Human readable SLA window: 4 h, 24 h -> 1 dia, 72 h -> 3 dias. */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—';
  if (hours >= 24 && hours % 24 === 0) { const days = hours / 24; return `${days} ${days === 1 ? 'dia' : 'dias'}`; }
  return `${hours} h`;
}
