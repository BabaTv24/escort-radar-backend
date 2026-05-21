import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';

export const tokensRouter = Router();

const defaultPackages = [
  { name: 'Starter', token_amount: 120, eur_price: 18, bonus_tokens: 0, featured: false },
  { name: 'Radar', token_amount: 520, eur_price: 78, bonus_tokens: 20, featured: false },
  { name: 'Premium', token_amount: 1200, eur_price: 180, bonus_tokens: 80, featured: false },
  { name: 'Spotlight', token_amount: 2560, eur_price: 384, bonus_tokens: 260, featured: true },
  { name: 'Elite', token_amount: 5200, eur_price: 780, bonus_tokens: 700, featured: false },
  { name: 'Black Card', token_amount: 10200, eur_price: 1530, bonus_tokens: 1800, featured: false }
];

tokensRouter.get('/packages', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('token_packages')
    .select('*')
    .eq('active', true)
    .order('token_amount', { ascending: true });

  if (error) return res.json({ packages: defaultPackages });
  res.json({ packages: data?.length ? data : defaultPackages });
}));

tokensRouter.get('/wallet/me', verifyUser, asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(req.user!.id);
  res.json({ wallet });
}));

tokensRouter.post('/purchase-intent', verifyUser, asyncHandler(async (req, res) => {
  const packageId = String(req.body.package_id || '');
  const { data: tokenPackage } = packageId
    ? await supabaseAdmin.from('token_packages').select('*').eq('id', packageId).single()
    : { data: null };

  res.status(201).json({
    status: 'coming_soon',
    package: tokenPackage,
    message: 'Token package checkout is prepared as a closed marketplace credit flow.'
  });
}));

tokensRouter.post('/unlock', verifyUser, asyncHandler(async (req, res) => {
  const unlockType = String(req.body.unlock_type || '');
  const targetProfileId = String(req.body.target_profile_id || '');
  const tokenCost = Number(req.body.token_cost || 0);
  if (!unlockType || !targetProfileId || !Number.isFinite(tokenCost) || tokenCost <= 0) {
    return res.status(400).json({ error: 'unlock_type, target_profile_id and token_cost are required' });
  }

  const wallet = await getOrCreateWallet(req.user!.id);
  if (Number(wallet.escort_token_balance || 0) < tokenCost) return res.status(400).json({ error: 'Insufficient Escort Token balance' });

  const { data: unlock, error } = await supabaseAdmin
    .from('premium_unlocks')
    .insert({
      user_id: req.user!.id,
      target_profile_id: targetProfileId,
      unlock_type: unlockType,
      token_cost: tokenCost,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  await supabaseAdmin.from('wallets').update({ escort_token_balance: Number(wallet.escort_token_balance || 0) - tokenCost }).eq('id', wallet.id);
  await supabaseAdmin.from('token_transactions').insert({
    from_wallet_id: wallet.id,
    amount: tokenCost,
    transaction_type: unlockType,
    status: 'completed',
    metadata: { target_profile_id: targetProfileId }
  });

  res.status(201).json({ unlock });
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
