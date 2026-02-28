import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// ========== CAMPAIGNS ==========

// GET /api/campaigns
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM campaigns ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id, name: r.name, smartListId: r.smart_list_id,
      templates: typeof r.templates === 'string' ? JSON.parse(r.templates) : (r.templates || []),
      status: r.status,
      comments: typeof r.comments === 'string' ? JSON.parse(r.comments) : (r.comments || []),
      stats: typeof r.stats === 'string' ? JSON.parse(r.stats) : (r.stats || {}),
      createdAt: r.created_at,
    })));
  } catch (error: any) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/campaigns
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO campaigns (id, name, smart_list_id, templates, status, comments, stats)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.smartListId,
       JSON.stringify(data.templates || []), data.status || 'InReview',
       JSON.stringify(data.comments || []), JSON.stringify(data.stats || {})]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/campaigns/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.smartListId !== undefined) { updates.push('smart_list_id = ?'); values.push(data.smartListId); }
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.templates !== undefined) { updates.push('templates = ?'); values.push(JSON.stringify(data.templates)); }
    if (data.comments !== undefined) { updates.push('comments = ?'); values.push(JSON.stringify(data.comments)); }
    if (data.stats !== undefined) { updates.push('stats = ?'); values.push(JSON.stringify(data.stats)); }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE campaigns SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Campanha atualizada' });
  } catch (error: any) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM campaigns WHERE id = ?', [req.params.id]);
    res.json({ message: 'Campanha deletada' });
  } catch (error: any) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== SMART LISTS ==========

// GET /api/campaigns/smart-lists
router.get('/smart-lists', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM smart_lists ORDER BY created_at DESC');
    res.json(rows.map(r => ({
      id: r.id, name: r.name,
      filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : (r.filters || {}),
      leadsCount: r.leads_count, createdAt: r.created_at,
    })));
  } catch (error: any) {
    console.error('Get smart lists error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/campaigns/smart-lists
router.post('/smart-lists', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      'INSERT INTO smart_lists (id, name, filters, leads_count) VALUES (?, ?, ?, ?)',
      [id, data.name, JSON.stringify(data.filters || {}), data.leadsCount || 0]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create smart list error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/campaigns/smart-lists/:id
router.put('/smart-lists/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
    if (data.filters !== undefined) { updates.push('filters = ?'); values.push(JSON.stringify(data.filters)); }
    if (data.leadsCount !== undefined) { updates.push('leads_count = ?'); values.push(data.leadsCount); }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE smart_lists SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Lista atualizada' });
  } catch (error: any) {
    console.error('Update smart list error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/campaigns/smart-lists/:id
router.delete('/smart-lists/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM smart_lists WHERE id = ?', [req.params.id]);
    res.json({ message: 'Lista deletada' });
  } catch (error: any) {
    console.error('Delete smart list error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
