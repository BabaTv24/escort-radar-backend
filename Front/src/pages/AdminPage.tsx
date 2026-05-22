import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Ban, BarChart3, Camera, Coins, FlaskConical, LogOut, MessageSquare, Settings, Shield, Tags, Users, WalletCards } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { AdminActivity, AdminReport, BookingRequest, MasterAdminWallet, Profile, Tag, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';
import { useI18n } from '../i18n';

type AdminUser = Record<string, any>;
type SubscriptionRow = Record<string, any>;

const adminEmails = ['mtvx007@gmail.com', 'babatv24@proton.me'];

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

export function AdminPage({ accessMode = false }: { accessMode?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
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
  const [purchases, setPurchases] = useState<TokenPurchaseRequest[]>([]);
  const [masterWallets, setMasterWallets] = useState<MasterAdminWallet[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [photos, setPhotos] = useState<Record<string, any>[]>([]);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null);
  const [newTag, setNewTag] = useState({ label: '', group_key: 'premium' });

  const view = getAdminView(location.pathname);
  const filteredProfiles = profiles.filter((profile) => JSON.stringify(profile).toLowerCase().includes(query.toLowerCase()));
  const filteredUsers = users.filter((user) => JSON.stringify(user).toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      const signedEmail = session?.user.email?.toLowerCase() || '';
      if (!session?.access_token) {
        if (!accessMode) navigate('/admin/login', { replace: true });
        return;
      }
      if (!adminEmails.includes(signedEmail)) {
        setMessage('Brak dostepu administratora');
        return;
      }
      setToken(session.access_token);
      load(session.access_token);
    });
  }, []);

  async function login() {
    setLoading(true);
    setMessage('');
    const result = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) return setMessage(result.error.message);
    const signedEmail = result.data.user?.email?.toLowerCase() || '';
    if (!adminEmails.includes(signedEmail)) return setMessage('Brak dostepu administratora');
    const accessToken = result.data.session?.access_token || '';
    setToken(accessToken);
    await load(accessToken);
    navigate('/admin', { replace: true });
  }

  async function logout() {
    await supabase.auth.signOut();
    setToken('');
    navigate('/admin/login', { replace: true });
  }

  async function load(accessToken = token) {
    setLoading(true);
    const [
      statsData,
      tokenData,
      usersData,
      profileData,
      subscriptionData,
      reportData,
      bookingData,
      walletData,
      transactionData,
      purchaseData,
      masterData,
      tagData,
      photoData
    ] = await Promise.all([
      api.adminStats(accessToken),
      api.adminTokenStats(accessToken),
      api.adminUsers(accessToken),
      api.adminProfiles(accessToken),
      api.adminSubscriptions(accessToken),
      api.adminReports(accessToken),
      api.adminBookings(accessToken),
      api.adminWallets(accessToken),
      api.adminTokenTransactions(accessToken),
      api.adminPurchaseRequests(accessToken),
      api.adminMasterWallets(accessToken),
      api.adminTags(accessToken),
      api.adminPhotos(accessToken)
    ]);

    setStats({ ...statsData.stats, ...profileData.stats, reports: reportData.reports_count, bookings: bookingData.booking_requests.length });
    setTokenStats(tokenData.stats);
    setUsers(usersData.users);
    setProfiles(profileData.profiles);
    setSubscriptions(subscriptionData.subscriptions);
    setReports(reportData.reports);
    setBookings(bookingData.booking_requests);
    setWallets(walletData.wallets);
    setTransactions(transactionData.transactions);
    setPurchases(purchaseData.purchase_requests);
    setMasterWallets(masterData.master_wallets);
    setTags(tagData.tags);
    setPhotos(photoData.photos as Record<string, any>[]);
    setActivity(statsData.latest_activity);
    setLoading(false);
  }

  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    }
  }

  if (accessMode || location.pathname === '/admin/login') {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <img className="baba-admin-logo" src="/Sektion_1_4.png" alt="BABA AI" />
          <p className="eyebrow">Escort Radar Admin Console</p>
          <h1>Control Center</h1>
          <p>Tylko dla administratorow i moderatorow.</p>
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder="Haslo" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button primary full" disabled={loading} onClick={login}>{loading ? t('states.loading') : 'Login'}</button>
          {message && <p className="error-text">{message}</p>}
        </div>
      </div>
    );
  }

  if (!token) return null;

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
      const cards = [
        ['Dzienny przychod', tokenStats.approved_purchase_value || 0],
        ['Miesieczny przychod', tokenStats.revenue_estimate_eur || tokenStats.approved_purchase_value || 0],
        ['Transakcje', transactions.length],
        ['Konwersja', `${users.length ? Math.round((purchases.length / users.length) * 100) : 0}%`],
        ['Aktywni uzytkownicy', users.filter((user) => user.status === 'active').length],
        ['Profile lacznie', stats.total_profiles || profiles.length],
        ['Do weryfikacji', stats.pending_verification || 0],
        ['Aktywne profile', stats.active_profiles || 0],
        ['Zawieszone', stats.suspended_profiles || 0],
        ['Konta testowe', stats.test_accounts || users.filter((user) => user.is_test_account).length],
        ['Tokeny w obiegu', tokenStats.token_circulation || 0],
        ['Rezerwa TATACoin', tokenStats.master_reserve_tatacoin || 500000],
        ['Requesty rezerwacji', bookings.length],
        ['Zgloszenia naduzyc', reports.length]
      ];
      return (
        <>
          <section className="admin-metric-grid">{cards.map(([label, value]) => <AdminStatCard key={label} label={String(label)} value={value} />)}</section>
          <section className="admin-chart-grid">
            {['Przychody 7 dni', 'Wzrost liczby uzytkownikow', 'Ruch na stronie', 'Top kategorie', 'Top tagi', 'Top miasta'].map((title) => <ChartPlaceholder key={title} title={title} />)}
          </section>
        </>
      );
    }

    if (view === 'users') {
      return <AdminTable rows={filteredUsers} columns={['email', 'role', 'account_type', 'public_user_id', 'referral_code', 'token_balance', 'profile_count', 'created_at', 'status']} actions={(user) => (
        <>
          <Action onClick={() => setModal({ title: String(user.email), body: JSON.stringify(user, null, 2) })}>View</Action>
          <Action onClick={() => setModal({ title: 'Edit user', body: JSON.stringify(user, null, 2) })}>Edit</Action>
          <Action onClick={() => setModal({ title: 'Token balance editor', body: `${user.email}: ${user.token_balance}` })}>Add tokens</Action>
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
        <AdminStatCard label="Admin emails" value={adminEmails.join(', ')} />
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
