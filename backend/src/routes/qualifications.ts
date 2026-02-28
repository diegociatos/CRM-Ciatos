import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/qualifications
router.get('/', async (req: Request, res: Response) => {
  try {
    const { sdrId, leadId, status } = req.query;
    let sql = 'SELECT * FROM sdr_qualifications';
    const conditions: string[] = [];
    const values: any[] = [];
    if (sdrId) { conditions.push('sdr_id = ?'); values.push(sdrId); }
    if (leadId) { conditions.push('lead_id = ?'); values.push(leadId); }
    if (status) { conditions.push('status = ?'); values.push(status); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY date DESC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, sdrId: r.sdr_id, leadId: r.lead_id, companyName: r.company_name,
      date: r.date, type: r.type, status: r.status, bonusValue: r.bonus_value,
    })));
  } catch (error: any) {
    console.error('Get qualifications error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/qualifications
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO sdr_qualifications (id, sdr_id, lead_id, company_name, date, type, status, bonus_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.sdrId, data.leadId, data.companyName,
       data.date || new Date().toISOString(), data.type, data.status || 'Pending', data.bonusValue || 0]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create qualification error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/qualifications/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    if (data.status !== undefined) { updates.push('status = ?'); values.push(data.status); }
    if (data.bonusValue !== undefined) { updates.push('bonus_value = ?'); values.push(data.bonusValue); }
    if (data.type !== undefined) { updates.push('type = ?'); values.push(data.type); }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE sdr_qualifications SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Qualificação atualizada' });
  } catch (error: any) {
    console.error('Update qualification error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/qualifications/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM sdr_qualifications WHERE id = ?', [req.params.id]);
    res.json({ message: 'Qualificação deletada' });
  } catch (error: any) {
    console.error('Delete qualification error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
