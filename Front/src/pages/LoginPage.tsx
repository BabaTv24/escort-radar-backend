import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Radar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const nextPath = safeNextPath(searchParams.get('next'));

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    await supabase.auth.getSession();
    if (import.meta.env.DEV) console.debug('[Auth]', { hasSession: Boolean(result.data.session), userId: result.data.user?.id || null, role: result.data.user?.app_metadata?.auth_account_type || null, route: '/login' });
    navigate(nextPath);
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
          <form className="stack" onSubmit={login}>
            <input type="email" required placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
            <input type="password" required placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
            <button className="button primary full" type="submit" disabled={loading}>
              <LogIn size={17} /> {loading ? t('states.loading') : t('buttons.login')}
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

function safeNextPath(value: string | null) {
  const next = String(value || '/dashboard');
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}
