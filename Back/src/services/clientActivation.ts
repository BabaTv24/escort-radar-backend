import { config } from '../config.js';
import { supabaseAdmin } from '../supabase.js';

export type ClientActivationSummary = {
  state: 'client_free' | 'client_activated';
  referral_code: string | null;
  referral_link: string | null;
  qr_image_url: string | null;
  activated_at: string | null;
  clicks: number;
  registrations: number;
  activations: number;
  earned_rewards: number;
};

export async function getClientActivationSummary(userId: string): Promise<ClientActivationSummary> {
  const [{ data: activation }, { data: referral }] = await Promise.all([
    supabaseAdmin.from('client_activations').select('*').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('client_referrals').select('*').eq('user_id', userId).maybeSingle()
  ]);

  return {
    state: activation?.state === 'client_activated' ? 'client_activated' : 'client_free',
    referral_code: referral?.referral_code || null,
    referral_link: referral?.referral_link || null,
    qr_image_url: await getQrImageUrl(userId, referral?.referral_code || null),
    activated_at: activation?.activated_at || null,
    clicks: Number(referral?.click_count || 0),
    registrations: Number(referral?.registration_count || 0),
    activations: Number(referral?.activation_count || 0),
    earned_rewards: Number(referral?.earned_coins || 0)
  };
}

