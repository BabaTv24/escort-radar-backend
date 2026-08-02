import { Link } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, MapPin, MessageCircle, RadioTower, ShieldCheck } from 'lucide-react';
import { ProfileCard } from '../components/ProfileCard';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/geo';
import { readSavedRadarRadius, readSavedSearchLocation, saveRadarRadius } from '../lib/geo';
import type { Profile } from '../types';
import { getPublicProfiles } from '../lib/publicProfiles';
import { EmptyState, ErrorState, LoadingState } from '../components/LoadingState';
import { Seo } from '../components/Seo';
import { isSponsoredProfile, toLocationCitySlug } from '../lib/sponsoredProfiles';
import { deriveHomeRadarView, getHomeRadarHref, loadHomeRadarCandidatePool } from '../lib/homeRadar';
import { api, type FunPageTicker, type PublicFunPageAdvertisement, type PublicFunPagePromotions } from '../lib/api';
import { advertisementRotationDelayMs, nextAdvertisementIndex, safeAdvertisementHref, shouldRotateAdvertisements } from '../lib/funPageAdvertisement';
import { homeFaq, homeJsonLd, homeSeo, localeForLanguage } from '../lib/seoMetadata';

const productBenefits = [
  {
    icon: CalendarCheck,
    title: 'Inteligentne rezerwacje',
    description: 'Zbieraj i porządkuj prośby o rezerwację z jednego panelu.'
  },
  {
    icon: MessageCircle,
    title: 'Komunikacja z klientami',
    description: 'Prowadź prywatne rozmowy i przejmuj kontakt od asystenta AI.'
  },
  {
    icon: MapPin,
    title: 'Lokalna widoczność',
    description: 'Docieraj do klientów szukających profili w konkretnym mieście lub promieniu.'
  },
  {
    icon: ShieldCheck,
    title: 'Prywatność i kontrola',
    description: 'Samodzielnie wybieraj poziom widoczności profilu, lokalizacji i dostępności.'
  }
] as const;

