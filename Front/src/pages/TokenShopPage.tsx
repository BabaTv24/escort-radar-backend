import { useEffect, useState } from 'react';
import { Coins, Gem, LockKeyhole, RadioTower, Sparkles, Ticket } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { TokenPackage, Wallet } from '../types';
import { useI18n } from '../i18n';

const tokenUses = ['listing', 'boost', 'liveCam', 'chat', 'gallery', 'booking', 'tips', 'spotlight'];
const tokenProductCodes: Record<number, string> = {
  120: 'tokens_120',
  520: 'tokens_520',
  1200: 'tokens_1200',
  2560: 'tokens_2560',
  5200: 'tokens_5200',
  10200: 'tokens_10200'
};

export function TokenShopPage() {
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [message, setMessage] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    api.tokenPackages().then((data) => setPackages(data.packages));
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) {
        api.myWallet(data.session.access_token).then((walletData) => setWallet(walletData.wallet)).catch(() => undefined);
      }
    });
  }, []);

  async function selectPackage(tokenPackage: TokenPackage) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) return setMessage(t('tokens.loginRequired'));
    try {
      const order = await api.createManualPaymentOrder(data.session.access_token, {
        productCode: tokenPackage.id?.startsWith('tokens_') ? tokenPackage.id : tokenProductCodes[tokenPackage.token_amount],
        provider: 'bank_transfer'
      });
      setOrderReference(order.payment_reference || '');
      setMessage(`${tokenPackage.token_amount.toLocaleString()} tokens: ${order.instructions}`);
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
        {packages.map((tokenPackage) => (
          <article className={tokenPackage.featured ? 'token-package-card featured' : 'token-package-card'} key={tokenPackage.id || tokenPackage.name}>
            {tokenPackage.featured && <span className="best-value">{t('tokens.bestValue')}</span>}
            <Gem size={24} />
            <h2>{tokenPackage.token_amount.toLocaleString()} {t('tokens.short')}</h2>
            <strong>{tokenPackage.eur_price.toFixed(2)} EUR</strong>
            <p>{tokenPackage.bonus_tokens ? t('tokens.bonus', { count: tokenPackage.bonus_tokens }) : t('tokens.noBonus')}</p>
            <button className="button primary full" onClick={() => selectPackage(tokenPackage)}>{t('tokens.selectPackage')}</button>
          </article>
        ))}
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
