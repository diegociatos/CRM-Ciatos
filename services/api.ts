const BASE_URL = (import.meta as any).env?.VITE_API_URL || '/crm-api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || 'Erro na requisição');
  }
  return res.json();
}

// ==================== AUTH ====================
export const authApi = {
  login: (email: string, password: string) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    request<any>('/auth/change-password', { method: 'POST', body: JSON.stringify({ userId, currentPassword, newPassword }) }),
  getUsers: () => request<any[]>('/auth/users'),
  createUser: (user: any) =>
    request<any>('/auth/users', { method: 'POST', body: JSON.stringify(user) }),
  updateUser: (id: string, data: any) =>
    request<any>(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUser: (id: string) =>
    request<any>(`/auth/users/${id}`, { method: 'DELETE' }),
};

// ==================== LEADS ====================
export const leadsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/leads${qs}`);
  },
  getById: (id: string) => request<any>(`/leads/${id}`),
  create: (lead: any) =>
    request<any>('/leads', { method: 'POST', body: JSON.stringify(lead) }),
  update: (id: string, data: any) =>
    request<any>(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/leads/${id}`, { method: 'DELETE' }),
  addInteraction: (leadId: string, interaction: any) =>
    request<any>(`/leads/${leadId}/interactions`, { method: 'POST', body: JSON.stringify(interaction) }),
  addTask: (leadId: string, task: any) =>
    request<any>(`/leads/${leadId}/tasks`, { method: 'POST', body: JSON.stringify(task) }),
  bulkImport: (leads: any[]) =>
    request<any>('/leads/bulk', { method: 'POST', body: JSON.stringify({ leads }) }),
};

// ==================== CONFIG ====================
export const configApi = {
  getAll: () => request<any>('/config'),
  update: (data: any) =>
    request<any>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  getKey: (key: string) => request<any>(`/config/${key}`),
  setKey: (key: string, value: any) =>
    request<any>(`/config/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};

// ==================== SCRIPTS ====================
export const scriptsApi = {
  getAll: () => request<any[]>('/scripts'),
  create: (script: any) =>
    request<any>('/scripts', { method: 'POST', body: JSON.stringify(script) }),
  update: (id: string, data: any) =>
    request<any>(`/scripts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/scripts/${id}`, { method: 'DELETE' }),
};

// ==================== TEMPLATES ====================
export const templatesApi = {
  getAll: () => request<any[]>('/onboarding-templates'),
  create: (template: any) =>
    request<any>('/onboarding-templates', { method: 'POST', body: JSON.stringify(template) }),
  update: (id: string, data: any) =>
    request<any>(`/onboarding-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/onboarding-templates/${id}`, { method: 'DELETE' }),
  getMaster: () => request<any[]>('/onboarding-templates/master'),
  createMaster: (template: any) =>
    request<any>('/onboarding-templates/master', { method: 'POST', body: JSON.stringify(template) }),
  updateMaster: (id: string, data: any) =>
    request<any>(`/onboarding-templates/master/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ==================== GOALS ====================
export const goalsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/goals${qs}`);
  },
  create: (goal: any) =>
    request<any>('/goals', { method: 'POST', body: JSON.stringify(goal) }),
  update: (id: string, data: any) =>
    request<any>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/goals/${id}`, { method: 'DELETE' }),
  bulkSave: (goals: any[]) =>
    request<any>('/goals/bulk', { method: 'PUT', body: JSON.stringify({ goals }) }),
};

