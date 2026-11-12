import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Coins,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageCircle,
  PencilLine,
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
  'earnings',
  'subscription',
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
  earnings: Coins,
  subscription: CreditCard,
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

/** Business Center frame: the shared Premium office layout (sidebar on desktop, section tabs on mobile). */
export function AdvertiserDashboardShell({ activeSection, email, onSectionChange, onLogout, badges, children }: {
  activeSection: AdvertiserDashboardSection;
  badges?: Partial<Record<AdvertiserDashboardSection, number>>;
  email: string;
  onSectionChange: (section: AdvertiserDashboardSection) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  return (
    <div className="pr-office advertiser-business-center">
      <aside className="pr-sidebar" aria-label={t('advertiserDashboard.navigation')}>
        <div className="pr-sidebar-brand">
          <p className="pr-eyebrow">Escort Radar</p>
          <strong>{t('businessCenter.title')}</strong>
          <small>{email}</small>
        </div>
        <AdvertiserDashboardNav activeSection={activeSection} onSectionChange={onSectionChange} badges={badges} />
        <div className="pr-sidebar-foot">
          <button type="button" className="pr-nav-item advertiser-dashboard-logout" onClick={onLogout}>
            <LogOut size={18} aria-hidden="true" />
            <span className="pr-nav-label">{t('buttons.logout')}</span>
          </button>
        </div>
      </aside>
      <main className="pr-main" id="advertiser-dashboard-content">
        <nav className="pr-tabs" aria-label={t('advertiserDashboard.navigation')}>
          {advertiserDashboardSections.map((section) => {
            const Icon = sectionIcons[section];
            const badge = badges?.[section] || 0;
            return (
              <button key={section} type="button" className={`pr-tab${activeSection === section ? ' is-active' : ''}`} aria-current={activeSection === section ? 'page' : undefined} onClick={() => onSectionChange(section)}>
                <Icon size={15} aria-hidden="true" />
                {t(`advertiserDashboard.section.${section}`)}
                {badge > 0 ? <span className="pr-count er-nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
              </button>
            );
          })}
        </nav>
        {children}
      </main>
    </div>
  );
}

export function AdvertiserDashboardNav({ activeSection, onSectionChange, badges }: {
  activeSection: AdvertiserDashboardSection;
  badges?: Partial<Record<AdvertiserDashboardSection, number>>;
  onSectionChange: (section: AdvertiserDashboardSection) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="pr-nav advertiser-dashboard-nav" aria-label={t('advertiserDashboard.navigation')}>
      {advertiserDashboardSections.map((section) => {
        const Icon = sectionIcons[section];
        const badge = badges?.[section] || 0;
        return (
          <button
            key={section}
            type="button"
            className={`pr-nav-item${activeSection === section ? ' is-active active' : ''}`}
            aria-current={activeSection === section ? 'page' : undefined}
            onClick={() => onSectionChange(section)}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="pr-nav-label">{t(`advertiserDashboard.section.${section}`)}</span>
            {badge > 0 ? <span className="pr-count er-nav-badge" data-badge={section} aria-label={t('activity.badgeLabel', { count: badge })}>{badge > 99 ? '99+' : badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

export function AdvertiserSectionHeading({ section, actions }: { section: AdvertiserDashboardSection; actions?: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="pr-hero">
      <div>
        <p className="pr-eyebrow">{t('businessCenter.title')}</p>
        <h1 className="pr-title" id={`advertiser-${section}-heading`}>{t(`advertiserDashboard.section.${section}`)}</h1>
        <p className="pr-lead">{t(`businessCenter.subtitle.${section}`)}</p>
      </div>
      {actions ? <div className="pr-hero-actions">{actions}</div> : null}
    </header>
  );
}

export function AdvertiserDashboardOverview({ profile, draft, subscriptionProgress, businessActivity, earningsSummary, onEditProfile, onOpenCompletionSection, onOpenSection }: {
  profile: Profile | null;
  businessActivity?: ReactNode;
  earningsSummary?: ReactNode;
  draft: Partial<Profile>;
  subscriptionProgress: ReactNode;
  onEditProfile: () => void;
  onOpenCompletionSection: (section: AdvertiserProfileCompletionSection) => void;
  onOpenSection?: (section: AdvertiserDashboardSection) => void;
}) {
  const { t } = useI18n();
  const source = profile || draft;
  const completion = getAdvertiserProfileCompleteness(profile);
  const operationalWarnings = getAdvertiserOperationalWarnings(profile, t);
  const operatorStatus = source.operator_status || 'OFFLINE';
  const subscriptionActive = profile?.subscription_status === 'active';
  const publicationLabel = !profile
    ? t('advertiserDashboard.status.notCreated')
    : profile.is_published === true
      ? t('advertiserDashboard.status.published')
      : profile.is_published === false
        ? t('advertiserDashboard.status.notPublished')
        : t('advertiserDashboard.status.publicationUnknown');

  return (
    <section className="pr-grid advertiser-dashboard-overview" aria-labelledby="advertiser-overview-title">
      <header className="pr-hero">
        <div>
          <p className="pr-eyebrow">{t('businessCenter.title')}</p>
          <h1 className="pr-title" id="advertiser-overview-title">{source.display_name || t('advertiserDashboard.overview.title')}</h1>
          <p className="pr-lead">{t('advertiserDashboard.overview.subtitle')}</p>
          <div className="pr-badges">
            <span className={`pr-badge ${profile?.is_published ? 'is-success' : 'is-warning'}`}>{publicationLabel}</span>
            <span className={`pr-badge ${operatorStatus === 'OFFLINE' ? 'is-muted' : 'is-success'}`}>{t(`dashboard.advertiser.status.${operatorStatus}`)}</span>
            <span className={`pr-badge ${subscriptionActive ? 'is-premium' : 'is-warning'}`}>{t('businessCenter.subscriptionBadge', { status: t(`admin.status.${profile?.subscription_status || 'free'}`) })}</span>
            {profile?.moderation_status ? <span className="pr-badge is-plain">{t(`admin.status.${profile.moderation_status}`)}</span> : null}
          </div>
        </div>
        <div className="pr-hero-actions">
          <button type="button" className="pr-btn is-primary" onClick={onEditProfile}><PencilLine size={16} aria-hidden="true" /> {t('advertiserDashboard.overview.editProfile')}</button>
          {profile ? <Link className="pr-btn" to={`/profile/${profile.id}`}><ExternalLink size={16} aria-hidden="true" /> {t('dashboard.viewPublicProfile')}</Link> : null}
        </div>
      </header>

      {businessActivity}

      <div className="pr-grid-3 advertiser-overview-cards">
        <section className="pr-card advertiser-dashboard-completeness-card" aria-labelledby="advertiser-completeness-title">
          <div className="pr-card-head">
            <div>
              <p className="pr-eyebrow">{t('advertiserDashboard.overview.completeness')}</p>
              <h2 className="pr-h2" id="advertiser-completeness-title">{completion.complete
                ? t('advertiserDashboard.overview.ready')
                : t(completion.missing.length === 1
                  ? 'advertiserDashboard.overview.missingTitleOne'
                  : 'advertiserDashboard.overview.missingTitleMany', { count: completion.missing.length })}</h2>
            </div>
            <span className="pr-badge is-premium is-plain pr-num">{completion.percent}%</span>
          </div>
          <div className="advertiser-completion-track" aria-label={`${completion.percent}%`}>
            <i style={{ width: `${completion.percent}%` }} />
          </div>
          {completion.missing.length ? (
            <ul className="advertiser-completion-missing" aria-label={t('advertiserDashboard.completeness.missingList')}>
              {completion.missing.map((item) => (
                <li key={item.id}>
                  <AlertTriangle size={17} aria-hidden="true" />
                  <span>{t(item.labelKey)}</span>
                  <button type="button" className="pr-btn is-sm" onClick={() => onOpenCompletionSection(item.section)}>
                    {t('advertiserDashboard.completeness.completeAction')}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="pr-muted advertiser-completion-success"><BadgeCheck size={16} aria-hidden="true" /> {t('advertiserDashboard.completeness.allComplete')}</p>}
          <details className="advertiser-completion-details">
            <summary>{t('advertiserDashboard.completeness.showDetails')} ({completion.completed}/{completion.total})</summary>
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
          {operationalWarnings.length ? (
            <div className="advertiser-dashboard-operational-warnings">
              <strong>{t('advertiserDashboard.overview.otherAttention')}</strong>
              <ul className="advertiser-dashboard-warnings">
                {operationalWarnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="pr-card" aria-labelledby="advertiser-subscription-overview">
            <div className="pr-card-head">
              <div>
                <p className="pr-eyebrow">{t('dashboard.visibility.subscription')}</p>
                <h2 className="pr-h2" id="advertiser-subscription-overview">{t('advertiserDashboard.overview.subscription')}</h2>
              </div>
              {onOpenSection ? <button type="button" className="pr-btn is-sm is-ghost" onClick={() => onOpenSection('subscription')}>{t('businessCenter.details')}</button> : null}
            </div>
            {subscriptionProgress}
          </section>
        {earningsSummary}
      </div>
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
