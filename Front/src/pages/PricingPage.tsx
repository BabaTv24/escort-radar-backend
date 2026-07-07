import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../i18n';
import { supabase } from '../lib/supabase';
import { Seo } from '../components/Seo';

const platformProducts = [
  ['client_activation', 'client_activation', 'Client Activation', '0.99 EUR', 'one-time'],
  ['advertiser_30d', 'advertiser_subscription', 'Solo Advertiser Premium Listing', '49.99 EUR', '30 days'],
  ['agency_30d', 'agency_subscription', 'Agency / Business Plan', '499.00 EUR', '30 days']
];

const tokenProducts = [
  ['tokens_120', 'token_package', '120 BC Coins', '18 EUR'],
  ['tokens_520', 'token_package', '520 BC Coins', '78 EUR'],
  ['tokens_1200', 'token_package', '1,200 BC Coins', '180 EUR'],
  ['tokens_2560', 'token_package', '2,560 BC Coins', '384 EUR'],
  ['tokens_5200', 'token_package', '5,200 BC Coins', '780 EUR'],
  ['tokens_10200', 'token_package', '10,200 BC Coins', '1530 EUR']
];

export function PricingPage() {
  const { t } = useI18n();
  const fallbackProducts = useMemo(() => [...platformProducts, ...tokenProducts].map(([id, purpose, label, price]) => ({ id, purpose, label, price })), []);
  const frontendBankTransferEnabled = String(import.meta.env.VITE_MANUAL_BANK_TRANSFER_ENABLED || 'true').toLowerCase() !== 'false';
  const [products, setProducts] = useState(fallbackProducts);
  const [providers, setProviders] = useState<Record<string, boolean>>({
    manual: true,
    bank_transfer: frontendBankTransferEnabled,
    crypto: true,
    ccbill: false,
    paysafe: false
  });
  const [bankTransfer, setBankTransfer] = useState<Record<string, unknown>>({
    enabled: frontendBankTransferEnabled,
    recipient: import.meta.env.VITE_MANUAL_BANK_TRANSFER_RECIPIENT || '',
    iban: import.meta.env.VITE_MANUAL_BANK_TRANSFER_IBAN || '',
    bic: import.meta.env.VITE_MANUAL_BANK_TRANSFER_BIC || '',
    bank_name: import.meta.env.VITE_MANUAL_BANK_TRANSFER_BANK_NAME || ''
  });
  const [accessToken, setAccessToken] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [productId, setProductId] = useState('client_activation');
  const [provider, setProvider] = useState('bank_transfer');
  const [loading, setLoading] = useState(false);
  const [manualOrder, setManualOrder] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const selectedProduct = products.find((item) => item.id === productId) || products[0];
  const manualOrderMetadata = (manualOrder?.metadata && typeof manualOrder.metadata === 'object') ? manualOrder.metadata as Record<string, unknown> : {};

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token || '');
      setAccountEmail(data.session?.user.email || '');
    });
    api.manualPaymentProducts()
      .then((response) => {
        const mapped = response.products.map((item) => ({
          id: String(item.id),
          purpose: String(item.purpose),
          label: String(item.label),
          price: `${(Number(item.amount_cents || 0) / 100).toFixed(2)} ${String(item.currency || 'EUR')}`
        }));
        if (mapped.length) setProducts(mapped);
        setProviders({ ...providers, ...(response.providers || {}) });
        if (response.bank_transfer) setBankTransfer({ ...bankTransfer, ...response.bank_transfer });
        if (response.default_provider && ['manual', 'bank_transfer', 'crypto'].includes(response.default_provider)) setProvider(response.default_provider);
      })
      .catch(() => undefined);
  }, []);

  async function createManualOrder() {
    if (!selectedProduct || !accessToken) return;
    setLoading(true);
    setError('');
    setManualOrder(null);
    try {
      const response = await api.createManualPaymentOrder(accessToken, {
        provider,
        productCode: selectedProduct.id
      });
      setManualOrder({ ...response.order, bank_transfer: response.bank_transfer, payment_reference: response.payment_reference });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment order could not be created.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page narrow">
      <Seo
        title="Escort Radar Pricing - Platform Access and Credits"
        description="Neutral overview of Escort Radar platform access, profile visibility plans and internal digital credits."
        canonical="https://escort-radar.fun/pricing"
      />
      <section className="legal-panel">
        <p className="eyebrow">Escort Radar Pricing</p>
        <h1>Pricing</h1>
        <p>Payments are for digital platform access, profile visibility, advertising tools and internal credits only. The platform does not process payments for physical meetings between users.</p>
        <div className="pricing-list">
          {platformProducts.map(([, , name, price, interval]) => (
            <article className="feature" key={name}>
              <h2>{name}</h2>
              <strong>{price}</strong>
              <p>{interval}</p>
            </article>
          ))}
        </div>
        <h2>BC Coins packages</h2>
        <div className="pricing-list">
          {tokenProducts.map(([, , name, price]) => (
            <article className="feature" key={name}>
              <h2>{name}</h2>
              <strong>{price}</strong>
              <p>Internal digital credits for platform features.</p>
            </article>
          ))}
        </div>
        <p className="subscription-notice">Card payments via CCBill are coming soon. Paysafecard/Paysafe is coming soon. Manual bank transfer and crypto may be available as discreet prepaid payment options.</p>
        <div className="manual-payment-box">
          <h2>Discreet prepaid payment order</h2>
          <div className="provider-strip">
            <button type="button" className={provider === 'bank_transfer' ? 'active' : ''} disabled={!providers.bank_transfer} onClick={() => setProvider('bank_transfer')}>manual bank transfer</button>
            <button type="button" className={provider === 'crypto' ? 'active' : ''} disabled={!providers.crypto} onClick={() => setProvider('crypto')}>crypto</button>
            <button type="button" className={provider === 'manual' ? 'active' : ''} disabled={!providers.manual} onClick={() => setProvider('manual')}>manual</button>
            <button type="button" disabled>CCBill card payments - coming soon</button>
            <button type="button" disabled>Paysafecard/Paysafe - coming soon</button>
          </div>
          <div className="manual-payment-grid">
            <div className="manual-account-summary">
              <span>Account email</span>
              <strong>{accountEmail || t('tokens.loginRequired')}</strong>
            </div>
            <label>
              Product
              <select value={productId} onChange={(event) => setProductId(event.target.value)}>
                {products.map((item) => <option key={item.id} value={item.id}>{item.label} - {item.price}</option>)}
              </select>
            </label>
            <label>
              Provider
              <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                <option value="bank_transfer" disabled={!providers.bank_transfer}>manual bank transfer</option>
                <option value="crypto" disabled={!providers.crypto}>Crypto</option>
                <option value="manual" disabled={!providers.manual}>Manual</option>
                <option value="ccbill" disabled={!providers.ccbill}>CCBill card payments - coming soon</option>
                <option value="paysafe" disabled={!providers.paysafe}>Paysafecard/Paysafe - coming soon</option>
              </select>
            </label>
          </div>
          {!accessToken ? (
            <div className="hero-actions">
              <Link className="button primary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" to="/login"><span>Login</span></Link>
              <Link className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to="/register"><span>Register</span></Link>
            </div>
          ) : (
            <button className="button primary full er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" disabled={loading} onClick={createManualOrder}><span>{loading ? 'Creating...' : 'Create pending order'}</span></button>
          )}
          {error ? <p className="error-text">{error}</p> : null}
          {manualOrder ? (
            <div className="manual-order-result">
              <p><strong>Order ID:</strong> {String(manualOrder.id || '-')}</p>
              <p><strong>User email:</strong> {String(manualOrder.email || accountEmail)}</p>
              <p><strong>Product:</strong> {String(manualOrder.product_label || selectedProduct?.label || '-')}</p>
              <p><strong>Amount:</strong> {Number(manualOrder.amount_eur || 0).toFixed(2)} {String(manualOrder.currency || 'EUR')}</p>
              <p><strong>Provider:</strong> {String(manualOrder.provider || provider)}</p>
              <p><strong>Payment reference:</strong> {String(manualOrder.payment_reference || manualOrderMetadata.payment_reference || '-')}</p>
              {provider === 'bank_transfer' ? (
                <>
                  <p><strong>Recipient:</strong> {String((manualOrder.bank_transfer as Record<string, unknown> | undefined)?.recipient || bankTransfer.recipient || '-')}</p>
                  <p><strong>IBAN:</strong> {String((manualOrder.bank_transfer as Record<string, unknown> | undefined)?.iban || bankTransfer.iban || '-')}</p>
                  {((manualOrder.bank_transfer as Record<string, unknown> | undefined)?.bic || bankTransfer.bic) ? <p><strong>BIC:</strong> {String((manualOrder.bank_transfer as Record<string, unknown> | undefined)?.bic || bankTransfer.bic)}</p> : null}
                  {((manualOrder.bank_transfer as Record<string, unknown> | undefined)?.bank_name || bankTransfer.bank_name) ? <p><strong>Bank name:</strong> {String((manualOrder.bank_transfer as Record<string, unknown> | undefined)?.bank_name || bankTransfer.bank_name)}</p> : null}
                </>
              ) : null}
              <p><strong>Instructions:</strong> {t('payments.manualBankTransferInstruction')}</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

