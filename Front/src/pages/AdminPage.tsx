import { isValidElement, useEffect, useState } from 'react';
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
const studioTabs = ['account', 'basic', 'location', 'business', 'prices', 'status', 'services', 'subscription', 'moderation', 'photos'] as const;
const emptyStudioForm = {
  id: '',
  owner_email: '',
  phone: '',
  whatsapp: '',
  telegram: '',
  account_type: 'escort',
  profile_type: 'private_escort',
  display_name: '',
  category: 'ladies',
  city: 'berlin',
  area: 'Mitte',
  work_country: 'DE',
  work_city: 'Berlin',
  work_area: 'Mitte',
  age: 26,
  nationality: 'European',
  height_cm: 170,
  languages: ['DE', 'EN'],
  business_name: '',
  business_type: '',
  contact_person: '',
  website: '',
  opening_hours: '',
  price_30min: 120,
  price_1h: 180,
  price_2h: 320,
  price_night: 900,
  currency: 'EUR',
  operator_status: 'AVAILABLE_TODAY',
  availability_status: 'available',
  services: ['towarzystwo', 'dyskrecja'],
  description: '',
  verified: true,
  premium_tier: 'gold',
  is_seed_profile: true,
  is_published: true,
  admin_priority: 100,
  moderation_status: 'approved',
  moderation_note: '',
  suspended_reason: '',
  listing_plan: 'admin_profile_studio',
  subscription_status: 'trial',
  subscription_start: '',
  subscription_end: '',
  subscription_note: ''
};

