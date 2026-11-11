import type { BookingDisplayStatus, BookingRequest, RadarNotification } from '../types';

export const bookingFilterKeys = ['all', 'pending', 'accepted', 'completed', 'rejected', 'cancelled'] as const;
export type BookingFilter = typeof bookingFilterKeys[number];

export function bookingStatusOf(booking: Pick<BookingRequest, 'status' | 'display_status'>): BookingDisplayStatus {
  return booking.display_status || booking.status;
}

/** Waiting for the owner's decision; also covers sponsored profiles not yet activated by their owner. */
export function isUndecided(status: BookingDisplayStatus) {
  return status === 'pending' || status === 'awaiting_owner_activation';
}

export function matchesBookingFilter(booking: Pick<BookingRequest, 'status' | 'display_status'>, filter: BookingFilter) {
  const status = bookingStatusOf(booking);
  if (filter === 'all') return true;
  if (filter === 'pending') return isUndecided(status);
  return status === filter;
}

export function bookingCounts(bookings: Array<Pick<BookingRequest, 'status' | 'display_status'>>) {
  return Object.fromEntries(bookingFilterKeys.map((key) => [key, bookings.filter((booking) => matchesBookingFilter(booking, key)).length])) as Record<BookingFilter, number>;
}

export function formatBookingSlot(booking: Pick<BookingRequest, 'requested_date' | 'requested_time'>, locale: string) {
  const [year, month, day] = String(booking.requested_date || '').split('-').map(Number);
  const date = year && month && day
    ? new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
    : booking.requested_date;
  return `${date} · ${String(booking.requested_time || '').slice(0, 5)}`;
}

export function isBookingNotification(notification: Pick<RadarNotification, 'event_type'>) {
  return notification.event_type.startsWith('booking_');
}
