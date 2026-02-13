
import { GoogleGenAI, Type } from "@google/genai";
import { Lead, MasterTemplate, ObjectionAnalysis, CompanySize, ProspectCompany } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Motor de Inteligência Comercial
 */
export const solveObjectionIA = async (objection: string, lead: Lead, baseScriptBody?: string): Promise<ObjectionAnalysis> => {
  const prompt = `Atue como Assistente Comercial Sênior da Banca Ciatos.
    OBJETIVO: Neutralizar: "${objection}"
    CONTEXTO: Empresa ${lead.tradeName}, Segmento ${lead.segment}, Porte ${lead.size}.
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
    console.error("Erro Objeção IA:", err);
    throw err;
  }
};

/**
 * Radar Inteligente - Restauração de Busca Real-Time
 */
export const prospectCompanies = async (
  segment: string, city: string, state: string, size?: CompanySize, taxRegime?: string, page: number = 1
): Promise<{ companies: ProspectCompany[]; sources: any[] }> => {
  const prompt = `LOCALIZE 15 empresas reais: Segmento "${segment}", Cidade "${city}/${state}".
    Filtros: Porte ${size || 'Indiferente'}, Regime ${taxRegime || 'Indiferente'}.
    
    FORNEÇA OS DADOS NO FORMATO JSON ABAIXO (MANTENHA EXATAMENTE ESTAS CHAVES):
    {
      "companies": [
        {
          "name": "Razão Social",
          "cnpj": "00.000.000/0001-00",
          "cnpjRaw": "00000000000100",
          "segment": "${segment}",
          "city": "${city}",
          "state": "${state}",
          "phone": "(00) 0000-0000",
          "emailCompany": "contato@email.com",
          "website": "www.site.com",
          "partners": ["Sócio A"],
          "decisionMakerName": "Nome do Decisor",
          "decisionMakerPhoneFormatted": "(00) 90000-0000",
          "icpScore": 5,
          "debtStatus": "Regular",
          "estimatedRevenue": "R$ 10M+"
        }
      ]
    }`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: { 
        tools: [{ googleSearch: {} }]
        // Sem responseMimeType para evitar erro com googleSearch
      },
    });

    const text = response.text || '';
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    
    // Extrator Robusto: Busca o primeiro bloco que pareça JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const cleanJson = jsonMatch[0].replace(/```json|```/g, '');
      const parsed = JSON.parse(cleanJson);
      return { companies: parsed.companies || [], sources };
    }

    return { companies: [], sources: [] };
  } catch (error) {
    console.error("Erro Crítico Radar Gemini:", error);
    return { companies: [], sources: [] };
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
    return JSON.parse(response.text || '{}');
  } catch (err) { return { subject: '', body: '' }; }
};
