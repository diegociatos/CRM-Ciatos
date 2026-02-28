import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// Helper: build lead object from DB row
function rowToLead(r: any) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    company: r.company,
    tradeName: r.trade_name,
    legalName: r.legal_name,
    cnpj: r.cnpj,
    cnpjRaw: r.cnpj_raw,
    companyEmail: r.company_email,
    companyPhone: r.company_phone,
    segment: r.segment,
    size: r.size,
    taxRegime: r.tax_regime,
    annualRevenue: r.annual_revenue,
    payrollValue: r.payroll_value,
    monthlyRevenue: r.monthly_revenue,
    status: r.status,
    phaseId: r.phase_id,
    ownerId: r.owner_id,
    debtStatus: r.debt_status,
    inQueue: r.in_queue === 1 || r.in_queue === true,
    icpScore: r.icp_score,
    city: r.city,
    state: r.state,
    address: r.address,
    location: r.location,
    enriched: r.enriched === 1 || r.enriched === true,
    qualifiedById: r.qualified_by_id,
    closeProbability: r.close_probability,
    engagementScore: r.engagement_score,
    serviceType: r.service_type,
    contractValue: r.contract_value,
    contractStart: r.contract_start,
    contractNumber: r.contract_number,
    healthScore: r.health_score,
    website: r.website,
    role: r.role,
    notes: r.notes,
    strategicPains: r.strategic_pains,
    expectations: r.expectations,
    onboardingTemplateId: r.onboarding_template_id,
    linkedinDM: r.linkedin_dm,
    instagramDM: r.instagram_dm,
    linkedinCompany: r.linkedin_company,
    instagramCompany: r.instagram_company,
    detailedPartners: typeof r.detailed_partners === 'string' ? JSON.parse(r.detailed_partners) : (r.detailed_partners || []),
    marketingAutomation: typeof r.marketing_automation === 'string' ? JSON.parse(r.marketing_automation) : (r.marketing_automation || undefined),
    onboardingChecklist: typeof r.onboarding_checklist === 'string' ? JSON.parse(r.onboarding_checklist) : (r.onboarding_checklist || undefined),
    welcomeData: typeof r.welcome_data === 'string' ? JSON.parse(r.welcome_data) : (r.welcome_data || undefined),
    npsSurveys: typeof r.nps_surveys === 'string' ? JSON.parse(r.nps_surveys) : (r.nps_surveys || undefined),
    successTasks: typeof r.success_tasks === 'string' ? JSON.parse(r.success_tasks) : (r.success_tasks || undefined),
    feedbackPoints: typeof r.feedback_points === 'string' ? JSON.parse(r.feedback_points) : (r.feedback_points || undefined),
    createdAt: r.created_at,
    interactions: [] as any[],
    tasks: [] as any[],
  };
}

