import { Router } from 'express';
import { getAuthAccountType, requireAccountType, requireAdvertiserOnboardingAccess, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { allowedCities, asyncHandler } from '../validation.js';
import { allowedServiceKeys } from '../serviceCatalog.js';
import { normalizeCategoryKey } from '../categories.js';

export const clientIntentRouter = Router();

clientIntentRouter.use(verifyUser);

clientIntentRouter.get('/me', requireAccountType('client'), asyncHandler(async (req, res) => {
  await expireOldIntents();
  const { data: intent } = await supabaseAdmin
    .from('client_intents')
    .select('*')
    .eq('user_id', req.user!.id)
    .eq('active', true)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const { data: notifications } = await supabaseAdmin
    .from('radar_notifications')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const advertisers = await findAdvertisersForIntent(intent || { city: 'berlin', radius_km: 25, services: [] });
  res.json({ intent: intent || null, nearby_advertisers: advertisers, notifications: notifications || [] });
}));

clientIntentRouter.post('/', requireAccountType('client'), asyncHandler(async (req, res) => {
  await expireOldIntents();
  const { data: recent } = await supabaseAdmin
    .from('client_intents')
    .select('created_at')
    .eq('user_id', req.user!.id)
    .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1);

  if (recent?.length) return res.status(429).json({ error: 'Cooldown active. Try again in 5 minutes.', reason: 'intent_cooldown' });

  await supabaseAdmin.from('client_intents').update({ active: false }).eq('user_id', req.user!.id).eq('active', true);
  const payload = validateIntent(req.body, req.user!.id);
  if ('error' in payload) return res.status(400).json({ error: payload.error });

  const { data, error } = await supabaseAdmin.from('client_intents').insert(payload.data).select().single();
  if (error) return res.status(400).json({ error: error.message });

  const advertisers = await findAdvertisersForIntent(data);
  await notifyAdvertisers(data, advertisers);
  res.status(201).json({ intent: data, nearby_advertisers: advertisers });
}));

clientIntentRouter.patch('/status', requireAccountType('client'), asyncHandler(async (req, res) => {
  const status = normalizeClientStatus(req.body.status);
  if (!status) return res.status(400).json({ error: 'Invalid client status' });

  await supabaseAdmin.from('client_intents').update({ active: false }).eq('user_id', req.user!.id).eq('active', true);
  const { data, error } = await supabaseAdmin
    .from('client_intents')
    .insert({
      user_id: req.user!.id,
      status,
      city: normalizeCity(req.body.city) || 'berlin',
      active: status !== 'OFFLINE',
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ intent: data });
}));

clientIntentRouter.get('/advertiser/nearby-clients', requireAdvertiserOnboardingAccess, asyncHandler(async (req, res) => {
  await expireOldIntents();
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) return res.json({ clients: [], notifications: [] });
  const clients = await findClientsForProfile(profile);
  const { data: notifications } = await supabaseAdmin
    .from('radar_notifications')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(20);

  res.json({ clients, notifications: notifications || [] });
}));

export async function notifyMatchingClientsForProfile(profile: any) {
  const clients = await findClientsForProfile(profile);
  const rows = clients
    .filter((match) => match.match_score >= 60)
    .slice(0, 20)
    .map((match) => ({
      user_id: match.user_id,
      recipient_type: 'client',
      event_type: 'advertiser_online',
      title: `${profile.display_name || 'Profile'} is online now`,
      body: `${profile.work_city || profile.city} - score ${match.match_score}`,
      profile_id: profile.id,
      client_intent_id: match.id,
      match_score: match.match_score
    }));
  if (rows.length) await supabaseAdmin.from('radar_notifications').insert(rows);
}

async function notifyAdvertisers(intent: any, advertisers: any[]) {
  const rows = advertisers
    .filter((match) => match.match_score >= 60 && match.user_id)
    .slice(0, 20)
    .map((match) => ({
      user_id: match.user_id,
      recipient_type: 'advertiser',
      event_type: 'client_request_created',
      title: 'Matching client request nearby',
      body: `${intent.city}${intent.area ? `, ${intent.area}` : ''} - budget ${intent.budget_min || 0}-${intent.budget_max || 'open'}`,
      profile_id: match.id,
      client_intent_id: intent.id,
      match_score: match.match_score
    }));
  if (rows.length) await supabaseAdmin.from('radar_notifications').insert(rows);
}

async function findAdvertisersForIntent(intent: any) {
  const city = normalizeCity(intent.city) || 'berlin';
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id,user_id,display_name,city,work_city,work_area,operator_status,services,price_1h,category,service_radius_km,verified,radar_score')
    .eq('status', 'active')
    .eq('shadowbanned', false)
    .or(`city.eq.${city},work_city.ilike.*${cityLabel(city)}*,travel_city.ilike.*${cityLabel(city)}*`)
    .limit(50);

  return (data || [])
    .map((profile) => ({ ...profile, match_score: calculateMatchScore(profile, intent) }))
    .sort((left, right) => right.match_score - left.match_score)
    .slice(0, 20);
}

