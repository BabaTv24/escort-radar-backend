import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Settings,
  UserRound,
  WalletCards,
  UsersRound
} from 'lucide-react';
import type { Profile } from '../../types';
import { useI18n } from '../../i18n';

export const advertiserDashboardSections = [
  'overview',
  'profile',
  'location',
  'messages',
  'bookings',
  'wallet',
  'referrals',
  'settings'
] as const;

export type AdvertiserDashboardSection = typeof advertiserDashboardSections[number];

const sectionIcons = {
  overview: LayoutDashboard,
  profile: UserRound,
  location: MapPin,
  messages: MessageCircle,
  bookings: CalendarDays,
  wallet: WalletCards,
  referrals: UsersRound,
  settings: Settings
};

export function resolveAdvertiserDashboardSection(value: string | null, hash = ''): AdvertiserDashboardSection {
  const hashSection = hash.replace(/^#/, '');
  if (advertiserDashboardSections.includes(hashSection as AdvertiserDashboardSection)) {
    return hashSection as AdvertiserDashboardSection;
  }
  return advertiserDashboardSections.includes(value as AdvertiserDashboardSection)
    ? value as AdvertiserDashboardSection
    : 'overview';
}

export function AdvertiserDashboardShell({ activeSection, email, onSectionChange, onLogout, children }: {
  activeSection: AdvertiserDashboardSection;
  email: string;
  onSectionChange: (section: AdvertiserDashboardSection) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="advertiser-dashboard-shell">
      <aside className="advertiser-dashboard-sidebar">
        <div className="advertiser-dashboard-brand">
          <span className="eyebrow">Escort Radar</span>
          <strong>{t('advertiserDashboard.workspace')}</strong>
          <small>{email}</small>
        </div>
        <AdvertiserDashboardNav activeSection={activeSection} onSectionChange={onSectionChange} />
        <button type="button" className="advertiser-dashboard-logout" onClick={onLogout}>
          {t('buttons.logout')}
        </button>
      </aside>
      <main className="advertiser-dashboard-workspace" id="advertiser-dashboard-content">
        {children}
      </main>
    </div>
  );
}

export function AdvertiserDashboardNav({ activeSection, onSectionChange }: {
  activeSection: AdvertiserDashboardSection;
  onSectionChange: (section: AdvertiserDashboardSection) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="advertiser-dashboard-nav" aria-label={t('advertiserDashboard.navigation')}>
      {advertiserDashboardSections.map((section) => {
        const Icon = sectionIcons[section];
        return (
          <button
            key={section}
            type="button"
            className={activeSection === section ? 'active' : ''}
            aria-current={activeSection === section ? 'page' : undefined}
            onClick={() => onSectionChange(section)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{t(`advertiserDashboard.section.${section}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AdvertiserDashboardOverview({ profile, draft, subscriptionProgress, onEditProfile }: {
  profile: Profile | null;
  draft: Partial<Profile>;
  subscriptionProgress: ReactNode;
  onEditProfile: () => void;
}) {
  const { t } = useI18n();
  const source = profile || draft;
  const completion = profile ? getAdvertiserProfileCompletion(source) : { completed: 0, total: 8, percent: 0 };
  const warnings = getAdvertiserProfileWarnings(profile, draft, t);
  const operatorStatus = source.operator_status || 'OFFLINE';
  const publicationLabel = !profile
    ? t('advertiserDashboard.status.notCreated')
    : profile.is_published === true
      ? t('advertiserDashboard.status.published')
      : profile.is_published === false
        ? t('advertiserDashboard.status.notPublished')
        : t('advertiserDashboard.status.publicationUnknown');

  return (
    <section className="advertiser-dashboard-overview" aria-labelledby="advertiser-overview-title">
      <header className="advertiser-dashboard-heading">
        <div>
          <p className="eyebrow">Escort Radar</p>
          <h1 id="advertiser-overview-title">{t('advertiserDashboard.overview.title')}</h1>
          <p>{t('advertiserDashboard.overview.subtitle')}</p>
        </div>
        <button type="button" className="button primary" onClick={onEditProfile}>
          {t('advertiserDashboard.overview.editProfile')}
        </button>
      </header>

      <div className="advertiser-dashboard-summary-grid">
        <article className="advertiser-dashboard-summary-card">
          <span>{t('advertiserDashboard.overview.availability')}</span>
          <strong>{t(`dashboard.advertiser.status.${operatorStatus}`)}</strong>
          <small>{source.display_name || t('advertiserDashboard.status.notCreated')}</small>
        </article>
        <article className="advertiser-dashboard-summary-card">
          <span>{t('advertiserDashboard.overview.publication')}</span>
          <strong>{publicationLabel}</strong>
          <small>{profile?.moderation_status ? t(`admin.status.${profile.moderation_status}`) : t('advertiserDashboard.status.noModeration')}</small>
        </article>
        <article className="advertiser-dashboard-summary-card">
          <span>{t('advertiserDashboard.overview.completeness')}</span>
          <strong>{completion.percent}%</strong>
          <div className="advertiser-completion-track" aria-label={`${completion.percent}%`}>
            <i style={{ width: `${completion.percent}%` }} />
          </div>
          <small>{completion.completed}/{completion.total}</small>
        </article>
      </div>

      <div className="advertiser-dashboard-overview-grid">
        <section className="advertiser-dashboard-panel">
          <div className="advertiser-dashboard-panel-head">
            <div>
              <p className="eyebrow">{t('dashboard.visibility.subscription')}</p>
              <h2>{t('advertiserDashboard.overview.subscription')}</h2>
            </div>
          </div>
          {subscriptionProgress}
        </section>

        <section className="advertiser-dashboard-panel">
          <div className="advertiser-dashboard-panel-head">
            <div>
              <p className="eyebrow">{t('advertiserDashboard.overview.attention')}</p>
              <h2>{warnings.length ? t('advertiserDashboard.overview.actionNeeded') : t('advertiserDashboard.overview.ready')}</h2>
            </div>
          </div>
          {warnings.length ? (
            <ul className="advertiser-dashboard-warnings">
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : <p className="advertiser-dashboard-empty-note">{t('advertiserDashboard.overview.noWarnings')}</p>}
        </section>
      </div>

      <section className="advertiser-dashboard-panel advertiser-dashboard-quick-links">
        <div>
          <p className="eyebrow">{t('advertiserDashboard.overview.quickActions')}</p>
          <h2>{t('advertiserDashboard.overview.profileActions')}</h2>
        </div>
        <div>
          <button type="button" className="button primary" onClick={onEditProfile}>{t('advertiserDashboard.overview.editProfile')}</button>
          {profile ? <Link className="button" to={`/profile/${profile.id}`}>{t('dashboard.viewPublicProfile')}</Link> : null}
        </div>
      </section>
    </section>
  );
}

export function DashboardSectionPlaceholder({ section }: { section: Exclude<AdvertiserDashboardSection, 'overview' | 'profile' | 'settings'> }) {
  const { t } = useI18n();
  const Icon = sectionIcons[section];
  return (
    <section className="advertiser-dashboard-placeholder" aria-labelledby={`advertiser-${section}-title`}>
      <Icon size={28} aria-hidden="true" />
      <p className="eyebrow">{t('advertiserDashboard.placeholder.eyebrow')}</p>
      <h1 id={`advertiser-${section}-title`}>{t(`advertiserDashboard.section.${section}`)}</h1>
      <p>{t(`advertiserDashboard.placeholder.${section}`)}</p>
      {section === 'location' ? <small>{t('advertiserDashboard.placeholder.locationCurrent')}</small> : null}
    </section>
  );
}

function getAdvertiserProfileCompletion(profile: Partial<Profile>) {
  const checks = [
    Boolean(profile.display_name?.trim()),
    Boolean(profile.description?.trim()),
    Boolean(profile.profile_images?.length),
    Boolean(profile.work_city || profile.city),
    Boolean(profile.services?.length),
    Boolean(profile.price_1h || profile.price_30min),
    Boolean(profile.primary_phone || profile.phone || profile.whatsapp || profile.telegram),
    Boolean(profile.opening_hours || profile.working_24_7 || profile.working_today_start)
  ];
  const completed = checks.filter(Boolean).length;
  return { completed, total: checks.length, percent: Math.round((completed / checks.length) * 100) };
}

function getAdvertiserProfileWarnings(profile: Profile | null, draft: Partial<Profile>, t: (key: string) => string) {
  const source = profile || draft;
  const warnings: string[] = [];
  if (!profile) warnings.push(t('advertiserDashboard.warning.notCreated'));
  if (!source.profile_images?.length) warnings.push(t('advertiserDashboard.warning.photo'));
  if (!(source.work_city || source.city)) warnings.push(t('advertiserDashboard.warning.location'));
  if (profile && !profile.is_published) warnings.push(t('advertiserDashboard.warning.notPublished'));
  if (profile && profile.subscription_status !== 'active' && !profile.is_test_account) warnings.push(t('advertiserDashboard.warning.subscription'));
  return warnings;
}
