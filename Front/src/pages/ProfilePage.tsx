import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import type { Profile, ProfileAccess, SponsoredChatMessage, SponsoredChatSession } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { useI18n } from '../i18n';
import { serviceLabel } from '../data/serviceCatalog';
import { getPublicProfiles, mapApiProfileToPublicProfile } from '../lib/publicProfiles';
import { getPublicLocationLabel, getPublicLocationMode } from '../lib/locationLabels';
import { profileDetailRows } from '../lib/profileDetails';
import { availabilityDayKeys, normalizeAvailabilityHoursForEditor } from '../components/AvailabilityHoursEditor';

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
  const [profileAccessChecked, setProfileAccessChecked] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [favoriteSaved, setFavoriteSaved] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoritesWalletSystem, setFavoritesWalletSystem] = useState<'legacy' | 'bcu'>('legacy');
  const [activationBusy, setActivationBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [clientToken, setClientToken] = useState('');
  const [chatSession, setChatSession] = useState<SponsoredChatSession | null>(null);
  const [chatMessages, setChatMessages] = useState<SponsoredChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const paidSponsoredInteractionsEnabled = import.meta.env.VITE_BCU_WALLET_ENABLED === 'true';
  const { t, option } = useI18n();

  useEffect(() => {
    setError('');
    setProfile(null);
    setProfileAccess(null);
    setProfileAccessChecked(false);
    api.profile(id)
      .then(async (data) => {
        const mapped = mapApiProfileToPublicProfile(data.profile);
        if (!mapped) throw new Error(t('profile.invalidData'));
        setProfile(mapped);
        getPublicProfiles(new URLSearchParams({ city: mapped.city }))
          .then((profiles) => setSimilarProfiles(profiles.filter((item) => item.id !== mapped.id).slice(0, 6)))
          .catch(() => setSimilarProfiles([]));
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        setClientToken(token || '');
        if (token) {
          api.clientPremiumDashboardMe(token).then((dashboard) => setFavoritesWalletSystem(dashboard.wallet_system)).catch(() => setFavoritesWalletSystem('legacy'));
          api.profileAccess(token, id)
            .then((accessData) => setProfileAccess(accessData.access))
            .catch(() => setProfileAccess(null))
            .finally(() => setProfileAccessChecked(true));
        } else {
          setProfileAccessChecked(true);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : t('profile.loadError'));
      });
  }, [id, retryKey]);

  if (error) return <div className="page narrow"><ErrorState message={error} onRetry={() => setRetryKey((value) => value + 1)} /></div>;
  if (!profile) return <div className="page narrow"><LoadingState /></div>;

  const availabilityHours = normalizeAvailabilityHoursForEditor(profile.opening_hours);
  const activated = profileAccess?.client_state === 'client_activated';
  const canUsePremiumProfileFeatures = activated;
  const galleryImages = activated && profileAccess?.full_gallery?.length ? profileAccess.full_gallery : profile.profile_images || [];
  const priceFrom = getPriceFrom(profile, t);
  const contactFallback = t('profile.contactMissing');
  const locationLabel = getPublicLocationLabel(profile, t);
  const locationPrivacyLabel = t(`radar.${getPublicLocationMode(profile) === 'exact' ? 'exactAddress' : getPublicLocationMode(profile) === 'postal_area' ? 'postalArea' : getPublicLocationMode(profile) === 'hidden' ? 'hideExactLocation' : 'cityOnly'}`);
  const statusLabel = operatorStatusLabel(profile.operator_status || (profile.availability_status === 'available' ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE'), t);
  const statusClass = operatorStatusClass(profile.operator_status || (profile.availability_status === 'available' ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE'));
  const travelNotice = getTravelNotice(profile);
  const languages = profile.languages?.length ? profile.languages : ['DE', 'EN'];
  const moreAboutRows = getMoreAboutRows(profile, languages, t);
  const premiumDetailRows = profileDetailRows(profile, t);
  const visitTypes = profile.visit_types?.length ? profile.visit_types : ['incall', 'hotel'];
  const clientVisitMode = getClientVisitMode(profile, t);
  const serviceTags = profile.service_tags?.length ? profile.service_tags : ['dinner-date', 'hotel', 'discreet'];
  const selectedServices = profile.services || [];
  const servicePricingRows = getServicePricingRows(profile);

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
    if (paidSponsoredInteractionsEnabled && !clientToken) return navigate(`/login?next=${encodeURIComponent(`/profile/${profile!.id}`)}`);
    if (paidSponsoredInteractionsEnabled && !window.confirm('Wysłanie zapytania booking kosztuje 5 BC. Kontynuować?')) return;
    const form = new FormData(event.currentTarget);
    await api.createBookingRequest(clientToken, {
      profile_id: profile!.id,
      requester_email: String(form.get('email') || ''),
      requested_date: String(form.get('date') || ''),
      requested_time: String(form.get('time') || ''),
      duration_minutes: Number(form.get('duration') || 60),
      message: String(form.get('message') || ''),
      idempotency_key: crypto.randomUUID()
    });
    setBookingMessage(paidSponsoredInteractionsEnabled && profile!.owner_activation_status === 'awaiting_owner_activation'
      ? 'Zapytanie zapisano ze statusem „oczekuje na aktywację”. Właściciel przejmie je po aktywacji konta.'
      : t('profile.bookingSuccess'));
    event.currentTarget.reset();
  }

  return (
    <div className="page premium-profile-page">
      <section className="market-profile-shell">
        <main className="market-profile-main">
          <section className="market-gallery-card">
            <div className="market-gallery-main">
              {galleryImages[0]?.public_url ? (
                <button type="button" onClick={() => setGalleryIndex(0)} aria-label={t('profile.openGallery')}>
                  <img src={galleryImages[0].public_url} alt="" loading="eager" />
                </button>
              ) : (
                <div className="image-placeholder large">{t('profile.noImage')}</div>
              )}
              <div className="market-gallery-overlay">
                <div className="market-badge-row">
                  {profile.verified && <span><BadgeCheck size={14} /> {t('profile.verified')}</span>}
                  <span>{t('profile.premium')}</span>
                  <span><Video size={14} /> {t('profile.liveCam')}</span>
                </div>
                <span className={`status ${statusClass}`}>{statusLabel}</span>
                <h1>{profile.display_name}</h1>
                <p><MapPin size={15} /> {locationLabel}{profile.distance_km ? ` - ${profile.distance_km} km` : ''}</p>
                {travelNotice && <p>{travelNotice}</p>}
                <div className="market-hero-facts">
                  <span><Star size={14} /> {t('profile.rating', { rating: '4.9' })}</span>
                  <span>{priceFrom}</span>
                  {profile.radar_score ? <span>{t('profile.radarScore', { score: profile.radar_score })}</span> : null}
                  <span>{profile.age ? t('profile.ageYears', { age: profile.age }) : t('profile.ageVerified')}</span>
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
                  {!activated && <span><LockKeyhole size={15} /> {t('profile.unlockPhotos')}</span>}
                </button>
              ))}
              {!galleryImages.slice(1, 6).length && <span className="market-empty-inline">{t('profile.morePhotosSoon')}</span>}
            </div>
          </section>

          <nav className="market-profile-tabs" aria-label={t('profile.sections')}>
            {(['overview', 'services', 'prices', 'reviews'] as const).map((tab) => (
              <button key={tab} className={activeTab === tab ? 'active' : ''} type="button" onClick={() => setActiveTab(tab)}>
                {t(`profile.tabs.${tab}`)}
              </button>
            ))}
          </nav>

          <MarketSection tab="overview" activeTab={activeTab} eyebrow={t('profile.tabs.overview')} title={t('profile.privateIntroduction')}>
            <p>{profile.description || t('profile.fallbackDescription')}</p>
            <div className="market-detail-grid">
              <MarketFact icon={<ShieldCheck size={17} />} label={t('profile.verification')} value={profile.verified ? t('profile.verifiedProfile') : t('profile.verificationPending')} />
              <MarketFact icon={<Languages size={17} />} label={t('profile.languages')} value={languages.join(', ')} />
              <MarketFact icon={<MapPin size={17} />} label={t('profile.visitType')} value={visitTypes.map(option).join(', ')} />
              {clientVisitMode && <MarketFact icon={<MapPin size={17} />} label={t('profileDetails.visitMode')} value={clientVisitMode} />}
              <MarketFact icon={<MapPin size={17} />} label={t('profile.locationPrivacy')} value={locationPrivacyLabel} />
              <MarketFact icon={<MapPin size={17} />} label={t('profile.serviceRadius')} value={`${profile.service_radius_km || 25} km`} />
              <MarketFact icon={<MapPin size={17} />} label={t('profile.hotspot')} value={profile.hotspot_type || t('profile.notSet')} />
              <MarketFact icon={<Clock size={17} />} label={t('profile.lastActive')} value={profile.availability_status === 'available' ? t('badges.availableNow') : t('profile.recentlyActive')} />
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
                  <button className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" type="button" onClick={startClientActivation}><span>{t('profile.activateClient')}</span></button>
                </div>
              )}
            </MarketSection>
          ) : null}

          <MarketSection tab="overview" activeTab={activeTab} eyebrow={t('profile.availability')} title={t('profile.scheduleTitle')}>
            <div className="market-schedule-grid">
              {availabilityDayKeys.map((day) => (
                <div key={day}>
                  <span>{t(`availability.days.${day}`)}</span>
                  <strong>{availabilityHours.weekly[day].enabled ? `${availabilityHours.weekly[day].start} - ${availabilityHours.weekly[day].end}` : t('availability.closed')}</strong>
                </div>
              ))}
            </div>
            {travelNotice && <p className="success">{travelNotice}</p>}
            <p className="muted-copy">{availabilityHours.note || profile.availability_note || t('profile.scheduleFallback')}</p>
          </MarketSection>

          <MarketSection tab="services" activeTab={activeTab} eyebrow={t('profile.tabs.services')} title={t('profile.selectedExperiences')}>
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
            {servicePricingRows.length ? activated ? (
              <ServicePricingList rows={servicePricingRows} currency={profile.currency || 'EUR'} />
            ) : (
              <div className="market-lock-card">
                <LockKeyhole size={18} />
                <div>
                  <strong>{t('pricing.servicePricing')}</strong>
                  <p>{t('profileDetails.premiumDetailsLocked')}</p>
                </div>
                <button className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" type="button" onClick={startClientActivation}><span>{t('profile.activateClient')}</span></button>
              </div>
            ) : null}
          </MarketSection>

          <MarketSection tab="prices" activeTab={activeTab} eyebrow={t('profile.tabs.prices')} title={t('profile.transparentRates')}>
            <PriceList profile={profile} />
          </MarketSection>

          <MarketSection tab="reviews" activeTab={activeTab} eyebrow={t('profile.tabs.reviews')} title={t('profile.verifiedFeedback')}>
            <div className="market-review-summary">
              <strong><Star size={18} /> 4.9</strong>
              <span>{t('profile.reviewsModerated')}</span>
            </div>
            <div className="market-empty-state">
              <BadgeCheck size={18} />
              <p>{t('profile.noReviewsYet')}</p>
            </div>
          </MarketSection>

          <section className="market-section private-gallery-panel">
            <div className="market-section-heading">
              <p className="eyebrow">{t('profile.vipGallery')}</p>
              <h2>{t('profile.privateGallery')}</h2>
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
                  <strong>{t('profile.privateGallery')}</strong>
                  <p>{t('profile.unlockGalleryText')}</p>
                </div>
                <button className="button primary er-btn er-glass-btn er-glass-btn--purple er-glass-btn--md" type="button" onClick={activated ? unlockVipGallery : startClientActivation}><span>{activated ? t('profile.unlockWithCoins') : t('profile.activateClient')}</span></button>
              </div>
            )}
          </section>

          {canUsePremiumProfileFeatures ? (
            <>
              <section className="market-section" id="booking">
                <div className="market-section-heading">
                  <p className="eyebrow">{t('profile.booking')}</p>
                  <h2>{t('profile.sendBookingRequest')}</h2>
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
                  <button className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" type="submit"><span>{t('buttons.sendBooking')}</span></button>
                  {bookingMessage && <p className="success">{bookingMessage}</p>}
                </form>
              </section>

              {chatSession && (
                <section className="market-section sponsored-chat" id="profile-chat">
                  <div className="market-section-heading">
                    <p className="eyebrow">Asystent Profilu Escort Radar · 3 BC</p>
                    <h2>Czat z profilem</h2>
                  </div>
                  {profile.owner_activation_status === 'awaiting_owner_activation' && <p className="subscription-notice">Konto nie zostało aktywowane przez właściciela. Odpowiada oznaczony agent AI, wyłącznie na podstawie danych profilu.</p>}
                  <div className="sponsored-chat-history">
                    {chatMessages.map((item) => <p key={item.id} className={`sponsored-chat-message is-${item.sender_type}`}><strong>{item.sender_type === 'client' ? 'Ty' : item.sender_type === 'owner' ? 'Właściciel' : 'Asystent Profilu Escort Radar'}</strong><span>{item.content}</span></p>)}
                  </div>
                  <form className="market-booking-form" onSubmit={sendChatMessage}>
                    <textarea value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} maxLength={4000} required placeholder="Napisz wiadomość" />
                    <button className="button primary" disabled={chatBusy} type="submit">{chatBusy ? t('states.loading') : 'Wyślij wiadomość'}</button>
                  </form>
                </section>
              )}

              <section className="market-section similar-profiles">
                <div className="market-section-heading">
                  <p className="eyebrow">{t('profile.nearby')}</p>
                  <h2>{t('profile.similarProfiles')}</h2>
                </div>
                <div className="similar-profile-grid">
                  {similarProfiles.length ? similarProfiles.map((item) => (
                    <a key={item.id} href={`/profile/${item.id}`}>
                      {item.profile_images?.[0]?.public_url && <img src={item.profile_images[0].public_url} alt="" loading="lazy" />}
                      <strong>{item.display_name}</strong>
                      <span>{item.area || item.city} - {getPriceFrom(item, t)}</span>
                    </a>
                  )) : <div className="market-empty-state"><p>{t('profile.noSimilarProfiles')}</p></div>}
                </div>
              </section>

              <section className="market-section report-section">
                <div className="market-section-heading">
                  <p className="eyebrow">{t('profile.safety')}</p>
                  <h2>{t('profile.reportProfile')}</h2>
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
            </>
          ) : profileAccessChecked ? (
            <section className="market-section profile-premium-upsell">
              <div className="market-lock-card">
                <LockKeyhole size={18} />
                <div>
                  <strong>{t('profile.premiumFeaturesLockedTitle')}</strong>
                  <p>{t('profile.premiumFeaturesLockedText')}</p>
                </div>
                <button className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" type="button" onClick={startClientActivation}><span>{t('profile.activateClient')}</span></button>
              </div>
            </section>
          ) : null}
        </main>

        <aside className="market-contact-panel">
          <span className={`status ${statusClass}`}>{statusLabel}</span>
          <h2>{profile.display_name}</h2>
          <p><MapPin size={15} /> {locationLabel}</p>
          <div className="market-contact-price">
            <span>{t('profile.from')}</span>
            <strong>{priceFrom}</strong>
          </div>
          <div className="market-rating-line"><Star size={16} /> 4.9 <span>{t('profile.verifiedRating')}</span></div>
          {!activated && <p className="subscription-notice">{t('profile.activateRevealContact')}</p>}
          {activated && (
            <div className="contact-unlocked-list">
              <p><Phone size={15} /> Phone: {profileAccess?.phone_number || contactFallback}</p>
              <p><MessageCircle size={15} /> WhatsApp: {profileAccess?.whatsapp || contactFallback}</p>
              <p><MessageCircle size={15} /> Telegram: {profileAccess?.telegram || contactFallback}</p>
            </div>
          )}
          <div className="market-contact-actions">
            <button className="button primary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" type="button" onClick={() => paidSponsoredInteractionsEnabled && profile.sponsorship_type === 'admin_sponsored' ? openSponsoredChat() : activated ? setAccessMessage(profileAccess?.whatsapp || contactFallback) : setAccessMessage(t('profile.activateRevealContact'))}><MessageCircle size={16} /> <span>{paidSponsoredInteractionsEnabled && profile.sponsorship_type === 'admin_sponsored' ? 'Czat · 3 BC' : t('nav.messages')}</span></button>
            <button className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" type="button" onClick={() => activated ? setAccessMessage(profileAccess?.phone_number || contactFallback) : setAccessMessage(t('profile.activateRevealContact'))}><Phone size={16} /> <span>{t('profile.call')}</span></button>
            {canUsePremiumProfileFeatures && <a href="#booking" className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md"><CalendarDays size={16} /> <span>{t('profile.book')}</span></a>}
            <button className="button er-btn er-glass-btn er-glass-btn--pink er-glass-btn--md" type="button" disabled={favoriteBusy || (activated && favoriteSaved)} onClick={() => activated ? toggleFavorite() : setAccessMessage(t('profile.activateRevealContact'))}><Heart size={16} /> <span>{favoriteSaved ? t('favorites.alreadyFavorite') : `${t('favorites.addToFavorites')}${favoritesWalletSystem === 'bcu' ? ' · 5 BC' : ''}`}</span></button>
            <button className="button er-btn er-glass-btn er-glass-btn--purple er-glass-btn--md" type="button" onClick={() => activated ? sendGift() : setAccessMessage(t('profile.activateRevealContact'))}><Gift size={16} /> <span>{t('profile.gift')}</span></button>
            <button className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" type="button" onClick={() => paidSponsoredInteractionsEnabled ? requestVideochat() : setAccessMessage(activated ? t('profile.liveCamAvailable') : t('profile.activateRevealContact'))}><Video size={16} /> <span>{t('profile.live')}{paidSponsoredInteractionsEnabled ? ' · 7 BC' : ''}</span></button>
          </div>
          {accessMessage && <p className={accessMessage === t('favorites.notEnoughTokens') ? 'error-text' : activated ? 'success' : 'subscription-notice'}>{accessMessage}</p>}
          {accessMessage === t('favorites.notEnoughTokens') && <Link className="button er-btn er-glass-btn er-glass-btn--purple er-glass-btn--md" to="/tokens"><span>{t('favorites.buyTokens')}</span></Link>}
          {accessMessage === t('favorites.premiumRequired') && <Link className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to="/dashboard"><span>{t('favorites.activatePremium')}</span></Link>}
          {accessMessage === t('favorites.loginToSeeFavorites') && <Link className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" to="/login"><span>{t('buttons.login')}</span></Link>}
          <div className="market-contact-facts">
            <MarketFact icon={<BadgeCheck size={16} />} label={t('profile.verified')} value={profile.verified ? t('profile.yes') : t('profile.pending')} />
            <MarketFact icon={<Languages size={16} />} label={t('profile.languages')} value={languages.join(', ')} />
            <MarketFact icon={<MapPin size={16} />} label={t('profile.visits')} value={visitTypes.map(option).join(', ')} />
            <MarketFact icon={<Clock size={16} />} label={t('profile.lastActive')} value={profile.availability_status === 'available' ? t('profile.now') : t('profile.recently')} />
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

    </div>
  );

  async function startClientActivation() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setAccessMessage(t('profile.loginToActivate'));
      return;
    }

    setActivationBusy(true);
    try {
      navigate('/pricing?product=client_activation');
    } catch (err) {
      setAccessMessage(err instanceof Error ? err.message : t('profile.paymentStartFailed'));
    } finally {
      setActivationBusy(false);
    }
  }

  async function openSponsoredChat() {
    if (!clientToken) return navigate(`/login?next=${encodeURIComponent(`/profile/${profile!.id}`)}`);
    if (!chatSession && !window.confirm('Rozpoczęcie czatu kosztuje jednorazowo 3 BC. Kontynuować?')) return;
    setChatBusy(true);
    try {
      const started = chatSession ? { session: chatSession } : await api.startSponsoredChat(clientToken, profile!.id);
      const history = await api.sponsoredChat(clientToken, started.session.id);
      setChatSession(history.session);
      setChatMessages(history.messages);
      window.requestAnimationFrame(() => document.getElementById('profile-chat')?.scrollIntoView({ behavior: 'smooth' }));
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setChatBusy(false);
    }
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!clientToken || !chatSession || !chatDraft.trim()) return;
    setChatBusy(true);
    try {
      const sent = await api.sendSponsoredChatMessage(clientToken, chatSession.id, chatDraft.trim());
      setChatMessages((current) => [...current, sent.message, ...(sent.agent_message ? [sent.agent_message] : [])]);
      setChatDraft('');
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    } finally {
      setChatBusy(false);
    }
  }

  async function requestVideochat() {
    if (!clientToken) return navigate(`/login?next=${encodeURIComponent(`/profile/${profile!.id}`)}`);
    if (!window.confirm('Próba wideoczatu kosztuje 7 BC. Kontynuować?')) return;
    try {
      await api.requestVideochat(clientToken, profile!.id, crypto.randomUUID());
      setAccessMessage('Próba wideoczatu została zapisana. Właściciel zobaczy ją po aktywacji konta.');
    } catch (error) {
      setAccessMessage(error instanceof Error ? error.message : t('states.requestFailed'));
    }
  }

  async function sendGift() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return setAccessMessage(t('favorites.loginToSeeFavorites'));
    await api.sendGift(token, { profile_id: profile!.id, gift_type: 'rose', coin_cost: 10 });
    setAccessMessage(t('profile.giftSent'));
  }

  async function toggleFavorite() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setAccessMessage(t('favorites.loginToSeeFavorites'));
      navigate(`/login?next=${encodeURIComponent(`/profile/${profile!.id}`)}`);
      return;
    }
    if (favoriteBusy) return;
    if (favoritesWalletSystem === 'bcu' && !window.confirm(t('favorites.bcuConfirmation'))) return;
    setFavoriteBusy(true);
    try {
      const result = await api.addFavorite(token, profile!.id);
      setFavoriteSaved(true);
      if ('amount_bcu' in result) setAccessMessage(result.charged ? t('favorites.bcuPaid') : t('favorites.bcuRestored'));
      else setAccessMessage(result.already_exists || result.already_favorited ? t('favorites.favoriteAlreadyAdded') : t('favorites.favoriteAddedTokenCharged'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('insufficient')) setAccessMessage(t('favorites.notEnoughTokens'));
      else if (message.toLowerCase().includes('premium')) setAccessMessage(t('favorites.premiumRequired'));
      else if (message.toLowerCase().includes('profile') || message.toLowerCase().includes('favorite')) setAccessMessage(t('favorites.profileUnavailable'));
      else setAccessMessage(message.toLowerCase().includes('token') ? t('favorites.notEnoughTokens') : message || t('states.requestFailed'));
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function unlockVipGallery() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) return setAccessMessage(t('favorites.loginToSeeFavorites'));
    await api.unlockVipGallery(token, profile!.id, 25);
    const access = await api.profileAccess(token, profile!.id);
    setProfileAccess(access.access);
    setAccessMessage(t('profile.vipGalleryUnlocked'));
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

function getPriceFrom(profile: Profile, t: (key: string, vars?: Record<string, string | number>) => string) {
  const values = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_3h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!values.length) return t('profile.priceOnRequest');
  return t('profile.priceFrom', { amount: Math.min(...values), currency: profile.currency || 'EUR' });
}

