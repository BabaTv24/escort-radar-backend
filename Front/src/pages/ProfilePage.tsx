import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Flag, Gift, Languages, LockKeyhole, MapPin, MessageCircle, Phone, ShieldCheck, Star, Tags, Video, X } from 'lucide-react';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { Profile, ProfileAccess } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { getDemoProfile } from '../data/demoProfiles';
import { useI18n } from '../i18n';

export function ProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [profileAccess, setProfileAccess] = useState<ProfileAccess | null>(null);
  const [accessMessage, setAccessMessage] = useState('');
  const [activationBusy, setActivationBusy] = useState(false);
  const { t, option } = useI18n();

  useEffect(() => {
    api.profile(id)
      .then(async (data) => {
        setProfile(data.profile);
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (token) {
          api.profileAccess(token, id)
            .then((accessData) => setProfileAccess(accessData.access))
            .catch(() => setProfileAccess(null));
        }
      })
      .catch((err) => {
        const demo = getDemoProfile(id);
        if (demo) setProfile(demo);
        else setError(err.message);
      });
  }, [id]);

  if (error) return <div className="page narrow"><ErrorState message={error} /></div>;
  if (!profile) return <div className="page narrow"><LoadingState /></div>;
  const galleryImages = profileAccess?.full_gallery?.length ? profileAccess.full_gallery : profile.profile_images || [];
  const activated = profileAccess?.client_state === 'client_activated';
  const priceFrom = getPriceFrom(profile);
  const contactFallback = 'Kontakt nie zostal jeszcze dodany';

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
      <section className="premium-profile-hero">
        <div className="profile-media-slider">
          {galleryImages.length ? galleryImages.slice(0, 4).map((image, index) => (
            <button key={image.id} className={index === 0 ? 'profile-media-main' : 'profile-media-thumb'} type="button" onClick={() => setGalleryIndex(index)}>
              {image.public_url ? <img src={image.public_url} alt="" loading={index === 0 ? 'eager' : 'lazy'} /> : <div className="image-placeholder large">{t('profile.noImage')}</div>}
              {index === 0 && <span className="media-counter">{index + 1}/{galleryImages.length}</span>}
              {index === 3 && galleryImages.length > 4 && <span className="premium-unlock-overlay">+{galleryImages.length - 4}</span>}
            </button>
          )) : <div className="image-placeholder large">{t('profile.noImage')}</div>}
          <div className="locked-media-teaser">
            <LockKeyhole size={18} />
            <strong>{t('profile.lockedMediaTeaser')}</strong>
            <button className="button primary" type="button">{t('creator.unlockWithTokens')}</button>
          </div>
        </div>
        <div className="profile-summary">
          <span className={`status ${profile.availability_status || 'unavailable'}`}>{profile.availability_status === 'available' ? t('profile.liveNow') : t(`status.${profile.availability_status || 'unavailable'}`)}</span>
          <h1>{profile.display_name}{profile.age ? <span>{profile.age}</span> : null}</h1>
          <p><MapPin size={16} /> {profile.city}{profile.area ? `, ${profile.area}` : ''}</p>
          <p>{profile.category ? option(profile.category) : option('other')} · {profile.approximate_location_area || profile.area}</p>
          <div className="badges">
            {profile.verified && <span><BadgeCheck size={14} /> {t('badges.verified')}</span>}
            {profile.mobile_service && <span>{t('badges.mobile')}</span>}
            {profile.private_studio && <span>{t('badges.private')}</span>}
            <span><Star size={14} /> {t('profile.popularTonight')}</span>
          </div>
          <div className="premium-contact-card">
            <div>
              <p className="eyebrow">Premium contact</p>
              <h2>{profile.display_name}</h2>
              <p>{profile.age ? `${profile.age} lat` : 'Wiek potwierdzany'} · {profile.city}{profile.area ? `, ${profile.area}` : ''}</p>
              <p>{profile.availability_status === 'available' ? 'Dostepna teraz' : 'Status: ' + (profile.availability_status || 'unavailable')}</p>
              <p>Cena od: {priceFrom}</p>
              <p>{profile.verified ? 'Profil zweryfikowany' : 'Weryfikacja w toku'} · {profile.distance_km ? `${profile.distance_km} km` : 'Radar Berlin'}</p>
            </div>
            {!activated && <p className="subscription-notice">Aktywuj za 0,99€ aby zobaczyc kontakt</p>}
            {activated && (
              <div className="contact-unlocked-list">
                <p><Phone size={15} /> Telefon: {profileAccess?.phone_number || contactFallback}</p>
                <p><MessageCircle size={15} /> WhatsApp: {profileAccess?.whatsapp || contactFallback}</p>
                <p><MessageCircle size={15} /> Telegram: {profileAccess?.telegram || contactFallback}</p>
              </div>
            )}
            <div className="profile-cta-grid">
              <button className="button primary" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.phone_number || contactFallback) : startClientActivation()}><Phone size={16} /> Telefon</button>
              <button className="button" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.whatsapp || contactFallback) : startClientActivation()}><MessageCircle size={16} /> WhatsApp</button>
              <button className="button" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.telegram || contactFallback) : startClientActivation()}><MessageCircle size={16} /> Telegram</button>
              <a href="#booking" className="button"><CalendarDays size={16} /> Rezerwuj</a>
              <button className="button" type="button" onClick={activated ? sendGift : startClientActivation}><Gift size={16} /> Wyslij prezent</button>
              <button className="button" type="button" onClick={() => setAccessMessage(activated ? 'Live Cam jest aktywny dla kont Premium.' : 'Aktywuj za 0,99€ aby odblokowac Live Cam.')}><Video size={16} /> Live Cam</button>
            </div>
          </div>
          <p>{profile.description || t('profile.fallbackDescription')}</p>
          <div className="conversion-row">
            <span>{t('profile.currentlyOnline')}</span>
            <span>{t('profile.lastBooking')}</span>
            <span>{t('profile.limitedAvailability')}</span>
          </div>
          {profile.subscription_status === 'demo' && <p className="demo-note">{t('home.demo')}</p>}
          <p className="safety-line">{t('profile.availableWithin', { radius: profile.service_radius_km || 25 })}</p>
          <p className="safety-line">{t('radar.privacy')}</p>
          <div className="profile-cta-grid">
            <a href="#booking" className="button primary"><CalendarDays size={16} /> {t('profile.bookNow')}</a>
            <button className="button" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.phone_number || contactFallback) : startClientActivation()}><MessageCircle size={16} /> {activated ? 'Kontakt' : 'Aktywuj kontakt'}</button>
            <button className="button" type="button" onClick={() => setAccessMessage(activated ? 'Live Cam jest aktywny dla kont Premium.' : 'Aktywuj za 0,99€ aby odblokowac Live Cam.')}><Video size={16} /> {t('creator.liveCamCta')}</button>
          </div>
          {accessMessage && <p className={activated ? 'success' : 'subscription-notice'}>{accessMessage}</p>}
        </div>
      </section>

      <section className="notice safety"><AlertTriangle size={18} /> {t('city.safety')}</section>

      <section className="profile-info-grid">
        <InfoPanel title={t('profile.about')} icon={<ShieldCheck size={18} />}>
          <p>{profile.age ? t('profile.ageYears', { age: profile.age }) : t('profile.ageVerified')}{profile.height ? ` / ${profile.height} cm` : ''}</p>
          <p>{profile.body_type ? t('profile.bodyType', { value: option(profile.body_type) }) : t('profile.bodyPending')}</p>
          <p>{profile.hair_color ? t('profile.hair', { value: option(profile.hair_color) }) : t('profile.hairPending')}</p>
          <p>{profile.origin ? t('profile.origin', { value: option(profile.origin) }) : t('profile.originPending')}</p>
          <p>{profile.experience_type ? t('profile.experience', { value: option(profile.experience_type) }) : t('profile.experiencePending')}</p>
          <TagList values={profile.body_features || []} raw />
          <p>{profile.orientation ? option(profile.orientation) : t('profile.orientationPending')}</p>
          <p>{profile.audience?.length ? t('profile.audience', { value: profile.audience.map(option).join(', ') }) : t('profile.audiencePending')}</p>
        </InfoPanel>
        <InfoPanel title={t('profile.pricing')} icon={<LockKeyhole size={18} />}>
          <PriceList profile={profile} />
        </InfoPanel>
        <InfoPanel title="Client access" icon={<LockKeyhole size={18} />}>
          {activated ? (
            <>
              <p>Telefon: {profileAccess?.phone_number || contactFallback}</p>
              <p>WhatsApp: {profileAccess?.whatsapp || contactFallback}</p>
              <p>Telegram: {profileAccess?.telegram || contactFallback}</p>
              <button className="button" type="button" onClick={sendGift}>Wyslij prezent - 10 Coins</button>
              <button className="button" type="button" onClick={unlockVipGallery}>Odblokuj galerie VIP - 25 Coins</button>
            </>
          ) : (
            <>
              <p>Telefon, WhatsApp, Telegram, pelna galeria, galeria VIP, prezenty i Live Cam wymagaja aktywacji klienta.</p>
              <button className="button primary" type="button" disabled={activationBusy} onClick={startClientActivation}>{activationBusy ? 'Ladowanie...' : 'Aktywuj za 0,99€'}</button>
            </>
          )}
        </InfoPanel>
        <InfoPanel title={t('profile.availability')} icon={<CalendarDays size={18} />}>
          <p>{t(`status.${profile.availability_status || 'unavailable'}`)}</p>
          <p>{profile.availability_note || t('profile.detailsPending')}</p>
        </InfoPanel>
        <InfoPanel title={t('profile.servicesTags')} icon={<Tags size={18} />}>
          <TagList values={profile.service_tags || []} />
          {profile.tags?.length ? <div className="tag-list premium-tags">{profile.tags.map((tag) => <span key={tag.id}>{tag.label}</span>)}</div> : null}
        </InfoPanel>
        <InfoPanel title={t('profile.languages')} icon={<Languages size={18} />}>
          <TagList values={profile.languages || []} raw />
        </InfoPanel>
        <InfoPanel title={t('profile.visitOptions')} icon={<MapPin size={18} />}>
          <TagList values={profile.visit_types || []} />
          <TagList values={profile.payment_methods || []} />
        </InfoPanel>
        <InfoPanel title={t('profile.safety')} icon={<AlertTriangle size={18} />}>
          <p>{t('city.safety')}</p>
        </InfoPanel>
      </section>

      <section className="form-panel service-menu-panel">
        <h2><Tags size={18} /> {t('profile.serviceMenu')}</h2>
        <div className="service-menu-columns">
          <ServiceMenuList title={t('profile.included')} services={(profile.service_menu || []).filter((service) => service.enabled && service.included)} currency={profile.currency || 'EUR'} />
          <ServiceMenuList title={t('profile.extra')} services={(profile.service_menu || []).filter((service) => service.enabled && !service.included)} currency={profile.currency || 'EUR'} />
        </div>
      </section>

      <section className="form-panel booking-panel" id="booking">
        <h2><CalendarDays size={18} /> {t('profile.booking')}</h2>
        <p className="safety-line">{t('city.safety')}</p>
        <form onSubmit={submitBooking} className="stack">
          <div className="form-grid">
            <input name="email" type="email" placeholder={t('form.email')} required />
            <input name="date" type="date" aria-label={t('form.date')} required />
            <input name="time" type="time" aria-label={t('form.time')} required />
            <select name="duration" defaultValue="60">
              <option value="60">60 min</option>
              <option value="120">120 min</option>
              <option value="240">240 min</option>
            </select>
          </div>
          <textarea name="message" placeholder={t('form.message')} />
          <button className="button primary" type="submit">Wyslij request rezerwacji</button>
          {bookingMessage && <p className="success">{bookingMessage}</p>}
        </form>
      </section>

      <section className="form-panel private-gallery-panel">
        <h2><LockKeyhole size={18} /> Prywatna galeria</h2>
        {activated && profileAccess?.vip_gallery_unlocked ? (
          <div className="profile-media-slider">
            {(profileAccess.full_gallery || []).slice(0, 4).map((image, index) => (
              <button key={image.id} className={index === 0 ? 'profile-media-main' : 'profile-media-thumb'} type="button" onClick={() => setGalleryIndex(index)}>
                {image.public_url ? <img src={image.public_url} alt="" loading="lazy" /> : <div className="image-placeholder large">{t('profile.noImage')}</div>}
              </button>
            ))}
          </div>
        ) : (
          <div className="premium-contact-card">
            <p className="eyebrow">VIP access</p>
            <h2>Prywatna galeria</h2>
            <p>Odblokuj Coins, aby zobaczyc prywatne zdjecia po aktywacji konta.</p>
            <button className="button primary" type="button" onClick={activated ? unlockVipGallery : startClientActivation}>{activated ? 'Odblokuj Coins' : 'Aktywuj za 0,99€'}</button>
          </div>
        )}
      </section>

      <section className="profile-info-grid">
        <InfoPanel title={t('profile.reviews')} icon={<Star size={18} />}>
          <p>{t('profile.reviewsPlaceholder')}</p>
        </InfoPanel>
        <InfoPanel title={t('profile.similarCreators')} icon={<Tags size={18} />}>
          <p>{t('profile.similarPlaceholder')}</p>
        </InfoPanel>
      </section>

      <section className="form-panel">
        <h2><Flag size={18} /> {t('profile.reportTitle')}</h2>
        <form onSubmit={submitReport} className="stack">
          <input name="email" type="email" placeholder={t('form.emailOptional')} />
          <select name="reason" required>
            <option value="policy concern">{t('profile.reportReasonPolicy')}</option>
            <option value="suspected illegal content">{t('profile.reportReasonIllegal')}</option>
            <option value="non-consensual data">{t('profile.reportReasonData')}</option>
            <option value="other">{t('profile.reportReasonOther')}</option>
          </select>
          <textarea name="message" placeholder={t('profile.reportDetails')} />
          <button className="button primary" type="submit">{t('buttons.submitReport')}</button>
          {reportMessage && <p className="success">{reportMessage}</p>}
        </form>
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
        />
      )}
      <nav className="profile-floating-cta">
        <button type="button" onClick={() => activated ? setAccessMessage(profileAccess?.phone_number || contactFallback) : startClientActivation()}><MessageCircle size={17} /> Kontakt</button>
        <a href="#booking"><CalendarDays size={17} /> Rezerwuj</a>
        <button type="button" onClick={activated ? sendGift : startClientActivation}><Gift size={17} /> Coins</button>
        <a href="/city/berlin"><MapPin size={17} /> Radar</a>
      </nav>
    </div>
  );

  async function startClientActivation() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setAccessMessage('Zaloguj sie, aby aktywowac konto za 0,99€.');
      return;
    }

    setActivationBusy(true);
    try {
      const checkout = await api.clientActivationCheckout(token);
      window.location.href = checkout.checkout_url;
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

function getPriceFrom(profile: Profile) {
  const values = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!values.length) return 'Cena na zapytanie';
  return `${Math.min(...values)} ${profile.currency || 'EUR'}`;
}

function InfoPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <article className="info-panel">
      <h2>{icon} {title}</h2>
      {children}
    </article>
  );
}

function FullscreenGallery({ images, index, profile, onIndex, onClose, touchStart, setTouchStart }: {
  images: NonNullable<Profile['profile_images']>;
  index: number;
  profile: Profile;
  onIndex: (index: number) => void;
  onClose: () => void;
  touchStart: number | null;
  setTouchStart: (value: number | null) => void;
}) {
  const { t } = useI18n();
  const image = images[index];
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
        {image?.public_url && <img src={image.public_url} alt="" />}
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
        <button className="button primary" type="button">{t('creator.unlockWithTokens')}</button>
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
    ['form.price30', profile.price_30min],
    ['form.price1h', profile.price_1h],
    ['form.price2h', profile.price_2h],
    ['form.priceNight', profile.price_night],
    ['form.outcallFee', profile.outcall_fee]
  ];
  const { t } = useI18n();

  return (
    <div className="price-list">
      {rows.map(([label, value]) => value ? <div key={label}><span>{t(String(label))}</span><strong>{value} {currency}</strong></div> : null)}
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
