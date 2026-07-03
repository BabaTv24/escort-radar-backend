import { supabaseAdmin } from '../supabase.js';

export async function getOrCreateWalletForUser(userId: string) {
  const existing = await findCanonicalWalletForUser(userId);
  if (existing) return existing;

  const publicWalletId = `ERW-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .upsert({ user_id: userId, public_wallet_id: publicWalletId }, { onConflict: 'user_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();

  if (error && error.code !== '23505') throw error;
  if (data) return data;

  const wallet = await findCanonicalWalletForUser(userId);
  if (!wallet) throw new Error('Token wallet could not be created');
  return wallet;
}

async function findCanonicalWalletForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('escort_token_balance', { ascending: false })
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
