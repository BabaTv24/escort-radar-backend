import { useI18n } from '../i18n';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  const text = label || t('states.loading');
  return <div className="state-panel">{text}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return <div className="state-panel error">
    <span>{message || t('states.requestFailed')}</span>
    {onRetry && <button className="button" type="button" onClick={onRetry}>Retry</button>}
  </div>;
}
