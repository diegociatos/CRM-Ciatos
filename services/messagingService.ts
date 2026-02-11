
import { MessagingConfig, InteractionType, EmailProvider, Lead, Interaction } from "../types";

export interface SendResult {
  success: boolean;
  latency: number;
  errorMessage?: string;
  messageId?: string;
}

/**
 * Simula a criptografia de chaves de API (AES-256 Mock)
 */
export const encryptKey = (key: string): string => {
  if (!key) return "";
  return `ENC_AES256_${btoa(key)}`;
};

export const decryptKey = (encrypted: string): string => {
  if (!encrypted.startsWith("ENC_AES256_")) return encrypted;
  return btoa(encrypted.replace("ENC_AES256_", ""));
};

/**
 * Valida a conexão com o provedor selecionado
 */
export const testEmailConnection = async (config: MessagingConfig['email']): Promise<SendResult> => {
  const start = Date.now();
  console.log(`[Backend] Testando conexão com ${config.provider}...`);
  
  await new Promise(r => setTimeout(r, 1800)); // Latência de rede simulada

  const decryptedKey = decryptKey(config.apiKey);

  if (decryptedKey.length < 8) {
    return { 
      success: false, 
      latency: Date.now() - start, 
      errorMessage: "Credenciais inválidas ou insuficientes." 
    };
  }

  return { 
    success: true, 
    latency: Date.now() - start,
    messageId: `test-${Math.random().toString(36).substr(2, 9)}`
  };
};

/**
 * Função Global de Envio de E-mail (Agnóstica ao Provedor)
 */
export const sendEmail = async (
  to: string, 
  subject: string, 
  body: string, 
  config: MessagingConfig['email']
): Promise<SendResult> => {
  const start = Date.now();
  
  // No mundo real, aqui haveria um switch/case chamando a SDK do SendGrid, SES, etc.
  console.log(`[Email Engine] Enviando via ${config.provider} para ${to}...`);
  
  await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

  const success = Math.random() > 0.05; // 95% de sucesso simulado

  return {
    success,
    latency: Date.now() - start,
    messageId: success ? `msg-${Math.random().toString(36).substr(2, 9)}` : undefined,
    errorMessage: success ? undefined : "PROVIDER_TIMEOUT"
  };
};

/**
 * Added to fix the error in MarketingHub.tsx.
 * Função unificada para envio de mensagens diretas (Email, WhatsApp, SMS)
 */
export const sendDirectMessage = async (
  type: 'EMAIL' | 'WHATSAPP' | 'SMS',
  to: string,
  subject: string,
  body: string,
  config: MessagingConfig
): Promise<SendResult> => {
  if (type === 'EMAIL') {
    return sendEmail(to, subject, body, config.email);
  }
  // Mock para outros canais como WhatsApp ou SMS
  const start = Date.now();
  await new Promise(r => setTimeout(r, 400));
  return {
    success: true,
    latency: Date.now() - start,
    messageId: `direct-${Date.now()}`
  };
};

/**
 * Simulador de Webhook de Provedor
 * Atualiza o Lead com eventos de tracking
 */
export const processEmailWebhook = (
  lead: Lead, 
  event: 'open' | 'click' | 'bounce', 
  metadata: any
): Lead => {
  const eventTitles = {
    open: '👁️ E-mail Aberto',
    click: '🖱️ Link Clicado',
    bounce: '🚫 E-mail Rejeitado (Bounce)'
  };

  const interactionType: InteractionType = 
    event === 'open' ? 'EMAIL_OPEN' : 
    event === 'click' ? 'EMAIL_CLICK' : 'EMAIL_BOUNCE';

  const newInteraction: Interaction = {
    id: `webhook-${Date.now()}`,
    type: interactionType,
    title: eventTitles[event],
    content: `Evento detectado via Webhook. Provedor: ${metadata.provider}. Localização: ${metadata.ip || 'N/A'}`,
    date: new Date().toISOString(),
    author: 'Ciatos Email Tracker',
    authorId: 'system-tracker',
    scoreImpact: event === 'click' ? 5 : event === 'open' ? 2 : -10
  };

  return {
    ...lead,
    interactions: [newInteraction, ...lead.interactions],
    engagementScore: (lead.engagementScore || 0) + (newInteraction.scoreImpact || 0)
  };
};