const sections = [
  {
    title: 'CONTROL',
    items: [
      ['dashboard', '/admin', BarChart3],
      ['profiles', '/admin/profiles', Crown],
      ['moderation', '/admin/moderation', Shield],
      ['reports', '/admin/reports', Ban],
      ['subscriptions', '/admin/subscriptions', Coins],
      ['revenue', '/admin/revenue', BarChart3],
      ['payments', '/admin/token-transactions', WalletCards],
      ['users', '/admin/users', Users],
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
  const { t, option, lang, setLang } = useI18n();

  const [stats, setStats] = useState<Record<string, number>>({});
  const [tokenStats, setTokenStats] = useState<Record<string, number>>({});
  const [subscriptionStats, setSubscriptionStats] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [moderationQueues, setModerationQueues] = useState<Record<string, Profile[]>>({});
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
  const [revenueStats, setRevenueStats] = useState<Record<string, number>>({});
  const [revenuePayments, setRevenuePayments] = useState<Record<string, any>[]>([]);
  const [topCities, setTopCities] = useState<Record<string, any>[]>([]);
  const [topCategories, setTopCategories] = useState<Record<string, any>[]>([]);
  const [topProfiles, setTopProfiles] = useState<Record<string, any>[]>([]);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<{ title: string; body: string } | null>(null);
  const [subscriptionDateEditor, setSubscriptionDateEditor] = useState<{
    row: SubscriptionRow;
    start: string;
    end: string;
    status: string;
    note: string;
  } | null>(null);
  const [newTag, setNewTag] = useState({ label: '', group_key: 'premium' });
  const [studioForm, setStudioForm] = useState({ ...emptyStudioForm });
  const [studioFile, setStudioFile] = useState<File | null>(null);
  const [studioSaving, setStudioSaving] = useState(false);
  const [studioTab, setStudioTab] = useState<(typeof studioTabs)[number]>('account');
  const [studioServiceSearch, setStudioServiceSearch] = useState('');
  const [studioServiceCategory, setStudioServiceCategory] = useState('all');
  const [expandedServiceCategories, setExpandedServiceCategories] = useState<Record<string, boolean>>({});
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [bulkPremiumTier, setBulkPremiumTier] = useState('gold');
  const [bulkSubscriptionStatus, setBulkSubscriptionStatus] = useState('active');
  const [profilePanelMode, setProfilePanelMode] = useState<'overview' | 'edit' | 'photos' | 'services' | 'subscription'>('overview');
  const [moderationFilter, setModerationFilter] = useState<'pending' | 'reported' | 'suspended' | 'rejected'>('pending');
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
        clientReferralResult,
        moderationResult,
        activityLogResult,
        revenueResult
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
        adminLoadRequest('adminClientReferrals', api.adminClientReferrals(accessToken)),
        adminLoadRequest('adminModeration', api.adminModeration(accessToken)),
        adminLoadRequest('adminActivityLogs', api.adminActivityLogs(accessToken)),
        adminLoadRequest('adminRevenue', api.adminRevenue(accessToken))
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
      const moderationData = settledValue(moderationResult, { profiles: [], queues: {} }, 'adminModeration');
      const activityLogData = settledValue(activityLogResult, { activity_logs: [] }, 'adminActivityLogs');
      const revenueData = settledValue(revenueResult, { stats: {}, payments: [] }, 'adminRevenue');

      setStats({ ...statsData.stats, ...profileData.stats, reports: reportData.reports_count, bookings: bookingData.booking_requests.length });
      setTokenStats(tokenData.stats);
      setSubscriptionStats((subscriptionData as any).stats || {});
      setUsers(usersData.users);
      setProfiles(profileData.profiles);
      setSubscriptions(subscriptionData.subscriptions);
      setModerationQueues((moderationData as any).queues || {});
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
      setActivity((activityLogData.activity_logs?.length ? activityLogData.activity_logs : statsData.latest_activity) as AdminActivity[]);
      setRevenueEvents((statsData.revenue_events || []) as Record<string, any>[]);
      setRevenueStats(revenueData.stats);
      setRevenuePayments(revenueData.payments as Record<string, any>[]);
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
      owner_email: profile.owner_email || '',
      phone: profile.phone || profile.primary_phone || '',
      whatsapp: profile.whatsapp || '',
      telegram: profile.telegram || '',
      account_type: profile.account_type || 'escort',
      profile_type: profile.profile_type || 'private_escort',
      display_name: profile.display_name || '',
      category: profile.category || 'ladies',
      city: profile.city || 'berlin',
      area: profile.area || profile.work_area || '',
      work_country: profile.work_country || 'DE',
      work_city: profile.work_city || profile.city || '',
      work_area: profile.work_area || profile.area || '',
      age: profile.age || 26,
      nationality: profile.nationality || 'European',
      height_cm: profile.height_cm || profile.height || 170,
      languages: profile.languages?.length ? profile.languages : ['DE', 'EN'],
      business_name: profile.business_name || '',
      business_type: profile.business_type || '',
      contact_person: profile.contact_person || '',
      website: profile.website || '',
      opening_hours: typeof profile.opening_hours === 'string' ? profile.opening_hours : String((profile.opening_hours as any)?.note || ''),
      price_30min: Number(profile.price_30min || 0),
      price_1h: Number(profile.price_1h || 180),
      price_2h: Number(profile.price_2h || 0),
      price_night: Number(profile.price_night || 0),
      currency: profile.currency || profile.listing_currency || 'EUR',
      operator_status: profile.operator_status || 'AVAILABLE_TODAY',
      availability_status: profile.availability_status || 'available',
      services: profile.services?.length ? profile.services : ['towarzystwo', 'dyskrecja'],
      description: profile.description || '',
      verified: profile.verified !== false,
      premium_tier: profile.premium_tier || 'gold',
      is_seed_profile: Boolean(profile.is_seed_profile),
      is_published: profile.is_published !== false,
      admin_priority: Number(profile.admin_priority || 0),
      moderation_status: profile.moderation_status || 'approved',
      moderation_note: profile.moderation_note || '',
      suspended_reason: profile.suspended_reason || '',
      listing_plan: profile.listing_plan || profile.subscription_plan || 'admin_profile_studio',
      subscription_status: profile.subscription_status || 'trial',
      subscription_start: profile.subscription_start ? profile.subscription_start.slice(0, 10) : '',
      subscription_end: profile.subscription_end ? profile.subscription_end.slice(0, 10) : '',
      subscription_note: profile.subscription_note || ''
    });
    setProfilePanelMode('edit');
  }

  function openProfileOverview(profile: Profile) {
    editStudioProfile(profile);
    setProfilePanelMode('overview');
  }

  function toggleBulkProfile(id: string) {
    setSelectedProfileIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function runBulkAction(operation: string, extra: Record<string, unknown> = {}) {
    if (!selectedProfileIds.length) {
      setMessage(t('admin.bulk.noneSelected'));
      return;
    }
    const confirmed = window.confirm(t('admin.bulk.confirm', { count: selectedProfileIds.length }));
    if (!confirmed) return;
    await action(async () => {
      await api.bulkAdminProfiles(token, { operation, profile_ids: selectedProfileIds, ...extra });
      setSelectedProfileIds([]);
    });
  }

  function openSubscriptionDateEditor(row: SubscriptionRow) {
    setSubscriptionDateEditor({
      row,
      start: formatDateInput(readSubscriptionStart(row)),
      end: formatDateInput(readSubscriptionEnd(row)),
      status: String(row.status || 'active'),
      note: String(row.note || '')
    });
  }

  async function saveSubscriptionDates() {
    if (!subscriptionDateEditor) return;
    await action(async () => {
      await api.setAdminSubscriptionDates(token, String(subscriptionDateEditor.row.profile_id || subscriptionDateEditor.row.id), {
        start: subscriptionDateEditor.start,
        end: subscriptionDateEditor.end,
        status: subscriptionDateEditor.status,
        note: subscriptionDateEditor.note
      });
      setSubscriptionDateEditor(null);
      setMessage(t('admin.messages.subscriptionDatesSaved'));
    });
  }

  async function saveStudioProfile() {
    setStudioSaving(true);
    setMessage('');
    try {
      const body = {
        ...studioForm,
        height: studioForm.height_cm,
        languages: Array.isArray(studioForm.languages) ? studioForm.languages : String(studioForm.languages || '').split(',').map((item) => item.trim()).filter(Boolean),
        opening_hours: studioForm.opening_hours ? { note: studioForm.opening_hours } : {},
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
    if (!profileId) {
      setMessage(t('admin.photos.saveFirst'));
      return;
    }
    if (!studioFile) return;
    const form = new FormData();
    form.append('image', studioFile);
    try {
      const result = await api.uploadAdminProfileImage(token, profileId, form);
      const image = result.image as NonNullable<Profile['profile_images']>[number];
      setProfiles((current) => current.map((profile) => {
        if (profile.id !== profileId) return profile;
        const images = sortAdminImages([...(profile.profile_images || []), image]);
        return { ...profile, profile_images: images, images };
      }));
      setStudioFile(null);
      setMessage(t('admin.messages.photoUploaded'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    }
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

  function renderStudioEditorTab(selectedProfile?: Profile) {
    const selectedServices = studioForm.services.map((key) => ({ key, label: serviceLabel(key) }));
    const visibleServices = serviceOptions
      .filter((service) => studioServiceCategory === 'all' || service.category === studioServiceCategory)
      .filter((service) => `${service.label} ${service.key} ${service.category}`.toLowerCase().includes(studioServiceSearch.toLowerCase()));
    const groupedServices = visibleServices.reduce<Record<string, typeof serviceOptions>>((groups, service) => {
      groups[service.category] = [...(groups[service.category] || []), service];
      return groups;
    }, {});

    if (studioTab === 'account') {
      return <div className="admin-form-grid">
        <AdminField label={t('admin.profileEditor.ownerEmail')} help={t('admin.profileEditor.ownerEmailHelp')}><input type="email" placeholder={t('admin.profileEditor.ownerEmailPlaceholder')} value={studioForm.owner_email} onChange={(event) => setStudioForm({ ...studioForm, owner_email: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.phone')}><input placeholder={t('admin.profileEditor.phonePlaceholder')} value={studioForm.phone} onChange={(event) => setStudioForm({ ...studioForm, phone: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.whatsapp')}><input placeholder={t('admin.profileEditor.whatsappPlaceholder')} value={studioForm.whatsapp} onChange={(event) => setStudioForm({ ...studioForm, whatsapp: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.telegram')}><input placeholder={t('admin.profileEditor.telegramPlaceholder')} value={studioForm.telegram} onChange={(event) => setStudioForm({ ...studioForm, telegram: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.accountType')}><select value={studioForm.account_type} onChange={(event) => setStudioForm({ ...studioForm, account_type: event.target.value })}>{['escort', 'business'].map((type) => <option key={type} value={type}>{t(`admin.status.${type}`)}</option>)}</select></AdminField>
        <AdminField label={t('admin.profileEditor.profileType')}><select value={studioForm.profile_type} onChange={(event) => setStudioForm({ ...studioForm, profile_type: event.target.value })}>{['private_escort', 'agency', 'club', 'massage_salon', 'live_cam', 'couple', 'trans', 'gay', 'other'].map((type) => <option key={type} value={type}>{t(`admin.status.${type}`)}</option>)}</select></AdminField>
      </div>;
    }

    if (studioTab === 'basic') {
      return <>
        <div className="admin-form-grid">
          <AdminField label={t('admin.profileEditor.displayName')}><input placeholder={t('admin.profileEditor.displayNamePlaceholder')} value={studioForm.display_name} onChange={(event) => setStudioForm({ ...studioForm, display_name: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.category')}><select value={studioForm.category} onChange={(event) => setStudioForm({ ...studioForm, category: event.target.value })}>{categoryOptions.map((category) => <option key={category} value={category}>{option(category)}</option>)}</select></AdminField>
          <AdminField label={t('admin.profileEditor.age')}><input type="number" value={studioForm.age} onChange={(event) => setStudioForm({ ...studioForm, age: Number(event.target.value) })} /></AdminField>
          <AdminField label={t('admin.profileEditor.nationality')}><input placeholder={t('admin.profileEditor.nationalityPlaceholder')} value={studioForm.nationality} onChange={(event) => setStudioForm({ ...studioForm, nationality: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.height')}><input type="number" value={studioForm.height_cm} onChange={(event) => setStudioForm({ ...studioForm, height_cm: Number(event.target.value) })} /></AdminField>
          <AdminField label={t('admin.profileEditor.languages')}><input placeholder={t('admin.profileEditor.languagesPlaceholder')} value={studioForm.languages.join(', ')} onChange={(event) => setStudioForm({ ...studioForm, languages: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></AdminField>
        </div>
        <AdminField label={t('admin.profileEditor.description')}><textarea placeholder={t('admin.profileEditor.descriptionPlaceholder')} value={studioForm.description} onChange={(event) => setStudioForm({ ...studioForm, description: event.target.value })} /></AdminField>
      </>;
    }

    if (studioTab === 'location') {
      return <div className="admin-form-grid">
        <AdminField label={t('admin.profileEditor.country')}><input placeholder="DE" value={studioForm.work_country} onChange={(event) => setStudioForm({ ...studioForm, work_country: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.city')}><input placeholder="berlin" value={studioForm.city} onChange={(event) => setStudioForm({ ...studioForm, city: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.area')}><input placeholder={t('admin.profileEditor.areaPlaceholder')} value={studioForm.area} onChange={(event) => setStudioForm({ ...studioForm, area: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.workCountry')}><input placeholder="DE" value={studioForm.work_country} onChange={(event) => setStudioForm({ ...studioForm, work_country: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.workCity')}><input placeholder="Berlin" value={studioForm.work_city} onChange={(event) => setStudioForm({ ...studioForm, work_city: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.workArea')}><input placeholder="Mitte" value={studioForm.work_area} onChange={(event) => setStudioForm({ ...studioForm, work_area: event.target.value })} /></AdminField>
      </div>;
    }

    if (studioTab === 'business') {
      return <div className="admin-form-grid">
        <AdminField label={t('admin.profileEditor.businessName')}><input placeholder={t('admin.profileEditor.businessNamePlaceholder')} value={studioForm.business_name} onChange={(event) => setStudioForm({ ...studioForm, business_name: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.businessType')}><input placeholder={t('admin.profileEditor.businessTypePlaceholder')} value={studioForm.business_type} onChange={(event) => setStudioForm({ ...studioForm, business_type: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.contactPerson')}><input placeholder={t('admin.profileEditor.contactPersonPlaceholder')} value={studioForm.contact_person} onChange={(event) => setStudioForm({ ...studioForm, contact_person: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.website')}><input placeholder="https://example.com" value={studioForm.website} onChange={(event) => setStudioForm({ ...studioForm, website: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.openingHours')}><input placeholder={t('admin.profileEditor.openingHoursPlaceholder')} value={studioForm.opening_hours} onChange={(event) => setStudioForm({ ...studioForm, opening_hours: event.target.value })} /></AdminField>
      </div>;
    }

    if (studioTab === 'prices') {
      return <div className="admin-form-grid">
        <AdminField label={t('admin.profileEditor.price30')}><input type="number" value={studioForm.price_30min} onChange={(event) => setStudioForm({ ...studioForm, price_30min: Number(event.target.value) })} /></AdminField>
        <AdminField label={t('admin.profileEditor.price1h')}><input type="number" value={studioForm.price_1h} onChange={(event) => setStudioForm({ ...studioForm, price_1h: Number(event.target.value) })} /></AdminField>
        <AdminField label={t('admin.profileEditor.price2h')}><input type="number" value={studioForm.price_2h} onChange={(event) => setStudioForm({ ...studioForm, price_2h: Number(event.target.value) })} /></AdminField>
        <AdminField label={t('admin.profileEditor.priceNight')}><input type="number" value={studioForm.price_night} onChange={(event) => setStudioForm({ ...studioForm, price_night: Number(event.target.value) })} /></AdminField>
        <AdminField label={t('admin.profileEditor.currency')}><input value={studioForm.currency} onChange={(event) => setStudioForm({ ...studioForm, currency: event.target.value })} /></AdminField>
      </div>;
    }

    if (studioTab === 'status') {
      return <>
        <div className="admin-form-grid">
          <AdminField label={t('admin.profileEditor.operatorStatus')}><select value={studioForm.operator_status} onChange={(event) => setStudioForm({ ...studioForm, operator_status: event.target.value })}>{['ONLINE_NOW', 'AVAILABLE_TODAY', 'BUSY', 'APPOINTMENT_ONLY', 'TRAVELING', 'OFFLINE'].map((status) => <option key={status} value={status}>{status}</option>)}</select></AdminField>
          <AdminField label={t('admin.profileEditor.availability')}><select value={studioForm.availability_status} onChange={(event) => setStudioForm({ ...studioForm, availability_status: event.target.value })}>{['available', 'busy', 'unavailable'].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}</select></AdminField>
          <AdminField label={t('admin.profileEditor.premiumTier')} help={t('admin.profileEditor.premiumTierHelp')}><select value={studioForm.premium_tier} onChange={(event) => setStudioForm({ ...studioForm, premium_tier: event.target.value })}>{['standard', 'gold', 'elite', 'diamond'].map((tier) => <option key={tier} value={tier}>{t(`admin.status.${tier}`)}</option>)}</select></AdminField>
          <AdminField label={t('admin.profileEditor.adminPriority')}><input type="number" value={studioForm.admin_priority} onChange={(event) => setStudioForm({ ...studioForm, admin_priority: Number(event.target.value) })} /></AdminField>
          <AdminField label={t('admin.profileEditor.moderationStatus')} help={t('admin.profileEditor.moderationStatusHelp')}><select value={studioForm.moderation_status} onChange={(event) => setStudioForm({ ...studioForm, moderation_status: event.target.value })}>{['pending', 'approved', 'rejected', 'suspended'].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}</select></AdminField>
        </div>
        <div className="toggle-grid studio-toggle-grid">
          <AdminField label={t('admin.profileEditor.verified')}><label><input type="checkbox" checked={studioForm.verified} onChange={(event) => setStudioForm({ ...studioForm, verified: event.target.checked })} /> {t('admin.common.enabled')}</label></AdminField>
          <AdminField label={t('admin.profileEditor.seedDemo')} help={t('admin.profileEditor.seedDemoHelp')}><label><input type="checkbox" checked={studioForm.is_seed_profile} onChange={(event) => setStudioForm({ ...studioForm, is_seed_profile: event.target.checked })} /> {t('admin.common.enabled')}</label></AdminField>
          <AdminField label={t('admin.profileEditor.published')} help={t('admin.profileEditor.publishedHelp')}><label><input type="checkbox" checked={studioForm.is_published} onChange={(event) => setStudioForm({ ...studioForm, is_published: event.target.checked })} /> {t('admin.common.enabled')}</label></AdminField>
        </div>
      </>;
    }

    if (studioTab === 'services') {
      return <div className="studio-service-picker">
        <div className="profile-studio-head compact">
          <div>
            <span>{t('admin.services.title')}</span>
            <small>{t('admin.services.help')}</small>
          </div>
          <div className="admin-actions-row">
            <Action onClick={() => setStudioForm({ ...studioForm, services: serviceOptions.map((service) => service.key) })}>{t('admin.actions.selectAll')}</Action>
            <Action onClick={() => setStudioForm({ ...studioForm, services: [] })}>{t('admin.actions.clearAll')}</Action>
          </div>
        </div>
        <div className="studio-selected-services">
          <strong>{t('admin.services.selectedCount', { count: selectedServices.length })}</strong>
          <div className="studio-badges">{selectedServices.length ? selectedServices.map((service) => <button key={service.key} type="button" onClick={() => setStudioForm({ ...studioForm, services: toggleStudioService(studioForm.services, service.key) })}>{service.label}</button>) : <i>{t('admin.services.noneSelected')}</i>}</div>
        </div>
        <div className="admin-form-grid">
          <AdminField label={t('admin.services.search')}><input placeholder={t('admin.services.searchPlaceholder')} value={studioServiceSearch} onChange={(event) => setStudioServiceSearch(event.target.value)} /></AdminField>
          <AdminField label={t('admin.services.categoryFilter')}><select value={studioServiceCategory} onChange={(event) => setStudioServiceCategory(event.target.value)}>{serviceCategories.map((category) => <option key={category} value={category}>{category === 'all' ? t('admin.common.all') : category}</option>)}</select></AdminField>
        </div>
        {Object.entries(groupedServices).map(([category, services]) => {
          const expanded = expandedServiceCategories[category] ?? false;
          return <div className="admin-service-group" key={category}>
            <div className="profile-studio-head compact">
              <button type="button" className="admin-action-btn" onClick={() => setExpandedServiceCategories({ ...expandedServiceCategories, [category]: !expanded })}>{expanded ? t('admin.actions.collapse') : t('admin.actions.expand')}</button>
              <strong>{category}</strong>
              <Action onClick={() => setStudioForm({ ...studioForm, services: mergeServices(studioForm.services, services.map((service) => service.key)) })}>{t('admin.services.selectCategory')}</Action>
            </div>
            {expanded && <div className="service-checklist admin-service-checklist">
              {services.map((service) => (
                <button key={service.key} className={studioForm.services.includes(service.key) ? 'selected' : ''} type="button" onClick={() => setStudioForm({ ...studioForm, services: toggleStudioService(studioForm.services, service.key) })}>{service.label}</button>
              ))}
            </div>}
          </div>;
        })}
      </div>;
    }

    if (studioTab === 'subscription') {
      return <>
        <div className="admin-form-grid">
          <AdminField label={t('admin.subscriptions.listingPlan')}><input placeholder="admin_profile_studio" value={studioForm.listing_plan} onChange={(event) => setStudioForm({ ...studioForm, listing_plan: event.target.value })} /></AdminField>
          <AdminField label={t('admin.subscriptions.status')} help={t('admin.subscriptions.statusHelp')}><select value={studioForm.subscription_status} onChange={(event) => setStudioForm({ ...studioForm, subscription_status: event.target.value })}>{['requested', 'trial', 'active', 'expired', 'suspended', 'cancelled', 'test'].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}</select></AdminField>
          <AdminField label={t('admin.subscriptions.startDate')}><input type="date" value={studioForm.subscription_start} onChange={(event) => setStudioForm({ ...studioForm, subscription_start: event.target.value })} /></AdminField>
          <AdminField label={t('admin.subscriptions.endDate')}><input type="date" value={studioForm.subscription_end} onChange={(event) => setStudioForm({ ...studioForm, subscription_end: event.target.value })} /></AdminField>
        </div>
        <AdminField label={t('admin.subscriptions.adminNote')}><textarea placeholder={t('admin.subscriptions.adminNotePlaceholder')} value={studioForm.subscription_note} onChange={(event) => setStudioForm({ ...studioForm, subscription_note: event.target.value })} /></AdminField>
      </>;
    }

    if (studioTab === 'moderation') {
      return <>
        <AdminField label={t('admin.moderation.note')}><textarea placeholder={t('admin.moderation.notePlaceholder')} value={studioForm.moderation_note} onChange={(event) => setStudioForm({ ...studioForm, moderation_note: event.target.value })} /></AdminField>
        <AdminField label={t('admin.moderation.suspensionReason')}><input placeholder={t('admin.moderation.suspensionReasonPlaceholder')} value={studioForm.suspended_reason} onChange={(event) => setStudioForm({ ...studioForm, suspended_reason: event.target.value })} /></AdminField>
      </>;
    }

    return <>
      {!studioForm.id ? (
        <p className="muted">{t('admin.photos.saveFirst')}</p>
      ) : (
        <>
          <AdminField label={t('admin.photos.upload')} help={t('admin.photos.help')}>
            <label className="studio-upload-control">
              <Upload size={17} />
              <span>{studioFile ? studioFile.name : t('admin.photos.choose')}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setStudioFile(event.target.files?.[0] || null)} />
            </label>
          </AdminField>
          {studioFile && <button className="button full" disabled={studioSaving} onClick={() => uploadStudioPhoto()}>{t('admin.photos.upload')}</button>}
        </>
      )}
      {selectedProfile?.profile_images?.length ? (
        <div className="studio-photo-grid">
          {selectedProfile.profile_images.map((image, index) => (
            <div className="studio-photo-card" key={image.id}>
              <img src={adminImageSrc(image)} alt="" />
              <div className="studio-photo-badges">
                {(image.is_cover || image.is_primary) && <i>{t('admin.photos.badge.cover')}</i>}
                {image.is_hidden && <i>{t('admin.photos.badge.hidden')}</i>}
                {image.is_private && <i>{t('admin.photos.badge.private')}</i>}
                <i>{t(`admin.status.${image.moderation_status || 'approved'}`)}</i>
              </div>
              <div className="admin-actions-row">
                <Action onClick={() => action(() => api.setAdminProfileCoverImage(token, selectedProfile.id, image.id))}>{t('admin.photos.cover')}</Action>
                <Action onClick={() => action(() => api.reorderAdminProfileImages(token, selectedProfile.id, moveImageId(selectedProfile.profile_images || [], index, -1)))}>{t('admin.actions.up')}</Action>
                <Action onClick={() => action(() => api.reorderAdminProfileImages(token, selectedProfile.id, moveImageId(selectedProfile.profile_images || [], index, 1)))}>{t('admin.actions.down')}</Action>
                <Action onClick={() => action(() => api.updateAdminProfileImage(token, selectedProfile.id, image.id, { is_hidden: !image.is_hidden }))}>{image.is_hidden ? t('admin.photos.unhide') : t('admin.photos.hide')}</Action>
                <Action onClick={() => action(() => api.updateAdminProfileImage(token, selectedProfile.id, image.id, { is_private: !image.is_private }))}>{image.is_private ? t('admin.photos.makePublic') : t('admin.photos.makePrivate')}</Action>
                <Action danger onClick={() => action(() => api.deleteAdminProfileImage(token, selectedProfile.id, image.id))}><Trash2 size={14} /></Action>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="muted">{t('admin.photos.empty')}</p>}
    </>;
  }

  function renderProfileOverview(selectedProfile?: Profile) {
    if (!selectedProfile) {
      return (
        <div className="profile-overview-empty">
          <p className="eyebrow">{t('admin.profileOverview.title')}</p>
          <h2>{t('admin.profileOverview.selectProfile')}</h2>
        </div>
      );
    }

    const image = selectedProfile.profile_images?.find((item) => item.is_primary) || selectedProfile.profile_images?.[0];
    const reportCount = reports.filter((report) => report.profile_id === selectedProfile.id).length;
    const fields = [
      ['ownerEmail', selectedProfile.owner_email || t('admin.noEmail')],
      ['profileType', selectedProfile.profile_type || selectedProfile.account_type || selectedProfile.category || '-'],
      ['location', [selectedProfile.city, selectedProfile.area || selectedProfile.work_area].filter(Boolean).join(' / ') || '-'],
      ['operatorStatus', selectedProfile.operator_status || selectedProfile.availability_status || '-'],
      ['moderationStatus', selectedProfile.moderation_status || 'pending'],
      ['publishedStatus', selectedProfile.is_published !== false ? t('admin.status.published') : t('admin.status.unpublished')],
      ['subscriptionStatus', selectedProfile.subscription_status || 'free'],
      ['premiumTier', selectedProfile.premium_tier || 'standard'],
      ['photosCount', selectedProfile.profile_images?.length || 0],
      ['servicesCount', selectedProfile.services?.length || selectedProfile.service_menu?.length || 0],
      ['reportsCount', reportCount],
      ['lastUpdated', selectedProfile.updated_at || selectedProfile.created_at || '-']
    ];

    return (
      <div className="profile-overview-panel">
        <div className="profile-overview-hero">
          {image?.public_url ? <img src={image.public_url} alt="" /> : <div className="image-placeholder">{selectedProfile.display_name.slice(0, 1)}</div>}
          <div>
            <p className="eyebrow">{t('admin.profileOverview.title')}</p>
            <h2>{selectedProfile.display_name}</h2>
            <div className="studio-badges">
              <i>{selectedProfile.status}</i>
              <i>{selectedProfile.moderation_status || 'pending'}</i>
              <i>{selectedProfile.subscription_status || 'free'}</i>
            </div>
          </div>
        </div>
        <div className="profile-overview-grid">
          {fields.map(([key, value]) => (
            <div key={key}>
              <span>{t(`admin.profileOverview.${key}`)}</span>
              <strong>{String(value)}</strong>
            </div>
          ))}
        </div>
        <div className="admin-actions-row overview-actions">
          <Action onClick={() => setProfilePanelMode('edit')}>{t('admin.profileOverview.editData')}</Action>
          <Action onClick={() => { setStudioTab('photos'); setProfilePanelMode('photos'); }}>{t('admin.profileOverview.managePhotos')}</Action>
          <Action onClick={() => { setStudioTab('services'); setProfilePanelMode('services'); }}>{t('admin.profileOverview.manageServices')}</Action>
          <Action onClick={() => { setStudioTab('subscription'); setProfilePanelMode('subscription'); }}>{t('admin.profileOverview.manageSubscription')}</Action>
          <Action onClick={() => action(() => api.moderateAdminProfile(token, selectedProfile.id, { moderation_status: selectedProfile.moderation_status === 'suspended' ? 'approved' : 'suspended' }))}>
            {selectedProfile.moderation_status === 'suspended' ? t('admin.actions.unsuspend') : t('admin.actions.suspend')}
          </Action>
          <Link className="admin-action-btn" to={`/profile/${selectedProfile.id}`}>{t('admin.actions.publicView')}</Link>
        </div>
      </div>
    );
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
                <Icon size={16} /> {t(`admin.nav.${key}`)}
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
            <h1>{t(`admin.nav.${view}`)}</h1>
          </div>
          <div className="admin-search">
            <select value={lang} onChange={(event) => setLang(event.target.value as 'pl' | 'de' | 'en')} aria-label="Admin language">
              <option value="pl">PL</option>
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
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
      {subscriptionDateEditor && (
        <div className="admin-modal-backdrop" onClick={() => setSubscriptionDateEditor(null)}>
          <article className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{t('admin.subscriptionActions.setCustomDates')}</h2>
            <div className="admin-form-grid">
              <AdminField label={t('admin.subscriptions.startDate')}>
                <input type="date" value={subscriptionDateEditor.start} onChange={(event) => setSubscriptionDateEditor({ ...subscriptionDateEditor, start: event.target.value })} />
              </AdminField>
              <AdminField label={t('admin.subscriptions.endDate')}>
                <input type="date" value={subscriptionDateEditor.end} onChange={(event) => setSubscriptionDateEditor({ ...subscriptionDateEditor, end: event.target.value })} />
              </AdminField>
              <AdminField label={t('admin.subscriptions.status')}>
                <select value={subscriptionDateEditor.status} onChange={(event) => setSubscriptionDateEditor({ ...subscriptionDateEditor, status: event.target.value })}>
                  {['requested', 'trial', 'active', 'expired', 'suspended', 'cancelled'].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}
                </select>
              </AdminField>
            </div>
            <AdminField label={t('admin.subscriptions.adminNote')}>
              <textarea placeholder={t('admin.subscriptions.adminNotePlaceholder')} value={subscriptionDateEditor.note} onChange={(event) => setSubscriptionDateEditor({ ...subscriptionDateEditor, note: event.target.value })} />
            </AdminField>
            <div className="admin-actions-row">
              <button className="button primary" onClick={saveSubscriptionDates}>{t('admin.buttons.saveDates')}</button>
              <button className="button" onClick={() => setSubscriptionDateEditor(null)}>{t('admin.buttons.cancel')}</button>
            </div>
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
        ['admin.dashboard.revenueToday', revenueLabel(stats.daily_revenue_eur, t('admin.dashboard.noPaymentsToday'))],
        ['admin.dashboard.revenueThisMonth', revenueLabel(stats.monthly_revenue_eur, t('admin.dashboard.noPaymentsMonth'))],
        ['admin.dashboard.clientActivationRevenue', revenueLabel(stats.client_activation_revenue_eur, t('admin.dashboard.noActivationRevenue'))],
        ['admin.dashboard.clientActivations', stats.client_activation_transactions || clientActivationPayments.length],
        ['admin.dashboard.activatedClients', activatedClients],
        ['admin.dashboard.freeClients', stats.free_clients || 0],
        ['admin.dashboard.activeProfiles', stats.active_profiles || 0],
        ['admin.dashboard.availableProfiles', stats.available_profiles || profiles.filter((profile) => profile.available_now).length],
        ['admin.dashboard.bookingsToday', stats.bookings_today || 0],
        ['admin.dashboard.coinsInCirculation', tokenStats.token_circulation || 0],
        ['admin.dashboard.tokenSales', tokenStats.approved_purchase_value || 0],
        ['admin.dashboard.transactions', (stats.client_activation_transactions || clientActivationPayments.length) + transactions.length],
        ['admin.dashboard.pendingVerification', stats.pending_verification || 0],
        ['admin.dashboard.abuseReports', reports.length]
      ];
      return (
        <>
          <section className="admin-metric-grid">{cards.map(([label, value]) => <AdminStatCard key={String(label)} label={t(String(label))} value={value} />)}</section>
          <section className="admin-chart-grid">
            <article className="admin-card">
              <h2>Recent Revenue Events</h2>
              {revenueEvents.length ? <AdminTable rows={revenueEvents} columns={['date', 'email', 'type', 'amount', 'currency', 'status', 'provider']} labels={tableLabels(t, ['date', 'email', 'type', 'amount', 'currency', 'status', 'provider'])} /> : <EmptyAdminState text={t('admin.dashboard.noPaymentsToday')} />}
            </article>
            <article className="admin-card">
              <h2>Client Activation Funnel</h2>
              <div className="metrics-grid">
                <MetricBlock label={t('admin.dashboard.registeredClients')} value={registeredClients} />
                <MetricBlock label={t('admin.dashboard.activatedClients')} value={activatedClients} />
                <MetricBlock label={t('admin.dashboard.conversion')} value={`${stats.activation_conversion_rate || 0}%`} />
                <MetricBlock label={t('admin.dashboard.revenue')} value={revenueLabel(stats.client_activation_revenue_eur, '0 EUR')} />
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
          <Action onClick={() => setModal({ title: String(user.email), body: JSON.stringify(user, null, 2) })}>{t('admin.actions.view')}</Action>
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
                <h2>{t('admin.profiles.allProfiles')}</h2>
              </div>
              <button className="button primary" disabled={studioSaving} onClick={seedBerlinStudioProfiles}>
                <Crown size={16} /> {t('admin.actions.generateBerlinDemo')}
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
              <input placeholder={t('admin.filters.ownerEmail')} value={studioFilters.owner_email} onChange={(event) => setStudioFilters({ ...studioFilters, owner_email: event.target.value })} />
            </div>
            <div className="admin-bulk-bar">
              <label><input type="checkbox" checked={studioProfiles.length > 0 && selectedProfileIds.length === studioProfiles.length} onChange={(event) => setSelectedProfileIds(event.target.checked ? studioProfiles.map((profile) => profile.id) : [])} /> {t('admin.bulk.selected', { count: selectedProfileIds.length })}</label>
              <Action onClick={() => runBulkAction('approve')}>{t('admin.bulk.approve')}</Action>
              <Action onClick={() => runBulkAction('publish')}>{t('admin.bulk.publish')}</Action>
              <Action onClick={() => runBulkAction('unpublish')}>{t('admin.bulk.unpublish')}</Action>
              <Action onClick={() => runBulkAction('suspend')}>{t('admin.bulk.suspend')}</Action>
              <select value={bulkPremiumTier} onChange={(event) => setBulkPremiumTier(event.target.value)}>{['standard', 'gold', 'elite', 'diamond'].map((tier) => <option key={tier} value={tier}>{t(`admin.status.${tier}`)}</option>)}</select>
              <Action onClick={() => runBulkAction('premium_tier', { premium_tier: bulkPremiumTier })}>{t('admin.bulk.setPremiumTier')}</Action>
              <select value={bulkSubscriptionStatus} onChange={(event) => setBulkSubscriptionStatus(event.target.value)}>{['requested', 'trial', 'active', 'expired', 'suspended', 'cancelled', 'test'].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}</select>
              <Action onClick={() => runBulkAction('subscription_status', { subscription_status: bulkSubscriptionStatus })}>{t('admin.bulk.setSubscriptionStatus')}</Action>
              <Action danger onClick={() => runBulkAction('delete')}>{t('admin.bulk.delete')}</Action>
            </div>
            <div className="profile-studio-table">
              {studioProfiles.map((profile) => {
                const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
                return (
                  <div className="studio-profile-row" key={profile.id}>
                    <input type="checkbox" checked={selectedProfileIds.includes(profile.id)} onChange={() => toggleBulkProfile(profile.id)} aria-label={t('admin.bulk.toggleProfile')} />
                    {image?.public_url ? <img src={image.public_url} alt="" /> : <span>{profile.display_name.slice(0, 1)}</span>}
                    <div role="button" tabIndex={0} onClick={() => openProfileOverview(profile)} onKeyDown={(event) => { if (event.key === 'Enter') openProfileOverview(profile); }}>
                      <strong>{profile.display_name}</strong>
                      <small>{t('admin.profiles.shortId')}: {profile.id.slice(0, 8)} / {t('admin.profiles.owner')}: {profile.owner_email || t('admin.profiles.adminCreated')}</small>
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
                      <Action onClick={() => openProfileOverview(profile)}>{t('admin.actions.view')}</Action>
                      <Action onClick={() => editStudioProfile(profile)}>{t('admin.actions.edit')}</Action>
                      <Action onClick={() => action(() => api.publishAdminProfile(token, profile.id, profile.is_published === false))}>
                        {profile.is_published === false ? t('admin.actions.publish') : t('admin.actions.unpublish')}
                      </Action>
                      <Action onClick={() => action(() => api.setProfileStatus(token, profile.id, profile.status === 'suspended' || profile.moderation_status === 'suspended' ? 'active' : 'suspended'))}>
                        {profile.status === 'suspended' || profile.moderation_status === 'suspended' ? t('admin.actions.unsuspend') : t('admin.actions.suspend')}
                      </Action>
                      <Action onClick={() => action(() => api.setProfileVerification(token, profile.id, profile.verified ? 'pending' : 'verified', profile.moderation_status || 'approved'))}>
                        {profile.verified ? t('admin.actions.unverify') : t('admin.actions.verify')}
                      </Action>
                      <Action onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'approved', is_published: true }))}>{t('admin.actions.approve')}</Action>
                      <Action danger onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'rejected' }))}>{t('admin.actions.reject')}</Action>
                      <Link className="admin-action-btn" to={`/profile/${profile.id}`}>{t('admin.actions.publicView')}</Link>
                      <Link className="admin-action-btn" to="/admin/subscriptions">{t('admin.nav.subscriptions')}</Link>
                      <Action danger onClick={() => action(() => api.deleteAdminProfile(token, profile.id))}>{t('admin.actions.delete')}</Action>
                    </div>
                  </div>
                );
              })}
              {!studioProfiles.length && <EmptyAdminState text={t('admin.profiles.emptyStudio')} />}
            </div>
          </article>

          <article className="admin-card profile-studio-form">
            <div className="profile-studio-head">
              <div>
                <p className="eyebrow">{studioForm.id ? t('admin.profileOverview.title') : t('admin.profiles.createProfile')}</p>
                <h2>{studioForm.id ? studioForm.display_name : t('admin.profiles.newPreviewProfile')}</h2>
              </div>
              {studioForm.id && <button className="button" onClick={() => setStudioForm({ ...emptyStudioForm })}>{t('admin.actions.newProfile')}</button>}
            </div>
            {profilePanelMode === 'overview' && studioForm.id ? renderProfileOverview(selectedProfile) : (
              <>
                <div className="studio-editor-tabs">
                  {studioTabs.map((tab) => (
                    <button key={tab} type="button" className={studioTab === tab ? 'active' : ''} onClick={() => setStudioTab(tab)}>
                      {t(`admin.profileEditor.tabs.${tab}`)}
                    </button>
                  ))}
                </div>
                {renderStudioEditorTab(selectedProfile)}
                <button className="button primary full" disabled={studioSaving} onClick={saveStudioProfile}>{studioSaving ? t('states.loading') : t('admin.actions.saveProfile')}</button>
              </>
            )}
          </article>
        </section>
      );
    }

    if (view === 'profiles') {
      return <AdminTable rows={filteredProfiles} columns={['display_name', 'user_id', 'city', 'category', 'status', 'verification_status', 'moderation_status', 'availability_status', 'primary_phone', 'phone_conflict_status', 'created_at']} format={(key, value) => key === 'category' ? option(String(value || 'other')) : value} actions={(profile) => (
        <>
          <Action onClick={() => setModal({ title: profile.display_name, body: JSON.stringify(profile, null, 2) })}>{t('admin.actions.view')}</Action>
          <Action onClick={() => action(() => api.setProfileStatus(token, profile.id, 'active'))}>{t('admin.actions.approve')}</Action>
          <Action onClick={() => action(() => api.setProfileVerification(token, profile.id, 'verified'))}>Verify</Action>
          <Action danger onClick={() => action(() => api.setProfileVerification(token, profile.id, profile.verification_status || 'pending', 'suspended'))}>Suspend</Action>
          <Action danger onClick={() => action(() => api.setProfilePromotion(token, profile.id, { days: 1, shadowbanned: true }))}>Shadowban</Action>
          <Action onClick={() => action(() => api.setProfilePromotion(token, profile.id, { days: 7, shadowbanned: false }))}>Promote</Action>
          <Link className="admin-action-btn" to={`/profile/${profile.id}`}>Public</Link>
        </>
      )} />;
    }

    if (view === 'moderation') {
      const queueProfiles = moderationQueues[moderationFilter] || [];
      return (
        <>
          <section className="admin-metric-grid">
            {(['pending', 'reported', 'suspended', 'rejected'] as const).map((status) => (
              <button key={status} className={moderationFilter === status ? 'admin-card stat active-filter' : 'admin-card stat'} onClick={() => setModerationFilter(status)}>
                <span>{t(`admin.moderation.queues.${status}`)}</span>
                <strong>{moderationQueues[status]?.length || 0}</strong>
              </button>
            ))}
          </section>
          <div className="admin-list-table">
            {queueProfiles.map((profile) => {
              const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
              return (
                <article className="studio-profile-row" key={profile.id}>
                  {image?.public_url ? <img src={image.public_url} alt="" /> : <span>{profile.display_name.slice(0, 1)}</span>}
                  <div>
                    <strong>{profile.display_name}</strong>
                    <small>{profile.owner_email || t('admin.noEmail')} / {profile.city} / {profile.updated_at || profile.created_at || '-'}</small>
                    <div className="studio-badges">
                      <i>{profile.moderation_status || 'pending'}</i>
                      <i>{t('admin.reports.count', { count: Number((profile as any).report_count || 0) })}</i>
                      <i>{profile.is_published !== false ? t('admin.status.published') : t('admin.status.unpublished')}</i>
                    </div>
                  </div>
                  <div className="admin-actions-row">
                    <Action onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'approved', is_published: true }))}>{t('admin.actions.approve')}</Action>
                    <Action danger onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'rejected' }))}>{t('admin.actions.reject')}</Action>
                    <Action onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: profile.moderation_status === 'suspended' ? 'approved' : 'suspended' }))}>{profile.moderation_status === 'suspended' ? t('admin.actions.unsuspend') : t('admin.actions.suspend')}</Action>
                    <Action onClick={() => action(() => api.publishAdminProfile(token, profile.id, profile.is_published === false))}>{profile.is_published === false ? t('admin.actions.publish') : t('admin.actions.unpublish')}</Action>
                    <Action onClick={() => setModal({ title: t('admin.moderation.note'), body: profile.moderation_note || '-' })}>{t('admin.moderation.note')}</Action>
                    <Link className="admin-action-btn" to={`/profile/${profile.id}`}>{t('admin.actions.publicView')}</Link>
                    <Action onClick={() => openProfileOverview(profile)}>{t('admin.actions.edit')}</Action>
                  </div>
                </article>
              );
            })}
            {!queueProfiles.length && <EmptyAdminState text={t('admin.moderation.empty')} />}
          </div>
        </>
      );
    }

    if (view === 'subscriptions') {
      const cards = [
        ['admin.subscriptions.stats.requested', subscriptionStats.requested || 0],
        ['admin.subscriptions.stats.trial', subscriptionStats.trial || subscriptions.filter((row) => row.status === 'trial').length],
        ['admin.subscriptions.stats.active', subscriptionStats.active || 0],
        ['admin.subscriptions.stats.expired', subscriptionStats.expired || 0],
        ['admin.subscriptions.stats.suspended', subscriptionStats.suspended || subscriptions.filter((row) => row.status === 'suspended').length],
        ['admin.subscriptions.stats.incomplete', subscriptionStats.incomplete || 0],
        ['admin.subscriptions.stats.monthlyRevenue', `${Number(subscriptionStats.monthly_revenue || 0).toFixed(2)} EUR`],
        ['admin.subscriptions.stats.clientActivations', subscriptionStats.client_activations_099 || 0],
        ['admin.subscriptions.stats.escortPremium', subscriptionStats.escort_subscriptions || 0],
        ['admin.subscriptions.stats.businessPremium', subscriptionStats.business_subscriptions || subscriptions.filter((row) => ['business', 'agency', 'club', 'massage_salon', 'live_cam'].includes(String(row.role))).length]
      ];
      const subscriptionLabels = tableLabels(t, ['profile', 'email', 'role', 'plan', 'status', 'provider', 'start', 'end', 'progress', 'amount']);
      return (
        <>
          <section className="admin-metric-grid">{cards.map(([label, value]) => <AdminStatCard key={String(label)} label={t(String(label))} value={value} />)}</section>
          <AdminTable rows={subscriptions} columns={['profile', 'email', 'role', 'plan', 'status', 'payment_provider', 'start', 'end', 'progress', 'amount_eur']} labels={{ ...subscriptionLabels, payment_provider: t('admin.table.provider'), amount_eur: t('admin.table.amount') }} format={(key, value, row) => {
            if (key === 'progress') return <SubscriptionProgressCell row={row} t={t} />;
            if (key === 'amount_eur') return `${Number(value || 0).toFixed(2)} ${row.currency || 'EUR'}`;
            if (key === 'status') return t(`admin.status.${String(value || 'requested')}`);
            return value;
          }} actions={(row) => (
            <>
              {row.type === 'profile_subscription' ? (
                <>
                  <Action onClick={() => action(() => api.activateAdminSubscription(token, String(row.profile_id || row.id), { plan: row.plan || 'escort_monthly', days: 30 }).then(() => setMessage(t('admin.messages.subscriptionActivated'))))}>{t('admin.subscriptionActions.activate30')}</Action>
                  <Action onClick={() => action(() => api.extendAdminSubscription(token, String(row.profile_id || row.id), 7).then(() => setMessage(t('admin.messages.subscriptionExtended'))))}>{t('admin.subscriptionActions.extend7')}</Action>
                  <Action onClick={() => action(() => api.extendAdminSubscription(token, String(row.profile_id || row.id), 30).then(() => setMessage(t('admin.messages.subscriptionExtended'))))}>{t('admin.subscriptionActions.extend30')}</Action>
                  <Action onClick={() => openSubscriptionDateEditor(row)}>{t('admin.subscriptionActions.setCustomDates')}</Action>
                  <Action danger onClick={() => action(() => api.expireAdminSubscription(token, String(row.profile_id || row.id)).then(() => setMessage(t('admin.messages.subscriptionExpired'))))}>{t('admin.subscriptionActions.expire')}</Action>
                  <Action danger onClick={() => action(() => api.cancelAdminSubscription(token, String(row.profile_id || row.id)).then(() => setMessage(t('admin.messages.subscriptionCancelled'))))}>{t('admin.subscriptionActions.cancel')}</Action>
                  {row.profile_id && <Link className="admin-action-btn" to={`/profile/${row.profile_id}`}>{t('admin.table.profile')}</Link>}
                  {row.user_id && <Link className="admin-action-btn" to="/admin/users">{t('admin.table.user')}</Link>}
                </>
              ) : (
                <Action onClick={() => setModal({ title: String(row.email || row.id), body: JSON.stringify(row, null, 2) })}>{t('admin.actions.view')}</Action>
              )}
            </>
          )} />
        </>
      );
    }

    if (view === 'revenue') {
      const cards = [
        ['Today revenue', `${Number(revenueStats.today_revenue || 0).toFixed(2)} EUR`],
        ['Monthly revenue', `${Number(revenueStats.monthly_revenue || 0).toFixed(2)} EUR`],
        ['Client activations', revenueStats.client_activations || 0],
        ['Escort subscriptions', revenueStats.escort_subscriptions || 0],
        ['Business subscriptions', revenueStats.business_subscriptions || 0],
        ['admin.revenue.expiredSubscriptions', revenueStats.expired_subscriptions || 0],
        ['Upcoming renewals', revenueStats.upcoming_renewals || 0]
      ];
      return (
        <>
          <section className="admin-metric-grid">{cards.map(([label, value]) => <AdminStatCard key={label} label={String(label)} value={value} />)}</section>
          <AdminTable rows={revenuePayments} columns={['id', 'email', 'profile', 'amount', 'currency', 'provider', 'status', 'created_at']} />
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
              <Action onClick={() => action(() => api.setPurchaseRequestStatus(token, purchase.id, 'approved'))}>{t('admin.actions.approve')}</Action>
              <Action danger onClick={() => action(() => api.setPurchaseRequestStatus(token, purchase.id, 'failed'))}>{t('admin.actions.reject')}</Action>
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
        <Action onClick={() => setModal({ title: String(row.referral_code), body: JSON.stringify(row, null, 2) })}>{t('admin.actions.view')}</Action>
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
          <Action onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'approved'))}>{t('admin.actions.approve')}</Action>
          <Action danger onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'rejected'))}>{t('admin.actions.reject')}</Action>
          <Action danger onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'blocked'))}>Block</Action>
        </>
      )} />;
    }

    if (view === 'reports') {
      return <AdminTable rows={reports} columns={['id', 'profile_id', 'reporter_email', 'reason', 'message', 'admin_status', 'created_at']} actions={(report) => (
        <>
          <Action onClick={() => action(() => api.updateAdminReport(token, report.id, { admin_status: 'investigating' }))}>{t('admin.reportStatus.investigating')}</Action>
          <Action onClick={() => action(() => api.updateAdminReport(token, report.id, { admin_status: 'resolved' }))}>{t('admin.reportStatus.resolved')}</Action>
          <Action danger onClick={() => action(() => api.updateAdminReport(token, report.id, { admin_status: 'rejected' }))}>{t('admin.reportStatus.rejected')}</Action>
          <Action danger onClick={() => action(() => api.updateAdminReport(token, report.id, { admin_status: 'investigating', suspend_profile: true, admin_note: 'Suspended from Reports Center' }))}>{t('admin.reports.suspendProfile')}</Action>
          <Link className="admin-action-btn" to={`/profile/${report.profile_id}`}>{t('admin.actions.publicView')}</Link>
          <Action onClick={() => setModal({ title: report.reason, body: JSON.stringify(report, null, 2) })}>{t('admin.reports.internalNote')}</Action>
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
      return <AdminTable rows={activity} columns={['created_at', 'admin_email', 'action', 'entity_type', 'entity_id', 'note']} actions={(row) => (
        <Action onClick={() => setModal({ title: row.action, body: JSON.stringify(row, null, 2) })}>{t('admin.actions.view')}</Action>
      )} />;
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

function sortAdminImages<T extends { is_cover?: boolean; is_primary?: boolean; sort_order?: number; created_at?: string }>(images: T[]) {
  return [...images].sort((left, right) => {
    const leftCover = Boolean(left.is_cover || left.is_primary);
    const rightCover = Boolean(right.is_cover || right.is_primary);
    if (leftCover !== rightCover) return leftCover ? -1 : 1;
    const sortDiff = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    if (sortDiff !== 0) return sortDiff;
    return new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime();
  });
}

function adminImageSrc(image: NonNullable<Profile['profile_images']>[number]) {
  return image.public_url || image.image_url || image.url || '';
}

function AdminStatCard({ label, value }: { label: string; value: unknown }) {
  return <article className="admin-card stat"><span>{label}</span><strong>{String(value ?? 0)}</strong></article>;
}

function MetricBlock({ label, value }: { label: string; value: unknown }) {
  return <div className="metric"><span>{label}</span><strong>{String(value ?? 0)}</strong></div>;
}

function AdminField({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

function EmptyAdminState({ text }: { text: string }) {
  return <p className="muted">{text}</p>;
}

function SubscriptionProgressCell({ row, t }: { row: SubscriptionRow; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const start = readSubscriptionStart(row);
  const end = readSubscriptionEnd(row);
  const info = subscriptionProgressInfo(start, end);
  if (info.state === 'inactive') {
    return (
      <div className="subscription-progress inactive">
        <span>{t('admin.subscriptions.timerInactive')}</span>
        <div><i style={{ width: '0%' }} /></div>
        <small>{t('admin.subscriptions.progressPercent', { percent: 0 })}</small>
      </div>
    );
  }

  return (
    <div className={`subscription-progress ${info.state}`}>
      <span>{info.daysLeft > 0 ? t('admin.subscriptions.daysLeftValue', { count: info.daysLeft }) : t('admin.status.expired')}</span>
      <div><i style={{ width: `${info.percent}%` }} /></div>
      <small>
        {t('admin.subscriptions.progressPercent', { percent: info.percent })} / {formatDateInput(start) || '-'} - {formatDateInput(end) || '-'}
      </small>
    </div>
  );
}

function revenueLabel(value: unknown, emptyText: string) {
  const numeric = Number(value || 0);
  return numeric > 0 ? `${numeric.toFixed(2)} EUR` : emptyText;
}

function daysLeft(value: unknown) {
  if (!value) return '-';
  const end = new Date(String(value)).getTime();
  if (!Number.isFinite(end)) return '-';
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

function tableLabels(t: (key: string, vars?: Record<string, string | number>) => string, columns: string[]) {
  return columns.reduce<Record<string, string>>((labels, column) => {
    labels[column] = t(`admin.table.${column}`);
    return labels;
  }, { actions: t('admin.table.actions') });
}

function formatDateInput(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function readSubscriptionStart(row: Record<string, unknown>) {
  return row.subscription_start || row.current_period_start || row.start_at || row.started_at || row.start || null;
}

function readSubscriptionEnd(row: Record<string, unknown>) {
  return row.subscription_end || row.current_period_end || row.end_at || row.expires_at || row.end || null;
}

function subscriptionProgressInfo(startValue: unknown, endValue: unknown) {
  const start = startValue ? new Date(String(startValue)).getTime() : NaN;
  const end = endValue ? new Date(String(endValue)).getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { totalDays: 0, daysUsed: 0, daysLeft: 0, percent: 0, state: 'inactive' };
  }
  const now = Date.now();
  const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));
  if (now < start) return { totalDays, daysUsed: 0, daysLeft: Math.ceil((end - now) / 86400000), percent: 0, state: 'future' };
  const daysUsed = Math.max(0, Math.ceil((Math.min(now, end) - start) / 86400000));
  const left = Math.max(0, Math.ceil((end - now) / 86400000));
  const percent = Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
  const state = now >= end ? 'expired' : left < 3 ? 'ending' : 'active';
  return { totalDays, daysUsed, daysLeft: left, percent, state };
}

function ChartPlaceholder({ title }: { title: string }) {
  return <article className="admin-card chart"><h2>{title}</h2><div className="chart-bars">{[42, 68, 51, 78, 62, 88, 74].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div></article>;
}

function AdminTable<T extends Record<string, any>>({ rows, columns, actions, format, labels }: { rows: T[]; columns: string[]; actions?: (row: T) => ReactNode; format?: (key: string, value: unknown, row: T) => unknown; labels?: Record<string, string> }) {
  return (
    <section className="admin-table-card">
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr>{columns.map((column) => <th key={column}>{labels?.[column] || column}</th>)}{actions && <th>{labels?.actions || 'Actions'}</th>}</tr></thead>
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
  if (isValidElement(value)) return value;
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
