import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BadgeCheck, Building2, Cpu, EyeOff, Map, RadioTower, Smartphone, PlusCircle, Network, ShieldCheck, ScanSearch } from 'lucide-react';
import { cities } from '../data/cities';
import { ProfileCard } from '../components/ProfileCard';
import { getDemoProfiles } from '../data/demoProfiles';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import { useState } from 'react';
import { getCityCenter } from '../lib/geo';
import { categoryOptions } from '../data/filterOptions';

export function HomePage() {
  const featured = getDemoProfiles('berlin').slice(0, 8);
  const { t, option } = useI18n();
  const [radius, setRadius] = useState(25);
  const [radarStatus, setRadarStatus] = useState('all');
  const berlinCenter = { ...getCityCenter('berlin'), source: 'city_fallback' as const };

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-cinema-bg" aria-hidden="true" />
        <div className="hero-light-leak" aria-hidden="true" />
        <div className="radar-ring" />
        <div className="hero-particles" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <span key={index} />)}
        </div>
        <div className="hero-strip">
          {featured.slice(0, 4).map((profile) => (
            <img key={profile.id} src={profile.profile_images?.[0]?.public_url} alt="" />
          ))}
        </div>
        <div className="hero-floating-profiles" aria-hidden="true">
          {featured.slice(0, 3).map((profile, index) => (
            <div className={`hero-profile-preview preview-${index + 1}`} key={profile.id}>
              {profile.profile_images?.[0]?.public_url ? <img src={profile.profile_images[0].public_url} alt="" /> : null}
              <div>
                <strong>{profile.display_name}</strong>
                <span>{profile.availability_status === 'available' ? 'Available now' : 'Live tonight'}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hero-content">
          <img className="hero-brand-mark" src="/Logo_Escort_3.png" alt="" />
          <p className="eyebrow">{t('home.heroEyebrow')}</p>
          <h1>Escort Radar</h1>
          <p className="tagline">{t('home.tagline')}</p>
          <div className="hero-actions">
            <Link to="/city/berlin" className="button primary"><RadioTower size={18} /> {t('home.openRadar')}</Link>
            <Link to="/dashboard" className="button"><PlusCircle size={18} /> {t('home.create')}</Link>
          </div>
          <p className="demo-note">{t('home.demo')}</p>
        </div>
      </section>

      <section className="market-section">
        <div className="section-head compact">
          <p className="eyebrow">{t('home.sections.categories')}</p>
          <h2>{t('home.sections.categoriesTitle')}</h2>
        </div>
        <div className="home-category-grid">
          {categoryOptions.map((category) => (
            <Link key={category} to={`/city/berlin?category=${category}`} className="home-category-card">
              <CategoryIcon category={category} />
              <span>{option(category)}</span>
            </Link>
          ))}
        </div>
      </section>

      <RadarPanel
        profiles={getDemoProfiles('berlin')}
        radius={radius}
        status={radarStatus}
        city="berlin"
        onRadiusChange={setRadius}
        onStatusChange={setRadarStatus}
        searcherLocation={berlinCenter}
        compact
      />

      <section className="market-section">
        <div className="section-head compact">
          <p className="eyebrow">{t('home.berlinPreview')}</p>
          <h2>{t('home.available')}</h2>
          <Link to="/city/berlin" className="text-link">{t('home.viewAllBerlin')}</Link>
        </div>
        <div className="cards-grid marketplace-grid">
          {featured.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
        </div>
      </section>

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
  other: '/Logo_Escort_3.png'
};

function CategoryIcon({ category }: { category: string }) {
  const src = categoryIconMap[category] || categoryIconMap.other;
  return (
    <span className="category-lux-icon">
      <img src={src} alt="" loading="lazy" />
    </span>
  );
}
