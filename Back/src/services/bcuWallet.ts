import { supabaseAdmin } from '../supabase.js';

export const BCU_PER_BC = 10000n;

const bcAmountPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const bcuAmountPattern = /^[1-9]\d*$/;
const transactionTypePattern = /^[a-z0-9_:.:-]{2,80}$/;
const productCodePattern = /^[a-z0-9_]{2,80}$/;
const entitlementTypes = ['client_premium', 'advertiser', 'small_business', 'vip_business', 'communication_plus'] as const;

export type BcuEntitlementType = typeof entitlementTypes[number];

export type BcuWallet = {
  id: string;
  user_id: string;
  public_wallet_id: string;
  balance_bcu: string;
  lifetime_credit_bcu: string;
  lifetime_debit_bcu: string;
  frozen: boolean;
  migration_status: string;
  migrated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BcuLedgerEntry = {
  id: string;
  wallet_id: string;
  user_id: string;
  amount_bcu: string;
  direction: 'credit' | 'debit';
  transaction_type: string;
  status: string;
  idempotency_key: string;
  reference_type: string | null;
  reference_id: string | null;
  source_user_id: string | null;
  target_user_id: string | null;
  profile_id: string | null;
  business_id: string | null;
  subscription_id: string | null;
  booking_id: string | null;
  source_system: string;
  source_table: string | null;
  source_record_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type BcuLedgerInput = {
  userId: string;
  amountBcu: string;
  direction: 'credit' | 'debit';
  transactionType: string;
  idempotencyKey: string;
  referenceType?: string | null;
  referenceId?: string | null;
  sourceUserId?: string | null;
  targetUserId?: string | null;
  profileId?: string | null;
  businessId?: string | null;
  subscriptionId?: string | null;
  bookingId?: string | null;
  sourceSystem?: 'bcu' | 'legacy_wallet' | 'coin_wallet' | 'manual_admin' | 'migration';
  sourceTable?: string | null;
  sourceRecordId?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
};

export type SystemBcuProduct = {
  id: string;
  product_code: string;
  display_name: string;
  amount_bcu: string;
  operation_type: 'credit' | 'debit' | 'transfer';
  entitlement_type: BcuEntitlementType | null;
  duration_days: number | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type UserEntitlement = {
  id: string;
  user_id: string;
  entitlement_type: BcuEntitlementType;
  status: 'active' | 'expired' | 'revoked' | 'pending';
  starts_at: string;
  ends_at: string | null;
  source: string;
  source_reference_id: string | null;
  product_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BcuActivationResult = {
  product_code: string;
  amount_bcu: string;
  charged: boolean;
  ledger_entry: BcuLedgerEntry | null;
  entitlement: UserEntitlement | null;
};

export function bcToBcu(amountBc: string) {
  const normalized = amountBc.trim();
  if (!bcAmountPattern.test(normalized)) throw new Error('BC amount must be a non-negative decimal with max 4 places');

  const [wholePart, fractionalPart = ''] = normalized.split('.');
  const wholeBcu = BigInt(wholePart) * BCU_PER_BC;
  const fractionalBcu = BigInt(fractionalPart.padEnd(4, '0') || '0');
  return (wholeBcu + fractionalBcu).toString();
}

export function bcuToBc(amountBcu: string) {
  const normalized = amountBcu.trim();
  if (!/^(?:0|[1-9]\d*)$/.test(normalized)) throw new Error('BCU amount must be a non-negative integer string');

  const value = BigInt(normalized);
  const whole = value / BCU_PER_BC;
  const fraction = value % BCU_PER_BC;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(4, '0').replace(/0+$/, '')}`;
}

export function assertPositiveBcuAmount(amountBcu: string) {
  if (!bcuAmountPattern.test(amountBcu.trim())) throw new Error('BCU amount must be a positive integer string');
}

export function assertBcuTransactionType(transactionType: string) {
  if (!transactionTypePattern.test(transactionType.trim())) throw new Error('BCU transaction type is invalid');
}

export function assertBcuProductCode(productCode: string) {
  if (!productCodePattern.test(productCode.trim())) throw new Error('BCU product code is invalid');
}

export function assertEntitlementType(entitlementType: string): asserts entitlementType is BcuEntitlementType {
  if (!entitlementTypes.includes(entitlementType as BcuEntitlementType)) throw new Error('BCU entitlement type is invalid');
}

export async function getBcuWalletForUser(userId: string): Promise<BcuWallet | null> {
  const { data, error } = await supabaseAdmin
    .from('bcu_wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as BcuWallet | null;
}

export async function getOrCreateBcuWalletForUser(userId: string): Promise<BcuWallet> {
  const existing = await getBcuWalletForUser(userId);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('bcu_wallets')
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as BcuWallet;
}

export async function getBcuLedgerForUser(userId: string, limit = 50, offset = 0): Promise<BcuLedgerEntry[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const { data, error } = await supabaseAdmin
    .from('bcu_ledger_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (error) throw error;
  return (data || []) as BcuLedgerEntry[];
}

export async function getActiveBcuProducts(): Promise<SystemBcuProduct[]> {
  const { data, error } = await supabaseAdmin
    .from('system_bcu_products')
    .select('*')
    .eq('active', true)
    .order('product_code', { ascending: true });
  if (error) throw error;
  return (data || []) as SystemBcuProduct[];
}

export async function getUserEntitlements(userId: string): Promise<UserEntitlement[]> {
  const { data, error } = await supabaseAdmin
    .from('user_entitlements')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as UserEntitlement[];
}

export async function hasActiveEntitlement(userId: string, entitlementType: BcuEntitlementType): Promise<boolean> {
  assertEntitlementType(entitlementType);
  const { data, error } = await supabaseAdmin.rpc('has_active_user_entitlement', {
    p_user_id: userId,
    p_entitlement_type: entitlementType
  });
  if (error) throw error;
  return data === true;
}

export async function applyBcuLedgerEntry(input: BcuLedgerInput): Promise<BcuLedgerEntry> {
  assertPositiveBcuAmount(input.amountBcu);
  assertBcuTransactionType(input.transactionType);
  if (!input.idempotencyKey.trim()) throw new Error('BCU idempotency key is required');

  const { data, error } = await supabaseAdmin.rpc('apply_bcu_ledger_entry', {
    p_user_id: input.userId,
    p_amount_bcu: input.amountBcu.trim(),
    p_direction: input.direction,
    p_transaction_type: input.transactionType.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    p_reference_type: input.referenceType || null,
    p_reference_id: input.referenceId || null,
    p_source_system: input.sourceSystem || 'bcu',
    p_source_table: input.sourceTable || null,
    p_source_record_id: input.sourceRecordId || null,
    p_metadata: input.metadata || {},
    p_created_by: input.createdBy || null,
    p_source_user_id: input.sourceUserId || null,
    p_target_user_id: input.targetUserId || null,
    p_profile_id: input.profileId || null,
    p_business_id: input.businessId || null,
    p_subscription_id: input.subscriptionId || null,
    p_booking_id: input.bookingId || null
  });
  if (error) throw error;
  return data as BcuLedgerEntry;
}

export async function activateBcuProduct(input: {
  userId: string;
  productCode: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<BcuActivationResult> {
  assertBcuProductCode(input.productCode);
  if (!input.idempotencyKey.trim()) throw new Error('BCU idempotency key is required');

  const { data, error } = await supabaseAdmin.rpc('activate_bcu_product', {
    p_user_id: input.userId,
    p_product_code: input.productCode.trim(),
    p_idempotency_key: input.idempotencyKey.trim(),
    p_metadata: input.metadata || {}
  });
  if (error) throw error;
  return data as BcuActivationResult;
}
