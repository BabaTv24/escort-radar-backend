import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Ban, BarChart3, Camera, Coins, Crown, FlaskConical, LogOut, MessageSquare, Settings, Shield, Tags, Trash2, Upload, Users, WalletCards } from 'lucide-react';
import { api } from '../lib/api';
import type { AdminActivity, AdminReport, BookingRequest, MasterAdminWallet, Profile, Tag, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';
import { useI18n } from '../i18n';
import { categoryOptions } from '../data/filterOptions';
import { serviceOptions, serviceLabel } from '../data/serviceCatalog';

type AdminUser = Record<string, any>;
type SubscriptionRow = Record<string, any>;
const adminTokenStorageKey = 'escort-radar-admin-token';
const serviceCategories = ['all', ...Array.from(new Set(serviceOptions.map((service) => service.category)))];
const emptyStudioForm = {
  id: '',
  display_name: '',
  category: 'ladies',
  city: 'berlin',
  area: 'Mitte',
  work_city: 'Berlin',
  work_area: 'Mitte',
  age: 26,
  nationality: 'European',
  height_cm: 170,
  price_30min: 120,
  price_1h: 180,
  price_2h: 320,
  price_night: 900,
  operator_status: 'AVAILABLE_TODAY',
  services: ['towarzystwo', 'dyskrecja'],
  description: '',
  verified: true,
  premium_tier: 'gold',
  is_seed_profile: true,
  is_published: true,
  admin_priority: 100,
  moderation_status: 'approved',
  moderation_note: '',
  suspended_reason: ''
};

const sections = [
  {
    title: 'CONTROL',
    items: [
      ['dashboard', '/admin', BarChart3],
      ['profiles', '/admin/profiles', Crown],
      ['subscriptions', '/admin/subscriptions', Coins],
      ['payments', '/admin/token-transactions', WalletCards],
      ['users', '/admin/users', Users],
      ['reports', '/admin/reports', Ban],
      ['settings', '/admin/settings', Settings]
    ]
  },
  {
    title: 'OPERATIONS',
    items: [
      ['wallets', '/admin/wallets', WalletCards],
      ['referrals', '/admin/referrals', Users],
      ['photos', '/admin/photos', Camera],
      ['tags', '/admin/tags', Tags],
      ['reviews', '/admin/reviews', MessageSquare],
      ['live-cam', '/admin/live-cam', Camera],
      ['video-manager', '/admin/video-manager', Camera]
    ]
  },
  {
    title: 'KOMUNIKACJA',
    items: [
      ['email-center', '/admin/email-center', MessageSquare],
      ['chat-manager', '/admin/chat-manager', MessageSquare],
      ['push', '/admin/push', MessageSquare],
      ['sms-center', '/admin/sms-center', MessageSquare]
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      ['live-lab', '/admin/live-lab', FlaskConical],
      ['moderation', '/admin/moderation', Shield],
      ['activity-logs', '/admin/activity-logs', BarChart3]
    ]
  }
] as const;

export function AdminPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [admin, setAdmin] = useState<Record<string, unknown> | null>(null);
  const [authRestoring, setAuthRestoring] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, option } = useI18n();

  const [stats, setStats] = useState<Record<string, number>>({});
  const [tokenStats, setTokenStats] = useState<Record<string, number>>({});
  const [subscriptionStats, setSubscriptionStats] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [clientActivationPayments, setClientActivationPayments] = useState<Record<string, any>[]>([]);
  const [purchases, setPurchases] = useState<TokenPurchaseRequest[]>([]);
  const [masterWallets, setMasterWallets] = useState<MasterAdminWallet[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [photos, setPhotos] = useState<Record<string, any>[]>([]);
  const [clientReferrals, setClientReferrals] = useState<Record<string, any>[]>([]);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [revenueEvents, setRevenueEvents] = useState<Record<string, any>[]>([]);
  const [topCities, setTopCities] = useState<Record<string, any>[]>([]);
  const [topCategories, setTopCategories] = useState<Record<string, any>[]>([]);
  const [topProfiles, setTopProfiles] = useState<Record<string, any>[]>([]);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null);
  const [newTag, setNewTag] = useState({ label: '', group_key: 'premium' });
  const [studioForm, setStudioForm] = useState({ ...emptyStudioForm });
  const [studioFile, setStudioFile] = useState<File | null>(null);
  const [studioSaving, setStudioSaving] = useState(false);
  const [studioServiceSearch, setStudioServiceSearch] = useState('');
  const [studioServiceCategory, setStudioServiceCategory] = useState('all');
  const [studioFilters, setStudioFilters] = useState({
    city: 'all',
    type: 'all',
    published: 'all',
    suspended: 'all',
    seed: 'all',
    verified: 'all',
    premium_tier: 'all',
    owner_email: ''
  });

  const view = getAdminView(location.pathname);
  const isLoginRoute = location.pathname === '/admin/login';
  const filteredProfiles = profiles.filter((profile) => profileMatchesAdminFilters(profile, query, studioFilters));
  const filteredUsers = users.filter((user) => JSON.stringify(user).toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (isLoginRoute) {
      setAuthRestoring(false);
      return;
    }

    let active = true;

    async function restoreAdminSession() {
      console.log('AUTH RESTORE START');
      setAuthRestoring(true);
      const storedToken = localStorage.getItem(adminTokenStorageKey) || '';
      console.log('SESSION FOUND', Boolean(storedToken));

      if (!active) return;
      if (!storedToken) {
        setToken('');
        setUser(null);
        setAdmin(null);
        setAuthRestoring(false);
        console.log('AUTH RESTORE END');
        navigate('/admin/login', { replace: true });
        return;
      }

      console.log('ADMIN CHECK START');
      const adminCheck = await withTimeout(api.adminMe(storedToken), 5000, 'Admin me').catch((adminError) => {
        setMessage(adminError instanceof Error ? adminError.message : 'Brak dostepu administratora');
        return undefined;
      });
      if (!active) return;

      if (!adminCheck?.admin) {
        setToken('');
        setUser(null);
        setAdmin(null);
        setMessage('Brak dostepu administratora');
        setAuthRestoring(false);
        console.log('AUTH RESTORE END');
        return;
      }

      console.log('ADMIN CHECK SUCCESS');
      setAdmin(adminCheck.admin);
      setUser({
        id: adminCheck.admin.id,
        email: adminCheck.admin.email,
        app_metadata: {
          role: adminCheck.admin.role,
          admin: adminCheck.admin.admin
        }
      });
      setMessage('');
      setToken(storedToken);
      setAuthRestoring(false);
      console.log('AUTH RESTORE END');
      void load(storedToken);
    }

    restoreAdminSession().catch((sessionError) => {
      if (!active) return;
      setToken('');
      setUser(null);
      setAdmin(null);
      const message = sessionError instanceof Error ? sessionError.message : 'Brak dostepu administratora';
      setMessage(message);
      setAuthRestoring(false);
      console.log('AUTH RESTORE END');
      navigate('/admin/login', { replace: true });
    });

    return () => {
      active = false;
    };
  }, [isLoginRoute, navigate]);

  async function handleLogin() {
    console.log('ADMIN LOGIN START');
    setLoginLoading(true);
    setMessage('');
    try {
      console.log('SUPABASE LOGIN START');
      const result = await withTimeout(
        api.adminLogin({ email, password }),
        10000,
        'Admin login'
      );
      console.log('SUPABASE LOGIN RESULT', result);
      const accessToken = result.token || '';
      if (!accessToken) {
        setMessage('Nie udało się odczytać tokenu administratora. Spróbuj ponownie.');
        return;
      }

      console.log('LOGIN SUCCESS SESSION', result);

      console.log('ADMIN CHECK START');
      const adminCheck = await withTimeout(api.adminMe(accessToken), 10000, 'Admin me');
      console.log('ADMIN ME RESULT', adminCheck);
      if (!adminCheck?.admin) {
        setAdmin(null);
        setMessage('Brak dostepu administratora');
        return;
      }

      setAdmin(adminCheck.admin);
      setUser({
        id: adminCheck.admin.id,
        email: adminCheck.admin.email,
        app_metadata: {
          role: adminCheck.admin.role,
          admin: adminCheck.admin.admin
        }
      });
      setMessage('');
      setToken(accessToken);
      localStorage.setItem(adminTokenStorageKey, accessToken);
      console.log('ADMIN CHECK SUCCESS');
      console.log('ADMIN LOGIN SUCCESS');
      navigate('/admin', { replace: true });
      void load(accessToken);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Supabase login timeout')) {
        setMessage('Logowanie Supabase przekroczyło czas. Odśwież stronę albo spróbuj w innej przeglądarce.');
        return;
      }
      if (error instanceof Error && error.message.includes('Admin login timeout')) {
        setMessage('Backend admina nie odpowiada. Sprawdź Render.');
        return;
      }
      if (error instanceof Error && error.message.includes('Admin me timeout')) {
        setMessage('Backend admina nie odpowiada. Sprawdź Render.');
        return;
      }
      setMessage(error instanceof Error ? error.message : 'Nie udało się zalogować do panelu administratora.');
    } finally {
      setLoginLoading(false);
    }
  }

  async function resetAdminSession() {
    localStorage.removeItem(adminTokenStorageKey);
    setToken('');
    setUser(null);
    setAdmin(null);
    setMessage('');
    navigate('/admin/login', { replace: true });
  }

  async function logout() {
    localStorage.removeItem(adminTokenStorageKey);
    setToken('');
    navigate('/admin/login', { replace: true });
  }

  async function load(accessToken = token) {
    setLoading(true);
    try {
      const [
        statsResult,
        tokenResult,
        usersResult,
        profileResult,
        subscriptionResult,
        reportResult,
        bookingResult,
        walletResult,
        transactionResult,
        clientActivationPaymentResult,
        purchaseResult,
        masterResult,
        tagResult,
        photoResult,
        clientReferralResult
      ] = await Promise.allSettled([
        adminLoadRequest('adminStats', api.adminStats(accessToken)),
        adminLoadRequest('adminTokenStats', api.adminTokenStats(accessToken)),
        adminLoadRequest('adminUsers', api.adminUsers(accessToken)),
        adminLoadRequest('adminProfiles', api.adminProfiles(accessToken)),
        adminLoadRequest('adminSubscriptions', api.adminSubscriptions(accessToken)),
        adminLoadRequest('adminReports', api.adminReports(accessToken)),
        adminLoadRequest('adminBookings', api.adminBookings(accessToken)),
        adminLoadRequest('adminWallets', api.adminWallets(accessToken)),
        adminLoadRequest('adminTokenTransactions', api.adminTokenTransactions(accessToken)),
        adminLoadRequest('adminClientActivationPayments', api.adminClientActivationPayments(accessToken)),
        adminLoadRequest('adminPurchaseRequests', api.adminPurchaseRequests(accessToken)),
        adminLoadRequest('adminMasterWallets', api.adminMasterWallets(accessToken)),
        adminLoadRequest('adminTags', api.adminTags(accessToken)),
        adminLoadRequest('adminPhotos', api.adminPhotos(accessToken)),
        adminLoadRequest('adminClientReferrals', api.adminClientReferrals(accessToken))
      ]);

      const statsData = settledValue(statsResult, { stats: {}, latest_activity: [], revenue_events: [], top_cities: [], top_categories: [], top_profiles: [] }, 'adminStats');
      const tokenData = settledValue(tokenResult, { stats: {} }, 'adminTokenStats');
      const usersData = settledValue(usersResult, { users: [] }, 'adminUsers');
      const profileData = settledValue(profileResult, { stats: {}, profiles: [] }, 'adminProfiles');
      const subscriptionData = settledValue(subscriptionResult, { subscriptions: [] }, 'adminSubscriptions');
      const reportData = settledValue(reportResult, { reports: [], reports_count: 0 }, 'adminReports');
      const bookingData = settledValue(bookingResult, { booking_requests: [] }, 'adminBookings');
      const walletData = settledValue(walletResult, { wallets: [] }, 'adminWallets');
      const transactionData = settledValue(transactionResult, { transactions: [] }, 'adminTokenTransactions');
      const clientActivationPaymentData = settledValue(clientActivationPaymentResult, { client_activation_payments: [] }, 'adminClientActivationPayments');
      const purchaseData = settledValue(purchaseResult, { purchase_requests: [] }, 'adminPurchaseRequests');
      const masterData = settledValue(masterResult, { master_wallets: [] }, 'adminMasterWallets');
      const tagData = settledValue(tagResult, { tags: [] }, 'adminTags');
      const photoData = settledValue(photoResult, { photos: [] }, 'adminPhotos');
      const clientReferralData = settledValue(clientReferralResult, { referrals: [] }, 'adminClientReferrals');

      setStats({ ...statsData.stats, ...profileData.stats, reports: reportData.reports_count, bookings: bookingData.booking_requests.length });
      setTokenStats(tokenData.stats);
      setSubscriptionStats((subscriptionData as any).stats || {});
      setUsers(usersData.users);
      setProfiles(profileData.profiles);
      setSubscriptions(subscriptionData.subscriptions);
      setReports(reportData.reports);
      setBookings(bookingData.booking_requests);
      setWallets(walletData.wallets);
      setTransactions(transactionData.transactions);
      setClientActivationPayments(clientActivationPaymentData.client_activation_payments as Record<string, any>[]);
      setPurchases(purchaseData.purchase_requests);
      setMasterWallets(masterData.master_wallets);
      setTags(tagData.tags);
      setPhotos(photoData.photos as Record<string, any>[]);
      setClientReferrals(clientReferralData.referrals);
      setActivity(statsData.latest_activity);
      setRevenueEvents((statsData.revenue_events || []) as Record<string, any>[]);
      setTopCities((statsData.top_cities || []) as Record<string, any>[]);
      setTopCategories((statsData.top_categories || []) as Record<string, any>[]);
      setTopProfiles((statsData.top_profiles || []) as Record<string, any>[]);
    } finally {
      setLoading(false);
    }
  }

  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
      setLoading(false);
    }
  }

  function editStudioProfile(profile: Profile) {
    setStudioForm({
      id: profile.id,
      display_name: profile.display_name || '',
      category: profile.category || 'ladies',
      city: profile.city || 'berlin',
      area: profile.area || profile.work_area || '',
      work_city: profile.work_city || profile.city || '',
      work_area: profile.work_area || profile.area || '',
      age: profile.age || 26,
      nationality: profile.nationality || 'European',
      height_cm: profile.height_cm || profile.height || 170,
      price_30min: Number(profile.price_30min || 0),
      price_1h: Number(profile.price_1h || 180),
      price_2h: Number(profile.price_2h || 0),
      price_night: Number(profile.price_night || 0),
      operator_status: profile.operator_status || 'AVAILABLE_TODAY',
      services: profile.services?.length ? profile.services : ['towarzystwo', 'dyskrecja'],
      description: profile.description || '',
      verified: profile.verified !== false,
      premium_tier: profile.premium_tier || 'gold',
      is_seed_profile: Boolean(profile.is_seed_profile),
      is_published: profile.is_published !== false,
      admin_priority: Number(profile.admin_priority || 0),
      moderation_status: profile.moderation_status || 'approved',
      moderation_note: profile.moderation_note || '',
      suspended_reason: profile.suspended_reason || ''
    });
  }

  async function saveStudioProfile() {
    setStudioSaving(true);
    setMessage('');
    try {
      const body = {
        ...studioForm,
        height: studioForm.height_cm,
        price_1h: Number(studioForm.price_1h || 0),
        price_30min: Number(studioForm.price_30min || 0),
        price_2h: Number(studioForm.price_2h || 0),
        price_night: Number(studioForm.price_night || 0),
        age: Number(studioForm.age || 0),
        height_cm: Number(studioForm.height_cm || 0),
        admin_priority: Number(studioForm.admin_priority || 0)
      } as Partial<Profile>;
      const result = studioForm.id
        ? await api.updateAdminProfile(token, studioForm.id, body)
        : await api.createAdminProfile(token, body);
      if (studioFile) await uploadStudioPhoto(result.profile.id);
      setStudioForm({ ...emptyStudioForm });
      setStudioFile(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udalo sie zapisac profilu.');
    } finally {
      setStudioSaving(false);
    }
  }

  async function uploadStudioPhoto(profileId = studioForm.id) {
    if (!profileId || !studioFile) return;
    const form = new FormData();
    form.append('image', studioFile);
    await api.uploadAdminProfileImage(token, profileId, form);
    setStudioFile(null);
    await load();
  }

  async function seedBerlinStudioProfiles() {
    setStudioSaving(true);
    setMessage('');
    try {
      const result = await api.seedBerlinProfiles(token);
      setMessage(result.created ? `Wygenerowano ${result.created} profili demo dla Berlina.` : 'Berlin seed set juz istnieje - nie zdublowalem profili.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udalo sie wygenerowac profili Berlina.');
    } finally {
      setStudioSaving(false);
    }
  }

  if (authRestoring) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <p className="eyebrow">Escort Radar Admin Console</p>
          <h1>Ładowanie panelu administratora...</h1>
        </div>
      </div>
    );
  }

  if (isLoginRoute) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <img className="baba-admin-logo" src="/Sektion_1_4.png" alt="BABA AI" />
          <p className="eyebrow">Escort Radar Admin Console</p>
          <h1>Control Center</h1>
          <p>Tylko dla administratorow i moderatorow.</p>
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder="Haslo" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button primary full" disabled={loginLoading} onClick={handleLogin}>{loginLoading ? t('states.loading') : 'Login'}</button>
          {message && <p className="error-text">{message}</p>}
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <p className="eyebrow">Escort Radar Admin Console</p>
          <h1>Brak dostepu administratora</h1>
          <p>{message || 'Zaloguj sie kontem administratora.'}</p>
          <Link className="button primary full" to="/admin/login">Przejdz do logowania</Link>
          <button className="button full" onClick={resetAdminSession}>Resetuj sesje administratora</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand">
          <img className="baba-admin-logo compact" src="/Sektion_1_4.png" alt="BABA AI" />
          <strong>Escort Radar</strong>
        </Link>
        {sections.map((section) => (
          <div className="admin-sidebar-section" key={section.title}>
            <small>{section.title}</small>
            {section.items.map(([key, path, Icon]) => (
              <Link key={key} to={path} className={view === key || (view === 'dashboard' && key === 'dashboard') ? 'active' : ''}>
                <Icon size={16} /> {adminLabel(key)}
              </Link>
            ))}
          </div>
        ))}
        <button className="admin-logout" onClick={logout}><LogOut size={16} /> Wyloguj</button>
      </aside>

      <main className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Premium Control Center</p>
            <h1>{adminLabel(view)}</h1>
          </div>
          <div className="admin-search">
            <input placeholder="Filtruj rekordy..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <button className="button" onClick={() => load()}>{loading ? t('states.loading') : 'Odśwież'}</button>
          </div>
        </header>

        {message && <p className="error-text">{message}</p>}
        {renderView()}
      </main>

      {modal && (
        <div className="admin-modal-backdrop" onClick={() => setModal(null)}>
          <article className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{modal.title}</h2>
            <pre>{modal.body}</pre>
            <button className="button primary" onClick={() => setModal(null)}>Zamknij</button>
          </article>
        </div>
      )}
    </div>
  );

  function renderView() {
    if (view === 'dashboard') {
      const registeredClients = stats.registered_clients || users.filter((user) => user.account_type === 'client').length;
      const activatedClients = stats.activated_clients || 0;
      const cards = [
        ['Revenue today', revenueLabel(stats.daily_revenue_eur, 'No payments recorded today')],
        ['Revenue this month', revenueLabel(stats.monthly_revenue_eur, 'No payments this month')],
        ['Client activation revenue', revenueLabel(stats.client_activation_revenue_eur, 'No activation revenue yet')],
        ['Client activations', stats.client_activation_transactions || clientActivationPayments.length],
        ['Activated clients', activatedClients],
        ['Free clients', stats.free_clients || 0],
        ['Active profiles', stats.active_profiles || 0],
        ['Available profiles', stats.available_profiles || profiles.filter((profile) => profile.available_now).length],
        ['Bookings today', stats.bookings_today || 0],
        ['Coins in circulation', tokenStats.token_circulation || 0],
        ['Token sales', tokenStats.approved_purchase_value || 0],
        ['Transakcje', (stats.client_activation_transactions || clientActivationPayments.length) + transactions.length],
        ['Do weryfikacji', stats.pending_verification || 0],
        ['Zgloszenia naduzyc', reports.length]
      ];
      return (
        <>
          <section className="admin-metric-grid">{cards.map(([label, value]) => <AdminStatCard key={label} label={String(label)} value={value} />)}</section>
          <section className="admin-chart-grid">
            <article className="admin-card">
              <h2>Recent Revenue Events</h2>
              {revenueEvents.length ? <AdminTable rows={revenueEvents} columns={['date', 'email', 'type', 'amount', 'currency', 'status', 'provider']} /> : <EmptyAdminState text="No payments recorded today" />}
            </article>
            <article className="admin-card">
              <h2>Client Activation Funnel</h2>
              <div className="metrics-grid">
                <MetricBlock label="Registered clients" value={registeredClients} />
                <MetricBlock label="Activated clients" value={activatedClients} />
                <MetricBlock label="Conversion" value={`${stats.activation_conversion_rate || 0}%`} />
                <MetricBlock label="Revenue" value={revenueLabel(stats.client_activation_revenue_eur, '0 EUR')} />
              </div>
            </article>
            <article className="admin-card">
              <h2>Top Cities</h2>
              {topCities.length ? <AdminTable rows={topCities} columns={['label', 'count']} /> : <EmptyAdminState text="No city data yet" />}
            </article>
            <article className="admin-card">
              <h2>Top Categories</h2>
              {topCategories.length ? <AdminTable rows={topCategories} columns={['label', 'count']} /> : <EmptyAdminState text="No category data yet" />}
            </article>
            <article className="admin-card">
              <h2>Top Profiles</h2>
              {topProfiles.length ? <AdminTable rows={topProfiles} columns={['display_name', 'city', 'category', 'available_now', 'created_at']} /> : <EmptyAdminState text="No active profiles yet" />}
            </article>
          </section>
        </>
      );
    }

    if (view === 'users') {
      return <AdminTable rows={filteredUsers} columns={['email', 'role', 'account_type', 'client_state', 'client_activated_at', 'avatar_url', 'public_user_id', 'referral_code', 'token_balance', 'profile_count', 'created_at', 'status']} actions={(user) => (
        <>
          <Action onClick={() => setModal({ title: String(user.email), body: JSON.stringify(user, null, 2) })}>View</Action>
          <Action onClick={() => setModal({ title: 'Edit user', body: JSON.stringify(user, null, 2) })}>Edit</Action>
          <Action onClick={() => action(() => api.adminAdjustCoins(token, String(user.id), 100, 'Manual admin credit'))}>+100 Coins</Action>
          <Action danger onClick={() => action(() => api.adminAdjustCoins(token, String(user.id), -25, 'Manual admin debit'))}>-25 Coins</Action>
          <Action onClick={() => action(() => api.adminSetClientActivation(token, String(user.id), 'client_activated'))}>Activate client</Action>
          <Action danger onClick={() => action(() => api.adminSetClientActivation(token, String(user.id), 'client_free'))}>Deactivate client</Action>
          <Action danger onClick={() => setModal({ title: 'Suspend placeholder', body: String(user.email) })}>Suspend</Action>
        </>
      )} />;
    }

    if (view === 'profiles' || view === 'profile-studio') {
      const selectedProfile = profiles.find((profile) => profile.id === studioForm.id);
      const studioProfiles = filteredProfiles;
      return (
        <section className="profile-studio-grid">
          <article className="admin-card profile-studio-list">
            <div className="profile-studio-head">
              <div>
                <p className="eyebrow">Profile Control</p>
                <h2>Wszystkie profile</h2>
              </div>
              <button className="button primary" disabled={studioSaving} onClick={seedBerlinStudioProfiles}>
                <Crown size={16} /> Generate Berlin Demo Set
              </button>
            </div>
            <div className="studio-filter-grid">
              <select value={studioFilters.city} onChange={(event) => setStudioFilters({ ...studioFilters, city: event.target.value })}>
                {['all', 'berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={studioFilters.type} onChange={(event) => setStudioFilters({ ...studioFilters, type: event.target.value })}>
                {['all', ...categoryOptions].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={studioFilters.published} onChange={(event) => setStudioFilters({ ...studioFilters, published: event.target.value })}>
                <option value="all">published: all</option>
                <option value="yes">published</option>
                <option value="no">unpublished</option>
              </select>
              <select value={studioFilters.suspended} onChange={(event) => setStudioFilters({ ...studioFilters, suspended: event.target.value })}>
                <option value="all">suspended: all</option>
                <option value="yes">suspended</option>
                <option value="no">not suspended</option>
              </select>
              <select value={studioFilters.seed} onChange={(event) => setStudioFilters({ ...studioFilters, seed: event.target.value })}>
                <option value="all">seed: all</option>
                <option value="yes">seed/demo</option>
                <option value="no">real/non-seed</option>
              </select>
              <select value={studioFilters.verified} onChange={(event) => setStudioFilters({ ...studioFilters, verified: event.target.value })}>
                <option value="all">verified: all</option>
                <option value="yes">verified</option>
                <option value="no">unverified</option>
              </select>
              <select value={studioFilters.premium_tier} onChange={(event) => setStudioFilters({ ...studioFilters, premium_tier: event.target.value })}>
                {['all', 'standard', 'gold', 'elite', 'diamond'].map((item) => <option key={item} value={item}>tier: {item}</option>)}
              </select>
              <input placeholder="owner email" value={studioFilters.owner_email} onChange={(event) => setStudioFilters({ ...studioFilters, owner_email: event.target.value })} />
            </div>
            <div className="profile-studio-table">
              {studioProfiles.map((profile) => {
                const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
                return (
                  <div className="studio-profile-row" key={profile.id}>
                    {image?.public_url ? <img src={image.public_url} alt="" /> : <span>{profile.display_name.slice(0, 1)}</span>}
                    <div>
                      <strong>{profile.display_name}</strong>
                      <small>ID: {profile.id.slice(0, 8)} / Owner: {profile.owner_email || profile.user_id || 'no user_id'}</small>
                      <small>{profile.category || 'type?'} / {profile.city} / {profile.area || profile.work_area || '-'} / {profile.operator_status || profile.availability_status}</small>
                      <div className="studio-badges">
                        <i>{profile.status}</i>
                        <i>{profile.moderation_status || 'pending'}</i>
                        <i>{profile.premium_tier || 'standard'}</i>
                        <i>{profile.subscription_status || 'free'}</i>
                        <i>{profile.profile_images?.length || 0} photos</i>
                        <i>{profile.services?.length || 0} services</i>
                        {profile.is_published !== false ? <i>published</i> : <i>unpublished</i>}
                        {profile.is_seed_profile && <i>seed/demo</i>}
                        <i>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</i>
                      </div>
                    </div>
                    <div className="admin-actions-row">
                      <Action onClick={() => editStudioProfile(profile)}>Edit</Action>
                      <Action onClick={() => action(() => api.publishAdminProfile(token, profile.id, profile.is_published === false))}>
                        {profile.is_published === false ? 'Publish' : 'Unpublish'}
                      </Action>
                      <Action onClick={() => action(() => api.setProfileStatus(token, profile.id, profile.status === 'suspended' || profile.moderation_status === 'suspended' ? 'active' : 'suspended'))}>
                        {profile.status === 'suspended' || profile.moderation_status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                      </Action>
                      <Action onClick={() => action(() => api.setProfileVerification(token, profile.id, profile.verified ? 'pending' : 'verified', profile.moderation_status || 'approved'))}>
                        {profile.verified ? 'Unverify' : 'Verify'}
                      </Action>
                      <Action onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'approved', is_published: true }))}>Approve</Action>
                      <Action danger onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'rejected' }))}>Reject</Action>
                      <Link className="admin-action-btn" to={`/profile/${profile.id}`}>Public</Link>
                      <Link className="admin-action-btn" to="/admin/subscriptions">Subscription</Link>
                      <Action danger onClick={() => action(() => api.deleteAdminProfile(token, profile.id))}>Delete</Action>
                    </div>
                  </div>
                );
              })}
              {!studioProfiles.length && <EmptyAdminState text="Brak profili w Studio." />}
            </div>
          </article>

          <article className="admin-card profile-studio-form">
            <div className="profile-studio-head">
              <div>
                <p className="eyebrow">{studioForm.id ? 'Edit profile' : 'Create profile'}</p>
                <h2>{studioForm.id ? studioForm.display_name : 'Nowy profil preview'}</h2>
              </div>
              {studioForm.id && <button className="button" onClick={() => setStudioForm({ ...emptyStudioForm })}>Nowy</button>}
            </div>
            <div className="admin-form-grid">
              <input placeholder="display_name" value={studioForm.display_name} onChange={(event) => setStudioForm({ ...studioForm, display_name: event.target.value })} />
              <select value={studioForm.category} onChange={(event) => setStudioForm({ ...studioForm, category: event.target.value })}>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <input placeholder="city" value={studioForm.city} onChange={(event) => setStudioForm({ ...studioForm, city: event.target.value })} />
              <input placeholder="area" value={studioForm.area} onChange={(event) => setStudioForm({ ...studioForm, area: event.target.value })} />
              <input placeholder="work_city" value={studioForm.work_city} onChange={(event) => setStudioForm({ ...studioForm, work_city: event.target.value })} />
              <input placeholder="work_area" value={studioForm.work_area} onChange={(event) => setStudioForm({ ...studioForm, work_area: event.target.value })} />
              <input type="number" placeholder="age" value={studioForm.age} onChange={(event) => setStudioForm({ ...studioForm, age: Number(event.target.value) })} />
              <input placeholder="nationality" value={studioForm.nationality} onChange={(event) => setStudioForm({ ...studioForm, nationality: event.target.value })} />
              <input type="number" placeholder="height_cm" value={studioForm.height_cm} onChange={(event) => setStudioForm({ ...studioForm, height_cm: Number(event.target.value) })} />
              <input type="number" placeholder="price_30min" value={studioForm.price_30min} onChange={(event) => setStudioForm({ ...studioForm, price_30min: Number(event.target.value) })} />
              <input type="number" placeholder="price_1h" value={studioForm.price_1h} onChange={(event) => setStudioForm({ ...studioForm, price_1h: Number(event.target.value) })} />
              <input type="number" placeholder="price_2h" value={studioForm.price_2h} onChange={(event) => setStudioForm({ ...studioForm, price_2h: Number(event.target.value) })} />
              <input type="number" placeholder="price_night" value={studioForm.price_night} onChange={(event) => setStudioForm({ ...studioForm, price_night: Number(event.target.value) })} />
              <select value={studioForm.operator_status} onChange={(event) => setStudioForm({ ...studioForm, operator_status: event.target.value })}>
                {['ONLINE_NOW', 'AVAILABLE_TODAY', 'BUSY', 'APPOINTMENT_ONLY', 'TRAVELING', 'OFFLINE'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select value={studioForm.premium_tier} onChange={(event) => setStudioForm({ ...studioForm, premium_tier: event.target.value })}>
                {['standard', 'gold', 'elite', 'diamond'].map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
              <input type="number" placeholder="admin_priority" value={studioForm.admin_priority} onChange={(event) => setStudioForm({ ...studioForm, admin_priority: Number(event.target.value) })} />
              <select value={studioForm.moderation_status} onChange={(event) => setStudioForm({ ...studioForm, moderation_status: event.target.value })}>
                {['pending', 'approved', 'rejected', 'suspended'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <div className="studio-service-picker">
              <div className="profile-studio-head compact">
                <div>
                  <span>Services</span>
                  <small>{studioForm.services.length} selected</small>
                </div>
                <div className="admin-actions-row">
                  <Action onClick={() => setStudioForm({ ...studioForm, services: serviceOptions.map((service) => service.key) })}>Select all</Action>
                  <Action onClick={() => setStudioForm({ ...studioForm, services: [] })}>Clear all</Action>
                </div>
              </div>
              <div className="admin-form-grid">
                <input placeholder="Search services" value={studioServiceSearch} onChange={(event) => setStudioServiceSearch(event.target.value)} />
                <select value={studioServiceCategory} onChange={(event) => setStudioServiceCategory(event.target.value)}>
                  {serviceCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="service-category-actions">
                {serviceCategories.filter((category) => category !== 'all').slice(0, 10).map((category) => (
                  <button key={category} type="button" onClick={() => setStudioForm({ ...studioForm, services: mergeServices(studioForm.services, serviceOptions.filter((service) => service.category === category).map((service) => service.key)) })}>
                    Select {category}
                  </button>
                ))}
              </div>
              <div className="service-checklist admin-service-checklist">
                {serviceOptions
                  .filter((service) => studioServiceCategory === 'all' || service.category === studioServiceCategory)
                  .filter((service) => `${service.label} ${service.key}`.toLowerCase().includes(studioServiceSearch.toLowerCase()))
                  .map((service) => (
                    <button
                      key={service.key}
                      className={studioForm.services.includes(service.key) ? 'selected' : ''}
                      type="button"
                      onClick={() => setStudioForm({ ...studioForm, services: toggleStudioService(studioForm.services, service.key) })}
                    >
                      {service.label}
                    </button>
                  ))}
              </div>
            </div>
            <textarea placeholder="description" value={studioForm.description} onChange={(event) => setStudioForm({ ...studioForm, description: event.target.value })} />
            <textarea placeholder="moderation_note" value={studioForm.moderation_note} onChange={(event) => setStudioForm({ ...studioForm, moderation_note: event.target.value })} />
            <input placeholder="suspended_reason" value={studioForm.suspended_reason} onChange={(event) => setStudioForm({ ...studioForm, suspended_reason: event.target.value })} />
            <div className="toggle-grid studio-toggle-grid">
              <label><input type="checkbox" checked={studioForm.verified} onChange={(event) => setStudioForm({ ...studioForm, verified: event.target.checked })} /> verified</label>
              <label><input type="checkbox" checked={studioForm.is_seed_profile} onChange={(event) => setStudioForm({ ...studioForm, is_seed_profile: event.target.checked })} /> seed/demo</label>
              <label><input type="checkbox" checked={studioForm.is_published} onChange={(event) => setStudioForm({ ...studioForm, is_published: event.target.checked })} /> published</label>
            </div>
            <label className="studio-upload-control">
              <Upload size={17} />
              <span>{studioFile ? studioFile.name : 'Wybierz zdjecie demo/stock/generated'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setStudioFile(event.target.files?.[0] || null)} />
            </label>
            <button className="button primary full" disabled={studioSaving} onClick={saveStudioProfile}>{studioSaving ? t('states.loading') : 'Zapisz profil'}</button>
            {studioForm.id && studioFile && <button className="button full" disabled={studioSaving} onClick={() => uploadStudioPhoto()}>Upload photo</button>}

            {selectedProfile?.profile_images?.length ? (
              <div className="studio-photo-grid">
                {selectedProfile.profile_images.map((image, index) => (
                  <div className="studio-photo-card" key={image.id}>
                    <img src={image.public_url} alt="" />
                    <div className="admin-actions-row">
                      <Action onClick={() => action(() => api.setAdminProfileCoverImage(token, selectedProfile.id, image.id))}>Cover</Action>
                      <Action onClick={() => action(() => api.reorderAdminProfileImages(token, selectedProfile.id, moveImageId(selectedProfile.profile_images || [], index, -1)))}>Up</Action>
                      <Action onClick={() => action(() => api.reorderAdminProfileImages(token, selectedProfile.id, moveImageId(selectedProfile.profile_images || [], index, 1)))}>Down</Action>
                      <Action danger onClick={() => action(() => api.deleteAdminProfileImage(token, selectedProfile.id, image.id))}><Trash2 size={14} /></Action>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">Zdjecia profilu pojawia sie tutaj po uploadzie.</p>}

            {studioForm.services.length ? <p className="muted">Wybrane uslugi: {studioForm.services.map(serviceLabel).join(', ')}</p> : null}
          </article>
        </section>
      );
    }

    if (view === 'profiles') {
      return <AdminTable rows={filteredProfiles} columns={['display_name', 'user_id', 'city', 'category', 'status', 'verification_status', 'moderation_status', 'availability_status', 'primary_phone', 'phone_conflict_status', 'created_at']} format={(key, value) => key === 'category' ? option(String(value || 'other')) : value} actions={(profile) => (
        <>
          <Action onClick={() => setModal({ title: profile.display_name, body: JSON.stringify(profile, null, 2) })}>View</Action>
          <Action onClick={() => action(() => api.setProfileStatus(token, profile.id, 'active'))}>Approve</Action>
          <Action onClick={() => action(() => api.setProfileVerification(token, profile.id, 'verified'))}>Verify</Action>
          <Action danger onClick={() => action(() => api.setProfileVerification(token, profile.id, profile.verification_status || 'pending', 'suspended'))}>Suspend</Action>
          <Action danger onClick={() => action(() => api.setProfilePromotion(token, profile.id, { days: 1, shadowbanned: true }))}>Shadowban</Action>
          <Action onClick={() => action(() => api.setProfilePromotion(token, profile.id, { days: 7, shadowbanned: false }))}>Promote</Action>
          <Link className="admin-action-btn" to={`/profile/${profile.id}`}>Public</Link>
        </>
      )} />;
    }

    if (view === 'subscriptions') {
      const cards = [
        ['Requested', subscriptionStats.requested || 0],
        ['Future', subscriptionStats.future || 0],
        ['Active', subscriptionStats.active || 0],
        ['Expired', subscriptionStats.expired || 0],
        ['Incomplete', subscriptionStats.incomplete || 0],
        ['Monthly revenue', `${Number(subscriptionStats.monthly_revenue || 0).toFixed(2)} EUR`],
        ['Client activations 0.99', subscriptionStats.client_activations_099 || 0],
        ['Escort subscriptions', subscriptionStats.escort_subscriptions || 0]
      ];
      return (
        <>
          <section className="admin-metric-grid">{cards.map(([label, value]) => <AdminStatCard key={label} label={String(label)} value={value} />)}</section>
          <AdminTable rows={subscriptions} columns={['id', 'email', 'profile', 'plan', 'role', 'status', 'requested_at', 'start', 'end', 'progress', 'payment_provider']} format={(key, value) => key === 'progress' ? `${value || 0}%` : value} actions={(row) => (
            <>
              {row.type === 'profile_subscription' ? (
                <>
                  <Action onClick={() => action(() => api.activateAdminSubscription(token, String(row.profile_id || row.id), { plan: row.plan || 'escort_monthly', days: 30 }))}>Activate 30d</Action>
                  <Action onClick={() => action(() => api.extendAdminSubscription(token, String(row.profile_id || row.id), 7))}>+7d</Action>
                  <Action onClick={() => action(() => api.extendAdminSubscription(token, String(row.profile_id || row.id), 30))}>+30d</Action>
                  <Action danger onClick={() => action(() => api.expireAdminSubscription(token, String(row.profile_id || row.id)))}>Expire</Action>
                  <Action danger onClick={() => action(() => api.cancelAdminSubscription(token, String(row.profile_id || row.id)))}>Cancel</Action>
                  {row.profile_id && <Link className="admin-action-btn" to={`/profile/${row.profile_id}`}>Profile</Link>}
                  {row.user_id && <Link className="admin-action-btn" to="/admin/users">User</Link>}
                </>
              ) : (
                <Action onClick={() => setModal({ title: String(row.email || row.id), body: JSON.stringify(row, null, 2) })}>View</Action>
              )}
            </>
          )} />
        </>
      );
    }

    if (view === 'token-transactions' || view === 'payments') {
      return (
        <>
          <section className="admin-card">
            <h2>Client activation payments</h2>
            <p>Jednorazowe platnosci 0.99 EUR z aktywacji klienta.</p>
          </section>
          <AdminTable rows={clientActivationPayments} columns={['email', 'amount_cents', 'currency', 'status', 'provider', 'stripe_session_id', 'stripe_payment_intent_id', 'created_at']} />
          <AdminTable rows={purchases} columns={['id', 'user_id', 'token_amount', 'eur_price', 'bonus_tokens', 'status', 'created_at']} actions={(purchase) => (
            <>
              <Action onClick={() => action(() => api.setPurchaseRequestStatus(token, purchase.id, 'approved'))}>Approve</Action>
              <Action danger onClick={() => action(() => api.setPurchaseRequestStatus(token, purchase.id, 'failed'))}>Reject</Action>
            </>
          )} />
          <AdminTable rows={transactions} columns={['id', 'from_wallet_id', 'to_wallet_id', 'transaction_type', 'amount', 'status', 'created_at']} />
        </>
      );
    }

    if (view === 'wallets') {
      return (
        <>
          <section className="admin-metric-grid">
            {masterWallets.map((wallet) => (
              <article className="admin-card" key={wallet.id}>
                <h2>Master Wallet</h2>
                <p>{wallet.reserve_asset}: {Number(wallet.reserve_amount).toLocaleString()}</p>
                <p>Distributed: {Number(wallet.distributed_amount).toLocaleString()}</p>
                <p>Locked: {Number(wallet.locked_amount).toLocaleString()}</p>
                <input defaultValue={wallet.solana_wallet_address || ''} placeholder="Master Solana Wallet Address" onBlur={(event) => action(() => api.updateMasterWallet(token, wallet.id, { ...wallet, solana_wallet_address: event.target.value }))} />
              </article>
            ))}
          </section>
          <AdminTable rows={wallets} columns={['public_wallet_id', 'user_id', 'escort_token_balance', 'eur_spent', 'referral_balance', 'frozen', 'created_at']} />
        </>
      );
    }

    if (view === 'referrals') {
      return <AdminTable rows={clientReferrals} columns={['referral_code', 'user_id', 'referred_by_code', 'click_count', 'registration_count', 'activation_count', 'earned_coins', 'created_at']} actions={(row) => (
        <Action onClick={() => setModal({ title: String(row.referral_code), body: JSON.stringify(row, null, 2) })}>View</Action>
      )} />;
    }

    if (view === 'tags') {
      return (
        <>
          <section className="admin-card admin-inline-form">
            <input placeholder="Tag label" value={newTag.label} onChange={(event) => setNewTag({ ...newTag, label: event.target.value })} />
            <input placeholder="Group" value={newTag.group_key} onChange={(event) => setNewTag({ ...newTag, group_key: event.target.value })} />
            <button className="button primary" onClick={() => action(() => api.createAdminTag(token, newTag).then(() => setNewTag({ label: '', group_key: 'premium' })))}>Dodaj tag</button>
          </section>
          <AdminTable rows={tags} columns={['label', 'slug', 'group_key', 'sort_order', 'active', 'created_at']} actions={(tag) => (
            <Action onClick={() => action(() => api.updateAdminTag(token, tag.id, { ...tag, active: !tag.active }))}>{tag.active ? 'Disable' : 'Enable'}</Action>
          )} />
        </>
      );
    }

    if (view === 'photos') {
      return <AdminTable rows={photos} columns={['id', 'profile_id', 'storage_path', 'moderation_status', 'created_at']} actions={(photo) => (
        <>
          <Action onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'approved'))}>Approve</Action>
          <Action danger onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'rejected'))}>Reject</Action>
          <Action danger onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'blocked'))}>Block</Action>
        </>
      )} />;
    }

    if (view === 'reports') {
      return <AdminTable rows={reports} columns={['profile_id', 'reason', 'message', 'reporter_email', 'admin_status', 'escalated_to_authorities', 'created_at']} actions={(report) => (
        <>
          <Action onClick={() => action(() => api.setReportStatus(token, report.id, { admin_status: 'investigating' }))}>Investigating</Action>
          <Action onClick={() => action(() => api.setReportStatus(token, report.id, { admin_status: 'resolved' }))}>Resolved</Action>
          <Action danger onClick={() => action(() => api.setReportStatus(token, report.id, { admin_status: 'escalated', escalated_to_authorities: true }))}>Escalate</Action>
        </>
      )} />;
    }

    if (view === 'settings') {
      return <section className="admin-settings-grid">
        <AdminStatCard label="Listing price" value="49.99 EUR" />
        <AdminStatCard label="Token price" value="0.15 EUR" />
        <AdminStatCard label="Max photos" value="6" />
        <AdminStatCard label="Default language" value="DE" />
        <AdminStatCard label="Demo profiles" value="enabled" />
        <AdminStatCard label="Bookings" value="enabled" />
        <AdminStatCard label="Live cam placeholder" value="enabled" />
        <AdminStatCard label="Token shop" value="enabled" />
        <AdminStatCard label="Admin access" value="app_metadata.role/admin" />
      </section>;
    }

    if (view === 'live-lab') {
      return <section className="admin-chart-grid">{['purchase', 'token_transfer', 'unlock', 'stream', 'booking', 'moderation'].map((item) => <article className="admin-card" key={item}><h2>{item}</h2><button className="button" onClick={() => action(() => api.simulateLiveLab(token, item))}>Symuluj</button></article>)}</section>;
    }

    if (view === 'activity-logs') {
      return <AdminTable rows={activity} columns={['admin_email', 'action', 'target_type', 'target_id', 'created_at']} />;
    }

    return <section className="admin-card"><h2>{adminLabel(view)}</h2><p>Modul przygotowany jako placeholder control center.</p></section>;
  }
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === 'fulfilled') return result.value;
  console.error(`Admin load failed: ${label}`, result.reason);
  return fallback;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    })
  ]);
}

