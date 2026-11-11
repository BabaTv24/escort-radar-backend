import { useI18n } from '../../i18n';
import type { BookingDisplayStatus } from '../../types';

/** Status text is always visible: colour is never the only carrier of the status. */
export function BookingStatusBadge({ status }: { status: BookingDisplayStatus }) {
  const { t } = useI18n();
  return <span className={`er-booking-status is-${status}`}>{t(`status.${status}`)}</span>;
}
