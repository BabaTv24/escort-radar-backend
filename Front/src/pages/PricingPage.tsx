import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useI18n } from '../i18n';
import { supabase } from '../lib/supabase';
import { Seo } from '../components/Seo';

/**
 * Checkout for the two products sold today (bank transfer, manually verified).
 * The backend decides what is orderable; this list only gives the static price cards.
 */
const checkoutProducts = [
  { id: 'client_activation', cents: 99 },
  { id: 'advertiser_30d', cents: 4999 }
] as const;

const numberLocales: Record<string, string> = { de: 'de-DE', pl: 'pl-PL', en: 'en-GB' };

type OrderView = {
  id: string;
  productId: string;
  amount: number;
  currency: string;
  status: string;
  appliedAt: string | null;
  paymentReference: string;
  createdAt?: string;
};

type BankTransfer = { enabled?: boolean; recipient?: string; iban?: string; bic?: string; bank_name?: string };

const knownErrorCodes = ['ALREADY_ACTIVE', 'PROFILE_REQUIRED', 'ADVERTISER_ACCOUNT_REQUIRED', 'PRODUCT_NOT_AVAILABLE', 'PAYMENT_NOT_CONFIGURED'];

export function PricingPage() {
  const { t, lang } = useI18n();
  const formatEur = (amount: number, currency = 'EUR') => `${amount.toLocaleString(numberLocales[lang] || 'de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const [searchParams] = useSearchParams();
  const requestedProduct = searchParams.get('product') || '';
  const [productId, setProductId] = useState<string>(checkoutProducts.some((item) => item.id === requestedProduct) ? requestedProduct : 'client_activation');
  const [accessToken, setAccessToken] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [bankTransfer, setBankTransfer] = useState<BankTransfer>({});
  const [operator, setOperator] = useState('');
  const [supportEmail, setSupportEmail] = useState('support@escort-radar.fun');
  const [orderable, setOrderable] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<OrderView | null>(null);
  const [reused, setReused] = useState(false);
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [error, setError] = useState('');
  const bankTransferReady = Boolean(bankTransfer.enabled && bankTransfer.recipient && bankTransfer.iban);
  const selectedCents = checkoutProducts.find((item) => item.id === productId)?.cents || 0;
  const selectedPrice = selectedCents ? formatEur(selectedCents / 100) : '';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token || '';
      setAccessToken(token);
      setAccountEmail(data.session?.user.email || '');
      if (token) loadOrders(token);
    });
    api.manualPaymentProducts()
      .then((response) => {
        setOrderable(response.products.map((item) => String(item.id)));
        setBankTransfer((response.bank_transfer || {}) as BankTransfer);
        setOperator(String((response as Record<string, unknown>).operator || ''));
        if (response.support_email) setSupportEmail(response.support_email);
      })
      .catch(() => setOrderable([]));
  }, []);

  function loadOrders(token: string) {
    api.myManualPaymentOrders(token)
      .then((response) => setOrders(response.orders
        .filter((item) => checkoutProducts.some((product) => product.id === String(item.productCode)))
        .map((item) => ({
          id: String(item.orderId),
          productId: String(item.productCode),
          amount: Number(item.amount || 0),
          currency: String(item.currency || 'EUR'),
          status: String(item.status || 'pending'),
          appliedAt: item.appliedAt ? String(item.appliedAt) : null,
          paymentReference: String(item.paymentReference || ''),
          createdAt: item.createdAt ? String(item.createdAt) : undefined
        }))))
      .catch(() => setOrders([]));
  }

  async function createOrder() {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    setCurrentOrder(null);
    try {
      const response = await api.createManualPaymentOrder(accessToken, { provider: 'bank_transfer', productCode: productId });
      const order = response.order;
      setCurrentOrder({
        id: String(order.id),
        productId: String(order.product_id || productId),
        amount: Number(order.amount_eur || 0),
        currency: String(order.currency || 'EUR'),
        status: String(order.status || 'pending'),
        appliedAt: order.applied_at ? String(order.applied_at) : null,
        paymentReference: String(response.payment_reference || '')
      });
      if (response.bank_transfer) setBankTransfer(response.bank_transfer as BankTransfer);
      setReused(Boolean((response as Record<string, unknown>).reused));
      loadOrders(accessToken);
    } catch (err) {
      const code = err instanceof ApiError ? String(err.payload?.code || '') : '';
      setError(knownErrorCodes.includes(code) ? t(`checkout.errors.${code}`) : t('checkout.errors.generic'));
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(order: OrderView) {
    if (order.status === 'paid') return order.appliedAt ? t('checkout.statusPaid') : t('checkout.statusProcessing');
    if (order.status === 'rejected') return t('checkout.statusRejected');
    if (order.status === 'cancelled') return t('checkout.statusCancelled');
    return t('checkout.statusPending');
  }

  const formatAmount = (order: OrderView) => formatEur(order.amount, order.currency);

  return (
    <div className="page narrow">
      <Seo
        title="Escort Radar Pricing - Platform Access and Credits"
        description="Neutral overview of Escort Radar platform access, profile visibility plans and internal digital credits."
        canonical="https://escort-radar.fun/pricing"
      />
      <section className="legal-panel">
        <p className="eyebrow">Escort Radar</p>
        <h1>{t('pricing.page.title')}</h1>
        <p>{t('pricing.page.intro')}</p>
        <div className="pricing-list">
          {checkoutProducts.map((product) => (
            <article className="feature" key={product.id}>
              <h2>{t(`checkout.product.${product.id}`)}</h2>
              <strong>{formatEur(product.cents / 100)}</strong>
              <p>{t(`checkout.interval.${product.id}`)}</p>
            </article>
          ))}
          <article className="feature pricing-coming-soon" aria-disabled="true">
            <h2>ESCORT Office Center</h2>
            <strong>{t('register.path.comingSoon')}</strong>
            <p>{t('register.path.officeText')}</p>
          </article>
        </div>

        <div className="manual-payment-box">
          <h2>{t('checkout.title')}</h2>
          <p>{t('checkout.intro')}</p>
          <div className="manual-payment-grid">
            <div className="manual-account-summary">
              <span>{t('checkout.account')}</span>
              <strong>{accountEmail || '–'}</strong>
            </div>
            <label>
              {t('checkout.productLabel')}
              <select value={productId} onChange={(event) => { setProductId(event.target.value); setCurrentOrder(null); setError(''); }}>
                {checkoutProducts.map((product) => (
                  <option key={product.id} value={product.id} disabled={orderable.length > 0 && !orderable.includes(product.id)}>
                    {t(`checkout.product.${product.id}`)} – {formatEur(product.cents / 100)} ({t(`checkout.interval.${product.id}`)})
                  </option>
                ))}
              </select>
            </label>
            <div className="manual-account-summary">
              <span>{t('checkout.method')}</span>
              <strong>{t('checkout.methodValue')}</strong>
            </div>
            {operator ? (
              <div className="manual-account-summary">
                <span>{t('checkout.operator')}</span>
                <strong>{operator}</strong>
              </div>
            ) : null}
          </div>
          <p className="subscription-notice">{t('checkout.notPaidYet')}</p>
          {!accessToken ? (
            <>
              <p>{t('checkout.loginRequired')}</p>
              <div className="hero-actions">
                <Link className="button primary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" to="/login"><span>{t('checkout.login')}</span></Link>
                <Link className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to={productId === 'advertiser_30d' ? '/register?type=escort' : '/register?type=client'}><span>{t('checkout.register')}</span></Link>
              </div>
            </>
          ) : !bankTransferReady ? (
            <p className="error-text">{t('checkout.errors.PAYMENT_NOT_CONFIGURED')}</p>
          ) : (
            <button className="button primary full er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" type="button" disabled={loading} onClick={createOrder}>
              <span>{loading ? t('checkout.creating') : `${t('checkout.create')} · ${selectedPrice}`}</span>
            </button>
          )}
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          {currentOrder ? (
            <div className="manual-order-result" aria-live="polite">
              {reused ? <p className="success">{t('checkout.reused')}</p> : null}
              <p><strong>{t('checkout.status')}:</strong> {statusLabel(currentOrder)}</p>
              <p><strong>{t('checkout.productLabel')}:</strong> {t(`checkout.product.${currentOrder.productId}`)} ({t(`checkout.interval.${currentOrder.productId}`)})</p>
              <p><strong>{t('checkout.amount')}:</strong> {formatAmount(currentOrder)}</p>
              <p><strong>{t('checkout.recipient')}:</strong> {bankTransfer.recipient || '–'}</p>
              <p><strong>{t('checkout.iban')}:</strong> {bankTransfer.iban || '–'}</p>
              {bankTransfer.bic ? <p><strong>{t('checkout.bic')}:</strong> {bankTransfer.bic}</p> : null}
              {bankTransfer.bank_name ? <p><strong>{t('checkout.bankName')}:</strong> {bankTransfer.bank_name}</p> : null}
              <p><strong>{t('checkout.reference')}:</strong> <code>{currentOrder.paymentReference || '–'}</code></p>
              <p><strong>{t('checkout.orderId')}:</strong> {currentOrder.id}</p>
              <p>{t('checkout.nextSteps')}</p>
              <p className="muted">{t('checkout.support', { email: supportEmail })}</p>
            </div>
          ) : null}
          {orders.length ? (
            <div className="manual-order-history">
              <h3>{t('checkout.myOrders')}</h3>
              {orders.map((order) => (
                <p key={order.id}>
                  <strong>{t(`checkout.product.${order.productId}`)}</strong> · {formatAmount(order)} · {statusLabel(order)}
                  {order.status === 'pending' && order.paymentReference ? <> · <code>{order.paymentReference}</code></> : null}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
