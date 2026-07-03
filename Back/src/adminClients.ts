import { isRealRevenueTransaction, revenueAmount } from './revenue.js';

export const importantLiveTestClientEmail = (process.env.ADMIN_LIVE_TEST_CLIENT_EMAIL || 'client@example.test').toLowerCase();

export type AdminClientInput = {
  user: Record<string, any>;
  activation?: Record<string, any> | null;
  payments?: Record<string, any>[];
  wallet?: Record<string, any> | null;
  referral?: Record<string, any> | null;
  lastAccess?: Record<string, any> | null;
};

export function isClientUser(user: Record<string, any>) {
  const metadata = user.app_metadata || {};
  const userMetadata = user.user_metadata || {};
  return String(metadata.auth_account_type || metadata.account_type || userMetadata.auth_account_type || userMetadata.account_type || '').toLowerCase() === 'client'
    || String(metadata.client_state || metadata.client_activation_state || '').startsWith('client_')
    || user.email?.toLowerCase() === importantLiveTestClientEmail;
}

export function normalizeClientPayment(payment: Record<string, any>): Record<string, any> {
  const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  const stripeSessionId = payment.stripe_checkout_session_id || payment.stripe_session_id || payment.checkout_session_id || null;
  return {
    ...payment,
    transaction_type: payment.transaction_type || 'client_activation',
    payment_status: payment.payment_status || payment.status,
    status: payment.status || payment.payment_status || 'paid',
    provider: payment.provider || 'stripe',
    email: payment.email || payment.customer_email || metadata.email || metadata.customer_email || null,
    stripe_session_id: payment.stripe_session_id || stripeSessionId,
    stripe_checkout_session_id: stripeSessionId,
    stripe_payment_intent_id: payment.stripe_payment_intent_id || payment.payment_intent || null,
    amount: payment.amount ?? payment.amount_eur ?? (payment.amount_cents == null ? null : Number(payment.amount_cents) / 100),
    amount_eur: payment.amount_eur ?? payment.amount ?? (payment.amount_cents == null ? null : Number(payment.amount_cents) / 100),
    amount_cents: payment.amount_cents ?? (payment.amount_eur == null && payment.amount == null ? null : Math.round(Number(payment.amount_eur ?? payment.amount) * 100)),
    currency: String(payment.currency || 'eur').toLowerCase()
  } as Record<string, any>;
}

export function isRealClientActivationPayment(payment: Record<string, any>) {
  const normalized = normalizeClientPayment(payment);
  return isRealRevenueTransaction(normalized) && revenueAmount(normalized) === 0.99;
}

export function paymentMatchesClient(payment: Record<string, any>, user: Record<string, any>) {
  const normalized = normalizeClientPayment(payment);
  const userEmail = String(user.email || '').toLowerCase();
  const paymentEmail = String(normalized.email || normalized.customer_email || normalized.metadata?.email || '').toLowerCase();
  return Boolean((normalized.user_id && normalized.user_id === user.id) || (userEmail && paymentEmail && paymentEmail === userEmail));
}

export function getEmailByUserId(users: Record<string, any>[] = []) {
  const emailByUserId = new Map<string, string>();
  users.forEach((user) => {
    if (user.id && user.email) emailByUserId.set(String(user.id), String(user.email));
  });
  return emailByUserId;
}

export function enrichClientActivationPayments(payments: Record<string, any>[] = [], users: Record<string, any>[] = []): Record<string, any>[] {
  const emailByUserId = getEmailByUserId(users);
  return payments.map((payment) => {
    const normalized = normalizeClientPayment(payment);
    const email = normalized.email || (normalized.user_id ? emailByUserId.get(String(normalized.user_id)) : null) || null;
    const hasStripeRef = Boolean(normalized.stripe_checkout_session_id || normalized.stripe_session_id || normalized.stripe_payment_intent_id);
    const realStripeActivation = isRealClientActivationPayment({ ...normalized, email });
    return {
      ...normalized,
      email,
      amount: revenueAmount(normalized),
      livemode: normalized.livemode,
      stripe_debug: hasStripeRef ? null : 'Nie znaleziono rekordu Stripe w bazie',
      has_real_stripe_activation: realStripeActivation
    };
  });
}

export function enrichTokenPurchaseRequests(purchases: Record<string, any>[] = [], wallets: Record<string, any>[] = [], users: Record<string, any>[] = []): Record<string, any>[] {
  const emailByUserId = getEmailByUserId(users);
  const walletById = new Map<string, Record<string, any>>();
  wallets.forEach((wallet) => {
    if (wallet.id) walletById.set(String(wallet.id), wallet);
  });

  return purchases.map((purchase) => {
    const wallet = purchase.wallet_id ? walletById.get(String(purchase.wallet_id)) : null;
    const userId = purchase.user_id || wallet?.user_id || null;
    return {
      ...purchase,
      user_id: userId,
      email: purchase.email || (userId ? emailByUserId.get(String(userId)) : null) || null
    };
  });
}

