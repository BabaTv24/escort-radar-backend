import { Link, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { CalendarDays, Coins, Heart, MessageCircle, Radar, ShieldCheck, UserRound } from 'lucide-react';
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
    <div className="app-shell" translate="no">
      <header className="market-header">
        <Link to="/" className="brand" translate="no">
          <img className="brand-logo-img" src="/Logo_Escort_3.png" alt="" />
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
        <div className="mobile-auth-actions" aria-label="Mobile account controls">
          <div className="mobile-account-links">
            <Link to="/register?type=client">{t('buttons.register')}</Link>
            <span aria-hidden="true">/</span>
            <Link to="/login">{t('buttons.login')}</Link>
          </div>
          <div className="mobile-language-switcher" aria-label="Language" translate="no">
            {(['de', 'pl', 'en'] as const).map((item) => (
              <button key={item} className={lang === item ? 'selected' : ''} onClick={() => setLang(item)}>{item.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="header-actions">
          <Link to={`/city/${currentCity}${activeCategory ? `?category=${activeCategory}` : ''}`} className="radar-action premium-header-cta">
            <Radar size={17} />
            <span>Radar öffnen</span>
          </Link>
          <Link to="/tokens" className="radar-action">
            <Coins size={17} />
            <span>{t('nav.tokens')}</span>
          </Link>
          <Link to="/coins" className="radar-action">
            <Coins size={17} />
            <span>Coins</span>
          </Link>
          <Link to="/register?type=client" className="radar-action">{t('buttons.register')}</Link>
          <Link to="/register?type=escort" className="radar-action">{t('buttons.addListing')}</Link>
          <Link to="/login" className="radar-action">{t('buttons.login')}</Link>
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
      <nav className="luxury-bottom-nav" aria-label="Mobile navigation">
        <Link to={`/city/${currentCity}${activeCategory ? `?category=${activeCategory}` : ''}`}>
          <Radar size={18} />
          <span>Radar</span>
        </Link>
        <Link to="/dashboard">
          <Heart size={18} />
          <span>Favorites</span>
        </Link>
        <Link to="/dashboard">
          <MessageCircle size={18} />
          <span>Messages</span>
        </Link>
        <Link to="/dashboard">
          <CalendarDays size={18} />
          <span>Bookings</span>
        </Link>
        <Link to="/dashboard">
          <UserRound size={18} />
          <span>Profile</span>
        </Link>
      </nav>
      <footer className="footer">
        <div>
          <strong>{t('footer.title')}</strong>
          <span>{t('footer.notice')}</span>
        </div>
        <a className="baba-footer-badge baba-image-badge" href="https://www.baba-ai.de" target="_blank" rel="noreferrer">
          <img src="/Sektion_1_4.png" alt="BABA AI" />
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
