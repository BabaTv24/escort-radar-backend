import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Gift,
  Heart,
  Languages,
  LockKeyhole,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
  Tags,
  Video,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Profile, ProfileAccess } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { useI18n } from '../i18n';
import { serviceLabel } from '../data/serviceCatalog';
import { getPublicProfiles, mapApiProfileToPublicProfile } from '../lib/publicProfiles';
import { getPublicLocationLabel, getPublicLocationMode } from '../lib/locationLabels';
import { profileDetailRows } from '../lib/profileDetails';

type ProfileTab = 'overview' | 'services' | 'prices' | 'reviews';

export function ProfilePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [similarProfiles, setSimilarProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [reportMessage, setReportMessage] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [profileAccess, setProfileAccess] = useState<ProfileAccess | null>(null);
  const [accessMessage, setAccessMessage] = useState('');
  const [activationBusy, setActivationBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const { t, option } = useI18n();

  useEffect(() => {
    setError('');
    setProfile(null);
    api.profile(id)
      .then(async (data) => {
        const mapped = mapApiProfileToPublicProfile(data.profile);
        if (!mapped) throw new Error('Profile data is invalid.');
        setProfile(mapped);
        getPublicProfiles(new URLSearchParams({ city: mapped.city }))
          .then((profiles) => setSimilarProfiles(profiles.filter((item) => item.id !== mapped.id).slice(0, 6)))
          .catch(() => setSimilarProfiles([]));
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          api.profileAccess(token, id)
            .then((accessData) => setProfileAccess(accessData.access))
            .catch(() => setProfileAccess(null));
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not load profile.');
      });
  }, [id, retryKey]);

  if (error) return <div className="page narrow"><ErrorState message={error} onRetry={() => setRetryKey((value) => value + 1)} /></div>;
  if (!profile) return <div className="page narrow"><LoadingState /></div>;

  const activated = profileAccess?.client_state === 'client_activated';
  const galleryImages = activated && profileAccess?.full_gallery?.length ? profileAccess.full_gallery : profile.profile_images || [];
  const priceFrom = getPriceFrom(profile);
  const contactFallback = 'Kontakt nie zostal jeszcze dodany';
  const locationLabel = getPublicLocationLabel(profile, t);
  const locationPrivacyLabel = t(`radar.${getPublicLocationMode(profile) === 'exact' ? 'exactAddress' : getPublicLocationMode(profile) === 'postal_area' ? 'postalArea' : getPublicLocationMode(profile) === 'hidden' ? 'hideExactLocation' : 'cityOnly'}`);
  const statusLabel = operatorStatusLabel(profile.operator_status || (profile.availability_status === 'available' ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE'));
  const statusClass = operatorStatusClass(profile.operator_status || (profile.availability_status === 'available' ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE'));
  const travelNotice = getTravelNotice(profile);
  const languages = profile.languages?.length ? profile.languages : ['DE', 'EN'];
  const moreAboutRows = getMoreAboutRows(profile, languages, t);
  const premiumDetailRows = profileDetailRows(profile, t);
  const visitTypes = profile.visit_types?.length ? profile.visit_types : ['incall', 'hotel'];
  const serviceTags = profile.service_tags?.length ? profile.service_tags : ['dinner-date', 'hotel', 'discreet'];
  const selectedServices = profile.services || [];

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.report({
      profile_id: profile!.id,
      reporter_email: String(form.get('email') || ''),
      reason: String(form.get('reason') || 'policy concern'),
      message: String(form.get('message') || '')
    });
    setReportMessage(t('profile.reportSuccess'));
    event.currentTarget.reset();
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.createBookingRequest({
      profile_id: profile!.id,
      requester_email: String(form.get('email') || ''),
      requested_date: String(form.get('date') || ''),
      requested_time: String(form.get('time') || ''),
      duration_minutes: Number(form.get('duration') || 60),
      message: String(form.get('message') || '')
    });
    setBookingMessage(t('profile.bookingSuccess'));
    event.currentTarget.reset();
  }

  return (
    <div className="page premium-profile-page">
      <section className="market-profile-shell">
        <main className="market-profile-main">
          <section className="market-gallery-card">
            <div className="market-gallery-main">
              {galleryImages[0]?.public_url ? (
                <button type="button" onClick={() => setGalleryIndex(0)} aria-label="Open gallery">
                  <img src={galleryImages[0].public_url} alt="" loading="eager" />
                </button>
              ) : (
                <div className="image-placeholder large">{t('profile.noImage')}</div>
              )}
              <div className="market-gallery-overlay">
                <div className="market-badge-row">
                  {profile.verified && <span><BadgeCheck size={14} /> Verified</span>}
                  <span>Premium</span>
                  <span><Video size={14} /> Live Cam</span>
                </div>
                <span className={`status ${statusClass}`}>{statusLabel}</span>
                <h1>{profile.display_name}</h1>
                <p><MapPin size={15} /> {locationLabel}{profile.distance_km ? ` - ${profile.distance_km} km` : ''}</p>
                {travelNotice && <p>{travelNotice}</p>}
                <div className="market-hero-facts">
                  <span><Star size={14} /> 4.9 rating</span>
                  <span>{priceFrom}</span>
                  {profile.radar_score ? <span>Radar score {profile.radar_score}</span> : null}
                  <span>{profile.age ? `${profile.age} years` : 'Age verified'}</span>
                </div>
              </div>
              <span className="media-counter">1/{Math.max(galleryImages.length, 1)}</span>
            </div>

            <div className="market-gallery-thumbs">
              {galleryImages.slice(1, 6).map((image, index) => (
                <button
                  key={image.id}
                  className={!activated ? 'locked-gallery-thumb' : ''}
                  type="button"
                  onClick={() => activated ? setGalleryIndex(index + 1) : startClientActivation()}
                >
                  {image.public_url ? <img src={image.public_url} alt="" loading="lazy" /> : <div className="image-placeholder large">{t('profile.noImage')}</div>}
                  {!activated && <span><LockKeyhole size={15} /> Unlock all photos for 0.99€</span>}
                </button>
              ))}
              {!galleryImages.slice(1, 6).length && <span className="market-empty-inline">More verified photos coming soon.</span>}
            </div>
          </section>

          <nav className="market-profile-tabs" aria-label="Profile sections">
            {(['overview', 'services', 'prices', 'reviews'] as const).map((tab) => (
              <button key={tab} className={activeTab === tab ? 'active' : ''} type="button" onClick={() => setActiveTab(tab)}>
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>

          <MarketSection tab="overview" activeTab={activeTab} eyebrow="Overview" title="Private introduction">
            <p>{profile.description || t('profile.fallbackDescription')}</p>
            <div className="market-detail-grid">
              <MarketFact icon={<ShieldCheck size={17} />} label="Verification" value={profile.verified ? 'Verified profile' : 'Verification pending'} />
              <MarketFact icon={<Languages size={17} />} label="Languages" value={languages.join(', ')} />
              <MarketFact icon={<MapPin size={17} />} label="Visit type" value={visitTypes.map(option).join(', ')} />
              <MarketFact icon={<MapPin size={17} />} label="Location privacy" value={locationPrivacyLabel} />
              <MarketFact icon={<MapPin size={17} />} label="Service radius" value={`${profile.service_radius_km || 25} km`} />
              <MarketFact icon={<MapPin size={17} />} label="Hotspot" value={profile.hotspot_type || 'Not set'} />
              <MarketFact icon={<Clock size={17} />} label="Last active" value={profile.availability_status === 'available' ? 'Available now' : 'Recently active'} />
            </div>
          </MarketSection>

          {moreAboutRows.length ? (
            <MarketSection tab="overview" activeTab={activeTab} eyebrow={t('profile.moreAbout.title')} title={t('profile.moreAbout.title')}>
              <div className="market-detail-grid">
                {moreAboutRows.map((row) => (
                  <MarketFact key={row.label} icon={<BadgeCheck size={17} />} label={row.label} value={row.value} />
                ))}
              </div>
            </MarketSection>
          ) : null}

          {premiumDetailRows.length ? (
            <MarketSection tab="overview" activeTab={activeTab} eyebrow={t('profileDetails.profileDetails')} title={t('profileDetails.profileDetails')}>
              {activated ? (
                <div className="market-detail-grid">
                  {premiumDetailRows.map((row) => (
                    <MarketFact key={row.label} icon={<BadgeCheck size={17} />} label={row.label} value={row.value} />
                  ))}
                </div>
              ) : (
                <div className="market-lock-card">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>{t('profileDetails.profileDetails')}</strong>
                    <p>{t('profileDetails.premiumDetailsLocked')}</p>
                  </div>
                  <button className="button primary" type="button" onClick={startClientActivation}>Activate 0.99 EUR</button>
                </div>
              )}
            </MarketSection>
          ) : null}

          <MarketSection tab="overview" activeTab={activeTab} eyebrow="Availability" title="Schedule and radar status">
            <div className="market-schedule-grid">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => (
                <div key={day}>
                  <span>{day}</span>
                  <strong>{index < 5 ? '18:00 - 02:00' : 'On request'}</strong>
                </div>
              ))}
            </div>
            {travelNotice && <p className="success">{travelNotice}</p>}
            <p className="muted-copy">{profile.availability_note || 'Schedule is confirmed directly before booking. Radar status updates with live availability.'}</p>
          </MarketSection>

          <MarketSection tab="services" activeTab={activeTab} eyebrow="Services" title="Selected experiences">
            {selectedServices.length ? (
              <div className="tag-list premium-tags">
                {selectedServices.map((key) => <span key={key}>{serviceLabel(key)}</span>)}
              </div>
            ) : null}
            <TagList values={serviceTags} />
            {profile.tags?.length ? <div className="tag-list premium-tags">{profile.tags.map((tag) => <span key={tag.id}>{tag.label}</span>)}</div> : null}
            <div className="service-menu-columns">
              <ServiceMenuList title={t('profile.included')} services={(profile.service_menu || []).filter((service) => service.enabled && service.included)} currency={profile.currency || 'EUR'} />
              <ServiceMenuList title={t('profile.extra')} services={(profile.service_menu || []).filter((service) => service.enabled && !service.included)} currency={profile.currency || 'EUR'} />
            </div>
          </MarketSection>

          <MarketSection tab="prices" activeTab={activeTab} eyebrow="Prices" title="Transparent rates">
            <PriceList profile={profile} />
          </MarketSection>

          <MarketSection tab="reviews" activeTab={activeTab} eyebrow="Reviews" title="Verified guest feedback">
            <div className="market-review-summary">
              <strong><Star size={18} /> 4.9</strong>
              <span>Verified reviews are shown after moderation.</span>
            </div>
            <div className="market-empty-state">
              <BadgeCheck size={18} />
              <p>No public reviews yet. First verified reviews will appear here after moderation.</p>
            </div>
          </MarketSection>

          <section className="market-section private-gallery-panel">
            <div className="market-section-heading">
              <p className="eyebrow">VIP gallery</p>
              <h2>Private gallery</h2>
            </div>
            {activated && profileAccess?.vip_gallery_unlocked ? (
              <div className="market-gallery-thumbs vip">
                {(profileAccess.full_gallery || []).slice(0, 6).map((image, index) => (
                  <button key={image.id} type="button" onClick={() => setGalleryIndex(index)}>
                    {image.public_url ? <img src={image.public_url} alt="" loading="lazy" /> : <div className="image-placeholder large">{t('profile.noImage')}</div>}
                  </button>
                ))}
              </div>
            ) : (
              <div className="market-lock-card">
                <LockKeyhole size={18} />
                <div>
                  <strong>Private gallery</strong>
                  <p>Unlock with Coins after client activation.</p>
                </div>
                <button className="button primary" type="button" onClick={activated ? unlockVipGallery : startClientActivation}>{activated ? 'Unlock with Coins' : 'Activate 0.99 EUR'}</button>
              </div>
            )}
          </section>

          <section className="market-section" id="booking">
            <div className="market-section-heading">
              <p className="eyebrow">Booking</p>
              <h2>Send a booking request</h2>
            </div>
            <form onSubmit={submitBooking} className="market-booking-form">
              <input name="email" type="email" placeholder={t('form.email')} required />
              <input name="date" type="date" aria-label={t('form.date')} required />
              <input name="time" type="time" aria-label={t('form.time')} required />
              <select name="duration" defaultValue="60">
                <option value="60">60 min</option>
                <option value="120">120 min</option>
                <option value="240">240 min</option>
              </select>
              <textarea name="message" placeholder={t('form.message')} />
              <button className="button primary" type="submit">Send booking request</button>
              {bookingMessage && <p className="success">{bookingMessage}</p>}
            </form>
          </section>

          <section className="market-section similar-profiles">
            <div className="market-section-heading">
              <p className="eyebrow">Nearby</p>
              <h2>Similar profiles</h2>
            </div>
            <div className="similar-profile-grid">
              {similarProfiles.length ? similarProfiles.map((item) => (
                <a key={item.id} href={`/profile/${item.id}`}>
                  {item.profile_images?.[0]?.public_url && <img src={item.profile_images[0].public_url} alt="" loading="lazy" />}
                  <strong>{item.display_name}</strong>
                  <span>{item.area || item.city} - {getPriceFrom(item)}</span>
                </a>
              )) : <div className="market-empty-state"><p>No similar profiles in this area yet.</p></div>}
            </div>
          </section>

          <section className="market-section report-section">
            <div className="market-section-heading">
              <p className="eyebrow">Safety</p>
              <h2>Report profile</h2>
            </div>
            <form onSubmit={submitReport} className="market-booking-form">
              <input name="email" type="email" placeholder={t('form.emailOptional')} />
              <select name="reason" required>
                <option value="policy concern">{t('profile.reportReasonPolicy')}</option>
                <option value="suspected illegal content">{t('profile.reportReasonIllegal')}</option>
                <option value="non-consensual data">{t('profile.reportReasonData')}</option>
                <option value="other">{t('profile.reportReasonOther')}</option>
              </select>
              <textarea name="message" placeholder={t('profile.reportDetails')} />
              <button className="button" type="submit"><Flag size={16} /> {t('buttons.submitReport')}</button>
              {reportMessage && <p className="success">{reportMessage}</p>}
            </form>
          </section>
        </main>

        <aside className="market-contact-panel">
          <span className={`status ${statusClass}`}>{statusLabel}</span>
          <h2>{profile.display_name}</h2>
          <p><MapPin size={15} /> {locationLabel}</p>
          <div className="market-contact-price">
            <span>From</span>
            <strong>{priceFrom}</strong>
          </div>
          <div className="market-rating-line"><Star size={16} /> 4.9 <span>verified rating</span></div>
          {!activated && <p className="subscription-notice">Activate for 0.99 EUR to reveal direct contact.</p>}
          {activated && (
            <div className="contact-unlocked-list">
              <p><Phone size={15} /> Phone: {profileAccess?.phone_number || contactFallback}</p>
              <p><MessageCircle size={15} /> WhatsApp: {profileAccess?.whatsapp || contactFallback}</p>
              <p><MessageCircle size={15} /> Telegram: {profileAccess?.telegram || contactFallback}</p>
            </div>
          )}
          <div className="market-contact-actions">
            <button className="button primary" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.whatsapp || contactFallback) : startClientActivation()}><MessageCircle size={16} /> Message</button>
            <button className="button" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.phone_number || contactFallback) : startClientActivation()}><Phone size={16} /> Call</button>
            <a href="#booking" className="button"><CalendarDays size={16} /> Book</a>
            <button className="button" type="button"><Heart size={16} /> Favorite</button>
            <button className="button" type="button" onClick={activated ? sendGift : startClientActivation}><Gift size={16} /> Gift</button>
            <button className="button" type="button" onClick={() => setAccessMessage(activated ? 'Live Cam is available for Premium clients.' : 'Activate for 0.99 EUR to unlock Live Cam.')}><Video size={16} /> Live</button>
          </div>
          {accessMessage && <p className={activated ? 'success' : 'subscription-notice'}>{accessMessage}</p>}
          <div className="market-contact-facts">
            <MarketFact icon={<BadgeCheck size={16} />} label="Verified" value={profile.verified ? 'Yes' : 'Pending'} />
            <MarketFact icon={<Languages size={16} />} label="Languages" value={languages.join(', ')} />
            <MarketFact icon={<MapPin size={16} />} label="Visits" value={visitTypes.map(option).join(', ')} />
            <MarketFact icon={<Clock size={16} />} label="Last active" value={profile.availability_status === 'available' ? 'Now' : 'Recently'} />
          </div>
        </aside>
      </section>

      {galleryIndex !== null && galleryImages.length > 0 && (
        <FullscreenGallery
          images={galleryImages}
          index={galleryIndex}
          profile={profile}
          onIndex={setGalleryIndex}
          onClose={() => setGalleryIndex(null)}
          touchStart={touchStart}
          setTouchStart={setTouchStart}
          activated={activated}
          onUnlock={startClientActivation}
        />
      )}

      <nav className="profile-floating-cta">
        <button type="button" onClick={() => activated ? setAccessMessage(profileAccess?.whatsapp || contactFallback) : startClientActivation()}><MessageCircle size={17} /> Message</button>
        <button type="button" onClick={() => activated ? setAccessMessage(profileAccess?.phone_number || contactFallback) : startClientActivation()}><Phone size={17} /> Call</button>
        <a href="#booking"><CalendarDays size={17} /> Book</a>
      </nav>
    </div>
  );

  async function startClientActivation() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setAccessMessage('Zaloguj sie, aby aktywowac konto za 0,99 EUR.');
      return;
    }

    setActivationBusy(true);
    try {
      navigate('/pricing?product=client_activation');
    } catch (err) {
      setAccessMessage(err instanceof Error ? err.message : 'Nie udalo sie uruchomic platnosci.');
    } finally {
      setActivationBusy(false);
    }
  }

  async function sendGift() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return setAccessMessage('Login required.');
    await api.sendGift(token, { profile_id: profile!.id, gift_type: 'rose', coin_cost: 10 });
    setAccessMessage('Gift sent.');
  }

  async function unlockVipGallery() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return setAccessMessage('Login required.');
    await api.unlockVipGallery(token, profile!.id, 25);
    const access = await api.profileAccess(token, profile!.id);
    setProfileAccess(access.access);
    setAccessMessage('VIP gallery unlocked.');
  }
}

