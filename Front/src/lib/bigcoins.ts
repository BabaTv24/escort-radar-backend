export const BIGCOIN_EUR_RATE = 0.15;
export const BIGCOIN_EUR_CENTS = 15;

export const MICRO_BC_PER_BC = 1_000_000;

export const ADVERTISER_30_DAYS_EUR_CENTS = 4_999;
export const BUSINESS_30_DAYS_EUR_CENTS = 49_900;

export const ADVERTISER_30_DAYS_MICRO_BC = 333_266_666;
export const BUSINESS_30_DAYS_MICRO_BC = 3_326_666_666;

export function formatBigCoinsFromMicro(microBc: number): string {
  return (microBc / MICRO_BC_PER_BC).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });
}

export function eurCentsToMicroBc(eurCents: number): number {
  return Math.trunc((eurCents * MICRO_BC_PER_BC) / BIGCOIN_EUR_CENTS);
}
