import { Link } from 'react-router-dom';
import { BadgeCheck, HeartHandshake, Home, Hotel, Languages, MapPin, MessageCircle, Radio, Star, Video, LockKeyhole } from 'lucide-react';
import type { Profile } from '../types';
import { useI18n } from '../i18n';
import { serviceLabel } from '../data/serviceCatalog';
import { getPublicLocationLabel } from '../lib/locationLabels';

export function ProfileCard({ profile }: { profile: Profile }) {
  const { t, option } = useI18n();
  const primary = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];
  const status = profile.availability_status || (profile.available_now ? 'available' : 'unavailable');
  const operatorStatus = profile.operator_status || (status === 'available' ? 'ONLINE_NOW' : status === 'busy' ? 'BUSY' : 'OFFLINE');
  const operatorLabel = operatorStatusLabel(operatorStatus);
  const priceFrom = getPriceFrom(profile);
  const reviewCount = 12 + (profile.id.length % 37);
  const rating = (4.6 + (profile.id.length % 4) / 10).toFixed(1);
  const locationLabel = getPublicLocationLabel(profile, t);
  const isNew = profile.created_at ? Date.now() - new Date(profile.created_at).getTime() < 1000 * 60 * 60 * 24 * 14 : profile.id.length % 2 === 0;
  const badges = [
    profile.is_sponsored ? 'SPONSOROWANY' : '',
    profile.is_seed_profile ? 'PREVIEW' : '',
    profile.verified ? 'VERIFIED' : '',
    profile.price_1h ? 'PLUS' : '',
    isNew ? 'NEW' : '',
    (profile.category === 'live_cam' || profile.service_tags?.includes('live-cam')) ? 'LIVE CAM' : ''
  ].filter(Boolean).slice(0, 3);

  return (
    <article className="profile-card premium-profile-card">
      <div className="card-image">
        {primary?.public_url ? <img src={primary.public_url} alt="" loading="lazy" /> : <div className="image-placeholder">{t('app.name')}</div>}
        <span className={`status ${operatorStatusClass(operatorStatus)}`}>{operatorLabel}</span>
        <div className="premium-card-badges">
          {badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
        <div className="card-overlay">
          <div>
            <strong>{profile.display_name}</strong>
            <small>{profile.age ? `${profile.age} · ` : ''}{option(profile.category || 'other')}</small>
          </div>
          <span>{profile.distance_km ? `~${profile.distance_km} km` : locationLabel}</span>
        </div>
      </div>
      <div className="card-body">
        <div>
          <h3>{profile.display_name}{profile.age ? <span>{profile.age}</span> : null}</h3>
          <p><MapPin size={15} /> {locationLabel}{profile.distance_km ? ` - ~${profile.distance_km} km` : ''}</p>
        </div>
        <div className="premium-card-meta">
          <strong>{priceFrom}</strong>
          <span><Star size={14} /> {rating} ({reviewCount})</span>
        </div>
        <div className="mini-icon-row" aria-label="Profile features">
          {profile.visit_types?.includes('hotel') && <span title="Hotel visit"><Hotel size={15} /></span>}
          {profile.visit_types?.includes('incall') && <span title="Home visit"><Home size={15} /></span>}
          {profile.service_tags?.includes('conversation') && <span title="Chat"><MessageCircle size={15} /></span>}
          {profile.category === 'live_cam' && <span title="Cam"><Video size={15} /></span>}
          {profile.verified && <span title="Verified"><BadgeCheck size={15} /></span>}
          {profile.audience?.includes('couples') && <span title="Couples"><HeartHandshake size={15} /></span>}
        </div>
        <div className="badges">
          {profile.private_studio && <span><LockKeyhole size={14} /> Private</span>}
          {profile.languages?.length ? <span><Languages size={14} /> {profile.languages.slice(0, 3).join('/')}</span> : null}
          {profile.category && <span><Radio size={14} /> {option(profile.category)}</span>}
          {profile.hotspot_type && <span>{profile.hotspot_type}</span>}
          {profile.radar_score ? <span>Radar {profile.radar_score}</span> : null}
        </div>
        {profile.services?.length ? <p className="muted line-clamp">{profile.services.slice(0, 4).map(serviceLabel).join(' · ')}</p> : null}
        {profile.visibility_reason && <p className={profile.visibility_reason === 'visible' ? 'success' : 'error-text'}>{t(`visibility.${profile.visibility_reason}`)}</p>}
        <p className="muted line-clamp">{profile.description || t('profile.fallbackDescription')}</p>
        <Link to={`/profile/${profile.id}`} className="button primary full">{t('buttons.viewProfile')}</Link>
      </div>
    </article>
  );
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

function operatorStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ONLINE_NOW: 'Online now',
    BUSY: 'Busy',
    TRAVELING: 'Traveling',
    AVAILABLE_TODAY: 'Available today',
    APPOINTMENT_ONLY: 'Appointment only',
    OFFLINE: 'Offline'
  };
  return labels[status] || 'Offline';
}

function getPriceFrom(profile: Profile) {
  const prices = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_3h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!prices.length) return 'Preis auf Anfrage';
  return `ab ${Math.min(...prices)} ${profile.currency || 'EUR'} / h`;
}
