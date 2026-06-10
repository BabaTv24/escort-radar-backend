import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Ban, BarChart3, Camera, Coins, FlaskConical, LogOut, MessageSquare, Settings, Shield, Tags, Users, WalletCards } from 'lucide-react';
import { api } from '../lib/api';
import type { AdminActivity, AdminReport, BookingRequest, MasterAdminWallet, Profile, Tag, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';
import { useI18n } from '../i18n';

type AdminUser = Record<string, any>;
type SubscriptionRow = Record<string, any>;
const adminTokenStorageKey = 'escort-radar-admin-token';

const sections = [
  {
    title: 'PRZEGLAD',
    items: [
      ['dashboard', '/admin', BarChart3],
      ['users', '/admin/users', Users],
      ['profiles', '/admin/profiles', Shield],
      ['subscriptions', '/admin/subscriptions', Coins],
      ['token-transactions', '/admin/token-transactions', Coins],
      ['wallets', '/admin/wallets', WalletCards],
      ['referrals', '/admin/referrals', Users]
    ]
  },
  {
    title: 'TRESCI',
    items: [
      ['photos', '/admin/photos', Camera],
      ['tags', '/admin/tags', Tags],
      ['reports', '/admin/reports', Ban],
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
      ['settings', '/admin/settings', Settings],
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

  const view = getAdminView(location.pathname);
  const isLoginRoute = location.pathname === '/admin/login';
  const filteredProfiles = profiles.filter((profile) => JSON.stringify(profile).toLowerCase().includes(query.toLowerCase()));
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
      return <AdminTable rows={subscriptions} columns={['display_name', 'listing_plan', 'subscription_status', 'subscription_started_at', 'subscription_expires_at', 'listing_price', 'listing_currency', 'is_test_account', 'admin_note']} />;
    }

    if (view === 'token-transactions') {
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
    users: 'Uzytkownicy',
    profiles: 'Profile / Ogloszenia',
    subscriptions: 'Subskrypcje',
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