function operatorStatusLabel(status: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    ONLINE_NOW: t('status.onlineNow'),
    BUSY: t('status.busy'),
    TRAVELING: t('status.traveling'),
    AVAILABLE_TODAY: t('status.availableToday'),
    APPOINTMENT_ONLY: t('status.appointmentOnly'),
    OFFLINE: t('status.offline')
  };
  return labels[status] || t('status.offline');
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

function getClientVisitMode(profile: Profile, t: (key: string) => string) {
  const hasOutcall = profile.visit_types?.includes('outcall') || profile.travels === true;
  const hasIncall = profile.visit_types?.includes('incall') || profile.travels === false;
  if (hasOutcall && hasIncall) return `${t('profileDetails.travelsClientYes')} / ${t('profileDetails.incallBadge')}`;
  if (hasOutcall) return t('profileDetails.travelsClientYes');
  if (hasIncall) return t('profileDetails.travelsClientNo');
  return '';
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
            <LockKeyhole size={18} /> {t('profile.unlockPhotos')}
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
    ['3h', profile.price_3h],
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

function getServicePricingRows(profile: Profile) {
  const pricing = profile.service_pricing || {};
  return (profile.services || [])
    .map((key) => {
      const item = pricing[key] || { mode: 'included', extra_price: null };
      return {
        key,
        label: serviceLabel(key),
        mode: item.mode === 'extra' ? 'extra' : 'included',
        extra_price: Number(item.extra_price || 0)
      };
    })
    .filter((row) => row.mode === 'included' || row.extra_price >= 0);
}

function ServicePricingList({ rows, currency }: { rows: ReturnType<typeof getServicePricingRows>; currency: string }) {
  const { t } = useI18n();
  return (
    <div className="service-pricing-public">
      <h3>{t('pricing.servicePricing')}</h3>
      {rows.map((row) => (
        <div className="service-menu-item" key={row.key}>
          <strong>{row.label}</strong>
          <span>{row.mode === 'extra' ? `+${row.extra_price} ${currency}` : t('pricing.includedInPrice')}</span>
        </div>
      ))}
    </div>
  );
}

