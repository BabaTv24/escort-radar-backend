import { Link } from 'react-router-dom';
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, Cpu, EyeOff, Map, RadioTower, Smartphone, PlusCircle, Network, ShieldCheck, ScanSearch } from 'lucide-react';
import { cities } from '../data/cities';
import { ProfileCard } from '../components/ProfileCard';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/geo';
import { DEFAULT_RADAR_RADIUS_METERS, readSavedSearchLocation } from '../lib/geo';
import type { Profile } from '../types';
import { getPublicProfiles } from '../lib/publicProfiles';
import { EmptyState, ErrorState, LoadingState } from '../components/LoadingState';
import { Seo } from '../components/Seo';
import { isSponsoredProfile, toLocationCitySlug } from '../lib/sponsoredProfiles';
import { deriveHomeRadarView, getHomeRadarHref, loadHomeRadarCandidatePool } from '../lib/homeRadar';

export function HomePage() {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(DEFAULT_RADAR_RADIUS_METERS);
  const [radarStatus, setRadarStatus] = useState('all');
  const [searcherLocation, setSearcherLocation] = useState<GeoPoint | null>(() => readSavedSearchLocation());
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const [footerSlideIndex, setFooterSlideIndex] = useState(0);
  const [isFooterCarouselPaused, setFooterCarouselPaused] = useState(false);
  const footerCarouselRef = useRef<HTMLDivElement | null>(null);
  const profilesAbortRef = useRef<AbortController | null>(null);
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const { sponsoredProfiles, nearbyProfiles } = deriveHomeRadarView(profiles, searcherLocation, radarStatus);
  const nearbyProfileCards = nearbyProfiles.map(({ profile }) => profile);
  const radarHref = getHomeRadarHref(searcherLocation);
  const radarCity = toLocationCitySlug(searcherLocation);
  const paidProfiles = profiles.filter((profile) => !isSponsoredProfile(profile));
  const topProfiles = paidProfiles.slice(0, 8);
  const featured = (paidProfiles.length ? paidProfiles : profiles).slice(0, 8);
  const footerSlides = [
    { icon: <RadioTower />, title: t('home.features.available.title'), text: t('home.features.available.text') },
    { icon: <EyeOff />, title: t('home.features.private.title'), text: t('home.features.private.text') },
    { icon: <Smartphone />, title: t('home.features.mobile.title'), text: t('home.features.mobile.text') },
    { icon: <Building2 />, title: t('home.features.clubs.title'), text: t('home.features.clubs.text') },
    { icon: <BadgeCheck />, title: t('home.features.privacy.title'), text: t('home.features.privacy.text') },
    { icon: <Map />, title: t('home.features.cities.title'), text: cities.map((city) => city.name).join(' / ') },
    { icon: <BadgeCheck />, title: t('home.sections.vip'), text: t('home.sections.vipText') },
    { icon: <Cpu />, title: t('baba.cards.moderation'), text: t('baba.cards.moderationText') },
    { icon: <ScanSearch />, title: t('baba.cards.geo'), text: t('baba.cards.geoText') },
    { icon: <Network />, title: t('baba.cards.marketplace'), text: t('baba.cards.marketplaceText') },
    { icon: <ShieldCheck />, title: t('baba.cards.privacy'), text: t('baba.cards.privacyText') }
  ];
  const footerCarouselSlides = [...footerSlides, ...footerSlides.slice(0, 4)];

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
    if (isFooterCarouselPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      setFooterSlideIndex((current) => (current + 1) % footerSlides.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [isFooterCarouselPaused, footerSlides.length]);

  useEffect(() => {
    const carousel = footerCarouselRef.current;
    const target = carousel?.querySelector<HTMLElement>(`[data-footer-slide="${footerSlideIndex}"]`);
    if (!carousel || !target) return;
    carousel.scrollTo({ left: target.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [footerSlideIndex]);

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

  function goToPreviousFooterSlide() {
    setFooterCarouselPaused(true);
    setFooterSlideIndex((current) => (current === 0 ? footerSlides.length - 1 : current - 1));
  }

  function goToNextFooterSlide() {
    setFooterCarouselPaused(true);
    setFooterSlideIndex((current) => (current + 1) % footerSlides.length);
  }

  return (
    <div className="page landing-page">
      <Seo
        title="Escort Radar - Verified 18+ Nightlife Profiles"
        description="Privacy-first 18+ nightlife marketplace with verified independent profiles, city radar, favorites and account tools."
        canonical="https://escort-radar.fun/"
      />
      <section className="landing-section landing-hero hero">
        <div className="hero-content">
          <img className="hero-brand-mark" src="/Logo_Escort_5.png" alt="" />
          <p className="eyebrow">{t('home.heroEyebrow')}</p>
          <h1>{t('home.heroTitle')}</h1>
          <p className="tagline">{t('home.heroSubtitle')}</p>
          <div className="hero-stat-row" aria-label={t('home.heroStats')}>
            <span><strong>12K+</strong>{t('home.stats.profiles')}</span>
            <span><strong>24/7</strong>{t('home.stats.support')}</span>
            <span><strong>98%</strong>{t('home.stats.verified')}</span>
            <span><strong>100%</strong>{t('home.stats.discreet')}</span>
          </div>
          <div className="hero-actions">
            <Link to={radarHref} className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md"><RadioTower size={18} /> <span>{t('home.openRadar')}</span></Link>
            <Link to="/dashboard" className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md"><PlusCircle size={18} /> <span>{t('home.create')}</span></Link>
          </div>
        </div>
        <div className="hero-product-preview" aria-hidden="true">
          {featured.slice(0, 3).map((profile, index) => {
            const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
            return (
              <div className={`hero-floating-profile hero-floating-profile-${['a', 'b', 'c'][index]}`} key={profile.id}>
                {image?.public_url ? <img src={image.public_url} alt="" /> : <div className="image-placeholder">{profile.display_name.slice(0, 1)}</div>}
                <div>
                  <span>{profile.display_name}</span>
                  <strong>{profile.available_now ? t('home.preview.availableNow') : profile.work_city || profile.city}</strong>
                </div>
              </div>
            );
          })}
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
          onRadiusChange={setRadius}
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
          mapApiKey={googleMapsApiKey}
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

      <section
        className="footer-presection premium-footer-info"
        onMouseEnter={() => setFooterCarouselPaused(true)}
        onMouseLeave={() => setFooterCarouselPaused(false)}
        onFocus={() => setFooterCarouselPaused(true)}
        onBlur={() => setFooterCarouselPaused(false)}
      >
        <div className="footer-carousel-header">
          <div>
            <p className="eyebrow">{t('baba.homeEyebrow')}</p>
            <h2>{t('baba.homeTitle')}</h2>
          </div>

          <div className="footer-carousel-controls">
            <button className="footer-carousel-control er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" type="button" aria-label="Previous slide" onClick={goToPreviousFooterSlide}>
              <ChevronLeft size={18} />
            </button>
            <button className="footer-carousel-control er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" type="button" aria-label="Next slide" onClick={goToNextFooterSlide}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="footer-carousel" aria-live="polite" ref={footerCarouselRef}>
          <div className="footer-carousel-track">
            {footerCarouselSlides.map((slide, index) => (
              <article className="footer-carousel-card" tabIndex={0} data-footer-slide={index} key={`${slide.title}-${index}`}>
                <div className="feature-icon">{slide.icon}</div>
                <h3>{slide.title}</h3>
                <p>{slide.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
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
  const visibleProfiles = profiles.slice(0, 12);

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

