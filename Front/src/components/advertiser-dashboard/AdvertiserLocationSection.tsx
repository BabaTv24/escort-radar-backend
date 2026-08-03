import { useRef, useState } from 'react';
import { Crosshair, MapPin, Search, ShieldCheck } from 'lucide-react';
import type { LocationGeocodeResult } from '../../lib/api';
import {
  InvalidProfileLocationError,
  effectiveProfileLocationPrivacy,
  mergeProfileReverseGeocode,
  profileLocationPrivacyPatch,
  profileLocationSavePayload,
  profileMapPoint,
  type ProfileLocationPrivacy,
  type ProfileMapPoint
} from '../../lib/adminLocationForm';
import { citySlug, getCitiesForCountry, globalCountries, normalizeCountry } from '../../lib/globalLocations';
import type { Profile } from '../../types';
import { useI18n } from '../../i18n';
import { WorkPointMap } from '../WorkPointMap';

const privacyOptions: ProfileLocationPrivacy[] = ['exact', 'postal_area', 'city_only', 'hidden'];

export function AdvertiserLocationSection({
  profile,
  dashboardStatus,
  onProfileChange,
  onReverseLocation,
  onSearchLocation,
  onSaveLocation
}: {
  profile: Partial<Profile>;
  dashboardStatus: string;
  onProfileChange: (profile: Partial<Profile>) => void;
  onReverseLocation: (point: ProfileMapPoint) => Promise<LocationGeocodeResult>;
  onSearchLocation: (location: Partial<Profile>) => Promise<LocationGeocodeResult>;
  onSaveLocation: (profile: Partial<Profile>, successMessage?: string) => Promise<void>;
}) {
  const { lang, t } = useI18n();
  const currentProfile = useRef(profile);
  currentProfile.current = profile;
  const [searchText, setSearchText] = useState(String(profile.exact_address || profile.work_place_label || ''));
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const point = profileMapPoint(profile.latitude, profile.longitude);
  const privacy = effectiveProfileLocationPrivacy(profile);
  const country = normalizeCountry(profile.work_country) || 'DE';
  const cities = getCitiesForCountry(country);

  function change(patch: Partial<Profile>) {
    setError('');
    setNotice('');
    onProfileChange({ ...currentProfile.current, ...patch });
  }

  async function setMarker(nextPoint: ProfileMapPoint) {
    change({
      latitude: nextPoint.latitude,
      longitude: nextPoint.longitude,
      location_input_source: 'manual',
      location_precision: 'exact'
    });
    setResolving(true);
    try {
      const location = await onReverseLocation(nextPoint);
      const merged = mergeProfileReverseGeocode(currentProfile.current, nextPoint, location, citySlug);
      onProfileChange(merged as Partial<Profile>);
      setNotice(t('advertiserDashboard.location.markerSetNotice'));
    } catch {
      setError(t('advertiserDashboard.location.reverseFailed'));
    } finally {
      setResolving(false);
    }
  }

  async function searchAddress() {
    if (searching) return;
    const query = searchText.trim();
    if (!query && !profile.work_city && !profile.postal_code) {
      setError(t('advertiserDashboard.location.enterAddress'));
      return;
    }
    setSearching(true);
    setError('');
    setNotice('');
    try {
      const location = await onSearchLocation({
        ...currentProfile.current,
        exact_address: query || currentProfile.current.exact_address,
        work_place_label: query || currentProfile.current.work_place_label,
        location_visibility: 'exact',
        location_mode: 'approximate',
        location_input_source: 'automatic'
      });
      const nextPoint = profileMapPoint(location.latitude, location.longitude);
      if (!nextPoint) throw new Error('invalid geocoder coordinates');
      const merged = mergeProfileReverseGeocode(currentProfile.current, nextPoint, location, citySlug);
      onProfileChange(merged as Partial<Profile>);
      setSearchText(String(location.exact_address || location.work_place_label || query));
      setNotice(t('advertiserDashboard.location.addressFoundNotice'));
    } catch (searchError) {
      setError(friendlyErrorMessage(searchError, t('advertiserDashboard.location.addressNotFound')));
    } finally {
      setSearching(false);
    }
  }

  function useDeviceLocation() {
    if (locating) return;
    setError('');
    setNotice('');
    if (!navigator.geolocation) {
      setError(t('advertiserDashboard.location.geolocationUnsupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        void setMarker({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (geoError) => {
        setLocating(false);
        setError(geoError.code === geoError.PERMISSION_DENIED
          ? t('advertiserDashboard.location.permissionDenied')
          : geoError.code === geoError.TIMEOUT
            ? t('advertiserDashboard.location.timeout')
            : t('advertiserDashboard.location.deviceFailed'));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  async function saveLocation() {
    if (saving || dashboardStatus === 'saving') return;
    setError('');
    setNotice('');
    try {
      const payload = profileLocationSavePayload(currentProfile.current);
      if (!payload.work_country || !payload.work_city) {
        setError(t('advertiserDashboard.location.selectCountryCity'));
        return;
      }
      setSaving(true);
      await onSaveLocation({ ...currentProfile.current, ...payload } as Partial<Profile>, t('advertiserDashboard.location.saved'));
      setNotice(t('advertiserDashboard.location.saved'));
    } catch (saveError) {
      setError(saveError instanceof InvalidProfileLocationError
        ? t('advertiserDashboard.location.invalidMarker')
        : friendlyErrorMessage(saveError, t('advertiserDashboard.location.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="advertiser-location-section" aria-labelledby="advertiser-location-title">
      <header className="advertiser-dashboard-heading advertiser-location-heading">
        <div>
          <p className="eyebrow">{t('advertiserDashboard.location.eyebrow')}</p>
          <h1 id="advertiser-location-title">{t('advertiserDashboard.location.title')}</h1>
          <p>{t('advertiserDashboard.location.subtitle')}</p>
        </div>
        <div className="advertiser-location-save-state" aria-live="polite">
          <span className={profile.location_updated_at ? 'saved' : ''}>{profile.location_updated_at ? t('advertiserDashboard.location.savedPreviously') : t('advertiserDashboard.location.unsaved')}</span>
          <button className="button primary" type="button" disabled={saving || dashboardStatus === 'saving'} onClick={() => void saveLocation()}>
            {saving || dashboardStatus === 'saving' ? t('advertiserDashboard.location.saving') : t('dashboard.advertiser.saveLocation')}
          </button>
        </div>
      </header>

      <div className="advertiser-location-grid">
        <div className="advertiser-location-form advertiser-dashboard-panel">
          <div className="advertiser-dashboard-panel-head">
            <div><p className="eyebrow">{t('advertiserDashboard.location.privateAddress')}</p><h2>{t('advertiserDashboard.location.workplaceData')}</h2></div>
          </div>
          <div className="advertiser-location-fields">
            <label>{t('advertiserDashboard.location.country')}
              <select value={country} onChange={(event) => change({ work_country: event.target.value, work_city: '', city: '' })}>
                {globalCountries.map((item) => <option key={item.code} value={item.code}>{item.labels[lang]}</option>)}
              </select>
            </label>
            <label>{t('advertiserDashboard.location.city')}
              <input list="advertiser-location-cities" value={String(profile.work_city || '')} onChange={(event) => change({ work_city: event.target.value, city: citySlug(event.target.value) })} />
              <datalist id="advertiser-location-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist>
            </label>
            <label>{t('advertiserDashboard.location.districtArea')}
              <input value={String(profile.work_area || '')} onChange={(event) => change({ work_area: event.target.value, area: event.target.value })} />
            </label>
            <label>{t('advertiserDashboard.location.postalCode')}
              <input inputMode="text" autoComplete="postal-code" value={String(profile.postal_code || '')} onChange={(event) => change({ postal_code: event.target.value })} />
            </label>
            <label className="wide">{t('advertiserDashboard.location.streetAddress')}
              <input autoComplete="street-address" value={String(profile.exact_address || '')} onChange={(event) => {
                setSearchText(event.target.value);
                change({ exact_address: event.target.value, work_place_label: event.target.value });
              }} />
            </label>
          </div>
          <div className="advertiser-location-search">
            <label htmlFor="advertiser-address-search">{t('advertiserDashboard.location.searchAddressLabel')}</label>
            <div>
              <input id="advertiser-address-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void searchAddress(); }
              }} placeholder={t('advertiserDashboard.location.searchPlaceholder')} />
              <button className="button" type="button" disabled={searching} onClick={() => void searchAddress()}><Search size={17} />{searching ? t('advertiserDashboard.location.searching') : t('advertiserDashboard.location.find')}</button>
            </div>
          </div>
          <button className="button advertiser-location-device" type="button" disabled={locating} onClick={useDeviceLocation}>
            <Crosshair size={18} />{locating ? t('advertiserDashboard.location.locating') : t('advertiserDashboard.location.useMyLocation')}
          </button>
          {resolving ? <p className="advertiser-location-message" role="status">{t('advertiserDashboard.location.resolving')}</p> : null}
          {error ? <p className="advertiser-location-message error" role="alert">{error}</p> : null}
          {notice ? <p className="advertiser-location-message success" role="status">{notice}</p> : null}
        </div>

        <div className="advertiser-location-map advertiser-dashboard-panel">
          <WorkPointMap
            latitude={profile.latitude}
            longitude={profile.longitude}
            onChange={(nextPoint) => void setMarker(nextPoint)}
            title={t('advertiserDashboard.location.markerTitle')}
            description={t('advertiserDashboard.location.markerDescription')}
          />
          <div className="advertiser-location-point-status">
            <MapPin size={18} aria-hidden="true" />
            <span>{point ? t('advertiserDashboard.location.pointSet') : t('advertiserDashboard.location.pointNotSet')}</span>
          </div>
        </div>
      </div>

      <section className="advertiser-location-privacy advertiser-dashboard-panel" aria-labelledby="advertiser-location-privacy-title">
        <div className="advertiser-dashboard-panel-head">
          <div><p className="eyebrow">{t('advertiserDashboard.location.publicPosition')}</p><h2 id="advertiser-location-privacy-title">{t('advertiserDashboard.location.visibilityRange')}</h2></div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <div className="advertiser-location-privacy-options">
          {privacyOptions.map((option) => (
            <label key={option} className={privacy === option ? 'active' : ''}>
              <input type="radio" name="advertiser-location-privacy" value={option} checked={privacy === option} onChange={() => change(profileLocationPrivacyPatch(option))} />
              <span><strong>{t(`advertiserDashboard.location.privacy.${option}.title`)}</strong><small>{t(`advertiserDashboard.location.privacy.${option}.description`)}</small></span>
            </label>
          ))}
        </div>
        <div className="advertiser-location-public-preview">
          <strong>{t('advertiserDashboard.location.privateMarker')}</strong>
          <p>{t('advertiserDashboard.location.privateMarkerDescription')}</p>
          <strong>{t('advertiserDashboard.location.publicPositionLabel', { mode: t(`advertiserDashboard.location.privacy.${privacy}.title`) })}</strong>
          <p>{t(`advertiserDashboard.location.preview.${privacy}`)}</p>
          <small>{t('advertiserDashboard.location.publicPreviewNote')}</small>
        </div>
      </section>
    </section>
  );
}

function friendlyErrorMessage(_error: unknown, fallback: string) {
  return fallback;
}
