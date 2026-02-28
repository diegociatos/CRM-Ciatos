import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/automation-flows
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM automation_flows ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id, name: r.name, triggerType: r.trigger_type,
      triggerSubValue: r.trigger_sub_value,
      steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : (r.steps || []),
      active: r.active === 1 || r.active === true,
      stats: typeof r.stats === 'string' ? JSON.parse(r.stats) : (r.stats || {}),
      logs: typeof r.logs === 'string' ? JSON.parse(r.logs) : (r.logs || []),
      createdAt: r.created_at,
    })));
  } catch (error: any) {
    console.error('Get automation flows error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/automation-flows
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO automation_flows (id, name, trigger_type, trigger_sub_value, steps, active, stats, logs)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.triggerType, data.triggerSubValue,
       JSON.stringify(data.steps || []), data.active !== false,
       JSON.stringify(data.stats || {}), JSON.stringify(data.logs || [])]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create automation flow error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/automation-flows/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const fieldMap: Record<string, string> = {
      name: 'name', triggerType: 'trigger_type', triggerSubValue: 'trigger_sub_value', active: 'active',
    };
    const jsonMap: Record<string, string> = { steps: 'steps', stats: 'stats', logs: 'logs' };
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
      await pool.query(`UPDATE automation_flows SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Fluxo atualizado' });
  } catch (error: any) {
    console.error('Update automation flow error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/automation-flows/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM automation_flows WHERE id = ?', [req.params.id]);
    res.json({ message: 'Fluxo deletado' });
  } catch (error: any) {
    console.error('Delete automation flow error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