function adminLoadRequest<T>(label: string, request: Promise<T>, timeoutMs = 10000): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Admin load timeout: ${label}`)), timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function getAdminView(pathname: string) {
  const value = pathname.replace('/admin/', '').replace('/admin', '') || 'dashboard';
  return value || 'dashboard';
}

function adminLabel(key: string) {
  const labels: Record<string, string> = {
    dashboard: 'Dashboard',
    'profile-studio': 'Profile Studio',
    users: 'Uzytkownicy',
    profiles: 'Profile',
    subscriptions: 'Subskrypcje',
    payments: 'Payments',
    'token-transactions': 'Transakcje tokenow',
    wallets: 'Portfele',
    referrals: 'Drzewo polecen',
    photos: 'Zdjecia',
    tags: 'Tagi',
    reports: 'Zgloszenia',
    reviews: 'Opinie',
    'live-cam': 'Live Cam',
    'video-manager': 'Video Manager',
    'email-center': 'Email Center',
    'chat-manager': 'Chat Manager',
    push: 'PUSH',
    'sms-center': 'SMS Center',
    settings: 'Ustawienia',
    'live-lab': 'Live Lab',
    moderation: 'Moderacja',
    'activity-logs': 'Logi aktywnosci'
  };
  return labels[key] || key;
}

function profileMatchesAdminFilters(profile: Profile, query: string, filters: Record<string, string>) {
  const haystack = JSON.stringify(profile).toLowerCase();
  if (query && !haystack.includes(query.toLowerCase())) return false;
  if (filters.city !== 'all' && profile.city !== filters.city) return false;
  if (filters.type !== 'all' && profile.category !== filters.type) return false;
  if (filters.published !== 'all' && Boolean(profile.is_published !== false) !== (filters.published === 'yes')) return false;
  if (filters.suspended !== 'all') {
    const suspended = profile.status === 'suspended' || profile.moderation_status === 'suspended';
    if (suspended !== (filters.suspended === 'yes')) return false;
  }
  if (filters.seed !== 'all' && Boolean(profile.is_seed_profile) !== (filters.seed === 'yes')) return false;
  if (filters.verified !== 'all' && Boolean(profile.verified) !== (filters.verified === 'yes')) return false;
  if (filters.premium_tier !== 'all' && profile.premium_tier !== filters.premium_tier) return false;
  if (filters.owner_email && !String(profile.owner_email || '').toLowerCase().includes(filters.owner_email.toLowerCase())) return false;
  return true;
}

function toggleStudioService(values: string[], key: string) {
  return values.includes(key) ? values.filter((item) => item !== key) : [...values, key];
}

function mergeServices(values: string[], next: string[]) {
  return [...new Set([...values, ...next])];
}

function moveImageId(images: NonNullable<Profile['profile_images']>, index: number, direction: -1 | 1) {
  const ids = images.map((image) => image.id);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= ids.length) return ids;
  const copy = [...ids];
  const [item] = copy.splice(index, 1);
  copy.splice(nextIndex, 0, item);
  return copy;
}

function AdminStatCard({ label, value }: { label: string; value: unknown }) {
  return <article className="admin-card stat"><span>{label}</span><strong>{String(value ?? 0)}</strong></article>;
}

function MetricBlock({ label, value }: { label: string; value: unknown }) {
  return <div className="metric"><span>{label}</span><strong>{String(value ?? 0)}</strong></div>;
}

function EmptyAdminState({ text }: { text: string }) {
  return <p className="muted">{text}</p>;
}

function revenueLabel(value: unknown, emptyText: string) {
  const numeric = Number(value || 0);
  return numeric > 0 ? `${numeric.toFixed(2)} EUR` : emptyText;
}

function ChartPlaceholder({ title }: { title: string }) {
  return <article className="admin-card chart"><h2>{title}</h2><div className="chart-bars">{[42, 68, 51, 78, 62, 88, 74].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div></article>;
}

function AdminTable<T extends Record<string, any>>({ rows, columns, actions, format }: { rows: T[]; columns: string[]; actions?: (row: T) => ReactNode; format?: (key: string, value: unknown, row: T) => unknown }) {
  return (
    <section className="admin-table-card">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}{actions && <th>Actions</th>}</tr></thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id || index}>
                {columns.map((column) => <td key={column}><CellValue value={format ? format(column, row[column], row) : row[column]} /></td>)}
                {actions && <td><div className="admin-actions-row">{actions(row)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted">Brak rekordow.</p>}
    </section>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (typeof value === 'boolean') return <StatusBadge value={value ? 'yes' : 'no'} />;
  if (typeof value === 'string' && ['active', 'pending', 'verified', 'suspended', 'blocked', 'rejected', 'conflict', 'approved', 'failed'].includes(value)) return <StatusBadge value={value} />;
  if (value === null || value === undefined || value === '') return <>-</>;
  if (typeof value === 'object') return <>{JSON.stringify(value).slice(0, 80)}</>;
  return <>{String(value).slice(0, 120)}</>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`admin-status ${value}`}>{value}</span>;
}

function Action({ children, onClick, danger = false }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return <button className={danger ? 'admin-action-btn danger' : 'admin-action-btn'} onClick={onClick}>{children}</button>;
}
