import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { allowedCities, asyncHandler, normalizeOperatorStatus, normalizeProfileCategory, parseBoolean, slugify, validateProfileInput } from '../validation.js';
import { requireAdvertiserOnboardingAccess, verifyUser } from '../middleware/auth.js';
import { generatePublicUserId, generateReferralCode, normalizePhone } from '../utils/identity.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { notifyMatchingClientsForProfile } from './clientIntent.js';
import { isPublicProfile, publicProfileRejectionReason } from '../publicProfiles.js';
import { getCityLabel as getGlobalCityLabel, getCountryAliases, normalizeCity as normalizeGlobalCity, normalizeCountry } from '../locations.js';
import { isActivePublicCategory } from '../categories.js';
import { normalizeEffectiveLocationVisibility, resolveEffectivePublicLocation } from '../publicLocation.js';
import { getOrCreateWalletForUser } from '../services/tokenWallet.js';
import { isRadarRequest, prepareRadarCandidatePool } from '../radarPool.js';

export const profilesRouter = Router();

profilesRouter.get('/', asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  res.set('Cache-Control', 'no-store, max-age=0');
  const city = normalizeGlobalCity(req.query.city);
  const country = normalizeCountry(req.query.country);
  const radarMode = isRadarRequest(req.query.radar);
  const diagnosticsRequested = radarMode && req.query.diagnostics === '1';
  const radarSelect = [
    'id', 'display_name', 'slug', 'city', 'work_city', 'travel_city', 'area', 'work_area', 'work_country',
    'category', 'status', 'is_published', 'moderation_status', 'shadowbanned', 'operator_status',
    'availability_status', 'available_now', 'latitude', 'longitude', 'location_mode', 'location_visibility',
    'postal_code', 'work_place_label', 'created_at', 'location_updated_at', 'admin_priority', 'verified',
    'is_sponsored', 'acquisition_source', 'provider', 'price_1h', 'currency',
    'profile_images(id, storage_path, is_primary, is_hidden, is_private, moderation_status, sort_order, created_at)',
    'profile_tags(tag_id)'
  ].join(', ');
  let query = supabaseAdmin
    .from('profiles')
    .select(radarMode ? radarSelect : '*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('status', 'active')
    .eq('is_published', true)
    .eq('moderation_status', 'approved')
    .eq('shadowbanned', false)
    .order('admin_priority', { ascending: false })
    .order('available_now', { ascending: false })
    .order('location_updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (city && !radarMode) {
    const label = getGlobalCityLabel(city);
    query = query.or(`city.eq.${city},city.ilike.*${city}*,work_city.ilike.*${label}*,work_city.ilike.*${city}*,travel_city.ilike.*${label}*,travel_city.ilike.*${city}*`);
  }

  if (!radarMode) {
    for (const key of ['available_now', 'mobile_service', 'private_studio', 'verified']) {
      const parsed = parseBoolean(req.query[key]);
      if (parsed !== undefined) query = query.eq(key, parsed);
    }
  }

  const categoryFilter = normalizeProfileCategory(req.query.category);
  if (!radarMode && categoryFilter && !isActivePublicCategory(categoryFilter)) return res.json({ profiles: [] });

  const tagIds = String(req.query.tags || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  // Radar candidates stay global; presentation filters run after distance.
  if (tagIds.length && !radarMode) {
    const { data: taggedRows, error: tagError } = await supabaseAdmin
      .from('profile_tags')
      .select('profile_id')
      .in('tag_id', tagIds);
    if (tagError) return res.status(500).json({ error: tagError.message });
    const profileIds = [...new Set((taggedRows || []).map((row) => row.profile_id))];
    if (!profileIds.length) return res.json({ profiles: [] });
    query = query.in('id', profileIds);
  }

  let data: any[] = [];
  let pagesFetched = 0;
  let truncated = false;
  if (radarMode) {
    const pageSize = 200;
    const maxPages = 100;
    for (let offset = 0; pagesFetched < maxPages; offset += pageSize) {
      const page = await query.range(offset, offset + pageSize - 1);
      if (page.error) return res.status(500).json({ error: page.error.message });
      pagesFetched += 1;
      const rows = page.data || [];
      data.push(...rows);
      if (rows.length < pageSize) break;
      if (pagesFetched === maxPages) truncated = true;
    }
  } else {
    const page = await query.limit(60);
    if (page.error) return res.status(500).json({ error: page.error.message });
    data = page.data || [];
  }

  const rejectionCounts: Record<string, number> = {};
  if (diagnosticsRequested && process.env.NODE_ENV !== 'production') {
    const diagnostics = await supabaseAdmin
      .from('profiles')
      .select('status, is_published, moderation_status, shadowbanned, category')
      .limit(2000);
    if (!diagnostics.error) {
      for (const profile of diagnostics.data || []) {
        const reason = publicProfileRejectionReason(profile) || (!isActivePublicCategory(profile.category) ? 'disabled_category' : null);
        if (reason) rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      }
    }
  }
  const filteredRecords = (data || [])
    .filter((profile) => {
      const visible = isPublicProfile(profile);
      if (!visible) {
        const reason = publicProfileRejectionReason(profile) || 'unknown';
        rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
      }
      if (!visible && process.env.NODE_ENV !== 'production') {
        console.info('[public-profiles] rejected', { profile_id: profile.id, reason: publicProfileRejectionReason(profile) });
      }
      return visible;
    })
    .filter((profile) => radarMode || !country || profileMatchesCountry(profile, country) || (city && profileMatchesCity(profile, city)))
    .filter((profile) => radarMode || !city || profileMatchesCity(profile, city))
    .filter((profile) => isActivePublicCategory(profile.category))
    .filter((profile) => radarMode || !categoryFilter || normalizeProfileCategory(profile.category) === categoryFilter);
  const preparedRadarPool = radarMode ? prepareRadarCandidatePool(data, pagesFetched, truncated) : null;
  const profiles = (preparedRadarPool
    ? preparedRadarPool.candidates.map(({ profile, location }) => sanitizePublicProfile(withImageUrls(profile), location, 1))
    : filteredRecords.map((profile) => sanitizePublicProfile(withImageUrls(profile))))
    .sort((left, right) => Number(right.radar_score || 0) - Number(left.radar_score || 0));

  const radarMeta = radarMode ? {
    ...preparedRadarPool!.meta,
    // Compatibility aliases for existing diagnostics clients.
    candidates_before_filters: data.length,
    candidates_public: profiles.length,
    missing_location: preparedRadarPool!.meta.unlocated_candidates,
    rejected_by_reason: rejectionCounts,
    duration_ms: Date.now() - startedAt,
    response_bytes: Buffer.byteLength(JSON.stringify(profiles), 'utf8')
  } : undefined;
  if (process.env.NODE_ENV !== 'production' || radarMode) {
    console.info('[public-profiles]', { endpoint: req.originalUrl, api_records: data.length, public_records: profiles.length, radar: radarMeta });
  }
  res.json({ profiles, ...(radarMeta ? { radar_meta: radarMeta } : {}) });
}));

