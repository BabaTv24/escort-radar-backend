import { Link } from 'react-router-dom';
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, Cpu, EyeOff, Map, RadioTower, Smartphone, PlusCircle, Network, ShieldCheck, ScanSearch } from 'lucide-react';
import { cities } from '../data/cities';
import { ProfileCard } from '../components/ProfileCard';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/geo';
import { getCityCenter, getSearcherLocationWithFallback } from '../lib/geo';
import type { Profile } from '../types';
import { getPublicProfiles } from '../lib/publicProfiles';
import { EmptyState, ErrorState, LoadingState } from '../components/LoadingState';
import { Seo } from '../components/Seo';

export function HomePage() {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(25);
  const [radarStatus, setRadarStatus] = useState('all');
  const [searcherLocation, setSearcherLocation] = useState<GeoPoint>(() => ({ ...getCityCenter('berlin'), source: 'city_fallback' }));
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const [footerSlideIndex, setFooterSlideIndex] = useState(0);
  const [isFooterCarouselPaused, setFooterCarouselPaused] = useState(false);
  const footerCarouselRef = useRef<HTMLDivElement | null>(null);
  const sponsoredProfiles = profiles.filter((profile) => profile.is_sponsored || profile.acquisition_source === 'admin_sponsored' || profile.provider === 'manual_admin');
  const paidProfiles = profiles.filter((profile) => !sponsoredProfiles.some((sponsored) => sponsored.id === profile.id));
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
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ city: 'berlin' });
    getPublicProfiles(params)
      .then(setProfiles)
      .catch((reason) => {
        setProfiles([]);
        setError(reason instanceof Error ? reason.message : t('home.loadError'));
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(loadProfiles, [loadProfiles]);

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
    const location = await getSearcherLocationWithFallback('berlin');
    setSearcherLocation(location);
    setFallbackNotice(location.source === 'city_fallback');
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
            <Link to="/city/berlin" className="button primary"><RadioTower size={18} /> {t('home.openRadar')}</Link>
            <Link to="/dashboard" className="button"><PlusCircle size={18} /> {t('home.create')}</Link>
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
                  <strong>{profile.available_now ? t('home.preview.availableNow') : profile.city || 'Berlin'}</strong>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {loading && <LoadingState label={t('home.loadingProfiles')} />}
      {error && <ErrorState message={error} onRetry={loadProfiles} />}
      {!loading && !error && profiles.length === 0 && (
        <EmptyState title={t('home.noProfilesTitle')} message={t('home.noProfilesText')} />
      )}

      {!loading && !error && profiles.length > 0 && <>
      {sponsoredProfiles.length > 0 && (
        <ProfileCarouselSection
          eyebrow={t('home.sponsoredEyebrow')}
          title={t('home.sponsoredTitle')}
          profiles={sponsoredProfiles}
          actionLabel={t('home.openRadar')}
        />
      )}

      {topProfiles.length > 0 && <section className="landing-section sponsored-profiles-section featured-profiles-section home-marketplace-showcase">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">{t('home.marketplaceEyebrow')}</p>
            <h2>{t('home.marketplaceTitle')}</h2>
          </div>
          <Link to="/city/berlin" className="button primary"><RadioTower size={17} /> {t('home.openRadar')}</Link>
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
      <div className="landing-section live-radar-section">
        <RadarPanel
          profiles={profiles}
          radius={radius}
          status={radarStatus}
          city="berlin"
          onRadiusChange={setRadius}
          onStatusChange={setRadarStatus}
          searcherLocation={searcherLocation}
          onUseLocation={useLocation}
          fallbackNotice={fallbackNotice}
          compact
        />
      </div>

      <ProfileCarouselSection
        eyebrow={t('home.berlinPreview')}
        title={t('home.available')}
        profiles={topProfiles.length ? topProfiles : sponsoredProfiles}
        className="berlin-profiles-section"
        actionLabel={t('home.viewAllBerlin')}
        actionVariant="text"
      />
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
            <button className="footer-carousel-control" type="button" aria-label="Previous slide" onClick={goToPreviousFooterSlide}>
              <ChevronLeft size={18} />
            </button>
            <button className="footer-carousel-control" type="button" aria-label="Next slide" onClick={goToNextFooterSlide}>
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
  actionVariant = 'button'
}: {
  eyebrow: string;
  title: string;
  profiles: Profile[];
  className?: string;
  actionLabel?: string;
  actionVariant?: 'button' | 'text';
}) {
  const [isPaused, setPaused] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const pauseTimeoutRef = useRef<number | null>(null);
  const visibleProfiles = profiles.slice(0, 12);
  const carouselProfiles = visibleProfiles.length > 1 ? [...visibleProfiles, ...visibleProfiles] : visibleProfiles;

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

  function normalizeProfileCarouselScroll() {
    const node = carouselRef.current;
    const track = node?.querySelector<HTMLElement>('.profile-carousel-track');
    if (!node || !track || visibleProfiles.length <= 1) return;
    const loopWidth = track.scrollWidth / 2;
    if (loopWidth <= 0) return;
    if (node.scrollLeft >= loopWidth) node.scrollLeft -= loopWidth;
    if (node.scrollLeft <= 0) node.scrollLeft += loopWidth;
  }

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

    normalizeProfileCarouselScroll();
    if (direction === 'prev' && node.scrollLeft <= amount) {
      const track = node.querySelector<HTMLElement>('.profile-carousel-track');
      const loopWidth = track ? track.scrollWidth / 2 : 0;
      if (loopWidth > 0) node.scrollLeft += loopWidth;
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
            <Link to="/city/berlin" className={actionVariant === 'text' ? 'text-link' : 'button primary'}>
              {actionVariant === 'button' ? <RadioTower size={17} /> : null}
              {actionLabel}
            </Link>
          ) : null}
          <div className="profile-carousel-controls">
            <button type="button" aria-label="Poprzednie profile" onClick={goToPreviousSlide}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Następne profile" onClick={goToNextSlide}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div
        className="profile-carousel"
        aria-live="polite"
        ref={carouselRef}
        onScroll={normalizeProfileCarouselScroll}
        onPointerDown={pauseProfileCarouselTemporarily}
        onTouchStart={pauseProfileCarouselTemporarily}
      >
        <div className="profile-carousel-track">
          {carouselProfiles.map((profile, index) => (
            <div className="profile-carousel-card profile-carousel-slide" key={`${profile.id}-${index}`}>
              <ProfileCard profile={profile} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
