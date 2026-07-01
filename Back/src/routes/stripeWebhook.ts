import { Router } from 'express';
import { config } from '../config.js';
import { handleStripeWebhook } from '../services/stripePayments.js';
import { asyncHandler } from '../validation.js';

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post('/webhook', asyncHandler(async (req, res) => {
  if (!config.stripeEnabled || !config.stripeEscortRadarEnabled) return res.status(410).json({ error: 'Stripe webhook is disabled for Escort Radar' });
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  try {
    const result = await handleStripeWebhook(rawBody, req.headers['stripe-signature'] as string | undefined);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid Stripe webhook' });
  }
}));
