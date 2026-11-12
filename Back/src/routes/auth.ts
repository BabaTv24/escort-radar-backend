import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin, supabaseAnon } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { config } from '../config.js';
import { recordClientRegistrationAttribution } from '../services/clientActivation.js';

const allowedAuthAccountTypes = ['client', 'escort', 'business'] as const;
const allowedIdentities = ['male', 'female', 'trans'] as const;
const emailConfirmationRedirectPath = '/login?confirmed=1';

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
  const requestedAccountType = optionalString(req.body.auth_account_type, 40);
  const authAccountType = normalizeAuthAccountType(requestedAccountType) || 'client';
  const identity = allowedIdentities.includes(String(req.body.identity) as typeof allowedIdentities[number])
    ? String(req.body.identity)
    : undefined;
  const referredByCode = optionalString(req.body.referred_by_code, 80);

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (requestedAccountType && !normalizeAuthAccountType(requestedAccountType)) {
    return res.status(400).json({ error: 'Unsupported account type' });
  }

  // Public sign up must go through the Supabase sign up flow with the anon key. It creates the
  // account as unconfirmed and sends the "Confirm signup" message over the configured SMTP.
  // admin.createUser would create a usable account without ever sending that message, which is
  // how the address ended up trusted without any proof that the person owns it.
  const { data, error } = await supabaseAnon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildEmailConfirmationRedirectUrl(),
      data: {
        username,
        identity,
        referred_by_code: referredByCode,
        // Recovery breadcrumb only. user_metadata is writable by the account owner, so nothing
        // may ever read this as an authority; app_metadata below stays the single source of truth.
        requested_auth_account_type: authAccountType
      }
    }
  });
  if (error || !data.user) {
    const status = error?.status && error.status >= 500 ? 502 : 400;
    return res.status(status).json({ error: error?.message || 'Registration failed' });
  }

  // GoTrue hides whether an address is already registered by answering with a user that carries
  // no identities. Stop here and answer exactly like a fresh sign up, otherwise the follow-up
  // calls below would fail on the placeholder id and turn the response into an account oracle.
  if (isObfuscatedExistingUser(data.user)) {
    return res.status(201).json(buildRegistrationResponse(email, authAccountType, true));
  }

  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: {
      auth_account_type: authAccountType,
      subscription_status: 'free',
      ...(authAccountType === 'client' ? { client_state: 'client_free', client_activation_state: 'client_free' } : {})
    }
  });

  if (metadataError) {
    console.error('Account metadata assignment failed after signup', { userId: data.user.id, status: metadataError.status });
    return res.status(503).json({ error: 'Account created; account setup is pending' });
  }

  const { error: referralError } = await supabaseAdmin.rpc('assign_referral', {
    p_user_id: data.user.id,
    p_referral_code: referredByCode || null,
    p_source: referredByCode ? 'referral_link' : 'direct'
  });
  if (referralError) {
    console.error('Referral assignment failed after signup; retrying root fallback', { userId: data.user.id, code: referralError.code });
    const { error: fallbackError } = await supabaseAdmin.rpc('assign_referral', {
      p_user_id: data.user.id, p_referral_code: null, p_source: 'direct'
    });
    if (fallbackError) {
      await supabaseAdmin.auth.admin.updateUserById(data.user.id, { app_metadata: { ...data.user.app_metadata, referral_pending: true } });
      return res.status(503).json({ error: 'Account created; referral assignment is pending' });
    }
  }
  if (authAccountType === 'client') await recordClientRegistrationAttribution(data.user.id);

  // No session, no access token and no user id leave this route. The account is unusable until
  // the confirmation link is opened, and the client must not be able to act as it before that.
  res.status(201).json(buildRegistrationResponse(email, authAccountType, !data.session));
}));

authRouter.post('/resend-confirmation', asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const { error } = await supabaseAnon.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: buildEmailConfirmationRedirectUrl() }
  });

  // Only throttling and a real transport failure are reported. Every other GoTrue error here
  // (address unknown, address already confirmed) is deliberately swallowed, because answering
  // differently for those cases would tell an attacker which addresses have accounts.
  if (error?.status === 429) {
    return res.status(429).json({ error: 'Too many confirmation requests', code: 'CONFIRMATION_RESEND_RATE_LIMITED' });
  }
  if (error?.status && error.status >= 500) {
    console.error('Confirmation email resend failed', { status: error.status });
    return res.status(502).json({ error: 'Confirmation email could not be sent', code: 'CONFIRMATION_EMAIL_SEND_FAILED' });
  }

  res.json({ success: true, requires_email_confirmation: true });
}));

function buildEmailConfirmationRedirectUrl() {
  return `${config.appUrl.replace(/\/+$/, '')}${emailConfirmationRedirectPath}`;
}

function isObfuscatedExistingUser(user: { identities?: unknown[] | null }) {
  return Array.isArray(user.identities) && user.identities.length === 0;
}

function buildRegistrationResponse(
  email: string,
  authAccountType: 'client' | 'escort' | 'business',
  requiresEmailConfirmation: boolean
) {
  return {
    success: true,
    requires_email_confirmation: requiresEmailConfirmation,
    email,
    auth_account_type: authAccountType
  };
}

// Ownership is read from user_id only. Matching an unowned profile by owner_email used to
// attach it to whoever signed up with that address, which is not proof of ownership.
// Admin linking and the tokenized sponsored claim are the only ways to attach an owner.
async function resolveAuthAccountType(userId: string, appMetadata: Record<string, unknown>): Promise<'client' | 'escort' | 'business'> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, account_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const metadataType = normalizeAuthAccountType(appMetadata.auth_account_type);
  if (!profile) return metadataType || 'client';

  const inferredType = ['business', 'agency', 'massage_salon', 'club_party', 'live_cam'].includes(String(profile.account_type || ''))
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

export function normalizeAuthAccountType(value: unknown): 'client' | 'escort' | 'business' | null {
  const nextValue = String(value || '');
  return allowedAuthAccountTypes.includes(nextValue as 'client' | 'escort' | 'business')
    ? nextValue as 'client' | 'escort' | 'business'
    : null;
}

function optionalString(value: unknown, maxLength: number) {
  const nextValue = String(value || '').trim();
  return nextValue ? nextValue.slice(0, maxLength) : undefined;
}
