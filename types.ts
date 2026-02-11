
export enum LeadStatus {
  NEW = 'Novo',
  QUALIFICATION = 'Qualificação',
  GARIMPO = 'Garimpo (Não Tratado)', 
  CONTACTED = 'Contatado',
  NEGOTIATION = 'Em Negociação',
  WON = 'Fechado (Ganho)',
  LOST = 'Perdido',
  REJECTED = 'Rejeitado',
  BROKEN = 'Quebrou',
  NO_CONTACT = 'Não Contatado',
  ARCHIVED_BLACKLIST = 'Arquivado/Blacklist'
}

export enum UserRole {
  ADMIN = 'Admin',
  MANAGER = 'Gerente',
  SDR = 'SDR / Prospecção',
  CLOSER = 'Closer / Consultor',
  OPERATIONAL = 'Operacional',
  CS = 'Pós-Venda',
  MARKETING = 'Marketing'
}

export type Department = 'Comercial' | 'Operacional' | 'Inteligência' | 'Marketing';

export enum CompanySize {
  ME = 'Microempresa (ME)',
  EPP = 'Pequeno Porte (EPP)',
  MEDIUM = 'Média Empresa',
  LARGE = 'Grande Empresa'
}

export interface Interaction {
  id: string;
  type: InteractionType;
  title: string;
  content: string;
  date: string;
  author: string;
  authorId: string;
  deliveryStatus?: 'delivered' | 'failed' | 'pending';
  errorMessage?: string;
  latency?: number;
  scoreImpact?: number;
  scriptVersionId?: string; 
}

export type InteractionType = 'NEW' | 'EDIT' | 'CALL' | 'MEETING' | 'NOTE' | 'WHATSAPP' | 'EMAIL' | 'REJECTION' | 'CONTRACT' | 'SMS' | 'FEEDBACK' | 'MARKETING_EVENT' | 'SCRIPT_USAGE';

export interface SalesScript {
  id: string;
  title: string;
  objective: 'pitch' | 'follow-up' | 'objection' | 'closing';
  serviceType: string;
  funnelPhaseId: string;
  tone: 'formal' | 'tecnico' | 'consultivo' | 'direto';
  targetSegment?: string;
  estimatedDuration: number; 
  bullets: string[];
  tags: string[];
  isGlobal: boolean; 
  authorId: string;
  versions: ScriptVersion[];
  currentVersionId: string;
  usageStats: {
    totalUsed: number;
    resolvedObjections: number;
    convertedToMeeting: number;
  };
}

export interface ScriptVersion {
  id: string;
  body: string; 
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  changeNote?: string;
}

export interface ObjectionAnalysis {
  quick_lines: string[]; 
  long_scripts: string[]; 
  whatsapp_msg: string;
  follow_up: string;
  tags: string[];
  confidence: {
    percentual: number;
    razão: string;
  };
}

export interface ScriptUsage {
  id: string;
  scriptId: string;
  versionId: string;
  leadId: string;
  userId: string;
  outcome: 'Interessado' | 'Objeção resolvida' | 'Precisa de proposta' | 'Não interessado';
  date: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string; // Novo campo para gestão de identidade
  role: UserRole;
  department: Department;
  avatar?: string;
  managerTypeId?: string;
}

export interface NavigationState {
  view: 'dashboard' | 'prospecting' | 'qualification' | 'kanban' | 'agenda' | 'post_sales' | 'customers' | 'settings' | 'sdr_dashboard' | 'closer_dashboard' | 'operational_dashboard' | 'marketing_automation' | 'scripts' | 'user_management';
}

// Mantendo as outras interfaces conforme os arquivos originais
export interface LeadPartner {
  name: string;
  sharePercentage: string;
  cpf?: string;
}

export interface MarketingHistory {
  id: string;
  step: string;
  action: string;
  timestamp: string;
  details: string;
}

export interface MarketingAutomation {
  currentStepId: string;
  status: 'IDLE' | 'RUNNING' | 'OPENED' | 'CLICKED' | 'PAUSED' | 'OPT_OUT';
  lastActionAt: string;
  history: MarketingHistory[];
  isAutomatic: boolean;
  aiContent?: string;
}

export interface MasterTemplate {
  id: string;
  name: string;
  category: 'RECUPERACAO' | 'HOLDING' | 'URGENCIA' | 'PROPOSTA';
  subject: string;
  content: string;
  lastUpdated: string;
}

