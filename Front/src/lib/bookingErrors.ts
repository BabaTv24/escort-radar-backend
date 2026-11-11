import type { ApiError } from './api';

/** Maps a booking API failure to a translation key; `login` means the client must sign in first. */
export type BookingErrorResolution = { kind: 'login' } | { kind: 'message'; key: string };

const codeKeys: Record<string, string> = {
  INSUFFICIENT_BC: 'booking.error.insufficientBc',
  CLIENT_ACTIVATION_REQUIRED: 'booking.error.activationRequired',
  PROFILE_NOT_AVAILABLE: 'booking.error.profileUnavailable',
  PROFILE_NOT_BOOKABLE: 'booking.error.profileUnavailable',
  BOOKING_OWN_PROFILE: 'booking.error.ownProfile',
  BOOKING_DATE_IN_PAST: 'booking.error.dateInPast',
  BOOKING_DATE_TOO_FAR: 'booking.error.dateTooFar',
  BOOKING_DATE_INVALID: 'booking.error.invalidDate',
  BOOKING_TIME_INVALID: 'booking.error.invalidTime',
  BOOKING_DURATION_INVALID: 'booking.error.invalidDuration',
  BOOKING_EMAIL_INVALID: 'booking.error.invalidEmail',
  BOOKING_FIELDS_REQUIRED: 'booking.error.missingFields'
};

// Structural check (ApiError shape) keeps this module free of the API client and testable in Node.
function isApiFailure(error: unknown): error is Pick<ApiError, 'status' | 'payload'> {
  return Boolean(error) && typeof (error as { status?: unknown }).status === 'number';
}

export function resolveBookingError(error: unknown): BookingErrorResolution {
  if (isApiFailure(error)) {
    if (error.status === 401) return { kind: 'login' };
    const payloadCode = (error.payload as { code?: unknown } | undefined)?.code;
    const code = typeof payloadCode === 'string' ? payloadCode : '';
    if (codeKeys[code]) return { kind: 'message', key: codeKeys[code] };
    if (error.status === 402) return { kind: 'message', key: 'booking.error.insufficientBc' };
    if (error.status === 403) return { kind: 'message', key: 'booking.error.activationRequired' };
    if (error.status === 404) return { kind: 'message', key: 'booking.error.profileUnavailable' };
  }
  return { kind: 'message', key: 'booking.error.generic' };
}
