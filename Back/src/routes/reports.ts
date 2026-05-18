import { Router } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

export const reportsRouter = Router();

reportsRouter.post('/', asyncHandler(async (req, res) => {
  const profileId = String(req.body.profile_id || '');
  const reason = optionalText(req.body.reason, 120);

  if (!profileId || !reason) {
    return res.status(400).json({ error: 'profile_id and reason are required' });
  }

  const payload = {
    profile_id: profileId,
    reporter_email: optionalText(req.body.reporter_email, 160),
    reason,
    message: optionalText(req.body.message, 2000)
  };

  const { data, error } = await supabaseAdmin.from('reports').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });

  res.status(201).json({ report: data });
}));