// ==================== AGENDA ====================
export const agendaApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/agenda${qs}`);
  },
  create: (event: any) =>
    request<any>('/agenda', { method: 'POST', body: JSON.stringify(event) }),
  update: (id: string, data: any) =>
    request<any>(`/agenda/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/agenda/${id}`, { method: 'DELETE' }),
};

// ==================== MINING ====================
export const miningApi = {
  getJobs: () => request<any[]>('/mining/jobs'),
  createJob: (job: any) =>
    request<any>('/mining/jobs', { method: 'POST', body: JSON.stringify(job) }),
  updateJob: (id: string, data: any) =>
    request<any>(`/mining/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id: string) =>
    request<any>(`/mining/jobs/${id}`, { method: 'DELETE' }),
  getLeads: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/mining/leads${qs}`);
  },
  createLead: (lead: any) =>
    request<any>('/mining/leads', { method: 'POST', body: JSON.stringify(lead) }),
  bulkImportLeads: (leads: any[]) =>
    request<any>('/mining/leads/bulk', { method: 'POST', body: JSON.stringify({ leads }) }),
};

// ==================== AUTOMATION ====================
export const automationApi = {
  getAll: () => request<any[]>('/automation-flows'),
  create: (flow: any) =>
    request<any>('/automation-flows', { method: 'POST', body: JSON.stringify(flow) }),
  update: (id: string, data: any) =>
    request<any>(`/automation-flows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/automation-flows/${id}`, { method: 'DELETE' }),
};

// ==================== CAMPAIGNS ====================
export const campaignsApi = {
  getAll: () => request<any[]>('/campaigns'),
  create: (campaign: any) =>
    request<any>('/campaigns', { method: 'POST', body: JSON.stringify(campaign) }),
  update: (id: string, data: any) =>
    request<any>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/campaigns/${id}`, { method: 'DELETE' }),
  getSmartLists: () => request<any[]>('/campaigns/smart-lists'),
  createSmartList: (list: any) =>
    request<any>('/campaigns/smart-lists', { method: 'POST', body: JSON.stringify(list) }),
  updateSmartList: (id: string, data: any) =>
    request<any>(`/campaigns/smart-lists/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSmartList: (id: string) =>
    request<any>(`/campaigns/smart-lists/${id}`, { method: 'DELETE' }),
};

// ==================== CHAT ====================
export const chatApi = {
  getThreads: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/chat/threads${qs}`);
  },
  createThread: (data: any) =>
    request<any>('/chat/threads', { method: 'POST', body: JSON.stringify(data) }),
  deleteThread: (id: string) =>
    request<any>(`/chat/threads/${id}`, { method: 'DELETE' }),
  getMessages: (threadId: string) =>
    request<any[]>(`/chat/threads/${threadId}/messages`),
  sendMessage: (threadId: string, message: any) =>
    request<any>(`/chat/threads/${threadId}/messages`, { method: 'POST', body: JSON.stringify(message) }),
};

// ==================== QUALIFICATIONS ====================
export const qualificationsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/qualifications${qs}`);
  },
  create: (qual: any) =>
    request<any>('/qualifications', { method: 'POST', body: JSON.stringify(qual) }),
  update: (id: string, data: any) =>
    request<any>(`/qualifications/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<any>(`/qualifications/${id}`, { method: 'DELETE' }),
};

// ==================== AUDIT ====================
export const auditApi = {
  getLogs: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/audit${qs}`);
  },
  createLog: (log: any) =>
    request<any>('/audit', { method: 'POST', body: JSON.stringify(log) }),
  bulkLogs: (logs: any[]) =>
    request<any>('/audit/bulk', { method: 'POST', body: JSON.stringify({ logs }) }),
  getIntegrations: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/audit/integrations${qs}`);
  },
  createIntegration: (log: any) =>
    request<any>('/audit/integrations', { method: 'POST', body: JSON.stringify(log) }),
  getNotifications: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/audit/notifications${qs}`);
  },
  createNotification: (notif: any) =>
    request<any>('/audit/notifications', { method: 'POST', body: JSON.stringify(notif) }),
  markRead: (id: string) =>
    request<any>(`/audit/notifications/${id}/read`, { method: 'PUT' }),
  markAllRead: (userId: string) =>
    request<any>('/audit/notifications/read-all', { method: 'PUT', body: JSON.stringify({ userId }) }),
};

const api = {
  auth: authApi,
  leads: leadsApi,
  config: configApi,
  scripts: scriptsApi,
  templates: templatesApi,
  goals: goalsApi,
  agenda: agendaApi,
  mining: miningApi,
  automation: automationApi,
  campaigns: campaignsApi,
  chat: chatApi,
  qualifications: qualificationsApi,
  audit: auditApi,
};

export default api;
