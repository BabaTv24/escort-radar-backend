import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, WalletCards } from 'lucide-react';
import { api } from '../../lib/api';
import type { BcuLedgerEntry, BcuWallet } from '../../types';
import { useI18n } from '../../i18n';

type LoadState = 'loading' | 'success' | 'error';

export function AdvertiserWalletSection({ token }: { token: string }) {
  const { t } = useI18n();
  const [wallet, setWallet] = useState<BcuWallet | null>(null);
  const [ledger, setLedger] = useState<BcuLedgerEntry[]>([]);
  const [status, setStatus] = useState<LoadState>('loading');

  const loadWallet = useCallback(async () => {
    setStatus('loading');
    try {
      const walletResult = await api.bcuWallet(token);
      const ledgerResult = await api.bcuLedger(token).catch(() => ({ ledger: [] as BcuLedgerEntry[] }));
      setWallet(walletResult.wallet);
      setLedger(ledgerResult.ledger.slice(0, 5));
      setStatus('success');
    } catch {
      setWallet(null);
      setLedger([]);
      setStatus('error');
    }
  }, [token]);

  useEffect(() => { void loadWallet(); }, [loadWallet]);

  return (
    <section className="advertiser-stage-three" aria-labelledby="advertiser-wallet-title" aria-busy={status === 'loading'}>
      <header className="advertiser-dashboard-heading compact">
        <div>
          <p className="eyebrow">Escort Radar</p>
          <h1 id="advertiser-wallet-title">{t('advertiserDashboard.wallet.title')}</h1>
          <p>{t('advertiserDashboard.wallet.subtitle')}</p>
        </div>
        <WalletCards size={30} aria-hidden="true" />
      </header>

      {status === 'loading' ? <WalletSkeleton /> : null}
      {status === 'error' ? (
        <DataState className="error" title={t('advertiserDashboard.wallet.error')}>
          <button type="button" className="button primary" onClick={() => void loadWallet()}>
            <RefreshCw size={16} aria-hidden="true" /> {t('advertiserDashboard.retry')}
          </button>
        </DataState>
      ) : null}
      {status === 'success' && !wallet ? (
        <DataState title={t('advertiserDashboard.wallet.empty')}>
          <button type="button" className="button" onClick={() => void loadWallet()}>
            <RefreshCw size={16} aria-hidden="true" /> {t('advertiserDashboard.retry')}
          </button>
        </DataState>
      ) : null}
      {status === 'success' && wallet ? (
        <>
          <div className="advertiser-wallet-grid">
            <article className="advertiser-wallet-balance advertiser-dashboard-panel">
              <span>{t('advertiserDashboard.wallet.available')}</span>
              <strong>{wallet.available_balance_bc ?? wallet.balance_bc} <small>BC</small></strong>
              <p>{t('advertiserDashboard.wallet.purpose')}</p>
            </article>
            <article className="advertiser-wallet-metric advertiser-dashboard-panel">
              <span>{t('advertiserDashboard.wallet.locked')}</span>
              <strong>{wallet.locked_balance_bc ?? '0'} BC</strong>
              <small>{t('advertiserDashboard.wallet.lockedHint')}</small>
            </article>
          </div>
          <section className="advertiser-dashboard-panel advertiser-wallet-history" aria-labelledby="advertiser-wallet-history-title">
            <div className="advertiser-dashboard-panel-head">
              <div>
                <p className="eyebrow">{t('advertiserDashboard.wallet.activityEyebrow')}</p>
                <h2 id="advertiser-wallet-history-title">{t('advertiserDashboard.wallet.activity')}</h2>
              </div>
            </div>
            {ledger.length ? (
              <div className="advertiser-wallet-ledger">
                {ledger.map((entry, index) => (
                  <article key={`${entry.created_at}:${entry.transaction_type}:${index}`}>
                    <div>
                      <strong>{entry.transaction_type === 'favorite_received'
                        ? t('favorites.receivedAnonymous')
                        : t(entry.direction === 'credit' ? 'advertiserDashboard.wallet.credit' : 'advertiserDashboard.wallet.debit')}</strong>
                      <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time>
                    </div>
                    <span className={entry.direction}>{entry.direction === 'credit' ? '+' : '-'}{entry.amount_bc} BC</span>
                  </article>
                ))}
              </div>
            ) : <p className="advertiser-dashboard-empty-note muted">{t('advertiserDashboard.wallet.noActivity')}</p>}
          </section>
        </>
      ) : null}
    </section>
  );
}

function WalletSkeleton() {
  return <div className="advertiser-wallet-skeleton" aria-label="Loading"><i /><i /><i /></div>;
}

function DataState({ className = '', title, children }: { className?: string; title: string; children: ReactNode }) {
  return <div className={`advertiser-data-state ${className}`}><p>{title}</p>{children}</div>;
}
