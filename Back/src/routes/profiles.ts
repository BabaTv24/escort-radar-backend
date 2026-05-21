import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { allowedCities, asyncHandler, parseBoolean, slugify, validateProfileInput } from '../validation.js';
import { verifyUser } from '../middleware/auth.js';
import { generatePublicUserId, generateReferralCode, normalizePhone } from '../utils/identity.js';

export const profilesRouter = Router();

profilesRouter.get('/', asyncHandler(async (req, res) => {
  let query = supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('status', 'active')
    .eq('shadowbanned', false)
    .order('available_now', { ascending: false })
    .order('created_at', { ascending: false });

  const city = String(req.query.city || '').toLowerCase();
  if (city && allowedCities.includes(city)) query = query.eq('city', city);

  for (const key of ['available_now', 'mobile_service', 'private_studio', 'verified']) {
    const parsed = parseBoolean(req.query[key]);
    if (parsed !== undefined) query = query.eq(key, parsed);
  }

  if (req.query.category) query = query.eq('category', String(req.query.category));

  const tagIds = String(req.query.tags || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (tagIds.length) {
    const { data: taggedRows, error: tagError } = await supabaseAdmin
      .from('profile_tags')
      .select('profile_id')
      .in('tag_id', tagIds);
    if (tagError) return res.status(500).json({ error: tagError.message });
    const profileIds = [...new Set((taggedRows || []).map((row) => row.profile_id))];
    if (!profileIds.length) return res.json({ profiles: [] });
    query = query.in('id', profileIds);
  }

  const { data, error } = await query.limit(60);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ profiles: data?.map(withImageUrls) || [] });
}));

profilesRouter.get('/me', verifyUser, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data ? withImageUrls(data) : null });
}));

profilesRouter.get('/:id', asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Profile not found' });
  if (data.status !== 'active') return res.status(404).json({ error: 'Profile not found' });

  res.json({ profile: withImageUrls(data) });
}));

profilesRouter.post('/', verifyUser, asyncHandler(async (req, res) => {
  const result = validateProfileInput(req.body);
  if ('error' in result) return res.status(400).json({ error: result.error });
  const phoneValidation = await validatePhoneRules(result.data, null);
  if ('error' in phoneValidation) return res.status(400).json({ error: phoneValidation.error });
  const { tag_ids, profileData } = splitProfileTags(result.data);

  const baseSlug = slugify(result.data.display_name);
  const isTestAccount = Boolean(req.body.is_test_account) || isSafeTestEmail(req.user?.email);
  const payload = {
    ...profileData,
    ...phoneValidation.data,
    user_id: req.user!.id,
    slug: `${baseSlug}-${Date.now().toString(36)}`,
    public_user_id: await generateUniqueValue('public_user_id', generatePublicUserId),
    referral_code: await generateUniqueValue('referral_code', generateReferralCode),
    status: isTestAccount ? 'active' : 'pending',
    verified: isTestAccount,
    verification_status: isTestAccount ? 'verified' : 'pending',
    moderation_status: 'clean',
    subscription_status: isTestAccount ? 'active' : 'trial',
    is_test_account: isTestAccount,
    verified_at: isTestAccount ? new Date().toISOString() : null,
    trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  };

  const { data, error } = await supabaseAdmin.from('profiles').insert(payload).select('*, profile_images(*), profile_tags(tag_id, tags(*))').single();
  if (error) return res.status(400).json({ error: error.message });
  await syncProfileTags(data.id, tag_ids);
  const hydrated = await fetchProfile(data.id);

  res.status(201).json({ profile: withImageUrls(hydrated || data) });
}));

