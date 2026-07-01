import { config } from './config.js';

export type StripeTransactionType = 'client_activation' | 'escort_subscription' | 'business_subscription' | 'coins_purchase';

export type CoinPackage = {
  id: string;
  plan: string;
  name: string;
  coins: number;
  amount_cents: number;
  currency: 'eur';
  price_env_key: string;
  price_id: string;
};

export const escortRadarStripeApp = 'escort_radar';

export const coinPackages: CoinPackage[] = [
  { id: 'coins_100', plan: 'coins_100', name: '100 coins', coins: 100, amount_cents: 499, currency: 'eur', price_env_key: 'STRIPE_COINS_100_PRICE_ID', price_id: config.stripePriceIds.coins100 },
  { id: 'coins_250', plan: 'coins_250', name: '250 coins', coins: 250, amount_cents: 999, currency: 'eur', price_env_key: 'STRIPE_COINS_250_PRICE_ID', price_id: config.stripePriceIds.coins250 },
  { id: 'coins_600', plan: 'coins_600', name: '600 coins', coins: 600, amount_cents: 1999, currency: 'eur', price_env_key: 'STRIPE_COINS_600_PRICE_ID', price_id: config.stripePriceIds.coins600 },
  { id: 'coins_1500', plan: 'coins_1500', name: '1500 coins', coins: 1500, amount_cents: 4999, currency: 'eur', price_env_key: 'STRIPE_COINS_1500_PRICE_ID', price_id: config.stripePriceIds.coins1500 }
];

export function getCoinPackage(id: string) {
  return coinPackages.find((tokenPackage) => tokenPackage.id === id || tokenPackage.plan === id);
}

export function getStripePlan(input: { transactionType: StripeTransactionType; coinPackageId?: string }) {
  if (input.transactionType === 'client_activation') {
    return {
      transaction_type: 'client_activation' as const,
      plan: 'client_activation_099',
      mode: 'payment' as const,
      amount_cents: 99,
      currency: 'eur',
      price_env_key: 'STRIPE_CLIENT_ACTIVATION_PRICE_ID',
      price_id: config.stripePriceIds.clientActivation
    };
  }
  if (input.transactionType === 'escort_subscription') {
    return {
      transaction_type: 'escort_subscription' as const,
      plan: 'escort_monthly',
      mode: 'subscription' as const,
      amount_cents: 4999,
      currency: 'eur',
      price_env_key: 'STRIPE_ESCORT_MONTHLY_PRICE_ID',
      price_id: config.stripePriceIds.escortMonthly
    };
  }
  if (input.transactionType === 'business_subscription') {
    return {
      transaction_type: 'business_subscription' as const,
      plan: 'business_monthly',
      mode: 'subscription' as const,
      amount_cents: 49999,
      currency: 'eur',
      price_env_key: 'STRIPE_BUSINESS_MONTHLY_PRICE_ID',
      price_id: config.stripePriceIds.businessMonthly
    };
  }

  const tokenPackage = getCoinPackage(input.coinPackageId || 'coins_100') || coinPackages[0];
  return {
    transaction_type: 'coins_purchase' as const,
    plan: tokenPackage.plan,
    mode: 'payment' as const,
    amount_cents: tokenPackage.amount_cents,
    currency: tokenPackage.currency,
    coins_amount: tokenPackage.coins,
    price_env_key: tokenPackage.price_env_key,
    price_id: tokenPackage.price_id
  };
}
