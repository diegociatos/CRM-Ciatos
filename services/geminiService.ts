
import { GoogleGenAI, Type } from "@google/genai";
import { ProspectCompany, CompanySize, Lead, MasterTemplate } from "../types";

export const personalizeMasterTemplateIA = async (lead: Lead, template: MasterTemplate): Promise<{ subject: string; body: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Você é um Consultor Estratégico da Banca Ciatos. Personalize este template mestre para o lead abaixo.
  
  DADOS DO LEAD:
  - Empresa: ${lead.tradeName} (${lead.segment})
  - Faturamento: ${lead.annualRevenue}
  - Regime: ${lead.taxRegime}
  - Decisor: ${lead.name} (${lead.role || 'Sócio'})
  - ICP Score: ${lead.icpScore}/5
  
  TEMPLATE MESTRE:
  Assunto: ${template.subject}
  Conteúdo: ${template.content}
  
  REQUISITOS:
  1. Mantenha o tom profissional e focado em ROI.
  2. Substitua variáveis como {{empresa}} e {{nome_lead}}.
  3. Adicione uma frase personalizada sobre o setor de ${lead.segment}.
  4. Retorne em JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING }
          },
          required: ["subject", "body"]
        }
      }
    });
    const parsed = JSON.parse(response.text || '{}');
    return {
      subject: parsed.subject || template.subject,
      body: parsed.body || template.content
    };
  } catch (err) {
    console.error("Erro IA Personalização:", err);
    return { subject: template.subject, body: template.content };
  }
};

export const prospectCompanies = async (
  segment: string, city: string, state: string, size?: CompanySize, taxRegime?: string, page: number = 1
): Promise<{ companies: ProspectCompany[]; sources: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Encontre 20 empresas REAIS e ATIVAS para o segmento "${segment}" localizadas em "${city}/${state}" (Página de busca: ${page}).
  Critérios Adicionais: Porte: ${size || 'Indiferente'}, Regime: ${taxRegime || 'Indiferente'}.
  Extraia dados precisos incluindo sócios (partners) e o provável decisor (CEO/Diretor).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }], 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            companies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  cnpjRaw: { type: Type.STRING, description: "Somente números do CNPJ" },
                  name: { type: Type.STRING, description: "Razão Social ou Nome Fantasia" },
                  phone: { type: Type.STRING },
                  email: { type: Type.STRING },
                  partners: { type: Type.ARRAY, items: { type: Type.STRING } },
                  decisionMakerName: { type: Type.STRING },
                  decisionMakerPhoneFormatted: { type: Type.STRING },
                  icpScore: { type: Type.NUMBER, description: "Score de 1 a 5 baseado no potencial tributário" },
                  debtStatus: { type: Type.STRING, description: "Regular ou Dívida Ativa" },
                  estimatedRevenue: { type: Type.STRING },
                  emailCompany: { type: Type.STRING },
                  website: { type: Type.STRING }
                },
                required: ["cnpjRaw", "name"]
              }
            }
          }
        }
      },
    });
    
    const text = response.text || '{"companies": []}';
    const parsed = JSON.parse(text);
    return { 
      companies: parsed.companies || [], 
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [] 
    };
  } catch (error) {
    console.error("Erro crítico na prospecção IA:", error);
    return { companies: [], sources: [] };
  }
};
