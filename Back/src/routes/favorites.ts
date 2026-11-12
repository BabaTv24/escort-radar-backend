import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { getOrCreateWalletForUser } from '../services/tokenWallet.js';
import { config } from '../config.js';
import { isPublicProfile } from '../publicProfiles.js';
import { isActivePublicCategory } from '../categories.js';
import { bcuToBc, getBcuWalletForUser } from '../services/bcuWallet.js';
import { notifyUser } from '../services/inAppNotifications.js';

export const favoritesRouter = Router();

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
    .select('id, user_id, status, is_published, moderation_status, shadowbanned, category')
    .eq('id', profileId)
    .maybeSingle();
  if (!profile || !isPublicProfile(profile) || !isActivePublicCategory(profile.category)) {
    return res.status(404).json({ error: 'Profile not found', code: 'PROFILE_NOT_FOUND' });
  }
  if (profile.user_id === req.user!.id) return res.status(400).json({ error: 'You cannot add your own profile', code: 'SELF_FAVORITE_NOT_ALLOWED' });

  // Business contract V1: saving a favorite is free for activated Premium clients. It never moves BC;
  // voluntary gifts are a separate operation (/api/gifts).
  if (!isAdmin(req.user?.app_metadata)) {
    const activation = await getClientActivationSummary(req.user!.id);
    if (activation.state !== 'client_activated') {
      return res.status(403).json({ error: 'Active Client Premium is required', code: 'PREMIUM_REQUIRED' });
    }
  }

  const { data: existingFavorite } = await supabaseAdmin
    .from('client_favorites')
    .select('id')
    .eq('client_id', req.user!.id)
    .eq('profile_id', profileId)
    .maybeSingle();
  let created = false;
  if (!existingFavorite) {
    // The unique (client_id, profile_id) index settles concurrent saves: only one insert wins.
    const { error } = await supabaseAdmin.from('client_favorites').insert({ client_id: req.user!.id, profile_id: profileId });
    if (error && error.code !== '23505') return res.status(400).json({ error: error.message });
    created = !error;
  }
  // A new admirer is announced to the owner once per relationship; the client stays anonymous.
  if (created) {
    await notifyUser({
      userId: profile.user_id,
      recipientType: 'advertiser',
      eventType: 'favorite_received',
      title: 'New admirer',
      body: 'A client saved your profile',
      profileId
    });
  }
  const wallet = config.bcuWalletEnabled ? serializeBcuFavoriteWallet(await getBcuWalletForUser(req.user!.id)) : await getOrCreateWallet(req.user!.id);
  return res.status(201).json({
    favorite: true,
    already_favorited: !created,
    already_exists: !created,
    charged: false,
    amount_bcu: '0',
    amount_bc: '0',
    wallet
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function serializeBcuFavoriteWallet(wallet: Awaited<ReturnType<typeof getBcuWalletForUser>>) {
  if (!wallet) return null;
  return { balance_bcu: wallet.balance_bcu, balance_bc: bcuToBc(wallet.balance_bcu), frozen: wallet.frozen };
}
