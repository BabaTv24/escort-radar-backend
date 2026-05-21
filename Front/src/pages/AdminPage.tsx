import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Ban, CalendarDays, FlaskConical, NotebookPen, Settings, Shield, Video } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { AdminActivity, AdminReport, BookingRequest, Profile } from '../types';
import { useI18n } from '../i18n';

type AdminTab = 'dashboard' | 'profiles' | 'verification' | 'reports' | 'tests' | 'lab' | 'settings';

const tabs: AdminTab[] = ['dashboard', 'profiles', 'verification', 'reports', 'tests', 'lab', 'settings'];
const profileStatuses = ['pending', 'active', 'rejected', 'suspended'];
const verificationStatuses = ['pending', 'verified', 'changes_requested', 'rejected'];
const moderationStatuses = ['clean', 'review', 'suspended', 'blocked'];
const reportStatuses = ['open', 'investigating', 'resolved', 'escalated'];
const bookingStatuses = ['pending', 'accepted', 'rejected', 'cancelled'];
const adminEmails = ['mtvx007@gmail.com', 'babatv24@proton.me'];

export function AdminPage({ accessMode = false }: { accessMode?: boolean }) {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [tokenStats, setTokenStats] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState('');
  const [phoneSearch, setPhoneSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { t, option } = useI18n();
  const navigate = useNavigate();

  const selectedProfile = useMemo(() => profiles.find((profile) => profile.id === selectedId) || profiles[0], [profiles, selectedId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token || '';
      if (!accessToken || token) return;
      setToken(accessToken);
      load(accessToken);
    });
  }, []);

  async function login() {
    setLoading(true);
    setMessage('');
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setLoading(false);
      return setMessage(result.error.message);
    }
    const signedEmail = result.data.user?.email?.toLowerCase() || '';
    if (accessMode && !adminEmails.includes(signedEmail)) {
      setLoading(false);
      return setMessage(t('adminAccess.noAccess'));
    }
    const accessToken = result.data.session?.access_token || '';
    setToken(accessToken);
    await load(accessToken);
    setLoading(false);
    if (accessMode) navigate('/admin', { replace: true });
  }

  async function load(accessToken = token) {
    const [statsData, profileData, reportData, bookingData, settingsData, tokenData] = await Promise.all([
      api.adminStats(accessToken),
      api.adminProfiles(accessToken, phoneSearch ? `?phone=${encodeURIComponent(phoneSearch)}` : ''),
      api.adminReports(accessToken),
      api.adminBookings(accessToken),
      api.adminSettings(accessToken),
      api.adminTokenStats(accessToken)
    ]);
    setStats({ ...profileData.stats, ...statsData.stats, reports: reportData.reports_count });
    setActivity(statsData.latest_activity);
    setProfiles(profileData.profiles);
    setReports(reportData.reports);
    setBookings(bookingData.booking_requests);
    setSettings(settingsData.settings);
    setTokenStats(tokenData.stats);
    if (!selectedId && profileData.profiles[0]) setSelectedId(profileData.profiles[0].id);
  }

  async function adminAction(action: () => Promise<unknown>) {
    setLoading(true);
    setMessage('');
    try {
      await action();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setLoading(false);
    }
  }

  if (accessMode && !token) {
    return (
      <div className="admin-access-shell">
        <div className="admin-access-grid-bg" />
        <section className="admin-access-hero">
          <div>
            <div className="baba-admin-badge">
              <span className="baba-wordmark">BABA AI</span>
              <strong>{t('baba.adminConsole')}</strong>
            </div>
            <p className="eyebrow">{t('adminAccess.eyebrow')}</p>
            <h1><Shield size={34} /> {t('adminAccess.headline')}</h1>
            <p>{t('adminAccess.subtitle')}</p>
            <div className="admin-access-metrics">
              <span>{t('adminAccess.metricVerification')}</span>
              <span>{t('adminAccess.metricReports')}</span>
              <span>{t('adminAccess.metricInfrastructure')}</span>
            </div>
          </div>
          <div className="admin-access-card">
            <h2>{t('adminAccess.loginTitle')}</h2>
            <input type="email" placeholder={t('admin.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
            <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
            <input placeholder={t('adminAccess.twoFactor')} disabled />
            <p>{t('adminAccess.auditNotice')}</p>
            <button className="button primary full" disabled={loading} onClick={login}>{loading ? t('states.loading') : t('buttons.login')}</button>
            {message && <p className="error-text">{message}</p>}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={accessMode ? 'page admin-page admin-page-access' : 'page admin-page'}>
      <section className="admin-hero">
        <div className="baba-admin-badge">
          <span className="baba-wordmark">BABA AI</span>
          <strong>{t('baba.adminConsole')}</strong>
        </div>
        <p className="eyebrow">{t('admin.eyebrow')}</p>
        <h1><Shield size={30} /> {t('admin.title')}</h1>
        <p>{t('admin.subtitle')}</p>
        <div className="admin-notice-row">
          <span><BadgeCheck size={16} /> {t('admin.manualVerification')}</span>
          <span><AlertTriangle size={16} /> {t('admin.sensitiveCases')}</span>
          <span>{t('baba.manualModeration')}</span>
        </div>
      </section>

      {!token && (
        <section className="admin-login glass-panel">
          <h2>{t('admin.loginTitle')}</h2>
          <input type="email" placeholder={t('admin.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button primary" disabled={loading} onClick={login}>{loading ? t('states.loading') : t('buttons.login')}</button>
          {message && <p className="error-text">{message}</p>}
        </section>
      )}

      {token && (
        <>
          <nav className="admin-tabs" aria-label={t('admin.title')}>
            {tabs.map((tab) => (
              <button key={tab} className={activeTab === tab ? 'selected' : ''} onClick={() => setActiveTab(tab)}>
                {t(`admin.tabs.${tab}`)}
              </button>
            ))}
          </nav>

          {message && <p className="error-text">{message}</p>}

          <section className="ops-monitor-grid">
            <div className="ops-card"><strong>{stats.pending_verification || 0}</strong><span>{t('adminOps.pendingVerification')}</span></div>
            <div className="ops-card danger"><strong>{stats.reports || 0}</strong><span>{t('adminOps.reportedProfiles')}</span></div>
            <div className="ops-card live"><strong>{profiles.filter((profile) => profile.availability_status === 'available').length}</strong><span>{t('adminOps.onlineProfiles')}</span></div>
            <div className="ops-card warn"><strong>{profiles.filter((profile) => profile.availability_status === 'busy').length}</strong><span>{t('adminOps.busyProfiles')}</span></div>
            <div className="ops-card danger"><strong>{profiles.filter((profile) => profile.availability_status === 'unavailable').length}</strong><span>{t('adminOps.offlineProfiles')}</span></div>
            <div className="ops-card"><strong>{bookings.length}</strong><span>{t('adminOps.vipBookings')}</span></div>
            <div className="ops-card"><strong>{profiles.filter((profile) => profile.verification_status === 'pending').length}</strong><span>{t('adminOps.manualQueue')}</span></div>
            <div className="ops-card"><strong>{profiles.length}</strong><span>{t('adminOps.marketplaceStats')}</span></div>
            <div className="ops-card lab"><strong>{stats.test_accounts || 0}</strong><span>{t('adminOps.testAccounts')}</span></div>
            <div className="ops-card lab"><strong>0</strong><span>{t('adminOps.liveChat')}</span></div>
            <div className="ops-card lab"><strong>0</strong><span>{t('adminOps.liveCam')}</span></div>
            <div className="ops-card danger"><strong>{reports.filter((report) => report.admin_status === 'open' || report.admin_status === 'investigating').length}</strong><span>{t('adminOps.abuseReports')}</span></div>
          </section>

          <section className="token-control-grid">
            {['token_circulation', 'eur_spent', 'active_streams', 'stream_viewers', 'premium_unlock_value', 'master_reserve_tatacoin'].map((key) => (
              <div className="token-control-card" key={key}>
                <span>{t(`tokens.admin.${key}`)}</span>
                <strong>{Math.round(Number(tokenStats[key] || 0)).toLocaleString()}</strong>
              </div>
            ))}
          </section>

          <section className="glass-panel admin-phone-search">
            <h2>{t('admin.phoneSearch')}</h2>
            <div className="row">
              <input placeholder={t('form.primaryPhone')} value={phoneSearch} onChange={(event) => setPhoneSearch(event.target.value)} />
              <button className="button" onClick={() => load()}>{t('buttons.apply')}</button>
            </div>
          </section>

          {activeTab === 'dashboard' && (
            <section className="admin-grid">
              <div className="admin-stat-grid">
                {['total_profiles', 'pending_verification', 'active_profiles', 'suspended_profiles', 'booking_requests', 'reports', 'test_accounts'].map((key) => (
                  <div className="admin-stat-card" key={key}>
                    <strong>{stats[key] || 0}</strong>
                    <span>{t(`admin.stats.${key}`)}</span>
                  </div>
                ))}
              </div>
              <div className="glass-panel">
                <h2>{t('admin.latestActivity')}</h2>
                <div className="admin-activity-list">
                  {activity.length ? activity.map((item) => (
                    <div key={item.id}>
                      <strong>{item.action}</strong>
                      <span>{item.admin_email || 'admin'} · {new Date(item.created_at).toLocaleString()}</span>
                    </div>
                  )) : <p className="muted">{t('admin.emptyActivity')}</p>}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'profiles' && (
            <section className="glass-panel">
              <PanelTitle icon={<NotebookPen size={18} />} title={t('admin.profilesManagement')} text={t('admin.legalNotice')} />
              <div className="admin-profile-list">
                {profiles.map((profile) => (
                  <article className="admin-profile-row" key={profile.id}>
                    <div>
                      <strong>{profile.display_name}</strong>
                      <span>{profile.user_id || t('admin.noEmail')}</span>
                      <p>{option(profile.category || 'other')} · {profile.city} · {t(`status.${profile.availability_status || 'unavailable'}`)}</p>
                    </div>
                    <div className="admin-chip-row">
                      <StatusChip label={t(`status.${profile.status}`)} tone={profile.status === 'active' ? 'good' : profile.status === 'suspended' ? 'danger' : 'warn'} />
                      <StatusChip label={t(`admin.verification.${profile.verification_status || 'pending'}`)} tone={profile.verification_status === 'verified' ? 'good' : 'warn'} />
                      {profile.is_test_account && <StatusChip label={t('admin.testAccount')} tone="lab" />}
                      {profile.phone_conflict_status && profile.phone_conflict_status !== 'clear' && <StatusChip label={t(`phoneConflict.${profile.phone_conflict_status}`)} tone="danger" />}
                    </div>
                    <div className="admin-actions">
                      <button onClick={() => { setSelectedId(profile.id); setActiveTab('verification'); }}>{t('admin.actions.view')}</button>
                      <button onClick={() => adminAction(() => api.setProfileStatus(token, profile.id, 'active'))}>{t('admin.actions.approve')}</button>
                      <button onClick={() => adminAction(() => api.setProfileVerification(token, profile.id, 'verified'))}>{t('admin.actions.markVerified')}</button>
                      <button className="danger" onClick={() => adminAction(() => api.setProfileVerification(token, profile.id, profile.verification_status || 'pending', 'suspended'))}>{t('admin.actions.suspend')}</button>
                      <button className="danger" onClick={() => adminAction(() => api.setProfileVerification(token, profile.id, profile.verification_status || 'pending', 'blocked'))}>{t('admin.actions.block')}</button>
                      <button onClick={() => adminAction(() => api.setPhoneConflictStatus(token, profile.id, 'warning'))}>{t('admin.actions.phoneWarning')}</button>
                      <button className="danger" onClick={() => adminAction(() => api.setPhoneConflictStatus(token, profile.id, 'conflict'))}>{t('admin.actions.phoneConflict')}</button>
                      <button onClick={() => adminAction(() => api.setProfileTestAccount(token, profile.id, { is_test_account: !profile.is_test_account, activate_without_payment: true, availability_status: 'available' }))}>{t('admin.actions.test')}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'verification' && selectedProfile && (
            <section className="admin-verification-grid">
              <article className="glass-panel">
                <PanelTitle icon={<BadgeCheck size={18} />} title={t('admin.manualVerification')} text={t('admin.sensitiveCases')} />
                <div className="admin-preview">
                  <strong>{selectedProfile.display_name}</strong>
                  <span>{option(selectedProfile.category || 'other')} · {selectedProfile.city} · {selectedProfile.area || selectedProfile.approximate_location_area || '-'}</span>
                  <p>{selectedProfile.description || t('states.noProfiles')}</p>
                </div>
                <div className="admin-detail-grid">
                  <Info label={t('admin.fields.price')} value={`${selectedProfile.price_1h || '-'} ${selectedProfile.currency || 'EUR'} / 1h`} />
                  <Info label={t('admin.fields.subscription')} value={selectedProfile.subscription_status || 'trial'} />
                  <Info label={t('admin.fields.radar')} value={`${selectedProfile.service_radius_km || 25} km · ${t(`status.${selectedProfile.availability_status || 'unavailable'}`)}`} />
                  <Info label={t('admin.fields.photos')} value={`${selectedProfile.profile_images?.length || 0}/${selectedProfile.max_photos || 6}`} />
                </div>
                <div className="admin-service-list">
                  {(selectedProfile.service_menu || []).slice(0, 8).map((service) => (
                    <span key={service.name}>{service.name} · {service.included ? t('admin.included') : `${service.extra_price || 0} ${selectedProfile.currency || 'EUR'}`}</span>
                  ))}
                </div>
                <label>
                  {t('admin.adminNotes')}
                  <textarea defaultValue={selectedProfile.admin_note || ''} onBlur={(event) => adminAction(() => api.setProfileAdminNote(token, selectedProfile.id, event.target.value))} />
                </label>
                <div className="admin-checklist">
                  <span>{t('admin.checklist.age')}</span>
                  <span>{t('admin.checklist.consent')}</span>
                  <span>{t('admin.checklist.images')}</span>
                  <span>{t('admin.checklist.legal')}</span>
                </div>
                <div className="admin-actions wide">
                  <button onClick={() => adminAction(() => api.setProfileVerification(token, selectedProfile.id, 'verified', 'clean'))}>{t('admin.actions.approve')}</button>
                  <button onClick={() => adminAction(() => api.setProfileVerification(token, selectedProfile.id, 'changes_requested', 'review'))}>{t('admin.actions.requestChanges')}</button>
                  <button className="danger" onClick={() => adminAction(() => api.setProfileVerification(token, selectedProfile.id, 'rejected', 'review'))}>{t('admin.actions.reject')}</button>
                  <button className="danger" onClick={() => adminAction(() => api.setProfileVerification(token, selectedProfile.id, selectedProfile.verification_status || 'pending', 'suspended'))}>{t('admin.actions.suspend')}</button>
                </div>
              </article>
              <aside className="glass-panel">
                <h2>{t('admin.profiles')}</h2>
                {profiles.map((profile) => (
                  <button className={profile.id === selectedProfile.id ? 'admin-select-row selected' : 'admin-select-row'} key={profile.id} onClick={() => setSelectedId(profile.id)}>
                    <span>{profile.display_name}</span>
                    <small>{t(`admin.verification.${profile.verification_status || 'pending'}`)}</small>
                  </button>
                ))}
              </aside>
            </section>
          )}

          {activeTab === 'reports' && (
            <section className="glass-panel">
              <PanelTitle icon={<Ban size={18} />} title={t('admin.reportsAbuse')} text={t('admin.legalNotice')} />
              <div className="admin-profile-list">
                {reports.map((report) => (
                  <article className="admin-profile-row report-row" key={report.id}>
                    <div>
                      <strong>{report.reason}</strong>
                      <span>{report.profiles?.display_name || t('admin.profile')} · {report.reporter_email || t('form.emailOptional')}</span>
                      <p>{report.message || '-'}</p>
                    </div>
                    <StatusChip label={t(`admin.reportStatus.${report.admin_status || 'open'}`)} tone={report.admin_status === 'escalated' ? 'danger' : report.admin_status === 'resolved' ? 'good' : 'warn'} />
                    <div className="admin-actions">
                      {reportStatuses.map((status) => (
                        <button key={status} className={status === 'escalated' ? 'danger' : ''} onClick={() => adminAction(() => api.setReportStatus(token, report.id, { admin_status: status, escalated_to_authorities: status === 'escalated', admin_note: status === 'escalated' ? t('admin.escalationPlaceholder') : report.admin_note || '' }))}>
                          {t(`admin.reportStatus.${status}`)}
                        </button>
                      ))}
                      {report.profile_id && <button className="danger" onClick={() => adminAction(() => api.setProfileVerification(token, report.profile_id, 'pending', 'suspended'))}>{t('admin.actions.suspend')}</button>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'tests' && (
            <section className="glass-panel">
              <PanelTitle icon={<FlaskConical size={18} />} title={t('admin.testAccounts')} text={t('admin.testAccountsText')} />
              <div className="admin-profile-list">
                {profiles.map((profile) => (
                  <article className="admin-profile-row" key={profile.id}>
                    <div>
                      <strong>{profile.display_name}</strong>
                      <span>{profile.city} · {t(`status.${profile.availability_status || 'unavailable'}`)}</span>
                    </div>
                    <div className="admin-actions">
                      {['available', 'busy', 'unavailable'].map((status) => (
                        <button key={status} onClick={() => adminAction(() => api.setProfileTestAccount(token, profile.id, { is_test_account: true, activate_without_payment: true, availability_status: status }))}>{t(`status.${status}`)}</button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'lab' && (
            <section className="admin-lab-grid">
              {['liveChat', 'videoCall', 'bookingCalendar', 'notificationTest', 'visibilityTest'].map((item) => (
                <article className="glass-panel lab-card" key={item}>
                  <Video size={22} />
                  <h2>{t(`admin.lab.${item}`)}</h2>
                  <p>{t('admin.comingSoon')}</p>
                </article>
              ))}
              <div className="glass-panel">
                <h2>{t('admin.bookingRequests')}</h2>
                {bookings.slice(0, 8).map((booking) => (
                  <div className="booking-row" key={booking.id}>
                    <div>
                      <strong>{booking.requested_date} · {booking.requested_time}</strong>
                      <p>{booking.requester_email}</p>
                    </div>
                    <select value={booking.status} onChange={(event) => adminAction(() => api.setAdminBookingStatus(token, booking.id, event.target.value))}>
                      {bookingStatuses.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="glass-panel">
              <PanelTitle icon={<Settings size={18} />} title={t('admin.settings')} text={t('admin.settingsText')} />
              <div className="admin-settings-grid">
                <Info label={t('admin.settingsFields.price')} value={`${String(settings.listing_price || 49.99)} EUR`} />
                <Info label={t('admin.settingsFields.maxPhotos')} value={String(settings.max_photos || 6)} />
                <Info label={t('admin.settingsFields.defaultLanguage')} value={String(settings.default_language || 'DE')} />
                <Info label={t('admin.settingsFields.languages')} value={Array.isArray(settings.supported_languages) ? settings.supported_languages.join(' / ') : 'DE / PL / EN'} />
                <button onClick={() => adminAction(() => api.updateAdminSettings(token, {
                  listing_price: 49.99,
                  max_photos: 6,
                  default_language: 'DE',
                  supported_languages: ['DE', 'PL', 'EN'],
                  enable_demo_profiles: true,
                  enable_bookings: true,
                  enable_live_cam_placeholder: true
                }))}>{t('admin.actions.saveDefaults')}</button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PanelTitle({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="admin-panel-title">
      <h2>{icon} {title}</h2>
      <p>{text}</p>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: 'good' | 'warn' | 'danger' | 'lab' }) {
  return <span className={`admin-status-chip ${tone}`}>{label}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-info">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
