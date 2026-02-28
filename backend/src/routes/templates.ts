import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/onboarding-templates
router.get('/', async (req: Request, res: Response) => {
  try {
    const { serviceType } = req.query;
    let sql = 'SELECT * FROM onboarding_templates';
    const values: any[] = [];
    if (serviceType) { sql += ' WHERE service_type = ?'; values.push(serviceType); }
    sql += ' ORDER BY name';

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id,
      serviceType: r.service_type,
      name: r.name,
      description: r.description,
      phases: typeof r.phases === 'string' ? JSON.parse(r.phases) : (r.phases || []),
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    })));
  } catch (error: any) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/onboarding-templates
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO onboarding_templates (id, service_type, name, description, phases, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, NOW(), ?)`,
      [id, data.serviceType, data.name, data.description,
       JSON.stringify(data.phases || []), data.updatedBy]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/onboarding-templates/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updates: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.serviceType !== undefined) { updates.push('service_type = ?'); values.push(data.serviceType); }
    if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
    if (data.phases !== undefined) { updates.push('phases = ?'); values.push(JSON.stringify(data.phases)); }
    if (data.updatedBy !== undefined) { updates.push('updated_by = ?'); values.push(data.updatedBy); }
    values.push(id);
    await pool.query(`UPDATE onboarding_templates SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Template atualizado' });
  } catch (error: any) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/onboarding-templates/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM onboarding_templates WHERE id = ?', [req.params.id]);
    res.json({ message: 'Template deletado' });
  } catch (error: any) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== MASTER TEMPLATES ==========

// GET /api/onboarding-templates/master
router.get('/master', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM master_templates ORDER BY name');
    res.json(rows.map(r => ({
      id: r.id, name: r.name, category: r.category,
      subject: r.subject, content: r.content, lastUpdated: r.last_updated,
    })));
  } catch (error: any) {
    console.error('Get master templates error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/onboarding-templates/master
router.post('/master', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      'INSERT INTO master_templates (id, name, category, subject, content, last_updated) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, data.name, data.category, data.subject, data.content]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create master template error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/onboarding-templates/master/:id
router.put('/master/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updates: string[] = ['last_updated = NOW()'];
    const values: any[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.category !== undefined) { updates.push('category = ?'); values.push(data.category); }
    if (data.subject !== undefined) { updates.push('subject = ?'); values.push(data.subject); }
    if (data.content !== undefined) { updates.push('content = ?'); values.push(data.content); }
    values.push(id);
    await pool.query(`UPDATE master_templates SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Template master atualizado' });
  } catch (error: any) {
    console.error('Update master template error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
