import { Link, NavLink, Outlet } from 'react-router-dom';
import { Radar, ShieldCheck, UserRound } from 'lucide-react';
import { cities } from '../data/cities';
import { useI18n } from '../i18n';

export function Layout() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <Radar size={24} />
          <span>Escort Radar</span>
        </Link>
        <nav className="desktop-nav">
          {cities.slice(0, 3).map((city) => (
            <NavLink key={city.slug} to={`/city/${city.slug}`}>{city.name}</NavLink>
          ))}
          <NavLink to="/dashboard">{t('nav.dashboard')}</NavLink>
        </nav>
        <div className="language-switcher">
          {(['de', 'pl', 'en'] as const).map((item) => (
            <button key={item} className={lang === item ? 'selected' : ''} onClick={() => setLang(item)}>{item.toUpperCase()}</button>
          ))}
        </div>
        <Link to="/dashboard" className="icon-link" aria-label="Dashboard">
          <UserRound size={20} />
        </Link>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="footer">
        <div>
          <strong>{t('footer.title')}</strong>
          <span>{t('footer.notice')}</span>
        </div>
        <div className="footer-links">
          <Link to="/legal/terms">{t('nav.terms')}</Link>
          <Link to="/legal/privacy">{t('nav.privacy')}</Link>
          <Link to="/legal/content-policy">{t('nav.policy')}</Link>
          <Link to="/legal/report-abuse"><ShieldCheck size={16} /> {t('nav.report')}</Link>
        </div>
      </footer>
    </div>
  );
}
