import { Router } from 'express';
import type { Response } from 'express';
import { config } from '../config.js';
import { requireAccountType, verifyUser } from '../middleware/auth.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { notifyUser } from '../services/inAppNotifications.js';
import { bcuToBc, normalizeBcuDatabaseInteger } from '../services/bcuWallet.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';

/** Voluntary gifts (business contract V1, section 8). Prices come only from system_bcu_products. */
export const GIFT_LEVELS = [
  { level: 1, name: 'Diamond I', product_code: 'gift_diamond_1' },
  { level: 2, name: 'Diamond II', product_code: 'gift_diamond_2' },
  { level: 3, name: 'Diamond III', product_code: 'gift_diamond_3' },
  { level: 4, name: 'Diamond IV', product_code: 'gift_diamond_4' },
  { level: 5, name: 'Diamond V', product_code: 'gift_diamond_5' }
] as const;

export const giftsRouter = Router();

/** The gift catalog. A level without an active, priced product is listed as not configured and cannot be sent. */
giftsRouter.get('/catalog', asyncHandler(async (_req, res) => {
  res.json({ gifts: await giftCatalog() });
}));

giftsRouter.post('/:profileId', verifyUser, requireAccountType('client'), asyncHandler(async (req, res) => {
  if (!config.bcuWalletEnabled) return giftError(res, 404, 'GIFTS_NOT_AVAILABLE');
  const level = Number(req.body?.level);
  if (!Number.isInteger(level) || level < 1 || level > 5) return giftError(res, 400, 'GIFT_LEVEL_INVALID');
  const idempotencyKey = String(req.body?.idempotency_key || req.headers['idempotency-key'] || '').trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) return giftError(res, 400, 'GIFT_IDEMPOTENCY_KEY_INVALID');

  const activation = await getClientActivationSummary(req.user!.id);
  if (activation.state !== 'client_activated') return giftError(res, 403, 'CLIENT_ACTIVATION_REQUIRED');

  const { data, error } = await supabaseAdmin.rpc('send_bcu_profile_gift', {
    p_client_user_id: req.user!.id,
    p_profile_id: req.params.profileId,
    p_gift_level: level,
    p_idempotency_key: idempotencyKey
  });
  if (error) return mapGiftError(res, error.message);

  const gift = (data as { charged?: boolean; gift?: Record<string, any> } | null)?.gift || {};
  const amountBc = bcuToBc(normalizeBcuDatabaseInteger(gift.amount_bcu ?? 0));
  if ((data as { charged?: boolean })?.charged) {
    // The owner learns the gift level and amount, never who sent it.
    await notifyUser({
      userId: gift.recipient_user_id,
      recipientType: 'advertiser',
      eventType: 'gift_received',
      title: 'New gift',
      body: `${GIFT_LEVELS[level - 1].name} · +${amountBc} BC`,
      profileId: gift.profile_id
    });
  }
  res.status(201).json({
    charged: Boolean((data as { charged?: boolean })?.charged),
    gift: { id: gift.id, profile_id: gift.profile_id, level: gift.gift_level, amount_bc: amountBc, created_at: gift.created_at }
  });
}));

export async function giftCatalog() {
  const { data } = await supabaseAdmin.from('system_bcu_products')
    .select('product_code, amount_bcu, operation_type, active')
    .in('product_code', GIFT_LEVELS.map((gift) => gift.product_code));
  const byCode = new Map((data || []).map((row: any) => [row.product_code, row]));
  return GIFT_LEVELS.map((gift) => {
    const product: any = byCode.get(gift.product_code);
    const amount = product ? BigInt(normalizeBcuDatabaseInteger(product.amount_bcu)) : 0n;
    const configured = Boolean(product?.active && product.operation_type === 'transfer' && amount > 0n);
    return { ...gift, configured, price_bc: configured ? bcuToBc(amount.toString()) : null };
  });
}

function mapGiftError(res: Response, message: string) {
  if (message.includes('GIFT_NOT_CONFIGURED')) return giftError(res, 409, 'GIFT_NOT_CONFIGURED');
  if (message.includes('INSUFFICIENT')) return giftError(res, 402, 'INSUFFICIENT_BC');
  if (message.includes('CLIENT_ACTIVATION_REQUIRED')) return giftError(res, 403, 'CLIENT_ACTIVATION_REQUIRED');
  if (message.includes('PROFILE_NOT_AVAILABLE')) return giftError(res, 404, 'PROFILE_NOT_AVAILABLE');
  if (message.includes('IDEMPOTENCY')) return giftError(res, 409, 'GIFT_IDEMPOTENCY_CONFLICT');
  if (message.includes('GIFT_LEVEL_INVALID')) return giftError(res, 400, 'GIFT_LEVEL_INVALID');
  if (message.includes('invalid input syntax for type uuid')) return giftError(res, 404, 'PROFILE_NOT_AVAILABLE');
  console.error('[Gifts] send failed', message);
  return giftError(res, 400, 'GIFT_FAILED');
}

function giftError(res: Response, status: number, code: string) {
  return res.status(status).json({ error: code, code, charged: false });
}