profilesRouter.get('/me', verifyUser, asyncHandler(async (req, res) => {
  logProfileDebug('GET /api/profiles/me start', req, { status: 'start' });
  let { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data && !error && req.user?.email) {
    const email = req.user.email.trim().toLowerCase();
    const { data: emailProfiles, error: emailError } = await supabaseAdmin
      .from('profiles')
      .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
      .ilike('owner_email', email)
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(2);
    const emailProfile = emailProfiles?.length === 1 ? emailProfiles[0] : null;
    if (emailError) error = emailError;
    if (emailProfile) {
      const { data: linkedProfile, error: linkError } = await supabaseAdmin
        .from('profiles')
        .update({ user_id: req.user.id })
        .eq('id', emailProfile.id)
        .is('user_id', null)
        .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
        .maybeSingle();
      if (linkError) error = linkError;
      data = linkedProfile || null;
    }
  }

  if (error) {
    logProfileDebug('GET /api/profiles/me error', req, { status: 'error', supabase_error: error.message });
    return res.status(500).json({ error: error.message });
  }
  const wallet = await getOrCreateWallet(req.user!.id);
  logProfileDebug('GET /api/profiles/me success', req, {
    status: 'success',
    profile_id: data?.id || null,
    images: data?.profile_images?.length || 0
  });
  res.json({ profile: data ? withOwnerImageUrls(data, wallet) : null, wallet });
}));

