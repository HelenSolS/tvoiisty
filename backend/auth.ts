import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

type GlobalRole = 'admin' | 'merchant' | 'stylist' | 'client';

type JwtUserPayload = {
  id: string;
  email: string | null;
  global_role: GlobalRole;
};

const JWT_SECRET = (process.env.JWT_SECRET || '').trim();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  console.warn(
    '[auth] JWT_SECRET не задан. Установите JWT_SECRET в .env перед использованием авторизации.'
  );
}

function signToken(user: JwtUserPayload): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function findUserByEmail(email: string) {
  const res = await pool.query(
    'SELECT id, email, password_hash, role FROM users WHERE email = $1',
    [email]
  );
  return res.rows[0] as
    | {
        id: string;
        email: string | null;
        password_hash: string | null;
        role: GlobalRole;
      }
    | undefined;
}

export async function signupHandler(req: Request, res: Response) {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Некорректные данные' });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await pool.query(
      `INSERT INTO users (email, password_hash, role, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, email, role`,
      [email, passwordHash, 'client']
    );

    const user = insertRes.rows[0] as { id: string; email: string | null; role: GlobalRole };
    const token = signToken({
      id: user.id,
      email: user.email,
      global_role: user.role,
    });

    return res.status(201).json({
      token,
      user,
    });
  } catch (err) {
    console.error('[auth] signup error', err);
    return res.status(500).json({ error: 'Ошибка регистрации. Попробуйте позже.' });
  }
}

export async function loginHandler(req: Request, res: Response) {
  try {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Некорректные данные' });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      global_role: user.role,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        global_role: user.role,
      },
    });
  } catch (err) {
    console.error('[auth] login error', err);
    return res.status(500).json({ error: 'Ошибка входа. Попробуйте позже.' });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const token = header.slice('Bearer '.length);
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured');
    }
    const payload = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
    (req as any).user = payload;
    next();
  } catch (err) {
    console.error('[auth] requireAuth error', err);
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

export function requireRole(role: GlobalRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JwtUserPayload | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    if (user.global_role !== role) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    return next();
  };
}

export function meHandler(req: Request, res: Response) {
  const user = (req as any).user as JwtUserPayload | undefined;
  if (!user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  return res.json({ user });
}

