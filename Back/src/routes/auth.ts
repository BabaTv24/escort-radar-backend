import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { recordClientRegistrationAttribution } from '../services/clientActivation.js';

const allowedAuthAccountTypes = ['client', 'escort', 'business'] as const;
const allowedIdentities = ['male', 'female', 'trans'] as const;

export const authRouter = Router();

authRouter.get('/me', verifyUser, asyncHandler(async (req, res) => {
  const appMetadata = req.user?.app_metadata || {};
  const accountType = await resolveAuthAccountType(req.user!.id, appMetadata);
  const role = appMetadata.role === 'admin' ? 'admin' : accountType;
  const { data: clientProfile } = await supabaseAdmin
    .from('client_profiles')
    .select('*')
    .eq('user_id', req.user!.id)
    .maybeSingle();

  res.json({
    user: {
      id: req.user!.id,
      email: req.user?.email,
      auth_account_type: accountType,
      role,
      app_metadata: {
        auth_account_type: accountType,
        role: appMetadata.role,
        admin: appMetadata.admin === true,
        plan: appMetadata.plan,
        subscription_status: appMetadata.subscription_status,
        client_state: appMetadata.client_state || appMetadata.client_activation_state
      }
    },
    client_profile: clientProfile || null
  });
}));

authRouter.patch('/client-profile', verifyUser, asyncHandler(async (req, res) => {
  const displayName = optionalString(req.body.display_name || req.body.nickname, 80);
  const city = optionalString(req.body.city, 80) || 'berlin';

  const { data, error } = await supabaseAdmin
    .from('client_profiles')
    .upsert({
      user_id: req.user!.id,
      display_name: displayName,
      city,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ client_profile: data });
}));

authRouter.post('/register', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const username = optionalString(req.body.username, 80);
  const authAccountType = normalizeAuthAccountType(req.body.auth_account_type) || 'client';
  const identity = allowedIdentities.includes(String(req.body.identity) as typeof allowedIdentities[number])
    ? String(req.body.identity)
    : undefined;
  const referredByCode = optionalString(req.body.referred_by_code, 80);

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      identity,
      referred_by_code: referredByCode
    },
    app_metadata: {
      auth_account_type: authAccountType,
      subscription_status: 'free',
      ...(authAccountType === 'client' ? { client_state: 'client_free', client_activation_state: 'client_free' } : {})
    }
  });

  if (error || !data.user) return res.status(400).json({ error: error?.message || 'Registration failed' });
  if (authAccountType === 'client') await recordClientRegistrationAttribution(data.user.id);

  res.status(201).json({
    user: {
      id: data.user.id,
      email: data.user.email,
      auth_account_type: authAccountType
    }
  });
}));

async function resolveAuthAccountType(userId: string, appMetadata: Record<string, unknown>): Promise<'client' | 'escort' | 'business'> {
  const metadataType = normalizeAuthAccountType(appMetadata.auth_account_type);
  if (metadataType) return metadataType;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('account_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) return 'client';

  const inferredType = ['agency', 'massage_salon', 'club_party', 'live_cam'].includes(String(profile.account_type || ''))
    ? 'business'
    : 'escort';

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...appMetadata,
      auth_account_type: inferredType
    }
  });

  return inferredType;
}

function normalizeAuthAccountType(value: unknown): 'client' | 'escort' | 'business' | null {
  const nextValue = String(value || '');
  return allowedAuthAccountTypes.includes(nextValue as 'client' | 'escort' | 'business')
    ? nextValue as 'client' | 'escort' | 'business'
    : null;
}

function optionalString(value: unknown, maxLength: number) {
  const nextValue = String(value || '').trim();
  return nextValue ? nextValue.slice(0, maxLength) : undefined;
}