profilesRouter.get('/:id/access', verifyUser, asyncHandler(async (req, res) => {
  const activation = await getClientActivationSummary(req.user!.id);
  if (activation.state !== 'client_activated') {
    return res.status(403).json({
      error: 'Client activation required',
      locked_features: ['phone_number', 'whatsapp', 'telegram', 'full_gallery', 'vip_gallery', 'gifts', 'live_cam']
    });
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, primary_phone, additional_phones, whatsapp, telegram, profile_images(*)')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json({ error: 'Profile not found' });

  const { data: vipUnlock } = await supabaseAdmin
    .from('vip_gallery_unlocks')
    .select('id, expires_at')
    .eq('user_id', req.user!.id)
    .eq('profile_id', req.params.id)
    .maybeSingle();

  const images = (data.profile_images || []).filter((image: any) => {
    if (image.is_hidden || image.moderation_status !== 'approved') return false;
    return !image.is_private || Boolean(vipUnlock);
  }).map((image: any) => {
    const { data: publicUrl } = supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'profile-images').getPublicUrl(image.storage_path);
    return { ...image, public_url: publicUrl.publicUrl, is_cover: Boolean(image.is_primary) };
  });

  res.json({
    access: {
      client_state: activation.state,
      phone_number: data.primary_phone,
      additional_phones: data.additional_phones || [],
      whatsapp: data.whatsapp,
      telegram: data.telegram,
      full_gallery: images,
      vip_gallery_unlocked: Boolean(vipUnlock),
      gifts_enabled: true,
      live_cam_enabled: true
    }
  });
}));

profilesRouter.get('/:id', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store, max-age=0');
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .eq('id', req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Profile not found' });
  if (!isPublicProfile(data) || !isActivePublicCategory(data.category)) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  res.json({ profile: sanitizePublicProfile(withImageUrls(data)) });
}));

profilesRouter.post('/', verifyUser, requireAdvertiserOnboardingAccess, asyncHandler(async (req, res) => {
  logProfileDebug('POST /api/profiles start', req, {
    status: 'start',
    display_name: safeText(req.body.display_name),
    city: safeText(req.body.city),
    availability_status: safeText(req.body.availability_status),
    operator_status: safeText(req.body.operator_status)
  });
  const result = validateProfileInput(req.body);
  if ('error' in result) {
    logProfileDebug('POST /api/profiles validation_error', req, { status: 'error', error: result.error });
    return res.status(400).json({ error: result.error });
  }
  const phoneValidation = await validatePhoneRules(result.data, null);
  if ('error' in phoneValidation) {
    logProfileDebug('POST /api/profiles phone_error', req, { status: 'error', error: phoneValidation.error });
    return res.status(400).json({ error: phoneValidation.error });
  }
  const { tag_ids, profileData } = splitProfileTags(result.data);

  const baseSlug = slugify(result.data.display_name);
  const isTestAccount = Boolean(req.body.is_test_account) || isSafeTestEmail(req.user?.email);
  const payload = {
    ...profileData,
    ...phoneValidation.data,
    ...operatorStatusPatch(profileData.operator_status),
    user_id: req.user!.id,
    slug: `${baseSlug}-${Date.now().toString(36)}`,
    public_user_id: await generateUniqueValue('public_user_id', generatePublicUserId),
    referral_code: await generateUniqueValue('referral_code', generateReferralCode),
    status: isTestAccount ? 'active' : 'pending',
    verified: isTestAccount,
    verification_status: isTestAccount ? 'verified' : 'pending',
    moderation_status: isTestAccount ? 'approved' : 'pending',
    subscription_status: req.advertiserAccess!.onboarding ? 'trial' : 'active',
    plan: req.advertiserAccess!.plan,
    listing_plan: req.advertiserAccess!.plan,
    is_test_account: isTestAccount,
    verified_at: isTestAccount ? new Date().toISOString() : null,
    trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    location_updated_at: hasLocationChange(req.body) ? new Date().toISOString() : null
  };

  const { data, error } = await supabaseAdmin.from('profiles').insert(payload).select('*, profile_images(*), profile_tags(tag_id, tags(*))').single();
  if (error) {
    logProfileDebug('POST /api/profiles supabase_error', req, { status: 'error', supabase_error: error.message });
    return res.status(400).json({ error: error.message });
  }
  if (data.operator_status === 'ONLINE_NOW') {
    await notifyMatchingClientsForProfile(data).catch((notificationError) => {
      console.warn('[profiles] client match notification failed', notificationError);
    });
  }
  await syncProfileTags(data.id, tag_ids);
  const hydrated = await fetchProfile(data.id);

  const wallet = await getOrCreateWallet(req.user!.id);
  logProfileDebug('POST /api/profiles success', req, {
    status: 'success',
    profile_id: data.id,
    availability_status: data.availability_status,
    available_now: data.available_now
  });
  res.status(201).json({ profile: withImageUrls(hydrated || data, wallet), wallet });
}));

