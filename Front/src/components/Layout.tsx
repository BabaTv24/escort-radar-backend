import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Coins, Heart, LogOut, Menu, MessageCircle, Radar, ShieldCheck, UserRound, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { normalizeCategoryKey } from '../lib/categories';
import { supabase } from '../lib/supabase';

type HeaderAccountRole = 'client' | 'advertiser' | 'business' | 'admin' | 'account';

type HeaderAccount = {
  loading: boolean;
  email: string;
  role: HeaderAccountRole;
};

export function Layout() {
  const { lang, setLang, t } = useI18n();
  const operatorName = import.meta.env.VITE_LEGAL_OPERATOR_NAME || '';
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeCategory = normalizeCategoryKey(searchParams.get('category'));
  const cityMatch = location.pathname.match(/^\/city\/([^/]+)/);
  const currentCity = cityMatch?.[1] || 'berlin';
  const [account, setAccount] = useState<HeaderAccount>({ loading: true, email: '', role: 'account' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isSignedIn = Boolean(account.email);
  const dashboardLabel = account.role === 'advertiser' || account.role === 'business' ? t('auth.myListing') : t('auth.dashboard');
  const favoritesPath = '/dashboard#favorites';
  const messagesPath = '/dashboard#messages';
  const bookingsPath = '/dashboard#bookings';
  const tokensPath = '/tokens';
  const accountPath = '/dashboard';
  const authPath = (path: string) => isSignedIn ? path : `/login?next=${encodeURIComponent(path)}`;
  const isDashboardRoute = location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/');
  const isCityRoute = location.pathname.startsWith('/city/');
  const isCoinRoute = location.pathname === '/coins' || location.pathname === '/tokens';
  const isProfileRoute = location.pathname.startsWith('/profile/');
  const isAppRoute = isDashboardRoute || isCityRoute || isCoinRoute || isProfileRoute;
  const isDashboard = isDashboardRoute;
  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';

  useEffect(() => {
    let mounted = true;

    async function activateSession(session: Session | null) {
      const next = await resolveHeaderAccount(session);
      if (import.meta.env.DEV) console.debug('[Auth]', { hasSession: Boolean(session), userId: session?.user?.id || null, role: next.role, route: location.pathname });
      if (import.meta.env.DEV) console.debug('[MobileLogin]', { sessionExistsAfterLogin: Boolean(session), navigateTarget: `${location.pathname}${location.hash}` });
      if (mounted) setAccount(next);
    }

    supabase.auth.getSession().then(({ data }) => activateSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void activateSession(session);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  async function logout() {
    await supabase.auth.signOut();
    setAccount({ loading: false, email: '', role: 'account' });
    navigate('/', { replace: true });
  }

  return (
    <div className="app-shell" translate="no">
      <header className="market-header">
        <Link to="/" className="brand-logo" translate="no">
          <img className="brand-logo-img" src="/Logo_Escort_5.png" alt="" />
          <img className="brand-wordmark-img" src="/brand-escort-radar-fun.png" alt="Escort-Radar.fun" />
        </Link>
        <div className="mobile-auth-actions" aria-label="Mobile account controls">
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((value) => !value)}
          >
            {mobileMenuOpen ? <X size={19} /> : <Menu size={20} />}
          </button>
          <div className="mobile-language-switcher" aria-label="Language" translate="no">
            {(['de', 'pl', 'en'] as const).map((item) => (
              <button key={item} className={lang === item ? 'selected' : ''} onClick={() => setLang(item)}>{item.toUpperCase()}</button>
            ))}
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="mobile-menu-panel">
            <Link className="er-glass-btn er-glass-btn--purple er-glass-btn--sm" to={authPath(tokensPath)}><Coins size={16} /> <span>{t('nav.tokens')}</span></Link>
            <Link className="er-glass-btn er-glass-btn--purple er-glass-btn--sm" to="/coins"><Coins size={16} /> <span>{t('coins.title')}</span></Link>
            {isSignedIn ? (
              <>
                <span className="mobile-account-role">{t(`auth.${account.role}`)}</span>
                <Link className="er-glass-btn er-glass-btn--gold er-glass-btn--sm" to="/dashboard"><UserRound size={16} /> <span>{dashboardLabel}</span></Link>
                <Link className="er-glass-btn er-glass-btn--pink er-glass-btn--sm" to={favoritesPath}><Heart size={16} /> <span>{t('favorites.favorites')}</span></Link>
                <button className="er-glass-btn er-glass-btn--red er-glass-btn--sm" type="button" onClick={logout}><LogOut size={16} /> <span>{t('auth.logout')}</span></button>
              </>
            ) : (
              <>
                <Link to="/register?type=client"><UserRound size={16} /> {t('buttons.register')}</Link>
                <Link to="/register?type=escort"><Radar size={16} /> {t('buttons.addListing')}</Link>
                <Link to="/login"><UserRound size={16} /> {t('buttons.login')}</Link>
              </>
            )}
          </div>
        )}
        <div className="header-actions">
          {!isAppRoute && (
            <Link to={`/city/${currentCity}${activeCategory ? `?category=${activeCategory}` : ''}`} className="radar-action premium-header-cta er-glass-btn er-glass-btn--gold er-glass-btn--sm">
              <Radar size={17} />
              <span>{t('home.openRadar')}</span>
            </Link>
          )}
          {!isDashboardRoute && (
            <Link to="/tokens" className="radar-action er-glass-btn er-glass-btn--purple er-glass-btn--sm">
              <Coins size={17} />
              <span>{t('nav.tokens')}</span>
            </Link>
          )}
          <Link to="/coins" className="radar-action er-glass-btn er-glass-btn--purple er-glass-btn--sm">
            <Coins size={17} />
            <span>{t('coins.title')}</span>
          </Link>
          {account.loading ? <span className="account-loading-pill" aria-hidden="true" /> : isSignedIn ? (
            <div className="header-account-area">
              <Link to="/dashboard" className="account-pill">
                <UserRound size={17} />
                <span>{t('auth.loggedInAs')}: <strong>{t(`auth.${account.role}`)}</strong></span>
                {account.email ? <small>{account.email}</small> : null}
              </Link>
              {!isDashboardRoute && <Link to="/dashboard" className="radar-action account-dashboard-link er-glass-btn er-glass-btn--gold er-glass-btn--sm"><span>{dashboardLabel}</span></Link>}
              {account.role === 'admin' ? <Link to="/admin" className="radar-action er-glass-btn er-glass-btn--gold er-glass-btn--sm"><span>{t('auth.admin')}</span></Link> : null}
              <button className="radar-action account-logout er-glass-btn er-glass-btn--red er-glass-btn--sm" type="button" onClick={logout}>
                <LogOut size={16} />
                <span>{t('auth.logout')}</span>
              </button>
            </div>
          ) : (
            <>
              <Link to="/register?type=client" className="radar-action">{t('buttons.register')}</Link>
              <Link to="/register?type=escort" className="radar-action">{t('buttons.addListing')}</Link>
              <Link to="/login" className="radar-action">{t('buttons.login')}</Link>
              <Link to="/dashboard" className="icon-link" aria-label={t('nav.dashboard')}>
                <UserRound size={20} />
              </Link>
            </>
          )}
          <div className="language-switcher">
            {(['de', 'pl', 'en'] as const).map((item) => (
              <button key={item} className={lang === item ? 'selected' : ''} onClick={() => setLang(item)}>{item.toUpperCase()}</button>
            ))}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <nav className="luxury-bottom-nav" aria-label="Mobile navigation">
        <Link className={cityMatch ? 'active' : ''} to={`/city/${currentCity}${activeCategory ? `?category=${activeCategory}` : ''}`}>
          <Radar size={18} />
          <span>{t('nav.radar')}</span>
        </Link>
        <Link className={isDashboard && location.hash === '#favorites' ? 'active' : ''} to={authPath(favoritesPath)}>
          <Heart size={18} />
          <span>{t('favorites.favorites')}</span>
        </Link>
        <Link className={isDashboard && location.hash === '#messages' ? 'active' : ''} to={authPath(messagesPath)}>
          <MessageCircle size={18} />
          <span>{t('nav.messages')}</span>
        </Link>
        <Link className={isDashboard && location.hash === '#bookings' ? 'active' : ''} to={authPath(bookingsPath)}>
          <CalendarDays size={18} />
          <span>{t('nav.bookings')}</span>
        </Link>
        <Link className={(isDashboard && !['#favorites', '#messages', '#bookings'].includes(location.hash)) || isAuthRoute ? 'active' : ''} to={authPath(accountPath)}>
          <UserRound size={18} />
          <span>{isSignedIn ? t('auth.dashboard') : t('auth.account')}</span>
        </Link>
      </nav>
      {!isAppRoute && (
        <footer className="footer">
          <div>
            <strong>{t('footer.title')}</strong>
            <span>{t('footer.notice')}</span>
            {operatorName ? <small>{t('footer.operatedBy', { operator: operatorName })}</small> : null}
          </div>
          <a className="baba-footer-badge baba-image-badge" href="https://www.baba-ai.de" target="_blank" rel="noreferrer">
            <img src="/Sektion_1_4.png" alt="BABA AI" />
            <span>
              <strong>{t('baba.powered')}</strong>
              <small>{t('baba.infrastructure')}</small>
            </span>
          </a>
          <div className="footer-links">
            <Link to="/terms">{t('nav.terms')}</Link>
            <Link to="/privacy">{t('nav.privacy')}</Link>
            <Link to="/refund-policy">{t('nav.refundPolicy')}</Link>
            <Link to="/content-rules">{t('nav.policy')}</Link>
            <Link to="/report-abuse"><ShieldCheck size={16} /> {t('nav.report')}</Link>
            <Link to="/contact">{t('nav.contact')}</Link>
            <Link to="/pricing">{t('nav.pricing')}</Link>
            <Link to="/app">{t('nav.installApp')}</Link>
            <Link to="/legal-notice">{t('nav.legalNotice')}</Link>
          </div>
        </footer>
      )}
    </div>
  );
}

async function resolveHeaderAccount(session: Session | null): Promise<HeaderAccount> {
  if (!session?.user) return { loading: false, email: '', role: 'account' };

  const fallback = {
    loading: false,
    email: session.user.email || '',
    role: roleFromUser(session.user)
  };

  if (!session.access_token) return fallback;

  try {
    const data = await api.authMe(session.access_token);
    const role = normalizeHeaderRole(data.user.role || data.user.auth_account_type || data.user.app_metadata?.role || data.user.app_metadata?.auth_account_type) || fallback.role;
    return {
      loading: false,
      email: data.user.email || fallback.email,
      role
    };
  } catch {
    return fallback;
  }
}

function roleFromUser(user: User): HeaderAccountRole {
  const appMetadata = user.app_metadata || {};
  const userMetadata = user.user_metadata || {};
  return normalizeHeaderRole(
    appMetadata.role
    || appMetadata.auth_account_type
    || appMetadata.account_type
    || userMetadata.role
    || userMetadata.auth_account_type
    || userMetadata.account_type
  ) || 'account';
}

function normalizeHeaderRole(value: unknown): HeaderAccountRole | null {
  const role = String(value || '').toLowerCase();
  if (role === 'admin' || role === 'moderator') return 'admin';
  if (role === 'client') return 'client';
  if (role === 'business' || role === 'agency' || role === 'massage_salon' || role === 'club_party' || role === 'live_cam') return 'business';
  if (role === 'escort' || role === 'advertiser' || role === 'private') return 'advertiser';
  return null;
}