export async function recordClientRegistrationAttribution(userId: string) {
  const referredByCode = await getStoredReferredByCode(userId);
  if (!referredByCode) return;

  const { data: referrer } = await supabaseAdmin
    .from('client_referrals')
    .select('*')
    .eq('referral_code', referredByCode)
    .maybeSingle();
  if (!referrer || referrer.user_id === userId) return;

  const { data: existingMarker } = await supabaseAdmin
    .from('client_rewards')
    .select('id')
    .eq('user_id', referrer.user_id)
    .eq('referred_user_id', userId)
    .eq('reward_type', 'client_registration_referral')
    .maybeSingle();
  if (existingMarker) return;

  await supabaseAdmin.from('client_rewards').insert({
    user_id: referrer.user_id,
    referral_id: referrer.id,
    referred_user_id: userId,
    reward_type: 'client_registration_referral',
    coins: 0,
    status: 'granted',
    metadata: { referral_code: referredByCode }
  });
  await supabaseAdmin
    .from('client_referrals')
    .update({
      registration_count: Number(referrer.registration_count || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', referrer.id);
}

export async function activateClientAccount(userId: string, payment: {
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  referred_by_code?: string | null;
} = {}) {
  const referralCode = await getOrCreateReferralCode(userId);
  const referralLink = `${getPublicFrontendUrl()}/r/${encodeURIComponent(referralCode)}`;
  const qrImageUrl = getQrServiceUrl(referralLink);
  const referredByCode = payment.referred_by_code || await getStoredReferredByCode(userId);

  const { data: activation, error: activationError } = await supabaseAdmin
    .from('client_activations')
    .upsert({
      user_id: userId,
      state: 'client_activated',
      stripe_checkout_session_id: payment.stripe_checkout_session_id || null,
      stripe_payment_intent_id: payment.stripe_payment_intent_id || null,
      amount_eur: config.clientActivationPriceCents / 100,
      currency: 'EUR',
      activated_at: new Date().toISOString(),
      deactivated_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();
  if (activationError) throw activationError;

  const { data: referral, error: referralError } = await supabaseAdmin
    .from('client_referrals')
    .upsert({
      user_id: userId,
      referral_code: referralCode,
      referral_link: referralLink,
      referred_by_code: referredByCode || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();
  if (referralError) throw referralError;

  await supabaseAdmin
    .from('qr_codes')
    .upsert({
      user_id: userId,
      referral_code: referralCode,
      qr_payload: referralLink,
      qr_image_url: qrImageUrl,
      updated_at: new Date().toISOString()
    }, { onConflict: 'referral_code' });

  const wallet = await getOrCreateCoinWallet(userId);
  await grantCoins(wallet.id, userId, config.clientActivationWelcomeCoins, 'welcome_bonus', {
    activation_id: activation.id,
    stripe_checkout_session_id: payment.stripe_checkout_session_id || null
  });

  await applyReferralReward(userId, referredByCode);
  await syncClientAppMetadata(userId, 'client_activated', referralCode);

  return { activation, referral, wallet };
}

export async function deactivateClientAccount(userId: string) {
  await supabaseAdmin
    .from('client_activations')
    .upsert({
      user_id: userId,
      state: 'client_free',
      deactivated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  await syncClientAppMetadata(userId, 'client_free');
}

export async function getOrCreateCoinWallet(userId: string) {
  const { data: existing } = await supabaseAdmin.from('coin_wallets').select('*').eq('user_id', userId).maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from('coin_wallets')
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function grantCoins(walletId: string, userId: string, amount: number, transactionType: string, metadata: Record<string, unknown> = {}, adminEmail?: string) {
  const { data: existing } = await supabaseAdmin
    .from('coin_transactions')
    .select('id')
    .eq('wallet_id', walletId)
    .eq('transaction_type', transactionType)
    .contains('metadata', metadata)
    .maybeSingle();
  if (existing && transactionType === 'welcome_bonus') return;

  const { data: wallet, error: walletError } = await supabaseAdmin.from('coin_wallets').select('*').eq('id', walletId).single();
  if (walletError || !wallet) throw walletError || new Error('Coin wallet not found');

  const nextBalance = Number(wallet.balance || 0) + amount;
  if (nextBalance < 0) throw new Error('Insufficient coin balance');

  const direction = amount >= 0 ? 'credit' : 'debit';
  const absAmount = Math.abs(amount);
  const { error: updateError } = await supabaseAdmin
    .from('coin_wallets')
    .update({
      balance: nextBalance,
      lifetime_earned: direction === 'credit' ? Number(wallet.lifetime_earned || 0) + absAmount : wallet.lifetime_earned,
      lifetime_spent: direction === 'debit' ? Number(wallet.lifetime_spent || 0) + absAmount : wallet.lifetime_spent,
      updated_at: new Date().toISOString()
    })
    .eq('id', walletId);
  if (updateError) throw updateError;

  const { error: txError } = await supabaseAdmin.from('coin_transactions').insert({
    wallet_id: walletId,
    user_id: userId,
    amount: absAmount,
    direction,
    transaction_type: transactionType,
    status: 'completed',
    admin_email: adminEmail || null,
    metadata
  });
  if (txError) throw txError;
}

async function applyReferralReward(activatedUserId: string, referredByCode: string | null) {
  if (!referredByCode) return;
  const { data: referrer } = await supabaseAdmin
    .from('client_referrals')
    .select('*')
    .eq('referral_code', referredByCode)
    .maybeSingle();
  if (!referrer || referrer.user_id === activatedUserId) return;

  const { data: existingReward } = await supabaseAdmin
    .from('client_rewards')
    .select('id')
    .eq('user_id', referrer.user_id)
    .eq('referred_user_id', activatedUserId)
    .eq('reward_type', 'client_activation_referral')
    .maybeSingle();
  if (existingReward) return;

  const wallet = await getOrCreateCoinWallet(referrer.user_id);
  await grantCoins(wallet.id, referrer.user_id, config.clientReferralRewardCoins, 'referral_activation_reward', {
    referred_user_id: activatedUserId,
    referral_code: referredByCode
  });
  await supabaseAdmin.from('client_rewards').insert({
    user_id: referrer.user_id,
    referral_id: referrer.id,
    referred_user_id: activatedUserId,
    reward_type: 'client_activation_referral',
    coins: config.clientReferralRewardCoins,
    status: 'granted',
    metadata: { referral_code: referredByCode }
  });
  await supabaseAdmin
    .from('client_referrals')
    .update({
      activation_count: Number(referrer.activation_count || 0) + 1,
      earned_coins: Number(referrer.earned_coins || 0) + config.clientReferralRewardCoins,
      updated_at: new Date().toISOString()
    })
    .eq('id', referrer.id);
}

async function getStoredReferredByCode(userId: string) {
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  const metadata = authUser.user?.user_metadata as Record<string, unknown> | undefined;
  return String(metadata?.referred_by_code || metadata?.referral_code || '').trim() || null;
}

async function getOrCreateReferralCode(userId: string) {
  const { data: existing } = await supabaseAdmin.from('client_referrals').select('referral_code').eq('user_id', userId).maybeSingle();
  if (existing?.referral_code) return existing.referral_code;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = `ER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data } = await supabaseAdmin.from('client_referrals').select('id').eq('referral_code', code).maybeSingle();
    if (!data) return code;
  }
  return `ER-${Date.now().toString(36).toUpperCase()}`;
}

async function getQrImageUrl(userId: string, referralCode: string | null) {
  if (!referralCode) return null;
  const { data } = await supabaseAdmin.from('qr_codes').select('qr_image_url').eq('user_id', userId).eq('referral_code', referralCode).maybeSingle();
  return data?.qr_image_url || getQrServiceUrl(`${getPublicFrontendUrl()}/r/${encodeURIComponent(referralCode)}`);
}

function getQrServiceUrl(value: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(value)}`;
}

function getPublicFrontendUrl() {
  const configuredUrl = config.frontendUrl || config.appUrl || 'https://escort-radar.fun';
  if (configuredUrl.includes('localhost') || configuredUrl.includes('onrender')) return 'https://escort-radar.fun';
  return configuredUrl.replace(/\/$/, '');
}

async function syncClientAppMetadata(userId: string, state: 'client_free' | 'client_activated', referralCode?: string) {
  const { data: authUser, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !authUser.user) return;
  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...authUser.user.app_metadata,
      auth_account_type: authUser.user.app_metadata?.auth_account_type || 'client',
      client_state: state,
      client_activation_state: state,
      ...(referralCode ? { referral_code: referralCode } : {})
    }
  });
}
