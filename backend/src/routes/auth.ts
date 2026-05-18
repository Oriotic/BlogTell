import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db';
import { requireAuth, signToken, AuthRequest } from '../middleware/auth';

const router = Router();
const SALT_ROUNDS = 12;

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const {username, email, password, display_name} = req.body;

  if (!username || !email || !password) {
    res.status(400).json({error:'username, email and password are required'});
    return;
  }
  if (password.length < 8) {
    res.status(400).json({error:'Password must be at least 8 characters'});
    return;
  }
  if (!/^[a-z0-9_]{3,50}$/i.test(username)) {
    res.status(400).json({error:'Username may only contain letters, numbers and underscores (3–50 chars)'});
    return;
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, bio, created_at`,
      [username.toLowerCase(), email.toLowerCase(), hash, display_name || username]
    );
    const user = rows[0];
    const token = signToken({userId: user.id, username: user.username});
    res.status(201).json({ token, user });
  } catch (err: any) {
    if (err.code === '23505') {
      const field = err.constraint?.includes('email') ? 'Email' : 'Username';
      res.status(409).json({error:`${field} is already taken`});
    } else {
      console.error(err);
      res.status(500).json({error:'Server error'});
    }
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { login, password } = req.body; // login = username OR email

  if (!login || !password) {
    res.status(400).json({error:'login and password are required'});
    return;
  }
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash, display_name, bio, created_at
       FROM users WHERE username = $1 OR email = $1`,
      [login.toLowerCase()]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({error:'Invalid credentials'});
      return;
    }
    const { password_hash: _, ...safeUser } = user;
    const token = signToken({userId: user.id, username: user.username});
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query(
      `SELECT id, username, email, display_name, bio, created_at FROM users WHERE id = $1`,
      [req.user!.userId]
    );
    if (!rows[0]) { 
      res.status(404).json({error:'User not found'}); 
      return; }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

router.put('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { display_name, bio } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users SET display_name = COALESCE($1, display_name),
        bio = COALESCE($2, bio)
       WHERE id = $3
       RETURNING id, username, email, display_name, bio, created_at`,
      [display_name, bio, req.user!.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

export default router;