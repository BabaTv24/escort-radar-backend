import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { getOrCreateWalletForUser } from '../services/tokenWallet.js';
import { config } from '../config.js';
import { addBcuFavorite } from '../services/bcuFavorites.js';
import { bcuToBc, getBcuWalletForUser } from '../services/bcuWallet.js';

export const favoritesRouter = Router();

const FAVORITE_TOKEN_COST = 1;

favoritesRouter.use(verifyUser);

favoritesRouter.get('/', asyncHandler(async (req, res) => {
  const wallet = config.bcuWalletEnabled ? serializeBcuFavoriteWallet(await getBcuWalletForUser(req.user!.id)) : await getOrCreateWallet(req.user!.id);
  const { data, error } = await supabaseAdmin
    .from('client_favorites')
    .select('*, profiles(*, profile_images(*), profile_tags(tag_id, tags(*)))')
    .eq('client_id', req.user!.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    favorites: (data || []).map((row) => ({
      id: row.id,
      profile_id: row.profile_id,
      created_at: row.created_at,
      profile: row.profiles
    })),
    wallet
  });
}));

favoritesRouter.post('/:profileId', asyncHandler(async (req, res) => {
  const profileId = optionalText(req.params.profileId, 80);
  if (!profileId || !isUuid(profileId)) return res.status(400).json({ error: 'Invalid profile ID', code: 'PROFILE_NOT_FOUND' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id')
    .eq('id', profileId)
    .maybeSingle();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

  if (config.bcuWalletEnabled) {
    try {
      const result = await addBcuFavorite(req.user!.id, profileId);
      return res.status(201).json({
        favorite: true,
        charged: result.charged,
        amount_bcu: result.amount_bcu,
        amount_bc: bcuToBc(result.amount_bcu),
        recipient: { profile_id: result.profile_id, credited: result.recipient_credited }
      });
    } catch (error) {
      const code = favoriteDomainCode(error);
      const status = code === 'INSUFFICIENT_BCU' ? 402 : code === 'PROFILE_NOT_FOUND' ? 404 : code === 'FAVORITE_CONFIGURATION_ERROR' ? 503 : 403;
      return res.status(status).json({ error: favoriteDomainMessage(code), code });
    }
  }

  const adminOrOwner = isAdmin(req.user?.app_metadata) || profile.user_id === req.user!.id;
  if (adminOrOwner) {
    const { data: favorite, error } = await supabaseAdmin
      .from('client_favorites')
      .upsert({ client_id: req.user!.id, profile_id: profileId }, { onConflict: 'client_id,profile_id' })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    const wallet = await getOrCreateWallet(req.user!.id);
    return res.status(201).json({ favorite, wallet, already_favorited: false, charged: 0 });
  }

  const activation = await getClientActivationSummary(req.user!.id);
  if (activation.state !== 'client_activated') return res.status(403).json({ error: 'Client activation required' });

  const { data: result, error } = await supabaseAdmin.rpc('add_client_favorite_with_token', {
    p_client_id: req.user!.id,
    p_profile_id: profileId,
    p_cost: FAVORITE_TOKEN_COST
  });
  if (error) {
    if (String(error.message || '').includes('NOT_ENOUGH_TOKENS')) {
      return res.status(402).json({ error: 'Not enough tokens', code: 'NOT_ENOUGH_TOKENS' });
    }
    return res.status(400).json({ error: error.message });
  }

  const wallet = await getOrCreateWallet(req.user!.id);
  const { data: favorite } = await supabaseAdmin
    .from('client_favorites')
    .select('*')
    .eq('client_id', req.user!.id)
    .eq('profile_id', profileId)
    .maybeSingle();

  res.status(201).json({
    favorite,
    wallet,
    already_favorited: Boolean(result?.already_favorited),
    already_exists: Boolean(result?.already_favorited),
    charged: Number(result?.charged || 0),
    new_balance: Number(result?.new_balance ?? result?.wallet_balance ?? wallet?.escort_token_balance ?? 0)
  });
}));

favoritesRouter.delete('/:profileId', asyncHandler(async (req, res) => {
  const profileId = optionalText(req.params.profileId, 80);
  if (!profileId) return res.status(400).json({ error: 'profile_id is required' });
  const { error } = await supabaseAdmin
    .from('client_favorites')
    .delete()
    .eq('client_id', req.user!.id)
    .eq('profile_id', profileId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true, wallet: config.bcuWalletEnabled ? serializeBcuFavoriteWallet(await getBcuWalletForUser(req.user!.id)) : await getOrCreateWallet(req.user!.id) });
}));

async function getOrCreateWallet(userId: string) {
  return getOrCreateWalletForUser(userId);
}

function isAdmin(metadata: Record<string, unknown> | undefined) {
  const role = String(metadata?.role || metadata?.auth_account_type || '').toLowerCase();
  return role === 'admin' || role === 'moderator';
}

const favoriteCodes = ['PREMIUM_REQUIRED', 'INSUFFICIENT_BCU', 'PROFILE_NOT_FOUND', 'FAVORITE_RECIPIENT_NOT_AVAILABLE', 'SELF_FAVORITE_NOT_ALLOWED', 'WALLET_FROZEN', 'BCU_WALLET_NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'FAVORITE_CONFIGURATION_ERROR'] as const;
type FavoriteCode = typeof favoriteCodes[number];

function favoriteDomainCode(error: unknown): FavoriteCode {
  const message = String((error as { message?: string })?.message || error || '');
  if (message.includes('BCU_FAVORITE_PRODUCT_INVALID')) return 'FAVORITE_CONFIGURATION_ERROR';
  return favoriteCodes.find((code) => message.includes(code)) || 'FAVORITE_CONFIGURATION_ERROR';
}

function favoriteDomainMessage(code: FavoriteCode) {
  return ({
    PREMIUM_REQUIRED: 'Active Client Premium is required', INSUFFICIENT_BCU: 'Insufficient BC balance',
    PROFILE_NOT_FOUND: 'Profile not found', FAVORITE_RECIPIENT_NOT_AVAILABLE: 'Profile cannot receive a favorite gift',
    SELF_FAVORITE_NOT_ALLOWED: 'You cannot add your own profile', WALLET_FROZEN: 'Wallet is frozen',
    BCU_WALLET_NOT_FOUND: 'Premium wallet is not available',
    IDEMPOTENCY_CONFLICT: 'Favorite request conflict', FAVORITE_CONFIGURATION_ERROR: 'Favorites are temporarily unavailable'
  } as const)[code];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function serializeBcuFavoriteWallet(wallet: Awaited<ReturnType<typeof getBcuWalletForUser>>) {
  if (!wallet) return null;
  return { balance_bcu: wallet.balance_bcu, balance_bc: bcuToBc(wallet.balance_bcu), frozen: wallet.frozen };
}
