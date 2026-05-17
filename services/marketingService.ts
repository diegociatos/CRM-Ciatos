
import { Lead, MarketingHistory } from "../types";

export interface IntegrationLog {
  timestamp: string;
  leadId: string;
  leadName: string;
  event: 'QUALIFICATION_SYNC' | 'EMAIL_VALIDATION' | 'SEQUENCE_START' | 'TRACKING_WEBHOOK' | 'LGPD_OPT_OUT';
  status: 'SUCCESS' | 'FAILURE';
  details: string;
}

/**
 * Valida o formato do e-mail conforme padrões comerciais.
 */
export const validateEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(String(email).toLowerCase());
};

/**
 * Registra logs de integração no localStorage para auditoria técnica.
 */
export const logIntegrationEvent = (event: Omit<IntegrationLog, 'timestamp'>) => {
  const logs: IntegrationLog[] = JSON.parse(localStorage.getItem('ciatos_integration_logs') || '[]');
  const newLog = { ...event, timestamp: new Date().toISOString() };
  localStorage.setItem('ciatos_integration_logs', JSON.stringify([newLog, ...logs].slice(0, 100)));
  
  // Simula o disparo de um Webhook Externo
  console.log(`[WEBHOOK] Outbound Event: ${event.event} for Lead ${event.leadName} - Status: ${event.status}`);
};

export const getIntegrationLogs = (): IntegrationLog[] => {
  return JSON.parse(localStorage.getItem('ciatos_integration_logs') || '[]');
};

/**
 * Simula a recepção de um sinal de rastreamento do servidor de e-mail (Opened/Clicked).
 * Em um cenário real, isso seria um endpoint de Webhook.
 */
export const simulateEmailEvent = (lead: Lead): Lead => {
  if (!lead.marketingAutomation || lead.marketingAutomation.status === 'OPT_OUT') return lead;

  const rand = Math.random();
  let newStatus = lead.marketingAutomation.status;
  let action: any = null;
  let details = '';

  if (rand > 0.8) {
    newStatus = 'CLICKED';
    action = 'LINK_CLICKED';
    details = 'Lead clicou no link de agendamento do consultor.';
  } else if (rand > 0.4) {
    newStatus = 'OPENED';
    action = 'EMAIL_OPENED';
    details = 'Lead visualizou o e-mail de apresentação.';
  }

  if (action && newStatus !== lead.marketingAutomation.status) {
    // Fix: currentStep does not exist, using currentStepId
    const historyEntry: MarketingHistory = {
      id: `track-${Date.now()}`,
      step: lead.marketingAutomation.currentStepId,
      action,
      timestamp: new Date().toISOString(),
      details
    };

    logIntegrationEvent({
      leadId: lead.id,
      leadName: lead.tradeName,
      event: 'TRACKING_WEBHOOK',
      status: 'SUCCESS',
      details: `Evento de ${action} processado automaticamente.`
    });

    return {
      ...lead,
      marketingAutomation: {
        ...lead.marketingAutomation,
        status: newStatus as any,
        lastActionAt: new Date().toISOString(),
        history: [...lead.marketingAutomation.history, historyEntry]
      }
    };
  }

  return lead;
};

/**
 * Verifica leads que precisam de reenvio automático (não abriram em 24h).
 */
export const checkAutoResends = (leads: Lead[]): Lead[] => {
  const now = new Date().getTime();
  const dayInMs = 24 * 60 * 60 * 1000;

  // Fix: ensuring return type is Lead[]
  return leads.map((lead): Lead => {
    if (!lead.marketingAutomation || !lead.marketingAutomation.isAutomatic) return lead;
    // Fix: currentStep does not exist, using currentStepId
    if (lead.marketingAutomation.status === 'RUNNING' && lead.marketingAutomation.currentStepId === 'PRESENTATION') {
      const lastAction = new Date(lead.marketingAutomation.lastActionAt).getTime();
      if (now - lastAction > dayInMs) {
        // Dispara o reenvio (Simulado)
        const retryEntry: MarketingHistory = {
          id: `retry-${Date.now()}`,
          step: 'RETRY_PRESENTATION',
          action: 'RE-SENT',
          timestamp: new Date().toISOString(),
          details: 'Reenvio automático IA: Lead não abriu o primeiro e-mail em 24h.'
        };

        logIntegrationEvent({
          leadId: lead.id,
          leadName: lead.tradeName,
          event: 'SEQUENCE_START',
          status: 'SUCCESS',
          details: 'Disparo de reengajamento automático efetuado.'
        });

        return {
          ...lead,
          marketingAutomation: {
            ...lead.marketingAutomation,
            currentStepId: 'RETRY_PRESENTATION',
            lastActionAt: new Date().toISOString(),
            history: [...lead.marketingAutomation.history, retryEntry]
          }
        };
      }
    }
    return lead;
  });
};
