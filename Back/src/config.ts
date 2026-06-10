import dotenv from 'dotenv';

dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

type Config = {
  port: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseAnonKey: string;
  frontendUrl: string;
  nodeEnv: string;
  adminEmails: string[];
  storageBucket: string;
  stripeSecretKey: string;
  appUrl: string;
  clientActivationPriceCents: number;
  clientActivationWelcomeCoins: number;
  clientReferralRewardCoins: number;
};

function envNumber(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

export const config: Config = {
  port: Number(process.env.PORT || 4000),
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'profile-images',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  appUrl: process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  clientActivationPriceCents: envNumber('CLIENT_ACTIVATION_PRICE_CENTS', 99),
  clientActivationWelcomeCoins: envNumber('CLIENT_ACTIVATION_WELCOME_COINS', 100),
  clientReferralRewardCoins: envNumber('CLIENT_REFERRAL_REWARD_COINS', 25)
};
