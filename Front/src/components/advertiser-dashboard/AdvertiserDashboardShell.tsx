import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
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
import {
  getAdvertiserProfileCompleteness,
  type AdvertiserProfileCompletionSection
} from '../../lib/advertiserProfileCompleteness';

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

export function AdvertiserDashboardOverview({ profile, draft, subscriptionProgress, onEditProfile, onOpenCompletionSection }: {
  profile: Profile | null;
  draft: Partial<Profile>;
  subscriptionProgress: ReactNode;
  onEditProfile: () => void;
  onOpenCompletionSection: (section: AdvertiserProfileCompletionSection) => void;
}) {
  const { t } = useI18n();
  const source = profile || draft;
  const completion = getAdvertiserProfileCompleteness(profile);
  const operationalWarnings = getAdvertiserOperationalWarnings(profile, t);
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
        <article className="advertiser-dashboard-summary-card advertiser-dashboard-completeness-card">
          <span>{t('advertiserDashboard.overview.completeness')}</span>
          <strong>{completion.percent}%</strong>
          <div className="advertiser-completion-track" aria-label={`${completion.percent}%`}>
            <i style={{ width: `${completion.percent}%` }} />
          </div>
          <small>{completion.completed}/{completion.total}</small>
          {completion.missing.length ? (
            <ul className="advertiser-completion-missing" aria-label={t('advertiserDashboard.completeness.missingList')}>
              {completion.missing.map((item) => (
                <li key={item.id}>
                  <AlertTriangle size={17} aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                  <button type="button" onClick={() => onOpenCompletionSection(item.section)}>
                    {t('advertiserDashboard.completeness.completeAction')}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="advertiser-completion-success">{t('advertiserDashboard.completeness.allComplete')}</p>}
          <details className="advertiser-completion-details">
            <summary>{t('advertiserDashboard.completeness.showDetails')}</summary>
            <ul className="advertiser-completion-checklist">
              {completion.items.map((item) => (
                <li key={item.id} className={item.complete ? 'complete' : 'missing'}>
                  {item.complete
                    ? <CheckCircle2 size={18} aria-hidden="true" />
                    : <AlertTriangle size={18} aria-hidden="true" />}
                  <span>{t(item.labelKey)}</span>
                  {!item.complete ? (
                    <button type="button" onClick={() => onOpenCompletionSection(item.section)}>
                      {t('advertiserDashboard.completeness.completeAction')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
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
              <h2>{completion.complete
                ? t('advertiserDashboard.overview.ready')
                : t(completion.missing.length === 1
                  ? 'advertiserDashboard.overview.missingTitleOne'
                  : 'advertiserDashboard.overview.missingTitleMany', { count: completion.missing.length })}</h2>
            </div>
          </div>
          {completion.complete ? (
            <p className="advertiser-dashboard-empty-note">{t('advertiserDashboard.overview.noWarnings')}</p>
          ) : (
            <>
              <p className="advertiser-dashboard-missing-summary">
                {completion.missing.length === 1
                  ? t('advertiserDashboard.overview.missingSummaryOne', { item: t(completion.missing[0].labelKey) })
                  : t('advertiserDashboard.overview.missingSummaryMany', { count: completion.missing.length })}
              </p>
              <ul className="advertiser-dashboard-warnings">
                {completion.missing.map((item) => <li key={item.id}>{t(item.labelKey)}</li>)}
              </ul>
            </>
          )}
          {operationalWarnings.length ? (
            <div className="advertiser-dashboard-operational-warnings">
              <strong>{t('advertiserDashboard.overview.otherAttention')}</strong>
              <ul className="advertiser-dashboard-warnings">
                {operationalWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
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

function getAdvertiserOperationalWarnings(profile: Profile | null, t: (key: string) => string) {
  const warnings: string[] = [];
  if (profile && !profile.is_published) warnings.push(t('advertiserDashboard.warning.notPublished'));
  if (profile && profile.subscription_status !== 'active' && !profile.is_test_account) warnings.push(t('advertiserDashboard.warning.subscription'));
  return warnings;
}
