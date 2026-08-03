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
import { WorkPointMap } from '../WorkPointMap';

const privacyOptions: Array<{ value: ProfileLocationPrivacy; title: string; description: string }> = [
  { value: 'exact', title: 'Dokładna', description: 'Klient może zobaczyć zapisaną pozycję zgodnie z kontraktem profilu.' },
  { value: 'postal_area', title: 'Rejon kodu', description: 'Publicznie widoczny jest bezpieczny punkt rejonu, bez ulicy i prywatnego adresu.' },
  { value: 'city_only', title: 'Tylko miasto', description: 'Radar używa bezpiecznego, deterministycznego rozmieszczenia w obrębie miasta.' },
  { value: 'hidden', title: 'Ukryta', description: 'Profil nie publikuje markera na mapie.' }
];

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
      setNotice('Marker ustawiony. Sprawdź rozpoznany adres i zapisz zmiany.');
    } catch {
      setError('Nie udało się rozpoznać adresu. Marker pozostaje ustawiony i nadal możesz go zapisać.');
    } finally {
      setResolving(false);
    }
  }

  async function searchAddress() {
    if (searching) return;
    const query = searchText.trim();
    if (!query && !profile.work_city && !profile.postal_code) {
      setError('Wpisz ulicę, miasto albo kod pocztowy.');
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
      setNotice('Adres znaleziony. Marker nie zostanie zapisany, dopóki nie użyjesz przycisku „Zapisz lokalizację”.');
    } catch (searchError) {
      setError(friendlyErrorMessage(searchError, 'Nie znaleziono adresu. Sprawdź dane i spróbuj ponownie.'));
    } finally {
      setSearching(false);
    }
  }

  function useDeviceLocation() {
    if (locating) return;
    setError('');
    setNotice('');
    if (!navigator.geolocation) {
      setError('Ta przeglądarka nie obsługuje geolokalizacji urządzenia.');
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
          ? 'Dostęp do lokalizacji został odrzucony. Formularz nie został zmieniony.'
          : geoError.code === geoError.TIMEOUT
            ? 'Przekroczono czas oczekiwania na lokalizację. Spróbuj ponownie.'
            : 'Nie udało się pobrać lokalizacji urządzenia. Formularz nie został zmieniony.');
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
      if (!payload.work_country || !payload.work_city) throw new InvalidProfileLocationError('Wybierz kraj i wpisz miasto.');
      setSaving(true);
      await onSaveLocation({ ...currentProfile.current, ...payload } as Partial<Profile>, 'Lokalizacja została zapisana.');
      setNotice('Lokalizacja została zapisana.');
    } catch (saveError) {
      setError(friendlyErrorMessage(saveError, 'Nie udało się zapisać lokalizacji. Niezapisane dane pozostały w formularzu.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="advertiser-location-section" aria-labelledby="advertiser-location-title">
      <header className="advertiser-dashboard-heading advertiser-location-heading">
        <div>
          <p className="eyebrow">Escort Radar · prywatność lokalizacji</p>
          <h1 id="advertiser-location-title">Lokalizacja</h1>
          <p>Ustaw prywatny punkt pracy i zdecyduj, jak dokładnie ma być prezentowany klientom.</p>
        </div>
        <div className="advertiser-location-save-state" aria-live="polite">
          <span className={profile.location_updated_at ? 'saved' : ''}>{profile.location_updated_at ? 'Zapisano wcześniej' : 'Niezapisana lokalizacja'}</span>
          <button className="button primary" type="button" disabled={saving || dashboardStatus === 'saving'} onClick={() => void saveLocation()}>
            {saving || dashboardStatus === 'saving' ? 'Zapisywanie…' : 'Zapisz lokalizację'}
          </button>
        </div>
      </header>

      <div className="advertiser-location-grid">
        <div className="advertiser-location-form advertiser-dashboard-panel">
          <div className="advertiser-dashboard-panel-head">
            <div><p className="eyebrow">Adres prywatny</p><h2>Dane miejsca pracy</h2></div>
          </div>
          <div className="advertiser-location-fields">
            <label>Kraj
              <select value={country} onChange={(event) => change({ work_country: event.target.value, work_city: '', city: '' })}>
                {globalCountries.map((item) => <option key={item.code} value={item.code}>{item.labels.pl}</option>)}
              </select>
            </label>
            <label>Miasto
              <input list="advertiser-location-cities" value={String(profile.work_city || '')} onChange={(event) => change({ work_city: event.target.value, city: citySlug(event.target.value) })} />
              <datalist id="advertiser-location-cities">{cities.map((city) => <option key={city} value={city} />)}</datalist>
            </label>
            <label>Dzielnica / rejon
              <input value={String(profile.work_area || '')} onChange={(event) => change({ work_area: event.target.value, area: event.target.value })} />
            </label>
            <label>Kod pocztowy
              <input inputMode="text" autoComplete="postal-code" value={String(profile.postal_code || '')} onChange={(event) => change({ postal_code: event.target.value })} />
            </label>
            <label className="wide">Ulica i numer
              <input autoComplete="street-address" value={String(profile.exact_address || '')} onChange={(event) => {
                setSearchText(event.target.value);
                change({ exact_address: event.target.value, work_place_label: event.target.value });
              }} />
            </label>
          </div>
          <div className="advertiser-location-search">
            <label htmlFor="advertiser-address-search">Wyszukaj adres na mapie</label>
            <div>
              <input id="advertiser-address-search" value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); void searchAddress(); }
              }} placeholder="Ulica, kod pocztowy, miasto" />
              <button className="button" type="button" disabled={searching} onClick={() => void searchAddress()}><Search size={17} />{searching ? 'Szukam…' : 'Znajdź'}</button>
            </div>
          </div>
          <button className="button advertiser-location-device" type="button" disabled={locating} onClick={useDeviceLocation}>
            <Crosshair size={18} />{locating ? 'Pobieranie lokalizacji…' : 'Użyj mojej lokalizacji'}
          </button>
          {resolving ? <p className="advertiser-location-message" role="status">Rozpoznaję adres wybranego punktu…</p> : null}
          {error ? <p className="advertiser-location-message error" role="alert">{error}</p> : null}
          {notice ? <p className="advertiser-location-message success" role="status">{notice}</p> : null}
        </div>

        <div className="advertiser-location-map advertiser-dashboard-panel">
          <WorkPointMap
            latitude={profile.latitude}
            longitude={profile.longitude}
            onChange={(nextPoint) => void setMarker(nextPoint)}
            title="Marker prywatny"
            description="Kliknij mapę albo przeciągnij marker. Współrzędne nie są pokazywane jako tekst i nie zapisują się automatycznie."
          />
          <div className="advertiser-location-point-status">
            <MapPin size={18} aria-hidden="true" />
            <span>{point ? 'Prywatny punkt jest ustawiony.' : 'Prywatny punkt nie jest jeszcze ustawiony.'}</span>
          </div>
        </div>
      </div>

      <section className="advertiser-location-privacy advertiser-dashboard-panel" aria-labelledby="advertiser-location-privacy-title">
        <div className="advertiser-dashboard-panel-head">
          <div><p className="eyebrow">Pozycja publiczna</p><h2 id="advertiser-location-privacy-title">Zakres widoczności</h2></div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <div className="advertiser-location-privacy-options">
          {privacyOptions.map((option) => (
            <label key={option.value} className={privacy === option.value ? 'active' : ''}>
              <input type="radio" name="advertiser-location-privacy" value={option.value} checked={privacy === option.value} onChange={() => change(profileLocationPrivacyPatch(option.value))} />
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
            </label>
          ))}
        </div>
        <div className="advertiser-location-public-preview">
          <strong>Marker prywatny</strong>
          <p>Rzeczywisty punkt wybrany w edytorze jest dostępny właścicielowi i uprawnionemu systemowi podczas edycji.</p>
          <strong>Pozycja publiczna · {privacyOptions.find((option) => option.value === privacy)?.title}</strong>
          <p>{publicPreviewText(privacy)}</p>
          <small>Osobny punkt publiczny wylicza backend Radaru. Ten ekran nie symuluje jego deterministycznego przesunięcia, aby nie pokazywać niedokładnego podglądu.</small>
        </div>
      </section>
    </section>
  );
}

function publicPreviewText(privacy: ProfileLocationPrivacy) {
  if (privacy === 'hidden') return 'Klienci nie zobaczą markera tego profilu na publicznej mapie.';
  if (privacy === 'city_only') return 'Klienci zobaczą bezpiecznie rozmieszczony punkt miasta, bez prywatnych współrzędnych.';
  if (privacy === 'postal_area') return 'Klienci zobaczą przybliżony punkt rejonu lub kodu, bez ulicy i prywatnego adresu.';
  return 'Klienci mogą zobaczyć zapisaną dokładną pozycję zgodnie z obowiązującym kontraktem profilu.';
}

function friendlyErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message.replace(/^HTTP \d+:\s*/i, '') || fallback : fallback;
}