// GET /api/leads
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, ownerId, phaseId } = req.query;
    let sql = 'SELECT * FROM leads';
    const conditions: string[] = [];
    const values: any[] = [];

    if (status) { conditions.push('status = ?'); values.push(status); }
    if (ownerId) { conditions.push('owner_id = ?'); values.push(ownerId); }
    if (phaseId) { conditions.push('phase_id = ?'); values.push(phaseId); }

    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);

    // Fetch interactions and tasks for all leads
    const leadIds = rows.map(r => r.id);
    let interactionsMap: Record<string, any[]> = {};
    let tasksMap: Record<string, any[]> = {};

    if (leadIds.length > 0) {
      const placeholders = leadIds.map(() => '?').join(',');
      
      const [interactions] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM interactions WHERE lead_id IN (${placeholders}) ORDER BY date DESC`, leadIds
      );
      for (const i of interactions) {
        if (!interactionsMap[i.lead_id]) interactionsMap[i.lead_id] = [];
        interactionsMap[i.lead_id].push({
          id: i.id, type: i.type, title: i.title, content: i.content,
          date: i.date, author: i.author, authorId: i.author_id,
          deliveryStatus: i.delivery_status, errorMessage: i.error_message,
          latency: i.latency, scoreImpact: i.score_impact,
          scriptVersionId: i.script_version_id,
        });
      }

      const [tasks] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM tasks WHERE lead_id IN (${placeholders}) ORDER BY due_date`, leadIds
      );
      for (const t of tasks) {
        if (!tasksMap[t.lead_id]) tasksMap[t.lead_id] = [];
        tasksMap[t.lead_id].push({
          id: t.id, title: t.title, description: t.description,
          dueDate: t.due_date, priority: t.priority, leadId: t.lead_id,
          completed: t.completed === 1 || t.completed === true,
        });
      }
    }

    const leads = rows.map(r => {
      const lead = rowToLead(r);
      lead.interactions = interactionsMap[r.id] || [];
      lead.tasks = tasksMap[r.id] || [];
      return lead;
    });

    res.json(leads);
  } catch (error: any) {
    console.error('Get leads error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM leads WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Lead não encontrado' });

    const lead = rowToLead(rows[0]);

    // Fetch interactions
    const [interactions] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM interactions WHERE lead_id = ? ORDER BY date DESC', [id]
    );
    lead.interactions = interactions.map(i => ({
      id: i.id, type: i.type, title: i.title, content: i.content,
      date: i.date, author: i.author, authorId: i.author_id,
      deliveryStatus: i.delivery_status, errorMessage: i.error_message,
      latency: i.latency, scoreImpact: i.score_impact,
      scriptVersionId: i.script_version_id,
    }));

    // Fetch tasks
    const [tasks] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM tasks WHERE lead_id = ? ORDER BY due_date', [id]
    );
    lead.tasks = tasks.map(t => ({
      id: t.id, title: t.title, description: t.description,
      dueDate: t.due_date, priority: t.priority, leadId: t.lead_id,
      completed: t.completed === 1 || t.completed === true,
    }));

    res.json(lead);
  } catch (error: any) {
    console.error('Get lead error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/leads
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();

    await pool.query(
      `INSERT INTO leads (id, name, email, phone, company, trade_name, legal_name, cnpj, cnpj_raw,
        company_email, company_phone, segment, size, tax_regime, annual_revenue, payroll_value,
        monthly_revenue, status, phase_id, owner_id, debt_status, in_queue, icp_score, city, state,
        address, location, enriched, qualified_by_id, close_probability, engagement_score,
        service_type, contract_value, contract_start, contract_number, health_score, website,
        role, notes, strategic_pains, expectations, onboarding_template_id,
        linkedin_dm, instagram_dm, linkedin_company, instagram_company,
        detailed_partners, marketing_automation, onboarding_checklist,
        welcome_data, nps_surveys, success_tasks, feedback_points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.name, data.email, data.phone, data.company, data.tradeName, data.legalName,
        data.cnpj, data.cnpjRaw, data.companyEmail, data.companyPhone, data.segment, data.size,
        data.taxRegime, data.annualRevenue, data.payrollValue, data.monthlyRevenue,
        data.status || 'Novo', data.phaseId, data.ownerId, data.debtStatus,
        data.inQueue !== undefined ? data.inQueue : true, data.icpScore || 0,
        data.city, data.state, data.address, data.location,
        data.enriched || false, data.qualifiedById, data.closeProbability || 0,
        data.engagementScore || 0, data.serviceType, data.contractValue,
        data.contractStart, data.contractNumber, data.healthScore, data.website,
        data.role, data.notes, data.strategicPains, data.expectations,
        data.onboardingTemplateId, data.linkedinDM, data.instagramDM,
        data.linkedinCompany, data.instagramCompany,
        JSON.stringify(data.detailedPartners || []),
        data.marketingAutomation ? JSON.stringify(data.marketingAutomation) : null,
        data.onboardingChecklist ? JSON.stringify(data.onboardingChecklist) : null,
        data.welcomeData ? JSON.stringify(data.welcomeData) : null,
        data.npsSurveys ? JSON.stringify(data.npsSurveys) : null,
        data.successTasks ? JSON.stringify(data.successTasks) : null,
        data.feedbackPoints ? JSON.stringify(data.feedbackPoints) : null,
      ]
    );

    // Insert interactions if provided
    if (data.interactions && data.interactions.length > 0) {
      for (const i of data.interactions) {
        await pool.query(
          `INSERT INTO interactions (id, lead_id, type, title, content, date, author, author_id,
            delivery_status, error_message, latency, score_impact, script_version_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [i.id || uuidv4(), id, i.type, i.title, i.content, i.date, i.author, i.authorId,
           i.deliveryStatus, i.errorMessage, i.latency, i.scoreImpact, i.scriptVersionId]
        );
      }
    }

    // Insert tasks if provided
    if (data.tasks && data.tasks.length > 0) {
      for (const t of data.tasks) {
        await pool.query(
          `INSERT INTO tasks (id, lead_id, title, description, due_date, priority, completed)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.id || uuidv4(), id, t.title, t.description, t.dueDate, t.priority, t.completed || false]
        );
      }
    }

    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create lead error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/leads/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const fieldMap: Record<string, string> = {
      name: 'name', email: 'email', phone: 'phone', company: 'company',
      tradeName: 'trade_name', legalName: 'legal_name', cnpj: 'cnpj', cnpjRaw: 'cnpj_raw',
      companyEmail: 'company_email', companyPhone: 'company_phone', segment: 'segment',
      size: 'size', taxRegime: 'tax_regime', annualRevenue: 'annual_revenue',
      payrollValue: 'payroll_value', monthlyRevenue: 'monthly_revenue', status: 'status',
      phaseId: 'phase_id', ownerId: 'owner_id', debtStatus: 'debt_status',
      inQueue: 'in_queue', icpScore: 'icp_score', city: 'city', state: 'state',
      address: 'address', location: 'location', enriched: 'enriched',
      qualifiedById: 'qualified_by_id', closeProbability: 'close_probability',
      engagementScore: 'engagement_score', serviceType: 'service_type',
      contractValue: 'contract_value', contractStart: 'contract_start',
      contractNumber: 'contract_number', healthScore: 'health_score', website: 'website',
      role: 'role', notes: 'notes', strategicPains: 'strategic_pains',
      expectations: 'expectations', onboardingTemplateId: 'onboarding_template_id',
      linkedinDM: 'linkedin_dm', instagramDM: 'instagram_dm',
      linkedinCompany: 'linkedin_company', instagramCompany: 'instagram_company',
    };

    const jsonFields: Record<string, string> = {
      detailedPartners: 'detailed_partners', marketingAutomation: 'marketing_automation',
      onboardingChecklist: 'onboarding_checklist', welcomeData: 'welcome_data',
      npsSurveys: 'nps_surveys', successTasks: 'success_tasks', feedbackPoints: 'feedback_points',
    };

    const updates: string[] = [];
    const values: any[] = [];

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (data[jsKey] !== undefined) {
        updates.push(`${dbKey} = ?`);
        values.push(data[jsKey]);
      }
    }

    for (const [jsKey, dbKey] of Object.entries(jsonFields)) {
      if (data[jsKey] !== undefined) {
        updates.push(`${dbKey} = ?`);
        values.push(JSON.stringify(data[jsKey]));
      }
    }

    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    // Handle interactions update - replace all
    if (data.interactions !== undefined) {
      await pool.query('DELETE FROM interactions WHERE lead_id = ?', [id]);
      for (const i of data.interactions) {
        await pool.query(
          `INSERT INTO interactions (id, lead_id, type, title, content, date, author, author_id,
            delivery_status, error_message, latency, score_impact, script_version_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [i.id || uuidv4(), id, i.type, i.title, i.content, i.date, i.author, i.authorId,
           i.deliveryStatus, i.errorMessage, i.latency, i.scoreImpact, i.scriptVersionId]
        );
      }
    }

    // Handle tasks update - replace all
    if (data.tasks !== undefined) {
      await pool.query('DELETE FROM tasks WHERE lead_id = ?', [id]);
      for (const t of data.tasks) {
        await pool.query(
          `INSERT INTO tasks (id, lead_id, title, description, due_date, priority, completed)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.id || uuidv4(), id, t.title, t.description, t.dueDate, t.priority, t.completed || false]
        );
      }
    }

    res.json({ message: 'Lead atualizado' });
  } catch (error: any) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM leads WHERE id = ?', [id]);
    res.json({ message: 'Lead deletado' });
  } catch (error: any) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/leads/:id/interactions
router.post('/:id/interactions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const intId = data.id || uuidv4();

    await pool.query(
      `INSERT INTO interactions (id, lead_id, type, title, content, date, author, author_id,
        delivery_status, error_message, latency, score_impact, script_version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [intId, id, data.type, data.title, data.content, data.date || new Date().toISOString(),
       data.author, data.authorId, data.deliveryStatus, data.errorMessage,
       data.latency, data.scoreImpact, data.scriptVersionId]
    );

    res.status(201).json({ id: intId, ...data });
  } catch (error: any) {
    console.error('Add interaction error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/leads/:id/tasks
router.post('/:id/tasks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const taskId = data.id || uuidv4();

    await pool.query(
      `INSERT INTO tasks (id, lead_id, title, description, due_date, priority, completed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [taskId, id, data.title, data.description, data.dueDate, data.priority || 'Média', data.completed || false]
    );

    res.status(201).json({ id: taskId, ...data });
  } catch (error: any) {
    console.error('Add task error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/leads/bulk - bulk import leads
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads)) return res.status(400).json({ error: 'Array de leads esperado' });

    let imported = 0;
    for (const data of leads) {
      const id = data.id || uuidv4();
      try {
        await pool.query(
          `INSERT INTO leads (id, name, email, phone, company, trade_name, legal_name, cnpj, cnpj_raw,
            company_email, company_phone, segment, size, tax_regime, annual_revenue,
            status, phase_id, owner_id, debt_status, in_queue, icp_score, city, state,
            detailed_partners, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [id, data.name, data.email, data.phone, data.company, data.tradeName, data.legalName,
           data.cnpj, data.cnpjRaw, data.companyEmail, data.companyPhone, data.segment, data.size,
           data.taxRegime, data.annualRevenue, data.status || 'Novo', data.phaseId, data.ownerId,
           data.debtStatus, data.inQueue !== undefined ? data.inQueue : true, data.icpScore || 0,
           data.city, data.state, JSON.stringify(data.detailedPartners || [])]
        );
        imported++;
      } catch (e) {
        console.error(`Failed to import lead ${data.name}:`, e);
      }
    }

    res.json({ imported, total: leads.length });
  } catch (error: any) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
