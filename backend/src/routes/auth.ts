import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import pool from '../database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email obrigatório' });

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?', [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Credenciais inválidas' });

    const user = rows[0];
    
    if (password) {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Update last access
    await pool.query('UPDATE users SET updated_at = NOW() WHERE id = ?', [user.id]);

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
      managerTypeId: user.manager_type_id,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?', [email]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const user = rows[0];
    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE email = ?', [hash, email]);
    
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error: any) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/auth/users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT * FROM users ORDER BY name');
    const users = rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      avatar: u.avatar,
      managerTypeId: u.manager_type_id,
    }));
    res.json(users);
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/auth/users
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, department, avatar, managerTypeId } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e email obrigatórios' });

    // Check if exists
    const [existing] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email já cadastrado' });

    const id = uuidv4();
    const hash = await bcrypt.hash(password || '250500', 10);

    await pool.query(
      `INSERT INTO users (id, name, email, password, role, department, avatar, manager_type_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, email, hash, role || 'Operacional', department || 'Comercial', avatar || null, managerTypeId || null]
    );

    res.status(201).json({
      id, name, email, role: role || 'Operacional', department: department || 'Comercial',
      avatar, managerTypeId,
    });
  } catch (error: any) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/auth/users/:id
router.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, avatar, managerTypeId, password } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (email !== undefined) { updates.push('email = ?'); values.push(email); }
    if (role !== undefined) { updates.push('role = ?'); values.push(role); }
    if (department !== undefined) { updates.push('department = ?'); values.push(department); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
    if (managerTypeId !== undefined) { updates.push('manager_type_id = ?'); values.push(managerTypeId); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push('password = ?');
      values.push(hash);
    }

    if (updates.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ message: 'Usuário atualizado' });
  } catch (error: any) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/auth/users/:id
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Usuário deletado' });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

export default router;
