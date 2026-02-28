import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/chat/threads
router.get('/threads', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.query;
    let sql = 'SELECT * FROM chat_threads';
    const values: any[] = [];
    if (leadId) { sql += ' WHERE lead_id = ?'; values.push(leadId); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({ id: r.id, title: r.title, leadId: r.lead_id, createdAt: r.created_at })));
  } catch (error: any) {
    console.error('Get chat threads error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/chat/threads
router.post('/threads', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query('INSERT INTO chat_threads (id, title, lead_id) VALUES (?, ?, ?)',
      [id, data.title, data.leadId]);
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create chat thread error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/chat/threads/:id/messages
router.get('/threads/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit: lim, offset } = req.query;
    let sql = 'SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY timestamp ASC';
    const values: any[] = [id];
    if (lim) {
      sql += ' LIMIT ?'; values.push(parseInt(lim as string));
      if (offset) { sql += ' OFFSET ?'; values.push(parseInt(offset as string)); }
    }
    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, threadId: r.thread_id, senderId: r.sender_id, senderName: r.sender_name,
      content: r.content, timestamp: r.timestamp, fileUrl: r.file_url, fileName: r.file_name,
    })));
  } catch (error: any) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/chat/threads/:id/messages
router.post('/threads/:id/messages', async (req: Request, res: Response) => {
  try {
    const { id: threadId } = req.params;
    const data = req.body;
    const msgId = data.id || uuidv4();
    await pool.query(
      `INSERT INTO chat_messages (id, thread_id, sender_id, sender_name, content, timestamp, file_url, file_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [msgId, threadId, data.senderId, data.senderName, data.content,
       data.timestamp || new Date().toISOString(), data.fileUrl, data.fileName]
    );
    res.status(201).json({ id: msgId, threadId, ...data });
  } catch (error: any) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/chat/threads/:id
router.delete('/threads/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM chat_threads WHERE id = ?', [req.params.id]);
    res.json({ message: 'Thread deletada' });
  } catch (error: any) {
    console.error('Delete thread error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
