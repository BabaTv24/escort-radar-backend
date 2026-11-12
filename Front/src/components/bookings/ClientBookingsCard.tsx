import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarDays, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { bookingCounts, bookingFilterKeys, bookingStatusOf, formatBookingSlot, isBookingNotification, isUndecided, matchesBookingFilter, type BookingFilter } from '../../lib/bookingView';
import { useI18n } from '../../i18n';
import type { BookingRequest, RadarNotification } from '../../types';
import { BookingStatusBadge } from './BookingStatusBadge';
import './bookings.css';

type LoadState = 'loading' | 'ready' | 'error';

const BOOKINGS_PAGE_SIZE = 8;

/** Private Client Office: the client's own booking requests, their status history and booking notifications. */
export function ClientBookingsCard({ token, notifications }: { token: string; notifications: RadarNotification[] }) {
  const { t, lang } = useI18n();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [filter, setFilter] = useState<BookingFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  // Long histories are paged so the office does not turn into one endless list.
  const [pageSize, setPageSize] = useState(BOOKINGS_PAGE_SIZE);

  const load = useCallback(async () => {
    setState((current) => (current === 'ready' ? current : 'loading'));
    try {
      const result = await api.myClientBookings(token);
      setBookings(result.booking_requests);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => bookingCounts(bookings), [bookings]);
  const visible = useMemo(() => bookings.filter((booking) => matchesBookingFilter(booking, filter)), [bookings, filter]);
  const bookingNotifications = useMemo(() => notifications.filter(isBookingNotification).slice(0, 5), [notifications]);
  const unread = bookingNotifications.filter((item) => !item.read_at && (!readAt || item.created_at > readAt)).length;

  async function cancel(booking: BookingRequest) {
    if (!window.confirm(t('bookings.client.cancelConfirm'))) return;
    setBusyId(booking.id);
    setFeedback(null);
    try {
      await api.cancelClientBooking(token, booking.id);
      // Refresh first so the confirmation never appears next to a stale status.
      await load();
      setFeedback({ tone: 'success', text: t('bookings.client.cancelled') });
    } catch {
      await load();
      setFeedback({ tone: 'error', text: t('bookings.client.cancelError') });
    } finally {
      setBusyId(null);
    }
  }

  async function markRead() {
    try {
      await api.markBookingNotificationsRead(token);
      setReadAt(new Date().toISOString());
    } catch {
      setFeedback({ tone: 'error', text: t('bookings.notifications.readError') });
    }
  }

  return (
    <section className="client-office-card er-bookings-card" id="bookings" aria-labelledby="client-bookings-title" aria-busy={state === 'loading'}>
      <div className="client-office-card-header">
        <div>
          <p className="eyebrow">{t('bookings.client.eyebrow')}</p>
          <h2 id="client-bookings-title">{t('bookings.client.title')}</h2>
          <p>{t('bookings.client.subtitle')}</p>
        </div>
        <button className="er-bookings-icon-button" type="button" onClick={() => void load()} aria-label={t('bookings.refresh')}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      {bookingNotifications.length ? (
        <div className="er-bookings-notifications" aria-label={t('bookings.notifications.title')}>
          <div className="er-bookings-notifications-head">
            <strong><Bell size={14} aria-hidden="true" /> {t('bookings.notifications.title')}{unread ? <span className="er-bookings-count">{unread}</span> : null}</strong>
            {unread ? <button type="button" className="text-button" onClick={() => void markRead()}>{t('bookings.notifications.markRead')}</button> : null}
          </div>
          <ul>
            {bookingNotifications.map((item) => (
              <li key={item.id} className={!item.read_at && (!readAt || item.created_at > readAt) ? 'unread' : ''}>
                <span>{t(`bookings.notification.${item.event_type}`) === `bookings.notification.${item.event_type}` ? item.title : t(`bookings.notification.${item.event_type}`)}</span>
                <small>{item.body} · {new Date(item.created_at).toLocaleString(lang)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="er-bookings-filters" role="tablist" aria-label={t('bookings.filterLabel')}>
        {bookingFilterKeys.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => { setFilter(key); setPageSize(BOOKINGS_PAGE_SIZE); }}>
            {t(`bookings.filter.${key}`)} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      {feedback ? <p className={feedback.tone === 'success' ? 'success' : 'error-text'} role={feedback.tone === 'success' ? 'status' : 'alert'}>{feedback.text}</p> : null}

      {state === 'loading' ? <div className="er-bookings-skeleton" aria-label={t('states.loading')}><i /><i /><i /></div> : null}
      {state === 'error' ? (
        <div className="market-empty-state" role="alert">
          <p>{t('bookings.loadError')}</p>
          <button className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" type="button" onClick={() => void load()}><span>{t('states.retry')}</span></button>
        </div>
      ) : null}
      {state === 'ready' && !visible.length ? (
        <div className="market-empty-state">
          <CalendarDays size={18} aria-hidden="true" />
          <p>{bookings.length ? t('bookings.emptyFilter') : t('bookings.client.empty')}</p>
          {!bookings.length ? <Link className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to="/city/berlin"><span>{t('clientOffice.viewNearby')}</span></Link> : null}
        </div>
      ) : null}
      {state === 'ready' && visible.length ? (
        <ul className="er-bookings-list">
          {visible.slice(0, pageSize).map((booking) => {
            const status = bookingStatusOf(booking);
            return (
              <li key={booking.id} className="er-bookings-row">
                <div className="er-bookings-row-main">
                  {booking.profiles?.id
                    ? <Link to={`/profile/${booking.profiles.id}`}><strong>{booking.profiles.display_name || t('bookings.profileFallback')}</strong></Link>
                    : <strong>{t('bookings.profileFallback')}</strong>}
                  <span>{formatBookingSlot(booking, lang)} · {t('bookings.duration', { minutes: booking.duration_minutes })}</span>
                  {booking.message ? <small>{booking.message}</small> : null}
                </div>
                <div className="er-bookings-row-side">
                  <BookingStatusBadge status={status} />
                  {isUndecided(status) ? (
                    <button type="button" className="button er-btn er-glass-btn er-glass-btn--red er-glass-btn--sm" disabled={busyId === booking.id} onClick={() => void cancel(booking)}>
                      <span>{busyId === booking.id ? t('states.loading') : t('bookings.client.cancel')}</span>
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {state === 'ready' && visible.length > pageSize ? (
        <button type="button" className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm er-bookings-more" onClick={() => setPageSize((size) => size + BOOKINGS_PAGE_SIZE)}>
          <span>{t('bookings.showMore', { shown: Math.min(pageSize, visible.length), total: visible.length })}</span>
        </button>
      ) : null}
    </section>
  );
}
