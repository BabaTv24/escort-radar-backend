import { Router } from 'express';
import { requireAdmin, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { allowedReportStatuses, allowedStatuses, asyncHandler } from '../validation.js';

export const adminRouter = Router();

adminRouter.use(verifyUser, requireAdmin);

adminRouter.get('/profiles', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*, profile_images(*)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  const stats = {
    total_profiles: data?.length || 0,
    active_profiles: data?.filter((profile) => profile.status === 'active').length || 0,
    pending_profiles: data?.filter((profile) => profile.status === 'pending').length || 0
  };

  res.json({ profiles: data || [], stats });
}));

adminRouter.patch('/profiles/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ profile: data });
}));

adminRouter.get('/reports', asyncHandler(async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('reports')
    .select('*, profiles(display_name, city, status)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ reports: data || [], reports_count: data?.length || 0 });
}));

adminRouter.patch('/reports/:id/status', asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!allowedReportStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const { data, error } = await supabaseAdmin
    .from('reports')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ report: data });
}));
