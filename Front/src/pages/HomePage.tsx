import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BadgeCheck, Building2, EyeOff, Map, RadioTower, Smartphone } from 'lucide-react';
import { cities } from '../data/cities';

export function HomePage() {
  return (
    <div className="page">
      <section className="hero">
        <div className="radar-ring" />
        <div className="hero-content">
          <p className="eyebrow">18+ verified nightlife marketplace</p>
          <h1>Escort Radar</h1>
          <p className="tagline">Realtime Private Nightlife Discovery</p>
          <div className="hero-actions">
            <Link to="/dashboard" className="button primary">Create Profile</Link>
            <Link to="/city/berlin" className="button">Explore Berlin</Link>
          </div>
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
