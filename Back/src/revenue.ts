export const paidStatuses = new Set(['paid', 'succeeded', 'completed']);
export const excludedRevenueProviders = new Set(['manual_admin', 'free', 'sponsored', 'test', 'migration']);
export const realRevenueTransactionTypes = new Set(['client_activation', 'escort_subscription', 'business_subscription', 'coins_purchase']);

export type RevenueTransaction = Record<string, any>;

export function hasStripeReference(row: RevenueTransaction) {
  return Boolean(
    row.stripe_payment_intent_id
      || row.stripe_checkout_session_id
      || row.stripe_session_id
      || row.stripe_subscription_id
  );
}

export function isLiveRevenue(row: RevenueTransaction) {
  return row.livemode === undefined || row.livemode === null || row.livemode === true || row.livemode === 'true';
}

export function revenueStatus(row: RevenueTransaction) {
  return String(row.payment_status || row.status || '').toLowerCase();
}

export function revenueProvider(row: RevenueTransaction) {
  return String(row.provider || '').toLowerCase();
}

export function revenueTransactionType(row: RevenueTransaction) {
  return String(row.transaction_type || row.type || '').toLowerCase();
}

export function revenueAmount(row: RevenueTransaction) {
  const amount = row.amount_eur ?? row.amount ?? (row.amount_cents == null ? null : Number(row.amount_cents) / 100);
  const parsed = Number(amount || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isRealRevenueTransaction(row: RevenueTransaction) {
  return paidStatuses.has(revenueStatus(row))
    && revenueAmount(row) > 0
    && !excludedRevenueProviders.has(revenueProvider(row))
    && hasStripeReference(row)
    && isLiveRevenue(row)
    && realRevenueTransactionTypes.has(revenueTransactionType(row));
}

export function sumRealRevenue(rows: RevenueTransaction[]) {
  return Number(rows.filter(isRealRevenueTransaction).reduce((sum, row) => sum + revenueAmount(row), 0).toFixed(2));
}

export function isRealPaidSubscription(row: RevenueTransaction) {
  return isRealRevenueTransaction(row)
    && ['escort_subscription', 'business_subscription'].includes(revenueTransactionType(row));
}

export function isBusinessRole(role: unknown) {
  return ['business', 'agency', 'club', 'massage_salon', 'brothel', 'live_cam'].includes(String(role || '').toLowerCase());
}

export function subscriptionTransactionType(row: RevenueTransaction) {
  return isBusinessRole(row.role) ? 'business_subscription' : 'escort_subscription';
}
