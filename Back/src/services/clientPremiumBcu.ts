import { supabaseAdmin } from '../supabase.js';
import {
  runClientPremiumBcuActivation,
  type ClientPremiumBcuResult
} from './clientPremiumBcuFlow.js';

export {
  CLIENT_PREMIUM_BONUS_BCU,
  CLIENT_PREMIUM_REFERRAL_BCU,
  runClientPremiumBcuActivation,
  selectClientPremiumWalletFlow
} from './clientPremiumBcuFlow.js';

export async function activateClientPremiumBcu(userId: string, activationId: string, referredByCode: string | null) {
  return runClientPremiumBcuActivation({ userId, activationId, referredByCode }, {
    async activatePremium(input) {
      const { data, error } = await supabaseAdmin.rpc('activate_client_premium_bcu', {
        p_user_id: input.userId,
        p_activation_id: input.activationId,
        p_referred_by_code: input.referredByCode
      });
      if (error) throw error;
      return data as ClientPremiumBcuResult;
    }
  });
}
