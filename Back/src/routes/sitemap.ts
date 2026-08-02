import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';
import { selectSitemapProfiles } from '../sitemapProfiles.js';

const pageSize = 1000;

export const sitemapRouter = Router();

sitemapRouter.get('/profiles', asyncHandler(async (req, res) => {
  const requestedOffset = Number.parseInt(String(req.query.offset || '0'), 10);
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, updated_at, category, status, is_published, moderation_status, shadowbanned')
    .eq('status', 'active')
    .eq('is_published', true)
    .eq('moderation_status', 'approved')
    .eq('shadowbanned', false)
    .order('id', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('[sitemap-profiles] database query failed', { code: error.code || 'unknown' });
    return res.status(500).json({ error: 'Unable to load sitemap profiles' });
  }

  const rows = selectSitemapProfiles(data || []);

  res.set('Cache-Control', 'public, max-age=300, s-maxage=900');
  res.json({ profiles: rows, next_offset: (data || []).length === pageSize ? offset + pageSize : null });
}));
