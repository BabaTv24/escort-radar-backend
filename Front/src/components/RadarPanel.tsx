import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Profile } from '../types';
import { radiusOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';
import type { GeoPoint } from '../lib/geo';
import { formatDistanceKm, isValidLatLng, resolveManualSearcherLocation, resolveProfileRadarLocation, safeDistanceKm } from '../lib/geo';
import { getPublicLocationLabel } from '../lib/locationLabels';
import './RadarPanel.css';

type RadarPanelProps = {
  profiles: Profile[];
  radius: number;
  status: string;
  city: string;
  onRadiusChange: (radius: number) => void;
  onStatusChange: (status: string) => void;
  searcherLocation: GeoPoint;
  onUseLocation?: () => void;
  onSetManualLocation?: (location: GeoPoint) => void;
  fallbackNotice?: boolean;
  compact?: boolean;
};

const statusClassByOperator: Record<string, string> = {
  ONLINE_NOW: 'online-now',
  AVAILABLE_TODAY: 'available-today',
  BUSY: 'busy',
  APPOINTMENT_ONLY: 'appointment-only',
  TRAVELING: 'traveling',
  OFFLINE: 'offline'
};
const radarStatuses = [
  ['online', 'online-now', 'status.onlineNow'],
  ['AVAILABLE_TODAY', 'available-today', 'status.availableToday'],
  ['BUSY', 'busy', 'status.busy'],
  ['APPOINTMENT_ONLY', 'appointment-only', 'status.appointmentOnly'],
  ['TRAVELING', 'traveling', 'status.traveling'],
  ['OFFLINE', 'offline', 'status.offline']
] as const;

export function RadarPanel({ profiles, radius, status, city, onRadiusChange, onStatusChange, searcherLocation, onUseLocation, onSetManualLocation, fallbackNotice = false, compact = false }: RadarPanelProps) {
  const { t } = useI18n();
  const [manualQuery, setManualQuery] = useState('');
  const [manualError, setManualError] = useState('');
  const [localManualLocation, setLocalManualLocation] = useState<GeoPoint | null>(null);
  const effectiveLocation = searcherLocation.source === 'browser' ? searcherLocation : localManualLocation || searcherLocation;
  const hasRadarLocation = (effectiveLocation.source === 'browser' || effectiveLocation.source === 'manual' || effectiveLocation.source === 'manual_saved') && isValidLatLng(effectiveLocation.lat, effectiveLocation.lng);
  const radarProfiles = hasRadarLocation
    ? profiles
      .map((profile) => getRadarProfile(profile, effectiveLocation, radius))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter(({ profile }) => matchesOperatorStatusFilter(profile, status))
      .slice(0, 12)
    : [];

  if (import.meta.env.DEV) {
    console.debug('[RadarLocationResolve]', profiles.map((profile) => ({
      id: profile.id,
      name: profile.display_name,
      category: profile.category,
      city: profile.city,
      work_city: profile.work_city,
      postal_code: profile.postal_code,
      work_area: profile.work_area,
      location_visibility: profile.location_visibility,
      location_mode: profile.location_mode,
      rawLat: profile.latitude,
      rawLng: profile.longitude,
      resolved: resolveProfileRadarLocation(profile)
    })));
    console.debug('[RadarPanel] radarProfiles count', radarProfiles.length);
    console.debug('[RadarPanel] state', {
      manualQuery,
      searcherLocation,
      effectiveLocation,
      hasRadarLocation,
      profilesTotal: profiles.length,
      radarProfiles: radarProfiles.map((item) => ({
        id: item.profile.id,
        name: item.profile.display_name,
        distanceKm: item.distanceKm,
        location: item.radarLocation
      }))
    });
  }

  function submitManualLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const location = resolveManualSearcherLocation(manualQuery);
    if (import.meta.env.DEV) console.debug('[RadarPanel] manual input', { manualQuery, resolved: location });
    if (!location) {
      setManualError(t('radar.manualLocationNotFound'));
      return;
    }
    setManualError('');
    setLocalManualLocation(location);
    onSetManualLocation?.(location);
  }

  return (
    <section className={compact ? 'radar-panel compact' : 'radar-panel'}>
      <div className="radar-copy">
        <p className="eyebrow">{t('radar.eyebrow')}</p>
        <h2>{t('radar.title')}</h2>
        <p>{t('radar.subtitle')}</p>
        <p className="safety-line">{t('radar.privacy')}</p>
        {fallbackNotice && !hasRadarLocation && <p className="safety-line">{t('radar.fallbackNotice')}</p>}
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
            {[
              ['all', '', 'status.all'],
              ...radarStatuses
            ].map(([value, _statusClass, labelKey]) => (
              <button key={value} className={status === value ? 'selected' : ''} type="button" onClick={() => onStatusChange(value)}>
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
        {!hasRadarLocation && (
          <form className="radar-start-panel" onSubmit={submitManualLocation}>
            <strong>{t('radar.setStartingPoint')}</strong>
            <span>{t('radar.locationInputHelp')}</span>
            <div>
              <input value={manualQuery} placeholder={t('radar.locationInputPlaceholder')} onChange={(event) => {
                setManualQuery(event.target.value);
                if (manualError) setManualError('');
              }} />
              <button className="button primary" type="submit">{t('radar.setLocation')}</button>
            </div>
            <div className="radar-start-actions">
              {onUseLocation && <button className="button" type="button" onClick={onUseLocation}>{t('radar.useGps')}</button>}
              {manualError && <small className="error-text">{manualError}</small>}
              {fallbackNotice && <small>{t('radar.locationDenied')}</small>}
            </div>
          </form>
        )}
        {hasRadarLocation && (
          <p className="safety-line">
            {effectiveLocation.source === 'browser' ? t('radar.locationFromGps') : t('radar.locationFromManual')}
            {effectiveLocation.label ? `: ${effectiveLocation.label}` : ''}
          </p>
        )}
        <p className="safety-line">
          {hasRadarLocation ? (radarProfiles.length ? `${radarProfiles.length} ${t('radar.profilesInRadarRange')}` : t('radar.noProfilesInRadius')) : t('radar.locationRequired')}
        </p>
        <div className="radar-legend">
          {radarStatuses.map(([value, statusClass, labelKey]) => (
            <span key={value}><i className={`dot ${statusClass}`} /> {t(labelKey)}</span>
          ))}
        </div>
        {compact && <Link to={`/city/${city}`} className="button primary">{t('radar.cta')}</Link>}
      </div>
      <div className={hasRadarLocation ? 'radar-visual' : 'radar-visual awaiting-location'} aria-label={t('radar.title')}>
        <div className="radar-distance-rings" aria-hidden="true">
          <span className="radar-distance-ring selected">
            <em>{radius} km {t('radar.radiusLabel').toLowerCase()}</em>
          </span>
        </div>
        <div className="radar-sweep" />
        <div className="radar-core" />
        {hasRadarLocation && radarProfiles.length === 0 && (
          <div className="radar-empty-state">
            <strong>{t('radar.noProfilesInRadius')}</strong>
            <small>{t('radar.profilesWithoutRadarLocation')}</small>
          </div>
        )}
        {radarProfiles.map(({ profile, distanceKm, point, operatorStatus, statusClass }) => {
          const primary = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];
          const price = getPrice(profile);
          const tooltipClass = getTooltipClass(point);
          const distanceLabel = formatDistanceKm(distanceKm, t('radar.distanceUnavailable'));

          return (
            <Link
              key={profile.id}
              to={`/profile/${profile.id}`}
              className={`radar-point radar-avatar-point ${statusClass} ${tooltipClass}`}
              style={{ left: `${point.left}%`, top: `${point.top}%` }}
            >
              {primary?.public_url ? <img src={primary.public_url} alt="" loading="lazy" /> : <span>{getInitials(profile.display_name)}</span>}
              <span className="radar-tooltip">
                <strong>{profile.display_name}</strong>
                <small>{distanceLabel}</small>
                <small>{getPublicLocationLabel(profile, t)}</small>
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

function getOperatorStatus(profile: Profile) {
  return profile.operator_status || (profile.available_now ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE');
}

function matchesOperatorStatusFilter(profile: Profile, status: string) {
  if (status === 'all') return true;
  const operatorStatus = getOperatorStatus(profile);
  if (status === 'online' || status === 'available') return operatorStatus === 'ONLINE_NOW' || operatorStatus === 'AVAILABLE_TODAY';
  if (status === 'busy') return operatorStatus === 'BUSY';
  if (status === 'unavailable') return operatorStatus === 'OFFLINE';
  return operatorStatus === status;
}

function getRadarProfile(profile: Profile, searcherLocation: GeoPoint, radius: number) {
  const profileLocation = resolveProfileRadarLocation(profile);
  if (!profileLocation) return null;

  const distanceKm = safeDistanceKm(searcherLocation, profileLocation);
  if (distanceKm === null || distanceKm > radius) return null;

  const bearingDeg = getBearingDeg(searcherLocation.lat, searcherLocation.lng, profileLocation.lat, profileLocation.lng);
  const operatorStatus = getOperatorStatus(profile);
  const statusClass = statusClassByOperator[operatorStatus] || 'offline';

  return {
    profile,
    distanceKm,
    bearingDeg,
    operatorStatus,
    statusClass,
    radarLocation: profileLocation,
    point: getRadarPoint(radius, distanceKm, bearingDeg)
  };
}

function getRadarPoint(radius: number, distanceKm: number, bearingDeg: number) {
  const markerPaddingPercent = 11;
  const maxPixelRadius = 50 - markerPaddingPercent;
  const radialRatio = Math.min(Math.max(distanceKm / Math.max(radius, 1), 0), 1);
  const minVisibleRatio = distanceKm > 0 ? 0.08 : 0;
  const visualRatio = Math.max(radialRatio, minVisibleRatio);
  const bearingRad = bearingDeg * (Math.PI / 180);

  return {
    left: 50 + Math.sin(bearingRad) * maxPixelRadius * visualRatio,
    top: 50 - Math.cos(bearingRad) * maxPixelRadius * visualRatio
  };
}

function getTooltipClass(point: { left: number; top: number }) {
  return [
    point.left > 68 ? 'edge-right' : point.left < 32 ? 'edge-left' : '',
    point.top < 30 ? 'edge-top' : point.top > 72 ? 'edge-bottom' : ''
  ].filter(Boolean).join(' ');
}

function getBearingDeg(lat1: number, lng1: number, lat2: number, lng2: number) {
  const startLat = toRad(lat1);
  const endLat = toRad(lat2);
  const deltaLng = toRad(lng2 - lng1);
  const y = Math.sin(deltaLng) * Math.cos(endLat);
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function toRad(value: number) {
  return value * Math.PI / 180;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || 'P'}${parts[1]?.[0] || ''}`;
}

function getPrice(profile: Profile) {
  const prices = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_3h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!prices.length) return 'Price on request';
  return `from ${Math.min(...prices)} ${profile.currency || 'EUR'}`;
}
