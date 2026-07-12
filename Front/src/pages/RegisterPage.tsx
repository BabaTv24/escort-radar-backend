import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Radar, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

const authAccountTypeOptions = ['client', 'escort', 'business'] as const;
const identityOptions = ['male', 'female', 'trans'] as const;
const authIntentStorageKey = 'escortRadar.authIntent';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [authAccountType, setAuthAccountType] = useState<typeof authAccountTypeOptions[number]>('client');
  const [identity, setIdentity] = useState<typeof identityOptions[number]>('female');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();
  const requiresVerification = authAccountType === 'escort' || authAccountType === 'business';

  useEffect(() => {
    const requestedType = searchParams.get('type');
    if (authAccountTypeOptions.includes(requestedType as typeof authAccountTypeOptions[number])) {
      setAuthAccountType(requestedType as typeof authAccountTypeOptions[number]);
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
    try {
      await api.register({
        email: email.trim(),
        password,
        username,
        auth_account_type: authAccountType,
        identity,
        referred_by_code: referredByCode
      });
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) return setMessage(result.error.message);
      localStorage.removeItem('escortRadar.referralCode');
      navigate('/dashboard');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setMessage('');
    const referredByCode = searchParams.get('ref') || localStorage.getItem('escortRadar.referralCode') || '';
    localStorage.setItem(authIntentStorageKey, JSON.stringify({ auth_account_type: authAccountType, identity, referred_by_code: referredByCode }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    if (error) {
      localStorage.removeItem(authIntentStorageKey);
      setMessage('Google login is not configured yet. Please use email login or try later.');
    }
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-bg" />
      <section className="onboarding-hero">
        <div className="onboarding-copy">
          <p className="eyebrow">{t('onboarding.step1')}</p>
          <h1><Radar size={44} /> {t('onboarding.headline')}</h1>
          <p>{t('onboarding.subtitle')}</p>
          <div className="onboarding-points">
            {authAccountType === 'client' ? <>
              <span>{t('auth.clientBenefitFree')}</span>
              <span>{t('auth.clientBenefitRadar')}</span>
              <span>{t('auth.clientBenefitTokens')}</span>
            </> : <>
              <span>{t('subscription.price')}</span>
              <span>{t('register.benefitPhotos')}</span>
              <span>{t('register.benefitRadar')}</span>
              <span>{t('register.benefitVip')}</span>
              <span>{t('tokens.title')}</span>
              <span>{t('baba.manualModeration')}</span>
            </>}
          </div>
        </div>
        <div className="onboarding-card">
          <p className="eyebrow">{t('onboarding.registerCard')}</p>
          <h2>{requiresVerification ? t('onboarding.createAccess') : t('auth.createFreeAccess')}</h2>
          <div className="account-type-grid">
            {authAccountTypeOptions.map((item) => (
              <button key={item} type="button" className={authAccountType === item ? 'account-type-card selected' : 'account-type-card'} onClick={() => setAuthAccountType(item)}>
                <strong>{t(`authAccountType.${item}`)}</strong>
                <span>{t(`authAccountType.${item}Text`)}</span>
              </button>
            ))}
          </div>
          <select value={identity} onChange={(event) => setIdentity(event.target.value as typeof identityOptions[number])}>
            {identityOptions.map((item) => <option key={item} value={item}>{t(`identity.${item}`)}</option>)}
          </select>
          <p className="subscription-notice">
            <ShieldCheck size={16} />
            {requiresVerification ? t('auth.registrationPremiumNotice') : t('auth.registrationClientNotice')}
          </p>
          <input placeholder={t('form.username')} value={username} onChange={(event) => setUsername(event.target.value)} />
          <input type="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
          <input type="password" placeholder={t('form.repeatPassword')} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
          <label className="premium-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> {t('onboarding.acceptTerms')}</label>
          <label className="premium-check"><input type="checkbox" checked={confirmedAdult} onChange={(event) => setConfirmedAdult(event.target.checked)} /> {t('onboarding.confirm18')}</label>
          <button className="button primary full er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" disabled={loading} onClick={register}>
            {loading ? t('states.loading') : requiresVerification ? t('onboarding.createPremiumAccount') : t('auth.createFreeClientAccount')}
          </button>
          <button className="button full er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--block" type="button" disabled={loading} onClick={signInWithGoogle}>{t('auth.continueWithGoogle')}</button>
          <Link className="text-link" to="/login">{t('auth.alreadyHaveAccount')}</Link>
          {message && <p className="error-text">{message}</p>}
        </div>
      </section>
    </div>
  );
}
