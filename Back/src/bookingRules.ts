export const BOOKING_STATUSES = ['pending', 'awaiting_owner_activation', 'accepted', 'rejected', 'cancelled'] as const;
export type BookingStatus = typeof BOOKING_STATUSES[number];

export const BOOKING_DEFAULT_TIMEZONE = 'Europe/Berlin';
export const BOOKING_MAX_DAYS_AHEAD = 365;
export const BOOKING_MIN_DURATION_MINUTES = 30;
export const BOOKING_MAX_DURATION_MINUTES = 1440;

/**
 * Status changes a profile owner may make. Rejected and cancelled bookings are terminal;
 * awaiting_owner_activation is released only by the sponsored-profile claim, never by hand.
 * Admin overrides go through the separate, logged admin booking routes.
 */
const ownerTransitions: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ['accepted', 'rejected'],
  awaiting_owner_activation: [],
  accepted: ['cancelled'],
  rejected: [],
  cancelled: []
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && (BOOKING_STATUSES as readonly string[]).includes(value);
}

export function ownerBookingTransitionAllowed(from: unknown, to: unknown) {
  if (!isBookingStatus(from) || !isBookingStatus(to)) return false;
  return ownerTransitions[from].includes(to);
}

/** A client may withdraw a request only while the advertiser has not decided on it yet. */
export function clientBookingCancelAllowed(from: unknown) {
  return from === 'pending' || from === 'awaiting_owner_activation';
}

export type BookingDisplayStatus = BookingStatus | 'completed';

/**
 * 'completed' is derived, not stored: an accepted booking whose appointment has ended
 * (in the profile's local time) is shown as completed. The database status stays 'accepted'.
 */
export function bookingDisplayStatus(
  booking: { status: unknown; requested_date?: unknown; requested_time?: unknown; duration_minutes?: unknown },
  now: Date,
  timeZone: unknown
): BookingDisplayStatus | null {
  if (!isBookingStatus(booking.status)) return null;
  if (booking.status !== 'accepted') return booking.status;
  const date = String(booking.requested_date || '');
  const time = String(booking.requested_time || '').slice(0, 5);
  if (!datePattern.test(date) || !timePattern.test(time)) return 'accepted';
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const endLocal = new Date(Date.UTC(year, month - 1, day, hour, minute + Math.max(0, Number(booking.duration_minutes) || 0)));
  const nowLocal = localWallClock(now, resolveBookingTimeZone(timeZone));
  return endLocal.getTime() <= nowLocal.getTime() ? 'completed' : 'accepted';
}

/** The current wall-clock time in a time zone, expressed as a UTC-based Date for comparison. */
function localWallClock(now: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute)));
}

export type BookingInputErrorCode =
  | 'BOOKING_FIELDS_REQUIRED'
  | 'BOOKING_IDEMPOTENCY_KEY_INVALID'
  | 'BOOKING_EMAIL_INVALID'
  | 'BOOKING_DATE_INVALID'
  | 'BOOKING_DATE_IN_PAST'
  | 'BOOKING_DATE_TOO_FAR'
  | 'BOOKING_TIME_INVALID'
  | 'BOOKING_DURATION_INVALID';

export type BookingInput = {
  profileId: string;
  requesterEmail: string;
  requestedDate: string;
  requestedTime: string;
  durationMinutes: number;
  message: string | null;
  idempotencyKey: string;
};

export type BookingInputResult =
  | { ok: true; value: BookingInput }
  | { ok: false; code: BookingInputErrorCode };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function validateBookingInput(
  body: Record<string, unknown>,
  options: { fallbackEmail?: string | null; idempotencyHeader?: unknown; now?: Date; timeZone?: unknown }
): BookingInputResult {
  const profileId = String(body.profile_id || '').trim();
  const requestedDate = String(body.requested_date || '').trim();
  const requestedTime = String(body.requested_time || '').trim();
  const rawDuration = body.duration_minutes;
  if (!profileId || !requestedDate || !requestedTime || rawDuration === undefined || rawDuration === null || rawDuration === '') {
    return { ok: false, code: 'BOOKING_FIELDS_REQUIRED' };
  }

  const idempotencyKey = String(body.idempotency_key || options.idempotencyHeader || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) return { ok: false, code: 'BOOKING_IDEMPOTENCY_KEY_INVALID' };

  const requesterEmail = String(body.requester_email || options.fallbackEmail || '').trim();
  if (!requesterEmail || requesterEmail.length > 160 || !emailPattern.test(requesterEmail)) {
    return { ok: false, code: 'BOOKING_EMAIL_INVALID' };
  }

  const dateMatch = datePattern.exec(requestedDate);
  if (!dateMatch || !isCalendarDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]))) {
    return { ok: false, code: 'BOOKING_DATE_INVALID' };
  }
  const today = todayInTimeZone(options.now || new Date(), resolveBookingTimeZone(options.timeZone));
  if (requestedDate < today) return { ok: false, code: 'BOOKING_DATE_IN_PAST' };
  if (requestedDate > addDays(today, BOOKING_MAX_DAYS_AHEAD)) return { ok: false, code: 'BOOKING_DATE_TOO_FAR' };

  if (!timePattern.test(requestedTime)) return { ok: false, code: 'BOOKING_TIME_INVALID' };

  const durationMinutes = Number(rawDuration);
  if (!Number.isInteger(durationMinutes)
    || durationMinutes < BOOKING_MIN_DURATION_MINUTES
    || durationMinutes > BOOKING_MAX_DURATION_MINUTES) {
    return { ok: false, code: 'BOOKING_DURATION_INVALID' };
  }

  const message = String(body.message || '').trim();
  return {
    ok: true,
    value: {
      profileId,
      requesterEmail,
      requestedDate,
      requestedTime: requestedTime.slice(0, 5),
      durationMinutes,
      message: message ? message.slice(0, 2000) : null,
      idempotencyKey
    }
  };
}

/** Bookings are interpreted in the profile's local time (opening_hours.timezone). */
export function resolveBookingTimeZone(value: unknown) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return BOOKING_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate });
    return candidate;
  } catch {
    return BOOKING_DEFAULT_TIMEZONE;
  }
}

export function todayInTimeZone(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function isCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
