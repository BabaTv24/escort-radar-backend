import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, CreditCard, ImagePlus, Lock, Sparkles, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { BookingRequest, Profile, ProfileImage } from '../types';
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
  serviceTagOptions,
  toggleArrayValue,
  visitTypeOptions
} from '../data/filterOptions';

const emptyProfile: Partial<Profile> = {
  display_name: '',
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

export function DashboardPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [profile, setProfile] = useState<Partial<Profile>>(emptyProfile);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>([]);
  const [message, setMessage] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [dashboardStatus, setDashboardStatus] = useState<'idle' | 'loading' | 'saving' | 'success' | 'error'>('idle');
  const [profileMode, setProfileMode] = useState<'create' | 'edit'>('create');
  const { t, option } = useI18n();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      setToken(session?.access_token || '');
      setUserEmail(session?.user.email || '');
      if (session?.access_token) {
        loadDashboard(session.access_token);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token || '');
      setUserEmail(session?.user.email || '');
      if (session?.access_token) {
        loadDashboard(session.access_token);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn(mode: 'sign-in' | 'sign-up') {
    setAuthStatus('loading');
    setMessage('');

    try {
      const normalizedEmail = email.trim();
      const result = mode === 'sign-up'
        ? await supabase.auth.signUp({ email: normalizedEmail, password })
        : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

      if (result.error) {
        setAuthStatus('error');
        setMessage(getAuthErrorMessage(result.error.message, mode, t));
        return;
      }

      const session = result.data.session;
      setToken(session?.access_token || '');
      setUserEmail(result.data.user?.email || normalizedEmail);

      if (session?.access_token) {
        await loadDashboard(session.access_token);
        setAuthStatus('success');
        setMessage(mode === 'sign-up' ? t('auth.registerSuccess') : t('auth.loginSuccess'));
        return;
      }

      setAuthStatus('success');
      setMessage(t('auth.emailConfirmationRequired'));
    } catch (error) {
      setAuthStatus('error');
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
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
        loadBookingRequests(accessToken)
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

    try {
      const body = prepareProfilePayload(profile, savedProfile);
      const result = savedProfile
        ? await api.updateProfile(token, savedProfile.id, body)
        : await api.createProfile(token, body);

      setSavedProfile(result.profile);
      setProfile(profileToForm(result.profile));
      setProfileMode('edit');
      setDashboardStatus('success');
      setMessage(t('dashboard.saved'));
    } catch (error) {
      setDashboardStatus('error');
      setMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token || !savedProfile) return;
    setAuthStatus('idle');
    setDashboardStatus('saving');
    setMessage('');
    if (file.size > 8 * 1024 * 1024) {
      setDashboardStatus('error');
      return setMessage(t('photos.fileTooLarge'));
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
      setDashboardStatus('success');
      setMessage(t('dashboard.imageUploaded'));
      event.target.value = '';
    } catch (error) {
      setDashboardStatus('error');
      setMessage(error instanceof Error ? error.message : t('photos.uploadFailed'));
    }
  }

  function resetChanges() {
    setProfile(savedProfile ? profileToForm(savedProfile) : { ...emptyProfile });
    setMessage(savedProfile ? t('dashboard.profileLoaded') : t('dashboard.noProfileYet'));
    setDashboardStatus('idle');
  }

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <p className="eyebrow">{t('dashboard.eyebrow')}</p>
        <h1>{t('dashboard.title')}</h1>
        <p>{t('dashboard.subtitle')}</p>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="form-panel elevated">
            <h2><Lock size={18} /> {t('dashboard.account')}</h2>
            <p className="baba-auth-line">{t('baba.builtWith')}</p>
            <div className="form-grid">
              <input type="email" placeholder={t('form.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
              <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="row">
              <button className="button primary" type="button" disabled={authStatus === 'loading'} onClick={() => signIn('sign-in')}>
                {authStatus === 'loading' ? t('states.loading') : t('buttons.login')}
              </button>
              <button className="button" type="button" disabled={authStatus === 'loading'} onClick={() => signIn('sign-up')}>
                {authStatus === 'loading' ? t('states.loading') : t('buttons.register')}
              </button>
            </div>
            {userEmail && <p className="success">{t('auth.signedInAs', { email: userEmail })}</p>}
            {message && <p className={authStatus === 'error' ? 'error-text' : 'success'}>{message}</p>}
          </section>

          <form className="stack" onSubmit={saveProfile}>
            <section className="listing-status-panel">
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
            </section>

            <section className="subscription-card">
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
            </section>

            <section className="form-panel elevated">
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
            </section>

            <section className="form-panel elevated">
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
              <DashboardMultiSelect title={t('filters.paymentMethods')} values={profile.payment_methods || []} options={paymentMethodOptions} onToggle={(value) => setProfile({ ...profile, payment_methods: toggleArrayValue(profile.payment_methods, value) })} />
              <p className="safety-line">{t('city.safety')}</p>
            </section>

            <section className="form-panel elevated">
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
            </section>

            <section className="form-panel elevated">
              <h2><UserRound size={18} /> {t('dashboard.prices')}</h2>
              <div className="form-grid">
                <input type="number" placeholder={t('form.price30')} value={profile.price_30min || ''} onChange={(event) => setProfile({ ...profile, price_30min: Number(event.target.value) })} />
                <input type="number" placeholder={t('form.price1h')} value={profile.price_1h || ''} onChange={(event) => setProfile({ ...profile, price_1h: Number(event.target.value) })} />
                <input type="number" placeholder={t('form.price2h')} value={profile.price_2h || ''} onChange={(event) => setProfile({ ...profile, price_2h: Number(event.target.value) })} />
                <input type="number" placeholder={t('form.priceNight')} value={profile.price_night || ''} onChange={(event) => setProfile({ ...profile, price_night: Number(event.target.value) })} />
                <input type="number" placeholder={t('form.outcallFee')} value={profile.outcall_fee || ''} onChange={(event) => setProfile({ ...profile, outcall_fee: Number(event.target.value) })} />
                <select value={profile.currency || 'EUR'} onChange={(event) => setProfile({ ...profile, currency: event.target.value })}>
                  <option value="EUR">EUR</option>
                  <option value="PLN">PLN</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
            </section>

            <section className="form-panel elevated">
              <h2><UserRound size={18} /> {t('dashboard.services')}</h2>
              <ServiceMenuEditor
                services={profile.service_menu || []}
                onChange={(service_menu) => setProfile({ ...profile, service_menu })}
              />
            </section>

            <section className="form-panel elevated">
              <h2><Clock size={18} /> {t('dashboard.availability')}</h2>
              <div className="toggle-grid">
                <label><input type="checkbox" checked={Boolean(profile.available_now)} onChange={(event) => setProfile({ ...profile, available_now: event.target.checked })} /> {t('badges.availableNow')}</label>
                <label><input type="checkbox" checked={Boolean(profile.mobile_service)} onChange={(event) => setProfile({ ...profile, mobile_service: event.target.checked })} /> {t('badges.mobile')}</label>
                <label><input type="checkbox" checked={Boolean(profile.private_studio)} onChange={(event) => setProfile({ ...profile, private_studio: event.target.checked })} /> {t('badges.private')}</label>
              </div>
              <input placeholder={t('form.availabilityNote')} value={profile.availability_note || ''} onChange={(event) => setProfile({ ...profile, availability_note: event.target.value })} />
            </section>

            <div className="dashboard-action-bar">
              <button className="button primary" type="submit" disabled={dashboardStatus === 'saving' || !token}>
                {dashboardStatus === 'saving' ? t('dashboard.saving') : t('buttons.saveProfile')}
              </button>
              {savedProfile && <Link className="button" to={`/profile/${savedProfile.id}`}>{t('dashboard.viewPublicProfile')}</Link>}
              <button className="button" type="button" onClick={resetChanges}>{t('dashboard.resetChanges')}</button>
            </div>
          </form>

          <section className="form-panel elevated">
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
          </section>

          <section className="form-panel elevated">
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
          </section>

          {message && authStatus === 'idle' && <div className={dashboardStatus === 'error' ? 'state-panel error-text' : 'state-panel success'}>{message}</div>}
        </div>

        <aside className="dashboard-preview">
          <p className="eyebrow">{t('dashboard.livePreview')}</p>
          <ProfileCard profile={previewProfile(profile, savedProfile)} />
          <p className="demo-note">{t('dashboard.previewHint')}</p>
        </aside>
      </div>
    </div>
  );
}

function getAuthErrorMessage(message: string, mode: 'sign-in' | 'sign-up', t: (key: string, vars?: Record<string, string | number>) => string) {
  const lower = message.toLowerCase();
  if (lower.includes('email not confirmed') || lower.includes('confirm')) {
    return t('auth.emailConfirmationRequired');
  }
  if (lower.includes('invalid login credentials')) {
    return t('auth.invalidCredentials');
  }
  if (lower.includes('already registered') || lower.includes('user already registered')) {
    return t('auth.alreadyRegistered');
  }
  return mode === 'sign-up' ? t('auth.registerFailed', { message }) : t('auth.loginFailed', { message });
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
  if (profile.moderation_status === 'blocked' || profile.moderation_status === 'suspended' || profile.status === 'suspended') return t('visibility.suspended');
  if (!profile.city || !profile.category) return t('visibility.missingCityCategory');
  if (!profile.is_test_account && profile.subscription_status !== 'active') return t('visibility.noPayment');
  if (!profile.verified && profile.verification_status !== 'verified') return t('visibility.notVerified');
  if (profile.status !== 'active') return t('visibility.notActive');
  return t('visibility.public');
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
          <input placeholder={t('dashboard.serviceName')} value={service.name} onChange={(event) => update(index, { name: event.target.value })} />
          <input type="number" placeholder={t('dashboard.extraPrice')} value={service.extra_price ?? ''} onChange={(event) => update(index, { extra_price: event.target.value ? Number(event.target.value) : null })} />
          <input placeholder={t('dashboard.note')} value={service.note || ''} onChange={(event) => update(index, { note: event.target.value })} />
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
