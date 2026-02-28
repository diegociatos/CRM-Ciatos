import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/goals
router.get('/', async (req: Request, res: Response) => {
  try {
    const { userId, month, year } = req.query;
    let sql = 'SELECT * FROM user_goals';
    const conditions: string[] = [];
    const values: any[] = [];
    if (userId) { conditions.push('user_id = ?'); values.push(userId); }
    if (month) { conditions.push('month = ?'); values.push(parseInt(month as string)); }
    if (year) { conditions.push('year = ?'); values.push(parseInt(year as string)); }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY year DESC, month DESC';

    const [rows] = await pool.query<RowDataPacket[]>(sql, values);
    res.json(rows.map(r => ({
      id: r.id, userId: r.user_id, month: r.month, year: r.year,
      qualsGoal: r.quals_goal, callsGoal: r.calls_goal,
      proposalsGoal: r.proposals_goal, contractsGoal: r.contracts_goal,
    })));
  } catch (error: any) {
    console.error('Get goals error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/goals
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = data.id || uuidv4();
    await pool.query(
      `INSERT INTO user_goals (id, user_id, month, year, quals_goal, calls_goal, proposals_goal, contracts_goal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quals_goal = VALUES(quals_goal), calls_goal = VALUES(calls_goal),
         proposals_goal = VALUES(proposals_goal), contracts_goal = VALUES(contracts_goal)`,
      [id, data.userId, data.month, data.year,
       data.qualsGoal || 0, data.callsGoal || 0, data.proposalsGoal || 0, data.contractsGoal || 0]
    );
    res.status(201).json({ id, ...data });
  } catch (error: any) {
    console.error('Create goal error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/goals/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    if (data.qualsGoal !== undefined) { updates.push('quals_goal = ?'); values.push(data.qualsGoal); }
    if (data.callsGoal !== undefined) { updates.push('calls_goal = ?'); values.push(data.callsGoal); }
    if (data.proposalsGoal !== undefined) { updates.push('proposals_goal = ?'); values.push(data.proposalsGoal); }
    if (data.contractsGoal !== undefined) { updates.push('contracts_goal = ?'); values.push(data.contractsGoal); }
    if (updates.length > 0) {
      values.push(id);
      await pool.query(`UPDATE user_goals SET ${updates.join(', ')} WHERE id = ?`, values);
    }
    res.json({ message: 'Meta atualizada' });
  } catch (error: any) {
    console.error('Update goal error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/goals/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM user_goals WHERE id = ?', [req.params.id]);
    res.json({ message: 'Meta deletada' });
  } catch (error: any) {
    console.error('Delete goal error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/goals/bulk
router.put('/bulk', async (req: Request, res: Response) => {
  try {
    const { goals } = req.body;
    if (!Array.isArray(goals)) return res.status(400).json({ error: 'Array de metas esperado' });
    for (const g of goals) {
      const id = g.id || uuidv4();
      await pool.query(
        `INSERT INTO user_goals (id, user_id, month, year, quals_goal, calls_goal, proposals_goal, contracts_goal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quals_goal = VALUES(quals_goal), calls_goal = VALUES(calls_goal),
           proposals_goal = VALUES(proposals_goal), contracts_goal = VALUES(contracts_goal)`,
        [id, g.userId, g.month, g.year,
         g.qualsGoal || 0, g.callsGoal || 0, g.proposalsGoal || 0, g.contractsGoal || 0]
      );
    }
    res.json({ message: 'Metas salvas', count: goals.length });
  } catch (error: any) {
    console.error('Bulk goals error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
