import { Router } from 'express';
import { verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

export const bookingRequestsRouter = Router();

bookingRequestsRouter.post('/', asyncHandler(async (req, res) => {
  const profileId = String(req.body.profile_id || '');
  const requesterEmail = String(req.body.requester_email || '').trim();
  const requestedDate = String(req.body.requested_date || '');
  const requestedTime = String(req.body.requested_time || '');
  const durationMinutes = Number(req.body.duration_minutes || 0);

  if (!profileId || !requesterEmail || !requestedDate || !requestedTime || !durationMinutes) {
    return res.status(400).json({ error: 'profile_id, requester_email, requested_date, requested_time and duration_minutes are required' });
  }

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .insert({
      profile_id: profileId,
      requester_email: requesterEmail.slice(0, 160),
      requested_date: requestedDate,
      requested_time: requestedTime,
      duration_minutes: Math.min(Math.max(Math.round(durationMinutes), 30), 1440),
      message: optionalText(req.body.message, 2000)
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ booking_request: data });
}));

bookingRequestsRouter.get('/me', verifyUser, asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select('*, profiles!inner(id, display_name, user_id)')
    .eq('profiles.user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ booking_requests: data || [] });
}));

bookingRequestsRouter.get('/profiles/:id', verifyUser, asyncHandler(async (req, res) => {
  const { data: profile } = await supabaseAdmin.from('profiles').select('user_id').eq('id', req.params.id).single();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if (profile.user_id !== req.user!.id) return res.status(403).json({ error: 'Not your profile' });

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select('*')
    .eq('profile_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ booking_requests: data || [] });
}));

bookingRequestsRouter.patch('/:id/status', verifyUser, asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { data: existing } = await supabaseAdmin
    .from('booking_requests')
    .select('id, profile_id, profiles!inner(user_id)')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Booking request not found' });
  const ownerId = (existing.profiles as unknown as { user_id: string }).user_id;
  if (ownerId !== req.user!.id) return res.status(403).json({ error: 'Not your booking request' });

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ booking_request: data });
}));