profilesRouter.put('/:id', verifyUser, requireAdvertiserOnboardingAccess, asyncHandler(async (req, res) => {
  logProfileDebug('PUT /api/profiles/:id start', req, {
    status: 'start',
    profile_id: req.params.id,
    city: safeText(req.body.city),
    area: safeText(req.body.area),
    availability_status: safeText(req.body.availability_status),
    available_now: Boolean(req.body.available_now),
    services_count: Array.isArray(req.body.services) ? req.body.services.length : null,
    services_keys: Array.isArray(req.body.services) ? req.body.services.map((item: unknown) => String(item)).slice(0, 20) : null
  });
  const result = validateProfileInput(req.body);
  if ('error' in result) {
    logProfileDebug('PUT /api/profiles/:id validation_error', req, { status: 'error', profile_id: req.params.id, error: result.error });
    return res.status(400).json({ error: result.error });
  }
  const phoneValidation = await validatePhoneRules(result.data, req.params.id);
  if ('error' in phoneValidation) {
    logProfileDebug('PUT /api/profiles/:id phone_error', req, { status: 'error', profile_id: req.params.id, error: phoneValidation.error });
    return res.status(400).json({ error: phoneValidation.error });
  }
  const { tag_ids, profileData } = splitProfileTags(result.data);
  if (Array.isArray(profileData.services)) {
    console.log('[profiles] update services count=', profileData.services.length);
    console.log('[profiles] update services keys=', profileData.services.slice(0, 30));
  }

  const { data: existing } = await supabaseAdmin.from('profiles').select('user_id, is_test_account, public_user_id, referral_code').eq('id', req.params.id).single();
  if (!existing) {
    logProfileDebug('PUT /api/profiles/:id not_found', req, { status: 'error', profile_id: req.params.id });
    return res.status(404).json({ error: 'Profile not found' });
  }
  if (existing.user_id !== req.user!.id) {
    logProfileDebug('PUT /api/profiles/:id forbidden', req, { status: 'error', profile_id: req.params.id, owner_id: existing.user_id });
    return res.status(403).json({ error: 'Not your profile' });
  }

  const updatePayload = {
    ...profileData,
    ...phoneValidation.data,
    ...operatorStatusPatch(profileData.operator_status),
    public_user_id: existing.public_user_id || await generateUniqueValue('public_user_id', generatePublicUserId),
    referral_code: existing.referral_code || await generateUniqueValue('referral_code', generateReferralCode),
    subscription_status: req.advertiserAccess!.onboarding ? 'trial' : 'active',
    plan: req.advertiserAccess!.plan,
    listing_plan: req.advertiserAccess!.plan,
    ...(hasLocationChange(req.body) ? { location_updated_at: new Date().toISOString() } : {}),
    ...(existing.is_test_account ? {
      status: 'active',
      verified: true,
      verification_status: 'verified',
      moderation_status: 'approved',
      subscription_status: 'active'
    } : {})
  };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload)
    .eq('id', req.params.id)
    .select('*, profile_images(*), profile_tags(tag_id, tags(*))')
    .single();

  if (error) {
    logProfileDebug('PUT /api/profiles/:id supabase_error', req, { status: 'error', profile_id: req.params.id, supabase_error: error.message });
    return res.status(400).json({ error: error.message });
  }
  if (data.operator_status === 'ONLINE_NOW') {
    await notifyMatchingClientsForProfile(data).catch((notificationError) => {
      console.warn('[profiles] client match notification failed', notificationError);
    });
  }
  await syncProfileTags(data.id, tag_ids);
  const hydrated = await fetchProfile(data.id);
  const wallet = await getOrCreateWallet(req.user!.id);
  logProfileDebug('PUT /api/profiles/:id success', req, {
    status: 'success',
    profile_id: data.id,
    city: data.city,
    area: data.area,
    availability_status: data.availability_status,
    available_now: data.available_now,
    saved_services_count: Array.isArray(data.services) ? data.services.length : 0
  });
  if (Array.isArray(data.services)) {
    console.log('[profiles] saved services count=', data.services.length);
  }
  res.json({ profile: withImageUrls(hydrated || data, wallet), wallet });
}));

profilesRouter.delete('/:id', verifyUser, requireAdvertiserOnboardingAccess, asyncHandler(async (req, res) => {
  const { data: existing } = await supabaseAdmin.from('profiles').select('user_id').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ error: 'Profile not found' });
  if (existing.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your profile' });

  const { error } = await supabaseAdmin.from('profiles').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).send();
}));

