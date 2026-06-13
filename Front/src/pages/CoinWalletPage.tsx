import { useEffect, useState } from 'react';
import { Gift, History, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { ClientActivation, CoinTransaction, CoinWallet, Gift as GiftRow } from '../types';

export function CoinWalletPage() {
  const [wallet, setWallet] = useState<CoinWallet | null>(null);
  const [activation, setActivation] = useState<ClientActivation | null>(null);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [giftsSent, setGiftsSent] = useState<GiftRow[]>([]);
  const [giftsReceived, setGiftsReceived] = useState<GiftRow[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.access_token) {
        setMessage('Login required to view Coin Wallet.');
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
        setMessage(error instanceof Error ? error.message : 'Request failed.');
      }
    });
  }, []);

  return (
    <div className="page token-page">
      <section className="token-hero">
        <p className="eyebrow">Variant B</p>
        <h1><WalletCards size={34} /> Coin Wallet</h1>
        <p>Coins are client-side platform credits for gifts, VIP gallery unlocks, and future live-cam access.</p>
        <div className="token-balance-card">
          <span>Balance</span>
          <strong>{Math.round(Number(wallet?.balance || 0))}</strong>
          <small>{activation?.state || 'client_free'}</small>
        </div>
        {activation?.state !== 'client_activated' && <Link className="button primary" to="/dashboard">Activate account</Link>}
      </section>

      <section className="admin-metric-grid">
        <article className="admin-card stat"><span>Lifetime earned</span><strong>{Math.round(Number(wallet?.lifetime_earned || 0))}</strong></article>
        <article className="admin-card stat"><span>Lifetime spent</span><strong>{Math.round(Number(wallet?.lifetime_spent || 0))}</strong></article>
        <article className="admin-card stat"><span>Gifts sent</span><strong>{giftsSent.length}</strong></article>
        <article className="admin-card stat"><span>Gifts received</span><strong>{giftsReceived.length}</strong></article>
      </section>

      <section className="profile-info-grid">
        <article className="info-panel">
          <h2><History size={18} /> Transactions</h2>
          <div className="booking-list">
            {transactions.map((transaction) => (
              <div className="booking-row" key={transaction.id}>
                <div>
                  <strong>{transaction.transaction_type}</strong>
                  <p>{new Date(transaction.created_at).toLocaleString()}</p>
                </div>
                <span className={transaction.direction === 'credit' ? 'success' : 'error-text'}>
                  {transaction.direction === 'credit' ? '+' : '-'}{transaction.amount} Coins
                </span>
              </div>
            ))}
            {!transactions.length && <p className="muted">No coin transactions yet.</p>}
          </div>
        </article>

        <article className="info-panel">
          <h2><Gift size={18} /> Gifts sent</h2>
          <GiftList rows={giftsSent} />
        </article>

        <article className="info-panel">
          <h2><Gift size={18} /> Gifts received</h2>
          <GiftList rows={giftsReceived} />
        </article>
      </section>

      {message && <p className="state-panel error-text">{message}</p>}
    </div>
  );
}

function GiftList({ rows }: { rows: GiftRow[] }) {
  if (!rows.length) return <p className="muted">No gifts yet.</p>;
  return (
    <div className="booking-list">
      {rows.map((gift) => (
        <div className="booking-row" key={gift.id}>
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
