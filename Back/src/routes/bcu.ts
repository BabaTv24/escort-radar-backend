import { Router } from 'express';
import { config } from '../config.js';
import { requireAccountType, verifyUser } from '../middleware/auth.js';
import {
  bcuToBc,
  getActiveBcuProducts,
  getBcuLedgerForUser,
  getBcuWalletForUser,
  getOrCreateBcuWalletForUser,
  getUserEntitlements,
  normalizeBcuDatabaseInteger,
  purchaseCommunicationPlus
} from '../services/bcuWallet.js';
import { asyncHandler } from '../validation.js';
import { calculateAvailableBcu, hasSufficientAvailableBcu } from '../services/communicationPlus.js';

export const bcuRouter = Router();

bcuRouter.use(verifyUser);
bcuRouter.use((_, res, next) => {
  if (!config.bcuWalletEnabled) return res.status(404).json({ error: 'BCU wallet is not available' });
  return next();
});

bcuRouter.get('/wallet', asyncHandler(async (req, res) => {
  const wallet = await getOrCreateBcuWalletForUser(req.user!.id);
  res.json({ wallet: serializeWallet(wallet) });
}));

bcuRouter.get('/ledger', asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const ledger = await getBcuLedgerForUser(req.user!.id, limit, offset);
  res.json({ ledger: ledger.map(serializeLedgerEntry), limit, offset });
}));

bcuRouter.get('/products', asyncHandler(async (_req, res) => {
  const products = await getActiveBcuProducts();
  res.json({ products: products.map(serializeProduct) });
}));

bcuRouter.get('/entitlements', asyncHandler(async (req, res) => {
  const entitlements = await getUserEntitlements(req.user!.id);
  res.json({ entitlements: entitlements.map(serializeEntitlement) });
}));

bcuRouter.get('/communication-plus', requireAccountType('client'), asyncHandler(async (req, res) => {
  const [wallet, products, entitlements] = await Promise.all([
    getBcuWalletForUser(req.user!.id),
    getActiveBcuProducts(),
    getUserEntitlements(req.user!.id)
  ]);
  const product = products.find((item) => item.product_code === 'communication_plus');
  if (!product || normalizeBcuDatabaseInteger(product.amount_bcu) !== '1000000') {
    return res.status(503).json({ error: 'Communication Plus is temporarily unavailable' });
  }

  const balanceBcu = normalizeBcuDatabaseInteger(wallet?.balance_bcu ?? 0);
  const lockedBalanceBcu = normalizeBcuDatabaseInteger(wallet?.locked_balance_bcu ?? 0);
  const availableBalanceBcu = calculateAvailableBcu(balanceBcu, lockedBalanceBcu);
  const premiumActive = entitlements.some((item) => isActiveEntitlement(item, 'client_premium'));
  const communicationPlusActive = entitlements.some((item) => isActiveEntitlement(item, 'communication_plus'));

  res.json({
    client_premium_active: premiumActive,
    communication_plus_active: communicationPlusActive,
    price_bcu: product.amount_bcu,
    price_bc: bcuToBc(product.amount_bcu),
    available_balance_bcu: availableBalanceBcu,
    available_balance_bc: bcuToBc(availableBalanceBcu),
    sufficient_balance: hasSufficientAvailableBcu(balanceBcu, lockedBalanceBcu, product.amount_bcu)
  });
}));

bcuRouter.post('/communication-plus/purchase', requireAccountType('client'), async (req, res, next) => {
  try {
    const idempotencyKey = String(req.body?.idempotency_key || req.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return res.status(400).json({ error: 'A valid idempotency key is required', code: 'IDEMPOTENCY_KEY_INVALID' });
    }
    const result = await purchaseCommunicationPlus({
      userId: req.user!.id,
      idempotencyKey,
      metadata: typeof req.body?.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : {}
    });
    return res.json({
      product_code: result.product_code,
      amount_bcu: result.amount_bcu,
      amount_bc: bcuToBc(result.amount_bcu),
      charged: result.charged,
      ledger_entry: result.ledger_entry ? serializeLedgerEntry(result.ledger_entry) : null,
      entitlement: result.entitlement ? serializeEntitlement(result.entitlement) : null
    });
  } catch (error) {
    const mapped = mapCommunicationPlusError(error);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    return next(error);
  }
});

bcuRouter.post('/products/:productCode/activate', requireAccountType('client'), async (req, res, next) => {
  const productCode = String(req.params.productCode || '');
  if (productCode !== 'communication_plus') {
    return res.status(403).json({ error: 'BCU product activation is not available for this product' });
  }

  try {
    const idempotencyKey = String(req.body?.idempotency_key || req.headers['idempotency-key'] || '').trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return res.status(400).json({ error: 'A valid idempotency key is required', code: 'IDEMPOTENCY_KEY_INVALID' });
    }
    const result = await purchaseCommunicationPlus({
      userId: req.user!.id,
      idempotencyKey,
      metadata: typeof req.body?.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : {}
    });
    return res.json({
      product_code: result.product_code,
      amount_bcu: result.amount_bcu,
      amount_bc: bcuToBc(result.amount_bcu),
      charged: result.charged,
      ledger_entry: result.ledger_entry ? serializeLedgerEntry(result.ledger_entry) : null,
      entitlement: result.entitlement ? serializeEntitlement(result.entitlement) : null
    });
  } catch (error) {
    const mapped = mapCommunicationPlusError(error);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message, code: mapped.code });
    return next(error);
  }
});

