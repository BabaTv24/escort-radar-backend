import { Link } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import type { FormEvent } from 'react';
import { List, Map } from 'lucide-react';
import type { Profile } from '../types';
import { useI18n } from '../i18n';
import type { GeoPoint } from '../lib/geo';
import { MAX_RADAR_RADIUS_METERS, MIN_RADAR_RADIUS_METERS, clearSavedSearchLocation, formatRadiusMeters, isValidLatLng, resolveManualSearcherLocation, resolveProfileRadarLocation, saveSearchLocationToStorage } from '../lib/geo';
import { getOperatorStatus, matchesRadarStatus, selectRadarProfiles } from '../lib/homeRadar';
import './RadarPanel.css';

const RadarMapLibre = lazy(() => import('./RadarMapLibre').then((module) => ({ default: module.RadarMapLibre })));

type RadarPanelProps = {
  profiles: Profile[];
  radius: number;
  status: string;
  city: string;
  radarHref?: string;
  onRadiusChange: (radius: number) => void;
  onStatusChange: (status: string) => void;
  searcherLocation: GeoPoint | null;
  onUseLocation?: () => void;
  onSetManualLocation?: (location: GeoPoint) => void;
  onClearManualLocation?: () => void;
  fallbackNotice?: boolean;
  compact?: boolean;
  showFavoritesFilter?: boolean;
  profilesWithoutLocationCount?: number;
  favoriteProfileIds?: ReadonlySet<string>;
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
  ['favorites', 'favorites', 'favorites.favoritesFilter'],
  ['online', 'online-now', 'status.onlineNow'],
  ['BUSY', 'busy', 'status.busy'],
  ['OFFLINE', 'offline', 'status.offline']
] as const;

const allStatus = ['all', 'all', 'status.all'] as const;