profilesRouter.put('/:id', verifyUser, asyncHandler(async (req, res) => {
  const result = validateProfileInput(req.body);
  if ('error' in result) return res.status(400).json({ error: result.error });
  const phoneValidation = await validatePhoneRules(result.data, req.params.id);
  if ('error' in phoneValidation) return res.status(400).json({ error: phoneValidation.error });
  const { tag_ids, profileData } = splitProfileTags(result.data);

  const { data: existing } = await supabaseAdmin.from('profiles').select('user_id, is_test_account, public_user_id, referral_code').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Profile not found' });
  if (existing.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your profile' });

  const updatePayload = {
    ...profileData,
    ...phoneValidation.data,
    public_user_id: existing.public_user_id || await generateUniqueValue('public_user_id', generatePublicUserId),
    referral_code: existing.referral_code || await generateUniqueValue('referral_code', generateReferralCode),
    ...(existing.is_test_account ? {
      status: 'active',
      verified: true,
      verification_status: 'verified',
      moderation_status: 'clean',
      subscription_status: 'active'
    } : {})
  };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', req.params.id)
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  await syncProfileTags(data.id, tag_ids);
  const hydrated = await fetchProfile(data.id);
  res.json({ profile: withImageUrls(hydrated || data) });
}));

profilesRouter.delete('/:id', verifyUser, asyncHandler(async (req, res) => {
  const { data: existing } = await supabaseAdmin.from('profiles').select('user_id').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Profile not found' });
  if (existing.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your profile' });

  const { error } = await supabaseAdmin.from('profiles').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

function withImageUrls(profile: any) {
  const images = (profile.profile_images || []).map((image: any) => {
    const { data } = supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'profile-images').getPublicUrl(image.storage_path);
    return { ...image, public_url: data.publicUrl };
  });

  const tags = (profile.profile_tags || []).map((row: any) => row.tags).filter(Boolean);
  const tag_ids = (profile.profile_tags || []).map((row: any) => row.tag_id).filter(Boolean);
  return { ...profile, profile_images: images, tags, tag_ids };
}

function splitProfileTags(data: Record<string, any>) {
  const { tag_ids, ...profileData } = data;
  return {
    tag_ids: Array.isArray(tag_ids) ? tag_ids.map((item) => String(item)).filter(Boolean).slice(0, 60) : [],
    profileData
  };
}

async function syncProfileTags(profileId: string, tagIds: string[]) {
  await supabaseAdmin.from('profile_tags').delete().eq('profile_id', profileId);
  if (!tagIds.length) return;
  const rows = [...new Set(tagIds)].map((tag_id) => ({ profile_id: profileId, tag_id }));
  await supabaseAdmin.from('profile_tags').insert(rows);
}

async function fetchProfile(id: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('id', id)
    .single();
  return data;
}

function isSafeTestEmail(email: string | undefined) {
  const normalized = email?.toLowerCase() || '';
  return normalized.includes('+test') && !['mtvx007@gmail.com', 'babatv24@proton.me'].includes(normalized);
}

async function validatePhoneRules(data: Record<string, any>, profileId: string | null) {
  const primaryPhone = normalizePhone(data.primary_phone);
  const additionalPhones = Array.isArray(data.additional_phones) ? data.additional_phones.map(normalizePhone).filter(Boolean) : [];
  const ownerLabel = String(data.phone_owner_identity_label || data.display_name || '').trim().slice(0, 120);
  const accountType = String(data.account_type || 'private');

  if (accountType === 'private' && primaryPhone && !data.phone_rule_confirmed) {
    return { error: 'Private accounts must confirm that all phone numbers belong to the same individual advertiser.' };
  }

  let phoneConflictStatus = 'clear';
  if (primaryPhone) {
    let query = supabaseAdmin
      .from('profiles')
      .select('id, phone_owner_identity_label, account_type')
      .or(`primary_phone.eq.${primaryPhone},additional_phones.cs.{${primaryPhone}}`);

    if (profileId) query = query.neq('id', profileId);
    const { data: matches, error } = await query.limit(20);
    if (error) return { error: error.message };

    const differentOwner = (matches || []).some((profile) => {
      const existingLabel = String(profile.phone_owner_identity_label || '').trim().toLowerCase();
      return existingLabel && ownerLabel && existingLabel !== ownerLabel.toLowerCase();
    });
    if (differentOwner && accountType === 'private') phoneConflictStatus = 'conflict';
    else if ((matches || []).length) phoneConflictStatus = 'warning';
  }

  return {
    data: {
      primary_phone: primaryPhone || null,
      additional_phones: additionalPhones,
      phone_owner_identity_label: ownerLabel || null,
      phone_conflict_status: phoneConflictStatus
    }
  };
}

async function generateUniqueValue(column: 'public_user_id' | 'referral_code', generator: () => string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = generator();
    const { data } = await supabaseAdmin.from('profiles').select('id').eq(column, value).maybeSingle();
    if (!data) return value;
  }
  return generator();
}
