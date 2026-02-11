
import { GoogleGenAI, Type } from "@google/genai";
import { Lead, MasterTemplate, ObjectionAnalysis, CompanySize, ProspectCompany } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Motor de Inteligência Comercial e Copywriting
 * Resolve objeções com base em contexto 360 do lead e scripts base.
 */
export const solveObjectionIA = async (objection: string, lead: Lead, baseScriptBody?: string): Promise<ObjectionAnalysis> => {
  const lastInteractions = lead.interactions.slice(0, 3).map(i => `${i.date}: ${i.title} - ${i.content}`).join(' | ');

  const prompt = `Atue como um Assistente Comercial Sênior e Redator Estratégico da Banca Ciatos (B2B Corporativo).
    
    OBJETIVO: Fornecer respostas táticas e copy persuasiva para neutralizar uma objeção e marcar o próximo passo (agenda ou proposta).

    DADOS DO LEAD (CONTEXTO):
    - Nome: ${lead.name}
    - Empresa: ${lead.tradeName} (${lead.segment})
    - Porte/Faturamento: ${lead.size} / ${lead.annualRevenue}
    - Últimos 3 Eventos: ${lastInteractions || 'Primeiro contato.'}
    - Template Base (Opcional): ${baseScriptBody || 'Nenhum script base definido.'}

    OBJEÇÃO RECEBIDA: "${objection}"

    REGRAS DE OURO:
    1. Use as variáveis {{nome}} e {{empresa}} no texto.
    2. Respeite o tom B2B consultivo, sem ser invasivo, focado em ROI e segurança jurídica/fiscal.
    3. SEMPRE inclua um CTA (Call to Action) claro.
    4. A saída DEVE ser um JSON puro, sem markdown fora do bloco de código.

    ESTRUTURA JSON OBRIGATÓRIA:
    {
      "quick_lines": [
        "Resposta curta 1 (Tom Direto)",
        "Resposta curta 2 (Tom Empático)",
        "Resposta curta 3 (Tom Consultivo)"
      ],
      "long_scripts": [
        "Script completo para call (3-5 frases) 1",
        "Script completo para call (3-5 frases) 2"
      ],
      "whatsapp_msg": "Mensagem pronta para WhatsApp com CTA e {{link_agenda}}",
      "follow_up": "Sugestão de ação concreta: enviar proposta, marcar demo, diagnostico, etc",
      "tags": ["preço", "tempo", "concorrente", "prioridade"],
      "confidence": {
        "percentual": 95,
        "razão": "Explicação de 1 frase do porquê esta tese funciona para este porte de empresa."
      }
    }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quick_lines: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 variações de tom" },
            long_scripts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "2 scripts detalhados" },
            whatsapp_msg: { type: Type.STRING },
            follow_up: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            confidence: {
              type: Type.OBJECT,
              properties: {
                percentual: { type: Type.NUMBER },
                razão: { type: Type.STRING }
              }
            }
          }
        }
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return parsed as ObjectionAnalysis;
  } catch (err) {
    console.error("Falha no Motor de Objeções IA:", err);
    throw err;
  }
};

export const generateScriptVariationIA = async (body: string, tone: string): Promise<string> => {
  const prompt = `Reescreva o script de vendas abaixo para um tom "${tone}". Mantenha as variáveis como {{nome}} e {{empresa}}. 
  Script Base: ${body}`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt
    });
    return response.text || body;
  } catch (err) {
    return body;
  }
};

export const personalizeMasterTemplateIA = async (lead: Lead, template: MasterTemplate): Promise<{ subject: string; body: string }> => {
  const prompt = `Personalize este template para o lead ${lead.tradeName}. Retorne JSON {subject, body}.`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    const parsed = JSON.parse(response.text || '{}');
    return { subject: parsed.subject || '', body: parsed.body || '' };
  } catch (err) {
    return { subject: '', body: '' };
  }
};

export const prospectCompanies = async (
  segment: string, city: string, state: string, size?: CompanySize, taxRegime?: string, page: number = 1
): Promise<{ companies: ProspectCompany[]; sources: any[] }> => {
  const prompt = `Encontre 20 empresas para o segmento ${segment} em ${city}/${state}. Retorne JSON {companies: []}.`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(response.text || '{"companies": []}');
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { companies: parsed.companies || [], sources };
  } catch (error) {
    return { companies: [], sources: [] };
  }
};
