import { Router, Request, Response } from 'express';
import pool from '../database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// GET /api/config - returns full config object
router.get('/', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT config_key, config_value FROM system_config');
    const config: Record<string, any> = {};
    for (const r of rows) {
      if (typeof r.config_value === 'string') {
        try {
          config[r.config_key] = JSON.parse(r.config_value);
        } catch {
          // Value is a plain string, not JSON-encoded
          config[r.config_key] = r.config_value;
        }
      } else {
        config[r.config_key] = r.config_value;
      }
    }
    res.json(config);
  } catch (error: any) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/config - upsert full config (each top-level key becomes a row)
router.put('/', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    for (const [key, value] of Object.entries(data)) {
      await pool.query(
        `INSERT INTO system_config (config_key, config_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
        [key, JSON.stringify(value)]
      );
    }
    res.json({ message: 'Configuração salva' });
  } catch (error: any) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/config/:key
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT config_value FROM system_config WHERE config_key = ?', [key]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Chave não encontrada' });
    const value = typeof rows[0].config_value === 'string'
      ? JSON.parse(rows[0].config_value) : rows[0].config_value;
    res.json(value);
  } catch (error: any) {
    console.error('Get config key error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/config/:key
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    await pool.query(
      `INSERT INTO system_config (config_key, config_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
      [key, JSON.stringify(value !== undefined ? value : req.body)]
    );
    res.json({ message: 'Configuração salva' });
  } catch (error: any) {
    console.error('Update config key error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
