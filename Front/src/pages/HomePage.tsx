import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BadgeCheck, Building2, Cpu, EyeOff, Map, RadioTower, Smartphone, PlusCircle, Network, ShieldCheck, ScanSearch } from 'lucide-react';
import { cities } from '../data/cities';
import { ProfileCard } from '../components/ProfileCard';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import { useCallback, useEffect, useState } from 'react';
import type { GeoPoint } from '../lib/geo';
import { getCityCenter, getSearcherLocationWithFallback } from '../lib/geo';
import { activePublicCategoryOptions } from '../data/filterOptions';
import type { Profile } from '../types';
import { getPublicProfiles } from '../lib/publicProfiles';
import { EmptyState, ErrorState, LoadingState } from '../components/LoadingState';
import { Seo } from '../components/Seo';

export function HomePage() {
  const { t, option } = useI18n();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [radius, setRadius] = useState(25);
  const [radarStatus, setRadarStatus] = useState('all');
  const [searcherLocation, setSearcherLocation] = useState<GeoPoint>(() => ({ ...getCityCenter('berlin'), source: 'city_fallback' }));
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const sponsoredProfiles = profiles.filter((profile) => profile.is_sponsored || profile.acquisition_source === 'admin_sponsored' || profile.provider === 'manual_admin');
  const paidProfiles = profiles.filter((profile) => !sponsoredProfiles.some((sponsored) => sponsored.id === profile.id));
  const topProfiles = paidProfiles.slice(0, 8);
  const featured = (paidProfiles.length ? paidProfiles : profiles).slice(0, 8);

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

  async function useLocation() {
    const location = await getSearcherLocationWithFallback('berlin');
    setSearcherLocation(location);
    setFallbackNotice(location.source === 'city_fallback');
  }

  return (
    <div className="page">
      <Seo
        title="Escort Radar - Verified 18+ Nightlife Profiles"
        description="Privacy-first 18+ nightlife marketplace with verified independent profiles, city radar, favorites and account tools."
        canonical="https://escort-radar.fun/"
      />
      <section className="hero">
        <div className="hero-cinema-bg" aria-hidden="true" />
        <div className="hero-light-leak" aria-hidden="true" />
        <div className="radar-ring" />
        <div className="hero-particles" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
        <div className="hero-strip">
          {featured.slice(0, 4).map((profile) => (
            <img key={profile.id} src={profile.profile_images?.[0]?.public_url || '/Logo_Escort_5.png'} alt="" />
          ))}
        </div>
        <div className="hero-floating-profiles" aria-hidden="true">
          {featured.slice(0, 3).map((profile, index) => (
            <div className={`hero-profile-preview preview-${index + 1}`} key={profile.id}>
              {profile.profile_images?.[0]?.public_url ? <img src={profile.profile_images[0].public_url} alt="" /> : null}
              <div>
                <strong>{profile.display_name}</strong>
                <span>{profile.availability_status === 'available' ? t('badges.availableNow') : t('radar.eyebrow')}</span>
              </div>
            </div>
          ))}
        </div>
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
        <div className="hero-app-preview" aria-hidden="true">
          <div className="hero-preview-topbar">
            <span>{t('clientOffice.title')}</span>
            <strong>15,000</strong>
          </div>
          <div className="hero-preview-grid">
            <article className="hero-preview-card hero-preview-radar">
              <span>{t('nav.radar')}</span>
              <div className="hero-mini-radar">
                <i />
                {featured.slice(0, 5).map((profile, index) => {
                  const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
                  return (
                    <b className={`pin-${index + 1}`} key={profile.id}>
                      {image?.public_url ? <img src={image.public_url} alt="" /> : null}
                    </b>
                  );
                })}
              </div>
            </article>
            <article className="hero-preview-card">
              <span>{t('clientOffice.coinWallet')}</span>
              <strong>15,000</strong>
              <small>{t('coins.balance')}</small>
              <button className="button primary" type="button" tabIndex={-1}>{t('clientOffice.addCoins')}</button>
            </article>
            <article className="hero-preview-card hero-preview-profile">
              {featured[0]?.profile_images?.[0]?.public_url ? <img src={featured[0].profile_images[0].public_url} alt="" /> : <div className="image-placeholder">{t('app.name')}</div>}
              <div>
                <span>{featured[0]?.display_name || t('clientOffice.clientFallback')}</span>
                <strong>{t('badges.availableNow')}</strong>
                <small>{featured[0]?.city || 'Berlin'} - 4.9</small>
              </div>
            </article>
          </div>
        </div>
      </section>

      {loading && <LoadingState label={t('home.loadingProfiles')} />}
      {error && <ErrorState message={error} onRetry={loadProfiles} />}
      {!loading && !error && profiles.length === 0 && (
        <EmptyState title={t('home.noProfilesTitle')} message={t('home.noProfilesText')} />
      )}

      {!loading && !error && profiles.length > 0 && <>
      {sponsoredProfiles.length > 0 && (
        <section className="home-marketplace-showcase">
          <div className="section-head compact">
            <div>
              <p className="eyebrow">{t('home.sponsoredEyebrow')}</p>
              <h2>{t('home.sponsoredTitle')}</h2>
            </div>
            <Link to="/city/berlin" className="button primary"><RadioTower size={17} /> {t('home.openRadar')}</Link>
          </div>
          <div className="cards-grid marketplace-grid premium-profile-grid">
            {sponsoredProfiles.slice(0, 8).map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
          </div>
        </section>
      )}

      {topProfiles.length > 0 && <section className="home-marketplace-showcase">
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

      <section className="market-section">
        <div className="section-head compact">
          <p className="eyebrow">{t('home.sections.categories')}</p>
          <h2>{t('home.sections.categoriesTitle')}</h2>
        </div>
        <div className="home-category-grid">
          {activePublicCategoryOptions.map((category) => (
            <Link key={category} to={`/city/berlin?category=${category}`} className="home-category-card">
              <CategoryIcon category={category} />
              <span>{option(category)}</span>
            </Link>
          ))}
        </div>
      </section>

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

      <section className="market-section">
        <div className="section-head compact">
          <p className="eyebrow">{t('home.berlinPreview')}</p>
          <h2>{t('home.available')}</h2>
          <Link to="/city/berlin" className="text-link">{t('home.viewAllBerlin')}</Link>
        </div>
        <div className="cards-grid marketplace-grid">
          {(topProfiles.length ? topProfiles : sponsoredProfiles).slice(0, 8).map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
        </div>
      </section>
      </>}

      <section className="quick-grid">
        <Feature icon={<RadioTower />} title={t('home.features.available.title')} text={t('home.features.available.text')} />
        <Feature icon={<EyeOff />} title={t('home.features.private.title')} text={t('home.features.private.text')} />
        <Feature icon={<Smartphone />} title={t('home.features.mobile.title')} text={t('home.features.mobile.text')} />
        <Feature icon={<Building2 />} title={t('home.features.clubs.title')} text={t('home.features.clubs.text')} />
        <Feature icon={<BadgeCheck />} title={t('home.features.privacy.title')} text={t('home.features.privacy.text')} />
        <Feature icon={<Map />} title={t('home.features.cities.title')} text={cities.map((city) => city.name).join(' / ')} />
        <Feature icon={<BadgeCheck />} title={t('home.sections.vip')} text={t('home.sections.vipText')} />
      </section>

      <section className="baba-tech-section">
        <div className="section-head compact">
          <p className="eyebrow">{t('baba.homeEyebrow')}</p>
          <h2>{t('baba.homeTitle')}</h2>
        </div>
        <div className="baba-tech-grid">
          <Feature icon={<Cpu />} title={t('baba.cards.moderation')} text={t('baba.cards.moderationText')} />
          <Feature icon={<ScanSearch />} title={t('baba.cards.geo')} text={t('baba.cards.geoText')} />
          <Feature icon={<Network />} title={t('baba.cards.marketplace')} text={t('baba.cards.marketplaceText')} />
          <Feature icon={<ShieldCheck />} title={t('baba.cards.privacy')} text={t('baba.cards.privacyText')} />
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="feature">
      <div className="feature-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

const categoryIconMap: Record<string, string> = {
  ladies: '/category-icons/ladies.png',
  gay: '/category-icons/gay.png',
  couples: '/category-icons/couples.png',
  trans: '/category-icons/trans.png',
  massage: '/category-icons/massage.png',
  house_hotel: '/category-icons/house_hotel.png',
  live_cam: '/category-icons/live_cam.png',
  clubs_parties: '/category-icons/clubs_parties.png',
  other: '/Logo_Escort_5.png'
};

function CategoryIcon({ category }: { category: string }) {
  const src = categoryIconMap[category] || categoryIconMap.other;
  return (
    <span className="category-lux-icon">
      <img src={src} alt="" loading="lazy" />
    </span>
  );
}
