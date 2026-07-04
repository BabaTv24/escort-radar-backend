import { useEffect, useState } from 'react';
import { Gift, History, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { ClientActivation, CoinTransaction, CoinWallet, Gift as GiftRow } from '../types';
import { EmptyState } from '../components/LoadingState';
import { useI18n } from '../i18n';

export function CoinWalletPage() {
  const [wallet, setWallet] = useState<CoinWallet | null>(null);
  const [activation, setActivation] = useState<ClientActivation | null>(null);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [giftsSent, setGiftsSent] = useState<GiftRow[]>([]);
  const [giftsReceived, setGiftsReceived] = useState<GiftRow[]>([]);
  const [message, setMessage] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.access_token) {
        setMessage(t('coins.loginRequired'));
        return;
      }
      try {
        const result = await api.clientActivationMe(data.session.access_token);
        setWallet(result.wallet);
        setActivation(result.activation);
        setTransactions(result.transactions);
        setGiftsSent(result.gifts_sent);
        setGiftsReceived(result.gifts_received);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
      }
    });
  }, [t]);

  return (
    <div className="page coin-wallet-page">
      <section className="token-hero coin-wallet-hero">
        <div>
          <p className="eyebrow">{t('coins.eyebrow')}</p>
          <h1><WalletCards size={34} /> {t('coins.title')}</h1>
          <p>{t('coins.subtitle')}</p>
        </div>
        <div className="token-balance-card coin-balance-card">
          <span>{t('coins.balance')}</span>
          <strong>{Math.round(Number(wallet?.balance || 0))}</strong>
          <small>{t(`coins.state.${activation?.state || 'client_free'}`)}</small>
        </div>
        {activation?.state !== 'client_activated' && <Link className="button primary" to="/dashboard">{t('coins.activateAccount')}</Link>}
      </section>

      <section className="coin-metric-grid">
        <article className="coin-metric-card"><span>{t('coins.lifetimeEarned')}</span><strong>{Math.round(Number(wallet?.lifetime_earned || 0))}</strong></article>
        <article className="coin-metric-card"><span>{t('coins.lifetimeSpent')}</span><strong>{Math.round(Number(wallet?.lifetime_spent || 0))}</strong></article>
        <article className="coin-metric-card"><span>{t('coins.giftsSent')}</span><strong>{giftsSent.length}</strong></article>
        <article className="coin-metric-card"><span>{t('coins.giftsReceived')}</span><strong>{giftsReceived.length}</strong></article>
      </section>

      <section className="coin-wallet-grid">
        <article className="coin-wallet-panel">
          <h2><History size={18} /> {t('coins.transactions')}</h2>
          <div className="coin-row-list">
            {transactions.map((transaction) => (
              <div className="coin-row" key={transaction.id}>
                <div>
                  <strong>{transaction.transaction_type}</strong>
                  <p>{new Date(transaction.created_at).toLocaleString()}</p>
                </div>
                <span className={transaction.direction === 'credit' ? 'success' : 'error-text'}>
                  {transaction.direction === 'credit' ? '+' : '-'}{transaction.amount} Coins
                </span>
              </div>
            ))}
            {!transactions.length && <EmptyState title={t('coins.noTransactions')} message={t('coins.noTransactionsText')} />}
          </div>
        </article>

        <article className="coin-wallet-panel">
          <h2><Gift size={18} /> {t('coins.giftsSent')}</h2>
          <GiftList rows={giftsSent} emptyLabel={t('coins.noGifts')} />
        </article>

        <article className="coin-wallet-panel">
          <h2><Gift size={18} /> {t('coins.giftsReceived')}</h2>
          <GiftList rows={giftsReceived} emptyLabel={t('coins.noGifts')} />
        </article>
      </section>

      {message && <p className="state-panel error-text">{message}</p>}
    </div>
  );
}

function GiftList({ rows, emptyLabel }: { rows: GiftRow[]; emptyLabel: string }) {
  if (!rows.length) return <p className="muted">{emptyLabel}</p>;
  return (
    <div className="coin-row-list">
      {rows.map((gift) => (
        <div className="coin-row" key={gift.id}>
          <div>
            <strong>{gift.gift_type}</strong>
            <p>{new Date(gift.created_at).toLocaleString()}</p>
          </div>
          <span>{gift.coin_cost} Coins</span>
        </div>
      ))}
    </div>
  );
}
