import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { requireAccountType, requireAdvertiserAccess, verifyUser } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler, optionalText } from '../validation.js';

export const bookingRequestsRouter = Router();

bookingRequestsRouter.post('/', requireBcuClientForPaidBooking, asyncHandler(async (req, res) => {
  const profileId = String(req.body.profile_id || '');
  const requesterEmail = String(req.body.requester_email || '').trim();
  const requestedDate = String(req.body.requested_date || '');
  const requestedTime = String(req.body.requested_time || '');
  const durationMinutes = Number(req.body.duration_minutes || 0);
  const idempotencyKey = String(req.body.idempotency_key || req.headers['idempotency-key'] || '').trim();

  if (!profileId || !requesterEmail || !requestedDate || !requestedTime || !durationMinutes) {
    return res.status(400).json({ error: 'profile_id, requester_email, requested_date, requested_time and duration_minutes are required' });
  }
  if (config.bcuWalletEnabled && (!idempotencyKey || idempotencyKey.length > 128)) {
    return res.status(400).json({ error: 'A valid idempotency_key is required' });
  }

  const { data, error } = config.bcuWalletEnabled
    ? await supabaseAdmin.rpc('create_paid_booking_request', {
      p_client_user_id: req.user!.id,
      p_requester_email: requesterEmail || req.user!.email || '',
      p_profile_id: profileId,
      p_requested_date: requestedDate,
      p_requested_time: requestedTime,
      p_duration_minutes: Math.round(durationMinutes),
      p_message: optionalText(req.body.message, 2000),
      p_idempotency_key: idempotencyKey
    })
    : await supabaseAdmin.from('booking_requests').insert({
      profile_id: profileId,
      requester_email: requesterEmail.slice(0, 160),
      requested_date: requestedDate,
      requested_time: requestedTime,
      duration_minutes: Math.min(Math.max(Math.round(durationMinutes), 30), 1440),
      message: optionalText(req.body.message, 2000)
    }).select().single();

  if (error) return res.status(error.message.includes('INSUFFICIENT') ? 402 : 400).json({ error: error.message });
  res.status(201).json({ booking_request: data });
}));

function requireBcuClientForPaidBooking(req: Request, res: Response, next: NextFunction) {
  if (!config.bcuWalletEnabled) return next();
  return verifyUser(req, res, () => requireAccountType('client')(req, res, next));
}

bookingRequestsRouter.get('/me', verifyUser, requireAdvertiserAccess, asyncHandler(async (req, res) => {
  const profileSelection = config.bcuWalletEnabled
    ? '*, profiles!inner(id, display_name, user_id, owner_activation_status)'
    : '*, profiles!inner(id, display_name, user_id)';
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select(profileSelection)
    .eq('profiles.user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return res.status(400).json({ error: error.message });
  const visible = config.bcuWalletEnabled
    ? (data || []).filter((booking: any) => booking.profiles?.owner_activation_status !== 'awaiting_owner_activation')
    : data || [];
  res.json({ booking_requests: visible });
}));

bookingRequestsRouter.get('/profiles/:id', verifyUser, requireAdvertiserAccess, asyncHandler(async (req, res) => {
  const profileSelection = config.bcuWalletEnabled ? 'user_id, owner_activation_status' : 'user_id';
  const { data: profile } = await supabaseAdmin.from('profiles').select(profileSelection).eq('id', req.params.id).single();
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  if ((profile as any).user_id !== req.user!.id) return res.status(403).json({ error: 'Not your profile' });
  if (config.bcuWalletEnabled && (profile as any).owner_activation_status === 'awaiting_owner_activation') {
    return res.status(403).json({ error: 'Activate the sponsored profile to access booking requests' });
  }

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select('*')
    .eq('profile_id', req.params.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ booking_requests: data || [] });
}));

bookingRequestsRouter.patch('/:id/status', verifyUser, requireAdvertiserAccess, asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'accepted', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const { data: existing } = await supabaseAdmin
    .from('booking_requests')
    .select(config.bcuWalletEnabled
      ? 'id, profile_id, profiles!inner(user_id, owner_activation_status)'
      : 'id, profile_id, profiles!inner(user_id)')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Booking request not found' });
  const ownerId = (existing.profiles as unknown as { user_id: string }).user_id;
  if (ownerId !== req.user!.id) return res.status(403).json({ error: 'Not your booking request' });
  if (config.bcuWalletEnabled && (existing.profiles as any).owner_activation_status === 'awaiting_owner_activation') {
    return res.status(403).json({ error: 'Activate the sponsored profile before changing booking status' });
  }

  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ booking_request: data });
}));
