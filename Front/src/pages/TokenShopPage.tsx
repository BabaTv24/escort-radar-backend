import { useEffect, useState } from 'react';
import { Coins, Gem, LockKeyhole, RadioTower, Sparkles, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { TokenPackage, Wallet } from '../types';
import { useI18n } from '../i18n';

const tokenUses = ['listing', 'boost', 'liveCam', 'chat', 'gallery', 'booking', 'tips', 'spotlight'];
const tokenProductCodes: Record<number, string> = {
  66: 'bc_66',
  166: 'bc_166',
  666: 'bc_666',
  1200: 'bc_1200',
  2560: 'bc_2560',
  5200: 'bc_5200',
  10200: 'bc_10200'
};

function formatEuro(value: number) {
  return `${value.toFixed(2).replace('.', ',')} EUR`;
}

function isPromotionActive(tokenPackage: TokenPackage, now: number) {
  const start = tokenPackage.promotion_starts_at ? new Date(tokenPackage.promotion_starts_at).getTime() : 0;
  const end = tokenPackage.promotion_ends_at ? new Date(tokenPackage.promotion_ends_at).getTime() : 0;
  if (!end || !Number.isFinite(end)) return false;
  if (start && Number.isFinite(start) && now < start) return false;
  return now < end;
}

function isPromotionExpired(tokenPackage: TokenPackage, now: number) {
  const end = tokenPackage.promotion_ends_at ? new Date(tokenPackage.promotion_ends_at).getTime() : 0;
  return Boolean(end && Number.isFinite(end) && now >= end);
}

function formatPromoCountdown(value: string, now: number) {
  const end = new Date(value).getTime();
  const totalMinutes = Math.max(0, Math.floor((end - now) / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

export function TokenShopPage() {
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [message, setMessage] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [now, setNow] = useState(Date.now());
  const { t } = useI18n();

  useEffect(() => {
    api.tokenPackages().then((data) => setPackages(data.packages));
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        api.myWallet(data.session.access_token).then((walletData) => setWallet(walletData.wallet)).catch(() => undefined);
      }
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function selectPackage(tokenPackage: TokenPackage) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) return setMessage(t('tokens.loginRequired'));
    try {
      const order = await api.createManualPaymentOrder(data.session.access_token, {
        productCode: tokenPackage.id?.startsWith('bc_') ? tokenPackage.id : tokenProductCodes[tokenPackage.token_amount],
        provider: 'bank_transfer'
      });
      setOrderReference(order.payment_reference || '');
      setMessage(`${tokenPackage.token_amount} ${t('tokens.short')}: ${order.instructions}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('tokens.checkoutPending'));
    }
  }

  return (
    <div className="page token-page">
      <section className="token-hero">
        <p className="eyebrow">{t('tokens.eyebrow')}</p>
        <h1><Coins size={34} /> {t('tokens.title')}</h1>
        <p>{t('tokens.subtitle')}</p>
        <div className="token-balance-card">
          <span>{t('tokens.balance')}</span>
          <strong>{Math.round(Number(wallet?.escort_token_balance || 0))}</strong>
          <small>{wallet?.public_wallet_id || t('tokens.walletPending')}</small>
        </div>
      </section>

      <section className="token-package-grid">
        {packages.map((tokenPackage) => {
          const promotionActive = isPromotionActive(tokenPackage, now);
          const packageBadge = promotionActive || !isPromotionExpired(tokenPackage, now) ? tokenPackage.badge : '';
          return (
            <article className={tokenPackage.featured ? 'token-package-card featured' : 'token-package-card'} key={tokenPackage.id || tokenPackage.name}>
              {(tokenPackage.featured || packageBadge) && <span className="best-value">{packageBadge || t('tokens.bestValue')}</span>}
              <Gem size={24} />
              <h2>{tokenPackage.token_amount} {t('tokens.short')}</h2>
              <strong>{formatEuro(tokenPackage.eur_price)}</strong>
              <p>{tokenPackage.bonus_tokens ? t('tokens.bonus', { count: tokenPackage.bonus_tokens }) : t('tokens.noBonus')}</p>
              {promotionActive && tokenPackage.promotion_ends_at ? <small className="token-promo-countdown">{t('tokens.promoEndsIn')}: {formatPromoCountdown(tokenPackage.promotion_ends_at, now)}</small> : null}
              <button className="button primary full er-btn er-glass-btn er-glass-btn--purple er-glass-btn--block" onClick={() => selectPackage(tokenPackage)}><span>{t('tokens.selectPackage')}</span></button>
            </article>
          );
        })}
      </section>

      <section className="token-use-grid">
        {tokenUses.map((item, index) => {
          const icons = [RadioTower, Sparkles, Ticket, LockKeyhole];
          const Icon = icons[index % icons.length];
          return (
            <article className="feature" key={item}>
              <div className="feature-icon"><Icon /></div>
              <h2>{t(`tokens.uses.${item}`)}</h2>
              <p>{t('tokens.closedNotice')}</p>
            </article>
          );
        })}
      </section>
      {message && <p className="state-panel success">{message}{orderReference ? ` Reference: ${orderReference}` : ''}</p>}
    </div>
  );
}