export interface OnboardingPhaseTemplate {
  id: string;
  name: string;
  description: string;
  order: number;
  defaultDueDays: number;
  mandatory: boolean;
}

export interface OnboardingTemplate {
  id: string;
  serviceType: string;
  name: string;
  description: string;
  updatedAt: string;
  updatedBy: string;
  phases: OnboardingPhaseTemplate[];
}

// Added tradeName to fix miningService.ts error
export interface ProspectCompany {
  name: string;
  tradeName?: string;
  cnpj?: string;
  cnpjRaw?: string;
  segment: string;
  city: string;
  state: string;
  phone?: string;
  email?: string;
  emailCompany?: string;
  website?: string;
  partners?: string[];
  decisionMakerName?: string;
  decisionMakerPhoneFormatted?: string;
  icpScore?: number;
  debtStatus?: string;
  estimatedRevenue?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'success' | 'warning' | 'info';
  read: boolean;
}

export interface LeadFilters {
  status: LeadStatus[];
  size: CompanySize[];
  segment: string;
  location: string;
  hasInteractions: 'any' | 'none' | 'recent' | 'old';
}

export interface SmartListFilters extends LeadFilters {
  operator: 'AND' | 'OR';
  state: string;
  city: string;
  minScore: number;
  debtStatus: string;
  taxRegime: string[];
  digitalPresence: {
    linkedin: boolean;
    instagram: boolean;
    website: boolean;
  };
}

export interface SmartList {
  id: string;
  name: string;
  filters: SmartListFilters | LeadFilters;
  leadsCount: number;
  createdAt: string;
}

export interface CalendarConfig {
  isIntegrated: boolean;
}

export interface MiningJob {
  id: string;
  name: string;
  status: 'Running' | 'Paused' | 'Completed' | 'Cancelled' | 'Failed';
  version: number;
  configPayload: any;
  filters: {
    segment: string;
    state: string;
    city: string;
    size: CompanySize | 'all';
    taxRegime: string;
    fiscalFilter: 'Dívida Ativa' | 'Indiferente';
  };
  targetCount: number;
  foundCount: number;
  pagesFetched: number;
  errors: number;
  autoCreateSegment: boolean;
  enrich: boolean;
  createdAt: string;
  updatedAt: string;
  lastNotificationMilestone: number;
}

export interface MiningLead extends ProspectCompany {
  id: string;
  jobId: string;
  phoneCompany: string;
  emailCompany: string;
  partners: string[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  scoreIa: number;
  debtValueEst: string;
  sources: string[];
  isGarimpo: boolean;
  isImported?: boolean;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
}

export interface SdrQualification {
  id: string;
  sdrId: string;
  leadId: string;
  companyName: string;
  date: string;
  type: 'QUALIFICATION' | 'MEETING' | 'PROPOSAL' | 'CONTRACT';
  status: 'Pendente' | 'Aprovado' | 'Rejeitado';
  bonusValue: number;
}

export interface AutomationStep {
  id: string;
  type: 'SEND_MESSAGE' | 'WAIT' | 'CHANGE_STATUS' | 'NOTIFY_USER' | 'CREATE_TASK';
  templateId?: string;
  waitDays?: number;
  status?: LeadStatus;
  userId?: string;
  content?: string;
}

export type AutomationTrigger = 'LEAD_QUALIFIED' | 'PHASE_CHANGED' | 'PROPOSAL_SENT_SERVICE' | 'LINK_CLICKED';

export interface AutomationFlow {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerSubValue?: string;
  steps: AutomationStep[];
  active: boolean;
  stats: {
    enrolled: number;
    completed: number;
    emailsSent: number;
    opens: number;
    clicks: number;
  };
  logs: any[];
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: 'Alta' | 'Média' | 'Baixa';
  leadId?: string;
  completed: boolean;
}

export interface OnboardingComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  date: string;
}

export interface OnboardingAttachment {
  id: string;
  name: string;
  url: string;
  date: string;
  uploadedBy: string;
}

export interface OnboardingItem {
  id: string;
  title: string;
  description: string;
  status: 'Pendente' | 'Em Andamento' | 'Bloqueado' | 'Concluido';
  responsibleId: string;
  dueDate: string;
  updatedAt: string;
  items: any[];
  comments: OnboardingComment[];
  attachments: OnboardingAttachment[];
  templatePhaseId?: string;
}

