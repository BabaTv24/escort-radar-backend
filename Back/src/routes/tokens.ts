import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { manualPaymentProducts } from '../manualPayments.js';

export const tokensRouter = Router();

const defaultPackages = manualPaymentProducts.filter((product) => product.purpose === 'token_package').map((tokenPackage, index) => ({
  id: tokenPackage.id,
  name: tokenPackage.label,
  token_amount: tokenPackage.tokens || 0,
  eur_price: tokenPackage.amount_cents / 100,
  bonus_tokens: 0,
  featured: index === 2 || tokenPackage.id === 'tokens_1200',
  active: true
}));

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

  const selectedPackage = tokenPackage || defaultPackages[0];
  const wallet = await getOrCreateWallet(req.user!.id);
  const { data: purchaseRequest, error } = await supabaseAdmin
    .from('token_purchase_requests')
    .insert({
      user_id: req.user!.id,
      wallet_id: wallet.id,
      package_id: tokenPackage?.id || null,
      token_amount: selectedPackage.token_amount,
      eur_price: selectedPackage.eur_price,
      bonus_tokens: selectedPackage.bonus_tokens,
      status: 'pending'
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json({
    status: 'pending',
    purchase_request: purchaseRequest,
    package: selectedPackage,
    message: 'Token package request is pending manual marketplace approval.'
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
