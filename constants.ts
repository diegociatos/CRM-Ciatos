
import { OnboardingTemplate, LeadStatus, CompanySize, Lead, MasterTemplate } from './types';

export const DEFAULT_MASTER_TEMPLATES: MasterTemplate[] = [
  {
    id: 'tpl-curio-001',
    name: 'Apresentação: Recuperação PIS/COFINS',
    category: 'RECUPERACAO',
    subject: 'Oportunidade de Caixa Imediato para a {{empresa}}',
    content: 'Prezado(a) {{nome_lead}}.\n\nNotei que a {{empresa}} atua no setor de {{segmento}} e possui faturamento médio de {{faturamento_anual}}. Identificamos teses tributárias específicas para o seu regime ({{regime_tributario}}) que podem gerar recuperação de créditos retroativos.\n\nTemos uma estratégia testada para o seu porte. Teria interesse em analisar o diagnóstico preliminar?',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'tpl-agenda-001',
    name: 'Convite: Reunião de Blindagem Patrimonial',
    category: 'HOLDING',
    subject: 'Sucessão e Proteção para Sócios da {{empresa}}',
    content: 'Olá, {{nome_lead}}.\n\nBaseado na composição societária da {{empresa}}, desenhamos um modelo de holding que visa reduzir a carga tributária sucessória em até 80%.\n\nConsegue nos receber para uma call rápida de 15 minutos na próxima terça?',
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'tpl-follow-001',
    name: 'Follow-up: Urgência Fiscal',
    category: 'URGENCIA',
    subject: 'Ponto Crítico identificado para a {{empresa}}',
    content: 'Oi {{nome_lead}},\n\nestou reenviando este e-mail pois houve uma atualização normativa importante para empresas de {{segmento}} este mês.\n\nSeguem abaixo os pontos que identifiquei para a {{empresa}}...',
    lastUpdated: new Date().toISOString()
  }
];

export const DEFAULT_ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: 'tpl-tributario-001',
    serviceType: 'Planejamento Tributário',
    name: 'Jornada de Recuperação Créditos',
    description: 'Fluxo padrão para auditoria digital e protocolo de compensação.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'Admin Sistema',
    phases: [
      { id: 'tp-t1', name: 'Coleta de XMLs', description: 'Download dos arquivos de entrada/saída via e-CAC.', order: 0, defaultDueDays: 3, mandatory: true },
      { id: 'tp-t2', name: 'Auditoria Digital', description: 'Cruzamento de dados via motor Ciatos Intelligence.', order: 1, defaultDueDays: 7, mandatory: true },
      { id: 'tp-t3', name: 'Reunião de Teses', description: 'Apresentação do diagnóstico para aprovação do cliente.', order: 2, defaultDueDays: 5, mandatory: true },
      { id: 'tp-t4', name: 'Implementação', description: 'Retificação de obrigações e protocolo de crédito.', order: 3, defaultDueDays: 10, mandatory: true }
    ]
  }
];

export const INITIAL_LEADS: Lead[] = [
  {
    id: 'lead-sdr-001',
    name: 'Arnaldo Souza',
    email: 'arnaldo@tiavancada.com.br',
    phone: '(12) 99123-4567',
    company: 'TI Avançada Ltda',
    tradeName: 'TI Avançada',
    legalName: 'TI Avançada Indústria e Comércio Ltda',
    cnpj: '12.345.678/0001-90',
    cnpjRaw: '12345678000190',
    segment: 'Indústria',
    size: CompanySize.LARGE,
    taxRegime: 'Lucro Real',
    annualRevenue: 'R$ 45.000.000,00',
    status: LeadStatus.QUALIFICATION,
    phaseId: 'ph-qualificado',
    ownerId: 'user-sdr',
    createdAt: new Date().toISOString(),
    debtStatus: 'Dívida Ativa',
    inQueue: true,
    interactions: [],
    tasks: [],
    city: 'São José dos Campos',
    state: 'SP',
    icpScore: 5,
    engagementScore: 12,
    detailedPartners: [{ name: 'Arnaldo Souza Sr.', sharePercentage: '100%', cpf: '123.***.***-00' }],
    closeProbability: 4,
    marketingAutomation: {
       currentStepId: 'STEP_01',
       status: 'RUNNING',
       lastActionAt: new Date().toISOString(),
       history: [],
       isAutomatic: true
    }
  },
  {
    id: 'customer-won-001',
    name: 'José Gontijo',
    email: 'diretoria@gontijocargas.com.br',
    phone: '(31) 99999-8888',
    company: 'Gontijo Cargas Ltda',
    tradeName: 'Gontijo Cargas',
    legalName: 'Gontijo Cargas Ltda',
    cnpj: '00.000.000/0001-91',
    cnpjRaw: '00000000000191',
    segment: 'Transportes',
    size: CompanySize.LARGE,
    taxRegime: 'Lucro Real',
    annualRevenue: 'R$ 48.000.000,00',
    status: LeadStatus.WON,
    phaseId: 'ph-fech',
    ownerId: 'user-closer',
    createdAt: '2024-01-10T10:00:00Z',
    debtStatus: 'Regular',
    contractStart: '2024-02-01',
    contractNumber: 'CT-2024-101',
    serviceType: 'Planejamento Tributário',
    contractValue: 'R$ 240.000,00',
    city: 'Belo Horizonte',
    state: 'MG',
    icpScore: 5,
    healthScore: 95,
    engagementScore: 42,
    closeProbability: 5,
    inQueue: false,
    interactions: [],
    tasks: [],
    detailedPartners: [{ name: 'José Gontijo', sharePercentage: '100%', cpf: '999.***.***-00' }]
  }
];

export const PLAYBOOK_DATA = { roles: {} };
