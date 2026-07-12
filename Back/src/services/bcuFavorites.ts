import { supabaseAdmin } from '../supabase.js';

export type BcuFavoriteResult = {
  favorite: true;
  charged: boolean;
  amount_bcu: string;
  profile_id: string;
  recipient_credited: boolean;
};

export async function addBcuFavorite(userId: string, profileId: string): Promise<BcuFavoriteResult> {
  const { data, error } = await supabaseAdmin.rpc('add_bcu_favorite_with_transfer', {
    p_client_user_id: userId,
    p_profile_id: profileId,
    p_idempotency_key: `favorite:${userId}:${profileId}`
  });
  if (error) throw error;
  return data as BcuFavoriteResult;
}
