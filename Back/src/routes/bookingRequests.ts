import { Router } from 'express';
import type { Response } from 'express';
import { isBookingStatus, ownerBookingTransitionAllowed, validateBookingInput } from '../bookingRules.js';
import { isActivePublicCategory } from '../categories.js';
import { config } from '../config.js';
import { requireAccountType, requireAdvertiserAccess, verifyUser } from '../middleware/auth.js';
import { isPublicProfile } from '../publicProfiles.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { supabaseAdmin } from '../supabase.js';
import { asyncHandler } from '../validation.js';

export const bookingRequestsRouter = Router();

// Booking requests are created only here, by an authenticated and activated client account.
// The database no longer accepts direct inserts from anon/authenticated (migration 058).
bookingRequestsRouter.post('/', verifyUser, requireAccountType('client'), asyncHandler(async (req, res) => {
  const body = (req.body || {}) as Record<string, unknown>;
  const profileId = String(body.profile_id || '').trim();
  if (!profileId) return bookingError(res, 400, 'BOOKING_FIELDS_REQUIRED');

  const activation = await getClientActivationSummary(req.user!.id);
  if (activation.state !== 'client_activated') return bookingError(res, 403, 'CLIENT_ACTIVATION_REQUIRED');

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, user_id, status, is_published, moderation_status, shadowbanned, category, opening_hours')
    .eq('id', profileId)
    .maybeSingle();
  if (!profile || !isPublicProfile(profile) || !isActivePublicCategory(profile.category)) {
    return bookingError(res, 404, 'PROFILE_NOT_AVAILABLE');
  }
  if (!profile.user_id) return bookingError(res, 409, 'PROFILE_NOT_BOOKABLE');
  if (profile.user_id === req.user!.id) return bookingError(res, 400, 'BOOKING_OWN_PROFILE');

  const validation = validateBookingInput(body, {
    fallbackEmail: req.user!.email,
    idempotencyHeader: req.headers['idempotency-key'],
    timeZone: (profile.opening_hours as { timezone?: unknown } | null)?.timezone
  });
  if (!validation.ok) return bookingError(res, 400, validation.code);
  const input = validation.value;

  if (config.bcuWalletEnabled) {
    // Atomic and idempotent per (client, profile, idempotency key): a retry never charges twice.
    const { data, error } = await supabaseAdmin.rpc('create_paid_booking_request', {
      p_client_user_id: req.user!.id,
      p_requester_email: input.requesterEmail,
      p_profile_id: profile.id,
      p_requested_date: input.requestedDate,
      p_requested_time: input.requestedTime,
      p_duration_minutes: input.durationMinutes,
      p_message: input.message,
      p_idempotency_key: input.idempotencyKey
    });
    if (error) return mapPaidBookingError(res, error.message);
    return res.status(201).json({ booking_request: data });
  }

  const existing = await findClientBooking(req.user!.id, profile.id, input.idempotencyKey);
  if (existing) return res.status(200).json({ booking_request: existing, replayed: true });

  const { data, error } = await supabaseAdmin.from('booking_requests').insert({
    profile_id: profile.id,
    requester_user_id: req.user!.id,
    requester_email: input.requesterEmail,
    requested_date: input.requestedDate,
    requested_time: input.requestedTime,
    duration_minutes: input.durationMinutes,
    message: input.message,
    client_request_key: input.idempotencyKey
  }).select().single();
  if (error) {
    if (error.code === '23505') {
      const replay = await findClientBooking(req.user!.id, profile.id, input.idempotencyKey);
      if (replay) return res.status(200).json({ booking_request: replay, replayed: true });
    }
    console.error('[BookingRequests] insert failed', error.message);
    return bookingError(res, 500, 'BOOKING_CREATE_FAILED');
  }
  res.status(201).json({ booking_request: data });
}));

async function findClientBooking(userId: string, profileId: string, idempotencyKey: string) {
  const { data } = await supabaseAdmin.from('booking_requests').select('*')
    .eq('requester_user_id', userId)
    .eq('profile_id', profileId)
    .eq('client_request_key', idempotencyKey)
    .maybeSingle();
  return data;
}

function mapPaidBookingError(res: Response, message: string) {
  if (message.includes('INSUFFICIENT')) return bookingError(res, 402, 'INSUFFICIENT_BC');
  if (message.includes('PROFILE_NOT_AVAILABLE') || message.includes('PROFILE_NOT_FOUND')) return bookingError(res, 404, 'PROFILE_NOT_AVAILABLE');
  if (message.includes('IDEMPOTENCY')) return bookingError(res, 409, 'BOOKING_IDEMPOTENCY_CONFLICT');
  console.error('[BookingRequests] paid booking failed', message);
  return bookingError(res, 400, 'BOOKING_CREATE_FAILED');
}

function bookingError(res: Response, status: number, code: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error: code, code, ...extra });
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
  const status = String(req.body?.status || '');
  if (!isBookingStatus(status)) return bookingError(res, 400, 'BOOKING_STATUS_INVALID');

  const { data: existing } = await supabaseAdmin
    .from('booking_requests')
    .select(config.bcuWalletEnabled
      ? 'id, status, profile_id, profiles!inner(user_id, owner_activation_status)'
      : 'id, status, profile_id, profiles!inner(user_id)')
    .eq('id', req.params.id)
    .maybeSingle();

  if (!existing) return bookingError(res, 404, 'BOOKING_NOT_FOUND');
  const current = existing as unknown as { status: string; profiles: { user_id: string; owner_activation_status?: string } };
  if (current.profiles.user_id !== req.user!.id) return bookingError(res, 403, 'BOOKING_FORBIDDEN');
  if (config.bcuWalletEnabled && current.profiles.owner_activation_status === 'awaiting_owner_activation') {
    return bookingError(res, 403, 'SPONSORED_PROFILE_ACTIVATION_REQUIRED');
  }
  if (!ownerBookingTransitionAllowed(current.status, status)) {
    return bookingError(res, 409, 'BOOKING_TRANSITION_INVALID', { from: current.status, to: status });
  }

  // Conditional on the status we validated, so a concurrent change cannot be overwritten.
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('status', current.status)
    .select()
    .maybeSingle();

  if (error) {
    console.error('[BookingRequests] status update failed', error.message);
    return bookingError(res, 500, 'BOOKING_UPDATE_FAILED');
  }
  if (!data) return bookingError(res, 409, 'BOOKING_STATUS_CHANGED');
  res.json({ booking_request: data });
}));
