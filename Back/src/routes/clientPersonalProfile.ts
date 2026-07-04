import { Router } from 'express';
import { requireAccountType, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

export const clientPersonalProfileRouter = Router();

const requiredFields = ['first_name', 'last_name', 'phone', 'street', 'house_number', 'postal_code', 'city', 'country'] as const;
const verificationStatuses = ['incomplete', 'pending', 'verified', 'rejected'] as const;

clientPersonalProfileRouter.use(verifyUser, requireAccountType('client'));

clientPersonalProfileRouter.get('/', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('client_personal_profiles')
    .select('*')
    .eq('user_id', req.user!.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ personal_profile: data || null });
}));

clientPersonalProfileRouter.put('/', asyncHandler(async (req, res) => {
  const draft = sanitizeClientPersonalProfile(req.body);
  const profileComplete = isClientPersonalProfileComplete(draft);

  const { data: existing } = await supabaseAdmin
    .from('client_personal_profiles')
    .select('verification_status, verified_at, verified_by')
    .eq('user_id', req.user!.id)
    .maybeSingle();

  const nextStatus = profileComplete
    ? existing?.verification_status === 'verified' ? 'verified' : 'pending'
    : 'incomplete';

  const payload = {
    ...draft,
    user_id: req.user!.id,
    profile_complete: profileComplete,
    verification_status: nextStatus,
    verified_at: nextStatus === 'verified' ? existing?.verified_at || null : null,
    verified_by: nextStatus === 'verified' ? existing?.verified_by || null : null
  };

  const { data, error } = await supabaseAdmin
    .from('client_personal_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ personal_profile: data });
}));

export function sanitizeClientPersonalProfile(body: Record<string, unknown>) {
  return {
    first_name: optionalText(body.first_name, 100),
    last_name: optionalText(body.last_name, 100),
    phone: optionalText(body.phone, 60),
    alternate_phone: optionalText(body.alternate_phone, 60),
    street: optionalText(body.street, 160),
    house_number: optionalText(body.house_number, 40),
    postal_code: optionalText(body.postal_code, 30),
    city: optionalText(body.city, 120),
    country: optionalText(body.country, 120),
    birth_date: optionalDate(body.birth_date),
    identity_note: optionalText(body.identity_note, 1000),
    delivery_note: optionalText(body.delivery_note, 1000),
    emergency_contact_name: optionalText(body.emergency_contact_name, 160),
    emergency_contact_phone: optionalText(body.emergency_contact_phone, 60),
    consent_personal_data: Boolean(body.consent_personal_data),
    consent_home_service_contact: Boolean(body.consent_home_service_contact),
    consent_verified_client_badge: Boolean(body.consent_verified_client_badge)
  };
}

export function isClientPersonalProfileComplete(profile: ReturnType<typeof sanitizeClientPersonalProfile>) {
  const hasRequiredFields = requiredFields.every((field) => Boolean(profile[field]));
  return hasRequiredFields
    && profile.consent_personal_data
    && profile.consent_home_service_contact
    && profile.consent_verified_client_badge;
}

export function normalizeClientPersonalVerificationStatus(value: unknown) {
  const status = String(value || '').toLowerCase();
  return verificationStatuses.includes(status as typeof verificationStatuses[number]) ? status : null;
}

function optionalDate(value: unknown) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
