import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Radar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n';
import { getSafeNextPath } from '../lib/authRedirect';

const rememberedEmailStorageKey = 'escortRadar.rememberedEmail';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const nextPath = useMemo(() => getSafeNextPath(searchParams), [searchParams]);

  useEffect(() => {
    const savedEmail = localStorage.getItem(rememberedEmailStorageKey);
    if (!savedEmail) return;
    setEmail(savedEmail);
    setRememberEmail(true);
  }, []);

  if (import.meta.env.DEV) {
    console.debug('[LoginFlow]', {
      emailPresent: Boolean(email.trim()),
      nextParam: searchParams.get('next'),
      finalTarget: nextPath,
      hasSession: false
    });
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (import.meta.env.DEV) {
      console.debug('[LoginFlow]', {
        emailPresent: Boolean(normalizedEmail),
        submitFired: true,
        nextParam: searchParams.get('next'),
        finalTarget: nextPath,
        hasSession: false
      });
    }

    setLoading(true);
    setMessage('');
    try {
      const result = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

      if (result.error) {
        setMessage(t('auth.loginFailed', { message: result.error.message }));
        if (import.meta.env.DEV) console.debug('[LoginFlow]', { signIn: 'fail', error: result.error.message, nextParam: searchParams.get('next'), finalTarget: nextPath, hasSession: false });
        return;
      }

      const sessionResult = await supabase.auth.getSession();

      if (rememberEmail) {
        localStorage.setItem(rememberedEmailStorageKey, normalizedEmail);
      } else {
        localStorage.removeItem(rememberedEmailStorageKey);
      }

      if (import.meta.env.DEV) {
        console.debug('[LoginFlow]', {
          nextParam: searchParams.get('next'),
          finalTarget: nextPath,
          hasSession: Boolean(sessionResult.data.session)
        });
      }
      navigate(nextPath, { replace: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('states.requestFailed');
      setMessage(t('auth.loginFailed', { message: errorMessage }));
      if (import.meta.env.DEV) console.debug('[LoginFlow]', { signIn: 'fail', error: errorMessage, nextParam: searchParams.get('next'), finalTarget: nextPath, hasSession: false });
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${nextPath}` }
    });
    if (error) setMessage('Google login is not configured yet. Please use email login or try later.');
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-bg" />
      <section className="onboarding-hero">
        <div className="onboarding-copy">
          <p className="eyebrow">{t('auth.loginEyebrow')}</p>
          <h1><Radar size={44} /> Escort Radar</h1>
          <p>{t('auth.loginSubtitle')}</p>
          <div className="onboarding-points">
            <span>{t('tokens.title')}</span>
            <span>{t('baba.manualModeration')}</span>
            <span>{t('home.openRadar')}</span>
          </div>
        </div>
        <div className="onboarding-card">
          <p className="eyebrow">{t('buttons.login')}</p>
          <h2>{t('auth.loginTitle')}</h2>
          <p className="muted mobile-login-help">{t('auth.mobileLoginHelp')}</p>
          <form className="stack" onSubmit={login}>
            <input type="email" required autoComplete="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
            <label className="remember-email-control">
              <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />
              <span>{t('auth.rememberEmail')}</span>
            </label>
            <input type="password" required placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="button primary full" type="submit" disabled={loading}>
              <LogIn size={17} /> {loading ? t('states.loading') : t('auth.loginSubmit')}
            </button>
          </form>
          <button className="button full" type="button" disabled={loading} onClick={signInWithGoogle}>{t('auth.continueWithGoogle')}</button>
          <Link className="text-link" to="/register">{t('auth.needAccount')}</Link>
          {message && <p className="error-text">{message}</p>}
        </div>
      </section>
    </div>
  );
}
