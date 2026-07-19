import { Router } from 'express';
import { config } from '../config.js';
import { verifyUser } from '../middleware/auth.js';
import {
  activateBcuProduct,
  bcuToBc,
  getActiveBcuProducts,
  getBcuLedgerForUser,
  getBcuWalletForUser,
  getUserEntitlements
} from '../services/bcuWallet.js';
import { asyncHandler } from '../validation.js';

export const bcuRouter = Router();

bcuRouter.use(verifyUser);
bcuRouter.use((_, res, next) => {
  if (!config.bcuWalletEnabled) return res.status(404).json({ error: 'BCU wallet is not available' });
  return next();
});

bcuRouter.get('/wallet', asyncHandler(async (req, res) => {
  const wallet = await getBcuWalletForUser(req.user!.id);
  res.json({ wallet: wallet ? serializeWallet(wallet) : null });
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

bcuRouter.post('/products/:productCode/activate', asyncHandler(async (req, res) => {
  const productCode = String(req.params.productCode || '');
  if (productCode !== 'communication_plus') {
    return res.status(403).json({ error: 'BCU product activation is not available for this product' });
  }

  const idempotencyKey = String(req.body?.idempotency_key || req.headers['idempotency-key'] || '');
  const result = await activateBcuProduct({
    userId: req.user!.id,
    productCode,
    idempotencyKey,
    metadata: typeof req.body?.metadata === 'object' && req.body.metadata !== null ? req.body.metadata : {}
  });

  res.json({
    product_code: result.product_code,
    amount_bcu: result.amount_bcu,
    amount_bc: bcuToBc(result.amount_bcu),
    charged: result.charged,
    ledger_entry: result.ledger_entry ? serializeLedgerEntry(result.ledger_entry) : null,
    entitlement: result.entitlement ? serializeEntitlement(result.entitlement) : null
  });
}));

function serializeWallet(wallet: Awaited<ReturnType<typeof getBcuWalletForUser>>) {
  if (!wallet) return null;
  const lockedBalanceBcu = wallet.locked_balance_bcu || '0';
  const availableBalanceBcu = (BigInt(wallet.balance_bcu) - BigInt(lockedBalanceBcu)).toString();
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

function serializeLedgerEntry(entry: Awaited<ReturnType<typeof getBcuLedgerForUser>>[number]) {
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

function serializeProduct(product: Awaited<ReturnType<typeof getActiveBcuProducts>>[number]) {
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
