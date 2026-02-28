import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

function rowToScript(r: any) {
  return {
    id: r.id,
    title: r.title,
    objective: r.objective,
    serviceType: r.service_type,
    funnelPhaseId: r.funnel_phase_id,
    tone: r.tone,
    estimatedDuration: r.estimated_duration,
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || []),
    bullets: typeof r.bullets === 'string' ? JSON.parse(r.bullets) : (r.bullets || []),
    isGlobal: r.is_global === 1 || r.is_global === true,
    authorId: r.author_id,
    currentVersionId: r.current_version_id,
    versions: typeof r.versions === 'string' ? JSON.parse(r.versions) : (r.versions || []),
    usageStats: typeof r.usage_stats === 'string' ? JSON.parse(r.usage_stats) : (r.usage_stats || {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/scripts
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM sales_scripts ORDER BY created_at DESC');
    res.json(rows.map(rowToScript));
  } catch (error: any) {
    console.error('Get scripts error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/scripts
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO sales_scripts (id, title, objective, service_type, funnel_phase_id, tone,
        estimated_duration, tags, bullets, is_global, author_id, current_version_id, versions, usage_stats)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.title, data.objective, data.serviceType, data.funnelPhaseId, data.tone,
       data.estimatedDuration, JSON.stringify(data.tags || []), JSON.stringify(data.bullets || []),
       data.isGlobal || false, data.authorId, data.currentVersionId,
       JSON.stringify(data.versions || []), JSON.stringify(data.usageStats || {})]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create script error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/scripts/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const fieldMap: Record<string, string> = {
      title: 'title', objective: 'objective', serviceType: 'service_type',
      funnelPhaseId: 'funnel_phase_id', tone: 'tone', estimatedDuration: 'estimated_duration',
      isGlobal: 'is_global', authorId: 'author_id', currentVersionId: 'current_version_id',
    };
    const jsonMap: Record<string, string> = {
      tags: 'tags', bullets: 'bullets', versions: 'versions', usageStats: 'usage_stats',
    };
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
      await pool.query(`UPDATE sales_scripts SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Script atualizado' });
  } catch (error: any) {
    console.error('Update script error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/scripts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM sales_scripts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Script deletado' });
  } catch (error: any) {
    console.error('Delete script error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
