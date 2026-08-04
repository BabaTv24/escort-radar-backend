import { CalendarDays, MessageCircle, ShieldCheck, Video } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import type { CommunicationPlusStatus } from '../lib/api';

type Props = {
  state: 'loading' | 'error' | 'ready';
  status: CommunicationPlusStatus | null;
  purchasing: boolean;
  purchaseError: string | null;
  onPurchase: () => void;
  onRetry: () => void;
};

export function CommunicationPlusCard({ state, status, purchasing, purchaseError, onPurchase, onRetry }: Props) {
  const { t } = useI18n();

  return (
    <section className="client-office-card communication-plus-card" id="communication-plus">
      <div className="client-office-card-header">
        <div>
          <p className="eyebrow">{t('communicationPlus.eyebrow')}</p>
          <h2>{t('communicationPlus.title')}</h2>
        </div>
        <ShieldCheck size={22} />
      </div>

      {state === 'loading' ? (
        <div className="communication-plus-state" aria-live="polite">
          <span className="communication-plus-skeleton" />
          <span className="communication-plus-skeleton short" />
          <p>{t('communicationPlus.loading')}</p>
        </div>
      ) : null}

      {state === 'error' ? (
        <div className="communication-plus-state" role="alert">
          <p>{t('communicationPlus.loadError')}</p>
          <button className="button er-btn er-glass-btn er-glass-btn--gold" type="button" onClick={onRetry}>{t('communicationPlus.retry')}</button>
        </div>
      ) : null}

      {state === 'ready' && status ? (
        <>
          <div className="communication-plus-features" aria-label={t('communicationPlus.featuresLabel')}>
            <span><MessageCircle size={16} /> {t('communicationPlus.liveChat')} <small>{t('communicationPlus.comingSoon')}</small></span>
            <span><Video size={16} /> {t('communicationPlus.liveVideo')} <small>{t('communicationPlus.comingSoon')}</small></span>
            <span><CalendarDays size={16} /> {t('communicationPlus.booking')} <small>{t('communicationPlus.comingSoon')}</small></span>
          </div>

          {status.communication_plus_active ? (
            <div className="communication-plus-active" role="status">
              <ShieldCheck size={18} />
              <div><strong>{t('communicationPlus.active')}</strong><p>{t('communicationPlus.activeCopy')}</p></div>
            </div>
          ) : !status.client_premium_active ? (
            <div className="communication-plus-state">
              <p>{t('communicationPlus.premiumRequired')}</p>
              <Link className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" to="/pricing?product=client_activation">{t('communicationPlus.activatePremium')}</Link>
            </div>
          ) : !status.sufficient_balance ? (
            <div className="communication-plus-state">
              <strong>{t('communicationPlus.price', { price: status.price_bc })}</strong>
              <p>{t('communicationPlus.insufficient', { balance: status.available_balance_bc })}</p>
              <Link className="button primary er-btn er-glass-btn er-glass-btn--purple er-glass-btn--block" to="/coins">{t('communicationPlus.addCoins')}</Link>
            </div>
          ) : (
            <div className="communication-plus-state">
              <strong>{t('communicationPlus.price', { price: status.price_bc })}</strong>
              <p>{t('communicationPlus.oneTime')}</p>
              <button className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" type="button" disabled={purchasing} onClick={onPurchase}>
                {purchasing ? t('communicationPlus.purchasing') : t('communicationPlus.unlock', { price: status.price_bc })}
              </button>
            </div>
          )}
          {purchaseError ? <p className="communication-plus-error" role="alert">{purchaseError}</p> : null}
        </>
      ) : null}
    </section>
  );
}
