import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';

export const tagsRouter = Router();

tagsRouter.get('/', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('tags')
    .select('*')
    .eq('active', true)
    .order('group_key', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ tags: data || [] });
}));
