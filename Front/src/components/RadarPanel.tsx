import { Link } from 'react-router-dom';
import type { Profile } from '../types';
import { radiusOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';
import type { GeoPoint } from '../lib/geo';
import { isProfileInRadarRange } from '../lib/geo';

type RadarPanelProps = {
  profiles: Profile[];
  radius: number;
  status: string;
  city: string;
  onRadiusChange: (radius: number) => void;
  onStatusChange: (status: string) => void;
  searcherLocation: GeoPoint;
  onUseLocation?: () => void;
  fallbackNotice?: boolean;
  compact?: boolean;
};

const fallbackAngles = [286, 34, 214, 118, 326, 174, 64, 252, 18, 148, 304, 96];
const statusClassByOperator: Record<string, string> = {
  ONLINE_NOW: 'online-now',
  AVAILABLE_TODAY: 'available-today',
  BUSY: 'busy',
  APPOINTMENT_ONLY: 'appointment-only',
  TRAVELING: 'traveling',
  OFFLINE: 'offline'
};

export function RadarPanel({ profiles, radius, status, city, onRadiusChange, onStatusChange, searcherLocation, onUseLocation, fallbackNotice = false, compact = false }: RadarPanelProps) {
  const { t } = useI18n();
  const visibleProfiles = profiles
    .map((profile) => ({ profile, radar: isProfileInRadarRange(profile, searcherLocation, radius) }))
    .filter(({ profile, radar }) => radar.inRange && (status === 'all' || profile.availability_status === status));

  return (
    <section className={compact ? 'radar-panel compact' : 'radar-panel'}>
      <div className="radar-copy">
        <p className="eyebrow">{t('radar.eyebrow')}</p>
        <h2>{t('radar.title')}</h2>
        <p>{t('radar.subtitle')}</p>
        <p className="safety-line">{t('radar.privacy')}</p>
        {fallbackNotice && <p className="safety-line">{t('radar.fallbackNotice')}</p>}
        <div className="radar-control-group">
          <span>{t('radar.radius')}</span>
          <div className="segmented-pills">
            {radiusOptions.map((item) => (
              <button key={item} className={radius === item ? 'selected' : ''} type="button" onClick={() => onRadiusChange(item)}>
                {item} km
              </button>
            ))}
          </div>
        </div>
        <div className="radar-control-group">
          <span>{t('radar.status')}</span>
          <div className="segmented-pills">
            {['all', 'available', 'busy', 'unavailable'].map((item) => (
              <button key={item} className={status === item ? 'selected' : ''} type="button" onClick={() => onStatusChange(item)}>
                {t(`status.${item}`)}
              </button>
            ))}
          </div>
        </div>
        {onUseLocation && <button className="button" type="button" onClick={onUseLocation}>{t('radar.useLocation')}</button>}
        <p className="safety-line">{t('radar.inRange', { count: visibleProfiles.length })}</p>
        <div className="radar-legend">
          <span><i className="dot online-now" /> Online now</span>
          <span><i className="dot available-today" /> Available today</span>
          <span><i className="dot busy" /> {t('status.busy')}</span>
          <span><i className="dot offline" /> Offline</span>
        </div>
        {compact && <Link to={`/city/${city}`} className="button primary">{t('radar.cta')}</Link>}
      </div>
      <div className="radar-visual" aria-label={t('radar.title')}>
        <div className="radar-sweep" />
        <div className="radar-core" />
        {visibleProfiles.slice(0, 12).map(({ profile, radar }, index) => {
          const primary = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];
          const point = getRadarPoint(profile, index, radius, radar.distance_km);
          const operatorStatus = profile.operator_status || (profile.available_now ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE');
          const statusClass = statusClassByOperator[operatorStatus] || 'offline';
          const price = getPrice(profile);

          return (
            <Link
              key={profile.id}
              to={`/profile/${profile.id}`}
              className={`radar-point radar-avatar-point ${statusClass}`}
              style={{ left: `${point.left}%`, top: `${point.top}%` }}
              title={`${profile.display_name} - ~${radar.distance_km} km - ${operatorStatus.replaceAll('_', ' ')} - ${price}`}
            >
              {primary?.public_url ? <img src={primary.public_url} alt="" loading="lazy" /> : <span>{getInitials(profile.display_name)}</span>}
              <span className="radar-tooltip">
                <strong>{profile.display_name}</strong>
                <small>~{radar.distance_km} km</small>
                <small>{operatorStatus.replaceAll('_', ' ')}</small>
                <small>{price}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function getRadarPoint(profile: Profile, index: number, radius: number, distanceKm?: number | null) {
  const hasCoordinates = typeof profile.latitude === 'number' && typeof profile.longitude === 'number';
  const seed = hashString(profile.id);
  const angle = (hasCoordinates ? seed % 360 : fallbackAngles[index % fallbackAngles.length]) * (Math.PI / 180);
  const distanceRatio = Math.min(Math.max(Number(distanceKm || 0) / Math.max(radius, 1), 0.2), 0.92);
  const fallbackRatio = 0.34 + ((seed % 54) / 100);
  const visualRadius = hasCoordinates ? distanceRatio : fallbackRatio;

  return {
    left: 50 + Math.cos(angle) * visualRadius * 42,
    top: 50 + Math.sin(angle) * visualRadius * 42
  };
}

function hashString(value: string) {
  return value.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || 'P'}${parts[1]?.[0] || ''}`;
}

function getPrice(profile: Profile) {
  const prices = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!prices.length) return 'Price on request';
  return `from ${Math.min(...prices)} ${profile.currency || 'EUR'}`;
}
