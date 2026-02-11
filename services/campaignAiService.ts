
import { GoogleGenAI } from "@google/genai";

export type CampaignTheme = 'contabilidade' | 'juridico' | 'planejamento' | 'holding' | 'recuperacao';

export interface GeneratedCampaign {
  subject: string;
  emailBody: string;
  whatsappMessage: string;
  followUpEmail: string;
}

const THEME_PROMPTS: Record<CampaignTheme, string> = {
  contabilidade: "Foco em eficiência contábil, conformidade e redução de custos operacionais via outsourcing.",
  juridico: "Foco em blindagem patrimonial, teses jurídicas de alto impacto e redução de passivos.",
  planejamento: "Foco em otimização de regime tributário (Lucro Real vs Presumido) para aumento de margem líquida.",
  holding: "Foco em sucessão familiar, proteção de ativos e eficiência fiscal sucessória.",
  recuperacao: "Foco em créditos tributários não aproveitados (PIS/COFINS, ICMS) com recebimento rápido."
};

export const generateCampaignContent = async (theme: CampaignTheme): Promise<GeneratedCampaign> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Atue como um Copywriter B2B de Elite especializado no setor corporativo brasileiro (Banca Ciatos).
    TEMA DA CAMPANHA: ${THEME_PROMPTS[theme]}
    
    REQUISITOS:
    - Tom de voz: Autoritário, profissional, exclusivo e focado em ROI.
    - Use variáveis: {{nome_contato}}, {{nome_empresa}}, {{segmento}}.
    - O conteúdo deve ser direto (sem "espero que esteja bem").
    
    ESTRUTURA JSON OBRIGATÓRIA:
    {
      "subject": "Linha de assunto matadora",
      "emailBody": "Corpo do e-mail inicial",
      "whatsappMessage": "Mensagem curta para WhatsApp follow-up",
      "followUpEmail": "E-mail de re-engajamento após 3 dias"
    }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text || "{}") as GeneratedCampaign;
  } catch (error) {
    console.error("Erro ao gerar campanha via IA:", error);
    return {
      subject: "Oportunidade Estratégica para a {{nome_empresa}}",
      emailBody: "Prezado(a) {{nome_contato}},\n\nIdentificamos uma oportunidade de otimização em seu setor.",
      whatsappMessage: "Olá {{nome_contato}}, sou da Ciatos. Podemos falar sobre a {{nome_empresa}}?",
      followUpEmail: "Olá {{nome_contato}}, gostaria de reforçar o diagnóstico que propusemos."
    };
  }
};
