
import { GoogleGenAI, Type } from "@google/genai";
import { Lead, MasterTemplate, ObjectionAnalysis, CompanySize, ProspectCompany } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Motor de Inteligência Comercial e Copywriting
 */
export const solveObjectionIA = async (objection: string, lead: Lead, baseScriptBody?: string): Promise<ObjectionAnalysis> => {
  const lastInteractions = lead.interactions.slice(0, 3).map(i => `${i.date}: ${i.title} - ${i.content}`).join(' | ');

  const prompt = `Atue como um Assistente Comercial Sênior da Banca Ciatos.
    OBJETIVO: Neutralizar a objeção: "${objection}"
    CONTEXTO DO LEAD: ${lead.tradeName}, ${lead.segment}, ${lead.size}.
    RETORNE APENAS JSON.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            quick_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
            long_scripts: { type: Type.ARRAY, items: { type: Type.STRING } },
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

    return JSON.parse(response.text || '{}') as ObjectionAnalysis;
  } catch (err) {
    console.error("Falha no Motor de Objeções IA:", err);
    throw err;
  }
};

export const generateScriptVariationIA = async (body: string, tone: string): Promise<string> => {
  const prompt = `Reescreva o script para um tom "${tone}": ${body}`;
  try {
    const response = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt });
    return response.text || body;
  } catch (err) { return body; }
};

export const personalizeMasterTemplateIA = async (lead: Lead, template: MasterTemplate): Promise<{ subject: string; body: string }> => {
  const prompt = `Personalize este template para o lead ${lead.tradeName}. Retorne JSON {subject, body}.`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '{}');
  } catch (err) { return { subject: '', body: '' }; }
};

/**
 * Radar Inteligente de Prospecção (Google Search Grounding)
 * ATENÇÃO: Proibido usar responseMimeType: application/json com googleSearch
 */
export const prospectCompanies = async (
  segment: string, city: string, state: string, size?: CompanySize, taxRegime?: string, page: number = 1
): Promise<{ companies: ProspectCompany[]; sources: any[] }> => {
  const prompt = `ENCONTRE 15 empresas reais do segmento "${segment}" em "${city}/${state}".
    CRITÉRIOS: Porte ${size || 'Indiferente'}, Regime ${taxRegime || 'Indiferente'}.
    
    RETORNE OBRIGATORIAMENTE UM BLOCO JSON COM ESTE FORMATO NO MEIO DO TEXTO:
    {
      "companies": [
        {
          "name": "Nome da Empresa",
          "cnpj": "00.000.000/0001-00",
          "cnpjRaw": "00000000000100",
          "segment": "Segmento",
          "city": "Cidade",
          "state": "UF",
          "phone": "(00) 0000-0000",
          "emailCompany": "contato@empresa.com.br",
          "website": "www.empresa.com.br",
          "partners": ["Sócio 1", "Sócio 2"],
          "decisionMakerName": "Nome do Decisor",
          "decisionMakerPhoneFormatted": "(00) 90000-0000",
          "icpScore": 5,
          "debtStatus": "Regular",
          "estimatedRevenue": "R$ 10M - 20M"
        }
      ]
    }`;

  try {
    // Usando Gemini 3 Pro para melhor grounding de busca
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }] 
        // responseMimeType REMOVIDO para evitar erro com googleSearch
      },
    });

    const text = response.text || '';
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Extração manual de JSON do bloco de texto
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { companies: parsed.companies || [], sources };
    }

    return { companies: [], sources: [] };
  } catch (error) {
    console.error("Erro no Radar Gemini:", error);
    return { companies: [], sources: [] };
  }
};