export function enrichTokenTransactionsWithEmails(transactions: Record<string, any>[] = [], wallets: Record<string, any>[] = [], users: Record<string, any>[] = []): Record<string, any>[] {
  const emailByUserId = getEmailByUserId(users);
  const walletById = new Map<string, Record<string, any>>();
  wallets.forEach((wallet) => {
    if (wallet.id) walletById.set(String(wallet.id), wallet);
  });

  return transactions.map((transaction) => {
    const fromWallet = transaction.from_wallet_id ? walletById.get(String(transaction.from_wallet_id)) : null;
    const toWallet = transaction.to_wallet_id ? walletById.get(String(transaction.to_wallet_id)) : null;
    const fromUserId = fromWallet?.user_id || null;
    const toUserId = toWallet?.user_id || null;
    const primaryUserId = transaction.user_id || toUserId || fromUserId || null;
    return {
      ...transaction,
      user_id: primaryUserId,
      email: transaction.email || (primaryUserId ? emailByUserId.get(String(primaryUserId)) : null) || null,
      from_email: fromUserId ? emailByUserId.get(String(fromUserId)) || null : null,
      to_email: toUserId ? emailByUserId.get(String(toUserId)) || null : null
    };
  });
}

export function pickBestClientPayment(payments: Record<string, any>[] = []) {
  return payments
    .map(normalizeClientPayment)
    .sort((left, right) => Number(isRealClientActivationPayment(right)) - Number(isRealClientActivationPayment(left))
      || new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0] || null;
}

export function resolveClientStatus(input: AdminClientInput) {
  const email = String(input.user.email || '').toLowerCase();
  const payment = pickBestClientPayment(input.payments || []);
  const realStripePayment = payment ? isRealClientActivationPayment(payment) : false;
  const activationState = input.activation?.state || input.user.app_metadata?.client_state || input.user.app_metadata?.client_activation_state || 'client_free';
  const isBlocked = Boolean(input.user.banned_until) || Boolean(input.wallet?.frozen);
  const isTest = email.includes('+test') || input.user.app_metadata?.test_account === true || email === importantLiveTestClientEmail;
  const adminActivated = activationState === 'client_activated' && !realStripePayment;

  if (isBlocked) return 'blocked';
  if (realStripePayment) return 'stripe_activated';
  if (adminActivated) return 'admin_activated';
  if (activationState === 'client_activated') return 'activated';
  if (isTest) return 'test';
  return 'free';
}

export function buildAdminClient(input: AdminClientInput) {
  const payments = (input.payments || []).map(normalizeClientPayment);
  const payment = pickBestClientPayment(payments);
  const status = resolveClientStatus({ ...input, payments });
  const activationState = input.activation?.state || input.user.app_metadata?.client_state || input.user.app_metadata?.client_activation_state || 'client_free';
  const realStripePayment = payment ? isRealClientActivationPayment(payment) : false;

  return {
    id: input.user.id,
    email: input.user.email || '',
    account_status: status,
    activation_status: activationState,
    activation_amount: payment ? revenueAmount(payment) : Number(input.activation?.amount_eur || 0),
    payment_provider: payment?.provider || (status === 'admin_activated' ? 'manual_admin' : null),
    activated_at: input.activation?.activated_at || payment?.created_at || null,
    registered_at: input.user.created_at || null,
    token_balance: Number(input.wallet?.escort_token_balance || 0),
    coins: Number(input.wallet?.escort_token_balance || 0),
    referral_code: input.referral?.referral_code || input.user.app_metadata?.client_referral_code || null,
    last_login: input.lastAccess?.created_at || input.user.last_sign_in_at || null,
    is_blocked: status === 'blocked',
    is_test_client: status === 'test' || String(input.user.email || '').toLowerCase() === importantLiveTestClientEmail,
    is_admin_activated: status === 'admin_activated',
    has_real_stripe_activation: realStripePayment,
    stripe_warning: activationState === 'client_activated' && !realStripePayment ? 'Brak kompletnego potwierdzenia live Stripe' : null,
    stripe_checkout_session_id: payment?.stripe_checkout_session_id || payment?.stripe_session_id || input.activation?.stripe_checkout_session_id || null,
    stripe_payment_intent_id: payment?.stripe_payment_intent_id || input.activation?.stripe_payment_intent_id || null,
    payments
  };
}

export function filterSortPaginateClients(clients: Record<string, any>[], input: Record<string, any>) {
  const search = String(input.search || input.q || '').trim().toLowerCase();
  const status = String(input.status || 'all');
  const sort = String(input.sort || 'registered_at');
  const direction = String(input.direction || 'desc') === 'asc' ? 1 : -1;
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.page_size || input.pageSize || 25)));

  const filtered = clients.filter((client) => {
    if (search && !`${client.email} ${client.id}`.toLowerCase().includes(search)) return false;
    if (status !== 'all' && client.account_status !== status && client.activation_status !== status) return false;
    return true;
  });

  const sorted = filtered.sort((left, right) => {
    const leftValue = sort === 'activated_at' ? left.activated_at : left.registered_at;
    const rightValue = sort === 'activated_at' ? right.activated_at : right.registered_at;
    return (new Date(leftValue || 0).getTime() - new Date(rightValue || 0).getTime()) * direction;
  });

  const offset = (page - 1) * pageSize;
  return {
    rows: sorted.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    page_size: pageSize
  };
}
