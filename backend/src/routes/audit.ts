import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// ========== AUDIT LOGS ==========

// GET /api/audit
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, entityId, limit: lim } = req.query;
    let sql = 'SELECT * FROM audit_logs';
    const conditions: string[] = [];
    const values: any[] = [];
    if (userId) { conditions.push('user_id = ?'); values.push(userId); }
    if (entityId) { conditions.push('entity_id = ?'); values.push(entityId); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY timestamp DESC';
    sql += ` LIMIT ${lim ? Math.min(parseInt(lim as string), 1000) : 200}`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, action: r.action, entityId: r.entity_id,
      userId: r.user_id, userName: r.user_name, timestamp: r.timestamp,
      previousState: typeof r.previous_state === 'string' ? JSON.parse(r.previous_state) : (r.previous_state || null),
      newState: typeof r.new_state === 'string' ? JSON.parse(r.new_state) : (r.new_state || null),
    })));
  } catch (error: any) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/audit
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO audit_logs (id, action, entity_id, user_id, user_name, timestamp, previous_state, new_state)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.action, data.entityId, data.userId, data.userName,
       data.timestamp || new Date().toISOString(),
       data.previousState ? JSON.stringify(data.previousState) : null,
       data.newState ? JSON.stringify(data.newState) : null]
    );
    res.status(201).json({ id });
  } catch (error: any) {
    console.error('Create audit log error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/audit/bulk
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs)) return res.status(400).json({ error: 'Array esperado' });
    for (const data of logs) {
      const id = data.id || uuidv4();
      await pool.query(
        `INSERT INTO audit_logs (id, action, entity_id, user_id, user_name, timestamp, previous_state, new_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.action, data.entityId, data.userId, data.userName,
         data.timestamp || new Date().toISOString(),
         data.previousState ? JSON.stringify(data.previousState) : null,
         data.newState ? JSON.stringify(data.newState) : null]
      );
    }
    res.json({ saved: logs.length });
  } catch (error: any) {
    console.error('Bulk audit error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== INTEGRATION LOGS ==========

// GET /api/audit/integrations
router.get('/integrations', async (req: Request, res: Response) => {
  try {
    const { leadId, status, event, limit: lim } = req.query;
    let sql = 'SELECT * FROM integration_logs';
    const conditions: string[] = [];
    const values: any[] = [];
    if (leadId) { conditions.push('lead_id = ?'); values.push(leadId); }
    if (status) { conditions.push('status = ?'); values.push(status); }
    if (event) { conditions.push('event = ?'); values.push(event); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY timestamp DESC';
    sql += ` LIMIT ${lim ? Math.min(parseInt(lim as string), 500) : 100}`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, leadId: r.lead_id, leadName: r.lead_name,
      event: r.event, status: r.status, details: r.details, timestamp: r.timestamp,
    })));
  } catch (error: any) {
    console.error('Get integration logs error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/audit/integrations
router.post('/integrations', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    await pool.query(
      `INSERT INTO integration_logs (lead_id, lead_name, event, status, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.leadId, data.leadName, data.event, data.status,
       data.details, data.timestamp || new Date().toISOString()]
    );
    res.status(201).json({ message: 'Log criado' });
  } catch (error: any) {
    console.error('Create integration log error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// ========== NOTIFICATIONS ==========

// GET /api/audit/notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const { userId, isRead } = req.query;
    let sql = 'SELECT * FROM notifications';
    const conditions: string[] = [];
    const values: any[] = [];
    if (userId) { conditions.push('user_id = ?'); values.push(userId); }
    if (isRead !== undefined) { conditions.push('is_read = ?'); values.push(isRead === 'true' ? 1 : 0); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY timestamp DESC LIMIT 100';

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, userId: r.user_id, title: r.title, message: r.message,
      timestamp: r.timestamp, type: r.type, isRead: r.is_read === 1,
    })));
  } catch (error: any) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/audit/notifications
router.post('/notifications', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO notifications (id, user_id, title, message, timestamp, type, is_read)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.userId, data.title, data.message,
       data.timestamp || new Date().toISOString(), data.type || 'info', false]
    );
    res.status(201).json({ id });
  } catch (error: any) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/audit/notifications/:id/read
router.put('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Notificação lida' });
  } catch (error: any) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/audit/notifications/read-all
router.put('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (userId) await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    res.json({ message: 'Todas lidas' });
  } catch (error: any) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/audit/snapshots
router.get('/snapshots', async (req: Request, res: Response) => {
  try {
    const [leads] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM leads');
    const [users] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM users');
    const [interactions] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM interactions');
    const [tasks] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM tasks');
    res.json({
      timestamp: new Date().toISOString(),
      counts: { leads: leads[0].c, users: users[0].c, interactions: interactions[0].c, tasks: tasks[0].c }
    });
  } catch (error: any) {
    console.error('Snapshot error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
