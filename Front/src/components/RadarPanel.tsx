import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Profile } from '../types';
import { useI18n } from '../i18n';
import type { GeoPoint } from '../lib/geo';
import { RADAR_RADIUS_OPTIONS_METERS, clearSavedSearchLocation, formatDistanceKm, formatRadiusMeters, isValidLatLng, readSavedSearchLocation, resolveManualSearcherLocation, resolveProfileRadarLocation, safeDistanceKm, saveSearchLocationToStorage } from '../lib/geo';
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
  onClearManualLocation?: () => void;
  fallbackNotice?: boolean;
  compact?: boolean;
  mapApiKey?: string;
  showFavoritesFilter?: boolean;
};

const statusClassByOperator: Record<string, string> = {
  ONLINE_NOW: 'online-now',
  AVAILABLE_TODAY: 'available-today',
  BUSY: 'busy',
  APPOINTMENT_ONLY: 'appointment-only',
  TRAVELING: 'traveling',
  OFFLINE: 'offline'
};
let radarGoogleMapsPromise: Promise<any> | null = null;

const radarStatuses = [
  ['favorites', 'favorites', 'favorites.favoritesFilter'],
  ['online', 'online-now', 'status.onlineNow'],
  ['BUSY', 'busy', 'status.busy'],
  ['OFFLINE', 'offline', 'status.offline']
] as const;

const allStatus = ['all', 'all', 'status.all'] as const;

