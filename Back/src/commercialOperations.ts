import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/**
 * PUBLIC PREVIEW gate (ER-V1-PUBLIC-PREVIEW-001).
 * While COMMERCIAL_OPERATIONS_ENABLED is not "true", the server refuses every purchase, payment
 * callback and payment-based entitlement grant. Existing entitlements are never touched.
 */
export const COMMERCIAL_OPERATIONS_DISABLED = 'COMMERCIAL_OPERATIONS_DISABLED';
export const ADVERTISER_REGISTRATION_CLOSED = 'ADVERTISER_REGISTRATION_CLOSED';

export function isCommercialOperationsEnabled() {
  return config.commercialOperationsEnabled === true;
}

export function sendCommercialOperationsDisabled(res: Response) {
  return res.status(409).json({
    error: 'Commercial operations are not available during the public preview',
    code: COMMERCIAL_OPERATIONS_DISABLED
  });
}

export function requireCommercialOperations(_req: Request, res: Response, next: NextFunction) {
  if (!isCommercialOperationsEnabled()) return sendCommercialOperationsDisabled(res);
  next();
}

export function publicPlatformStatus() {
  const commercial = isCommercialOperationsEnabled();
  return {
    mode: commercial ? 'commercial' : 'public_preview',
    commercial_operations_enabled: commercial,
    advertiser_registration_open: commercial,
    purchases_enabled: commercial,
    analytics_enabled: config.analyticsCollectionEnabled === true
  };
}
