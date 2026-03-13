import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export type OwnerType = 'user' | 'client';

export interface OwnerContext {
  ownerType: OwnerType;
  ownerKey: string;
  userId: string | null;
  clientId: string | null;
}

function normalizeClientId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.length > 128) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  return v;
}

export function resolveOwnerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authUser = (req as Request & { user?: { id?: string } }).user;
  const authUserId = typeof authUser?.id === 'string' && authUser.id ? authUser.id : null;

  if (authUserId) {
    (req as Request & { owner?: OwnerContext }).owner = {
      ownerType: 'user',
      ownerKey: `user:${authUserId}`,
      userId: authUserId,
      clientId: null,
    };
    res.setHeader('X-User-Id', authUserId);
    next();
    return;
  }

  const fromClient = normalizeClientId(req.header('X-Client-Id'));
  const fromUserCompat = normalizeClientId(req.header('X-User-Id'));
  const clientId = fromClient ?? fromUserCompat ?? crypto.randomUUID();

  (req as Request & { owner?: OwnerContext }).owner = {
    ownerType: 'client',
    ownerKey: `client:${clientId}`,
    userId: null,
    clientId,
  };

  // Совместимость: фронт пока может читать X-User-Id.
  res.setHeader('X-Client-Id', clientId);
  res.setHeader('X-User-Id', clientId);
  next();
}