function withImageUrls(profile: any, wallet?: any) {
  const images = (profile.profile_images || []).filter((image: any) => {
    if (image.is_hidden || image.moderation_status !== 'approved') return false;
    return !image.is_private;
  }).map((image: any) => {
    const { data } = supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'profile-images').getPublicUrl(image.storage_path);
    return { ...image, public_url: data.publicUrl, is_cover: Boolean(image.is_primary) };
  }).sort((left: any, right: any) => {
    if (Boolean(left.is_primary) !== Boolean(right.is_primary)) return left.is_primary ? -1 : 1;
    return Number(left.sort_order || 0) - Number(right.sort_order || 0);
  });

  const tags = (profile.profile_tags || []).map((row: any) => row.tags).filter(Boolean);
  const tag_ids = (profile.profile_tags || []).map((row: any) => row.tag_id).filter(Boolean);
  return {
    ...profile,
    profile_images: images,
    images,
    tags,
    tag_ids,
    wallet_summary: wallet ? {
      escort_token_balance: Number(wallet.escort_token_balance || 0),
      referral_balance: Number(wallet.referral_balance || 0),
      public_wallet_id: wallet.public_wallet_id
    } : undefined,
    visibility_reason: getVisibilityReason({ ...profile, profile_images: images }),
    radar_score: calculateRadarScore({ ...profile, profile_images: images })
  };
}

function withOwnerImageUrls(profile: any, wallet?: any) {
  const images = (profile.profile_images || []).map((image: any) => {
    const { data } = supabaseAdmin.storage.from(process.env.SUPABASE_STORAGE_BUCKET || 'profile-images').getPublicUrl(image.storage_path);
    return { ...image, public_url: data.publicUrl, is_cover: Boolean(image.is_primary) };
  }).sort((left: any, right: any) => {
    if (Boolean(left.is_primary) !== Boolean(right.is_primary)) return left.is_primary ? -1 : 1;
    return Number(left.sort_order || 0) - Number(right.sort_order || 0);
  });
  const hydrated = withImageUrls({ ...profile, profile_images: [] }, wallet);
  return {
    ...hydrated,
    profile_images: images,
    images
  };
}

function sanitizePublicProfile(profile: any, resolvedLocation = resolveEffectivePublicLocation(profile), imageLimit = 4) {
  const { phone, primary_phone, additional_phones, whatsapp, telegram, admin_note, subscription_note, source_url, import_source, imported_at, source_url_normalized, latitude, longitude, work_place_label, exact_address: _omittedExactAddress, ...publicProfile } = profile;
  const visibleImages = (publicProfile.profile_images || []).slice(0, imageLimit);
  const visibility = normalizeEffectiveLocationVisibility(publicProfile.location_mode, publicProfile.location_visibility);
  const postalCode = visibility === 'hidden' ? null : publicProfile.postal_code;
  // Legacy DB modes: approximate/city_only/exact_hidden. UI modes exact/postal_area/city_only/hidden are mapped before save.
  // Radar may use postal_code/work_area as a consciously configured public area, but never for hidden profiles.
  const effectiveLocation = resolvedLocation || resolveEffectivePublicLocation({ ...publicProfile, latitude, longitude, location_visibility: visibility });
  return {
    ...publicProfile,
    category: normalizeProfileCategory(publicProfile.category) || publicProfile.category,
    location_visibility: visibility,
    postal_code: postalCode,
    work_place_label: visibility === 'exact' ? work_place_label : null,
    exact_address: visibility === 'exact' ? _omittedExactAddress : null,
    latitude: effectiveLocation?.latitude ?? null,
    longitude: effectiveLocation?.longitude ?? null,
    location_approximate: effectiveLocation?.location_approximate ?? false,
    location_precision: effectiveLocation?.location_precision ?? null,
    profile_images: visibleImages,
    images: visibleImages,
    locked_features: ['phone_number', 'whatsapp', 'telegram', 'full_gallery', 'vip_gallery', 'gifts', 'live_cam']
  };
}

function normalizePublicLocationVisibility(value: unknown) {
  const mode = String(value || 'postal_area');
  if (['exact', 'postal_area', 'city_only', 'hidden'].includes(mode)) return mode;
  if (mode === 'exact_hidden') return 'hidden';
  if (mode === 'city_only') return 'city_only';
  if (mode === 'approximate') return 'postal_area';
  return 'postal_area';
}

