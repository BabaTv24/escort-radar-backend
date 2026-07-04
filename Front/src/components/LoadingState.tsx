import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  const text = label || t('states.loading');
  return (
    <div className="premium-state-card loading" role="status" aria-live="polite">
      <div className="premium-state-shimmer" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <strong>{text}</strong>
      <p>{t('states.loadingHint')}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="premium-state-card error" role="alert" aria-live="assertive">
      <strong>{t('states.errorTitle')}</strong>
      <p>{message || t('states.requestFailed')}</p>
      {onRetry && <button className="button primary" type="button" onClick={onRetry}>{t('states.retry')}</button>}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title?: string; message?: string; action?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="premium-state-card empty" role="status" aria-live="polite">
      <strong>{title || t('states.emptyTitle')}</strong>
      <p>{message || t('states.emptyHint')}</p>
      {action}
    </div>
  );
}
