import type { NextFunction, Request, Response } from 'express';
import { supabaseAnon } from '../supabase.js';
import { verifyAdminToken } from '../utils/adminJwt.js';

export type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

export type AuthAccountType = 'client' | 'escort' | 'business';

export type AdvertiserAccess = {
  accountType: Exclude<AuthAccountType, 'client'>;
  plan: 'escort_monthly' | 'business_monthly';
  subscriptionStatus: string;
  onboarding: boolean;
  maxOnboardingPhotos: number;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      advertiserAccess?: AdvertiserAccess;
    }
  }
}

export async function verifyUser(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const adminUser = tryReadAdminToken(token);
  if (adminUser) {
    req.user = adminUser;
    return next();
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

export function verifyAdminJwt(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const adminUser = tryReadAdminToken(token);
  if (!adminUser) {
    return res.status(401).json({ error: 'Invalid or expired admin token' });
  }

  req.user = adminUser;
  next();
}

export function getAuthAccountType(user?: AuthUser): AuthAccountType {
  const value = String(readAppMetadata(user, 'auth_account_type') || 'client');
  return value === 'escort' || value === 'business' ? value : 'client';
}

export function getAdvertiserAccess(user?: AuthUser): AdvertiserAccess | null {
  const accountType = getAuthAccountType(user);
  if (accountType === 'client') return null;

  const subscriptionStatus = String(readAppMetadata(user, 'subscription_status') || '');
  const plan = String(readAppMetadata(user, 'plan') || '');
  const requiredPlan = accountType === 'escort' ? 'escort_monthly' : 'business_monthly';

  if (subscriptionStatus !== 'active' || plan !== requiredPlan) return null;

  return {
    accountType,
    plan: requiredPlan,
    subscriptionStatus: 'active',
    onboarding: false,
    maxOnboardingPhotos: 12
  };
}

export function getAdvertiserOnboardingAccess(user?: AuthUser): AdvertiserAccess | null {
  const accountType = getAuthAccountType(user);
  if (accountType === 'client') return null;

  const subscriptionStatus = String(readAppMetadata(user, 'subscription_status') || 'trial');
  const metadataPlan = String(readAppMetadata(user, 'plan') || '');
  const requiredPlan = accountType === 'escort' ? 'escort_monthly' : 'business_monthly';
  const active = subscriptionStatus === 'active' && (!metadataPlan || metadataPlan === requiredPlan);

  return {
    accountType,
    plan: requiredPlan,
    subscriptionStatus: active ? 'active' : subscriptionStatus,
    onboarding: !active,
    maxOnboardingPhotos: 12
  };
}

export function requireAccountType(...allowedTypes: AuthAccountType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const accountType = getAuthAccountType(req.user);
    if (!allowedTypes.includes(accountType)) {
      return res.status(403).json({ error: 'Account type is not allowed for this action' });
    }

    next();
  };
}

export function requireAdvertiserAccess(req: Request, res: Response, next: NextFunction) {
  const access = getAdvertiserAccess(req.user);
  if (!access) {
    return res.status(403).json({
      error: 'Active advertiser or business subscription required',
      required: {
        escort: { auth_account_type: 'escort', plan: 'escort_monthly', subscription_status: 'active' },
        business: { auth_account_type: 'business', plan: 'business_monthly', subscription_status: 'active' }
      }
    });
  }

  req.advertiserAccess = access;
  next();
}

export function requireAdvertiserOnboardingAccess(req: Request, res: Response, next: NextFunction) {
  const access = getAdvertiserOnboardingAccess(req.user);
  if (!access) {
    return res.status(403).json({ error: 'Escort or business account required' });
  }

  req.advertiserAccess = access;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.app_metadata?.role;
  const isAdmin = role === 'admin' || req.user?.app_metadata?.admin === true;

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export function requireAdminOrModerator(req: Request, res: Response, next: NextFunction) {
  const role = req.user?.app_metadata?.role;
  const isAllowed = role === 'admin' || role === 'moderator' || req.user?.app_metadata?.admin === true;

  if (!isAllowed) {
    return res.status(403).json({ error: 'Admin or moderator access required' });
  }

  next();
}

function readAppMetadata(user: AuthUser | undefined, key: string) {
  return user?.app_metadata?.[key];
}

function tryReadAdminToken(token: string): AuthUser | null {
  try {
    const payload = verifyAdminToken(token);
    return {
      id: payload.sub,
      email: payload.email,
      app_metadata: {
        role: 'admin',
        admin: true
      }
    };
  } catch {
    return null;
  }
}
