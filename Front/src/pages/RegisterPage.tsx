import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Building2, Crown, Lock, MailCheck, RadioTower, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ApiError, api } from '../lib/api';
import { PREMIUM_CHECKOUT_INTENT_KEY, useOAuthProvider } from '../lib/authProviders';
import { useI18n } from '../i18n';

// Business contract V1: customers register for Premium, individual advertisers register a listing.
// The ESCORT Office Center (business, multi-profile) is a future product and cannot be selected.
const selectableAccountTypes = ['client', 'escort'] as const;
type SelectableAccountType = typeof selectableAccountTypes[number];
const identityOptions = ['male', 'female', 'trans'] as const;
const authIntentStorageKey = 'escortRadar.authIntent';
const customerBenefits = ['profiles', 'booking', 'favorites', 'dashboard', 'wallet', 'chat', 'referral'] as const;
const customerUnavailable = ['video', 'gifts'] as const;
const advertiserBenefits = ['profile', 'radar', 'bookings', 'messages', 'subscription'] as const;

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [authAccountType, setAuthAccountType] = useState<SelectableAccountType>('client');
  const [officeCenterRequested, setOfficeCenterRequested] = useState(false);
  const [identity, setIdentity] = useState<typeof identityOptions[number]>('female');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [resendNotice, setResendNotice] = useState('');
  const [resending, setResending] = useState(false);
  const googleState = useOAuthProvider('google');
  const { t } = useI18n();
  const isCustomer = authAccountType === 'client';

  useEffect(() => {
    const requestedType = searchParams.get('type');
    if (selectableAccountTypes.includes(requestedType as SelectableAccountType)) {
      setAuthAccountType(requestedType as SelectableAccountType);
      setOfficeCenterRequested(false);
    } else if (requestedType === 'business') {
      // Direct links to the future ESCORT Office Center land on the customer path with a notice.
      setAuthAccountType('client');
      setOfficeCenterRequested(true);
    }
    const referralCode = searchParams.get('ref');
    if (referralCode) localStorage.setItem('escortRadar.referralCode', referralCode.toUpperCase());
  }, [searchParams]);

  async function register() {
    setMessage('');
    if (password !== repeatPassword) return setMessage(t('onboarding.passwordMismatch'));
    if (!acceptedTerms || !confirmedAdult) return setMessage(t('onboarding.acceptRequired'));

    setLoading(true);
    const referredByCode = searchParams.get('ref') || localStorage.getItem('escortRadar.referralCode') || '';
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await api.register({
        email: normalizedEmail,
        password,
        username,
        auth_account_type: authAccountType,
        identity: isCustomer ? undefined : identity,
        referred_by_code: referredByCode
      });
      // Deliberately no sign in here. The account is unconfirmed until the link in the
      // confirmation email is opened, so signing in would either fail or, worse, suggest that
      // the account is already active.
      localStorage.removeItem('escortRadar.referralCode');
      // After the first sign in, a customer without a verified activation goes to the 0.99 EUR checkout.
      if (isCustomer) localStorage.setItem(PREMIUM_CHECKOUT_INTENT_KEY, '1');
      setPassword('');
      setRepeatPassword('');
      setPendingConfirmationEmail(normalizedEmail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function resendConfirmationEmail() {
    if (!pendingConfirmationEmail || resending) return;
    setResendNotice('');
    setResending(true);
    try {
      await api.resendConfirmationEmail({ email: pendingConfirmationEmail });
      setResendNotice(t('auth.confirm.resendSent'));
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setResendNotice(status === 429 ? t('auth.confirm.resendTooSoon') : t('auth.confirm.resendFailed'));
    } finally {
      setResending(false);
    }
  }

  async function signInWithGoogle() {
    setMessage('');
    if (googleState !== 'enabled') return setMessage(t('register.google.unavailable'));
    const referredByCode = searchParams.get('ref') || localStorage.getItem('escortRadar.referralCode') || '';
    localStorage.setItem(authIntentStorageKey, JSON.stringify({ auth_account_type: authAccountType, identity, referred_by_code: referredByCode }));
    if (isCustomer) localStorage.setItem(PREMIUM_CHECKOUT_INTENT_KEY, '1');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    if (error) {
      localStorage.removeItem(authIntentStorageKey);
      localStorage.removeItem(PREMIUM_CHECKOUT_INTENT_KEY);
      setMessage(t('register.google.unavailable'));
    }
  }

  function selectAccountType(type: SelectableAccountType) {
    setAuthAccountType(type);
    setOfficeCenterRequested(false);
    setMessage('');
  }

  return (
    <div className="onboarding-shell pr-auth pr-register">
      <div className="onboarding-bg" />
      <section className="onboarding-hero">
        <div className="onboarding-copy">
          <p className="eyebrow">{t(isCustomer ? 'register.client.eyebrow' : 'register.advertiser.eyebrow')}</p>
          <h1>{t(isCustomer ? 'register.client.title' : 'register.advertiser.title')}</h1>
          <p>{t(isCustomer ? 'register.client.lead' : 'register.advertiser.lead')}</p>
          {isCustomer && (
            <>
              <ul className="pr-check-list register-benefits">
                {customerBenefits.map((key) => <li key={key}><BadgeCheck size={17} aria-hidden="true" /> {t(`register.client.benefit.${key}`)}</li>)}
                {customerUnavailable.map((key) => <li key={key} className="is-off"><Lock size={16} aria-hidden="true" /> {t(`register.client.unavailable.${key}`)}</li>)}
              </ul>
              <p className="register-free-note">
                <RadioTower size={16} aria-hidden="true" /> {t('register.client.freeNote')} <Link to="/city/berlin">{t('home.openRadar')}</Link>
              </p>
            </>
          )}
          {!isCustomer && (
            <ul className="pr-check-list register-benefits">
              {advertiserBenefits.map((key) => <li key={key}><BadgeCheck size={17} aria-hidden="true" /> {t(`register.advertiser.benefit.${key}`)}</li>)}
            </ul>
          )}
        </div>
        {pendingConfirmationEmail ? (
          <div className="onboarding-card">
            <p className="eyebrow">{t('onboarding.registerCard')}</p>
            <h2><MailCheck size={20} /> {t('auth.confirm.title')}</h2>
            <p>{t('auth.confirm.body', { email: pendingConfirmationEmail })}</p>
            <p className="subscription-notice">
              <ShieldCheck size={16} />
              {t('auth.confirm.notActiveYet')}
            </p>
            {isCustomer ? <p className="subscription-notice"><Crown size={16} /> {t('register.client.afterConfirm')}</p> : null}
            <p className="muted">{t('auth.confirm.spamHint')}</p>
            <button
              className="button full er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--block"
              type="button"
              disabled={resending}
              onClick={resendConfirmationEmail}
            >
              {resending ? t('states.loading') : t('auth.confirm.resend')}
            </button>
            <Link className="text-link" to="/login">{t('auth.confirm.backToLogin')}</Link>
            {resendNotice && <p className="muted">{resendNotice}</p>}
          </div>
        ) : (
        <div className="onboarding-card">
          <p className="eyebrow">{t('onboarding.registerCard')}</p>
          <h2>{t(isCustomer ? 'register.client.cardTitle' : 'register.advertiser.cardTitle')}</h2>
          <div className="register-paths" role="radiogroup" aria-label={t('register.pathsLabel')}>
            <button type="button" role="radio" aria-checked={isCustomer} className={`register-path${isCustomer ? ' is-selected' : ''}`} onClick={() => selectAccountType('client')}>
              <Crown size={18} aria-hidden="true" />
              <span><strong>{t('register.path.client')}</strong><small>{t('register.path.clientText')}</small></span>
            </button>
            <button type="button" role="radio" aria-checked={authAccountType === 'escort'} className={`register-path${authAccountType === 'escort' ? ' is-selected' : ''}`} onClick={() => selectAccountType('escort')}>
              <UserRound size={18} aria-hidden="true" />
              <span><strong>{t('register.path.advertiser')}</strong><small>{t('register.path.advertiserText')}</small></span>
            </button>
            <div className="register-path is-disabled" role="radio" aria-checked="false" aria-disabled="true" data-account-type="business">
              <Building2 size={18} aria-hidden="true" />
              <span><strong>{t('register.path.office')}</strong><small>{t('register.path.officeText')}</small></span>
              <em className="register-path-badge">{t('register.path.comingSoon')}</em>
            </div>
          </div>
          {officeCenterRequested ? <p className="subscription-notice" role="status"><Building2 size={16} /> {t('register.officeNotice')}</p> : null}
          <p className="subscription-notice register-price-notice">
            <ShieldCheck size={16} />
            {t(isCustomer ? 'register.client.priceNotice' : 'register.advertiser.priceNotice')}
          </p>
          {!isCustomer && (
            <select value={identity} aria-label={t('register.identityLabel')} onChange={(event) => setIdentity(event.target.value as typeof identityOptions[number])}>
              {identityOptions.map((item) => <option key={item} value={item}>{t(`identity.${item}`)}</option>)}
            </select>
          )}
          <input placeholder={t('form.username')} autoComplete="nickname" value={username} onChange={(event) => setUsername(event.target.value)} />
          <input type="email" placeholder={t('form.email')} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder={t('form.password')} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <input type="password" placeholder={t('form.repeatPassword')} autoComplete="new-password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
          <label className="premium-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> {t('onboarding.acceptTerms')}</label>
          <label className="premium-check"><input type="checkbox" checked={confirmedAdult} onChange={(event) => setConfirmedAdult(event.target.checked)} /> {t('onboarding.confirm18')}</label>
          <button className="button primary full er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" disabled={loading} onClick={register}>
            {loading ? t('states.loading') : t(isCustomer ? 'register.client.submit' : 'register.advertiser.submit')}
          </button>
          <button
            className={`button full er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--block register-google${googleState !== 'enabled' ? ' is-unavailable' : ''}`}
            type="button"
            disabled={loading || googleState !== 'enabled'}
            aria-disabled={googleState !== 'enabled'}
            onClick={signInWithGoogle}
          >
            {t('auth.continueWithGoogle')}{googleState === 'disabled' ? <small> · {t('register.google.unavailableShort')}</small> : null}
          </button>
          <Link className="text-link" to="/login">{t('auth.alreadyHaveAccount')}</Link>
          {message && <p className="error-text">{message}</p>}
        </div>
        )}
      </section>
    </div>
  );
}