export function serializeWallet(wallet: Awaited<ReturnType<typeof getBcuWalletForUser>>) {
  if (!wallet) return null;
  const balanceBcu = normalizeBcuDatabaseInteger(wallet.balance_bcu);
  const lockedBalanceBcu = normalizeBcuDatabaseInteger(wallet.locked_balance_bcu ?? 0);
  const availableBalanceBcu = (BigInt(balanceBcu) - BigInt(lockedBalanceBcu)).toString();
  return {
    public_wallet_id: wallet.public_wallet_id,
    balance_bcu: wallet.balance_bcu,
    balance_bc: bcuToBc(wallet.balance_bcu),
    locked_balance_bcu: lockedBalanceBcu,
    locked_balance_bc: bcuToBc(lockedBalanceBcu),
    available_balance_bcu: availableBalanceBcu,
    available_balance_bc: bcuToBc(availableBalanceBcu),
    lifetime_credit_bcu: wallet.lifetime_credit_bcu,
    lifetime_credit_bc: bcuToBc(wallet.lifetime_credit_bcu),
    lifetime_debit_bcu: wallet.lifetime_debit_bcu,
    lifetime_debit_bc: bcuToBc(wallet.lifetime_debit_bcu),
    frozen: wallet.frozen,
    migration_status: wallet.migration_status,
    migrated_at: wallet.migrated_at,
    created_at: wallet.created_at,
    updated_at: wallet.updated_at
  };
}

export function serializeLedgerEntry(entry: Awaited<ReturnType<typeof getBcuLedgerForUser>>[number]) {
  return {
    id: entry.id,
    amount_bcu: entry.amount_bcu,
    amount_bc: bcuToBc(entry.amount_bcu),
    direction: entry.direction,
    transaction_type: entry.transaction_type,
    status: entry.status,
    reference_type: entry.reference_type,
    reference_id: entry.reference_id,
    created_at: entry.created_at
  };
}

export function serializeProduct(product: Awaited<ReturnType<typeof getActiveBcuProducts>>[number]) {
  return {
    product_code: product.product_code,
    display_name: product.display_name,
    amount_bcu: product.amount_bcu,
    amount_bc: bcuToBc(product.amount_bcu),
    operation_type: product.operation_type,
    entitlement_type: product.entitlement_type,
    duration_days: product.duration_days
  };
}

function serializeEntitlement(entitlement: Awaited<ReturnType<typeof getUserEntitlements>>[number]) {
  return {
    id: entitlement.id,
    entitlement_type: entitlement.entitlement_type,
    status: entitlement.status,
    starts_at: entitlement.starts_at,
    ends_at: entitlement.ends_at,
    product_code: entitlement.product_code,
    created_at: entitlement.created_at,
    updated_at: entitlement.updated_at
  };
}

function isActiveEntitlement(entitlement: Awaited<ReturnType<typeof getUserEntitlements>>[number], type: 'client_premium' | 'communication_plus') {
  return entitlement.entitlement_type === type
    && entitlement.status === 'active'
    && (!entitlement.ends_at || new Date(entitlement.ends_at).getTime() > Date.now());
}

export function mapCommunicationPlusError(error: unknown) {
  const raw = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error || '');
  const mappings = [
    { match: 'BCU_CLIENT_PREMIUM_REQUIRED', status: 403, code: 'CLIENT_PREMIUM_REQUIRED', message: 'Active Client Premium is required' },
    { match: 'BCU_INSUFFICIENT_AVAILABLE_BALANCE', status: 409, code: 'INSUFFICIENT_AVAILABLE_BALANCE', message: 'Insufficient available BC balance' },
    { match: 'BCU_WALLET_FROZEN', status: 409, code: 'WALLET_FROZEN', message: 'BC wallet is frozen' },
    { match: 'BCU_WALLET_NOT_FOUND', status: 409, code: 'WALLET_NOT_FOUND', message: 'BC wallet is not available' },
    { match: 'BCU_IDEMPOTENCY_CONFLICT', status: 409, code: 'IDEMPOTENCY_CONFLICT', message: 'Purchase request conflicts with an earlier request' },
    { match: 'BCU_IDEMPOTENCY_KEY_INVALID', status: 400, code: 'IDEMPOTENCY_KEY_INVALID', message: 'A valid idempotency key is required' },
    { match: 'BCU_COMMUNICATION_PLUS_PRODUCT_INVALID', status: 503, code: 'PRODUCT_UNAVAILABLE', message: 'Communication Plus is temporarily unavailable' }
  ] as const;
  return mappings.find((item) => raw.includes(item.match)) || null;
}
