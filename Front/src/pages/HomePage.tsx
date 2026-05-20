import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BadgeCheck, Building2, EyeOff, Map, RadioTower, Smartphone, PlusCircle } from 'lucide-react';
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
        <div className="radar-ring" />
        <div className="hero-strip">
          {featured.slice(0, 4).map((profile) => (
            <img key={profile.id} src={profile.profile_images?.[0]?.public_url} alt="" />
          ))}
        </div>
        <div className="hero-content">
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