function hasLocationChange(body: Record<string, unknown>) {
  return [
    'work_country',
    'work_city',
    'work_area',
    'work_place_label',
    'exact_address',
    'city',
    'area',
    'latitude',
    'longitude',
    'location_mode',
    'service_radius_km',
    'auto_location_on_login',
    'auto_location_while_online'
  ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function operatorStatusPatch(status: unknown) {
  const operatorStatus = normalizeOperatorStatus(status);
  if (operatorStatus === 'ONLINE_NOW') return { availability_status: 'available', available_now: true };
  if (operatorStatus === 'AVAILABLE_TODAY' || operatorStatus === 'APPOINTMENT_ONLY') return { availability_status: 'available', available_now: false };
  if (operatorStatus === 'BUSY' || operatorStatus === 'TRAVELING') return { availability_status: 'busy', available_now: false };
  return { availability_status: 'unavailable', available_now: false };
}

function cityLabel(slug: string) {
  const labels: Record<string, string> = {
    berlin: 'Berlin',
    hamburg: 'Hamburg',
    hannover: 'Hannover',
    koeln: 'Koeln',
    muenchen: 'Muenchen',
    warszawa: 'Warszawa'
  };
  return labels[slug] || slug;
}

function profileMatchesCountry(profile: any, country: string) {
  const aliases = getCountryAliases(country).map((item) => item.toLowerCase());
  const values = [profile.work_country, profile.country, profile.country_code]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);
  if (!values.length && country === 'DE') return true;
  return values.some((value) => aliases.some((alias) => value === alias || value.includes(alias)));
}

function profileMatchesCity(profile: any, city: string) {
  const wanted = normalizeGlobalCity(city);
  return [profile.city, profile.work_city, profile.travel_city, profile.area, profile.work_area]
    .some((value) => {
      const normalizedValue = normalizeGlobalCity(value);
      return normalizedValue === wanted || normalizedValue.includes(wanted);
    });
}

function calculateRadarScore(profile: any) {
  const statusScore: Record<string, number> = {
    ONLINE_NOW: 100,
    AVAILABLE_TODAY: 80,
    TRAVELING: 60,
    BUSY: 20,
    APPOINTMENT_ONLY: 40,
    OFFLINE: 0
  };
  let score = statusScore[String(profile.operator_status || 'OFFLINE')] || 0;
  if (profile.location_updated_at) {
    const ageMinutes = (Date.now() - new Date(profile.location_updated_at).getTime()) / 60000;
    if (ageMinutes < 30) score += 50;
    else if (ageMinutes < 120) score += 20;
  }
  if (profile.verified) score += 25;
  if (profileCompleteness(profile) >= 100) score += 25;
  return score;
}

function profileCompleteness(profile: any) {
  const checks = [
    Boolean(profile.display_name),
    Boolean(profile.city || profile.work_city),
    Boolean(profile.description),
    Boolean(profile.price_1h),
    Boolean(profile.profile_images?.length),
    Boolean(profile.services?.length || profile.service_menu?.length),
    Boolean(profile.operator_status && profile.operator_status !== 'OFFLINE'),
    Boolean(profile.service_radius_km)
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function getVisibilityReason(profile: any) {
  if (profile.moderation_status === 'rejected') return 'blocked';
  if (profile.moderation_status === 'suspended' || profile.status === 'suspended') return 'suspended';
  if (profile.moderation_status !== 'approved') return 'pending_verification';
  if (!profile.display_name || !profile.city || !profile.category) return 'missing_required_fields';
  if (!profile.profile_images?.length) return 'no_images';
  if (!profile.is_test_account && profile.subscription_status !== 'active') return 'missing_payment';
  if (!profile.verified && profile.verification_status !== 'verified') return 'pending_verification';
  if (profile.status !== 'active') return 'pending_verification';
  return 'visible';
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
  const protectedEmails = (process.env.ADMIN_EMAILS || 'admin@example.test')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return normalized.includes('+test') && !protectedEmails.includes(normalized);
}

function logProfileDebug(message: string, req: any, extra: Record<string, unknown> = {}) {
  console.info('[profiles]', {
    message,
    user_id: req.user?.id || null,
    auth_account_type: req.user?.app_metadata?.auth_account_type || null,
    plan: req.user?.app_metadata?.plan || null,
    subscription_status: req.user?.app_metadata?.subscription_status || null,
    ...extra
  });
}

function safeText(value: unknown) {
  const text = String(value || '').trim();
  return text ? text.slice(0, 120) : null;
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

async function getOrCreateWallet(userId: string) {
  return getOrCreateWalletForUser(userId).catch(() => null);
}
