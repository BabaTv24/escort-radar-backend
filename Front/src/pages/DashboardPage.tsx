import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, Clock, Copy, CreditCard, Flame, Gem, Gift, Heart, ImagePlus, Lock, LogOut, MessageCircle, QrCode, RadioTower, Sparkles, UploadCloud, UserRound, Video, Wand2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { BookingRequest, ClientActivation, ClientProfile, CoinTransaction, CoinWallet, Gift as GiftRow, Profile, ProfileImage, Tag } from '../types';
import type { Wallet } from '../types';
import { ProfileCard } from '../components/ProfileCard';
import { useI18n } from '../i18n';
import {
  audienceOptions,
  bodyTypeOptions,
  categoryOptions,
  defaultServiceMenuNames,
  experienceTypeOptions,
  hairColorOptions,
  orientationOptions,
  originOptions,
  paymentMethodOptions,
  radiusOptions,
  availabilityStatusOptions,
  accountTypeOptions,
  serviceTagOptions,
  toggleArrayValue,
  visitTypeOptions
} from '../data/filterOptions';

const emptyProfile: Partial<Profile> = {
  display_name: '',
  account_type: 'private',
  primary_phone: '',
  additional_phones: [],
  phone_owner_identity_label: '',
  phone_rule_confirmed: false,
  city: 'berlin',
  area: '',
  category: 'ladies',
  description: '',
  age: 25,
  height: 170,
  body_type: '',
  body_features: [],
  hair_color: '',
  origin: '',
  experience_type: '',
  languages: ['EN'],
  orientation: '',
  audience: [],
  visit_types: [],
  service_tags: [],
  tag_ids: [],
  payment_methods: [],
  availability_note: '',
  availability_status: 'unavailable',
  service_radius_km: 25,
  approximate_location_area: '',
  latitude: null,
  longitude: null,
  price_30min: 120,
  price_1h: 200,
  price_2h: 360,
  price_night: 900,
  outcall_fee: 50,
  currency: 'EUR',
  service_menu: defaultServiceMenuNames.map((name, index) => ({
    name,
    enabled: index < 4,
    included: index < 2,
    extra_price: index < 2 ? null : 50,
    note: ''
  })),
  available_now: false,
  mobile_service: false,
  private_studio: false
};

const authIntentStorageKey = 'escortRadar.authIntent';
const allowedAuthAccountTypes = ['client', 'escort', 'business'] as const;
const allowedIdentities = ['male', 'female', 'trans'];
type AuthAccountType = typeof allowedAuthAccountTypes[number];

