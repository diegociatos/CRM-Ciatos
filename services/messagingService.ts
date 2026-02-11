
import { MessagingConfig, InteractionType } from "../types";

export interface SendResult {
  success: boolean;
  latency: number;
  errorMessage?: string;
}

/**
 * Simula a validação de conexão SMTP
 */
export const validateSmtpConnection = async (config: MessagingConfig['smtp']): Promise<boolean> => {
  console.log("Validando SMTP:", config.host);
  await new Promise(r => setTimeout(r, 1500));
  // Validação simples: se host contiver 'error' falha
  return !config.host.toLowerCase().includes('error');
};

/**
 * Simula a validação de API WhatsApp
 */
export const validateWhatsAppConnection = async (config: MessagingConfig['whatsapp']): Promise<boolean> => {
  console.log("Validando WhatsApp API:", config.phoneId);
  await new Promise(r => setTimeout(r, 1200));
  return config.apiKey.length > 10;
};

/**
 * Disparo real (simulado) de mensagem com monitoramento
 */
export const sendDirectMessage = async (
  channel: InteractionType,
  recipient: string,
  subject: string,
  body: string,
  config: MessagingConfig
): Promise<SendResult> => {
  const start = Date.now();
  
  // Simula latência de rede
  await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
  
  const success = Math.random() > 0.05; // 95% de taxa de sucesso simulada
  const latency = Date.now() - start;

  if (!success) {
    return {
      success: false,
      latency,
      errorMessage: channel === 'EMAIL' ? 'SMTP_TIMEOUT_ERROR' : 'WHATSAPP_API_RATE_LIMIT'
    };
  }

  return {
    success: true,
    latency
  };
};
