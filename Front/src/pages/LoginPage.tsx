import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Radar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n';
import { getSafeNextPath, withTimeout } from '../lib/authRedirect';

const rememberedEmailStorageKey = 'escortRadar.rememberedEmail';
const loginJustCompletedStorageKey = 'escortRadar:loginJustCompleted';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSlowLoginHelp, setShowSlowLoginHelp] = useState(false);
  const mountedRef = useRef(true);
  const loginRunId = useRef(0);
  const didRedirectRef = useRef(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const nextParam = searchParams.get('next');
  const nextPath = useMemo(() => getSafeNextPath(searchParams), [searchParams]);

  useEffect(() => {
    const savedEmail = localStorage.getItem(rememberedEmailStorageKey);
    if (!savedEmail) return;
    setEmail(savedEmail);
    setRememberEmail(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Login] auth-state', {
        event,
        hasSession: Boolean(session),
        email: session?.user?.email || null,
        next: nextPath
      });
    });
    return () => listener.subscription.unsubscribe();
  }, [nextPath]);

  useEffect(() => {
    if (!loading) return;

    const currentRun = loginRunId.current;
    const timeout = window.setTimeout(() => {
      if (!mountedRef.current || didRedirectRef.current || loginRunId.current !== currentRun) return;
      setLoading(false);
      setMessage(t('auth.loginTooLong'));
      setShowSlowLoginHelp(true);
      if (import.meta.env.DEV) {
        console.debug('[MobileLogin] watchdog timeout', {
          runId: currentRun,
          nextParam,
          finalTarget: nextPath
        });
      }
    }, 16000);

    return () => window.clearTimeout(timeout);
  }, [loading, nextParam, nextPath, t]);

  if (import.meta.env.DEV) {
    console.debug('[LoginFlow]', {
      emailPresent: Boolean(email.trim()),
      nextParam,
      finalTarget: nextPath,
      hasSession: false
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    const normalizedEmail = email.trim().toLowerCase();
    let didRedirect = false;
    loginRunId.current += 1;
    const currentRun = loginRunId.current;
    didRedirectRef.current = false;
    if (import.meta.env.DEV) {
      console.log('[Login] submit', { email: normalizedEmail, next: nextPath });
      console.debug('[LoginFlow]', {
        emailPresent: Boolean(normalizedEmail),
        submitFired: true,
        nextParam,
        finalTarget: nextPath,
        hasSession: false
      });
    }

    setLoading(true);
    setMessage('');
    setShowSlowLoginHelp(false);
    try {
      const result = await withTimeout(
        supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
        15000,
        t('auth.loginRequestTimeout')
      );

      if (result.error) {
        if (mountedRef.current && loginRunId.current === currentRun) setMessage(t('auth.loginFailed', { message: result.error.message }));
        if (import.meta.env.DEV) console.log('[Login] signInWithPassword', { ok: false, error: result.error.message, next: nextPath });
        if (import.meta.env.DEV) console.debug('[LoginFlow]', { signIn: 'fail', error: result.error.message, nextParam, finalTarget: nextPath, hasSession: false });
        return;
      }

      const session = result.data.session;
      if (import.meta.env.DEV) {
        console.log('[Login] signInWithPassword', {
          ok: true,
          hasSession: Boolean(session),
          hasAccessToken: Boolean(session?.access_token),
          hasRefreshToken: Boolean(session?.refresh_token),
          hasUser: Boolean(session?.user),
          next: nextPath
        });
      }
      if (import.meta.env.DEV) console.debug('[MobileLogin] signIn success', { hasDirectSession: Boolean(session), nextParam, finalTarget: nextPath });
      if (!session?.access_token || !session.refresh_token || !session.user) {
        throw new Error(t('auth.loginNoSession'));
      }

      if (rememberEmail) {
        localStorage.setItem(rememberedEmailStorageKey, normalizedEmail);
      } else {
        localStorage.removeItem(rememberedEmailStorageKey);
      }

      if (import.meta.env.DEV) {
        console.log('[Login] redirect', { next: nextPath, hasSession: Boolean(session) });
        console.debug('[MobileLogin] final redirect', {
          nextParam,
          finalTarget: nextPath,
          hasSession: Boolean(session)
        });
      }
      sessionStorage.setItem(loginJustCompletedStorageKey, String(Date.now()));
      didRedirect = true;
      didRedirectRef.current = true;
      navigate(nextPath, { replace: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('states.requestFailed');
      if (mountedRef.current && loginRunId.current === currentRun) setMessage(t('auth.loginFailed', { message: errorMessage }));
      if (import.meta.env.DEV) console.log('[Login] error', { message: errorMessage, next: nextPath });
      if (import.meta.env.DEV) console.debug('[LoginFlow]', { signIn: 'fail', error: errorMessage, nextParam, finalTarget: nextPath, hasSession: false });
    } finally {
      if (mountedRef.current && !didRedirect && loginRunId.current === currentRun) setLoading(false);
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
          <form className="stack" onSubmit={handleSubmit}>
            <input type="email" required autoComplete="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
            <label className="remember-email-control">
              <input type="checkbox" checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} />
              <span>{t('auth.rememberEmail')}</span>
            </label>
            <input type="password" required placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="button primary full er-btn er-glass-btn er-glass-btn--gold er-glass-btn--block" type="submit" disabled={loading}>
              <LogIn size={17} /> <span>{loading ? t('states.loading') : t('auth.loginSubmit')}</span>
            </button>
            {showSlowLoginHelp && (
              <button className="button full er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--block" type="submit" disabled={loading}>
                <span>{t('auth.tryAgain')}</span>
              </button>
            )}
          </form>
          <button className="button full er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--block" type="button" disabled={loading} onClick={signInWithGoogle}><span>{t('auth.continueWithGoogle')}</span></button>
          <Link className="text-link" to="/register">{t('auth.needAccount')}</Link>
          {message && <p className="error-text">{message}</p>}
        </div>
      </section>
    </div>
  );
}