function MarketSection({ tab, activeTab, eyebrow, title, children }: {
  tab: ProfileTab;
  activeTab: ProfileTab;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="market-section" data-tab-visible={activeTab === tab}>
      <div className="market-section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MarketFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="market-fact">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getMoreAboutRows(profile: Profile, languages: string[], t: (key: string, vars?: Record<string, string | number>) => string) {
  const rows = [
    ['age', profile.age ? String(profile.age) : ''],
    ['height', profile.height_cm || profile.height ? `${profile.height_cm || profile.height} cm` : ''],
    ['weight', profile.weight_kg ? `${profile.weight_kg} kg` : ''],
    ['bust', profile.bust],
    ['eyes', profile.eyes],
    ['hair', profile.hair || profile.hair_color],
    ['languages', languages.length ? languages.join(', ') : ''],
    ['nationality', profile.nationality],
    ['zodiacSign', profile.zodiac_sign]
  ];
  return rows
    .map(([key, value]) => ({ label: t(`profile.moreAbout.${key}`), value: String(value || '').trim() }))
    .filter((row) => row.value);
}

function getPriceFrom(profile: Profile) {
  const values = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!values.length) return 'Cena na zapytanie';
  return `${Math.min(...values)} ${profile.currency || 'EUR'}`;
}

function operatorStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ONLINE_NOW: 'Online now',
    BUSY: 'Busy',
    TRAVELING: 'Traveling',
    AVAILABLE_TODAY: 'Available today',
    APPOINTMENT_ONLY: 'Appointment only',
    OFFLINE: 'Offline'
  };
  return labels[status] || 'Offline';
}

function operatorStatusClass(status: string) {
  const classes: Record<string, string> = {
    ONLINE_NOW: 'online-now',
    AVAILABLE_TODAY: 'available-today',
    BUSY: 'busy',
    APPOINTMENT_ONLY: 'appointment-only',
    TRAVELING: 'traveling',
    OFFLINE: 'offline'
  };
  return classes[status] || 'offline';
}

function getTravelNotice(profile: Profile) {
  if (profile.operator_status !== 'TRAVELING' || !profile.travel_city) return '';
  const arrival = profile.travel_arrival_date ? formatTravelDate(profile.travel_arrival_date) : '';
  const departure = profile.travel_departure_date ? formatTravelDate(profile.travel_departure_date) : '';
  if (arrival && departure) return `Visiting ${profile.travel_city} from ${arrival} to ${departure}`;
  return `Visiting ${profile.travel_city}`;
}

function formatTravelDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function FullscreenGallery({ images, index, profile, onIndex, onClose, touchStart, setTouchStart, activated, onUnlock }: {
  images: NonNullable<Profile['profile_images']>;
  index: number;
  profile: Profile;
  onIndex: (index: number) => void;
  onClose: () => void;
  touchStart: number | null;
  setTouchStart: (value: number | null) => void;
  activated: boolean;
  onUnlock: () => void;
}) {
  const { t } = useI18n();
  const image = images[index];
  const locked = !activated && index > 0;
  const previous = () => onIndex((index - 1 + images.length) % images.length);
  const next = () => onIndex((index + 1) % images.length);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, images.length]);

  useEffect(() => {
    const nextImage = images[(index + 1) % images.length]?.public_url;
    if (nextImage) {
      const preload = new Image();
      preload.src = nextImage;
    }
  }, [index, images]);

  return (
    <div className="fullscreen-gallery" onClick={onClose}>
      <button className="gallery-close" type="button" onClick={onClose}><X /></button>
      <button className="gallery-nav left" type="button" onClick={(event) => { event.stopPropagation(); previous(); }}><ChevronLeft /></button>
      <figure
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
        onTouchEnd={(event) => {
          if (touchStart === null) return;
          const delta = event.changedTouches[0].clientX - touchStart;
          if (delta > 40) previous();
          if (delta < -40) next();
          setTouchStart(null);
        }}
      >
        {image?.public_url && <img className={locked ? 'locked-gallery-image' : ''} src={image.public_url} alt="" />}
        {locked && (
          <button className="gallery-unlock-overlay" type="button" onClick={onUnlock}>
            <LockKeyhole size={18} /> Unlock all photos for 0.99€
          </button>
        )}
        <figcaption>
          <span>{index + 1}/{images.length}</span>
          <strong>{profile.display_name}</strong>
          <small>{t('profile.galleryHint')}</small>
        </figcaption>
      </figure>
      <button className="gallery-nav right" type="button" onClick={(event) => { event.stopPropagation(); next(); }}><ChevronRight /></button>
      <div className="gallery-creator-overlay">
        <strong>{profile.display_name}</strong>
        <span>{t(`status.${profile.availability_status || 'unavailable'}`)}</span>
      </div>
    </div>
  );
}

