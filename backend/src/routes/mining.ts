import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';
import { GoogleGenAI } from '@google/genai';

const router = Router();

// ========== MINING JOBS ==========

// GET /api/mining/jobs
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM mining_jobs ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id, name: r.name, status: r.status, version: r.version,
      configPayload: typeof r.config_payload === 'string' ? JSON.parse(r.config_payload) : (r.config_payload || {}),
      filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : (r.filters || {}),
      targetCount: r.target_count, foundCount: r.found_count,
      pagesFetched: r.pages_fetched, errors: r.errors,
      autoCreateSegment: r.auto_create_segment === 1, enrich: r.enrich === 1,
      lastNotificationMilestone: r.last_notification_milestone,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })));
  } catch (error: any) {
    console.error('Get mining jobs error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/mining/jobs
router.post('/jobs', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO mining_jobs (id, name, status, version, config_payload, filters, target_count,
        found_count, pages_fetched, errors, auto_create_segment, enrich, last_notification_milestone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.status || 'Running', data.version || 1,
       JSON.stringify(data.configPayload || {}), JSON.stringify(data.filters || {}),
       data.targetCount || 0, data.foundCount || 0, data.pagesFetched || 0, data.errors || 0,
       data.autoCreateSegment || false, data.enrich || false, data.lastNotificationMilestone || 0]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create mining job error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/mining/jobs/:id
router.put('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const fieldMap: Record<string, string> = {
      name: 'name', status: 'status', version: 'version',
      targetCount: 'target_count', foundCount: 'found_count',
      pagesFetched: 'pages_fetched', errors: 'errors',
      autoCreateSegment: 'auto_create_segment', enrich: 'enrich',
      lastNotificationMilestone: 'last_notification_milestone',
    };
    const jsonMap: Record<string, string> = { configPayload: 'config_payload', filters: 'filters' };
    const updates: string[] = [];
    const values: any[] = [];
    for (const [js, db] of Object.entries(fieldMap)) {
      if (data[js] !== undefined) { updates.push(`${db} = ?`); values.push(data[js]); }
    }
    for (const [js, db] of Object.entries(jsonMap)) {
      if (data[js] !== undefined) { updates.push(`${db} = ?`); values.push(JSON.stringify(data[js])); }
    }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE mining_jobs SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Job atualizado' });
  } catch (error: any) {
    console.error('Update mining job error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/mining/jobs/:id
router.delete('/jobs/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM mining_leads WHERE job_id = ?', [req.params.id]);
    await pool.query('DELETE FROM mining_jobs WHERE id = ?', [req.params.id]);
    res.json({ message: 'Job deletado' });
  } catch (error: any) {
    console.error('Delete mining job error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== MINING LEADS ==========

function rowToMiningLead(r: any) {
  return {
    id: r.id, jobId: r.job_id, name: r.name, tradeName: r.trade_name,
    cnpj: r.cnpj, cnpjRaw: r.cnpj_raw, segment: r.segment,
    city: r.city, state: r.state, phone: r.phone, email: r.email,
    emailCompany: r.email_company, phoneCompany: r.phone_company, website: r.website,
    partners: typeof r.partners === 'string' ? JSON.parse(r.partners) : (r.partners || []),
    contactName: r.contact_name, contactPhone: r.contact_phone, contactEmail: r.contact_email,
    scoreIa: r.score_ia, debtStatus: r.debt_status, debtValueEst: r.debt_value_est,
    sources: typeof r.sources === 'string' ? JSON.parse(r.sources) : (r.sources || []),
    isGarimpo: r.is_garimpo === 1, isImported: r.is_imported === 1,
    createdAt: r.created_at,
  };
}

// GET /api/mining/leads
router.get('/leads', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.query;
    let sql = 'SELECT * FROM mining_leads';
    const values: any[] = [];
    if (jobId) { sql += ' WHERE job_id = ?'; values.push(jobId); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(rowToMiningLead));
  } catch (error: any) {
    console.error('Get mining leads error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/mining/leads
router.post('/leads', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO mining_leads (id, job_id, name, trade_name, cnpj, cnpj_raw, segment, city, state,
        phone, email, email_company, phone_company, website, partners, contact_name, contact_phone,
        contact_email, score_ia, debt_status, debt_value_est, sources, is_garimpo, is_imported)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.jobId, data.name, data.tradeName, data.cnpj, data.cnpjRaw, data.segment,
       data.city, data.state, data.phone, data.email, data.emailCompany, data.phoneCompany,
       data.website, JSON.stringify(data.partners || []), data.contactName, data.contactPhone,
       data.contactEmail, data.scoreIa || 0, data.debtStatus, data.debtValueEst,
       JSON.stringify(data.sources || []), data.isGarimpo !== false, data.isImported || false]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create mining lead error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/mining/leads/:id
router.put('/leads/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const fieldMap: Record<string, string> = {
      jobId: 'job_id', name: 'name', tradeName: 'trade_name',
      cnpj: 'cnpj', cnpjRaw: 'cnpj_raw', segment: 'segment',
      city: 'city', state: 'state', phone: 'phone', email: 'email',
      emailCompany: 'email_company', phoneCompany: 'phone_company', website: 'website',
      contactName: 'contact_name', contactPhone: 'contact_phone', contactEmail: 'contact_email',
      scoreIa: 'score_ia', debtStatus: 'debt_status', debtValueEst: 'debt_value_est',
      isGarimpo: 'is_garimpo', isImported: 'is_imported',
    };
    const jsonMap: Record<string, string> = { partners: 'partners', sources: 'sources' };
    const updates: string[] = [];
    const values: any[] = [];
    for (const [js, db] of Object.entries(fieldMap)) {
      if (data[js] !== undefined) { updates.push(`${db} = ?`); values.push(data[js]); }
    }
    for (const [js, db] of Object.entries(jsonMap)) {
      if (data[js] !== undefined) { updates.push(`${db} = ?`); values.push(JSON.stringify(data[js])); }
    }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE mining_leads SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Lead atualizado' });
  } catch (error: any) {
    console.error('Update mining lead error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/mining/leads/bulk
router.post('/leads/bulk', async (req: Request, res: Response) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads)) return res.status(400).json({ error: 'Array esperado' });
    let imported = 0;
    for (const data of leads) {
      try {
        const id = data.id || uuidv4();
        await pool.query(
          `INSERT INTO mining_leads (id, job_id, name, trade_name, cnpj, cnpj_raw, segment, city, state,
            phone, email, email_company, phone_company, website, partners, contact_name, contact_phone,
            contact_email, score_ia, debt_status, debt_value_est, sources, is_garimpo, is_imported)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, data.jobId, data.name, data.tradeName, data.cnpj, data.cnpjRaw, data.segment,
           data.city, data.state, data.phone, data.email, data.emailCompany, data.phoneCompany,
           data.website, JSON.stringify(data.partners || []), data.contactName, data.contactPhone,
           data.contactEmail, data.scoreIa || 0, data.debtStatus, data.debtValueEst,
           JSON.stringify(data.sources || []), data.isGarimpo !== false, data.isImported || false]
        );
        imported++;
      } catch (e) { /* skip */ }
    }
    res.json({ imported, total: leads.length });
  } catch (error: any) {
    console.error('Bulk mining leads error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;

// ========== PROSPECT (Gemini AI) ==========
router.post('/prospect', async (req: Request, res: Response) => {
  try {
    const { segment, city, state, size, taxRegime, page } = req.body;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(400).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
    }

    const ai = new GoogleGenAI({ apiKey: key });

    // === ETAPA 1: Buscar empresas REAIS via Google Search ===
    const searchPrompt = `Use o Google Search para encontrar empresas REAIS do segmento "${segment}" localizadas em ${city}/${state}.
    
INSTRUÇÕES OBRIGATÓRIAS:
- Busque em sites como Google Maps, LinkedIn, Reclame Aqui, CNPJ.info, casadosdados.com.br, empresascnpj.com, consultasocio.com, portaldacontabilidade.com.br
- Busque: "${segment} em ${city} ${state}" e "${segment} ${city} CNPJ"
- Cada empresa DEVE ser uma empresa REAL encontrada na internet
- NÃO INVENTE nenhum dado. Se não encontrar um campo, escreva "Não encontrado"
- Porte desejado: ${size || 'Qualquer'}
- Regime tributário: ${taxRegime || 'Qualquer'}
- Página: ${page || 1} (se página > 1, busque empresas DIFERENTES das mais conhecidas)

Para CADA empresa encontrada, busque TAMBÉM:
- O CNPJ real (busque "[nome da empresa] CNPJ" no Google)
- Telefone de contato real
- Website oficial
- Nome dos sócios (busque no QSA/Receita Federal)
- Email de contato

RETORNE EXATAMENTE neste formato JSON (sem texto adicional, apenas o JSON):
{
  "companies": [
    {
      "name": "Razão Social REAL da empresa",
      "cnpj": "00.000.000/0001-00",
      "cnpjRaw": "00000000000100",
      "segment": "${segment}",
      "city": "${city}",
      "state": "${state}",
      "phone": "(31) 0000-0000",
      "emailCompany": "contato@empresa.com",
      "website": "https://www.empresa.com.br",
      "partners": ["Nome Real do Sócio"],
      "decisionMakerName": "Nome do Decisor/Sócio Principal",
      "decisionMakerPhoneFormatted": "(31) 90000-0000",
      "icpScore": null,
      "debtStatus": "Não encontrado",
      "estimatedRevenue": "Não encontrado"
    }
  ]
}

Encontre no mínimo 10 empresas REAIS e VERIFICÁVEIS.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || '';
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    // Extrator Robusto: Busca o primeiro bloco JSON válido
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const cleanJson = jsonMatch[0].replace(/```json|```/g, '');
      try {
        const parsed = JSON.parse(cleanJson);
        const companies = (parsed.companies || []).map((c: any) => ({
          ...c,
          // Limpar campos que o modelo não conseguiu encontrar
          cnpj: (c.cnpj && c.cnpj !== '00.000.000/0001-00') ? c.cnpj : 'Não encontrado',
          phone: (c.phone && c.phone !== '(00) 0000-0000') ? c.phone : 'Não encontrado',
          emailCompany: (c.emailCompany && c.emailCompany !== 'contato@email.com') ? c.emailCompany : 'Não encontrado',
        }));
        return res.json({ companies, sources });
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, 'Raw text:', text.substring(0, 500));
        return res.json({ companies: [], sources: [], error: 'Erro ao interpretar resposta da IA' });
      }
    }
    res.json({ companies: [], sources: [] });
  } catch (error: any) {
    console.error('Prospect Gemini error:', error?.message || error);
    res.status(500).json({ error: 'Erro ao prospectar: ' + (error?.message || 'Erro desconhecido') });
  }
});