async function findClientsForProfile(profile: any) {
  const city = normalizeCity(profile.travel_city || profile.work_city || profile.city) || 'berlin';
  const { data } = await supabaseAdmin
    .from('client_intents')
    .select('*')
    .eq('active', true)
    .gt('expires_at', new Date().toISOString())
    .or(`city.eq.${city},city.ilike.*${cityLabel(city)}*`)
    .limit(50);

  const userIds = [...new Set((data || []).map((intent) => intent.user_id).filter(Boolean))];
  const { data: personalRows } = userIds.length
    ? await supabaseAdmin
      .from('client_personal_profiles')
      .select('user_id, first_name, verification_status, consent_verified_client_badge')
      .in('user_id', userIds)
    : { data: [] };
  const personalByUserId = new Map((personalRows || []).map((row) => [row.user_id, row]));

  return (data || [])
    .map((intent) => {
      const personal = personalByUserId.get(intent.user_id);
      const verified = personal?.verification_status === 'verified' && personal?.consent_verified_client_badge === true;
      return {
        ...intent,
        client_verification_status: personal?.verification_status || 'incomplete',
        client_verified_badge: verified,
        client_display_name: verified ? (personal?.first_name || 'Verified client') : null,
        match_score: calculateMatchScore(profile, intent)
      };
    })
    .sort((left, right) => right.match_score - left.match_score)
    .slice(0, 20);
}

function calculateMatchScore(profile: any, intent: any) {
  let score = 20;
  const status = String(profile.operator_status || 'OFFLINE');
  if (status === 'ONLINE_NOW') score += 25;
  else if (status === 'AVAILABLE_TODAY') score += 20;
  else if (status === 'TRAVELING') score += 15;
  else if (status === 'BUSY') score += 5;

  if (normalizeCity(profile.travel_city || profile.work_city || profile.city) === normalizeCity(intent.city)) score += 20;
  if (!intent.category || normalizeCategoryKey(intent.category) === normalizeCategoryKey(profile.category)) score += 10;

  const profileServices = Array.isArray(profile.services) ? profile.services : [];
  const intentServices = Array.isArray(intent.services) ? intent.services : [];
  if (!intentServices.length || intentServices.some((service: string) => profileServices.includes(service))) score += 15;

  const price = Number(profile.price_1h || 0);
  if (!intent.budget_max || !price || price <= Number(intent.budget_max)) score += 10;
  if (profile.verified) score += 5;
  return Math.max(0, Math.min(100, score));
}

function validateIntent(body: Record<string, unknown>, userId: string) {
  const status = normalizeClientStatus(body.status) || 'LOOKING_NOW';
  const city = normalizeCity(body.city);
  if (!city) return { error: 'Unsupported city' };

  const services = Array.isArray(body.services)
    ? [...new Set(body.services.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  const unknown = services.find((service) => !allowedServiceKeys.has(service));
  if (unknown) return { error: `Unknown service key: ${unknown}` };

  const budgetMin = optionalNumber(body.budget_min, 0, 100000);
  const budgetMax = optionalNumber(body.budget_max, 0, 100000);
  return {
    data: {
      user_id: userId,
      status,
      city,
      area: optionalText(body.area, 120),
      radius_km: optionalNumber(body.radius_km, 1, 100) || 25,
      category: normalizeCategoryKey(body.category) || null,
      services: services.slice(0, 30),
      budget_min: budgetMin,
      budget_max: budgetMax,
      time_window: optionalText(body.time_window, 160),
      active: status !== 'OFFLINE',
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  };
}

async function expireOldIntents() {
  await supabaseAdmin
    .from('client_intents')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('active', true)
    .lte('expires_at', new Date().toISOString());
}

function normalizeClientStatus(value: unknown) {
  const status = String(value || '').toUpperCase();
  return ['LOOKING_NOW', 'LOOKING_TODAY', 'TRAVELING', 'BROWSING', 'OFFLINE'].includes(status) ? status : null;
}

function normalizeCity(value: unknown) {
  const city = String(value || '').trim().toLowerCase();
  const aliases: Record<string, string> = { berlin: 'berlin', hamburg: 'hamburg', hannover: 'hannover', koeln: 'koeln', koln: 'koeln', cologne: 'koeln', muenchen: 'muenchen', munich: 'muenchen', warszawa: 'warszawa', warsaw: 'warszawa' };
  return aliases[city] || null;
}

function cityLabel(slug: string) {
  const labels: Record<string, string> = { berlin: 'Berlin', hamburg: 'Hamburg', hannover: 'Hannover', koeln: 'Koeln', muenchen: 'Muenchen', warszawa: 'Warszawa' };
  return labels[slug] || slug;
}

function optionalText(value: unknown, max: number) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function optionalNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(Math.max(Math.round(number), min), max);
}
