import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BadgeCheck, Building2, EyeOff, Map, RadioTower, Smartphone, PlusCircle } from 'lucide-react';
import { cities } from '../data/cities';
import { ProfileCard } from '../components/ProfileCard';
import { getDemoProfiles } from '../data/demoProfiles';
import { useI18n } from '../i18n';

export function HomePage() {
  const featured = getDemoProfiles('berlin').slice(0, 8);
  const { t } = useI18n();

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
            <Link to="/dashboard" className="button primary"><PlusCircle size={18} /> {t('home.create')}</Link>
            <Link to="/city/berlin" className="button">{t('home.explore')}</Link>
          </div>
          <p className="demo-note">{t('home.demo')}</p>
        </div>
      </section>

      <section className="market-section">
        <div className="section-head compact">
          <p className="eyebrow">Berlin preview</p>
          <h2>{t('home.available')}</h2>
          <Link to="/city/berlin" className="text-link">View all Berlin</Link>
        </div>
        <div className="cards-grid marketplace-grid">
          {featured.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
        </div>
      </section>

      <section className="quick-grid">
        <Feature icon={<RadioTower />} title="Available Now" text="Live availability signals for active, approved profiles." />
        <Feature icon={<EyeOff />} title="Private Profiles" text="Consent-first listings with hidden contact unlock placeholder." />
        <Feature icon={<Smartphone />} title="Mobile / Home Visit" text="Clear service context through controlled profile badges." />
        <Feature icon={<Building2 />} title="Clubs & Events" text="Prepared placeholder for vetted venues and nightlife events." />
        <Feature icon={<BadgeCheck />} title="Privacy & Verification" text="Moderation, reports, age gate, and content removal structure." />
        <Feature icon={<Map />} title="Next Cities" text={cities.map((city) => city.name).join(' / ')} />
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