export function RadarPanel({ profiles, radius, status, city, radarHref, onRadiusChange, onStatusChange, searcherLocation, onUseLocation, onSetManualLocation, onClearManualLocation, fallbackNotice = false, compact = false, showFavoritesFilter = true, profilesWithoutLocationCount, favoriteProfileIds = new Set() }: RadarPanelProps) {
  const { t } = useI18n();
  const [manualQuery, setManualQuery] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [manualBusy, setManualBusy] = useState(false);
  const effectiveLocation = searcherLocation;
  const hasRadarLocation = Boolean(effectiveLocation && isValidLatLng(effectiveLocation.lat, effectiveLocation.lng));
  const showManualForm = !hasRadarLocation || isEditingLocation;
  const visibleRadarStatuses = showFavoritesFilter ? radarStatuses : radarStatuses.filter(([value]) => value !== 'favorites');
  const radarLegendStatuses = showFavoritesFilter ? radarStatuses : [allStatus, ...visibleRadarStatuses];
  const radarCandidates = hasRadarLocation ? selectRadarProfiles(profiles, effectiveLocation, radius, 'all') : [];
  const radarProfiles = radarCandidates
    .map(({ profile, distanceKm, location }) => ({
      profile,
      distanceKm,
      operatorStatus: getOperatorStatus(profile),
      statusClass: statusClassByOperator[getOperatorStatus(profile)] || 'offline',
      radarLocation: location,
      favorite: favoriteProfileIds.has(profile.id)
    }))
    .filter(({ profile }) => status === 'favorites' ? favoriteProfileIds.has(profile.id) : matchesRadarStatus(profile, status));
  const profilesWithoutLocation = profilesWithoutLocationCount ?? profiles.filter((profile) => !resolveProfileRadarLocation(profile)).length;
  const locatedProfiles = profiles.length - profilesWithoutLocation;

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
    const location = resolveManualSearcherLocation(manualQuery);
    if (import.meta.env.DEV) console.debug('[RadarPanel] manual input', { manualQuery, resolved: location });
    if (!location) {
      setManualError(t('radar.manualLocationNotFound'));
      setManualBusy(false);
      return;
    }
    setManualError('');
    setManualMessage(t('radar.locationUpdated'));
    setIsEditingLocation(false);
    saveSearchLocationToStorage(location);
    onSetManualLocation?.(location);
    setManualBusy(false);
  }

  function editManualLocation() {
    setManualQuery(effectiveLocation?.label || '');
    setManualError('');
    setManualMessage('');
    setIsEditingLocation(true);
  }

  function clearManualLocation() {
    setManualQuery('');
    setManualError('');
    setManualMessage(t('radar.locationCleared'));
    setIsEditingLocation(true);
    clearSavedSearchLocation();
    onClearManualLocation?.();
  }

  return (
    <section className={compact ? 'radar-panel compact' : 'radar-panel'}>
      <RadarSearchPanel>
        <div className="radar-heading-block">
          <p className="eyebrow">{t('radar.eyebrow')}</p>
          <h2>{t('radar.title')}</h2>
          <p>{t('radar.subtitle')}</p>
          <p className="safety-line">{t('radar.privacy')}</p>
          {fallbackNotice && !hasRadarLocation && <p className="safety-line">{t('radar.fallbackNotice')}</p>}
        </div>
        <div className="radar-control-group radar-radius-control">
          <label className={`radar-radius-slider ${compact ? 'live-radar-range' : ''}`}>
            <span className="radar-radius-slider-head">
              <span>{t('radar.radius')}</span>
              <strong>{formatRadiusMeters(radius)}</strong>
            </span>
            <input
              aria-label={t('radar.radius')}
              type="range"
              min={MIN_RADAR_RADIUS_METERS}
              max={MAX_RADAR_RADIUS_METERS}
              step={10}
              value={radius}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
            />
            <span className="radar-radius-scale"><small>10 m</small><small>150 km</small></span>
          </label>
        </div>
        {hasRadarLocation && !isEditingLocation && (
          <div className="radar-saved-location radar-location-control">
            <strong>{t('radar.savedLocation')}: {effectiveLocation?.label || t('radar.locationFromManual')}</strong>
            <div>
              <button className="button er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--sm" type="button" onClick={editManualLocation}><span>{t('radar.changeLocation')}</span></button>
              <button className="button ghost er-btn er-glass-btn er-glass-btn--purple er-glass-btn--sm" type="button" onClick={clearManualLocation}><span>{t('radar.clearLocation')}</span></button>
            </div>
            {manualMessage && <small>{manualMessage}</small>}
          </div>
        )}
        {showManualForm && (
          <form className="radar-start-panel radar-location-control" onSubmit={submitManualLocation}>
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
          <p className="safety-line radar-location-source">
            {effectiveLocation?.source === 'browser' ? t('radar.locationFromGps') : t('radar.locationFromManual')}
            {effectiveLocation?.label ? `: ${effectiveLocation.label}` : ''}
          </p>
        )}
        <p className="safety-line radar-results-summary">
          {hasRadarLocation ? (radarProfiles.length ? `${radarProfiles.length} ${t('radar.profilesInRadarRange')}` : t('radar.noProfilesInRadius')) : t('radar.locationRequired')}
        </p>
        <p className="safety-line radar-results-summary">{t('radar.candidatePoolCount', { count: profiles.length })}</p>
        <p className="safety-line radar-results-summary">{t('radar.locatedProfilesCount', { count: locatedProfiles })}</p>
        {profilesWithoutLocation > 0 && <p className="safety-line radar-results-summary">{t('radar.profilesWithoutLocationCount', { count: profilesWithoutLocation })}</p>}
        <div className="radar-legend radar-results-legend">
          {radarLegendStatuses.map(([value, statusClass, labelKey]) => (
            <span key={value}><i className={`dot ${statusClass}`} /> {t(labelKey)}</span>
          ))}
        </div>
        {compact && <Link to={radarHref || `/city/${city}`} className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md"><span>{t('home.openRadar')}</span></Link>}
      </RadarSearchPanel>
      <RadarMap>
        <RadarViewSwitch />
        {hasRadarLocation && effectiveLocation && (
          <Suspense fallback={<div className="radar-map-loading">{t('states.loading')}</div>}>
            <RadarMapLibre
              center={effectiveLocation}
              radius={radius}
              items={radarProfiles}
              empty={radarProfiles.length === 0}
              t={t}
            />
          </Suspense>
        )}
        <div className={`${hasRadarLocation ? 'radar-visual' : 'radar-visual awaiting-location'} radar-visual-canvas`} aria-label={t('radar.title')}>
          <div className="radar-distance-rings" aria-hidden="true">
            <span className="radar-distance-ring selected">
              <em>{formatRadiusMeters(radius)} {t('radar.radiusLabel').toLowerCase()}</em>
            </span>
          </div>
          <div className="radar-sweep" aria-hidden="true" />
          <div className="radar-core" aria-hidden="true" />
          {!hasRadarLocation && (
            <div className="radar-empty-state">
              <strong>{t('radar.locationRequired')}</strong>
              <small>{t('radar.locationInputHelp')}</small>
            </div>
          )}
        </div>
        <RadarQuickFilters
          statuses={[allStatus, ...visibleRadarStatuses]}
          selectedStatus={status}
          onStatusChange={onStatusChange}
        />
      </RadarMap>
    </section>
  );
}

function RadarSearchPanel({ children }: { children: React.ReactNode }) {
  return <div className="radar-copy radar-control-panel radar-search-panel">{children}</div>;
}

function RadarMap({ children }: { children: React.ReactNode }) {
  return <div className="radar-map-surface">{children}</div>;
}

function RadarViewSwitch() {
  const { t } = useI18n();
  return (
    <div className="radar-view-switch" aria-label={t('radar.viewSwitch')}>
      <a href="#profiles"><List size={14} /> <span>{t('radar.listView')}</span></a>
      <button className="selected" type="button" aria-pressed="true"><Map size={14} /> <span>{t('radar.mapView')}</span></button>
    </div>
  );
}

function RadarQuickFilters({ statuses, selectedStatus, onStatusChange }: {
  statuses: ReadonlyArray<readonly [string, string, string]>;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="radar-quick-filters" aria-label={t('radar.status')}>
      {statuses.map(([value, statusClass, labelKey]) => (
        <button
          key={value}
          className={`radar-quick-filter ${statusClass} ${selectedStatus === value ? 'selected' : ''}`.trim()}
          type="button"
          aria-pressed={selectedStatus === value}
          onClick={() => onStatusChange(value)}
        >
          <i className={`dot ${statusClass}`} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

