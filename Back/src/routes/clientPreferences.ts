import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

export const clientPreferencesRouter = Router();

clientPreferencesRouter.use(verifyUser);

clientPreferencesRouter.get('/', asyncHandler(async (req, res) => {
  const clientProfile = await getOrCreateClientProfile(req.user!.id);
  res.json({ preferences: toPreferences(clientProfile) });
}));

clientPreferencesRouter.patch('/', asyncHandler(async (req, res) => {
  const body = {
    user_id: req.user!.id,
    client_search_country: optionalText(req.body.client_search_country, 10),
    client_search_city: optionalText(req.body.client_search_city, 80),
    client_search_postal_code: optionalText(req.body.client_search_postal_code, 20),
    client_search_area: optionalText(req.body.client_search_area, 120),
    client_search_label: optionalText(req.body.client_search_label, 180),
    client_search_lat: optionalNumber(req.body.client_search_lat),
    client_search_lng: optionalNumber(req.body.client_search_lng),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('client_profiles')
    .upsert(body, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ preferences: toPreferences(data) });
}));

async function getOrCreateClientProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from('client_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return data;

  const { data: created, error } = await supabaseAdmin
    .from('client_profiles')
    .insert({ user_id: userId, city: 'berlin' })
    .select()
    .single();
  if (error) throw error;
  return created;
}

function toPreferences(row: Record<string, unknown>) {
  return {
    client_search_country: row.client_search_country || null,
    client_search_city: row.client_search_city || null,
    client_search_postal_code: row.client_search_postal_code || null,
    client_search_area: row.client_search_area || null,
    client_search_lat: row.client_search_lat ?? null,
    client_search_lng: row.client_search_lng ?? null,
    client_search_label: row.client_search_label || null
  };
}

function optionalNumber(value: unknown) {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : null;
}