export interface NpsSurvey {
  id: string;
  scheduledAt: string;
  performedAt?: string;
  status: 'Pendente' | 'Concluido';
  type: '90_DAYS' | 'ANNUAL';
  channel: 'Telefone' | 'Email' | 'WhatsApp';
  score?: number;
  notes?: string;
}

export interface SuccessTask {
  id: string;
  title: string;
  dueDate: string;
  status: 'Pendente' | 'Concluido';
  category: 'Expansao' | 'NPS_FollowUp';
}

export interface WelcomeData {
  callDate?: string;
  callNotes?: string;
  emailDate?: string;
  kitSent?: boolean;
  kitDate?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityId: string;
  userId: string;
  userName: string;
  timestamp: string;
  previousState?: any;
  newState?: any;
}

export interface Participant {
  userId: string;
  status: string;
}

export interface ManagerType {
  id: string;
  name: string;
  color: string;
}

export interface CustomerFeedbackPoint {
  id: string;
  type: 'POSITIVE' | 'NEGATIVE';
  text: string;
  date: string;
  authorName: string;
}

export interface MessagingConfig {
  smtp: {
    host: string;
    user?: string;
    pass?: string;
  };
  whatsapp: {
    apiKey: string;
    phoneId?: string;
  };
}

export interface Lead {
  id: string;
  name: string; 
  email: string; 
  phone: string; 
  company: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  cnpjRaw: string;
  companyEmail?: string;
  companyPhone?: string;
  segment: string;
  size: CompanySize;
  taxRegime: string;
  annualRevenue: string;
  monthlyRevenue?: string;
  payrollValue?: string;
  status: LeadStatus;
  phaseId: string;
  ownerId: string;
  qualifiedById?: string;
  scheduledById?: string;
  closedById?: string;
  createdAt: string;
  debtStatus: string; 
  inQueue: boolean;
  interactions: Interaction[];
  tasks: Task[];
  onboardingChecklist?: OnboardingItem[];
  welcomeData?: WelcomeData;
  npsSurveys?: NpsSurvey[];
  successTasks?: SuccessTask[];
  feedbackPoints?: CustomerFeedbackPoint[];
  healthScore?: number;
  engagementScore?: number;
  contractStart?: string;
  contractEnd?: string;
  serviceType?: string;
  contractValue?: string;
  icpScore: number;
  city: string;
  state: string;
  address?: string;
  detailedPartners: LeadPartner[];
  contractNumber?: string;
  notes?: string;
  strategicPains?: string;
  expectations?: string;
  role?: string;
  website?: string;
  linkedinDM?: string;
  instagramDM?: string;
  linkedinCompany?: string;
  instagramCompany?: string;
  closeProbability: number;
  marketingAutomation?: MarketingAutomation;
  onboardingTemplateId?: string;
  lgpdConsent?: { status: 'OPT_IN' | 'OPT_OUT'; date: string; };
  location?: string;
  enriched?: boolean;
}

export interface KanbanPhase {
  id: string;
  name: string;
  order: number;
  color: string;
  authorizedUserIds: string[];
}

export interface TaskType {
  id: string;
  name: string;
  channel: string;
  color: string;
  icon: string;
  requireDecisor: boolean;
  template: string;
}

export interface SystemConfig {
  phases: KanbanPhase[];
  taskTypes: TaskType[];
  companySizes: string[];
  taxRegimes: string[];
  serviceTypes: string[];
  messaging: MessagingConfig;
  bonus: any;
  publicSchedulerLink: string;
}

export interface UserGoal {
  id: string;
  userId: string;
  month: number;
  year: number;
  qualsGoal: number;
  callsGoal: number;
  proposalsGoal: number; 
  contractsGoal: number;
}

export interface AgendaEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  assignedToId: string;
  leadId?: string;
  typeId?: string;
  type: string;
  description?: string;
  status: string;
  participants: { userId: string; status: string }[];
  department: string;
  creatorId: string;
}

// Added missing interfaces for MarketingHub and ReportsDashboard
export interface CampaignComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

export interface Campaign {
  id: string;
  name: string;
  smartListId: string;
  templates: {
    email?: string;
    whatsapp?: string;
  };
  status: 'InReview' | 'Approved' | 'Running' | 'Completed';
  comments: CampaignComment[];
  createdAt: string;
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    errors: number;
  };
}

// Added missing interfaces for ChatModule
export interface ChatThread {
  id: string;
  title: string;
  leadId?: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  fileUrl?: string;
  fileName?: string;
}
