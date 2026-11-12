import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, CalendarDays, Coins, Heart, Lock, MessageCircle, WalletCards } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n';
import type { AdvertiserActivity } from '../../types';
import type { AdvertiserDashboardSection } from './AdvertiserDashboardShell';
import './businessActivity.css';

const REFRESH_MS = 30_000;

/** Polls the server-side business counters; `refresh` is called after mutations in the sections. */
export function useAdvertiserActivity(token: string) {
  const [activity, setActivity] = useState<AdvertiserActivity | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setActivity(await api.advertiserActivity(token));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { activity, failed, refresh };
}

/** Sidebar badge counts, keyed by dashboard section. */
export function activityBadges(activity: AdvertiserActivity | null): Partial<Record<AdvertiserDashboardSection, number>> {
  if (!activity) return {};
  return { bookings: activity.new_bookings, messages: activity.unread_messages, wallet: activity.new_admirers };
}

export function AdvertiserActivityCounters({ activity, failed, onOpen }: {
  activity: AdvertiserActivity | null;
  failed: boolean;
  onOpen: (section: AdvertiserDashboardSection) => void;
}) {
  const { t } = useI18n();
  const value = (count: number | string | undefined) => (activity ? String(count ?? '—') : '…');
  const counters: Array<{ key: string; label: string; count: number | string | undefined; section: AdvertiserDashboardSection; Icon: typeof Heart; highlight?: boolean }> = [
    { key: 'new-bookings', label: t('activity.newBookings'), count: activity?.new_bookings, section: 'bookings', Icon: CalendarDays, highlight: Boolean(activity?.new_bookings) },
    { key: 'new-messages', label: t('activity.newMessages'), count: activity?.unread_messages, section: 'messages', Icon: MessageCircle, highlight: Boolean(activity?.unread_messages) },
    { key: 'new-admirers', label: t('activity.newAdmirers'), count: activity?.new_admirers, section: 'wallet', Icon: Heart, highlight: Boolean(activity?.new_admirers) },
    { key: 'active-bookings', label: t('activity.activeBookings'), count: activity?.active_bookings, section: 'bookings', Icon: CalendarCheck2 }
  ];
  if (!activity || activity.wallet) {
    counters.push(
      { key: 'available-bc', label: t('activity.availableBc'), count: activity?.wallet?.available_bc, section: 'wallet', Icon: WalletCards },
      { key: 'locked-bc', label: t('activity.lockedBc'), count: activity?.wallet?.locked_bc, section: 'wallet', Icon: Lock }
    );
  }

  return (
    <section className="er-activity" aria-labelledby="er-activity-title">
      <h2 id="er-activity-title" className="er-activity-title pr-eyebrow">{t('activity.title')}</h2>
      {failed && !activity ? <p className="pr-notice is-error" role="alert">{t('activity.loadError')}</p> : null}
      <div className="er-activity-grid">
        {counters.map(({ key, label, count, section, Icon, highlight }) => (
          <button key={key} type="button" className={`pr-kpi er-activity-counter${highlight ? ' highlight' : ''}`} data-counter={key} onClick={() => onOpen(section)}>
            <span className={`pr-icon-chip${key === 'new-messages' ? ' is-violet' : ''}`}><Icon size={18} aria-hidden="true" /></span>
            <strong className="pr-kpi-value">{value(count)}</strong>
            <span className="pr-kpi-label">{label}</span>
          </button>
        ))}
      </div>
      {activity && activity.admirers_total ? <p className="er-activity-note"><Heart size={14} aria-hidden="true" /> {t('activity.admirersTotal', { count: activity.admirers_total })}</p> : null}
    </section>
  );
}

/** "Digitale Einnahmen": completed ledger credits per source. Booking fees are listed apart from digital earnings. */
export function DigitalRevenuePanel({ activity }: { activity: AdvertiserActivity | null }) {
  const { t } = useI18n();
  const revenue = activity?.revenue;
  if (!activity || !revenue) return null;
  const rows = [
    { key: 'gifts', label: t('revenue.gifts'), line: revenue.gifts ?? { bc: '0', count: 0 } },
    { key: 'favorites', label: t('revenue.favorites'), line: revenue.favorites },
    { key: 'text-chat', label: t('revenue.textChat'), line: revenue.text_chat },
    { key: 'video-chat', label: t('revenue.videoChat'), line: revenue.video_chat, note: t('revenue.videoUnavailable') }
  ];
  return (
    <section className="er-revenue pr-card" aria-labelledby="er-revenue-title">
      <div className="pr-card-head">
        <div>
          <p className="pr-eyebrow">{t('revenue.eyebrow')}</p>
          <h2 className="pr-h2" id="er-revenue-title">{t('revenue.title')}</h2>
        </div>
      </div>
      <dl className="er-revenue-list">
        {rows.map(({ key, label, line, note }) => (
          <div key={key} data-revenue={key}>
            <dt>{label}{note ? <small>{note}</small> : <small>{t('revenue.transactions', { count: line.count })}</small>}</dt>
            <dd>{line.bc} BC</dd>
          </div>
        ))}
        <div className="er-revenue-total" data-revenue="total">
          <dt>{t('revenue.total')}</dt>
          <dd>{revenue.digital_total_bc} BC</dd>
        </div>
      </dl>
      <p className="er-revenue-footnote" data-revenue="booking-fees">
        {t('revenue.bookingFees', { amount: revenue.booking_fees.bc, count: revenue.booking_fees.count })}
      </p>
      <p className="er-revenue-footnote">{t('revenue.ledgerNote')}</p>
    </section>
  );
}

/** Overview card: the digital earnings total from the same ledger-based revenue lines as the Earnings section. */
export function DigitalEarningsSummary({ activity, onOpen }: { activity: AdvertiserActivity | null; onOpen: () => void }) {
  const { t } = useI18n();
  const revenue = activity?.revenue;
  return (
    <section className="pr-card is-highlight" aria-labelledby="er-earnings-summary">
      <div className="pr-card-head">
        <div>
          <p className="pr-eyebrow">{t('revenue.eyebrow')}</p>
          <h2 className="pr-h2" id="er-earnings-summary">{t('revenue.title')}</h2>
        </div>
        <span className="pr-icon-chip"><Coins size={18} aria-hidden="true" /></span>
      </div>
      <div className="pr-balance">
        <span className="pr-balance-value">{revenue ? revenue.digital_total_bc : '…'}<small>BC</small></span>
        <span className="pr-muted">{t('revenue.total')}</span>
      </div>
      {revenue ? (
        <dl className="pr-dl">
          <div><dt>{t('revenue.textChat')}</dt><dd className="pr-num">{revenue.text_chat.bc} BC</dd></div>
          <div><dt>{t('revenue.gifts')}</dt><dd className="pr-num">{(revenue.gifts ?? { bc: '0' }).bc} BC</dd></div>
        </dl>
      ) : null}
      <button type="button" className="pr-btn" onClick={onOpen}>{t('businessCenter.details')}</button>
    </section>
  );
}
