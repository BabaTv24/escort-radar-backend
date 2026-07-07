import { supabaseAdmin } from './supabase.js';

export type BcCoinPackageRow = {
  id?: string;
  package_key: string;
  title: string;
  coins: number;
  bonus_coins: number;
  price_eur: number;
  currency: string;
  description?: string | null;
  badge?: string | null;
  is_best_value: boolean;
  is_active: boolean;
  sort_order: number;
  promotion_starts_at?: string | null;
  promotion_ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

const fallbackBcCoinPackages = [
  { id: 'bc_66', coins: 66, bonusCoins: 0, priceEur: 9.99, label: '66 BC Coins' },
  { id: 'bc_166', coins: 166, bonusCoins: 20, priceEur: 24.99, label: '166 BC Coins' },
  { id: 'bc_666', coins: 666, bonusCoins: 150, priceEur: 99.99, label: '666 BC Coins' },
  { id: 'bc_1200', coins: 1200, bonusCoins: 450, priceEur: 180, label: '1200 BC Coins' },
  { id: 'bc_2560', coins: 2560, bonusCoins: 700, priceEur: 384, label: '2560 BC Coins' },
  { id: 'bc_5200', coins: 5200, bonusCoins: 1500, priceEur: 780, label: '5200 BC Coins' },
  { id: 'bc_10200', coins: 10200, bonusCoins: 3133, priceEur: 1530, label: '10200 BC Coins' }
] as const;

export const defaultBcCoinPackageRows: BcCoinPackageRow[] = fallbackBcCoinPackages.map((item, index) => ({
  package_key: item.id,
  title: item.label,
  coins: item.coins,
  bonus_coins: item.bonusCoins,
  price_eur: item.priceEur,
  currency: 'EUR',
  description: '',
  badge: item.id === 'bc_666' ? 'Best value' : null,
  is_best_value: item.id === 'bc_666',
  is_active: true,
  sort_order: index + 1,
  promotion_starts_at: null,
  promotion_ends_at: null
}));

export function toPublicTokenPackage(row: BcCoinPackageRow) {
  return {
    id: row.package_key || row.id,
    package_key: row.package_key,
    name: row.title,
    token_amount: Number(row.coins || 0),
    eur_price: Number(row.price_eur || 0),
    bonus_tokens: Number(row.bonus_coins || 0),
    featured: Boolean(row.is_best_value),
    active: Boolean(row.is_active),
    description: row.description || '',
    badge: row.badge || null,
    sort_order: Number(row.sort_order || 0),
    promotion_starts_at: row.promotion_starts_at || null,
    promotion_ends_at: row.promotion_ends_at || null
  };
}

export function toManualPaymentProduct(row: BcCoinPackageRow) {
  const coins = Number(row.coins || 0);
  const bonusCoins = Number(row.bonus_coins || 0);
  const amountCents = Math.round(Number(row.price_eur || 0) * 100);
  return {
    id: row.package_key,
    purpose: 'token_package',
    label: row.title,
    amount_cents: amountCents,
    currency: row.currency || 'EUR',
    tokens: coins,
    bonus_tokens: bonusCoins,
    total_tokens: coins + bonusCoins
  };
}

export async function loadBcCoinPackages(options: { activeOnly?: boolean } = {}) {
  let query = supabaseAdmin
    .from('bc_coin_packages')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('coins', { ascending: true });
  if (options.activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) {
    console.info('[bc coin packages] using fallback reason=', error.message);
    return defaultBcCoinPackageRows.filter((row) => !options.activeOnly || row.is_active);
  }
  return (data?.length ? data : defaultBcCoinPackageRows).map((row) => normalizeBcCoinPackageRow(row));
}

export async function resolveBcCoinManualPaymentProduct(productId: string) {
  const fallback = defaultBcCoinPackageRows.find((row) => row.package_key === productId);
  const { data, error } = await supabaseAdmin
    .from('bc_coin_packages')
    .select('*')
    .eq('package_key', productId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.info('[bc coin package product] fallback reason=', error.message);
    return fallback ? toManualPaymentProduct(fallback) : null;
  }
  const row = data ? normalizeBcCoinPackageRow(data) : fallback;
  return row ? toManualPaymentProduct(row) : null;
}

export function normalizeBcCoinPackagePayload(input: Record<string, unknown>, existing?: Partial<BcCoinPackageRow>) {
  const packageKey = String(input.package_key ?? existing?.package_key ?? '').trim().toLowerCase();
  const title = String(input.title ?? existing?.title ?? '').trim();
  const coins = integerValue(input.coins ?? existing?.coins, 1, 1000000);
  const bonusCoins = integerValue(input.bonus_coins ?? existing?.bonus_coins ?? 0, 0, 1000000);
  const priceEur = moneyValue(input.price_eur ?? existing?.price_eur);
  if (!/^[a-z0-9][a-z0-9_-]{1,78}$/.test(packageKey)) return { error: 'Valid package_key is required' };
  if (!title) return { error: 'title is required' };
  if (coins === null) return { error: 'coins must be a positive integer' };
  if (bonusCoins === null) return { error: 'bonus_coins must be a non-negative integer' };
  if (priceEur === null) return { error: 'price_eur must be a valid amount' };

  return {
    data: {
      package_key: packageKey,
      title,
      coins,
      bonus_coins: bonusCoins,
      price_eur: priceEur,
      currency: String(input.currency ?? existing?.currency ?? 'EUR').trim().toUpperCase().slice(0, 8) || 'EUR',
      description: nullableText(input.description ?? existing?.description, 800),
      badge: nullableText(input.badge ?? existing?.badge, 120),
      is_best_value: Boolean(input.is_best_value ?? existing?.is_best_value ?? false),
      is_active: Boolean(input.is_active ?? existing?.is_active ?? true),
      sort_order: integerValue(input.sort_order ?? existing?.sort_order ?? 0, 0, 100000) ?? 0,
      promotion_starts_at: nullableIsoDate(input.promotion_starts_at ?? existing?.promotion_starts_at),
      promotion_ends_at: nullableIsoDate(input.promotion_ends_at ?? existing?.promotion_ends_at),
      updated_at: new Date().toISOString()
    }
  };
}

function normalizeBcCoinPackageRow(row: Record<string, any>): BcCoinPackageRow {
  return {
    ...row,
    package_key: String(row.package_key || row.id || ''),
    title: String(row.title || row.name || ''),
    coins: Number(row.coins ?? row.token_amount ?? 0),
    bonus_coins: Number(row.bonus_coins ?? row.bonus_tokens ?? 0),
    price_eur: Number(row.price_eur ?? row.eur_price ?? 0),
    currency: String(row.currency || 'EUR'),
    is_best_value: Boolean(row.is_best_value ?? row.featured),
    is_active: row.is_active !== false && row.active !== false,
    sort_order: Number(row.sort_order || 0),
    promotion_starts_at: row.promotion_starts_at || null,
    promotion_ends_at: row.promotion_ends_at || null
  };
}

function integerValue(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function moneyValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
}

function nullableText(value: unknown, maxLength: number) {
  const text = String(value || '').trim();
  return text ? text.slice(0, maxLength) : null;
}

function nullableIsoDate(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
