import { Router } from 'express';
import type { Response } from 'express';
import { bookingDisplayStatus, clientBookingCancelAllowed, isBookingStatus, ownerBookingTransitionAllowed, validateBookingInput } from '../bookingRules.js';
import { isActivePublicCategory } from '../categories.js';
import { config } from '../config.js';
import { requireAccountType, requireAdvertiserAccess, verifyUser } from '../middleware/auth.js';
import { isPublicProfile } from '../publicProfiles.js';
import { getClientActivationSummary } from '../services/clientActivation.js';
import { markNotificationsRead, notifyUser } from '../services/inAppNotifications.js';
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
    .select('id, user_id, display_name, status, is_published, moderation_status, shadowbanned, category, opening_hours')
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

  // A retry of the same attempt returns the original request: no second charge, no second notification.
  const existing = await findClientBooking(req.user!.id, profile.id, input.idempotencyKey);
  if (existing) return res.status(200).json({ booking_request: existing, replayed: true });

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
    await notifyOwnerOfNewBooking(profile, data);
    return res.status(201).json({ booking_request: data });
  }

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
  await notifyOwnerOfNewBooking(profile, data);
  res.status(201).json({ booking_request: data });
}));

/** The client's own booking requests (requester view). The advertiser view stays GET /me. */
bookingRequestsRouter.get('/mine', verifyUser, requireAccountType('client'), asyncHandler(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .select('id, status, profile_id, requested_date, requested_time, duration_minutes, message, created_at, updated_at, profiles(id, display_name, city, work_city, opening_hours)')
    .eq('requester_user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[BookingRequests] mine failed', error.message);
    return bookingError(res, 500, 'BOOKING_LIST_FAILED');
  }
  const now = new Date();
  res.json({
    booking_requests: (data || []).map((row: any) => {
      const { opening_hours: openingHours, ...profile } = row.profiles || {};
      return {
        ...row,
        profiles: row.profiles ? profile : null,
        display_status: bookingDisplayStatus(row, now, openingHours?.timezone)
      };
    })
  });
}));

/** A client withdraws their own request while it is still undecided. BC already transferred is not refunded. */
bookingRequestsRouter.post('/:id/cancel', verifyUser, requireAccountType('client'), asyncHandler(async (req, res) => {
  const { data: existing } = await supabaseAdmin
    .from('booking_requests')
    .select('id, status, profile_id, requester_user_id, requested_date, requested_time, profiles(user_id, display_name, owner_activation_status)')
    .eq('id', req.params.id)
    .maybeSingle();
  // Someone else's booking is reported as missing, never as forbidden.
  if (!existing || (existing as any).requester_user_id !== req.user!.id) return bookingError(res, 404, 'BOOKING_NOT_FOUND');
  if (!clientBookingCancelAllowed(existing.status)) {
    return bookingError(res, 409, 'BOOKING_TRANSITION_INVALID', { from: existing.status, to: 'cancelled' });
  }
  const { data, error } = await supabaseAdmin
    .from('booking_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('status', existing.status)
    .select()
    .maybeSingle();
  if (error) {
    console.error('[BookingRequests] client cancel failed', error.message);
    return bookingError(res, 500, 'BOOKING_UPDATE_FAILED');
  }
  if (!data) return bookingError(res, 409, 'BOOKING_STATUS_CHANGED');
  const owner = (existing as any).profiles as { user_id?: string; display_name?: string; owner_activation_status?: string } | null;
  if (owner?.owner_activation_status !== 'awaiting_owner_activation') {
    await notifyUser({
      userId: owner?.user_id,
      recipientType: 'advertiser',
      eventType: 'booking_cancelled_by_client',
      title: 'Booking request cancelled by client',
      body: `${existing.requested_date} ${String(existing.requested_time).slice(0, 5)}`,
      profileId: existing.profile_id
    });
  }
  res.json({ booking_request: data });
}));

/** Marks the caller's booking notifications as read (both roles). */
bookingRequestsRouter.post('/notifications/read', verifyUser, asyncHandler(async (req, res) => {
  const updated = await markNotificationsRead(req.user!.id, 'booking_');
  res.json({ updated });
}));

async function notifyOwnerOfNewBooking(profile: { id: string; user_id: string | null; display_name?: string | null }, booking: any) {
  // A sponsored profile awaiting activation belongs to a technical account: nobody to notify yet.
  if (!booking || booking.status !== 'pending') return;
  await notifyUser({
    userId: profile.user_id,
    recipientType: 'advertiser',
    eventType: 'booking_requested',
    title: 'New booking request',
    body: `${booking.requested_date} ${String(booking.requested_time).slice(0, 5)} · ${booking.duration_minutes} min`,
    profileId: profile.id
  });
}

/** Clients are shown to advertisers by their chosen display name only (client_profiles), never by account data. */
async function clientDisplayNames(userIds: unknown[]) {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))];
  if (!ids.length) return new Map<string, string>();
  const { data } = await supabaseAdmin.from('client_profiles').select('user_id, display_name').in('user_id', ids);
  return new Map((data || [])
    .filter((row: any) => typeof row.display_name === 'string' && row.display_name.trim())
    .map((row: any) => [row.user_id as string, String(row.display_name).trim()]));
}

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
    ? '*, profiles!inner(id, display_name, user_id, owner_activation_status, opening_hours)'
    : '*, profiles!inner(id, display_name, user_id, opening_hours)';
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
  const clientNames = await clientDisplayNames(visible.map((booking: any) => booking.requester_user_id));
  const now = new Date();
  res.json({
    booking_requests: visible.map((booking: any) => {
      const { opening_hours: openingHours, ...profile } = booking.profiles || {};
      const { client_request_key: _key, ...row } = booking;
      return {
        ...row,
        profiles: profile,
        client_display_name: clientNames.get(booking.requester_user_id) || null,
        display_status: bookingDisplayStatus(booking, now, openingHours?.timezone)
      };
    })
  });
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
  await notifyUser({
    userId: (data as any).requester_user_id,
    recipientType: 'client',
    eventType: `booking_${status}`,
    title: `Booking request ${status}`,
    body: `${(data as any).requested_date} ${String((data as any).requested_time).slice(0, 5)}`,
    profileId: (data as any).profile_id
  });
  res.json({ booking_request: data });
}));