export function HomePage() {
  const { lang, t } = useI18n();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(readSavedRadarRadius);
  const [radarStatus, setRadarStatus] = useState('all');
  const [searcherLocation, setSearcherLocation] = useState<GeoPoint | null>(() => readSavedSearchLocation());
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const [promotions, setPromotions] = useState<PublicFunPagePromotions>({ advertisements: [], rotationIntervalSeconds: 6, ticker: null });
  const profilesAbortRef = useRef<AbortController | null>(null);
  const { sponsoredProfiles, nearbyProfiles } = deriveHomeRadarView(profiles, searcherLocation, radarStatus);
  const nearbyProfileCards = nearbyProfiles.map(({ profile }) => profile);
  const radarHref = getHomeRadarHref(searcherLocation);
  const radarCity = toLocationCitySlug(searcherLocation);
  const paidProfiles = profiles.filter((profile) => !isSponsoredProfile(profile));
  const topProfiles = paidProfiles.slice(0, 8);

  const loadProfiles = useCallback(() => {
    profilesAbortRef.current?.abort();
    const controller = new AbortController();
    profilesAbortRef.current = controller;
    setLoading(true);
    setError('');
    loadHomeRadarCandidatePool(getPublicProfiles, controller.signal)
      .then((publicRadarProfiles) => {
        if (controller.signal.aborted) return;
        setProfiles(publicRadarProfiles);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setProfiles([]);
        setError(reason instanceof Error ? reason.message : t('home.loadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    loadProfiles();
    return () => profilesAbortRef.current?.abort();
  }, [loadProfiles]);

  useEffect(() => {
    let active = true;
    api.funPageAdvertisement()
      .then((result) => { if (active) setPromotions(result); })
      .catch(() => { if (active) setPromotions({ advertisements: [], rotationIntervalSeconds: 6, ticker: null }); });
    return () => { active = false; };
  }, []);

  async function useLocation() {
    if (!navigator.geolocation) {
      setFallbackNotice(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSearcherLocation({ lat: position.coords.latitude, lng: position.coords.longitude, source: 'browser', label: 'GPS' });
        setFallbackNotice(false);
      },
      () => setFallbackNotice(true),
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  }

  return (
    <div className="page landing-page">
      <Seo
        {...homeSeo}
        locale={localeForLanguage(lang)}
        alternateLocales={(['pl_PL', 'de_DE', 'en_US'] as const).filter((locale) => locale !== localeForLanguage(lang))}
        jsonLd={homeJsonLd}
      />
      <section className="landing-section landing-hero hero">
        <div className="hero-content">
          <img className="hero-brand-mark" src="/Logo_Escort_5.png" alt="" />
          <p className="eyebrow">Escort Radar · AI Client Office</p>
          <h1>Panel AI do zarządzania rezerwacjami, klientami i widocznością w mieście</h1>
          <p className="tagline">Escort Radar łączy prywatny panel klientek, inteligentne wiadomości, rezerwacje, dostępność i lokalną widoczność w jednym systemie.</p>
          <div className="hero-actions">
            <Link to="/register?type=escort" className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md"><span>Utwórz profil</span></Link>
            <a
              href="#how-it-works"
              className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md"
              onClick={() => window.setTimeout(() => document.getElementById('how-it-works')?.focus(), 0)}
            ><span>Zobacz, jak działa</span></a>
          </div>
        </div>
        <figure className="hero-product-preview">
          <img
            src="/images/escort-radar-ai-client-office.png"
            alt="Panel AI Escort Radar z radarem lokalnym, wiadomościami, dostępnością i rezerwacjami"
            width="417"
            height="488"
            loading="eager"
            fetchPriority="high"
          />
        </figure>
      </section>

      <section className="landing-section product-benefits-section" id="how-it-works" aria-labelledby="product-benefits-title" tabIndex={-1}>
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Jedno prywatne miejsce do pracy</p>
            <h2 id="product-benefits-title">Organizuj klientów, rezerwacje i lokalną widoczność</h2>
          </div>
        </div>
        <div className="product-benefits-grid">
          {productBenefits.map(({ icon: Icon, title, description }) => (
            <article className="product-benefit-card" key={title}>
              <Icon aria-hidden="true" size={24} />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      {loading && <LoadingState label={t('home.loadingProfiles')} />}
      {error && <ErrorState message={error} onRetry={loadProfiles} />}
      {!loading && !error && profiles.length === 0 && sponsoredProfiles.length === 0 && (
        <EmptyState title={t('home.noProfilesTitle')} message={t('home.noProfilesText')} />
      )}

      {!loading && !error && <>
      {sponsoredProfiles.length > 0 ? (
        <ProfileCarouselSection
          eyebrow={t('home.sponsoredEyebrow')}
          title={t('home.sponsoredTitle')}
          profiles={sponsoredProfiles}
          actionLabel={t('home.openRadar')}
          actionHref={radarHref}
        />
      ) : <EmptyState title={t('home.sponsoredTitle')} message={t('search.noProfilesForCity')} />}

      {topProfiles.length > 0 && <section className="landing-section sponsored-profiles-section featured-profiles-section home-marketplace-showcase">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">{t('home.marketplaceEyebrow')}</p>
            <h2>{t('home.marketplaceTitle')}</h2>
          </div>
          <Link to={radarHref} className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md"><RadioTower size={17} /> <span>{t('home.openRadar')}</span></Link>
        </div>
        <div className="avatar-carousel">
          {topProfiles.slice(0, 10).map((profile) => {
            const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
            return (
              <Link to={`/profile/${profile.id}`} className="top-avatar" key={profile.id}>
                {image?.public_url ? <img src={image.public_url} alt="" /> : <span>{profile.display_name.slice(0, 1)}</span>}
                <strong>{profile.display_name}</strong>
                <small>{profile.available_now ? t('badges.availableNow') : profile.city}</small>
              </Link>
            );
          })}
        </div>
        <div className="sort-tabs static-tabs" aria-label="Marketplace sorting preview">
          {['home.sort.best', 'home.sort.new', 'home.sort.near', 'home.sort.online'].map((item, index) => <span className={index === 0 ? 'selected' : ''} key={item}>{t(item)}</span>)}
        </div>
        <div className="cards-grid marketplace-grid premium-profile-grid">
          {topProfiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
        </div>
      </section>}

      {/* Landing category tiles were removed; category routing remains in city search via activePublicCategoryOptions.map. */}
      <div className="landing-section live-radar-section" id="live-radar">
        <RadarPanel
          profiles={profiles}
          radius={radius}
          status={radarStatus}
          city={radarCity}
          radarHref={radarHref}
          onRadiusChange={(value) => {
            saveRadarRadius(value);
            setRadius(value);
          }}
          onStatusChange={setRadarStatus}
          searcherLocation={searcherLocation}
          onUseLocation={useLocation}
          onSetManualLocation={(location) => {
            setSearcherLocation(location);
            setFallbackNotice(false);
          }}
          onClearManualLocation={() => {
            setSearcherLocation(null);
            setFallbackNotice(false);
          }}
          fallbackNotice={fallbackNotice}
          compact
          showFavoritesFilter={false}
        />
      </div>

      {nearbyProfileCards.length > 0 ? (
        <ProfileCarouselSection
          eyebrow={t('home.radarPreview')}
          title={t('home.available')}
          profiles={nearbyProfileCards}
          className="radar-profiles-section"
          actionLabel={t('home.viewAllWithin150')}
          actionHref={radarHref}
          actionVariant="text"
        />
      ) : <EmptyState title={t('home.available')} message={searcherLocation ? t('home.noProfilesWithin150') : t('radar.locationRequired')} />}
      </>}

      <FunPagePromotionArea promotions={promotions} advertisementLabel={t('advertisement.label')} />

      <section className="landing-section home-faq-section" aria-labelledby="home-faq-title">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Escort Radar w praktyce</p>
            <h2 id="home-faq-title">Najczęściej zadawane pytania</h2>
          </div>
        </div>
        <div className="home-faq-list">
          {homeFaq.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function FunPagePromotionArea({ promotions, advertisementLabel }: { promotions: PublicFunPagePromotions; advertisementLabel: string }) {
  const { advertisements, ticker, rotationIntervalSeconds } = promotions;
  const [activeIndex, setActiveIndex] = useState(0);
  const advertisementKey = advertisements.map((advertisement) => advertisement.id).join('|');

  useEffect(() => {
    setActiveIndex((current) => current < advertisements.length ? current : 0);
    if (!shouldRotateAdvertisements(advertisements.length)) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => nextAdvertisementIndex(current, advertisements.length));
    }, advertisementRotationDelayMs(rotationIntervalSeconds));
    return () => window.clearInterval(timer);
  }, [advertisementKey, advertisements.length, rotationIntervalSeconds]);

  if (!advertisements.length && !ticker) return null;
  const advertisement = advertisements[activeIndex] || advertisements[0];
  return (
    <section className="funpage-promotions" aria-label={advertisementLabel}>
      {ticker ? <FunPageScrollingTextBar ticker={ticker} /> : null}
      {advertisement ? (
        <div className="funpage-advertisement">
          <span className="funpage-advertisement-label">{advertisementLabel}</span>
          <FunPageAdvertisementBanner advertisement={advertisement} />
          {advertisements.length > 1 ? (
            <div className="funpage-advertisement-dots" aria-label={`${advertisements.length} ${advertisementLabel}`}>
              {advertisements.map((item, index) => (
                <button
                  type="button"
                  className={index === activeIndex ? 'is-active' : ''}
                  aria-label={`${advertisementLabel} ${index + 1}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  onClick={() => setActiveIndex(index)}
                  key={item.id}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function FunPageAdvertisementBanner({ advertisement }: { advertisement: PublicFunPageAdvertisement }) {
  const href = safeAdvertisementHref(advertisement.targetUrl);
  const picture = <img key={advertisement.id} src={advertisement.imageUrl} alt={advertisement.altText} />;
  const content = href ? (
    <a href={href} target={advertisement.openInNewTab ? '_blank' : undefined} rel={advertisement.openInNewTab ? 'noopener noreferrer' : undefined}>
      {picture}
    </a>
  ) : picture;
  return <div className="funpage-advertisement-slide" key={advertisement.id}>{content}</div>;
}

export function FunPageScrollingTextBar({ ticker }: { ticker: FunPageTicker }) {
  const href = safeAdvertisementHref(ticker.targetUrl);
  const content = (
    <span className={`funpage-ticker-track funpage-ticker-track--${ticker.speed}`}>
      <span>{ticker.text}</span>
      <span aria-hidden="true">{ticker.text}</span>
    </span>
  );
  return (
    <div className="funpage-ticker" aria-label={ticker.text}>
      {href ? <a href={href} target={ticker.openInNewTab ? '_blank' : undefined} rel={ticker.openInNewTab ? 'noopener noreferrer' : undefined}>{content}</a> : content}
    </div>
  );
}

function ProfileCarouselSection({
  eyebrow,
  title,
  profiles,
  className = '',
  actionLabel,
  actionHref = '#live-radar',
  actionVariant = 'button'
}: {
  eyebrow: string;
  title: string;
  profiles: Profile[];
  className?: string;
  actionLabel?: string;
  actionHref?: string;
  actionVariant?: 'button' | 'text';
}) {
  const [isPaused, setPaused] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);
  const visibleProfiles = profiles;

  useEffect(() => {
    if (visibleProfiles.length <= 1 || isPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      scrollProfileCarousel('next');
    }, 3000);
    return () => window.clearInterval(id);
  }, [isPaused, visibleProfiles.length]);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
    };
  }, []);

  function pauseProfileCarouselTemporarily() {
    setPaused(true);
    if (pauseTimeoutRef.current) window.clearTimeout(pauseTimeoutRef.current);
    pauseTimeoutRef.current = window.setTimeout(() => setPaused(false), 15000);
  }

  function scrollProfileCarousel(direction: 'prev' | 'next') {
    const node = carouselRef.current;
    if (!node) return;
    const firstSlide = node.querySelector<HTMLElement>('.profile-carousel-slide');
    const slideWidth = firstSlide?.offsetWidth ?? 300;
    const gap = 18;
    const amount = slideWidth + gap;
    const maxScroll = node.scrollWidth - node.clientWidth;

    if (direction === 'next' && node.scrollLeft + amount >= maxScroll - 4) {
      node.scrollTo({ left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }

    if (direction === 'prev' && node.scrollLeft <= 4) {
      node.scrollTo({ left: maxScroll, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }

    node.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  function goToPreviousSlide() {
    pauseProfileCarouselTemporarily();
    scrollProfileCarousel('prev');
  }

  function goToNextSlide() {
    pauseProfileCarouselTemporarily();
    scrollProfileCarousel('next');
  }

  if (visibleProfiles.length === 0) return null;

  return (
    <section
      className={`landing-section sponsored-profiles-section profile-carousel-section home-marketplace-showcase ${className}`.trim()}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>

        <div className="profile-carousel-actions">
          {actionLabel ? (
            <Link to={actionHref} className={actionVariant === 'text' ? 'text-link' : 'button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md'}>
              {actionVariant === 'button' ? <RadioTower size={17} /> : null}
              <span>{actionLabel}</span>
            </Link>
          ) : null}
          <div className="profile-carousel-controls">
            <button className="er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" type="button" aria-label="Poprzednie profile" onClick={goToPreviousSlide}>
              <ChevronLeft size={18} />
            </button>
            <button className="er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" type="button" aria-label="Następne profile" onClick={goToNextSlide}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="profile-carousel"
        aria-live="polite"
        ref={carouselRef}
        onPointerDown={pauseProfileCarouselTemporarily}
        onTouchStart={pauseProfileCarouselTemporarily}
      >
        <div className="profile-carousel-track">
          {visibleProfiles.map((profile) => (
            <div className="profile-carousel-card profile-carousel-slide" key={profile.id}>
              <ProfileCard profile={profile} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

