export const supportSectors = { ACCOUNTING: 'Contabilidade', LEGAL: 'Jurídico', TAX: 'Tributário', COMMERCIAL: 'Comercial', FINANCE: 'Financeiro', OPERATIONS: 'Operações', CX: 'Experiência do cliente', OTHER: 'Outro' } as const;
export const taskStates = { OPEN: 'Pendente', DONE: 'Concluída', WAIVED: 'Dispensada com justificativa' } as const;
export type SupportTask = { id: string; demand_id: string; sector: keyof typeof supportSectors; title: string; assigned_to: string | null; due_at: string; required: boolean; status: keyof typeof taskStates; result: string; completed_at?: string | null };
export type ClientMonth = { opened: number; resolved: number; open_now: number; avg_resolution_hours: number | null; total: number; items: { id: string; title: string; status: string; created_at: string; resolved_at: string | null; due_at: string | null; assigned_to: string | null }[] };
/** Neutralize spreadsheet formula prefixes, including whitespace/control characters. */
export const reportCsvCell = (value: unknown) => '"' + String(value ?? '').replace(/^[\s\u0000-\u001f]*[=+@-]/, "'$&").replace(/"/g, '""') + '"';
export const clientMonthCsv = (report: ClientMonth) => '\uFEFF' + [
  ['Demanda', 'Situação atual', 'Criada em', 'Última resolução', 'Prazo atual'],
  ...report.items.map(r => [r.title, r.status, r.created_at, r.resolved_at, r.due_at]),
].map(row => row.map(reportCsvCell).join(';')).join('\r\n');
