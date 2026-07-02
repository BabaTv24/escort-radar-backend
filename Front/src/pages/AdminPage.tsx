import { isValidElement, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Ban, BarChart3, Bell, Camera, ChevronRight, Coins, Crown, Eye, Mail, MessageSquare, Pencil, Power, RefreshCw, Settings, Shield, Sparkles, Trash2, Upload, UserCheck, UserX, Users, WalletCards } from 'lucide-react';
import { api } from '../lib/api';
import { WorkPointMap } from '../components/WorkPointMap';
import type { AdminActivity, AdminReport, BookingRequest, MasterAdminWallet, Profile, Tag, TokenPurchaseRequest, TokenTransaction, Wallet } from '../types';
import { useI18n } from '../i18n';
import { categoryOptions } from '../data/filterOptions';
import { serviceOptions, serviceLabel } from '../data/serviceCatalog';
import { getCitiesForCountry, getCountryByNameOrCode, getDistrictsForCity, getLegacyCitySlug, locationCatalog, normalizeLocationValue } from '../data/locationCatalog';
import { berlinDistrictOptions, resolveBerlinPostalDistrict } from '../lib/geo';
import {
  normalizeProfileEthnicity,
  normalizeProfileGender,
  normalizeProfileOrientation,
  normalizeProfileTravels,
  profileEthnicityOptions,
  profileGenderOptions,
  profileOrientationOptions,
  profileTravelsLabel,
  showMaleProfileFields
} from '../lib/profileDetails';

type AdminUser = Record<string, any>;
type SubscriptionRow = Record<string, any>;
type AdminClient = Record<string, any>;
const adminTokenStorageKey = 'escort-radar-admin-token';
const adminEmailStorageKey = 'escortRadarAdminEmail';
const serviceCategories = ['all', ...Array.from(new Set(serviceOptions.map((service) => service.category)))];
const studioTabs = ['account', 'basic', 'location', 'business', 'prices', 'status', 'services', 'subscription', 'moderation', 'photos'] as const;
const adminAccountTypeOptions = ['client', 'advertiser', 'business', 'admin'];
const adminProfileTypeOptions = ['independent', 'agency', 'massage_salon', 'club', 'live_cam', 'couple', 'trans', 'gay', 'male_escort', 'other'];
const exposurePackageOptions = ['standard', 'gold', 'elite', 'diamond'];
const adminAvailabilityStatusOptions = ['ONLINE_NOW', 'AVAILABLE_TODAY', 'BUSY', 'APPOINTMENT_ONLY', 'TRAVELING', 'OFFLINE'];
const emptyStudioForm = {
  id: '',
  owner_email: '',
  password: '',
  confirm_password: '',
  starter_package: 'trial_30',
  phone: '',
  whatsapp: '',
  telegram: '',
  account_type: 'advertiser',
  profile_type: 'independent',
  display_name: '',
  category: 'ladies',
  city: 'berlin',
  area: 'Mitte',
  work_country: 'DE',
  work_city: 'Berlin',
  work_area: 'Mitte',
  postal_code: '',
  work_place_label: '',
  latitude: '',
  longitude: '',
  location_mode: 'city_only',
  location_visibility: 'postal_area',
  service_radius_km: 25,
  gender: '',
  orientation: '',
  travels: false,
  penis_length_cm: '',
  penis_diameter_cm: '',
  age: 26,
  nationality: 'European',
  height_cm: 170,
  weight_kg: '',
  bust: '',
  eyes: '',
  hair: '',
  travel: '',
  ethnicity: '',
  zodiac_sign: '',
  languages: ['DE', 'EN'],
  business_name: '',
  business_type: '',
  business_id: '',
  business_phone: '',
  exact_address: '',
  max_profiles: 30,
  contact_person: '',
  website: '',
  opening_hours: '',
  price_30min: 120,
  price_1h: 180,
  price_2h: 320,
  price_3h: 450,
  price_night: 900,
  currency: 'EUR',
  operator_status: 'AVAILABLE_TODAY',
  availability_status: 'available',
  services: ['towarzystwo', 'dyskrecja'],
  service_pricing: {},
  description: '',
  verified: true,
  premium_tier: 'gold',
  is_seed_profile: false,
  is_sponsored: true,
  acquisition_source: 'admin_sponsored',
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
    title: 'PRZEGLAD',
    items: [
      ['dashboard', '/admin', BarChart3, 'admin.nav.dashboard'],
      ['clients', '/admin/clients', Users, 'admin.nav.clients'],
      ['profiles', '/admin/profiles', Crown, 'admin.nav.profiles'],
      ['subscriptions', '/admin/subscriptions', Coins, 'admin.nav.subscriptions'],
      ['revenue', '/admin/revenue', BarChart3, 'admin.nav.revenue'],
      ['payments', '/admin/payments', WalletCards, 'admin.nav.transactions'],
      ['manual-payment-orders', '/admin/manual-payment-orders', WalletCards, 'admin.nav.manualPaymentOrders']
    ]
  },
  {
    title: 'TRESCI',
    items: [
      ['photos', '/admin/photos', Camera, 'admin.nav.photos'],
      ['moderation', '/admin/moderation', Shield, 'admin.nav.moderation'],
      ['reports', '/admin/reports', Ban, 'admin.nav.reports'],
      ['profile-studio', '/admin/profile-studio', Sparkles, 'admin.nav.sponsoredProfiles']
    ]
  },
  {
    title: 'KOMUNIKACJA',
    items: [
      ['chat-manager', '/admin/chat-manager', MessageSquare, 'admin.nav.chat'],
      ['push', '/admin/push', Bell, 'admin.nav.notifications'],
      ['email-center', '/admin/email-center', Mail, 'admin.nav.email']
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      ['settings', '/admin/settings', Settings, 'admin.nav.settings']
    ]
  }
] as const;

type LocationCatalogRow = {
  id?: string;
  country_code: string;
  country_name: string;
  city: string;
  district?: string | null;
  postal_code?: string | null;
  is_active?: boolean;
  sort_order?: number;
};

