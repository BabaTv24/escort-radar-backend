import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';
import { getClientActivationSummary } from '../services/clientActivation.js';

export const favoritesRouter = Router();

const FAVORITE_TOKEN_COST = 1;

favoritesRouter.use(verifyUser);

favoritesRouter.get('/', asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user!.id);
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
  if (!profileId) return res.status(400).json({ error: 'profile_id is required' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id')
    .eq('id', profileId)
    .maybeSingle();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });

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
    charged: Number(result?.charged || 0)
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
  res.json({ ok: true, wallet: await getOrCreateWallet(req.user!.id) });
}));

async function getOrCreateWallet(userId: string) {
  const { data } = await supabaseAdmin.from('wallets').select('*').eq('user_id', userId).maybeSingle();
  if (data) return data;
  const { data: wallet, error } = await supabaseAdmin
    .from('wallets')
    .insert({ user_id: userId, public_wallet_id: `ERW-${crypto.randomUUID().slice(0, 8).toUpperCase()}` })
    .select()
    .single();
  if (error) throw error;
  return wallet;
}

function isAdmin(metadata: Record<string, unknown> | undefined) {
  const role = String(metadata?.role || metadata?.auth_account_type || '').toLowerCase();
  return role === 'admin' || role === 'moderator';
}
