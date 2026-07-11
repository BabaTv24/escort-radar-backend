export const CLIENT_PREMIUM_BONUS_BCU = '70000';
export const CLIENT_PREMIUM_REFERRAL_BCU = '100000';

export type ClientPremiumBcuResult = {
  wallet: {
    public_wallet_id: string;
    balance_bcu: string;
    lifetime_credit_bcu: string;
    lifetime_debit_bcu: string;
    frozen: boolean;
    created_at: string;
    updated_at: string;
  };
  bonus: {
    amount_bcu: string;
    direction: 'credit';
    transaction_type: string;
    status: string;
    created_at: string;
  };
  entitlement: {
    entitlement_type: 'client_premium';
    status: 'active';
    starts_at: string;
    ends_at: null;
    product_code: string;
  };
  referral_granted: boolean;
};

type PremiumBcuDependencies = {
  activatePremium(input: { userId: string; activationId: string; referredByCode: string | null }): Promise<ClientPremiumBcuResult>;
};

export function selectClientPremiumWalletFlow(enabled: boolean): 'bcu' | 'legacy' {
  return enabled ? 'bcu' : 'legacy';
}

export async function runClientPremiumBcuActivation(input: {
  userId: string;
  activationId: string;
  referredByCode: string | null;
}, dependencies: PremiumBcuDependencies) {
  const result = await dependencies.activatePremium(input);
  if (result.bonus.amount_bcu !== CLIENT_PREMIUM_BONUS_BCU) throw new Error('BCU premium bonus amount mismatch');
  if (result.bonus.direction !== 'credit') throw new Error('BCU premium bonus direction mismatch');
  if (result.entitlement.entitlement_type !== 'client_premium' || result.entitlement.status !== 'active') {
    throw new Error('BCU Client Premium entitlement mismatch');
  }
  return result;
}
