import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, RefreshCw, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { bookingStatusOf, formatBookingSlot, isUndecided } from '../../lib/bookingView';
import { useI18n } from '../../i18n';
import type { BookingDisplayStatus, BookingRequest } from '../../types';
import { BookingStatusBadge } from '../bookings/BookingStatusBadge';
import '../bookings/bookings.css';

type LoadState = 'loading' | 'ready' | 'error' | 'locked';
type Tab = 'incoming' | 'upcoming' | 'history';
const REFRESH_MS = 30_000;

const tabOf = (status: BookingDisplayStatus): Tab => (isUndecided(status) ? 'incoming' : status === 'accepted' ? 'upcoming' : 'history');

/** Advertiser dashboard: incoming booking requests for every profile owned by the account (individual or business). */
export function AdvertiserBookingsSection({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [tab, setTab] = useState<Tab>('incoming');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.myBookingRequests(token);
      setBookings(result.booking_requests);
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 403 ? 'locked' : 'error');
    }
  }, [token]);

  useEffect(() => {
    void load();
    void api.markBookingNotificationsRead(token).catch(() => undefined);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, token]);

  const grouped = useMemo(() => {
    const groups: Record<Tab, BookingRequest[]> = { incoming: [], upcoming: [], history: [] };
    for (const booking of bookings) groups[tabOf(bookingStatusOf(booking))].push(booking);
    groups.upcoming.sort((a, b) => `${a.requested_date}${a.requested_time}`.localeCompare(`${b.requested_date}${b.requested_time}`));
    return groups;
  }, [bookings]);
  const profileCount = useMemo(() => new Set(bookings.map((booking) => booking.profile_id)).size, [bookings]);

  async function changeStatus(booking: BookingRequest, status: 'accepted' | 'rejected' | 'cancelled') {
    if (status !== 'accepted' && !window.confirm(t(status === 'rejected' ? 'bookings.advertiser.declineConfirm' : 'bookings.advertiser.cancelConfirm'))) return;
    setBusyId(booking.id);
    setFeedback(null);
    try {
      await api.setBookingStatus(token, booking.id, status);
      setFeedback({ tone: 'success', text: t(`bookings.advertiser.changed.${status}`) });
    } catch (error) {
      const code = error instanceof ApiError ? String(error.payload?.code || '') : '';
      setFeedback({ tone: 'error', text: t(code === 'BOOKING_TRANSITION_INVALID' || code === 'BOOKING_STATUS_CHANGED' ? 'bookings.advertiser.staleError' : 'bookings.advertiser.changeError') });
    } finally {
      setBusyId(null);
      await load();
    }
  }

  const visible = grouped[tab];

  return (
    <section className="advertiser-stage-three er-bookings-section" aria-labelledby="advertiser-bookings-title" aria-busy={state === 'loading'}>
      <header className="advertiser-dashboard-heading compact">
        <div>
          <p className="eyebrow">Escort Radar</p>
          <h1 id="advertiser-bookings-title">{t('advertiserDashboard.section.bookings')}</h1>
          <p>{t('bookings.advertiser.subtitle')}</p>
        </div>
        <button className="er-bookings-icon-button" type="button" onClick={() => void load()} aria-label={t('bookings.refresh')}>
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="er-bookings-filters" role="tablist" aria-label={t('bookings.filterLabel')}>
        {(['incoming', 'upcoming', 'history'] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {t(`bookings.advertiser.tab.${key}`)} <span>{grouped[key].length}</span>
          </button>
        ))}
      </div>

      {feedback ? <p className={feedback.tone === 'success' ? 'success' : 'error-text'} role={feedback.tone === 'success' ? 'status' : 'alert'}>{feedback.text}</p> : null}

      {state === 'loading' ? <div className="er-bookings-skeleton" aria-label={t('states.loading')}><i /><i /><i /></div> : null}
      {state === 'locked' ? <div className="advertiser-data-state"><p>{t('bookings.advertiser.locked')}</p></div> : null}
      {state === 'error' ? (
        <div className="advertiser-data-state error" role="alert">
          <p>{t('bookings.loadError')}</p>
          <button type="button" className="button primary" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" /> {t('advertiserDashboard.retry')}</button>
        </div>
      ) : null}
      {state === 'ready' && !visible.length ? (
        <div className="advertiser-data-state">
          <CalendarDays size={24} aria-hidden="true" />
          <p>{t(`bookings.advertiser.empty.${tab}`)}</p>
        </div>
      ) : null}
      {state === 'ready' && visible.length ? (
        <ul className="er-bookings-list advertiser-dashboard-panel">
          {visible.map((booking) => {
            const status = bookingStatusOf(booking);
            const busy = busyId === booking.id;
            return (
              <li key={booking.id} className="er-bookings-row">
                <div className="er-bookings-row-main">
                  <strong>{formatBookingSlot(booking, lang)} · {t('bookings.duration', { minutes: booking.duration_minutes })}</strong>
                  <span>{booking.client_display_name || t('bookings.advertiser.clientFallback')} · <a href={`mailto:${booking.requester_email}`}>{booking.requester_email}</a></span>
                  {profileCount > 1 && booking.profiles?.display_name ? <span>{t('bookings.advertiser.forProfile', { name: booking.profiles.display_name })}</span> : null}
                  {booking.message ? <small>„{booking.message}”</small> : null}
                  <small>{t('bookings.advertiser.receivedAt', { date: new Date(booking.created_at).toLocaleString(lang) })}</small>
                </div>
                <div className="er-bookings-row-side">
                  <BookingStatusBadge status={status} />
                  {status === 'pending' ? (
                    <div className="er-bookings-actions">
                      <button type="button" className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" disabled={busy} onClick={() => void changeStatus(booking, 'accepted')}>
                        <Check size={15} aria-hidden="true" /> <span>{t('bookings.advertiser.accept')}</span>
                      </button>
                      <button type="button" className="button er-btn er-glass-btn er-glass-btn--red er-glass-btn--sm" disabled={busy} onClick={() => void changeStatus(booking, 'rejected')}>
                        <X size={15} aria-hidden="true" /> <span>{t('bookings.advertiser.decline')}</span>
                      </button>
                    </div>
                  ) : null}
                  {status === 'accepted' ? (
                    <button type="button" className="button er-btn er-glass-btn er-glass-btn--red er-glass-btn--sm" disabled={busy} onClick={() => void changeStatus(booking, 'cancelled')}>
                      <span>{t('bookings.advertiser.cancel')}</span>
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