function TagList({ values, raw = false }: { values: string[]; raw?: boolean }) {
  const { t, option } = useI18n();
  if (!values.length) return <p>{t('profile.detailsPending')}</p>;
  return <div className="tag-list">{values.map((value) => <span key={value}>{raw ? value : option(value)}</span>)}</div>;
}

function PriceList({ profile }: { profile: Profile }) {
  const currency = profile.currency || 'EUR';
  const rows = [
    ['30 min', profile.price_30min],
    ['1h', profile.price_1h],
    ['2h', profile.price_2h],
    ['Overnight', profile.price_night],
    ['Outcall fee', profile.outcall_fee]
  ];

  return (
    <div className="price-list market-price-list">
      {rows.map(([label, value]) => value ? <div key={label}><span>{label}</span><strong>{value} {currency}</strong></div> : null)}
      {!rows.some(([, value]) => value) && <p>Rates are available on request.</p>}
    </div>
  );
}

function ServiceMenuList({ title, services, currency }: { title: string; services: NonNullable<Profile['service_menu']>; currency: string }) {
  const { t, option } = useI18n();
  return (
    <div className="service-menu-list">
      <h3>{title}</h3>
      {services.length ? services.map((service) => (
        <div className="service-menu-item" key={service.name}>
          <div>
            <strong>{option(service.name)}</strong>
            {service.note && <p>{service.note}</p>}
          </div>
          <span>{service.included ? t('profile.includedLabel') : `${service.extra_price || 0} ${currency}`}</span>
        </div>
      )) : <p>{t('profile.detailsPending')}</p>}
    </div>
  );
}
