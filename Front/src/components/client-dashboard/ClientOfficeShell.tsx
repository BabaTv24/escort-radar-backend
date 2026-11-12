import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Gem, Heart, LayoutDashboard, LogOut, MessageCircle, RadioTower, Settings, UserRound, UsersRound } from 'lucide-react';
import { useI18n } from '../../i18n';

export const clientOfficeSections = ['overview', 'favorites', 'bookings', 'messages', 'wallet', 'referrals', 'settings'] as const;
export type ClientOfficeSection = typeof clientOfficeSections[number];

const sectionIcons = {
  overview: LayoutDashboard,
  favorites: Heart,
  bookings: CalendarDays,
  messages: MessageCircle,
  wallet: Gem,
  referrals: UsersRound,
  settings: Settings
};

/** The global mobile navigation links to /dashboard#favorites etc., so the hash selects the section. */
export function resolveClientOfficeSection(hash: string, param: string | null): ClientOfficeSection {
  const fromHash = hash.replace(/^#/, '');
  if (clientOfficeSections.includes(fromHash as ClientOfficeSection)) return fromHash as ClientOfficeSection;
  return clientOfficeSections.includes(param as ClientOfficeSection) ? param as ClientOfficeSection : 'overview';
}

export function ClientOfficeShell({ active, onSelect, badges, email, displayName, avatarUrl, premium, balanceBc, radarPath, onLogout, children }: {
  active: ClientOfficeSection;
  onSelect: (section: ClientOfficeSection) => void;
  badges: Partial<Record<ClientOfficeSection, number>>;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  premium: boolean;
  balanceBc: string;
  radarPath: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const label = (section: ClientOfficeSection) => t(`clientDash.nav.${section}`);

  return (
    <div className="pr-office client-office-v2" id="office">
      <aside className="pr-sidebar" aria-label={t('clientDash.navLabel')}>
        <div className="pr-sidebar-brand">
          <p className="pr-eyebrow">Escort Radar</p>
          <strong>{t('clientDash.officeTitle')}</strong>
          <small>{email}</small>
        </div>
        <nav className="pr-nav">
          {clientOfficeSections.map((section) => {
            const Icon = sectionIcons[section];
            const badge = badges[section] || 0;
            return (
              <button key={section} type="button" className={`pr-nav-item${active === section ? ' is-active' : ''}`} aria-current={active === section ? 'page' : undefined} onClick={() => onSelect(section)}>
                <Icon size={18} aria-hidden="true" />
                <span className="pr-nav-label">{label(section)}</span>
                {badge > 0 ? <span className="pr-count" aria-label={t('activity.badgeLabel', { count: badge })}>{badge > 99 ? '99+' : badge}</span> : null}
              </button>
            );
          })}
          <Link className="pr-nav-item" to={radarPath}>
            <RadioTower size={18} aria-hidden="true" />
            <span className="pr-nav-label">{t('clientDash.nav.radar')}</span>
          </Link>
        </nav>
        <div className="pr-sidebar-foot">
          <button type="button" className="pr-nav-item" onClick={onLogout}>
            <LogOut size={18} aria-hidden="true" />
            <span className="pr-nav-label">{t('buttons.logout')}</span>
          </button>
        </div>
      </aside>

      <main className="pr-main">
        <header className="pr-topbar">
          <div className="pr-topbar-title">
            <p className="pr-eyebrow">{t('clientDash.officeTitle')}</p>
            <strong>{label(active)}</strong>
          </div>
          <div className="pr-topbar-actions">
            <span className={`pr-badge ${premium ? 'is-premium' : 'is-muted'}`}>{premium ? t('clientDash.status.premium') : t('clientDash.status.free')}</span>
            <button type="button" className="pr-balance-pill" onClick={() => onSelect('wallet')} aria-label={t('clientDash.nav.wallet')}>
              <span className="pr-coin"><Gem size={15} aria-hidden="true" /></span>
              <span><small>{t('clientDash.wallet.balance')}</small><span className="pr-num">{balanceBc} BC</span></span>
            </button>
            <button type="button" className="pr-avatar" onClick={() => onSelect('settings')} aria-label={`${displayName} · ${label('settings')}`}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : <UserRound size={20} aria-hidden="true" />}
            </button>
          </div>
        </header>

        <nav className="pr-tabs" aria-label={t('clientDash.navLabel')}>
          {clientOfficeSections.map((section) => {
            const Icon = sectionIcons[section];
            const badge = badges[section] || 0;
            return (
              <button key={section} type="button" className={`pr-tab${active === section ? ' is-active' : ''}`} aria-current={active === section ? 'page' : undefined} onClick={() => onSelect(section)}>
                <Icon size={15} aria-hidden="true" />
                {label(section)}
                {badge > 0 ? <span className="pr-count">{badge > 99 ? '99+' : badge}</span> : null}
              </button>
            );
          })}
        </nav>

        {children}
      </main>
    </div>
  );
}
