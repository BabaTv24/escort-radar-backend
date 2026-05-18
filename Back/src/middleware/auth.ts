import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { supabaseAnon } from '../supabase.js';

export type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function verifyUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    id: data.user.id,
    email: data.user.email,
    app_metadata: data.user.app_metadata
  };

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.app_metadata?.role;
  const email = req.user?.email?.toLowerCase();
  const isAdmin = role === 'admin' || (email ? config.adminEmails.includes(email) : false);

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}
