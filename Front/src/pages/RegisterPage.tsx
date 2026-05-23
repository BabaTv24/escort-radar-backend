import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Radar, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n';

const authAccountTypeOptions = ['client', 'escort', 'business'] as const;
const identityOptions = ['male', 'female', 'trans'] as const;
const authIntentStorageKey = 'escortRadar.authIntent';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [authAccountType, setAuthAccountType] = useState<typeof authAccountTypeOptions[number]>('escort');
  const [identity, setIdentity] = useState<typeof identityOptions[number]>('female');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();
  const requiresVerification = authAccountType === 'escort' || authAccountType === 'business';

  async function register() {
    setMessage('');
    if (password !== repeatPassword) return setMessage(t('onboarding.passwordMismatch'));
    if (!acceptedTerms || !confirmedAdult) return setMessage(t('onboarding.acceptRequired'));

    setLoading(true);
    const result = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username, auth_account_type: authAccountType, identity } }
    });
    setLoading(false);

    if (result.error) return setMessage(result.error.message);
    navigate('/dashboard');
  }

  async function signInWithGoogle() {
    setMessage('');
    localStorage.setItem(authIntentStorageKey, JSON.stringify({ auth_account_type: authAccountType, identity }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    if (error) setMessage(error.message);
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
            <span>{t('subscription.price')}</span>
            <span>{t('register.benefitPhotos')}</span>
            <span>{t('register.benefitRadar')}</span>
            <span>{t('register.benefitVip')}</span>
            <span>{t('tokens.title')}</span>
            <span>{t('baba.manualModeration')}</span>
          </div>
        </div>
        <div className="onboarding-card">
          <p className="eyebrow">{t('onboarding.registerCard')}</p>
          <h2>{t('onboarding.createAccess')}</h2>
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
          {requiresVerification && <p className="subscription-notice"><ShieldCheck size={16} /> Profile publication requires verification.</p>}
          <input placeholder={t('form.username')} value={username} onChange={(event) => setUsername(event.target.value)} />
          <input type="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
          <input type="password" placeholder={t('form.repeatPassword')} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
          <label className="premium-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> {t('onboarding.acceptTerms')}</label>
          <label className="premium-check"><input type="checkbox" checked={confirmedAdult} onChange={(event) => setConfirmedAdult(event.target.checked)} /> {t('onboarding.confirm18')}</label>
          <button className="button primary full" disabled={loading} onClick={register}>{loading ? t('states.loading') : t('onboarding.createPremiumAccount')}</button>
          <button className="button full" type="button" disabled={loading} onClick={signInWithGoogle}>{t('auth.continueWithGoogle')}</button>
          <Link className="text-link" to="/login">{t('auth.alreadyHaveAccount')}</Link>
          {message && <p className="error-text">{message}</p>}
        </div>
      </section>
    </div>
  );
}
