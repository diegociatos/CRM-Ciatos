import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/agenda
router.get('/', async (req: Request, res: Response) => {
  try {
    const { assignedToId, startDate, endDate, department } = req.query;
    let sql = 'SELECT * FROM agenda_events';
    const conditions: string[] = [];
    const values: any[] = [];
    if (assignedToId) { conditions.push('assigned_to_id = ?'); values.push(assignedToId); }
    if (startDate) { conditions.push('start >= ?'); values.push(startDate); }
    if (endDate) { conditions.push('end <= ?'); values.push(endDate); }
    if (department) { conditions.push('department = ?'); values.push(department); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY start ASC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, title: r.title, start: r.start, end: r.end,
      assignedToId: r.assigned_to_id, leadId: r.lead_id,
      typeId: r.type_id, type: r.type, description: r.description,
      status: r.status, department: r.department, creatorId: r.creator_id,
      participants: typeof r.participants === 'string' ? JSON.parse(r.participants) : (r.participants || []),
      createdAt: r.created_at,
    })));
  } catch (error: any) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/agenda
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO agenda_events (id, title, start, end, assigned_to_id, lead_id, type_id, type,
        description, status, department, creator_id, participants)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.title, data.start, data.end, data.assignedToId, data.leadId,
       data.typeId, data.type, data.description, data.status || 'scheduled',
       data.department, data.creatorId, JSON.stringify(data.participants || [])]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/agenda/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const fieldMap: Record<string, string> = {
      title: 'title', start: 'start', end: 'end', assignedToId: 'assigned_to_id',
      leadId: 'lead_id', typeId: 'type_id', type: 'type', description: 'description',
      status: 'status', department: 'department', creatorId: 'creator_id',
    };
    const updates: string[] = [];
    const values: any[] = [];
    for (const [js, db] of Object.entries(fieldMap)) {
      if (data[js] !== undefined) { updates.push(`${db} = ?`); values.push(data[js]); }
    }
    if (data.participants !== undefined) {
      updates.push('participants = ?'); values.push(JSON.stringify(data.participants));
    }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE agenda_events SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Evento atualizado' });
  } catch (error: any) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/agenda/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM agenda_events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Evento deletado' });
  } catch (error: any) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