export function DashboardPage() {
  const [token, setToken] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [profile, setProfile] = useState<Partial<Profile>>(emptyProfile);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [message, setMessage] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [dashboardStatus, setDashboardStatus] = useState<'idle' | 'loading' | 'saving' | 'success' | 'error'>('idle');
  const [profileMode, setProfileMode] = useState<'create' | 'edit'>('create');
  const [activeWizardStep, setActiveWizardStep] = useState(1);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [authAccountType, setAuthAccountType] = useState<AuthAccountType>('client');
  const [platformTags, setPlatformTags] = useState<Tag[]>([]);
  const [contentTab, setContentTab] = useState('photos');
  const [creatorTab, setCreatorTab] = useState('listing');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [lastApiError, setLastApiError] = useState('');
  const [clientActivation, setClientActivation] = useState<ClientActivation | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [coinWallet, setCoinWallet] = useState<CoinWallet | null>(null);
  const [coinTransactions, setCoinTransactions] = useState<CoinTransaction[]>([]);
  const [giftsSent, setGiftsSent] = useState<GiftRow[]>([]);
  const [giftsReceived, setGiftsReceived] = useState<GiftRow[]>([]);
  const [activationBusy, setActivationBusy] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, option } = useI18n();

  useEffect(() => {
    api.tags().then((data) => setPlatformTags(data.tags)).catch(() => setPlatformTags([]));
    supabase.auth.getSession().then(async ({ data }) => {
      await activateSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await activateSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function activateSession(session: Session | null) {
    setToken(session?.access_token || '');
    setUserEmail(session?.user.email || '');

    if (!session?.access_token) {
      setAuthAccountType('client');
      return;
    }

    const role = await resolveBackendAuthAccountType(session.access_token);
    setAuthAccountType(role);

    if (role === 'client') {
      await loadClientDashboard(session.access_token);
      return;
    }

    await loadDashboard(session.access_token);
  }

  async function syncStoredAuthIntent(): Promise<Record<string, string> | null> {
    const stored = localStorage.getItem(authIntentStorageKey);
    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      const metadata: Record<string, string> = {};
      if (allowedAuthAccountTypes.includes(String(parsed.auth_account_type) as AuthAccountType)) {
        metadata.auth_account_type = String(parsed.auth_account_type);
      }
      if (allowedIdentities.includes(String(parsed.identity))) {
        metadata.identity = String(parsed.identity);
      }
      if (parsed.referred_by_code) {
        metadata.referred_by_code = String(parsed.referred_by_code);
      }
      if (!Object.keys(metadata).length) return null;

      const { error } = await supabase.auth.updateUser({ data: metadata });
      if (!error) localStorage.removeItem(authIntentStorageKey);
      return error ? null : metadata;
    } catch {
      return null;
    }
  }

  async function resolveBackendAuthAccountType(accessToken: string): Promise<AuthAccountType> {
    try {
      const data = await api.authMe(accessToken);
      setClientProfile(data.client_profile);
      return resolveAuthAccountType(data.user.app_metadata || { auth_account_type: data.user.auth_account_type });
    } catch {
      setClientProfile(null);
      return 'client';
    }
  }

  async function loadClientDashboard(accessToken: string) {
    setDashboardStatus('loading');
    try {
      await api.myWallet(accessToken).then((data) => setWallet(data.wallet)).catch(() => setWallet(null));
      const clientData = await api.clientActivationMe(accessToken);
      setClientActivation(clientData.activation);
      setCoinWallet(clientData.wallet);
      setCoinTransactions(clientData.transactions);
      setGiftsSent(clientData.gifts_sent);
      setGiftsReceived(clientData.gifts_received);
      const checkoutSessionId = searchParams.get('activation_session_id');
      if (checkoutSessionId && clientData.activation.state !== 'client_activated') {
        const confirmed = await api.confirmClientActivation(accessToken, checkoutSessionId);
        setClientActivation(confirmed.activation);
        const refreshed = await api.clientActivationMe(accessToken);
        setCoinWallet(refreshed.wallet);
        setCoinTransactions(refreshed.transactions);
        setGiftsSent(refreshed.gifts_sent);
        setGiftsReceived(refreshed.gifts_received);
        setSearchParams({});
      }
      setSavedProfile(null);
      setProfile({ ...emptyProfile });
      setProfileMode('create');
      setMessage(t('dashboard.client.ready'));
      setDashboardStatus('success');
    } catch {
      setDashboardStatus('error');
      setMessage(t('states.requestFailed'));
    }
  }

  async function loadBookingRequests(accessToken: string) {
    try {
      const data = await api.myBookingRequests(accessToken);
      setBookingRequests(data.booking_requests);
    } catch {
      setBookingRequests(demoBookingRequests);
    }
  }

  async function loadDashboard(accessToken: string) {
    setDashboardStatus('loading');
    try {
      const [profileData] = await Promise.all([
        api.myProfile(accessToken),
        loadBookingRequests(accessToken),
        api.myWallet(accessToken).then((data) => setWallet(data.wallet)).catch(() => undefined)
      ]);

      if (profileData.profile) {
        setSavedProfile(profileData.profile);
        setProfile(profileToForm(profileData.profile));
        setProfileMode('edit');
        setMessage(t('dashboard.profileLoaded'));
      } else {
        setSavedProfile(null);
        setProfile({ ...emptyProfile });
        setProfileMode('create');
        setMessage(t('dashboard.noProfileYet'));
      }
      setDashboardStatus('success');
    } catch (error) {
      setDashboardStatus('error');
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setAuthStatus('idle');
    setDashboardStatus('saving');
    setMessage(t('dashboard.saving'));
    if (!token) return setMessage(t('dashboard.signInFirst'));
    if (!isAdvertiserAccount(authAccountType)) {
      setDashboardStatus('error');
      return setMessage('To jest funkcja dla ogłoszeniodawców. Utwórz konto Escort lub Business.');
    }

    try {
      const body = prepareProfilePayload(profile, savedProfile);
      const result = savedProfile
        ? await api.updateProfile(token, savedProfile.id, body)
        : await api.createProfile(token, body);

      setSavedProfile(result.profile);
      setProfile(profileToForm(result.profile));
      await loadDashboard(token);
      setProfileMode('edit');
      setDashboardStatus('success');
      setMessage(t('dashboard.saved'));
      setLastApiError('');
    } catch (error) {
      setDashboardStatus('error');
      const nextError = error instanceof Error ? error.message : t('states.requestFailed');
      setMessage(nextError);
      setLastApiError(nextError);
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token || !savedProfile) return;
    if (!isAdvertiserAccount(authAccountType)) {
      setDashboardStatus('error');
      setUploadStatus('error');
      return setMessage('To jest funkcja dla ogłoszeniodawców. Utwórz konto Escort lub Business.');
    }
    setAuthStatus('idle');
    setDashboardStatus('saving');
    setUploadStatus('uploading');
    setMessage('');
    if (file.size > 8 * 1024 * 1024) {
      setDashboardStatus('error');
      setUploadStatus('error');
      return setMessage(t('photos.fileTooLarge'));
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setDashboardStatus('error');
      setUploadStatus('error');
      return setMessage(t('photos.unsupportedFormat'));
    }
    if ((savedProfile.profile_images?.length || 0) >= (savedProfile.max_photos || 6)) {
      setDashboardStatus('error');
      return setMessage(t('photos.maxReached'));
    }
    const form = new FormData();
    form.set('profile_id', savedProfile.id);
    form.set('image', file);
    try {
      const result = await api.uploadImage(token, form);
      const nextProfile = {
        ...savedProfile,
        profile_images: [...(savedProfile.profile_images || []), result.image as ProfileImage]
      };
      setSavedProfile(nextProfile);
      setProfile(profileToForm(nextProfile));
      await loadDashboard(token);
      setDashboardStatus('success');
      setUploadStatus('success');
      setMessage(t('dashboard.imageUploaded'));
      setLastApiError('');
      event.target.value = '';
    } catch (error) {
      setDashboardStatus('error');
      setUploadStatus('error');
      const nextError = error instanceof Error ? error.message : t('photos.uploadFailed');
      setMessage(nextError);
      setLastApiError(nextError);
    }
  }

  async function setCoverImage(imageId: string) {
    if (!token) return;
    setDashboardStatus('saving');
    try {
      await api.setCoverImage(token, imageId);
      await loadDashboard(token);
      setDashboardStatus('success');
      setMessage(t('creator.coverSaved'));
      setLastApiError('');
    } catch (error) {
      setDashboardStatus('error');
      const nextError = error instanceof Error ? error.message : t('states.requestFailed');
      setMessage(nextError);
      setLastApiError(nextError);
    }
  }

  async function deleteImage(imageId: string) {
    if (!token) return;
    setDashboardStatus('saving');
    try {
      await api.deleteImage(token, imageId);
      await loadDashboard(token);
      setDashboardStatus('success');
      setMessage(t('photos.deleted'));
      setLastApiError('');
    } catch (error) {
      setDashboardStatus('error');
      const nextError = error instanceof Error ? error.message : t('states.requestFailed');
      setMessage(nextError);
      setLastApiError(nextError);
    }
  }

  function resetChanges() {
    setProfile(savedProfile ? profileToForm(savedProfile) : { ...emptyProfile });
    setMessage(savedProfile ? t('dashboard.profileLoaded') : t('dashboard.noProfileYet'));
    setDashboardStatus('idle');
  }

  async function logout() {
    await supabase.auth.signOut();
    setToken('');
    setUserEmail('');
    setSavedProfile(null);
    setProfile({ ...emptyProfile });
    setWallet(null);
    setCoinWallet(null);
    setClientActivation(null);
    setClientProfile(null);
    setCoinTransactions([]);
    setGiftsSent([]);
    setGiftsReceived([]);
  }

  async function startClientActivation() {
    if (!token) return;
    setActivationBusy(true);
    setMessage('');
    try {
      const referredByCode = localStorage.getItem('escortRadar.referralCode');
      const checkout = await api.clientActivationCheckout(token, referredByCode);
      window.location.href = checkout.checkout_url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setActivationBusy(false);
    }
  }

  async function uploadClientAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setAvatarUploading(true);
    setMessage('');
    const form = new FormData();
    form.set('image', file);
    try {
      const result = await api.uploadClientAvatar(token, form);
      setClientProfile(result.client_profile);
      setMessage('Avatar zapisany.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  }

  if (!token) {
    return (
      <div className="dashboard-guest-shell">
        <div className="onboarding-bg" />
        <section className="dashboard-guest-hero">
          <div className="onboarding-copy">
            <p className="eyebrow">{t('dashboard.guestEyebrow')}</p>
            <h1>{t('dashboard.guestTitle')}</h1>
            <p>{t('dashboard.guestSubtitle')}</p>
            <div className="onboarding-points">
              <span>{t('subscription.price')}</span>
              <span>{t('tokens.title')}</span>
              <span>{t('baba.manualModeration')}</span>
            </div>
            <div className="hero-actions">
              <Link to="/register?type=client" className="button primary">{t('dashboard.client.createFree')}</Link>
              <Link to="/register?type=escort" className="button">{t('dashboard.creator.createPremium')}</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (authAccountType === 'client') {
    return (
      <ClientDashboard
        userEmail={userEmail}
        wallet={wallet}
        coinWallet={coinWallet}
        clientProfile={clientProfile}
        activation={clientActivation}
        transactions={coinTransactions}
        giftsSent={giftsSent}
        giftsReceived={giftsReceived}
        message={message}
        activationBusy={activationBusy}
        avatarUploading={avatarUploading}
        onActivate={startClientActivation}
        onAvatarUpload={uploadClientAvatar}
        onLogout={logout}
      />
    );
  }

  if (authAccountType === 'business') {
    return (
      <BusinessDashboard
        userEmail={userEmail}
        message={message}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <p className="eyebrow">{t('dashboard.creator.eyebrow')}</p>
        <h1>{t('dashboard.creator.title')}</h1>
        <p>{t('dashboard.creator.subtitle')}</p>
        <div className="wizard-progress">
          {Array.from({ length: 8 }, (_, index) => index + 1).map((step) => (
            <button key={step} className={activeWizardStep === step ? 'active' : activeWizardStep > step ? 'done' : ''} type="button" onClick={() => setActiveWizardStep(step)}>
              {step} {t(`wizard.step${step}`)}
            </button>
          ))}
        </div>
      </section>

      <CreatorHeroPanel
        profile={profile}
        savedProfile={savedProfile}
        wallet={wallet}
        userEmail={userEmail}
        onUpload={() => document.getElementById('creator-media-upload')?.click()}
        onLogout={logout}
      />

      <section className="creator-command-bar">
        <div>
          <strong>{t('auth.signedInAs', { email: userEmail })}</strong>
          <span className={dashboardStatus === 'error' ? 'error-text' : 'success'}>{message || t('dashboard.profileLoaded')}</span>
        </div>
        <div className="creator-command-actions">
          <button className="button primary" type="button" onClick={(event) => saveProfile(event as unknown as FormEvent)} disabled={dashboardStatus === 'saving'}>{dashboardStatus === 'saving' ? t('dashboard.saving') : t('buttons.saveProfile')}</button>
          {savedProfile && <Link className="button" to={`/profile/${savedProfile.id}`}>{t('dashboard.viewPublicProfile')}</Link>}
          <button className="button danger" type="button" onClick={logout}>{t('buttons.logout')}</button>
        </div>
      </section>

      <nav className="creator-studio-tabs">
        {['listing', 'media', 'services', 'pricing', 'live', 'referral', 'privacy', 'visibility'].map((tab) => (
          <button key={tab} type="button" className={creatorTab === tab ? 'active' : ''} onClick={() => setCreatorTab(tab)}>
            {t(`creator.dashboardTabs.${tab}`)}
          </button>
        ))}
      </nav>
      <div className="creator-onboarding-progress">
        {['account', 'profileType', 'photos', 'location', 'pricing', 'services', 'live', 'visibility', 'publish'].map((step, index) => (
          <button key={step} type="button" className={getWizardStepClass(index, creatorTab)} onClick={() => setCreatorTab(mapWizardStepToTab(step))}>
            <span>{index + 1}</span>{t(`creator.wizard.${step}`)}
          </button>
        ))}
      </div>

      {creatorTab === 'referral' && <section className="creator-command-grid">
        <CreatorMonetizationPanel wallet={wallet} bookings={bookingRequests.length} profile={savedProfile} />
        <ReferralStudio profile={savedProfile} />
      </section>}

      {creatorTab !== 'media' && creatorTab !== 'live' && creatorTab !== 'referral' && creatorTab !== 'privacy' && <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="form-panel elevated">
            <h2><Lock size={18} /> {t('dashboard.account')}</h2>
            <p className="baba-auth-line">{t('baba.builtWith')}</p>
            {userEmail && <p className="success">{t('auth.signedInAs', { email: userEmail })}</p>}
            {message && <p className={authStatus === 'error' ? 'error-text' : 'success'}>{message}</p>}
          </section>

          <section className="token-mini-panel">
            <div>
              <p className="eyebrow">{t('tokens.eyebrow')}</p>
              <h2>{t('tokens.balance')}</h2>
            </div>
            <strong>{Math.round(Number(wallet?.escort_token_balance || 0))} {t('tokens.short')}</strong>
            <Link className="button" to="/tokens">{t('tokens.openShop')}</Link>
          </section>

          <form className="stack" onSubmit={saveProfile}>
            {creatorTab === 'visibility' && <section className="form-panel elevated">
              <h2>{t('wizard.step1')} · {t('dashboard.accountType')}</h2>
              <div className="account-type-grid">
                {accountTypeOptions.map((item) => (
                  <button key={item} type="button" className={profile.account_type === item ? 'account-type-card selected' : 'account-type-card'} onClick={() => setProfile({ ...profile, account_type: item as Profile['account_type'] })}>
                    <strong>{t(`accountType.${item}`)}</strong>
                    {item === 'private' && <span>{t('accountType.privateDescription')}</span>}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <input placeholder={t('form.primaryPhone')} value={profile.primary_phone || ''} onChange={(event) => setProfile({ ...profile, primary_phone: event.target.value })} />
                <input placeholder={t('form.additionalPhones')} value={(profile.additional_phones || []).join(', ')} onChange={(event) => setProfile({ ...profile, additional_phones: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
                <input placeholder={t('form.phoneOwnerIdentity')} value={profile.phone_owner_identity_label || ''} onChange={(event) => setProfile({ ...profile, phone_owner_identity_label: event.target.value })} />
              </div>
              {profile.account_type === 'private' && <p className="subscription-notice">{t('phone.privateWarning')}</p>}
              <label className="premium-check"><input type="checkbox" checked={Boolean(profile.phone_rule_confirmed)} onChange={(event) => setProfile({ ...profile, phone_rule_confirmed: event.target.checked })} /> {t('phone.confirmSameOwner')}</label>
              {savedProfile?.phone_conflict_status && savedProfile.phone_conflict_status !== 'clear' && <p className="error-text">{t(`phoneConflict.${savedProfile.phone_conflict_status}`)}</p>}
            </section>}

            {creatorTab === 'visibility' && <section className="listing-status-panel">
              <div>
                <p className="eyebrow">{profileMode === 'edit' ? t('dashboard.editListing') : t('dashboard.createListing')}</p>
                <h2>{t('dashboard.listingStatus')}</h2>
                <p>{getVisibilityReason(savedProfile, t)}</p>
              </div>
              <div className="badges">
                <span>{savedProfile?.is_test_account ? t('dashboard.testAccount') : t('dashboard.standardAccount')}</span>
                <span>{t(`admin.verification.${savedProfile?.verification_status || 'pending'}`)}</span>
                <span>{t(`status.${savedProfile?.status || 'pending'}`)}</span>
              </div>
              <VisibilityChecklist profile={savedProfile} />
              {savedProfile?.public_user_id && (
                <div className="referral-box">
                  <span>{t('referral.myId')}: {savedProfile.public_user_id}</span>
                  <span>{t('referral.myLink')}: https://escort-radar.fun/r/{savedProfile.referral_code}</span>
                  <span>{t('referral.count')}: {savedProfile.referral_count || 0}</span>
                  <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(`https://escort-radar.fun/r/${savedProfile.referral_code}`)}>{t('referral.copy')}</button>
                </div>
              )}
            </section>}

            {creatorTab === 'visibility' && <section className="subscription-card">
              <div>
                <p className="eyebrow">{t('dashboard.subscription')}</p>
                <h2><CreditCard size={20} /> {t('subscription.title')}</h2>
                <strong>{t('subscription.price')}</strong>
                <p>{t('subscription.features')}</p>
                <p className="subscription-notice">
                  {savedProfile?.is_test_account ? t('subscription.testNotice') : t('subscription.notice')}
                </p>
              </div>
              <button className="button primary" type="button" disabled>{t('subscription.activate')}</button>
            </section>}

            {creatorTab === 'listing' && <section className="form-panel elevated">
              <h2><UserRound size={18} /> {t('dashboard.basic')}</h2>
              <div className="form-grid">
                <input placeholder={t('form.displayName')} value={profile.display_name || ''} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} required />
                <select value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })}>
                  {['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'].map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                <input placeholder={t('form.area')} value={profile.area || ''} onChange={(event) => setProfile({ ...profile, area: event.target.value })} />
                <select value={profile.category || 'other'} onChange={(event) => setProfile({ ...profile, category: event.target.value })}>
                  {categoryOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
                </select>
                <input placeholder={t('form.languages')} value={String(profile.languages || '')} onChange={(event) => setProfile({ ...profile, languages: event.target.value.split(',') as any })} />
                <select value={profile.experience_type || ''} onChange={(event) => setProfile({ ...profile, experience_type: event.target.value })}>
                  <option value="">{t('options.premium')}</option>
                  {experienceTypeOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
                </select>
              </div>
              <textarea placeholder={t('form.description')} value={profile.description || ''} onChange={(event) => setProfile({ ...profile, description: event.target.value })} />
              <div className="readonly">{t('dashboard.verifiedStatus', { status: savedProfile?.verified ? t('badges.verified') : t('dashboard.readOnlyPending') })}</div>
            </section>}

            {creatorTab === 'listing' && <section className="form-panel elevated">
              <h2><UserRound size={18} /> {t('dashboard.appearance')}</h2>
              <div className="form-grid">
                <input type="number" min="18" placeholder={t('form.age')} value={profile.age || ''} onChange={(event) => setProfile({ ...profile, age: Number(event.target.value) })} />
                <input type="number" min="120" placeholder={t('form.height')} value={profile.height || ''} onChange={(event) => setProfile({ ...profile, height: Number(event.target.value) })} />
                <select value={profile.body_type || ''} onChange={(event) => setProfile({ ...profile, body_type: event.target.value })}>
                  <option value="">{t('filters.bodyType')}</option>
                  {bodyTypeOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
                </select>
                <select value={profile.hair_color || ''} onChange={(event) => setProfile({ ...profile, hair_color: event.target.value })}>
                  <option value="">{t('filters.hairColor')}</option>
                  {hairColorOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
                </select>
                <select value={profile.origin || ''} onChange={(event) => setProfile({ ...profile, origin: event.target.value })}>
                  <option value="">{t('filters.origin')}</option>
                  {originOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
                </select>
                <select value={profile.orientation || ''} onChange={(event) => setProfile({ ...profile, orientation: event.target.value })}>
                  <option value="">{t('filters.orientation')}</option>
                  {orientationOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
                </select>
                <input placeholder={t('form.bodyFeatures')} value={String(profile.body_features || '')} onChange={(event) => setProfile({ ...profile, body_features: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
              </div>
              <DashboardMultiSelect title={t('filters.audience')} values={profile.audience || []} options={audienceOptions} onToggle={(value) => setProfile({ ...profile, audience: toggleArrayValue(profile.audience, value) })} />
              <DashboardMultiSelect title={t('filters.visitType')} values={profile.visit_types || []} options={visitTypeOptions} onToggle={(value) => setProfile({ ...profile, visit_types: toggleArrayValue(profile.visit_types, value) })} />
              <DashboardMultiSelect title={t('filters.serviceTags')} values={profile.service_tags || []} options={serviceTagOptions} onToggle={(value) => setProfile({ ...profile, service_tags: toggleArrayValue(profile.service_tags, value) })} />
              <DashboardTagPicker tags={platformTags} selected={profile.tag_ids || []} onToggle={(value) => setProfile({ ...profile, tag_ids: toggleArrayValue(profile.tag_ids, value) })} />
              <DashboardMultiSelect title={t('filters.paymentMethods')} values={profile.payment_methods || []} options={paymentMethodOptions} onToggle={(value) => setProfile({ ...profile, payment_methods: toggleArrayValue(profile.payment_methods, value) })} />
              <p className="safety-line">{t('city.safety')}</p>
            </section>}

            {creatorTab === 'visibility' && <section className="form-panel elevated">
              <h2><Clock size={18} /> {t('dashboard.radarVisibility')}</h2>
              <div className="form-grid">
                <select value={profile.availability_status || 'unavailable'} onChange={(event) => setProfile({ ...profile, availability_status: event.target.value as Profile['availability_status'], available_now: event.target.value === 'available' })}>
                  {availabilityStatusOptions.map((item) => <option key={item} value={item}>{t(`status.${item}`)}</option>)}
                </select>
                <select value={profile.service_radius_km || 25} onChange={(event) => setProfile({ ...profile, service_radius_km: Number(event.target.value) })}>
                  {radiusOptions.map((item) => <option key={item} value={item}>{item} km</option>)}
                </select>
                <input placeholder={t('dashboard.approxArea')} value={profile.approximate_location_area || ''} onChange={(event) => setProfile({ ...profile, approximate_location_area: event.target.value })} />
                <input type="number" placeholder={t('dashboard.latitude')} value={profile.latitude ?? ''} onChange={(event) => setProfile({ ...profile, latitude: event.target.value ? Number(event.target.value) : null })} />
                <input type="number" placeholder={t('dashboard.longitude')} value={profile.longitude ?? ''} onChange={(event) => setProfile({ ...profile, longitude: event.target.value ? Number(event.target.value) : null })} />
              </div>
              <p className="safety-line">{t('radar.privacy')} {t('dashboard.locationHint')}</p>
            </section>}

            {creatorTab === 'pricing' && <section className="form-panel elevated">
              <h2><UserRound size={18} /> {t('dashboard.prices')}</h2>
              <div className="form-grid">
                <Field label={t('form.price30')} helper={t('pricing.helper30')}><input type="number" placeholder="120" value={profile.price_30min || ''} onChange={(event) => setProfile({ ...profile, price_30min: Number(event.target.value) })} /></Field>
                <Field label={t('form.price1h')} helper={t('pricing.helper1h')}><input type="number" placeholder="200" value={profile.price_1h || ''} onChange={(event) => setProfile({ ...profile, price_1h: Number(event.target.value) })} /></Field>
                <Field label={t('form.price2h')} helper={t('pricing.helper2h')}><input type="number" placeholder="360" value={profile.price_2h || ''} onChange={(event) => setProfile({ ...profile, price_2h: Number(event.target.value) })} /></Field>
                <Field label={t('form.priceNight')} helper={t('pricing.helperNight')}><input type="number" placeholder="900" value={profile.price_night || ''} onChange={(event) => setProfile({ ...profile, price_night: Number(event.target.value) })} /></Field>
                <Field label={t('form.outcallFee')} helper={t('pricing.helperOutcall')}><input type="number" placeholder="50" value={profile.outcall_fee || ''} onChange={(event) => setProfile({ ...profile, outcall_fee: Number(event.target.value) })} /></Field>
                <Field label={t('form.currency')} helper={t('pricing.helperCurrency')}><select value={profile.currency || 'EUR'} onChange={(event) => setProfile({ ...profile, currency: event.target.value })}>
                    <option value="EUR">EUR</option>
                    <option value="PLN">PLN</option>
                    <option value="CHF">CHF</option>
                  </select></Field>
              </div>
            </section>}

            {creatorTab === 'services' && <section className="form-panel elevated">
              <h2><UserRound size={18} /> {t('dashboard.services')}</h2>
              <ServiceMenuEditor
                services={profile.service_menu || []}
                onChange={(service_menu) => setProfile({ ...profile, service_menu })}
              />
            </section>}

            {creatorTab === 'pricing' && <section className="form-panel elevated">
              <h2><Clock size={18} /> {t('dashboard.availability')}</h2>
              <div className="toggle-grid">
                <label><input type="checkbox" checked={Boolean(profile.available_now)} onChange={(event) => setProfile({ ...profile, available_now: event.target.checked })} /> {t('badges.availableNow')}</label>
                <label><input type="checkbox" checked={Boolean(profile.mobile_service)} onChange={(event) => setProfile({ ...profile, mobile_service: event.target.checked })} /> {t('badges.mobile')}</label>
                <label><input type="checkbox" checked={Boolean(profile.private_studio)} onChange={(event) => setProfile({ ...profile, private_studio: event.target.checked })} /> {t('badges.private')}</label>
              </div>
              <input placeholder={t('form.availabilityNote')} value={profile.availability_note || ''} onChange={(event) => setProfile({ ...profile, availability_note: event.target.value })} />
            </section>}

            <div className="dashboard-action-bar">
              <button className="button primary" type="submit" disabled={dashboardStatus === 'saving' || !token}>
                {dashboardStatus === 'saving' ? t('dashboard.saving') : t('buttons.saveProfile')}
              </button>
              {savedProfile && <Link className="button" to={`/profile/${savedProfile.id}`}>{t('dashboard.viewPublicProfile')}</Link>}
              <button className="button" type="button" onClick={resetChanges}>{t('dashboard.resetChanges')}</button>
            </div>
          </form>

          {creatorTab === 'media' && <section className="form-panel elevated">
            <h2><ImagePlus size={18} /> {t('dashboard.photos')}</h2>
            <p className="safety-line">{t('photos.counter', { count: savedProfile?.profile_images?.length || 0, max: savedProfile?.max_photos || 6 })}</p>
            <div className="photo-drop">
              <input type="file" accept="image/*" onChange={uploadImage} disabled={!savedProfile || (savedProfile.profile_images?.length || 0) >= (savedProfile.max_photos || 6)} />
              <button className="button" disabled type="button"><Sparkles size={16} /> {t('photos.blurSoon')}</button>
            </div>
            <div className="photo-preview-grid">
              {(savedProfile?.profile_images || []).map((image) => (
                <img key={image.id} src={image.public_url} alt={t('dashboard.photos')} />
              ))}
              {!savedProfile?.profile_images?.length && <p className="muted">{t('photos.empty')}</p>}
            </div>
          </section>}

          {creatorTab === 'visibility' && <section className="form-panel elevated">
            <h2><CalendarDays size={18} /> {t('dashboard.bookingRequests')}</h2>
            <div className="booking-list">
              {(bookingRequests.length ? bookingRequests : demoBookingRequests).map((booking) => (
                <div className="booking-row" key={booking.id}>
                  <div>
                    <strong>{booking.requested_date} / {booking.requested_time}</strong>
                    <p>{booking.requester_email} · {booking.duration_minutes} min</p>
                    {booking.message && <p>{booking.message}</p>}
                  </div>
                  <span className={`booking-status ${booking.status}`}>{t(`status.${booking.status}`)}</span>
                </div>
              ))}
            </div>
          </section>}

          {message && authStatus === 'idle' && <div className={dashboardStatus === 'error' ? 'state-panel error-text' : 'state-panel success'}>{message}</div>}
        </div>

        <aside className="dashboard-preview">
          <LivePreviewCard profile={previewProfile(profile, savedProfile)} />
        </aside>
      </div>}

      {creatorTab === 'media' && <CreatorContentManager
        tab={contentTab}
        onTab={setContentTab}
        savedProfile={savedProfile}
        uploadImage={uploadImage}
        uploadStatus={uploadStatus}
        setCoverImage={setCoverImage}
        deleteImage={deleteImage}
      />}

      {creatorTab === 'live' && <LiveCreatorControls />}
      {creatorTab === 'privacy' && <section className="creator-panel"><AiPrivacyTools /></section>}
      <DevDebugBox userEmail={userEmail} profile={savedProfile} wallet={wallet} uploadStatus={uploadStatus} lastApiError={lastApiError} />

      <MobileCreatorDock
        savedProfile={savedProfile}
        onUpload={() => document.getElementById('creator-media-upload')?.click()}
        onLogout={logout}
      />
    </div>
  );
}

function resolveAuthAccountType(metadata?: Record<string, unknown> | null): AuthAccountType {
  const value = String(metadata?.auth_account_type || '');
  return allowedAuthAccountTypes.includes(value as AuthAccountType) ? value as AuthAccountType : 'client';
}

function isAdvertiserAccount(accountType: AuthAccountType) {
  return accountType === 'escort' || accountType === 'business';
}

function ClientDashboard({ userEmail, wallet, coinWallet, clientProfile, activation, transactions, giftsSent, giftsReceived, message, activationBusy, avatarUploading, onActivate, onAvatarUpload, onLogout }: {
  userEmail: string;
  wallet: Wallet | null;
  coinWallet: CoinWallet | null;
  clientProfile: ClientProfile | null;
  activation: ClientActivation | null;
  transactions: CoinTransaction[];
  giftsSent: GiftRow[];
  giftsReceived: GiftRow[];
  message: string;
  activationBusy: boolean;
  avatarUploading: boolean;
  onActivate: () => void;
  onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const activated = activation?.state === 'client_activated';
  const displayName = clientProfile?.display_name || userEmail.split('@')[0] || 'Client';
  const city = clientProfile?.city || 'Berlin';
  const featureCards = [
    ['Radar', 'Zobacz profile w pobliżu Berlina.', RadioTower, '/city/berlin', true],
    ['Favorite profiles', 'Zapisuj ulubione profile i wracaj do nich szybciej.', Heart, '', activated],
    ['Profile unlocks', 'Odblokuj numery telefonu, WhatsApp, Telegram i galerie.', Lock, '', activated],
    ['Gifts / Coins', 'Wysyłaj prezenty Coins i odblokowuj prywatne galerie.', Gift, '/coins', activated],
    ['Referrals', 'Udostępnij link i QR po aktywacji konta.', QrCode, '', activated],
    ['Bookings', 'Śledź zapytania i historię kontaktów.', CalendarDays, '', activated],
    ['Private gallery access', 'Uzyskaj dostęp do pełnych galerii VIP.', ImagePlus, '', activated]
  ] as const;

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <p className="eyebrow">Escort Radar Client</p>
        <h1>{activated ? 'Konto aktywne' : 'Aktywuj konto za 0,99€'}</h1>
        <p>{activated ? 'Pełne profile, kontakty, galerie VIP, Coins i referral program są gotowe.' : 'Zobacz pełne profile, numery telefonu, prywatne galerie i wysyłaj prezenty Coins.'}</p>
      </section>

      <section className="creator-command-bar">
        <div>
          <strong>{displayName}</strong>
          <span className={activated ? 'success' : 'subscription-notice'}>{message || (activated ? 'client_activated' : 'client_free')}</span>
        </div>
        <div className="creator-command-actions">
          <Link className="button primary" to="/city/berlin"><RadioTower size={16} /> Otwórz radar</Link>
          <Link className="button" to="/coins"><Gem size={16} /> Coin Wallet</Link>
          <button className="button danger" type="button" onClick={onLogout}>{t('buttons.logout')}</button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="creator-panel">
          <div className="profile-summary">
            {clientProfile?.avatar_url ? <img className="client-qr-image" src={clientProfile.avatar_url} alt="" /> : <div className="qr-visual"><UserRound size={54} /></div>}
            <div>
              <p className="eyebrow">Client profile</p>
              <h2>{displayName}</h2>
              <p>{userEmail}</p>
              <p>{city}</p>
              <span className={`admin-status ${activated ? 'active' : 'pending'}`}>{activated ? 'client_activated' : 'client_free'}</span>
            </div>
          </div>
          <label className="button full">
            {avatarUploading ? t('states.loading') : 'Avatar hochladen'}
            <input hidden type="file" accept="image/*" onChange={onAvatarUpload} />
          </label>
          <div className="metrics-grid">
            <Metric label="Coins" value={Math.round(Number(coinWallet?.balance || 0))} />
            <Metric label="Gifts sent" value={giftsSent.length} />
            <Metric label="Transactions" value={transactions.length} />
          </div>
        </section>

        {!activated && <section className="creator-panel elevated">
          <p className="eyebrow">Full Escort Radar Experience</p>
          <h2>Aktywuj konto za 0,99€</h2>
          <p>Zobacz pełne profile, numery telefonu, prywatne galerie i wysyłaj prezenty Coins.</p>
          <div className="onboarding-points">
            <span>unlock phone / WhatsApp / Telegram</span>
            <span>see all photos</span>
            <span>send gifts / coins</span>
            <span>access private gallery</span>
            <span>save favorites</span>
            <span>get referral link and QR</span>
            <span>receive welcome coins</span>
          </div>
          <button className="button primary full" type="button" disabled={activationBusy} onClick={onActivate}>
            {activationBusy ? t('states.loading') : 'Aktywuj teraz za 0,99€'}
          </button>
        </section>}

        <section className="creator-panel referral-studio">
          <div>
            <p className="eyebrow">My Referral Program</p>
            <h2>{activation?.referral_link || 'Activate to unlock referrals'}</h2>
            {activation?.referral_link && <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(activation.referral_link || '')}><Copy size={14} /> {t('referral.copy')}</button>}
          </div>
          {activation?.qr_image_url ? <img className="client-qr-image" src={activation.qr_image_url} alt="Referral QR" /> : <QrVisual seed="CLIENT-FREE" />}
          <div className="metrics-grid">
            <Metric label="Clicks" value={activation?.clicks || 0} />
            <Metric label="Registrations" value={activation?.registrations || 0} />
            <Metric label="Activations" value={activation?.activations || 0} />
            <Metric label="Earned rewards" value={`${activation?.earned_rewards || 0} Coins`} />
          </div>
        </section>

        <section className="creator-panel">
          <p className="eyebrow">Radar Berlin</p>
          <h2>1 profile near Berlin available now</h2>
          <p>Otwórz radar albo zobacz profile w pobliżu.</p>
          <div className="creator-share-row">
            <Link className="button primary" to="/city/berlin">Otwórz radar</Link>
            <Link className="button" to="/city/berlin">Zobacz profile w pobliżu</Link>
          </div>
        </section>

        <section className="creator-panel">
          <p className="eyebrow">Client tools</p>
          <div className="creator-dashboard-grid">
            {featureCards.map(([title, copy, Icon, href, enabled]) => {
              const content = <><Icon size={16} /> <strong>{title}</strong><span>{enabled ? copy : 'Aktywuj za 0,99€'}</span></>;
              if (href && enabled) return <Link className="admin-action-btn" to={href} key={title}>{content}</Link>;
              return <button className="admin-action-btn" type="button" key={title} onClick={enabled ? undefined : onActivate}>{content}</button>;
            })}
          </div>
        </section>

        <section className="creator-panel">
          <p className="eyebrow">Aktywitätsverlauf</p>
          <div className="booking-list">
            {transactions.slice(0, 5).map((transaction) => (
              <div className="booking-row" key={transaction.id}>
                <div><strong>{transaction.transaction_type}</strong><p>{new Date(transaction.created_at).toLocaleString()}</p></div>
                <span>{transaction.direction === 'credit' ? '+' : '-'}{transaction.amount} Coins</span>
              </div>
            ))}
            {!transactions.length && <p className="muted">No activity yet. Unlock profiles, send gifts, and collect referral rewards.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function BusinessDashboard({ userEmail, message, onLogout }: {
  userEmail: string;
  message: string;
  onLogout: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <p className="eyebrow">{t('dashboard.business.eyebrow')}</p>
        <h1>{t('dashboard.business.title')}</h1>
        <p>{t('dashboard.business.subtitle')}</p>
      </section>

      <section className="creator-command-bar">
        <div>
          <strong>{t('auth.signedInAs', { email: userEmail })}</strong>
          <span className="success">{message || t('dashboard.business.ready')}</span>
        </div>
        <div className="creator-command-actions">
          <Link className="button primary" to="/tokens"><Gem size={16} /> {t('dashboard.business.premiumCta')}</Link>
          <button className="button danger" type="button" onClick={onLogout}>{t('buttons.logout')}</button>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="creator-panel">
          <p className="eyebrow">{t('dashboard.business.verificationEyebrow')}</p>
          <h2>{t('dashboard.business.verificationTitle')}</h2>
          <p>{t('dashboard.business.verificationCopy')}</p>
        </section>
        <section className="creator-panel">
          <p className="eyebrow">{t('dashboard.business.multiProfileEyebrow')}</p>
          <h2>{t('dashboard.business.multiProfileTitle')}</h2>
          <p>{t('dashboard.business.multiProfileCopy')}</p>
        </section>
      </div>
    </div>
  );
}

function CreatorHeroPanel({ profile, savedProfile, wallet, userEmail, onUpload, onLogout }: {
  profile: Partial<Profile>;
  savedProfile: Profile | null;
  wallet: Wallet | null;
  userEmail: string;
  onUpload: () => void;
  onLogout: () => void;
}) {
  const { t, option } = useI18n();
  const primary = savedProfile?.profile_images?.find((image) => image.is_primary) || savedProfile?.profile_images?.[0];
  const completeness = getProfileCompleteness(profile, savedProfile);
  const status = profile.availability_status || 'unavailable';
  const referralUrl = savedProfile?.referral_code ? `https://escort-radar.fun/r/${savedProfile.referral_code}` : t('referral.pending');

  return (
    <section className="creator-hero-panel">
      <div className="creator-avatar-wrap">
        {primary?.public_url ? <img src={primary.public_url} alt="" /> : <div className="creator-avatar-fallback"><Sparkles /></div>}
        <span className={`creator-live-dot ${status}`} />
      </div>
      <div className="creator-hero-copy">
        <p className="eyebrow">{t('creator.heroEyebrow')}</p>
        <h2>{profile.display_name || t('creator.unnamed')}</h2>
        <p>{userEmail} · {option(profile.category || 'ladies')} · {profile.city || 'Berlin'}</p>
        <div className="creator-badge-row">
          <span>{t(`status.${status}`)}</span>
          <span><Gem size={14} /> {t('creator.premiumBadge')}</span>
          <span><Flame size={14} /> {t('creator.visibilityScore', { score: Math.max(12, completeness) })}</span>
          <span><RadioTower size={14} /> {t('creator.liveBadge')}</span>
        </div>
      </div>
      <div className="creator-hero-stats">
        <Metric label={t('creator.completeness')} value={`${completeness}%`} />
        <Metric label={t('tokens.balance')} value={`${Math.round(Number(wallet?.escort_token_balance || 0))} ER`} />
        <Metric label={t('creator.referralEarnings')} value={`${Math.round(Number(wallet?.referral_balance || 0))} ER`} />
      </div>
      <div className="creator-referral-mini">
        <QrVisual seed={savedProfile?.referral_code || 'ESCORT-RADAR'} />
        <span>{savedProfile?.public_user_id || 'ER-XXXXXX'}</span>
        <button className="admin-action-btn" type="button" onClick={() => navigator.clipboard?.writeText(referralUrl)}><Copy size={13} /> {t('referral.copy')}</button>
      </div>
      <div className="creator-quick-actions">
        <button className="button primary" type="button"><Video size={16} /> {t('creator.goLive')}</button>
        <button className="button" type="button" onClick={onUpload}><UploadCloud size={16} /> {t('creator.uploadMedia')}</button>
        <button className="button" type="button"><Flame size={16} /> {t('creator.promoteProfile')}</button>
        <Link className="button" to="/tokens"><Gem size={16} /> {t('creator.buyTokens')}</Link>
        {savedProfile && <Link className="button" to={`/profile/${savedProfile.id}`}>{t('dashboard.viewPublicProfile')}</Link>}
        <button className="button danger" type="button" onClick={onLogout}><LogOut size={16} /> {t('buttons.logout')}</button>
      </div>
    </section>
  );
}

function CreatorMonetizationPanel({ wallet, bookings, profile }: { wallet: Wallet | null; bookings: number; profile: Profile | null }) {
  const { t } = useI18n();
  const rows = [
    ['creator.tokenEarnings', Math.round(Number(wallet?.escort_token_balance || 0))],
    ['creator.unlockRevenue', `${Math.round(Number(wallet?.eur_spent || 0) * 0.22)} EUR`],
    ['creator.bookingRequests', bookings],
    ['creator.privateChatRevenue', '0 EUR'],
    ['creator.referralRevenue', `${Math.round(Number(wallet?.referral_balance || 0))} ER`],
    ['creator.activeFans', profile?.referral_count || 0],
    ['creator.fanClubMembers', 0]
  ];
  return (
    <section className="creator-panel">
      <div className="creator-panel-head">
        <p className="eyebrow">{t('creator.monetization')}</p>
        <h2>{t('creator.quickMonetization')}</h2>
      </div>
      <div className="creator-metric-grid">
        {rows.map(([label, value]) => <Metric key={label} label={t(String(label))} value={value} />)}
      </div>
    </section>
  );
}

function ReferralStudio({ profile }: { profile: Profile | null }) {
  const { t } = useI18n();
  const referralUrl = profile?.referral_code ? `https://escort-radar.fun/r/${profile.referral_code}` : t('referral.pending');
  function shareReferral() {
    if (navigator.share && profile?.referral_code) {
      navigator.share({ title: 'Escort Radar', url: referralUrl }).catch(() => undefined);
    } else {
      navigator.clipboard?.writeText(referralUrl);
    }
  }
  function downloadQr() {
    const code = profile?.referral_code || 'ESCORT-RADAR';
    const cells = Array.from({ length: 49 }, (_, index) => ((code.charCodeAt(index % code.length) + index * 7) % 3) !== 0);
    const rects = cells.map((active, index) => active ? `<rect x="${(index % 7) * 12}" y="${Math.floor(index / 7) * 12}" width="10" height="10" fill="#050505"/>` : '').join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 84 84"><rect width="84" height="84" fill="#f7d46b"/>${rects}</svg>`;
    const link = document.createElement('a');
    link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    link.download = `escort-radar-${code}.svg`;
    link.click();
  }
  return (
    <section className="creator-panel referral-studio">
      <div>
        <p className="eyebrow">{t('creator.referralStudio')}</p>
        <h2>{t('referral.myLink')}</h2>
        <p>{referralUrl}</p>
      </div>
      <QrVisual seed={profile?.referral_code || 'ER'} />
      <div className="creator-metric-grid compact">
        <Metric label={t('creator.refClicks')} value="0" />
        <Metric label={t('creator.refSignups')} value={profile?.referral_count || 0} />
        <Metric label={t('creator.refTokenRevenue')} value="0 ER" />
        <Metric label={t('creator.refVipConversions')} value="0" />
      </div>
      <div className="creator-share-row">
        <button className="button" type="button" onClick={() => navigator.clipboard?.writeText(referralUrl)}>{t('referral.copy')}</button>
        <button className="button" type="button" onClick={shareReferral}>{t('creator.share')}</button>
        <button className="button" type="button" onClick={downloadQr}>{t('creator.downloadQr')}</button>
      </div>
    </section>
  );
}

function LivePreviewCard({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  return (
    <div className="creator-live-preview">
      <p className="eyebrow">{t('dashboard.livePreview')}</p>
      <ProfileCard profile={profile} />
      <div className="locked-preview-strip">
        <div><Lock size={16} /> {t('creator.lockedMedia')}</div>
        <button className="button primary" type="button">{t('creator.unlockWithTokens')}</button>
      </div>
      <div className="creator-preview-actions">
        <button className="button" type="button"><Video size={15} /> {t('creator.liveCamCta')}</button>
        <button className="button" type="button"><MessageCircle size={15} /> {t('creator.privateChatCta')}</button>
      </div>
      <p className="demo-note">{t('dashboard.previewHint')}</p>
    </div>
  );
}

function CreatorContentManager({ tab, onTab, savedProfile, uploadImage, uploadStatus, setCoverImage, deleteImage }: {
  tab: string;
  onTab: (tab: string) => void;
  savedProfile: Profile | null;
  uploadImage: (event: ChangeEvent<HTMLInputElement>) => void;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
  setCoverImage: (imageId: string) => void;
  deleteImage: (imageId: string) => void;
}) {
  const { t } = useI18n();
  const tabs = ['photos', 'videos', 'liveCam', 'privateGallery', 'stories', 'verification'];
  return (
    <section className="creator-panel content-manager">
      <div className="creator-panel-head">
        <p className="eyebrow">{t('creator.contentManager')}</p>
        <h2>{t('creator.mediaVault')}</h2>
      </div>
      <nav className="creator-tabs">
        {tabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => onTab(item)}>{t(`creator.tabs.${item}`)}</button>)}
      </nav>
      <div className="media-dropzone">
        <input id="creator-media-upload" type="file" accept="image/*" onChange={uploadImage} disabled={!savedProfile || (savedProfile.profile_images?.length || 0) >= (savedProfile.max_photos || 6)} />
        <UploadCloud size={28} />
        <h3>{t('creator.dragDrop')}</h3>
        <p>{uploadStatus === 'uploading' ? t('photos.uploading') : t('photos.counter', { count: savedProfile?.profile_images?.length || 0, max: savedProfile?.max_photos || 6 })}</p>
      </div>
      <div className="creator-gallery-grid">
        {(savedProfile?.profile_images || []).map((image, index) => (
          <article className="creator-media-card" key={image.id}>
            {image.public_url ? <img src={image.public_url} alt="" /> : <div className="image-placeholder" />}
            <div className="media-badge-row">
              <span>{image.is_cover || image.is_primary ? t('creator.coverImage') : t('creator.galleryImage')}</span>
              <span>{t(`photoModeration.${image.moderation_status || 'pending'}`)}</span>
            </div>
            <div className="creator-media-actions">
              <button type="button" onClick={() => setCoverImage(image.id)}>{image.is_cover || image.is_primary ? t('creator.coverImage') : t('creator.cover')}</button>
              <button>{t('creator.locked')}</button>
              <button>{t('creator.blur')}</button>
              <button className="danger" type="button" onClick={() => deleteImage(image.id)}>{t('buttons.delete')}</button>
            </div>
          </article>
        ))}
        {!savedProfile?.profile_images?.length && <p className="muted">{t('photos.empty')}</p>}
      </div>
      <AiPrivacyTools />
    </section>
  );
}

function AiPrivacyTools() {
  const { t } = useI18n();
  const tools = ['blurFace', 'distortTattoos', 'hideBackground', 'aiMask', 'watermark'];
  return (
    <div className="ai-privacy-grid">
      {tools.map((tool) => (
        <article className="ai-privacy-card" key={tool}>
          <span>{t('creator.babaPrivacyLayer')}</span>
          <Wand2 size={18} />
          <strong>{t(`creator.ai.${tool}`)}</strong>
          <p>{t('creator.aiPlaceholder')}</p>
        </article>
      ))}
    </div>
  );
}

function LiveCreatorControls() {
  const { t } = useI18n();
  return (
    <section className="creator-panel live-controls">
      <div className="creator-panel-head">
        <p className="eyebrow">{t('creator.liveFeature')}</p>
        <h2>{t('creator.liveControls')}</h2>
      </div>
      <div className="form-grid">
        <label className="premium-check"><input type="checkbox" /> {t('creator.enableLiveCam')}</label>
        <label className="premium-check"><input type="checkbox" /> {t('creator.enablePrivateChat')}</label>
        <input type="number" placeholder={t('creator.tokenPerMinute')} />
        <input type="number" placeholder={t('creator.privateShowTicket')} />
        <input placeholder={t('creator.onlineSchedule')} />
        <select defaultValue="offline">
          <option value="live">{t('creator.liveNow')}</option>
          <option value="busy">{t('status.busy')}</option>
          <option value="offline">{t('status.offline')}</option>
        </select>
      </div>
    </section>
  );
}

function DevDebugBox({ userEmail, profile, wallet, uploadStatus, lastApiError }: {
  userEmail: string;
  profile: Profile | null;
  wallet: Wallet | null;
  uploadStatus: string;
  lastApiError: string;
}) {
  const isDev = import.meta.env.DEV || ['mtvx007@gmail.com', 'babatv24@proton.me'].includes(userEmail.toLowerCase());
  if (!isDev) return null;
  return (
    <details className="dev-debug-box">
      <summary>DEV DEBUG</summary>
      <dl>
        <dt>User</dt><dd>{userEmail || '-'}</dd>
        <dt>Profile</dt><dd>{profile?.id || '-'}</dd>
        <dt>Wallet</dt><dd>{wallet?.id || profile?.wallet_summary?.public_wallet_id || '-'}</dd>
        <dt>Images</dt><dd>{profile?.profile_images?.length || 0}</dd>
        <dt>Tags</dt><dd>{profile?.tag_ids?.length || 0}</dd>
        <dt>Visibility</dt><dd>{profile?.visibility_reason || '-'}</dd>
        <dt>Upload</dt><dd>{uploadStatus}</dd>
        <dt>Last error</dt><dd>{lastApiError || '-'}</dd>
      </dl>
    </details>
  );
}

function MobileCreatorDock({ savedProfile, onUpload, onLogout }: { savedProfile: Profile | null; onUpload: () => void; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="mobile-creator-dock">
      <button type="button"><Video size={17} />{t('creator.goLive')}</button>
      <button type="button" onClick={onUpload}><UploadCloud size={17} />{t('creator.uploadMedia')}</button>
      <Link to="/tokens"><Gem size={17} />{t('tokens.short')}</Link>
      {savedProfile ? <Link to={`/profile/${savedProfile.id}`}>{t('nav.profile')}</Link> : <button type="button">{t('nav.profile')}</button>}
      <button type="button" onClick={onLogout}><LogOut size={17} />{t('buttons.logout')}</button>
    </nav>
  );
}

function VisibilityChecklist({ profile }: { profile: Profile | null }) {
  const { t } = useI18n();
  const items = [
    ['visibilityChecklist.photo', Boolean(profile?.profile_images?.length)],
    ['visibilityChecklist.description', Boolean(profile?.description)],
    ['visibilityChecklist.pricing', Boolean(profile?.price_1h || profile?.price_30min)],
    ['visibilityChecklist.location', Boolean(profile?.city && profile?.category)],
    ['visibilityChecklist.moderation', profile?.verification_status === 'verified' || profile?.is_test_account],
    ['visibilityChecklist.subscription', profile?.subscription_status === 'active' || profile?.is_test_account]
  ];
  return (
    <div className="visibility-checklist">
      {items.map(([key, ok]) => (
        <span key={String(key)} className={ok ? 'ok' : 'missing'}>{ok ? '✓' : '•'} {t(String(key))}</span>
      ))}
    </div>
  );
}

function QrVisual({ seed }: { seed: string }) {
  const bits = Array.from({ length: 49 }, (_, index) => ((seed.charCodeAt(index % seed.length) + index * 7) % 3) !== 0);
  return <div className="qr-visual" aria-label="QR">{bits.map((active, index) => <span key={index} className={active ? 'on' : ''} />)}</div>;
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div className="creator-metric"><span>{label}</span><strong>{String(value)}</strong></div>;
}

function getProfileCompleteness(profile: Partial<Profile>, savedProfile: Profile | null) {
  const checks = [
    profile.display_name,
    profile.description,
    profile.city,
    profile.category,
    profile.age,
    profile.service_radius_km,
    profile.price_1h,
    profile.service_menu?.some((service) => service.enabled),
    savedProfile?.profile_images?.length,
    savedProfile?.verified
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const demoBookingRequests: BookingRequest[] = [
  {
    id: 'demo-booking-1',
    profile_id: 'preview',
    requester_email: 'vip@example.com',
    requested_date: '2026-06-01',
    requested_time: '21:00',
    duration_minutes: 120,
    message: '',
    status: 'pending',
    created_at: new Date().toISOString()
  }
];

function previewProfile(profile: Partial<Profile>, savedProfile: Profile | null): Profile {
  const images = savedProfile?.profile_images?.length ? savedProfile.profile_images : [];
  return {
    id: savedProfile?.id || 'preview',
    display_name: profile.display_name || 'Preview profile',
    age: profile.age || 25,
    height: profile.height || 170,
    body_type: profile.body_type,
    body_features: profile.body_features || [],
    hair_color: profile.hair_color,
    origin: profile.origin,
    experience_type: profile.experience_type,
    slug: 'preview',
    city: profile.city || 'berlin',
    area: profile.area || 'Central',
    category: profile.category || 'ladies',
    description: profile.description || '',
    languages: Array.isArray(profile.languages) ? profile.languages : ['EN'],
    orientation: profile.orientation,
    audience: profile.audience || [],
    visit_types: profile.visit_types || [],
    service_tags: profile.service_tags || [],
    tag_ids: profile.tag_ids || [],
    tags: profile.tags || [],
    payment_methods: profile.payment_methods || [],
    availability_note: profile.availability_note,
    availability_status: profile.availability_status || 'unavailable',
    service_radius_km: profile.service_radius_km || 25,
    approximate_location_area: profile.approximate_location_area || profile.area || 'Central',
    latitude: profile.latitude ?? null,
    longitude: profile.longitude ?? null,
    distance_km: profile.distance_km ?? 8,
    price_30min: profile.price_30min,
    price_1h: profile.price_1h,
    price_2h: profile.price_2h,
    price_night: profile.price_night,
    outcall_fee: profile.outcall_fee,
    currency: profile.currency || 'EUR',
    service_menu: profile.service_menu || [],
    available_now: Boolean(profile.available_now),
    mobile_service: Boolean(profile.mobile_service),
    private_studio: Boolean(profile.private_studio),
    verified: Boolean(savedProfile?.verified),
    status: savedProfile?.status || 'pending',
    subscription_status: savedProfile?.subscription_status || 'preview',
    is_test_account: savedProfile?.is_test_account,
    verification_status: savedProfile?.verification_status,
    moderation_status: savedProfile?.moderation_status,
    trial_ends_at: null,
    profile_images: images.length ? images : [{
      id: 'preview-image',
      storage_path: 'preview',
      public_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20640%20860%22%3E%3Crect%20width%3D%22640%22%20height%3D%22860%22%20fill%3D%22%23090909%22/%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22280%22%20r%3D%22130%22%20fill%3D%22%23150f14%22%20stroke%3D%22%23f7d46b%22%20stroke-width%3D%228%22/%3E%3Cpath%20d%3D%22M145%20762c24-170%20326-170%20350%200%22%20fill%3D%22%23150f14%22%20stroke%3D%22%23f7d46b%22%20stroke-width%3D%228%22/%3E%3Ctext%20x%3D%2250%22%20y%3D%22808%22%20fill%3D%22%23f7d46b%22%20font-family%3D%22Arial%22%20font-size%3D%2232%22%20font-weight%3D%22700%22%3EPreview%3C/text%3E%3C/svg%3E',
      is_primary: true,
      is_blurred: false
    }]
  };
}

function profileToForm(profile: Profile): Partial<Profile> {
  return {
    ...emptyProfile,
    ...profile,
    languages: Array.isArray(profile.languages) ? profile.languages : [],
    body_features: profile.body_features || [],
    audience: profile.audience || [],
    visit_types: profile.visit_types || [],
    service_tags: profile.service_tags || [],
    tag_ids: profile.tag_ids || [],
    tags: profile.tags || [],
    payment_methods: profile.payment_methods || [],
    service_menu: profile.service_menu?.length ? profile.service_menu : emptyProfile.service_menu,
    profile_images: profile.profile_images || []
  };
}

function prepareProfilePayload(profile: Partial<Profile>, savedProfile: Profile | null): Partial<Profile> {
  return {
    ...profile,
    languages: Array.isArray(profile.languages)
      ? profile.languages.map((item) => String(item).trim()).filter(Boolean)
      : String(profile.languages || '').split(',').map((item) => item.trim()).filter(Boolean),
    is_test_account: Boolean(savedProfile?.is_test_account),
    available_now: profile.availability_status === 'available' || Boolean(profile.available_now)
  };
}

function getVisibilityReason(profile: Profile | null, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (!profile) return t('visibility.noProfile');
  if (profile.visibility_reason) return t(`visibility.${profile.visibility_reason}`);
  if (profile.moderation_status === 'blocked' || profile.moderation_status === 'suspended' || profile.status === 'suspended') return t('visibility.suspended');
  if (!profile.city || !profile.category) return t('visibility.missingCityCategory');
  if (!profile.is_test_account && profile.subscription_status !== 'active') return t('visibility.noPayment');
  if (!profile.verified && profile.verification_status !== 'verified') return t('visibility.notVerified');
  if (profile.status !== 'active') return t('visibility.notActive');
  return t('visibility.public');
}

function mapWizardStepToTab(step: string) {
  const map: Record<string, string> = {
    account: 'visibility',
    profileType: 'listing',
    photos: 'media',
    location: 'visibility',
    pricing: 'pricing',
    services: 'services',
    live: 'live',
    visibility: 'visibility',
    publish: 'visibility'
  };
  return map[step] || 'listing';
}

function getWizardStepClass(index: number, creatorTab: string) {
  const activeIndex = ['visibility', 'listing', 'media', 'visibility', 'pricing', 'services', 'live', 'visibility', 'visibility'].findIndex((tab) => tab === creatorTab);
  if (index === activeIndex) return 'active';
  if (activeIndex > -1 && index < activeIndex) return 'done';
  return '';
}

function ServiceMenuEditor({ services, onChange }: { services: NonNullable<Profile['service_menu']>; onChange: (services: NonNullable<Profile['service_menu']>) => void }) {
  const { t, option } = useI18n();
  function update(index: number, patch: Partial<NonNullable<Profile['service_menu']>[number]>) {
    onChange(services.map((service, currentIndex) => currentIndex === index ? { ...service, ...patch } : service));
  }

  return (
    <div className="service-editor">
      {services.map((service, index) => (
        <div className="service-editor-row" key={`${service.name}-${index}`}>
          <label><input type="checkbox" checked={service.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} /> {option(service.name)}</label>
          <label><input type="checkbox" checked={service.included} onChange={(event) => update(index, { included: event.target.checked })} /> {t('dashboard.included')}</label>
          <Field label={t('dashboard.serviceName')} helper={t('services.nameHelper')}><input placeholder={t('dashboard.serviceName')} value={service.name} onChange={(event) => update(index, { name: event.target.value })} /></Field>
          <Field label={t('dashboard.extraPrice')} helper={t('services.priceHelper')}><input type="number" placeholder={t('dashboard.extraPrice')} value={service.extra_price ?? ''} onChange={(event) => update(index, { extra_price: event.target.value ? Number(event.target.value) : null })} /></Field>
          <Field label={t('dashboard.note')} helper={t('services.noteHelper')}><input placeholder={t('dashboard.note')} value={service.note || ''} onChange={(event) => update(index, { note: event.target.value })} /></Field>
        </div>
      ))}
      <button
        className="button"
        type="button"
        onClick={() => onChange([...services, { name: t('dashboard.customService', { count: services.length + 1 }), enabled: true, included: false, extra_price: null, note: '' }])}
      >
        {t('buttons.addCustomService')}
      </button>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper: string; children: ReactNode }) {
  return (
    <label className="premium-field">
      <span>{label}</span>
      {children}
      <small>{helper}</small>
    </label>
  );
}

function DashboardMultiSelect({ title, values, options, onToggle }: { title: string; values: string[]; options: string[]; onToggle: (value: string) => void }) {
  const { option: translateOption } = useI18n();
  return (
    <fieldset className="chip-fieldset">
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.map((option) => (
          <button key={option} className={values.includes(option) ? 'chip selected' : 'chip'} type="button" onClick={() => onToggle(option)}>
            {translateOption(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function DashboardTagPicker({ tags, selected, onToggle }: { tags: Tag[]; selected: string[]; onToggle: (value: string) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const filtered = tags.filter((tag) => `${tag.label} ${tag.group_key}`.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(filtered.map((tag) => tag.group_key))];

  return (
    <fieldset className="chip-fieldset premium-tag-picker">
      <legend>{t('tags.title')}</legend>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('tags.search')} />
      {!tags.length && <p className="muted">{t('tags.loading')}</p>}
      {groups.map((group) => (
        <div className="tag-group" key={group}>
          <strong>{t(`tags.groups.${group}`)}</strong>
          <div className="chip-grid">
            {filtered.filter((tag) => tag.group_key === group).map((tag) => (
              <button key={tag.id} className={selected.includes(tag.id) ? 'chip selected neon' : 'chip neon'} type="button" onClick={() => onToggle(tag.id)}>
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
