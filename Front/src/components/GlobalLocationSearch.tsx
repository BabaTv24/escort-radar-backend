import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { categoryOptions, normalizeCategoryKey } from '../lib/categories';
import { citySlug, getCitiesForCountry, getCountryLabel, globalCountries, normalizeCountry } from '../lib/globalLocations';
import { useI18n } from '../i18n';

type GlobalLocationSearchProps = {
  initialCountry?: string;
  initialCity?: string;
  initialCategory?: string;
  compact?: boolean;
};

let placesPromise: Promise<any> | null = null;

function loadPlaces(apiKey: string) {
  const existing = (window as any).google;
  if (existing?.maps?.places) return Promise.resolve(existing);
  if (placesPromise) return placesPromise;
  placesPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const google = (window as any).google;
      google?.maps?.places ? resolve(google) : reject(new Error('Google Places unavailable'));
    };
    script.onerror = () => reject(new Error('Google Places failed'));
    document.head.appendChild(script);
  });
  return placesPromise;
}

export function GlobalLocationSearch({ initialCountry = 'DE', initialCity = 'Berlin', initialCategory = 'ladies', compact = false }: GlobalLocationSearchProps) {
  const navigate = useNavigate();
  const { lang, t, option } = useI18n();
  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const [country, setCountry] = useState(normalizeCountry(initialCountry) || 'DE');
  const [city, setCity] = useState(initialCity || getCitiesForCountry(country)[0] || 'Berlin');
  const [category, setCategory] = useState(normalizeCategoryKey(initialCategory) || 'ladies');
  const [placeQuery, setPlaceQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Array<{ place_id: string; description: string }>>([]);
  const [busy, setBusy] = useState(false);
  const serviceNode = useRef<HTMLDivElement | null>(null);
  const cities = useMemo(() => getCitiesForCountry(country), [country]);

  useEffect(() => {
    const nextCountry = normalizeCountry(initialCountry) || 'DE';
    setCountry(nextCountry);
    setCity(initialCity || getCitiesForCountry(nextCountry)[0] || 'Berlin');
  }, [initialCountry, initialCity]);

  useEffect(() => {
    setCategory(normalizeCategoryKey(initialCategory) || 'ladies');
  }, [initialCategory]);

  function navigateToCity(nextCity = city, nextCountry = country, nextCategory = category) {
    const slug = citySlug(nextCity || getCitiesForCountry(nextCountry)[0] || 'Berlin');
    const params = new URLSearchParams();
    params.set('country', nextCountry);
    if (nextCategory) params.set('category', nextCategory);
    navigate(`/city/${slug}?${params.toString()}`);
  }

  function submit() {
    navigateToCity();
  }

  async function searchPlace() {
    if (!googleKey || !placeQuery.trim()) return;
    setBusy(true);
    try {
      const google = await loadPlaces(googleKey);
      const service = new google.maps.places.AutocompleteService();
      service.getPlacePredictions({ input: placeQuery, types: ['(regions)'] }, (predictions: any[], status: string) => {
        setBusy(false);
        setSuggestions(status === google.maps.places.PlacesServiceStatus.OK && predictions ? predictions : []);
      });
    } catch {
      setBusy(false);
      setSuggestions([]);
    }
  }

  async function selectPlace(placeId: string) {
    if (!googleKey || !serviceNode.current) return;
    setBusy(true);
    try {
      const google = await loadPlaces(googleKey);
      const service = new google.maps.places.PlacesService(serviceNode.current);
      service.getDetails({ placeId, fields: ['address_components', 'formatted_address', 'geometry'] }, (place: any, status: string) => {
        setBusy(false);
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;
        const components = Array.isArray(place.address_components) ? place.address_components : [];
        const byType = (type: string, short = false) => components.find((item: any) => item.types?.includes(type))?.[short ? 'short_name' : 'long_name'] || '';
        const nextCountry = normalizeCountry(byType('country', true) || byType('country')) || country;
        const nextCity = byType('locality') || byType('postal_town') || byType('administrative_area_level_2') || city;
        setCountry(nextCountry);
        setCity(nextCity);
        setPlaceQuery(place.formatted_address || nextCity);
        setSuggestions([]);
      });
    } catch {
      setBusy(false);
    }
  }

  return (
    <section className={compact ? 'global-search compact' : 'global-search'}>
      <div ref={serviceNode} hidden />
      <div className="section-head compact">
        <div>
          <p className="eyebrow">{t('search.searchAds')}</p>
          <h2>{t('search.searchAds')}</h2>
        </div>
      </div>
      {googleKey ? (
        <div className="global-search-place">
          <input value={placeQuery} placeholder={t('location.searchAddressOrPlace')} onChange={(event) => setPlaceQuery(event.target.value)} />
          <button className="button" type="button" disabled={busy} onClick={searchPlace}>{busy ? t('states.loading') : t('search.search')}</button>
          {suggestions.length ? <div className="place-suggestions">{suggestions.map((item) => <button key={item.place_id} type="button" onClick={() => selectPlace(item.place_id)}>{item.description}</button>)}</div> : null}
        </div>
      ) : null}
      <div className="global-search-grid">
        <label><span>{t('search.country')}</span><select value={country} onChange={(event) => {
          const nextCountry = event.target.value;
          setCountry(nextCountry);
          setCity(getCitiesForCountry(nextCountry)[0] || '');
        }}>{globalCountries.map((item) => <option key={item.code} value={item.code}>{getCountryLabel(item.code, lang)}</option>)}</select></label>
        <label><span>{t('search.city')}</span><select value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>{t('form.category')}</span><select value={category} onChange={(event) => setCategory(normalizeCategoryKey(event.target.value) || 'ladies')}>{categoryOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}</select></label>
        <button className="button primary" type="button" onClick={submit}><Search size={16} /> {t('search.search')}</button>
      </div>
      <div className="popular-city-row">
        <span>{t('search.popularCities')}</span>
        {cities.slice(0, 8).map((item) => <button type="button" key={item} onClick={() => {
          setCity(item);
          navigateToCity(item);
        }}>{item}</button>)}
      </div>
    </section>
  );
}
