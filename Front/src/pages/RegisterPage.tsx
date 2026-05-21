import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { accountTypeOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';

export function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [accountType, setAccountType] = useState('private');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  async function register() {
    setMessage('');
    if (password !== repeatPassword) return setMessage(t('onboarding.passwordMismatch'));
    if (!acceptedTerms || !confirmedAdult) return setMessage(t('onboarding.acceptRequired'));

    setLoading(true);
    const result = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username, account_type: accountType, primary_phone: primaryPhone } }
    });
    setLoading(false);

    if (result.error) return setMessage(result.error.message);
    navigate('/dashboard');
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
          <input placeholder={t('form.username')} value={username} onChange={(event) => setUsername(event.target.value)} />
          <input type="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
          <input type="password" placeholder={t('form.repeatPassword')} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
          <select value={accountType} onChange={(event) => setAccountType(event.target.value)}>
            {accountTypeOptions.map((item) => <option key={item} value={item}>{t(`accountType.${item}`)}</option>)}
          </select>
          {accountType === 'private' && <p className="subscription-notice">{t('accountType.privateDescription')}</p>}
          <input placeholder={t('form.primaryPhone')} value={primaryPhone} onChange={(event) => setPrimaryPhone(event.target.value)} />
          <label className="premium-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> {t('onboarding.acceptTerms')}</label>
          <label className="premium-check"><input type="checkbox" checked={confirmedAdult} onChange={(event) => setConfirmedAdult(event.target.checked)} /> {t('onboarding.confirm18')}</label>
          <button className="button primary full" disabled={loading} onClick={register}>{loading ? t('states.loading') : t('onboarding.createPremiumAccount')}</button>
          {message && <p className="error-text">{message}</p>}
        </div>
      </section>
    </div>
  );
}