export function RadarPanel({ profiles, radius, status, city, onRadiusChange, onStatusChange, searcherLocation, onUseLocation, onSetManualLocation, onClearManualLocation, fallbackNotice = false, compact = false, mapApiKey = '', showFavoritesFilter = true }: RadarPanelProps) {
  const { t } = useI18n();
  const [manualQuery, setManualQuery] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const [localManualLocation, setLocalManualLocation] = useState<GeoPoint | null>(() => readSavedSearchLocation());
  const effectiveLocation = searcherLocation.source === 'browser' ? searcherLocation : localManualLocation || searcherLocation;
  const hasRadarLocation = (effectiveLocation.source === 'browser' || effectiveLocation.source === 'manual' || effectiveLocation.source === 'manual_saved') && isValidLatLng(effectiveLocation.lat, effectiveLocation.lng);
  const showManualForm = !hasRadarLocation || isEditingLocation;
  const visibleRadarStatuses = showFavoritesFilter ? radarStatuses : radarStatuses.filter(([value]) => value !== 'favorites');
  const radarLegendStatuses = showFavoritesFilter ? radarStatuses : [allStatus, ...visibleRadarStatuses];
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

  async function submitManualLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualBusy) return;
    setManualBusy(true);
    const location = resolveManualSearcherLocation(manualQuery) || await geocodeManualSearcherLocation(manualQuery, mapApiKey);
    if (import.meta.env.DEV) console.debug('[RadarPanel] manual input', { manualQuery, resolved: location });
    if (!location) {
      setManualError(t('radar.manualLocationNotFound'));
      setManualBusy(false);
      return;
    }
    setManualError('');
    setManualMessage(t('radar.locationUpdated'));
    setIsEditingLocation(false);
    setLocalManualLocation(location);
    saveSearchLocationToStorage(location);
    onSetManualLocation?.(location);
    setManualBusy(false);
  }

  function editManualLocation() {
    setManualQuery(effectiveLocation.label || '');
    setManualError('');
    setManualMessage('');
    setIsEditingLocation(true);
  }

  function clearManualLocation() {
    setManualQuery('');
    setManualError('');
    setManualMessage(t('radar.locationCleared'));
    setIsEditingLocation(true);
    setLocalManualLocation(null);
    clearSavedSearchLocation();
    onClearManualLocation?.();
  }

  return (
    <section className={compact ? 'radar-panel compact' : 'radar-panel'}>
      <div className="radar-copy radar-control-panel">
        <p className="eyebrow">{t('radar.eyebrow')}</p>
        <h2>{t('radar.title')}</h2>
        <p>{t('radar.subtitle')}</p>
        <p className="safety-line">{t('radar.privacy')}</p>
        {fallbackNotice && !hasRadarLocation && <p className="safety-line">{t('radar.fallbackNotice')}</p>}
        <div className="radar-control-group">
          {compact ? (
            <label className="live-radar-range">
              <span>{t('radar.radius')}</span>
              <strong>{formatRadiusMeters(radius)}</strong>
              <select
                value={radius}
                onChange={(event) => onRadiusChange(Number(event.target.value))}
              >{RADAR_RADIUS_OPTIONS_METERS.map((value) => <option key={value} value={value}>{formatRadiusMeters(value)}</option>)}</select>
            </label>
          ) : (
            <label className="radar-radius-slider">
              <span className="radar-radius-slider-head">
                <span>{t('radar.radius')}</span>
                <strong>{formatRadiusMeters(radius)}</strong>
              </span>
              <select
                value={radius}
                onChange={(event) => onRadiusChange(Number(event.target.value))}
              >{RADAR_RADIUS_OPTIONS_METERS.map((value) => <option key={value} value={value}>{formatRadiusMeters(value)}</option>)}</select>
            </label>
          )}
        </div>
        <div className="radar-control-group">
          <span>{t('radar.status')}</span>
          <div className="segmented-pills">
            {[
              allStatus,
              ...visibleRadarStatuses
            ].map(([value, _statusClass, labelKey]) => (
              <button
                key={value}
                className={`status-chip radar-filter-chip radar-filter-${value} ${value === 'favorites' ? 'status-chip-favorites' : ''} er-btn er-glass-btn er-glass-btn--sm ${getRadarFilterButtonClass(value)} ${status === value ? 'selected is-active er-glass-btn--active' : ''}`.trim()}
                type="button"
                onClick={() => onStatusChange(value)}
              >
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
        {hasRadarLocation && !isEditingLocation && (
          <div className="radar-saved-location">
            <strong>{t('radar.savedLocation')}: {effectiveLocation.label || t('radar.locationFromManual')}</strong>
            <div>
              <button className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--sm" type="button" onClick={editManualLocation}><span>{t('radar.changeLocation')}</span></button>
              <button className="button ghost er-btn er-glass-btn er-glass-btn--purple er-glass-btn--sm" type="button" onClick={clearManualLocation}><span>{t('radar.clearLocation')}</span></button>
            </div>
            {manualMessage && <small>{manualMessage}</small>}
          </div>
        )}
        {showManualForm && (
          <form className="radar-start-panel" onSubmit={submitManualLocation}>
            <strong>{hasRadarLocation ? t('radar.editPostalCode') : t('radar.setStartingPoint')}</strong>
            <span>{t('radar.locationInputHelp')}</span>
            <div>
              <input value={manualQuery} placeholder={t('radar.locationInputPlaceholder')} onChange={(event) => {
                setManualQuery(event.target.value);
                if (manualError) setManualError('');
              }} />
              <button className="button primary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" type="submit" disabled={manualBusy}><span>{manualBusy ? t('states.loading') : t('radar.setLocation')}</span></button>
            </div>
            <div className="radar-start-actions">
              {onUseLocation && <button className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--sm" type="button" onClick={onUseLocation}><span>{t('radar.useGps')}</span></button>}
              {hasRadarLocation && <button className="button ghost er-btn er-glass-btn er-glass-btn--purple er-glass-btn--sm" type="button" onClick={() => setIsEditingLocation(false)}><span>{t('buttons.cancel')}</span></button>}
              {manualError && <small className="error-text">{manualError}</small>}
              {manualMessage && <small>{manualMessage}</small>}
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
          {radarLegendStatuses.map(([value, statusClass, labelKey]) => (
            <span key={value}><i className={`dot ${statusClass}`} /> {t(labelKey)}</span>
          ))}
        </div>
        {compact && <Link to={`/city/${city}`} className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md"><span>{t('radar.cta')}</span></Link>}
      </div>
      <div className={`${hasRadarLocation ? 'radar-visual' : 'radar-visual awaiting-location'} radar-visual-canvas ${mapApiKey ? 'with-map' : ''}`} aria-label={t('radar.title')}>
        {mapApiKey && <RadarMapBackground apiKey={mapApiKey} center={effectiveLocation} />}
        <div className="radar-distance-rings" aria-hidden="true">
          <span className="radar-distance-ring selected">
            <em>{formatRadiusMeters(radius)} {t('radar.radiusLabel').toLowerCase()}</em>
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
          const price = getPrice(profile, t);
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

function RadarMapBackground({ apiKey, center }: { apiKey: string; center: GeoPoint }) {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!apiKey || !isValidLatLng(center.lat, center.lng)) return;
    let active = true;
    loadRadarGoogleMaps(apiKey)
      .then((google) => {
        if (!active || !mapNode.current) return;
        const position = { lat: center.lat, lng: center.lng };
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(mapNode.current, {
            center: position,
            zoom: 12,
            clickableIcons: false,
            disableDefaultUI: true,
            gestureHandling: 'none',
            keyboardShortcuts: false,
            styles: radarMapStyles
          });
          return;
        }
        mapRef.current.setCenter(position);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [apiKey, center.lat, center.lng]);

  if (failed) return null;
  return <div ref={mapNode} className="radar-google-map" aria-hidden="true" />;
}

async function geocodeManualSearcherLocation(input: string, apiKey: string): Promise<GeoPoint | null> {
  const query = normalizeLocationQuery(input);
  if (!query || !apiKey) return null;
  try {
    const google = await loadRadarGoogleMaps(apiKey);
    const geocoder = new google.maps.Geocoder();
    const result = await geocoder.geocode({ address: query });
    const place = result.results?.[0];
    const point = place?.geometry?.location;
    const lat = typeof point?.lat === 'function' ? point.lat() : Number.NaN;
    const lng = typeof point?.lng === 'function' ? point.lng() : Number.NaN;
    if (!isValidLatLng(lat, lng)) return null;
    return {
      lat,
      lng,
      source: 'manual',
      label: place.formatted_address || query
    };
  } catch {
    return null;
  }
}

function loadRadarGoogleMaps(apiKey: string) {
  const existing = (window as any).google;
  if (existing?.maps) return Promise.resolve(existing);
  if (radarGoogleMapsPromise) return radarGoogleMapsPromise;

  radarGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const google = (window as any).google;
      google?.maps ? resolve(google) : reject(new Error('Google Maps unavailable'));
    };
    script.onerror = () => reject(new Error('Google Maps failed'));
    document.head.appendChild(script);
  });

  return radarGoogleMapsPromise;
}

function normalizeLocationQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

const radarMapStyles = [
  { elementType: 'geometry', stylers: [{ color: '#0b0b0d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#b9a66d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#080809' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#4a3a1b' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#171719' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#050506' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2415' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#05070c' }] }
];

function getOperatorStatus(profile: Profile) {
  return profile.operator_status || (profile.available_now ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE');
}

function matchesOperatorStatusFilter(profile: Profile, status: string) {
  if (status === 'all') return true;
  if (status === 'favorites') return true;
  const operatorStatus = getOperatorStatus(profile);
  if (status === 'online') return operatorStatus === 'ONLINE_NOW';
  if (status === 'available') return operatorStatus === 'ONLINE_NOW' || operatorStatus === 'AVAILABLE_TODAY';
  if (status === 'busy') return operatorStatus === 'BUSY';
  if (status === 'unavailable') return operatorStatus === 'OFFLINE';
  return operatorStatus === status;
}

function getRadarFilterButtonClass(value: string) {
  if (value === 'favorites') return 'er-glass-btn--pink';
  if (value === 'online') return 'er-glass-btn--green';
  if (value === 'BUSY') return 'er-glass-btn--orange';
  if (value === 'OFFLINE') return 'er-glass-btn--gray';
  return 'er-glass-btn--purple';
}

function getRadarProfile(profile: Profile, searcherLocation: GeoPoint, radius: number) {
  const profileLocation = resolveProfileRadarLocation(profile);
  if (!profileLocation) return null;

  const distanceKm = safeDistanceKm(searcherLocation, profileLocation);
  if (distanceKm === null || distanceKm * 1000 > radius) return null;

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
  const radialRatio = Math.min(Math.max(distanceKm * 1000 / Math.max(radius, 1), 0), 1);
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

function getPrice(profile: Profile, t: (key: string, vars?: Record<string, string | number>) => string) {
  const prices = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_3h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!prices.length) return t('profile.priceOnRequest');
  return t('profile.priceFrom', { amount: Math.min(...prices), currency: profile.currency || 'EUR' });
}

