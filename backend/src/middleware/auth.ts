import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: number;
  username: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const SECRET = process.env.JWT_SECRET || 'blogtell_dev_secret';

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({error:'Missing or invalid token'});
    return;
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({error:'Token expired or invalid'});
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), SECRET) as AuthPayload;
    } catch {}
  }
  next();
}

export function signToken(payload: AuthPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as `${number}${'s'|'m'|'h'|'d'|'w'|'y'}`;
  return jwt.sign(payload, SECRET, { expiresIn });
}