export function AdminPage() {
  const [email, setEmail] = useState(() => localStorage.getItem(adminEmailStorageKey) || '');
  const [password, setPassword] = useState('');
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(localStorage.getItem(adminEmailStorageKey)));
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
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [clientFilters, setClientFilters] = useState({ search: '', status: 'all', sort: 'registered_at', direction: 'desc', page: 1, page_size: 25 });
  const [bigbabaClient, setBigbabaClient] = useState<AdminClient | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [moderationQueues, setModerationQueues] = useState<Record<string, Profile[]>>({});
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [clientActivationPayments, setClientActivationPayments] = useState<Record<string, any>[]>([]);
  const [manualPaymentOrders, setManualPaymentOrders] = useState<Record<string, any>[]>([]);
  const [manualPaymentFilters, setManualPaymentFilters] = useState({ query: '', provider: 'all', status: 'all' });
  const [purchases, setPurchases] = useState<TokenPurchaseRequest[]>([]);
  const [masterWallets, setMasterWallets] = useState<MasterAdminWallet[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [photos, setPhotos] = useState<Record<string, any>[]>([]);
  const [photoFilters, setPhotoFilters] = useState({ status: 'all', query: '', type: 'all' });
  const [photoPreview, setPhotoPreview] = useState<Record<string, any> | null>(null);
  const [clientReferrals, setClientReferrals] = useState<Record<string, any>[]>([]);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [revenueEvents, setRevenueEvents] = useState<Record<string, any>[]>([]);
  const [revenueStats, setRevenueStats] = useState<Record<string, number>>({});
  const [revenuePayments, setRevenuePayments] = useState<Record<string, any>[]>([]);
  const [topCities, setTopCities] = useState<Record<string, any>[]>([]);
  const [topCategories, setTopCategories] = useState<Record<string, any>[]>([]);
  const [topProfiles, setTopProfiles] = useState<Record<string, any>[]>([]);
  const [adminLocationRows, setAdminLocationRows] = useState<LocationCatalogRow[]>([]);
  const [accountAccessLink, setAccountAccessLink] = useState('');
  const [accountEmailBody, setAccountEmailBody] = useState('');
  const [accountSecurity, setAccountSecurity] = useState<Record<string, any> | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState<'create' | 'temp' | 'magic' | 'reset' | 'send-login' | 'send-reset' | 'security' | ''>('');
  const [profileImportFile, setProfileImportFile] = useState<File | null>(null);
  const [profileImportReport, setProfileImportReport] = useState<{ created: number; skipped: number; failed: number; errors: Array<{ row: number; email?: string; error: string }> } | null>(null);
  const [newLocationRow, setNewLocationRow] = useState<LocationCatalogRow>({
    country_code: 'DE',
    country_name: 'Germany',
    city: 'Berlin',
    district: '',
    postal_code: '',
    is_active: true,
    sort_order: 0
  });
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
  const [adminPlaceQuery, setAdminPlaceQuery] = useState('');
  const [adminPlaceSuggestions, setAdminPlaceSuggestions] = useState<Record<string, any>[]>([]);
  const [adminPlaceLoading, setAdminPlaceLoading] = useState(false);
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
  const adminSearchParams = new URLSearchParams(location.search);
  const selectedProfileQueryId = adminSearchParams.get('profile') || '';
  const profileReturnSource = adminSearchParams.get('from') === 'subscriptions' ? 'subscriptions' : 'profiles';
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
        setMessage(adminError instanceof Error ? adminError.message : t('admin.login.noAccess'));
        return undefined;
      });
      if (!active) return;

      if (!adminCheck?.admin) {
        setToken('');
        setUser(null);
        setAdmin(null);
        setMessage(t('admin.login.noAccess'));
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
      const message = sessionError instanceof Error ? sessionError.message : t('admin.login.noAccess');
      setMessage(message);
      setAuthRestoring(false);
      console.log('AUTH RESTORE END');
      navigate('/admin/login', { replace: true });
    });

    return () => {
      active = false;
    };
  }, [isLoginRoute, navigate, t]);

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
        setMessage(t('admin.login.noAccess'));
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
      if (rememberEmail) {
        localStorage.setItem(adminEmailStorageKey, email.trim());
      } else {
        localStorage.removeItem(adminEmailStorageKey);
      }
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
        clientsResult,
        usersResult,
        profileResult,
        subscriptionResult,
        reportResult,
        bookingResult,
        walletResult,
        transactionResult,
        clientActivationPaymentResult,
        manualPaymentOrderResult,
        purchaseResult,
        masterResult,
        tagResult,
        photoResult,
        clientReferralResult,
        moderationResult,
        activityLogResult,
        revenueResult,
        locationCatalogResult
      ] = await Promise.allSettled([
        adminLoadRequest('adminStats', api.adminStats(accessToken)),
        adminLoadRequest('adminTokenStats', api.adminTokenStats(accessToken)),
        adminLoadRequest('adminClients', api.adminClients(accessToken, clientQueryString(clientFilters))),
        adminLoadRequest('adminUsers', api.adminUsers(accessToken)),
        adminLoadRequest('adminProfiles', api.adminProfiles(accessToken)),
        adminLoadRequest('adminSubscriptions', api.adminSubscriptions(accessToken)),
        adminLoadRequest('adminReports', api.adminReports(accessToken)),
        adminLoadRequest('adminBookings', api.adminBookings(accessToken)),
        adminLoadRequest('adminWallets', api.adminWallets(accessToken)),
        adminLoadRequest('adminTokenTransactions', api.adminTokenTransactions(accessToken)),
        adminLoadRequest('adminClientActivationPayments', api.adminClientActivationPayments(accessToken)),
        adminLoadRequest('adminManualPaymentOrders', api.adminManualPaymentOrders(accessToken)),
        adminLoadRequest('adminPurchaseRequests', api.adminPurchaseRequests(accessToken)),
        adminLoadRequest('adminMasterWallets', api.adminMasterWallets(accessToken)),
        adminLoadRequest('adminTags', api.adminTags(accessToken)),
        adminLoadRequest('adminPhotos', api.adminPhotos(accessToken)),
        adminLoadRequest('adminClientReferrals', api.adminClientReferrals(accessToken)),
        adminLoadRequest('adminModeration', api.adminModeration(accessToken)),
        adminLoadRequest('adminActivityLogs', api.adminActivityLogs(accessToken)),
        adminLoadRequest('adminRevenue', api.adminRevenue(accessToken)),
        adminLoadRequest('adminLocationCatalog', api.adminLocationCatalog(accessToken))
      ]);

      const statsData = settledValue(statsResult, { stats: {}, latest_activity: [], revenue_events: [], top_cities: [], top_categories: [], top_profiles: [] }, 'adminStats');
      const tokenData = settledValue(tokenResult, { stats: {} }, 'adminTokenStats');
      const clientsData = settledValue(clientsResult, { clients: [], total: 0, page: 1, page_size: 25, bigbaba: null }, 'adminClients');
      const usersData = settledValue(usersResult, { users: [] }, 'adminUsers');
      const profileData = settledValue(profileResult, { stats: {}, profiles: [] }, 'adminProfiles');
      const subscriptionData = settledValue(subscriptionResult, { subscriptions: [] }, 'adminSubscriptions');
      const reportData = settledValue(reportResult, { reports: [], reports_count: 0 }, 'adminReports');
      const bookingData = settledValue(bookingResult, { booking_requests: [] }, 'adminBookings');
      const walletData = settledValue(walletResult, { wallets: [] }, 'adminWallets');
      const transactionData = settledValue(transactionResult, { transactions: [] }, 'adminTokenTransactions');
      const clientActivationPaymentData = settledValue(clientActivationPaymentResult, { client_activation_payments: [] }, 'adminClientActivationPayments');
      const manualPaymentOrderData = settledValue(manualPaymentOrderResult, { orders: [] }, 'adminManualPaymentOrders');
      const purchaseData = settledValue(purchaseResult, { purchase_requests: [] }, 'adminPurchaseRequests');
      const masterData = settledValue(masterResult, { master_wallets: [] }, 'adminMasterWallets');
      const tagData = settledValue(tagResult, { tags: [] }, 'adminTags');
      const photoData = settledValue(photoResult, { photos: [] }, 'adminPhotos');
      const clientReferralData = settledValue(clientReferralResult, { referrals: [] }, 'adminClientReferrals');
      const moderationData = settledValue(moderationResult, { profiles: [], queues: {} }, 'adminModeration');
      const activityLogData = settledValue(activityLogResult, { activity_logs: [] }, 'adminActivityLogs');
      const revenueData = settledValue(revenueResult, { stats: {}, payments: [] }, 'adminRevenue');
      const adminLocationData = settledValue(locationCatalogResult, { locations: [] }, 'adminLocationCatalog');

      setStats({ ...statsData.stats, ...profileData.stats, reports: reportData.reports_count, bookings: bookingData.booking_requests.length });
      setTokenStats(tokenData.stats);
      setClients((clientsData.clients || []) as AdminClient[]);
      setClientsTotal(Number(clientsData.total || 0));
      setBigbabaClient((clientsData.bigbaba || null) as AdminClient | null);
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
      setManualPaymentOrders(manualPaymentOrderData.orders as Record<string, any>[]);
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
      setAdminLocationRows((adminLocationData.locations || []) as LocationCatalogRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || view !== 'clients') return;
    void load(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilters.search, clientFilters.status, clientFilters.sort, clientFilters.direction, clientFilters.page, clientFilters.page_size, token, view]);

  useEffect(() => {
    if (!selectedProfileQueryId || !['profiles', 'profile-studio'].includes(view) || !profiles.length) return;
    const profile = profiles.find((item) => item.id === selectedProfileQueryId);
    if (!profile || studioForm.id === profile.id) return;
    editStudioProfile(profile);
    setProfilePanelMode('overview');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileQueryId, view, profiles]);

  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
      setLoading(false);
    }
  }

  async function openClientDetails(client: AdminClient) {
    await action(async () => {
      const details = await api.adminClient(token, String(client.id));
      setModal({ title: String(client.email || client.id), body: JSON.stringify(details, null, 2) });
    });
  }

  async function adjustClientCoins(client: AdminClient, amount: number) {
    await action(() => api.adjustAdminClientCoins(token, String(client.id), amount, amount > 0 ? 'Admin client credit' : 'Admin client debit'));
  }

  function editStudioProfile(profile: Profile) {
    setStudioForm({
      id: profile.id,
      owner_email: profile.owner_email || '',
      password: '',
      confirm_password: '',
      starter_package: profile.subscription_status === 'active' ? 'premium_30' : profile.subscription_status === 'free' ? 'free' : 'trial_30',
      phone: profile.phone || profile.primary_phone || '',
      whatsapp: profile.whatsapp || '',
      telegram: profile.telegram || '',
      account_type: adminAccountTypeToUi(profile.account_type),
      profile_type: adminProfileTypeToUi(profile.profile_type),
      display_name: profile.display_name || '',
      category: profile.category || 'ladies',
      city: profile.city || 'berlin',
      area: profile.area || profile.work_area || '',
      work_country: profile.work_country || 'DE',
      work_city: profile.work_city || profile.city || '',
      work_area: profile.work_area || profile.area || '',
      postal_code: profile.postal_code || '',
      work_place_label: profile.work_place_label || '',
      latitude: profile.latitude === null || profile.latitude === undefined ? '' : String(profile.latitude),
      longitude: profile.longitude === null || profile.longitude === undefined ? '' : String(profile.longitude),
      location_mode: profile.location_mode || 'city_only',
      location_visibility: profile.location_visibility || getAdminLocationChoice(profile),
      service_radius_km: profile.service_radius_km || 25,
      gender: normalizeProfileGender(profile.gender) || profile.gender || '',
      orientation: normalizeProfileOrientation(profile.orientation) || profile.orientation || '',
      travels: normalizeProfileTravels(profile.travels ?? profile.travel) ?? false,
      penis_length_cm: profile.penis_length_cm === null || profile.penis_length_cm === undefined ? '' : String(profile.penis_length_cm),
      penis_diameter_cm: profile.penis_diameter_cm === null || profile.penis_diameter_cm === undefined ? '' : String(profile.penis_diameter_cm),
      age: profile.age || 26,
      nationality: profile.nationality || 'European',
      height_cm: profile.height_cm || profile.height || 170,
      weight_kg: profile.weight_kg ? String(profile.weight_kg) : '',
      bust: profile.bust || '',
      eyes: profile.eyes || '',
      hair: profile.hair || '',
      travel: profile.travel || '',
      ethnicity: normalizeProfileEthnicity(profile.ethnicity) || profile.ethnicity || '',
      zodiac_sign: profile.zodiac_sign || '',
      languages: profile.languages?.length ? profile.languages : ['DE', 'EN'],
      business_name: profile.business_name || '',
      business_type: profile.business_type || '',
      business_id: profile.business_id || '',
      business_phone: profile.business_phone || profile.primary_phone || '',
      exact_address: profile.exact_address || '',
      max_profiles: Number(profile.max_profiles || 30),
      contact_person: profile.contact_person || '',
      website: profile.website || '',
      opening_hours: typeof profile.opening_hours === 'string' ? profile.opening_hours : String((profile.opening_hours as any)?.note || ''),
      price_30min: Number(profile.price_30min || 0),
      price_1h: Number(profile.price_1h || 180),
      price_2h: Number(profile.price_2h || 0),
      price_3h: Number(profile.price_3h || 0),
      price_night: Number(profile.price_night || 0),
      currency: profile.currency || profile.listing_currency || 'EUR',
      operator_status: profile.operator_status || 'AVAILABLE_TODAY',
      availability_status: profile.availability_status || 'available',
      services: profile.services?.length ? profile.services : ['towarzystwo', 'dyskrecja'],
      service_pricing: profile.service_pricing || {},
      description: profile.description || '',
      verified: profile.verified !== false,
      premium_tier: profile.premium_tier || 'gold',
      is_seed_profile: Boolean(profile.is_seed_profile),
      is_sponsored: Boolean(profile.is_sponsored || profile.acquisition_source === 'admin_sponsored' || profile.provider === 'manual_admin'),
      acquisition_source: profile.acquisition_source || (profile.is_sponsored ? 'admin_sponsored' : 'paid_advertiser'),
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
    setAccountAccessLink('');
    setAccountEmailBody('');
    setAccountSecurity(null);
    setAccountActionLoading('');
  }

  function openProfileOverview(profile: Profile, from: 'profiles' | 'subscriptions' = 'profiles') {
    navigate(`/admin/profiles?profile=${encodeURIComponent(profile.id)}${from === 'subscriptions' ? '&from=subscriptions' : ''}`, { replace: false });
    editStudioProfile(profile);
    setProfilePanelMode('overview');
  }

  function returnFromProfileOverview() {
    if (profileReturnSource === 'subscriptions') {
      navigate('/admin/subscriptions');
      return;
    }
    setStudioForm({ ...emptyStudioForm });
    setProfilePanelMode('overview');
    navigate('/admin/profiles');
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
    if (!studioForm.id && studioForm.password !== studioForm.confirm_password) {
      setMessage(t('admin.accounts.passwordsDoNotMatch'));
      return;
    }
    setStudioSaving(true);
    setMessage('');
    try {
      const { password, confirm_password, ...studioProfileFields } = studioForm;
      const body = {
        ...studioProfileFields,
        ...(!studioForm.id ? { password, confirm_password } : {}),
        account_type: adminAccountTypeToBackend(studioForm.account_type),
        profile_type: adminProfileTypeToBackend(studioForm.profile_type),
        height: studioForm.height_cm,
        languages: Array.isArray(studioForm.languages) ? studioForm.languages : String(studioForm.languages || '').split(',').map((item) => item.trim()).filter(Boolean),
        opening_hours: studioForm.opening_hours ? { note: studioForm.opening_hours } : {},
        price_1h: Number(studioForm.price_1h || 0),
        price_30min: Number(studioForm.price_30min || 0),
        price_2h: Number(studioForm.price_2h || 0),
        price_3h: Number(studioForm.price_3h || 0),
        price_night: Number(studioForm.price_night || 0),
        service_pricing: filterServicePricing(studioForm.service_pricing, studioForm.services),
        age: Number(studioForm.age || 0),
        height_cm: Number(studioForm.height_cm || 0),
        weight_kg: studioForm.weight_kg === '' ? null : Number(studioForm.weight_kg),
        travels: Boolean(studioForm.travels),
        travel: studioForm.travels ? 'yes' : 'no',
        penis_length_cm: studioForm.penis_length_cm === '' ? null : Number(studioForm.penis_length_cm),
        penis_diameter_cm: studioForm.penis_diameter_cm === '' ? null : Number(studioForm.penis_diameter_cm),
        admin_priority: Number(studioForm.admin_priority || 0),
        max_profiles: Number(studioForm.max_profiles || 30),
        acquisition_source: studioForm.is_sponsored ? 'admin_sponsored' : 'paid_advertiser',
        latitude: studioForm.latitude === '' ? null : Number(studioForm.latitude),
        longitude: studioForm.longitude === '' ? null : Number(studioForm.longitude),
        service_radius_km: Number(studioForm.service_radius_km || 25)
      } as unknown as Partial<Profile>;
      const result = studioForm.id
        ? await api.updateAdminProfile(token, studioForm.id, body)
        : await api.createAdminProfile(token, body);
      setProfiles((current) => {
        const exists = current.some((profile) => profile.id === result.profile.id);
        return exists
          ? current.map((profile) => profile.id === result.profile.id ? { ...profile, ...result.profile } : profile)
          : [result.profile, ...current];
      });
      setStudioFile(null);
      if (studioForm.id) {
        editStudioProfile(result.profile);
      } else {
        setStudioForm({ ...emptyStudioForm });
      }
      const accountCreated = 'account_created' in result && Boolean(result.account_created);
      const userLinked = 'user_linked' in result && Boolean(result.user_linked);
      setMessage(accountCreated ? t('admin.accounts.accountCreated') : userLinked ? t('admin.accounts.userLinked') : t('admin.messages.profileSaved'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nie udalo sie zapisac profilu.');
    } finally {
      setStudioSaving(false);
    }
  }

  async function generateAccountLink(kind: 'magic' | 'reset') {
    if (!studioForm.id) return;
    setAccountActionLoading(kind);
    setMessage('');
    try {
      const result = kind === 'magic'
        ? await api.adminProfileMagicLink(token, studioForm.id)
        : await api.adminProfilePasswordReset(token, studioForm.id);
      setAccountAccessLink(result.link);
      await refreshSelectedAdminProfile(studioForm.id);
      setMessage(t('admin.accounts.linkGenerated'));
    } catch (error) {
      setMessage(adminAccountErrorMessage(error, t));
    } finally {
      setAccountActionLoading('');
    }
  }

  async function loadAccountSecurity() {
    if (!studioForm.id) return;
    setAccountActionLoading('security');
    setMessage('');
    try {
      const result = await api.adminProfileSecurity(token, studioForm.id);
      setAccountSecurity(result.security);
      await refreshSelectedAdminProfile(studioForm.id);
    } catch (error) {
      setMessage(adminAccountErrorMessage(error, t));
    } finally {
      setAccountActionLoading('');
    }
  }

  async function createExistingProfileAccount() {
    if (!studioForm.id) return;
    if (studioForm.password !== studioForm.confirm_password) {
      setMessage(t('admin.accounts.passwordsDoNotMatch'));
      return;
    }
    setAccountActionLoading('create');
    setMessage('');
    try {
      await api.createAdminProfileAccount(token, studioForm.id, {
        email: studioForm.owner_email,
        password: studioForm.password,
        confirm_password: studioForm.confirm_password
      });
      const refreshedProfile = await refreshSelectedAdminProfile(studioForm.id);
      setStudioTab('account');
      setMessage(t('admin.accounts.accountCreated'));
      const security = await api.adminProfileSecurity(token, refreshedProfile.id);
      setAccountSecurity(security.security);
    } catch (error) {
      setMessage(adminAccountErrorMessage(error, t));
    } finally {
      setAccountActionLoading('');
    }
  }

  async function setTemporaryPassword() {
    if (!studioForm.id) return;
    if (studioForm.password !== studioForm.confirm_password) {
      setMessage(t('admin.accounts.passwordsDoNotMatch'));
      return;
    }
    setAccountActionLoading('temp');
    setMessage('');
    try {
      await api.setAdminProfileTempPassword(token, studioForm.id, {
        password: studioForm.password,
        confirm_password: studioForm.confirm_password
      });
      const refreshed = await refreshSelectedAdminProfile(studioForm.id);
      setStudioForm((current) => ({ ...current, password: '', confirm_password: '' }));
      setMessage(t('admin.accounts.tempPasswordSet'));
      if (refreshed) {
        const security = await api.adminProfileSecurity(token, refreshed.id);
        setAccountSecurity(security.security);
      }
    } catch (error) {
      setMessage(adminAccountErrorMessage(error, t));
    } finally {
      setAccountActionLoading('');
    }
  }

  async function sendAccountEmail(kind: 'login' | 'reset') {
    if (!studioForm.id) return;
    setAccountActionLoading(kind === 'login' ? 'send-login' : 'send-reset');
    setMessage('');
    try {
      const result = kind === 'login'
        ? await api.sendAdminProfileLoginEmail(token, studioForm.id)
        : await api.sendAdminProfileResetEmail(token, studioForm.id);
      setAccountAccessLink(result.link);
      setAccountEmailBody(`To: ${result.email_to}\nSubject: ${result.subject}\n\n${result.email_body}`);
      setMessage(result.sent ? t('admin.accounts.emailSent') : t('admin.accounts.emailPrepared'));
      await refreshSelectedAdminProfile(studioForm.id);
    } catch (error) {
      setMessage(adminAccountErrorMessage(error, t));
    } finally {
      setAccountActionLoading('');
    }
  }

  async function refreshSelectedAdminProfile(profileId: string) {
    const refreshed = await api.adminProfile(token, profileId);
    setProfiles((current) => current.map((profile) => profile.id === refreshed.profile.id ? refreshed.profile : profile));
    setStudioForm((current) => ({
      ...current,
      owner_email: refreshed.profile.owner_email || current.owner_email
    }));
    return refreshed.profile;
  }

  async function importProfiles() {
    if (!profileImportFile) return;
    const form = new FormData();
    form.append('file', profileImportFile);
    setStudioSaving(true);
    try {
      const result = await api.importAdminProfiles(token, form);
      setProfileImportReport(result.report);
      setMessage(t('admin.accounts.importFinished'));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setStudioSaving(false);
    }
  }

  async function uploadStudioPhoto(profileId = studioForm.id) {
    const selected = profiles.find((profile) => profile.id === profileId);
    console.info('[admin photo upload] profile_id=', profileId || null);
    if (!profileId || !selected) {
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
        const existingImages = image.is_cover || image.is_primary
          ? (profile.profile_images || []).map((item) => ({ ...item, is_primary: false, is_cover: false }))
          : (profile.profile_images || []);
        const images = sortAdminImages([...existingImages, image]);
        return { ...profile, profile_images: images, images, photos_count: images.length } as Profile;
      }));
      setStudioFile(null);
      setStudioTab('photos');
      setProfilePanelMode('photos');
      setMessage(t('admin.messages.photoUploaded'));
      console.info('[admin photo upload] success image_id=', image.id);
      console.info('[admin photo upload] keeping selected profile=', profileId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    }
  }

  async function searchAdminPlace() {
    setMessage('');
    const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!googleMapsKey) {
      setMessage(t('admin.location.googleMissing'));
      setAdminPlaceSuggestions([]);
      return;
    }
    if (!adminPlaceQuery.trim()) {
      setMessage(t('admin.location.typePlaceFirst'));
      return;
    }
    setAdminPlaceLoading(true);
    try {
      const google = await loadGooglePlaces(googleMapsKey);
      const service = new google.maps.places.AutocompleteService();
      service.getPlacePredictions({ input: adminPlaceQuery, types: ['geocode', 'establishment'] }, (predictions: any[] | null, status: string) => {
        setAdminPlaceLoading(false);
        if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          setMessage(t('admin.location.noPlaceFound'));
          setAdminPlaceSuggestions([]);
          return;
        }
        setAdminPlaceSuggestions(predictions.slice(0, 5));
      });
    } catch {
      setAdminPlaceLoading(false);
      setMessage(t('admin.location.googleLoadFailed'));
    }
  }

  async function selectAdminPlace(placeId: string) {
    const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!googleMapsKey) return;
    setAdminPlaceLoading(true);
    try {
      const google = await loadGooglePlaces(googleMapsKey);
      const node = document.createElement('div');
      const service = new google.maps.places.PlacesService(node);
      service.getDetails({ placeId, fields: ['name', 'formatted_address', 'geometry', 'address_components'] }, (place: any, status: string) => {
        setAdminPlaceLoading(false);
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          setMessage(t('admin.location.googleLoadFailed'));
          return;
        }
        const parsed = parseGooglePlace(place);
        const district = resolveBerlinPostalDistrict(parsed.postal_code);
        setStudioForm({
          ...studioForm,
          work_country: parsed.country || studioForm.work_country,
          work_city: parsed.city || studioForm.work_city,
          work_area: district || parsed.area || studioForm.work_area,
          area: district || parsed.area || studioForm.area,
          city: getLegacyCitySlug(parsed.city || studioForm.work_city),
          postal_code: parsed.postal_code || studioForm.postal_code,
          work_place_label: parsed.label || studioForm.work_place_label,
          latitude: parsed.latitude === null || parsed.latitude === undefined ? '' : String(parsed.latitude),
          longitude: parsed.longitude === null || parsed.longitude === undefined ? '' : String(parsed.longitude),
          location_mode: 'approximate'
        });
        setAdminPlaceQuery(parsed.label || '');
        setAdminPlaceSuggestions([]);
      });
    } catch {
      setAdminPlaceLoading(false);
      setMessage(t('admin.location.googleLoadFailed'));
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
      const hasLoginAccount = Boolean(selectedProfile?.user_id);
      const canResolveLoginAccount = hasLoginAccount || Boolean(studioForm.owner_email);
      return <>
        <div className="admin-form-grid">
          <AdminField label={t('admin.profileEditor.ownerEmail')} help={t('admin.profileEditor.ownerEmailHelp')}><input type="email" placeholder={t('admin.profileEditor.ownerEmailPlaceholder')} value={studioForm.owner_email} onChange={(event) => setStudioForm({ ...studioForm, owner_email: event.target.value })} /></AdminField>
          <AdminField label={studioForm.id ? t('admin.accounts.tempPassword') : t('admin.accounts.password')}><input type="password" autoComplete="new-password" value={studioForm.password} onChange={(event) => setStudioForm({ ...studioForm, password: event.target.value })} /></AdminField>
          <AdminField label={studioForm.id ? t('admin.accounts.confirmTempPassword') : t('admin.accounts.confirmPassword')}><input type="password" autoComplete="new-password" value={studioForm.confirm_password} onChange={(event) => setStudioForm({ ...studioForm, confirm_password: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.phone')}><input placeholder={t('admin.profileEditor.phonePlaceholder')} value={studioForm.phone} onChange={(event) => setStudioForm({ ...studioForm, phone: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.whatsapp')}><input placeholder={t('admin.profileEditor.whatsappPlaceholder')} value={studioForm.whatsapp} onChange={(event) => setStudioForm({ ...studioForm, whatsapp: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.telegram')}><input placeholder={t('admin.profileEditor.telegramPlaceholder')} value={studioForm.telegram} onChange={(event) => setStudioForm({ ...studioForm, telegram: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.accountType')}><select value={studioForm.account_type} onChange={(event) => setStudioForm({ ...studioForm, account_type: event.target.value })}>{adminAccountTypeOptions.map((type) => <option key={type} value={type}>{t(`admin.accountType.${type}`)}</option>)}</select></AdminField>
          <AdminField label={t('admin.accounts.starterPackage')}><select value={studioForm.starter_package} onChange={(event) => setStudioForm({ ...studioForm, starter_package: event.target.value })}>{['free', 'trial_7', 'trial_30', 'premium_30', 'vip_30', 'lifetime'].map((item) => <option key={item} value={item}>{t(`admin.accounts.package.${item}`)}</option>)}</select></AdminField>
        </div>
        {studioForm.id && <section className="admin-card">
          <h3>{t('admin.accounts.accountSecurity')}</h3>
          <p><strong>{t('admin.accounts.loginStatus')}:</strong> {hasLoginAccount ? t('admin.accounts.connected') : t('admin.accounts.missing')}</p>
          <p><strong>{t('admin.accounts.userId')}:</strong> {selectedProfile?.user_id || accountSecurity?.user_id || '-'}</p>
          {!hasLoginAccount && <p className="muted">{t('admin.accounts.authUserMissingHelp')}</p>}
          <div className="admin-actions-row">
            {!hasLoginAccount && <Action disabled={Boolean(accountActionLoading)} onClick={createExistingProfileAccount}>{accountActionLoading === 'create' ? t('states.loading') : t('admin.accounts.createLoginAccount')}</Action>}
            <Action disabled={Boolean(accountActionLoading) || !canResolveLoginAccount} onClick={setTemporaryPassword}>{accountActionLoading === 'temp' ? t('states.loading') : t('admin.accounts.setTempPassword')}</Action>
            <Action disabled={Boolean(accountActionLoading) || !canResolveLoginAccount} onClick={() => generateAccountLink('magic')}>{accountActionLoading === 'magic' ? t('states.loading') : t('admin.accounts.magicLink')}</Action>
            <Action disabled={Boolean(accountActionLoading) || !canResolveLoginAccount} onClick={() => generateAccountLink('reset')}>{accountActionLoading === 'reset' ? t('states.loading') : t('admin.accounts.resetPasswordLink')}</Action>
            <Action disabled={Boolean(accountActionLoading) || !canResolveLoginAccount} onClick={() => sendAccountEmail('login')}>{accountActionLoading === 'send-login' ? t('states.loading') : t('admin.accounts.sendLoginEmail')}</Action>
            <Action disabled={Boolean(accountActionLoading) || !canResolveLoginAccount} onClick={() => sendAccountEmail('reset')}>{accountActionLoading === 'send-reset' ? t('states.loading') : t('admin.accounts.sendResetEmail')}</Action>
            <Action disabled={Boolean(accountActionLoading) || !canResolveLoginAccount} onClick={loadAccountSecurity}>{accountActionLoading === 'security' ? t('states.loading') : t('admin.accounts.loadSecurity')}</Action>
          </div>
          {accountAccessLink && <AdminField label={t('admin.accounts.generatedLink')} help={t('admin.accounts.shareVerifiedOwnerOnly')}><><input readOnly value={accountAccessLink} /><button type="button" className="button" onClick={() => navigator.clipboard?.writeText(accountAccessLink)}>{t('admin.accounts.copyLink')}</button></></AdminField>}
          {accountEmailBody && <AdminField label={t('admin.accounts.emailBody')} help={t('admin.accounts.mailFallback')}><><textarea readOnly value={accountEmailBody} /><button type="button" className="button" onClick={() => navigator.clipboard?.writeText(accountEmailBody)}>{t('admin.accounts.copyEmail')}</button></></AdminField>}
          {accountSecurity && <dl className="admin-detail-list">
            <dt>{t('admin.accounts.userId')}</dt><dd>{accountSecurity.user_id || '-'}</dd>
            <dt>{t('admin.profileEditor.ownerEmail')}</dt><dd>{accountSecurity.email || studioForm.owner_email || '-'}</dd>
            <dt>{t('admin.accounts.lastLogin')}</dt><dd>{accountSecurity.last_login ? new Date(accountSecurity.last_login).toLocaleString() : t('admin.accounts.notTracked')}</dd>
            <dt>{t('admin.accounts.lastIp')}</dt><dd>{accountSecurity.last_ip || t('admin.accounts.notTracked')}</dd>
            <dt>{t('admin.accounts.device')}</dt><dd>{accountSecurity.user_agent || t('admin.accounts.notTracked')}</dd>
            <dt>{t('admin.accounts.createdAt')}</dt><dd>{accountSecurity.account_created_at ? new Date(accountSecurity.account_created_at).toLocaleString() : '-'}</dd>
            <dt>{t('admin.accounts.emailConfirmed')}</dt><dd>{accountSecurity.email_confirmed ? t('admin.common.yes') : t('admin.common.no')}</dd>
            <dt>{t('admin.accounts.banned')}</dt><dd>{accountSecurity.banned ? t('admin.common.yes') : t('admin.common.no')}</dd>
          </dl>}
        </section>}
      </>;
    }

    if (studioTab === 'basic') {
      const showMaleFields = showMaleProfileFields({
        gender: studioForm.gender,
        penis_length_cm: studioForm.penis_length_cm === '' ? null : Number(studioForm.penis_length_cm),
        penis_diameter_cm: studioForm.penis_diameter_cm === '' ? null : Number(studioForm.penis_diameter_cm)
      });
      return <>
        <div className="admin-form-grid">
          <AdminField label={t('admin.profileEditor.displayName')}><input placeholder={t('admin.profileEditor.displayNamePlaceholder')} value={studioForm.display_name} onChange={(event) => setStudioForm({ ...studioForm, display_name: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.publicProfileType')} help={t('admin.profileEditor.profileTypeHelp')}><select value={studioForm.profile_type} onChange={(event) => setStudioForm({ ...studioForm, profile_type: event.target.value })}>{adminProfileTypeOptions.map((type) => <option key={type} value={type}>{t(`admin.profileType.${type}`)}</option>)}</select></AdminField>
          <AdminField label={t('admin.profileEditor.marketplaceCategory')} help={t('admin.profileEditor.categoryHelp')}><select value={studioForm.category} onChange={(event) => setStudioForm({ ...studioForm, category: event.target.value })}>{categoryOptions.map((category) => <option key={category} value={category}>{option(category)}</option>)}</select></AdminField>
          <AdminField label={t('profileDetails.gender')}><select value={studioForm.gender} onChange={(event) => setStudioForm({ ...studioForm, gender: event.target.value })}><option value="">-</option>{profileGenderOptions.map((item) => <option key={item} value={item}>{t(`profileDetails.${item}`)}</option>)}</select></AdminField>
          <AdminField label={t('profileDetails.orientation')}><select value={studioForm.orientation} onChange={(event) => setStudioForm({ ...studioForm, orientation: event.target.value })}><option value="">-</option>{profileOrientationOptions.map((item) => <option key={item} value={item}>{t(`profileDetails.${item}`)}</option>)}</select></AdminField>
          <AdminField label={t('admin.profileEditor.age')}><input type="number" value={studioForm.age} onChange={(event) => setStudioForm({ ...studioForm, age: Number(event.target.value) })} /></AdminField>
          <AdminField label={t('admin.profileEditor.nationality')}><input placeholder={t('admin.profileEditor.nationalityPlaceholder')} value={studioForm.nationality} onChange={(event) => setStudioForm({ ...studioForm, nationality: event.target.value })} /></AdminField>
          <AdminField label={t('admin.profileEditor.height')}><input type="number" value={studioForm.height_cm} onChange={(event) => setStudioForm({ ...studioForm, height_cm: Number(event.target.value) })} /></AdminField>
          <AdminField label={t('profile.moreAbout.weight')}><input type="number" value={studioForm.weight_kg} onChange={(event) => setStudioForm({ ...studioForm, weight_kg: event.target.value })} /></AdminField>
          <AdminField label={t('profile.moreAbout.bust')}><input value={studioForm.bust} onChange={(event) => setStudioForm({ ...studioForm, bust: event.target.value })} /></AdminField>
          <AdminField label={t('profile.moreAbout.eyes')}><input value={studioForm.eyes} onChange={(event) => setStudioForm({ ...studioForm, eyes: event.target.value })} /></AdminField>
          <AdminField label={t('profile.moreAbout.hair')}><input value={studioForm.hair} onChange={(event) => setStudioForm({ ...studioForm, hair: event.target.value })} /></AdminField>
          <AdminField label={t('profileDetails.travels')}><select value={String(studioForm.travels)} onChange={(event) => setStudioForm({ ...studioForm, travels: event.target.value === 'true', travel: event.target.value === 'true' ? 'yes' : 'no' })}><option value="true">{profileTravelsLabel(true, t)}</option><option value="false">{profileTravelsLabel(false, t)}</option></select></AdminField>
          <AdminField label={t('admin.profileEditor.languages')}><input placeholder={t('admin.profileEditor.languagesPlaceholder')} value={studioForm.languages.join(', ')} onChange={(event) => setStudioForm({ ...studioForm, languages: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></AdminField>
          <AdminField label={t('profileDetails.ethnicity')}><select value={studioForm.ethnicity} onChange={(event) => setStudioForm({ ...studioForm, ethnicity: event.target.value })}><option value="">-</option>{profileEthnicityOptions.map((item) => <option key={item} value={item}>{t(`profileDetails.${item}`)}</option>)}</select></AdminField>
          {showMaleFields && <AdminField label={t('profileDetails.penisLengthCm')}><input type="number" min="5" max="35" step="0.1" value={studioForm.penis_length_cm} onChange={(event) => setStudioForm({ ...studioForm, penis_length_cm: event.target.value })} /></AdminField>}
          {showMaleFields && <AdminField label={t('profileDetails.penisDiameterCm')}><input type="number" min="1" max="10" step="0.1" value={studioForm.penis_diameter_cm} onChange={(event) => setStudioForm({ ...studioForm, penis_diameter_cm: event.target.value })} /></AdminField>}
          <AdminField label={t('profile.moreAbout.zodiacSign')}><input value={studioForm.zodiac_sign} onChange={(event) => setStudioForm({ ...studioForm, zodiac_sign: event.target.value })} /></AdminField>
        </div>
        <AdminField label={t('admin.profileEditor.description')}><textarea className="admin-profile-textarea" placeholder={t('admin.profileEditor.descriptionPlaceholder')} value={studioForm.description} onChange={(event) => setStudioForm({ ...studioForm, description: event.target.value })} /></AdminField>
      </>;
    }

    if (studioTab === 'location') {
      const countries = getAdminLocationCountries(adminLocationRows);
      const country = getAdminLocationCountry(countries, studioForm.work_country);
      const cities = country.cities;
      const cityConfig = getAdminLocationCity(country, studioForm.work_city);
      const isBerlin = normalizeLocationValue(cityConfig?.name || studioForm.work_city || '') === 'berlin';
      const districts = isBerlin ? berlinDistrictOptions : cityConfig?.districts || [];
      return <div className="admin-form-grid">
        <AdminField label={t('admin.profileEditor.workCountry')}><select value={country.code} onChange={(event) => {
          const nextCountry = getAdminLocationCountry(countries, event.target.value);
          const nextCity = nextCountry.cities[0]?.name || '';
          const nextArea = nextCountry.cities[0]?.districts[0] || '';
          setStudioForm({ ...studioForm, work_country: nextCountry.code, work_city: nextCity, city: getLegacyCitySlug(nextCity), work_area: nextArea, area: nextArea });
        }}>{countries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></AdminField>
        <AdminField label={t('admin.profileEditor.workCity')}><input list="admin-city-options" placeholder={t('admin.location.manualCity')} value={studioForm.work_city} onChange={(event) => {
          const nextArea = getAdminLocationCity(country, event.target.value)?.districts[0] || '';
          setStudioForm({ ...studioForm, work_city: event.target.value, city: getLegacyCitySlug(event.target.value), work_area: nextArea, area: nextArea });
        }} /></AdminField>
        <datalist id="admin-city-options">{cities.map((city) => <option key={city.name} value={city.name} />)}</datalist>
        <AdminField label={t('profileDetails.berlinDistrict')}><select value={districts.includes(studioForm.work_area) ? studioForm.work_area : ''} onChange={(event) => setStudioForm({ ...studioForm, work_area: event.target.value, area: event.target.value })}><option value="">{t('profileDetails.chooseDistrict')}</option>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></AdminField>
        <AdminField label={t('dashboard.advertiser.districtArea')}><input list="admin-district-options" placeholder={t('admin.profileEditor.areaPlaceholder')} value={studioForm.work_area} onChange={(event) => setStudioForm({ ...studioForm, work_area: event.target.value, area: event.target.value })} /></AdminField>
        <datalist id="admin-district-options">{districts.map((district) => <option key={district} value={district} />)}</datalist>
        <AdminField label={t('admin.location.postalCode')}><input maxLength={20} placeholder="12043" value={studioForm.postal_code} onChange={(event) => {
          const postalCode = event.target.value.slice(0, 20);
          const district = resolveBerlinPostalDistrict(postalCode);
          setStudioForm({
            ...studioForm,
            postal_code: postalCode,
            ...(district ? { work_city: studioForm.work_city || 'Berlin', city: 'berlin', work_area: district, area: district } : {})
          });
          if (district) setMessage(t('profileDetails.postalCodeAutoArea'));
        }} /></AdminField>
        <AdminField label={t('admin.location.placeLabel')}><input placeholder={t('admin.location.placeLabelPlaceholder')} value={studioForm.work_place_label} onChange={(event) => setStudioForm({ ...studioForm, work_place_label: event.target.value })} /></AdminField>
        <AdminField label={t('radar.exactAddress')}><input placeholder="Street, number, city" value={studioForm.exact_address} onChange={(event) => setStudioForm({ ...studioForm, exact_address: event.target.value, work_place_label: event.target.value || studioForm.work_place_label })} /></AdminField>
        <AdminField label={t('admin.location.radius')}><select value={studioForm.service_radius_km} onChange={(event) => setStudioForm({ ...studioForm, service_radius_km: Number(event.target.value) })}>{[1, 5, 10, 25, 50, 100].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}</select></AdminField>
        <AdminField label={t('radar.locationVisibility')}><><select value={studioForm.location_visibility || getAdminLocationChoice(studioForm)} onChange={(event) => setStudioForm(applyAdminLocationChoice(studioForm, event.target.value))}>
          <option value="exact">{t('radar.exactAddress')}</option>
          <option value="postal_area">{t('radar.postalArea')}</option>
          <option value="city_only">{t('radar.cityOnly')}</option>
          <option value="hidden">{t('radar.hideExactLocation')}</option>
        </select><small className="muted">{t('radar.locationVisibilityHelp')}</small></></AdminField>
        <AdminField label={t('admin.location.placeSearch')}><><input placeholder={t('admin.location.placeSearchPlaceholder')} value={adminPlaceQuery} onChange={(event) => setAdminPlaceQuery(event.target.value)} /><button type="button" className="button" disabled={adminPlaceLoading} onClick={searchAdminPlace}>{adminPlaceLoading ? t('states.loading') : t('admin.location.searchPlace')}</button>{adminPlaceSuggestions.length ? <div className="place-suggestions">{adminPlaceSuggestions.map((suggestion) => <button key={suggestion.place_id} type="button" onClick={() => selectAdminPlace(suggestion.place_id)}>{suggestion.description}</button>)}</div> : null}</></AdminField>
        <div className="full-span">
          <WorkPointMap apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''} latitude={studioForm.latitude} longitude={studioForm.longitude} onChange={(point) => {
            setStudioForm({ ...studioForm, latitude: String(point.latitude), longitude: String(point.longitude), location_mode: 'approximate', location_visibility: studioForm.location_visibility || 'postal_area' });
            setMessage(t('location.workPointSet'));
          }} />
        </div>
      </div>;
    }

    if (studioTab === 'business') {
      return <div className="admin-form-grid">
        <AdminField label={t('admin.profileEditor.businessName')}><input placeholder={t('admin.profileEditor.businessNamePlaceholder')} value={studioForm.business_name} onChange={(event) => setStudioForm({ ...studioForm, business_name: event.target.value })} /></AdminField>
        <AdminField label={t('admin.profileEditor.businessType')}><select value={studioForm.business_type} onChange={(event) => setStudioForm({ ...studioForm, business_type: event.target.value })}>{['', 'brothel', 'massage_salon', 'agency'].map((type) => <option key={type || 'empty'} value={type}>{type || '-'}</option>)}</select></AdminField>
        <AdminField label="Business ID"><input placeholder="UUID profilu biznesowego" value={studioForm.business_id} onChange={(event) => setStudioForm({ ...studioForm, business_id: event.target.value })} /></AdminField>
        <AdminField label="Business phone"><input placeholder="+49..." value={studioForm.business_phone} onChange={(event) => setStudioForm({ ...studioForm, business_phone: event.target.value })} /></AdminField>
        <AdminField label="Exact address"><input placeholder="Street, number, city" value={studioForm.exact_address} onChange={(event) => setStudioForm({ ...studioForm, exact_address: event.target.value })} /></AdminField>
        <AdminField label="Max profiles"><input type="number" min={1} max={30} value={studioForm.max_profiles} onChange={(event) => setStudioForm({ ...studioForm, max_profiles: Number(event.target.value) })} /></AdminField>
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
        <AdminField label={t('form.price3h')}><input type="number" value={studioForm.price_3h} onChange={(event) => setStudioForm({ ...studioForm, price_3h: Number(event.target.value) })} /></AdminField>
        <AdminField label={t('admin.profileEditor.priceNight')}><input type="number" value={studioForm.price_night} onChange={(event) => setStudioForm({ ...studioForm, price_night: Number(event.target.value) })} /></AdminField>
        <AdminField label={t('admin.profileEditor.currency')}><input value={studioForm.currency} onChange={(event) => setStudioForm({ ...studioForm, currency: event.target.value })} /></AdminField>
        <div className="admin-card full-span"><ServicePricingEditor selectedServices={studioForm.services} servicePricing={studioForm.service_pricing} currency={studioForm.currency} onChange={(service_pricing) => setStudioForm({ ...studioForm, service_pricing })} /></div>
      </div>;
    }

    if (studioTab === 'status') {
      return <>
        <section className="admin-card">
          <h3>{t('admin.profileEditor.publicProfileStatus')}</h3>
          <div className="admin-form-grid">
            <AdminField label={t('admin.profileEditor.operatorStatus')}><select value={studioForm.operator_status} onChange={(event) => setStudioForm({ ...studioForm, operator_status: event.target.value })}>{adminAvailabilityStatusOptions.map((status) => <option key={status} value={status}>{t(`admin.operatorStatus.${status}`)}</option>)}</select></AdminField>
            <AdminField label={t('admin.profileEditor.published')} help={t('admin.profileEditor.publishedHelp')}><label><input type="checkbox" checked={studioForm.is_published} onChange={(event) => setStudioForm({ ...studioForm, is_published: event.target.checked })} /> {t('admin.common.enabled')}</label></AdminField>
            <AdminField label={t('admin.profileEditor.verified')}><label><input type="checkbox" checked={studioForm.verified} onChange={(event) => setStudioForm({ ...studioForm, verified: event.target.checked })} /> {t('admin.common.enabled')}</label></AdminField>
            <AdminField label={t('admin.profileEditor.moderationStatus')} help={t('admin.profileEditor.moderationStatusHelp')}><select value={studioForm.moderation_status} onChange={(event) => setStudioForm({ ...studioForm, moderation_status: event.target.value })}>{['pending', 'approved', 'rejected', 'suspended'].map((status) => <option key={status} value={status}>{t(`admin.status.${status}`)}</option>)}</select></AdminField>
          </div>
        </section>
        <section className="admin-card">
          <h3>{t('admin.profileEditor.promotionModeration')}</h3>
          <div className="admin-form-grid">
            <AdminField label={t('admin.profileEditor.sponsoredProfile')} help={t('admin.profileEditor.sponsoredHelp')}><label><input type="checkbox" checked={studioForm.is_sponsored} onChange={(event) => setStudioForm({ ...studioForm, is_sponsored: event.target.checked, acquisition_source: event.target.checked ? 'admin_sponsored' : 'paid_advertiser' })} /> {t('admin.common.enabled')}</label></AdminField>
            <AdminField label={t('admin.profileEditor.seedDemo')} help={t('admin.profileEditor.seedDemoHelp')}><label><input type="checkbox" checked={studioForm.is_seed_profile} onChange={(event) => setStudioForm({ ...studioForm, is_seed_profile: event.target.checked })} /> {t('admin.common.enabled')}</label></AdminField>
            <AdminField label={t('admin.profileEditor.activeSubscription')}><StatusBadge value={['active', 'trial', 'test'].includes(String(studioForm.subscription_status)) ? 'active' : String(studioForm.subscription_status || 'free')} /></AdminField>
            <AdminField label={t('admin.profileEditor.exposurePackage')} help={t('admin.profileEditor.exposureHelp')}><select value={studioForm.premium_tier} onChange={(event) => setStudioForm({ ...studioForm, premium_tier: event.target.value })}>{exposurePackageOptions.map((tier) => <option key={tier} value={tier}>{t(`admin.status.${tier}`)}</option>)}</select></AdminField>
            <AdminField label={t('admin.profileEditor.manualSortingPriority')} help={t('admin.profileEditor.priorityHelp')}><input type="number" value={studioForm.admin_priority} onChange={(event) => setStudioForm({ ...studioForm, admin_priority: Number(event.target.value) })} /></AdminField>
          </div>
        </section>
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
          <AdminField label={t('admin.services.categoryFilter')}><select value={studioServiceCategory} onChange={(event) => setStudioServiceCategory(event.target.value)}>{serviceCategories.map((category) => <option key={category} value={category}>{category === 'all' ? t('admin.common.all') : serviceCategoryLabel(category, t)}</option>)}</select></AdminField>
        </div>
        {Object.entries(groupedServices).map(([category, services]) => {
          const expanded = expandedServiceCategories[category] ?? false;
          return <div className="admin-service-group" key={category}>
            <div className="profile-studio-head compact">
              <button type="button" className="admin-action-btn" onClick={() => setExpandedServiceCategories({ ...expandedServiceCategories, [category]: !expanded })}>{expanded ? t('admin.actions.collapse') : t('admin.actions.expand')}</button>
              <strong>{serviceCategoryLabel(category, t)}</strong>
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
        <section className="admin-card">
          <h3>{t('admin.profileEditor.advancedModeration')}</h3>
          <div className="admin-form-grid">
            <AdminField label={t('admin.profileEditor.exposurePackage')} help={t('admin.profileEditor.exposureHelp')}><select value={studioForm.premium_tier} onChange={(event) => setStudioForm({ ...studioForm, premium_tier: event.target.value })}>{exposurePackageOptions.map((tier) => <option key={tier} value={tier}>{t(`admin.status.${tier}`)}</option>)}</select></AdminField>
            <AdminField label={t('admin.profileEditor.manualSortingPriority')} help={t('admin.profileEditor.priorityHelp')}><input type="number" value={studioForm.admin_priority} onChange={(event) => setStudioForm({ ...studioForm, admin_priority: Number(event.target.value) })} /></AdminField>
          </div>
        </section>
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
        <>
        <div className="profile-studio-head compact">
          <strong>{t('admin.photos.count', { count: selectedProfile.profile_images.length, max: 12 })}</strong>
          <small>{t('admin.photos.adminSeesAll')}</small>
        </div>
        <div className="studio-photo-grid">
          {sortAdminImages(selectedProfile.profile_images).map((image, index, orderedImages) => (
            <div className="studio-photo-card" key={image.id}>
              <img src={adminImageSrc(image)} alt="" />
              <div className="studio-photo-badges">
                {(image.is_cover || image.is_primary) && <i>{t('admin.photos.badge.cover')}</i>}
                {image.is_hidden && <i>{t('admin.photos.badge.hidden')}</i>}
                {image.is_private && <i>{t('admin.photos.badge.private')}</i>}
                <i>#{Number(image.sort_order || 0) + 1}</i>
                <i>{t(`admin.status.${image.moderation_status || 'approved'}`)}</i>
              </div>
              <div className="admin-actions-row">
                <Action onClick={() => action(() => api.setAdminProfileCoverImage(token, selectedProfile.id, image.id))}>{t('admin.photos.cover')}</Action>
                <Action onClick={() => action(() => api.reorderAdminProfileImages(token, selectedProfile.id, moveImageId(orderedImages, index, -1)))}>{t('admin.actions.up')}</Action>
                <Action onClick={() => action(() => api.reorderAdminProfileImages(token, selectedProfile.id, moveImageId(orderedImages, index, 1)))}>{t('admin.actions.down')}</Action>
                <Action onClick={() => action(() => api.updateAdminProfileImage(token, selectedProfile.id, image.id, { is_hidden: !image.is_hidden }))}>{image.is_hidden ? t('admin.photos.unhide') : t('admin.photos.hide')}</Action>
                <Action onClick={() => action(() => api.updateAdminProfileImage(token, selectedProfile.id, image.id, { is_private: !image.is_private }))}>{image.is_private ? t('admin.photos.makePublic') : t('admin.photos.makePrivate')}</Action>
                <Action onClick={() => action(() => api.updateAdminProfileImage(token, selectedProfile.id, image.id, { moderation_status: 'approved' }))}>{t('admin.actions.approve')}</Action>
                <Action danger onClick={() => action(() => api.updateAdminProfileImage(token, selectedProfile.id, image.id, { moderation_status: 'rejected' }))}>{t('admin.actions.reject')}</Action>
                <Action danger onClick={() => action(() => api.deleteAdminProfileImage(token, selectedProfile.id, image.id))}><Trash2 size={14} /></Action>
              </div>
            </div>
          ))}
        </div>
        </>
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

    const imageSrc = adminProfileCoverSrc(selectedProfile);
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
        <button type="button" className="admin-back-link" onClick={returnFromProfileOverview}>
          ← {profileReturnSource === 'subscriptions' ? t('admin.backToSubscriptions') : t('admin.backToProfiles')}
        </button>
        <div className="profile-overview-hero">
          {imageSrc ? <img src={imageSrc} alt="" /> : <AdminCoverPlaceholder label={selectedProfile.display_name} />}
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
        <section className="admin-card">
          <h3>{t('admin.visibility.publicVisibility')}</h3>
          <ProfileVisibilityAudit audit={selectedProfile.visibility_audit} />
        </section>
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
          <img className="admin-login-logo" src="/Logo_Escort_3.png" alt="Escort Radar" />
          <p className="eyebrow">{t('admin.login.subtitle')}</p>
          <h1>Ładowanie panelu administratora...</h1>
        </div>
      </div>
    );
  }

  if (isLoginRoute) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <img className="admin-login-logo" src="/Logo_Escort_3.png" alt="Escort Radar" />
          <p className="eyebrow">{t('admin.login.subtitle')}</p>
          <h1>{t('admin.login.title')}</h1>
          <p className="admin-login-copy">{t('admin.login.restricted')}</p>
          {message && <p className="admin-alert">{message}</p>}
          <input type="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
          <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          <label className="admin-remember-email">
            <input type="checkbox" checked={rememberEmail} onChange={(event) => {
              setRememberEmail(event.target.checked);
              if (!event.target.checked) localStorage.removeItem(adminEmailStorageKey);
            }} />
            <span>{t('admin.login.rememberEmail')}</span>
          </label>
          <button className="button primary full" disabled={loginLoading} onClick={handleLogin}>{loginLoading ? t('states.loading') : t('admin.login.submit')}</button>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="admin-login-page">
        <div className="admin-login-card">
          <img className="admin-login-logo" src="/Logo_Escort_3.png" alt="Escort Radar" />
          <p className="eyebrow">{t('admin.login.subtitle')}</p>
          <h1>{t('admin.login.title')}</h1>
          <p className="admin-alert">{message || t('admin.login.noAccess')}</p>
          <Link className="button primary full" to="/admin/login">{t('admin.login.goToLogin')}</Link>
          <button className="button full" onClick={resetAdminSession}>{t('admin.login.resetSession')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="admin-brand">
          <img className="baba-admin-logo compact" src="/Logo_Escort_3.png" alt="Escort Radar" />
          <span>
            <strong>Escort Radar</strong>
            <small>Admin Panel</small>
          </span>
        </Link>
        {sections.map((section) => (
          <div className="admin-sidebar-section" key={section.title}>
            <small>{section.title}</small>
            {section.items.map(([key, path, Icon, labelKey]) => (
              <Link key={key} to={path} className={view === key || (view === 'dashboard' && key === 'dashboard') ? 'active' : ''}>
                <Icon size={16} />
                <span>{t(labelKey)}</span>
                <ChevronRight className="admin-menu-arrow" size={14} />
              </Link>
            ))}
          </div>
        ))}
        <button className="admin-logout" onClick={logout}><Power size={16} /> {t('admin.nav.logout')}</button>
      </aside>

      <main className="admin-content">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">{t('admin.topbar.eyebrow')}</p>
            <h1>{adminViewTitle(view, t)}</h1>
          </div>
          <div className="admin-search">
            <select value={lang} onChange={(event) => setLang(event.target.value as 'pl' | 'de' | 'en')} aria-label="Admin language">
              <option value="pl">PL</option>
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
            <input placeholder={t('admin.filters.searchRecords')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <button className="button" onClick={() => load()}><RefreshCw size={16} /> {loading ? t('states.loading') : t('admin.actions.refresh')}</button>
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
      {photoPreview && (
        <div className="admin-modal-backdrop" onClick={() => setPhotoPreview(null)}>
          <article className="admin-modal photo-preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-studio-head compact">
              <div>
                <p className="eyebrow">{t('admin.photos.preview')}</p>
                <h2>{photoPreview.profile_display_name || photoPreview.profile_id || t('admin.photos.noPhoto')}</h2>
              </div>
              <StatusBadge value={String(photoPreview.moderation_status || 'pending')} />
            </div>
            {adminPhotoSrc(photoPreview) ? <img src={adminPhotoSrc(photoPreview)} alt="" /> : <AdminCoverPlaceholder label={t('admin.photos.noPhoto')} />}
            <button className="button primary" onClick={() => setPhotoPreview(null)}>{t('admin.buttons.cancel')}</button>
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
      const sponsoredProfiles = profiles.filter((profile) => profile.is_sponsored || profile.acquisition_source === 'admin_sponsored').length;
      const cards = [
        { label: t('admin.dashboard.dailyRevenue'), value: formatEuro(stats.daily_revenue_eur), badge: Number(stats.daily_revenue_eur || 0) > 0 ? t('admin.status.active') : t('admin.dashboard.noPaymentsShort') },
        { label: t('admin.dashboard.monthlyRevenue'), value: formatEuro(stats.monthly_revenue_eur), badge: Number(stats.monthly_revenue_eur || 0) > 0 ? t('admin.dashboard.realRevenue') : t('admin.dashboard.noPaymentsShort') },
        { label: t('admin.dashboard.clientActivations'), value: stats.client_activation_transactions || clientActivationPayments.length, badge: t('admin.dashboard.activatedClientsCount', { count: activatedClients }) },
        { label: t('admin.dashboard.activeUsers'), value: activatedClients || registeredClients, badge: t('admin.dashboard.registeredClientsCount', { count: registeredClients }) },
        { label: t('admin.dashboard.activeProfiles'), value: stats.active_profiles || profiles.filter((profile) => profile.status === 'active').length, badge: t('admin.dashboard.availableProfilesCount', { count: stats.available_profiles || profiles.filter((profile) => profile.available_now).length }) },
        { label: t('admin.dashboard.sponsoredProfiles'), value: sponsoredProfiles, badge: t('admin.dashboard.notRevenue') }
      ];
      return (
        <>
          <section className="admin-metric-grid kpi-grid">{cards.map((card) => <AdminStatCard key={card.label} label={card.label} value={card.value} badge={card.badge} />)}</section>
          <section className="admin-chart-grid">
            <article className="admin-card">
              <h2>{t('admin.dashboard.recentRevenueEvents')}</h2>
              {revenueEvents.length ? <AdminTable rows={revenueEvents} columns={['date', 'email', 'type', 'amount', 'currency', 'status', 'provider']} labels={tableLabels(t, ['date', 'email', 'type', 'amount', 'currency', 'status', 'provider'])} /> : <EmptyAdminState text={t('admin.dashboard.noPaymentsToday')} />}
            </article>
            <article className="admin-card">
              <h2>{t('admin.dashboard.clientActivationFunnel')}</h2>
              <div className="metrics-grid">
                <MetricBlock label={t('admin.dashboard.registeredClients')} value={registeredClients} />
                <MetricBlock label={t('admin.dashboard.activatedClients')} value={activatedClients} />
                <MetricBlock label={t('admin.dashboard.conversion')} value={`${stats.activation_conversion_rate || 0}%`} />
                <MetricBlock label={t('admin.dashboard.revenue')} value={formatEuro(stats.client_activation_revenue_eur)} />
              </div>
            </article>
            <article className="admin-card">
              <h2>{t('admin.dashboard.topCities')}</h2>
              {topCities.length ? <AdminTable rows={topCities} columns={['label', 'count']} labels={tableLabels(t, ['label', 'count'])} /> : <EmptyAdminState text={t('admin.dashboard.noCityData')} />}
            </article>
            <article className="admin-card">
              <h2>{t('admin.dashboard.topCategories')}</h2>
              {topCategories.length ? <AdminTable rows={topCategories} columns={['label', 'count']} labels={tableLabels(t, ['label', 'count'])} /> : <EmptyAdminState text={t('admin.dashboard.noCategoryData')} />}
            </article>
            <article className="admin-card">
              <h2>{t('admin.dashboard.topProfiles')}</h2>
              {topProfiles.length ? <AdminTable rows={topProfiles} columns={['display_name', 'city', 'category', 'available_now', 'created_at']} labels={tableLabels(t, ['display_name', 'city', 'category', 'available_now', 'created_at'])} /> : <EmptyAdminState text={t('admin.dashboard.noActiveProfiles')} />}
            </article>
          </section>
        </>
      );
    }

    if (view === 'clients') {
      const totalPages = Math.max(1, Math.ceil(clientsTotal / Number(clientFilters.page_size || 25)));
      const clientColumns = ['id', 'email', 'type', 'activation', 'status', 'coins', 'provider', 'registered_at', 'last_login'];
      return (
        <>
          <section className="admin-card">
            <div className="profile-studio-head">
              <div>
                <p className="eyebrow">{t('admin.clients.title')}</p>
                <h2>{t('admin.clients.title')}</h2>
              </div>
              <div className="admin-actions-row">
                <input placeholder={t('admin.clients.search')} value={clientFilters.search} onChange={(event) => setClientFilters({ ...clientFilters, search: event.target.value, page: 1 })} />
                <select value={clientFilters.status} onChange={(event) => setClientFilters({ ...clientFilters, status: event.target.value, page: 1 })}>
                  {['all', 'free', 'activated', 'stripe_activated', 'admin_activated', 'blocked', 'test', 'client_activated', 'client_free'].map((status) => <option key={status} value={status}>{status === 'all' ? t('admin.common.all') : t(`admin.clients.status.${status}`)}</option>)}
                </select>
                <select value={clientFilters.sort} onChange={(event) => setClientFilters({ ...clientFilters, sort: event.target.value })}>
                  <option value="registered_at">{t('admin.clients.registeredAt')}</option>
                  <option value="activated_at">{t('admin.clients.activatedAt')}</option>
                </select>
                <select value={clientFilters.direction} onChange={(event) => setClientFilters({ ...clientFilters, direction: event.target.value })}>
                  <option value="desc">DESC</option>
                  <option value="asc">ASC</option>
                </select>
                <button className="button secondary" onClick={() => load()}><RefreshCw size={16} /> {t('admin.actions.refresh')}</button>
              </div>
            </div>
            {bigbabaClient && !bigbabaClient.has_real_stripe_activation && <p className="error-text">{String(bigbabaClient.email || 'Selected client')}: Brak kompletnego potwierdzenia live Stripe</p>}
            {loading && <p className="muted">{t('states.loading')}</p>}
            {!loading && !clients.length && <EmptyAdminState text={t('admin.clients.empty')} />}
          </section>
          <AdminTable rows={clients} columns={clientColumns} labels={tableLabels(t, clientColumns)} format={(key, value, row) => {
            if (key === 'id') return formatShortId(value);
            if (key === 'type') return row.account_type || row.client_type || row.role || 'client';
            if (key === 'activation') return <StatusBadge value={String(row.activation_status || row.client_state || 'client_free')} />;
            if (key === 'status') return <StatusBadge value={row.is_blocked ? 'blocked' : String(row.account_status || row.status || 'active')} />;
            if (key === 'provider') return row.payment_provider || row.provider || '-';
            if (['registered_at', 'last_login'].includes(key)) return formatDateTime(value);
            return value;
          }} actions={(client) => (
            <>
              <Action title={t('admin.actions.view')} onClick={() => openClientDetails(client)}><Eye size={15} /></Action>
              <Action title={t('admin.clients.activate')} onClick={() => action(() => api.setAdminClientActivation(token, String(client.id), 'client_activated'))}><UserCheck size={15} /></Action>
              <Action title={t('admin.clients.deactivate')} onClick={() => action(() => api.setAdminClientActivation(token, String(client.id), 'client_free'))}><UserX size={15} /></Action>
              <Action title={t('admin.clients.addCoins')} onClick={() => adjustClientCoins(client, 100)}><Coins size={15} /></Action>
              <Action title={client.is_blocked ? t('admin.clients.unblock') : t('admin.clients.block')} danger={Boolean(!client.is_blocked)} onClick={() => action(() => api.blockAdminClient(token, String(client.id), !client.is_blocked))}><Ban size={15} /></Action>
            </>
          )} />
          <section className="admin-card client-mobile-cards">
            {clients.map((client) => (
              <article className="admin-card" key={client.id}>
                <h3>{client.email}</h3>
                <p><StatusBadge value={String(client.account_status || 'free')} /> <StatusBadge value={String(client.activation_status || 'client_free')} /></p>
                <p>{Number(client.activation_amount || 0).toFixed(2)} EUR / {client.payment_provider || '-'}</p>
                <p>Coins: {client.coins || 0} / Referral: {client.referral_code || '-'}</p>
                {client.stripe_warning && <p className="error-text">{client.stripe_warning}</p>}
                <div className="admin-actions-row">
                  <Action title={t('admin.actions.view')} onClick={() => openClientDetails(client)}><Eye size={15} /></Action>
                  <Action title={t('admin.clients.addCoins')} onClick={() => adjustClientCoins(client, 100)}><Coins size={15} /></Action>
                </div>
              </article>
            ))}
          </section>
          <section className="admin-card">
            <div className="admin-actions-row">
              <button className="button" disabled={clientFilters.page <= 1} onClick={() => setClientFilters({ ...clientFilters, page: Math.max(1, clientFilters.page - 1) })}>Prev</button>
              <span>{clientFilters.page} / {totalPages} ({clientsTotal})</span>
              <button className="button" disabled={clientFilters.page >= totalPages} onClick={() => setClientFilters({ ...clientFilters, page: clientFilters.page + 1 })}>Next</button>
            </div>
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
              <div className="admin-actions-row">
                <label className="admin-action-btn">
                  {t('admin.accounts.importProfiles')}
                  <input hidden type="file" accept=".csv,.xlsx,.xls" onChange={(event) => setProfileImportFile(event.target.files?.[0] || null)} />
                </label>
                <button className="button" disabled={!profileImportFile || studioSaving} onClick={importProfiles}>{profileImportFile?.name || t('admin.accounts.import')}</button>
              </div>
            </div>
            {profileImportReport && <section className="admin-card">
              <h3>{t('admin.accounts.importReport')}</h3>
              <p>{t('admin.accounts.importSummary', { created: profileImportReport.created, skipped: profileImportReport.skipped, failed: profileImportReport.failed })}</p>
              {profileImportReport.errors.length ? <ul>{profileImportReport.errors.map((error) => <li key={`${error.row}-${error.email || ''}`}>{t('admin.accounts.importRowError', { row: error.row, email: error.email || '-', error: error.error })}</li>)}</ul> : null}
            </section>}
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
            <AdminTable rows={studioProfiles} columns={['cover', 'id', 'display_name', 'owner_email', 'city', 'category', 'visibility_audit', 'status', 'paid_status', 'photos', 'created_at']} labels={{ ...tableLabels(t, ['cover', 'id', 'display_name', 'owner_email', 'city', 'category', 'status', 'paid_status', 'photos', 'created_at']), visibility_audit: t('admin.visibility.publicVisibility') }} format={(key, value, profile) => {
              if (key === 'cover') return <AdminProfileThumb profile={profile} />;
              if (key === 'id') return (
                <label className="admin-check-cell">
                  <input type="checkbox" checked={selectedProfileIds.includes(profile.id)} onChange={() => toggleBulkProfile(profile.id)} aria-label={t('admin.bulk.toggleProfile')} />
                  {formatShortId(profile.id)}
                </label>
              );
              if (key === 'category') return option(String(value || 'other'));
              if (key === 'visibility_audit') return <ProfileVisibilityAudit audit={profile.visibility_audit} compact />;
              if (key === 'status') return <ProfileStatusBadges profile={profile} />;
              if (key === 'paid_status') return <ProfilePaidBadges profile={profile} />;
              if (key === 'photos') return profile.profile_images?.length || 0;
              if (key === 'created_at') return formatDate(value);
              return value;
            }} actions={(profile) => (
              <>
                <Action title={t('admin.actions.view')} onClick={() => openProfileOverview(profile)}><Eye size={15} /></Action>
                <Action title={t('admin.actions.edit')} onClick={() => editStudioProfile(profile)}><Pencil size={15} /></Action>
                <Action title={profile.is_published === false ? t('admin.actions.publish') : t('admin.actions.unpublish')} onClick={() => action(() => api.publishAdminProfile(token, profile.id, profile.is_published === false))}><Power size={15} /></Action>
                <Action title={t('admin.actions.approve')} onClick={() => action(() => api.moderateAdminProfile(token, profile.id, { moderation_status: 'approved', is_published: true }))}><UserCheck size={15} /></Action>
                <Action title={profile.status === 'suspended' || profile.moderation_status === 'suspended' ? t('admin.actions.unsuspend') : t('admin.actions.suspend')} danger onClick={() => action(() => api.setProfileStatus(token, profile.id, profile.status === 'suspended' || profile.moderation_status === 'suspended' ? 'active' : 'suspended'))}><Ban size={15} /></Action>
                <Link className="admin-action-btn icon" title={t('admin.actions.publicView')} aria-label={t('admin.actions.publicView')} to={`/profile/${profile.id}`}><ChevronRight size={15} /></Link>
              </>
            )} />
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
        { label: t('admin.subscriptions.stats.active'), value: subscriptionStats.active || subscriptions.filter((row) => row.status === 'active').length, badge: t('admin.status.active') },
        { label: t('admin.subscriptions.stats.expired'), value: subscriptionStats.expired || subscriptions.filter((row) => row.status === 'expired').length, badge: t('admin.status.expired') },
        { label: t('admin.subscriptions.stats.upcomingRenewals'), value: subscriptionStats.upcoming_renewals || subscriptions.filter((row) => subscriptionProgressInfo(readSubscriptionStart(row), readSubscriptionEnd(row)).state === 'active').length, badge: t('admin.subscriptions.renewals') },
        { label: t('admin.subscriptions.stats.sponsored'), value: subscriptions.filter(isSponsoredSubscription).length, badge: t('admin.status.sponsored') },
        { label: t('admin.subscriptions.stats.incomplete'), value: subscriptionStats.incomplete || 0, badge: t('admin.status.incomplete') }
      ];
      const subscriptionLabels = tableLabels(t, ['id', 'email', 'profile', 'plan', 'provider', 'status', 'start', 'end', 'progress', 'amount']);
      return (
        <>
          <section className="admin-metric-grid kpi-grid">{cards.map((card) => <AdminStatCard key={card.label} label={card.label} value={card.value} badge={card.badge} />)}</section>
          <AdminTable rows={subscriptions} columns={['id', 'email', 'profile', 'plan', 'provider', 'status', 'start', 'end', 'progress', 'amount_eur']} labels={{ ...subscriptionLabels, amount_eur: t('admin.table.amount') }} format={(key, value, row) => {
            if (key === 'id') return formatShortId(value || row.profile_id);
            if (key === 'provider') return row.payment_provider || row.provider || '-';
            if (key === 'status') return <StatusBadge value={isSponsoredSubscription(row) ? 'sponsored' : String(value || row.status || 'requested')} />;
            if (key === 'start') return formatDate(readSubscriptionStart(row));
            if (key === 'end') return formatDate(readSubscriptionEnd(row));
            if (key === 'progress') return <SubscriptionProgressCell row={row} t={t} />;
            if (key === 'amount_eur') return isSponsoredSubscription(row) ? formatEuro(0) : formatEuro(value);
            return value;
          }} actions={(row) => (
            <>
              {row.type === 'profile_subscription' ? (
                <>
                  <Action title={t('admin.subscriptionActions.activate30')} onClick={() => action(() => api.activateAdminSubscription(token, String(row.profile_id || row.id), { plan: row.plan || 'escort_monthly', days: 30 }).then(() => setMessage(t('admin.messages.subscriptionActivated'))))}><UserCheck size={15} /></Action>
                  <Action title={t('admin.subscriptionActions.extend30')} onClick={() => action(() => api.extendAdminSubscription(token, String(row.profile_id || row.id), 30).then(() => setMessage(t('admin.messages.subscriptionExtended'))))}><RefreshCw size={15} /></Action>
                  <Action title={t('admin.subscriptionActions.setCustomDates')} onClick={() => openSubscriptionDateEditor(row)}><Pencil size={15} /></Action>
                  <Action title={t('admin.subscriptionActions.expire')} danger onClick={() => action(() => api.expireAdminSubscription(token, String(row.profile_id || row.id)).then(() => setMessage(t('admin.messages.subscriptionExpired'))))}><Ban size={15} /></Action>
                  {row.profile_id && <Link className="admin-action-btn icon" title={t('admin.table.profile')} aria-label={t('admin.table.profile')} to={`/admin/profiles?profile=${encodeURIComponent(String(row.profile_id))}&from=subscriptions`}><ChevronRight size={15} /></Link>}
                </>
              ) : (
                <Action title={t('admin.actions.view')} onClick={() => setModal({ title: String(row.email || row.id), body: JSON.stringify(row, null, 2) })}><Eye size={15} /></Action>
              )}
            </>
          )} />
        </>
      );
    }

    if (view === 'revenue') {
      const realRevenuePayments = revenuePayments.filter(isRealRevenuePayment);
      const cards = [
        { label: t('admin.revenue.today'), value: formatEuro(revenueStats.today_revenue), badge: Number(revenueStats.today_revenue || 0) > 0 ? t('admin.dashboard.realRevenue') : t('admin.dashboard.noPaymentsShort') },
        { label: t('admin.revenue.month'), value: formatEuro(revenueStats.monthly_revenue), badge: t('admin.dashboard.realRevenue') },
        { label: t('admin.revenue.clientActivationRevenue'), value: formatEuro(revenueStats.client_activation_revenue || revenueStats.client_activation_revenue_eur), badge: t('admin.revenue.clientActivation') },
        { label: t('admin.revenue.escortSubscriptionsRevenue'), value: formatEuro(revenueStats.escort_subscriptions_revenue || revenueStats.escort_revenue), badge: t('admin.revenue.escortSubscriptions') },
        { label: t('admin.revenue.businessSubscriptionsRevenue'), value: formatEuro(revenueStats.business_subscriptions_revenue || revenueStats.business_revenue), badge: t('admin.revenue.businessSubscriptions') },
        { label: t('admin.revenue.coinsRevenue'), value: formatEuro(revenueStats.coins_revenue), badge: 'Coins' },
        { label: t('admin.revenue.sponsoredProfiles'), value: revenueStats.sponsored_profiles || subscriptions.filter(isSponsoredSubscription).length, badge: t('admin.dashboard.notRevenue') }
      ];
      return (
        <>
          <section className="admin-metric-grid kpi-grid">{cards.map((card) => <AdminStatCard key={card.label} label={card.label} value={card.value} badge={card.badge} />)}</section>
          <AdminTable rows={realRevenuePayments} columns={['id', 'email', 'type', 'amount', 'provider', 'stripe_ref', 'livemode', 'status', 'created_at']} labels={tableLabels(t, ['id', 'email', 'type', 'amount', 'provider', 'stripe_ref', 'livemode', 'status', 'created_at'])} format={(key, value, row) => {
            if (key === 'id') return formatShortId(value);
            if (key === 'amount') return formatEuro(value);
            if (key === 'type') return row.type || row.transaction_type || row.event_type || '-';
            if (key === 'stripe_ref') return row.stripe_payment_intent_id || row.stripe_session_id || row.stripe_checkout_session_id || row.stripe_subscription_id || row.stripe_ref || '-';
            if (key === 'livemode') return <StatusBadge value={row.livemode ? 'live' : 'test'} />;
            if (key === 'status') return <StatusBadge value={String(value || 'paid')} />;
            if (key === 'created_at') return formatDateTime(value);
            return value;
          }} />
        </>
      );
    }

    if (view === 'token-transactions' || view === 'payments' || view === 'manual-payment-orders') {
      const stripeTransactionColumns = ['email', 'transaction_type', 'amount', 'provider', 'stripe_ref', 'livemode', 'status', 'created_at'];
      const activationPaymentColumns = ['email', 'amount', 'currency', 'status', 'provider', 'livemode', 'stripe_session_id', 'stripe_payment_intent_id', 'created_at'];
      const manualPaymentOrderColumns = ['id', 'email', 'provider', 'purpose', 'product_label', 'amount_eur', 'status', 'payment_reference', 'instructions', 'created_at'];
      const filteredManualPaymentOrders = manualPaymentOrders.filter((order) => {
        const query = manualPaymentFilters.query.trim().toLowerCase();
        const haystack = [order.id, order.email, order.provider, order.status, order.payment_reference, order.metadata?.payment_reference].map((item) => String(item || '').toLowerCase()).join(' ');
        const providerMatch = manualPaymentFilters.provider === 'all' || String(order.provider || '') === manualPaymentFilters.provider;
        const statusMatch = manualPaymentFilters.status === 'all' || String(order.status || '') === manualPaymentFilters.status;
        return (!query || haystack.includes(query)) && providerMatch && statusMatch;
      });
      const purchaseColumns = ['email', 'user_id', 'token_amount', 'eur_price', 'bonus_tokens', 'status', 'created_at'];
      const tokenTransactionColumns = ['email', 'from_email', 'to_email', 'from_wallet_id', 'to_wallet_id', 'transaction_type', 'amount', 'status', 'created_at'];
      return (
        <>
          <section className="admin-card">
            <h2>Client activation payments</h2>
            <p>Jednorazowe platnosci 0.99 EUR z aktywacji klienta.</p>
          </section>
          <AdminTable rows={revenuePayments} columns={stripeTransactionColumns} labels={tableLabels(t, stripeTransactionColumns)} format={(key, value, row) => {
            if (key === 'amount') return formatEuro(value ?? row.amount_eur ?? (row.amount_cents == null ? 0 : Number(row.amount_cents) / 100));
            if (key === 'stripe_ref') return row.stripe_payment_intent_id || row.stripe_checkout_session_id || row.stripe_subscription_id || '-';
            if (key === 'livemode') return <StatusBadge value={row.livemode ? 'live' : 'test'} />;
            if (key === 'status') return <StatusBadge value={String(row.payment_status || value || 'paid')} />;
            if (key === 'created_at') return formatDateTime(value);
            return value;
          }} />
          <AdminTable rows={clientActivationPayments} columns={activationPaymentColumns} labels={tableLabels(t, activationPaymentColumns)} format={(key, value, row) => {
            if (key === 'amount') return formatEuro(value ?? row.amount_eur ?? (row.amount_cents == null ? 0 : Number(row.amount_cents) / 100));
            if (key === 'status') return <StatusBadge value={String(row.payment_status || value || 'paid')} />;
            if (key === 'livemode') return <StatusBadge value={row.livemode ? 'live' : 'test'} />;
            if (key === 'stripe_session_id') return row.stripe_session_id || row.stripe_checkout_session_id || row.stripe_debug || '-';
            if (key === 'stripe_payment_intent_id') return row.stripe_payment_intent_id || row.stripe_debug || '-';
            if (key === 'created_at') return formatDateTime(value);
            return value;
          }} />
          <section className="admin-card">
            <h2>{t('admin.payments.manualOrders')}</h2>
            <p>{t('admin.payments.manualOrdersHelp')}</p>
            <div className="admin-actions-row">
              <input placeholder={t('admin.payments.searchOrders')} value={manualPaymentFilters.query} onChange={(event) => setManualPaymentFilters({ ...manualPaymentFilters, query: event.target.value })} />
              <select value={manualPaymentFilters.provider} onChange={(event) => setManualPaymentFilters({ ...manualPaymentFilters, provider: event.target.value })}>
                {['all', 'manual', 'bank_transfer', 'crypto', 'ccbill', 'paysafe'].map((item) => <option key={item} value={item}>{item === 'all' ? t('admin.common.all') : item}</option>)}
              </select>
              <select value={manualPaymentFilters.status} onChange={(event) => setManualPaymentFilters({ ...manualPaymentFilters, status: event.target.value })}>
                {['all', 'pending', 'paid', 'rejected', 'cancelled'].map((item) => <option key={item} value={item}>{item === 'all' ? t('admin.common.all') : item}</option>)}
              </select>
            </div>
          </section>
          <AdminTable rows={filteredManualPaymentOrders} columns={manualPaymentOrderColumns} labels={tableLabels(t, manualPaymentOrderColumns)} format={(key, value, row) => {
            if (key === 'id') return formatShortId(value);
            if (key === 'amount_eur') return formatEuro(value);
            if (key === 'status') return <StatusBadge value={String(value || 'pending')} />;
            if (key === 'payment_reference') return value || row.metadata?.payment_reference || '-';
            if (key === 'created_at') return formatDateTime(value);
            return value;
          }} actions={(order) => (
            <>
              <Action title={t('admin.actions.approve')} disabled={String(order.status || '').toLowerCase() === 'paid'} onClick={() => action(() => api.approveManualPaymentOrder(token, String(order.id)))}><UserCheck size={15} /></Action>
              <Action title={t('admin.actions.reject')} danger disabled={Boolean(order.applied_at) || String(order.status || '').toLowerCase() === 'rejected'} onClick={() => action(() => api.rejectManualPaymentOrder(token, String(order.id), 'Rejected by admin'))}><Ban size={15} /></Action>
              <Action title={t('admin.actions.view')} onClick={() => setModal({ title: String(order.id), body: JSON.stringify(order, null, 2) })}><Eye size={15} /></Action>
            </>
          )} />
          <AdminTable rows={purchases} columns={purchaseColumns} labels={tableLabels(t, purchaseColumns)} format={(key, value) => {
            if (key === 'eur_price') return formatEuro(value);
            if (key === 'created_at') return formatDateTime(value);
            if (key === 'status') return <StatusBadge value={String(value || 'pending')} />;
            return value;
          }} actions={(purchase) => (
            <>
              <Action onClick={() => action(() => api.setPurchaseRequestStatus(token, purchase.id, 'approved'))}>{t('admin.actions.approve')}</Action>
              <Action danger onClick={() => action(() => api.setPurchaseRequestStatus(token, purchase.id, 'failed'))}>{t('admin.actions.reject')}</Action>
            </>
          )} />
          <AdminTable rows={transactions} columns={tokenTransactionColumns} labels={tableLabels(t, tokenTransactionColumns)} format={(key, value) => {
            if (key === 'amount') return Number(value || 0).toLocaleString();
            if (key === 'status') return <StatusBadge value={String(value || 'pending')} />;
            if (key === 'created_at') return formatDateTime(value);
            return value;
          }} />
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
      const filteredPhotos = photos.filter((photo) => {
        const haystack = [photo.profile_display_name, photo.owner_email, photo.city, photo.profile_id].join(' ').toLowerCase();
        if (photoFilters.status !== 'all' && String(photo.moderation_status || 'pending') !== photoFilters.status) return false;
        if (photoFilters.type !== 'all' && String(photo.image_type || adminPhotoType(photo)) !== photoFilters.type) return false;
        if (photoFilters.query && !haystack.includes(photoFilters.query.toLowerCase())) return false;
        return true;
      });
      return (
        <>
          <section className="admin-card admin-photo-filters">
            <div className="profile-studio-head compact">
              <div>
                <p className="eyebrow">{t('admin.nav.photos')}</p>
                <h2>{t('admin.photos.moderationTitle')}</h2>
              </div>
              <button className="button secondary" onClick={() => load()}><RefreshCw size={16} /> {t('admin.actions.refresh')}</button>
            </div>
            <div className="studio-filter-grid">
              <select value={photoFilters.status} onChange={(event) => setPhotoFilters({ ...photoFilters, status: event.target.value })}>
                {['all', 'pending', 'approved', 'rejected', 'blocked'].map((status) => <option key={status} value={status}>{status === 'all' ? t('admin.common.all') : t(`admin.status.${status}`)}</option>)}
              </select>
              <input placeholder={t('admin.photos.searchProfileEmail')} value={photoFilters.query} onChange={(event) => setPhotoFilters({ ...photoFilters, query: event.target.value })} />
              <select value={photoFilters.type} onChange={(event) => setPhotoFilters({ ...photoFilters, type: event.target.value })}>
                <option value="all">{t('admin.common.all')}</option>
                <option value="cover">{t('admin.photos.type.cover')}</option>
                <option value="gallery">{t('admin.photos.type.gallery')}</option>
              </select>
            </div>
          </section>
          <AdminTable rows={filteredPhotos} columns={['photo', 'profile', 'owner_email', 'city', 'moderation_status', 'image_type', 'created_at']} labels={tableLabels(t, ['photo', 'profile', 'owner_email', 'city', 'moderation_status', 'image_type', 'created_at'])} format={(key, value, photo) => {
            if (key === 'photo') return <AdminPhotoThumb photo={photo} onClick={() => setPhotoPreview(photo)} />;
            if (key === 'profile') return photo.profile_display_name || formatShortId(photo.profile_id);
            if (key === 'moderation_status') return <StatusBadge value={String(value || 'pending')} />;
            if (key === 'image_type') return t(`admin.photos.type.${String(value || adminPhotoType(photo))}`);
            if (key === 'created_at') return formatDateTime(value);
            return value;
          }} actions={(photo) => (
            <>
              <Action title={t('admin.actions.approve')} onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'approved'))}><UserCheck size={15} /></Action>
              <Action title={t('admin.actions.reject')} danger onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'rejected'))}><UserX size={15} /></Action>
              <Action title="Block" danger onClick={() => action(() => api.setPhotoStatus(token, photo.id, 'blocked'))}><Ban size={15} /></Action>
              {photo.profile_id && <Link className="admin-action-btn icon" title={t('admin.photos.openProfile')} aria-label={t('admin.photos.openProfile')} to={`/admin/profiles?profile=${encodeURIComponent(String(photo.profile_id))}`}><ChevronRight size={15} /></Link>}
            </>
          )} />
        </>
      );
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
      return <>
        <section className="admin-settings-grid">
          <AdminStatCard label={t('admin.settingsFields.price')} value="49.99 EUR" />
          <AdminStatCard label={t('admin.settingsFields.maxPhotos')} value="12" />
          <AdminStatCard label={t('admin.settingsFields.defaultLanguage')} value="DE" />
          <AdminStatCard label={t('admin.settingsFields.languages')} value="PL / DE / EN" />
          <AdminStatCard label={t('admin.locations.source')} value={adminLocationRows.length ? t('admin.locations.database') : t('admin.locations.fallback')} />
          <AdminStatCard label={t('admin.settingsFields.frozenModules')} value={t('admin.settingsFields.frozenModulesValue')} />
        </section>
        <section className="admin-card admin-inline-form">
          <h2>{t('admin.locations.title')}</h2>
          <input placeholder={t('admin.locations.countryCode')} value={newLocationRow.country_code} onChange={(event) => setNewLocationRow({ ...newLocationRow, country_code: event.target.value.toUpperCase().slice(0, 2) })} />
          <input placeholder={t('admin.locations.countryName')} value={newLocationRow.country_name} onChange={(event) => setNewLocationRow({ ...newLocationRow, country_name: event.target.value })} />
          <input placeholder={t('admin.locations.city')} value={newLocationRow.city} onChange={(event) => setNewLocationRow({ ...newLocationRow, city: event.target.value })} />
          <input placeholder={t('admin.locations.district')} value={newLocationRow.district || ''} onChange={(event) => setNewLocationRow({ ...newLocationRow, district: event.target.value })} />
          <input placeholder={t('admin.location.postalCode')} value={newLocationRow.postal_code || ''} onChange={(event) => setNewLocationRow({ ...newLocationRow, postal_code: event.target.value })} />
          <button className="button primary" onClick={() => action(() => api.createAdminLocationCatalog(token, newLocationRow).then(() => {
            setNewLocationRow({ country_code: 'DE', country_name: 'Germany', city: 'Berlin', district: '', postal_code: '', is_active: true, sort_order: 0 });
            setMessage(t('admin.messages.locationSaved'));
          }))}>{t('admin.locations.add')}</button>
        </section>
        <AdminTable rows={adminLocationRows} columns={['country_code', 'country_name', 'city', 'district', 'postal_code', 'is_active', 'sort_order']} labels={{
          country_code: t('admin.locations.countryCode'),
          country_name: t('admin.locations.countryName'),
          city: t('admin.locations.city'),
          district: t('admin.locations.district'),
          postal_code: t('admin.location.postalCode'),
          is_active: t('admin.common.enabled'),
          sort_order: t('admin.locations.sortOrder')
        }} />
      </>;
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

function adminViewTitle(view: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const titleKeys: Record<string, string> = {
    payments: 'admin.nav.transactions',
    'chat-manager': 'admin.nav.chat',
    push: 'admin.nav.notifications',
    'email-center': 'admin.nav.email'
  };
  return t(titleKeys[view] || `admin.nav.${view}`);
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

function clientQueryString(filters: Record<string, string | number>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== 'all') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : '';
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

function adminProfileCoverSrc(profile: Profile) {
  const raw = profile as Profile & Record<string, any>;
  const direct = raw.cover_url || raw.avatar_url || raw.image_url || raw.public_url;
  if (direct) return String(direct);

  const imageSets = [raw.profile_images, raw.images, raw.profile_photos, raw.photos].filter(Array.isArray) as Array<Array<Record<string, any>>>;
  const images = imageSets.flat();
  const cover = images.find((image) => image.is_cover || image.is_primary || image.is_cover_photo) || images[0];
  if (!cover) return '';
  return String(cover.public_url || cover.image_url || cover.url || cover.signed_url || cover.src || '');
}

function AdminProfileThumb({ profile }: { profile: Profile }) {
  const src = adminProfileCoverSrc(profile);
  return (
    <div className="admin-profile-thumb">
      {src ? <img src={src} alt="" loading="lazy" /> : <AdminCoverPlaceholder label={profile.display_name} />}
    </div>
  );
}

function adminPhotoSrc(photo: Record<string, any>) {
  return String(photo.signed_url || photo.image_url || photo.public_url || photo.url || photo.src || '');
}

function adminPhotoType(photo: Record<string, any>) {
  if (photo.image_type) return String(photo.image_type);
  if (photo.is_avatar) return 'avatar';
  if (photo.is_primary || photo.is_cover) return 'cover';
  return 'gallery';
}

function AdminPhotoThumb({ photo, onClick }: { photo: Record<string, any>; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? '' : adminPhotoSrc(photo);
  return (
    <button type="button" className="admin-photo-thumb" onClick={onClick} title={String(photo.storage_path || '')}>
      {src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <AdminCoverPlaceholder label="ER" />}
    </button>
  );
}

function AdminCoverPlaceholder({ label }: { label: string }) {
  return <div className="admin-cover-placeholder"><span>{label?.slice(0, 1) || 'ER'}</span></div>;
}

let adminGooglePlacesPromise: Promise<any> | null = null;

function loadGooglePlaces(apiKey: string) {
  if ((window as any).google?.maps?.places) return Promise.resolve((window as any).google);
  if (adminGooglePlacesPromise) return adminGooglePlacesPromise;

  adminGooglePlacesPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => {
      const google = (window as any).google;
      google?.maps?.places ? resolve(google) : reject(new Error('Google Places unavailable'));
    };
    script.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(script);
  });

  return adminGooglePlacesPromise;
}

function parseGooglePlace(place: any) {
  const components = Array.isArray(place.address_components) ? place.address_components : [];
  const byType = (type: string) => components.find((component: any) => component.types?.includes(type))?.long_name || '';
  const city = byType('locality') || byType('postal_town') || byType('administrative_area_level_2');
  const area = byType('sublocality') || byType('sublocality_level_1') || byType('neighborhood') || byType('administrative_area_level_3');
  const countryCode = components.find((component: any) => component.types?.includes('country'))?.short_name || byType('country');
  const postalCode = byType('postal_code');
  const latitude = place.geometry?.location?.lat ? Number(place.geometry.location.lat().toFixed(6)) : null;
  const longitude = place.geometry?.location?.lng ? Number(place.geometry.location.lng().toFixed(6)) : null;
  return {
    city,
    area,
    country: countryCode,
    postal_code: postalCode,
    latitude,
    longitude,
    label: place.formatted_address || place.name || ''
  };
}

function AdminStatCard({ label, value, badge }: { label: string; value: unknown; badge?: string }) {
  return <article className="admin-card stat"><span>{label}</span><strong>{String(value ?? 0)}</strong>{badge ? <small>{badge}</small> : null}</article>;
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

function getAdminLocationChoice(form: { location_mode?: string; location_visibility?: string; exact_address?: string | null; work_place_label?: string | null }) {
  if (form.location_visibility) return form.location_visibility;
  if (form.location_mode === 'exact_hidden' || form.location_mode === 'hidden') return 'hidden';
  if (form.location_mode === 'city_only') return 'city_only';
  if (form.location_mode === 'approximate' && form.exact_address) return 'exact';
  if (form.location_mode === 'approximate' || form.location_mode === 'postal_area') return 'postal_area';
  return form.work_place_label ? 'postal_area' : 'city_only';
}

function applyAdminLocationChoice<T extends { location_mode?: string; location_visibility?: string; latitude?: unknown; longitude?: unknown; exact_address?: string; work_place_label?: string }>(form: T, choice: string): T {
  // UI modes exact/postal_area/city_only/hidden are mapped to legacy DB modes approximate/city_only/exact_hidden.
  if (choice === 'hidden') return { ...form, location_visibility: 'hidden', location_mode: 'exact_hidden' };
  if (choice === 'city_only') return { ...form, location_visibility: 'city_only', location_mode: 'city_only', latitude: '', longitude: '' };
  if (choice === 'exact') return { ...form, location_visibility: 'exact', location_mode: 'approximate', work_place_label: form.exact_address || form.work_place_label || '' };
  return { ...form, location_visibility: 'postal_area', location_mode: 'approximate' };
}

function serviceCategoryLabel(category: string, t: (key: string) => string) {
  return t(`serviceCategory.${category}`);
}

function filterServicePricing(value: Record<string, any>, selectedServices: string[]) {
  const selected = new Set(selectedServices);
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => selected.has(key)));
}

function ServicePricingEditor({ selectedServices, servicePricing, currency, onChange }: { selectedServices: string[]; servicePricing: Record<string, any>; currency: string; onChange: (value: Record<string, any>) => void }) {
  const { t } = useI18n();
  const services = selectedServices.map((key) => ({ key, label: serviceLabel(key) }));
  function update(key: string, patch: Record<string, unknown>) {
    const current = servicePricing?.[key] || { mode: 'included', extra_price: null };
    onChange({ ...servicePricing, [key]: { ...current, ...patch } });
  }
  return (
    <div className="service-pricing-editor">
      <h3>{t('pricing.servicePricing')}</h3>
      <p className="muted">{t('pricing.selectedServicesPricingHelp')}</p>
      {services.length ? services.map((service) => {
        const item = servicePricing?.[service.key] || { mode: 'included', extra_price: null };
        return <div className="service-pricing-row" key={service.key}>
          <strong>{service.label}</strong>
          <select value={item.mode || 'included'} onChange={(event) => update(service.key, { mode: event.target.value, extra_price: event.target.value === 'included' ? null : item.extra_price || 0 })}>
            <option value="included">{t('pricing.includedInPrice')}</option>
            <option value="extra">{t('pricing.extraPaid')}</option>
          </select>
          {item.mode === 'extra' && <input type="number" min="0" placeholder={`${t('pricing.extraPrice')} (${currency})`} value={item.extra_price ?? ''} onChange={(event) => update(service.key, { extra_price: event.target.value ? Number(event.target.value) : null })} />}
        </div>;
      }) : <p className="muted">{t('admin.services.noneSelected')}</p>}
    </div>
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
        <small>{t('admin.subscriptions.progressPercent', { percent: 0 })} / {t('admin.subscriptions.timelineInactive')}</small>
      </div>
    );
  }

  return (
    <div className={`subscription-progress ${info.state}`}>
      <span>{info.state === 'expired' ? t('admin.status.expired') : t('admin.subscriptions.timerActive')}</span>
      <div><i style={{ width: `${info.percent}%` }} /></div>
      <small>
        {t('admin.subscriptions.progressPercent', { percent: info.percent })} / {formatDateInput(start) || '-'} - {formatDateInput(end) || '-'}
      </small>
      <small>{info.daysLeft > 0 ? t('admin.subscriptions.daysLeftValue', { count: info.daysLeft }) : t('admin.status.expired')}</small>
      <small>{t('admin.subscriptions.timeline', { status: t(`admin.status.${String(row.status || info.state)}`) })}</small>
    </div>
  );
}

function revenueLabel(value: unknown, emptyText: string) {
  const numeric = Number(value || 0);
  return numeric > 0 ? `${numeric.toFixed(2)} EUR` : emptyText;
}

function formatEuro(value: unknown) {
  const amount = Number(value || 0);
  return `${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'} \u20ac`;
}

function formatShortId(value: unknown) {
  const text = String(value || '');
  return text ? text.slice(0, 8) : '-';
}

function formatDate(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '-';
}

function formatDateTime(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '-';
}

function isSponsoredSubscription(row: Record<string, any>) {
  const provider = String(row.payment_provider || row.provider || row.subscription_managed_by || '').toLowerCase();
  const source = String(row.acquisition_source || row.type || row.plan || row.listing_plan || '').toLowerCase();
  return Boolean(row.is_sponsored || row.sponsored || provider.includes('manual_admin') || source.includes('sponsored') || source.includes('admin_sponsored'));
}

function isRealRevenuePayment(row: Record<string, any>) {
  const provider = String(row.provider || row.payment_provider || row.subscription_managed_by || '').toLowerCase();
  const type = String(row.type || row.source || '').toLowerCase();
  if (provider.includes('manual_admin') || provider.includes('admin_sponsored')) return false;
  if (type.includes('manual_admin') || type.includes('sponsored')) return false;
  return Number(row.amount || row.amount_eur || row.amount_cents || 0) > 0 || Boolean(row.stripe_payment_intent_id || row.stripe_session_id || row.stripe_ref);
}

function ProfileStatusBadges({ profile }: { profile: Profile }) {
  const online = profile.operator_status === 'ONLINE_NOW' || profile.available_now;
  return (
    <span className="admin-badge-stack">
      <StatusBadge value={online ? 'online' : 'offline'} />
      {profile.is_published === false ? <StatusBadge value="hidden" /> : null}
      <StatusBadge value={profile.moderation_status || profile.verification_status || profile.status || 'pending'} />
    </span>
  );
}

function ProfileVisibilityAudit({ audit, compact = false }: { audit?: Profile['visibility_audit']; compact?: boolean }) {
  const { t } = useI18n();
  if (!audit) return <span className="admin-badge-stack"><StatusBadge value="unknown" /></span>;
  const reason = audit.reasons?.[0] || 'visible';
  const checks: Array<[string, boolean]> = [
    ['city', audit.checks.cityMatches],
    ['category', audit.checks.categoryMatches],
    ['moderation', audit.checks.moderationApproved],
    ['publication', audit.checks.published],
    ['subscription', audit.checks.subscriptionActiveOrTrialOrSeed],
    ['radar', audit.checks.hasRadarLocation]
  ];
  return (
    <span className="admin-badge-stack">
      <StatusBadge value={audit.isPublicVisible ? 'visible' : 'hidden'} />
      <small>{audit.isPublicVisible ? t('admin.visibility.visible') : t('admin.visibility.hidden')}</small>
      <small>{t('admin.visibility.reason')}: {t(`admin.visibility.reason.${reason}`)}</small>
      {!compact && checks.map(([key, value]) => (
        <small key={key}>{t(`admin.visibility.${key}`)}: {value ? t('admin.common.yes') : t('admin.common.no')}</small>
      ))}
    </span>
  );
}

function ProfilePaidBadges({ profile }: { profile: Profile }) {
  return (
    <span className="admin-badge-stack">
      {profile.is_sponsored ? <StatusBadge value="sponsored" /> : null}
      <StatusBadge value={['active', 'trial', 'test'].includes(String(profile.subscription_status)) ? 'paid' : String(profile.subscription_status || 'free')} />
    </span>
  );
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

function getAdminLocationCountries(rows: LocationCatalogRow[]) {
  const countries = new Map<string, { code: string; name: string; cities: { name: string; districts: string[] }[] }>();
  locationCatalog.forEach((country) => {
    countries.set(country.code, {
      code: country.code,
      name: country.name,
      cities: country.cities.map((city) => ({ name: city.name, districts: [...city.districts] }))
    });
  });
  rows
    .filter((row) => row.is_active !== false)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
    .forEach((row) => {
      const code = String(row.country_code || 'DE').toUpperCase();
      const country = countries.get(code) || { code, name: row.country_name || code, cities: [] };
      const cityName = String(row.city || '').trim();
      if (!cityName) return;
      let city = country.cities.find((item) => normalizeLocationValue(item.name) === normalizeLocationValue(cityName));
      if (!city) {
        city = { name: cityName, districts: [] };
        country.cities.push(city);
      }
      const district = String(row.district || '').trim();
      if (district && !city.districts.some((item) => normalizeLocationValue(item) === normalizeLocationValue(district))) {
        city.districts.push(district);
      }
      countries.set(code, country);
    });
  return Array.from(countries.values());
}

function getAdminLocationCountry(countries: ReturnType<typeof getAdminLocationCountries>, value: string | null | undefined) {
  const normalized = normalizeLocationValue(value || '');
  return countries.find((country) => normalizeLocationValue(country.code) === normalized || normalizeLocationValue(country.name) === normalized) || countries[0] || locationCatalog[0];
}

function getAdminLocationCity(country: ReturnType<typeof getAdminLocationCountries>[number], value: string | null | undefined) {
  const normalized = normalizeLocationValue(value || '');
  return country.cities.find((city) => normalizeLocationValue(city.name) === normalized) || null;
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
                {columns.map((column) => <td key={column} data-label={labels?.[column] || column}><CellValue value={format ? format(column, row[column], row) : row[column]} /></td>)}
                {actions && <td data-label={labels?.actions || 'Actions'}><div className="admin-actions-row">{actions(row)}</div></td>}
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

function adminAccountTypeToUi(value: unknown) {
  const next = String(value || '').toLowerCase();
  if (next === 'business') return 'business';
  if (next === 'admin') return 'admin';
  if (next === 'client') return 'client';
  return 'advertiser';
}

function adminAccountTypeToBackend(value: unknown) {
  const next = String(value || '').toLowerCase();
  if (next === 'business') return 'business';
  if (next === 'client') return 'private';
  if (next === 'admin') return 'private';
  return 'escort';
}

function adminProfileTypeToUi(value: unknown) {
  const next = String(value || '').toLowerCase();
  if (next === 'private_escort') return 'independent';
  if (next === 'club_party') return 'club';
  return adminProfileTypeOptions.includes(next) ? next : 'independent';
}

function adminProfileTypeToBackend(value: unknown) {
  const next = String(value || '').toLowerCase();
  if (next === 'independent') return 'private_escort';
  return adminProfileTypeOptions.includes(next) ? next : 'private_escort';
}

function StatusBadge({ value }: { value: string }) {
  const safeValue = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return <span className={`admin-status ${safeValue}`}>{String(value || 'unknown').replace(/_/g, ' ').toUpperCase()}</span>;
}

function Action({ children, onClick, danger = false, disabled = false, title }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }) {
  return <button type="button" title={title} aria-label={title} disabled={disabled} className={`${danger ? 'admin-action-btn danger' : 'admin-action-btn'} ${title ? 'icon' : ''}`} onClick={onClick}>{children}</button>;
}

function adminAccountErrorMessage(error: unknown, t: (key: string, vars?: Record<string, string | number>) => string) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('auth_user_missing')) return t('admin.accounts.authUserMissing');
  if (message.includes('auth_user_exists')) return t('admin.accounts.authUserExists');
  if (message.includes('passwords_do_not_match')) return t('admin.accounts.passwordsDoNotMatch');
  if (message.includes('password_too_short')) return t('admin.accounts.passwordTooShort');
  if (message.includes('valid_email_required')) return t('admin.accounts.validEmailRequired');
  if (message.includes('owner_email_required')) return t('admin.accounts.ownerEmailRequired');
  if (message.includes('auth_user_linked_elsewhere')) return t('admin.accounts.authUserLinkedElsewhere');
  return message || t('states.requestFailed');
}
