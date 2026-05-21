import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { Coins, Radar, ShieldCheck, UserRound } from 'lucide-react';
import { categoryOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';

export function Layout() {
  const { lang, setLang, t, option } = useI18n();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') || '';
  const cityMatch = location.pathname.match(/^\/city\/([^/]+)/);
  const currentCity = cityMatch?.[1] || 'berlin';

  return (
    <div className="app-shell">
      <header className="market-header">
        <Link to="/" className="brand">
          <Radar size={24} />
          <span>Escort Radar</span>
        </Link>
        <nav className="category-nav" aria-label="Categories">
          {categoryOptions.map((category) => (
            <Link
              key={category}
              className={activeCategory === category ? 'category-link active' : 'category-link'}
              to={`/city/${currentCity}?category=${category}`}
            >
              {option(category)}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <Link to={`/city/${currentCity}${activeCategory ? `?category=${activeCategory}` : ''}`} className="radar-action">
            <Radar size={17} />
            <span>{t('nav.radar')}</span>
          </Link>
          <Link to="/tokens" className="radar-action">
            <Coins size={17} />
            <span>{t('nav.tokens')}</span>
          </Link>
          <Link to="/register" className="radar-action">{t('buttons.register')}</Link>
          <Link to="/dashboard" className="radar-action">{t('buttons.login')}</Link>
          <Link to="/dashboard" className="icon-link" aria-label={t('nav.dashboard')}>
            <UserRound size={20} />
          </Link>
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
      <footer className="footer">
        <div>
          <strong>{t('footer.title')}</strong>
          <span>{t('footer.notice')}</span>
        </div>
        <a className="baba-footer-badge" href="https://www.baba-ai.de" target="_blank" rel="noreferrer">
          <span className="baba-wordmark">BABA AI</span>
          <span>
            <strong>{t('baba.powered')}</strong>
            <small>{t('baba.infrastructure')}</small>
          </span>
        </a>
        <div className="footer-links">
          <Link to="/legal/terms">{t('nav.terms')}</Link>
          <Link to="/legal/privacy">{t('nav.privacy')}</Link>
          <Link to="/legal/content-policy">{t('nav.policy')}</Link>
          <Link to="/legal/report-abuse"><ShieldCheck size={16} /> {t('nav.report')}</Link>
          <Link to="/admin-access">{t('nav.admin')}</Link>
        </div>
      </footer>
    </div>
  );
}
