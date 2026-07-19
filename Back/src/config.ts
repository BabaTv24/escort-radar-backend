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
  adminEmail: string;
  adminPassword: string;
  admin2faSecret: string;
  adminHardDeletePin: string;
  adminEmails: string[];
  jwtSecret: string;
  sessionSecret: string;
  storageBucket: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeEnabled: boolean;
  stripeEscortRadarEnabled: boolean;
  stripePriceIds: {
    clientActivation: string;
    escortMonthly: string;
    businessMonthly: string;
    coins100: string;
    coins250: string;
    coins600: string;
    coins1500: string;
  };
  appUrl: string;
  clientActivationPriceCents: number;
  clientActivationWelcomeCoins: number;
  clientReferralRewardCoins: number;
  supportEmail: string;
  legalOperatorName: string;
  legalOperatorAddress: string;
  legalResponsiblePerson: string;
  legalVatId: string;
  paymentDefaultProvider: string;
  ccbillEnabled: boolean;
  paysafeEnabled: boolean;
  manualBankTransferEnabled: boolean;
  manualBankTransferRecipient: string;
  manualBankTransferIban: string;
  manualBankTransferBic: string;
  manualBankTransferBankName: string;
  manualBankTransferReferenceTemplate: string;
  manualCryptoEnabled: boolean;
  bcuWalletEnabled: boolean;
  hermesAnalyzeProfileUrl: string;
  hermesWebhookSecret: string;
  openAiApiKey: string;
  openAiProfileAgentModel: string;
};

function envNumber(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function optionalEnvNumber(value: string | undefined) {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolveClientActivationWelcomeCoins(env: NodeJS.ProcessEnv = process.env) {
  return optionalEnvNumber(env.CLIENT_ACTIVATION_WELCOME_COINS)
    ?? optionalEnvNumber(env.CLIENT_ACTIVATION_TOKEN_BONUS)
    ?? 7;
}

export function resolveClientReferralRewardCoins(env: NodeJS.ProcessEnv = process.env) {
  return optionalEnvNumber(env.CLIENT_REFERRAL_REWARD_COINS) ?? 10;
}

function envBoolean(key: string, fallback: boolean) {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export const CLIENT_ACTIVATION_WELCOME_COINS = resolveClientActivationWelcomeCoins();
export const CLIENT_ACTIVATION_TOKEN_BONUS = CLIENT_ACTIVATION_WELCOME_COINS;

export const config: Config = {
  port: Number(process.env.PORT || 4000),
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY!,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  admin2faSecret: process.env.ADMIN_2FA_SECRET || '',
  adminHardDeletePin: process.env.ADMIN_HARD_DELETE_PIN || '',
  adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'profile-images',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeEnabled: envBoolean('STRIPE_ENABLED', false),
  stripeEscortRadarEnabled: envBoolean('STRIPE_ESCORT_RADAR_ENABLED', false),
  stripePriceIds: {
    clientActivation: process.env.STRIPE_CLIENT_ACTIVATION_PRICE_ID || '',
    escortMonthly: process.env.STRIPE_ESCORT_MONTHLY_PRICE_ID || '',
    businessMonthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || '',
    coins100: process.env.STRIPE_COINS_100_PRICE_ID || '',
    coins250: process.env.STRIPE_COINS_250_PRICE_ID || '',
    coins600: process.env.STRIPE_COINS_600_PRICE_ID || '',
    coins1500: process.env.STRIPE_COINS_1500_PRICE_ID || ''
  },
  appUrl: process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173',
  clientActivationPriceCents: envNumber('CLIENT_ACTIVATION_PRICE_CENTS', 99),
  clientActivationWelcomeCoins: CLIENT_ACTIVATION_WELCOME_COINS,
  clientReferralRewardCoins: resolveClientReferralRewardCoins(),
  supportEmail: process.env.SUPPORT_EMAIL || 'support@escort-radar.fun',
  legalOperatorName: process.env.LEGAL_OPERATOR_NAME || '',
  legalOperatorAddress: process.env.LEGAL_OPERATOR_ADDRESS || '',
  legalResponsiblePerson: process.env.LEGAL_RESPONSIBLE_PERSON || '',
  legalVatId: process.env.LEGAL_VAT_ID || '',
  paymentDefaultProvider: process.env.PAYMENT_DEFAULT_PROVIDER || 'manual',
  ccbillEnabled: envBoolean('CCBILL_ENABLED', false),
  paysafeEnabled: envBoolean('PAYSAFE_ENABLED', false),
  manualBankTransferEnabled: envBoolean('MANUAL_BANK_TRANSFER_ENABLED', true),
  manualBankTransferRecipient: process.env.MANUAL_BANK_TRANSFER_RECIPIENT || '',
  manualBankTransferIban: process.env.MANUAL_BANK_TRANSFER_IBAN || '',
  manualBankTransferBic: process.env.MANUAL_BANK_TRANSFER_BIC || '',
  manualBankTransferBankName: process.env.MANUAL_BANK_TRANSFER_BANK_NAME || '',
  manualBankTransferReferenceTemplate: process.env.MANUAL_BANK_TRANSFER_REFERENCE_TEMPLATE || 'ER-{orderId}-{userEmail}',
  manualCryptoEnabled: envBoolean('MANUAL_CRYPTO_ENABLED', true),
  bcuWalletEnabled: envBoolean('BCU_WALLET_ENABLED', false),
  hermesAnalyzeProfileUrl: process.env.HERMES_ANALYZE_PROFILE_URL || '',
  hermesWebhookSecret: process.env.HERMES_WEBHOOK_SECRET || '',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiProfileAgentModel: process.env.OPENAI_PROFILE_AGENT_MODEL || 'gpt-5.6-luna'
};
