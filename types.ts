
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

export interface WelcomeData {
  callDate?: string;
  callNotes?: string;
  emailDate?: string;
  kitSent?: boolean;
  kitDate?: string;
}

export type AutomationPhase = 'POST_QUALIFICATION' | 'POST_MEETING' | 'POST_PROPOSAL' | 'NURTURING' | 'WIN_BACK' | 'CUSTOM';

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
  tasks: any[];
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
}

export type InteractionType = 'NEW' | 'EDIT' | 'CALL' | 'MEETING' | 'NOTE' | 'WHATSAPP' | 'EMAIL' | 'REJECTION' | 'CONTRACT' | 'SMS' | 'FEEDBACK' | 'MARKETING_EVENT';

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

export interface NavigationState {
  view: 'dashboard' | 'prospecting' | 'qualification' | 'kanban' | 'agenda' | 'post_sales' | 'customers' | 'settings' | 'sdr_dashboard' | 'closer_dashboard' | 'operational_dashboard' | 'marketing_automation';
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: Department;
  avatar?: string;
  managerTypeId?: string;
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
  participants: Participant[];
  department: string;
  creatorId: string;
}

export interface Participant {
  userId: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface SdrQualification {
  id: string;
  leadId: string;
  sdrId: string;
  companyName: string;
  date: string;
  type: 'QUALIFICATION' | 'MEETING' | 'CONTRACT' | 'PROPOSAL';
  bonusValue: number;
  status: 'Aprovado' | 'Revertido' | 'Pendente';
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

export interface MessagingConfig {
  smtp: { host: string; };
  whatsapp: { apiKey: string; phoneId?: string; };
}

export interface CustomerFeedbackPoint {
  id: string;
  type: 'POSITIVE' | 'NEGATIVE';
  text: string;
  date: string;
  authorName: string;
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

export interface OnboardingPhaseTemplate {
  id: string;
  name: string;
  description: string;
  order: number;
  defaultDueDays: number;
  mandatory: boolean;
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

export interface NpsSurvey {
  id: string;
  scheduledAt: string;
  performedAt?: string;
  score?: number;
  notes?: string;
  channel: string;
  status: 'Pendente' | 'Concluido';
  type: '90_DAYS' | 'ANNUAL';
}

export interface SuccessTask {
  id: string;
  title: string;
  dueDate: string;
  status: 'Pendente' | 'Concluido';
  category: 'Boas-Vindas' | 'Expansao' | 'NPS_FollowUp';
}

export interface LeadPartner {
  name: string;
  sharePercentage: string;
  cpf?: string;
}

export interface MarketingHistory {
  id: string;
  step: string;
  action: 'EMAIL_SENT' | 'EMAIL_OPENED' | 'LINK_CLICKED' | 'OPT_OUT' | 'MANUAL' | 'SCORE_UPDATED' | 'RE-SENT';
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
  category: string;
  subject: string;
  content: string;
  logoUrl?: string;
  lastUpdated: string;
}

export interface AutomationFlow {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerValue?: string; 
  triggerSubValue?: string; // Ex: ID da Fase ou Nome do Serviço
  steps: AutomationStep[];
  active: boolean;
  stats: { 
    enrolled: number; 
    completed: number; 
    emailsSent?: number; 
    opens?: number; 
    clicks?: number; 
  };
  logs: AutomationLog[];
  createdAt: string;
}

export interface AutomationStep {
  id: string;
  type: 'SEND_MESSAGE' | 'WAIT' | 'CONDITION' | 'CREATE_TASK' | 'CHANGE_STATUS' | 'NOTIFY_USER';
  templateId?: string;
  waitDays?: number;
  status?: LeadStatus;
  content?: string;
  userId?: string;
  conditionType?: 'OPENED' | 'CLICKED';
  trueStepId?: string;
  falseStepId?: string;
}

export type AutomationTrigger = 'LEAD_QUALIFIED' | 'PHASE_CHANGED' | 'PROPOSAL_SENT_SERVICE' | 'EMAIL_OPENED' | 'LINK_CLICKED';

export interface AutomationLog {
  id: string;
  timestamp: string;
  leadName: string;
  action: string;
  status: 'Success' | 'Failure';
}

export interface ProspectCompany {
  cnpjRaw: string;
  name: string;
  phone?: string;
  email?: string;
  partners?: string[];
  decisionMakerName?: string;
  decisionMakerPhoneFormatted?: string;
  icpScore?: number;
  debtStatus?: string;
  estimatedRevenue?: string;
  emailCompany?: string;
  // Added fix for Property 'website' does not exist on type 'ProspectCompany' error in miningService
  website?: string;
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
  filters: any;
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
  tradeName: string;
  phoneCompany: string;
  emailCompany: string;
  partners: string[];
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  scoreIa: number;
  debtStatus: string;
  debtValueEst: string;
  sources: string[];
  isGarimpo: boolean;
  createdAt: string;
  isImported?: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
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

export interface ManagerType {
  id: string;
  name: string;
  color: string;
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
