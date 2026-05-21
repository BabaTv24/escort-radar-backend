import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile, Tag } from '../types';
import { ProfileCard } from '../components/ProfileCard';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { cities } from '../data/cities';
import { getDemoProfiles } from '../data/demoProfiles';
import {
  audienceOptions,
  bodyTypeOptions,
  categoryOptions,
  defaultServiceMenuNames,
  hairColorOptions,
  orientationOptions,
  originOptions,
  paymentMethodOptions,
  serviceTagOptions,
  toggleArrayValue,
  visitTypeOptions
} from '../data/filterOptions';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import type { GeoPoint } from '../lib/geo';
import { getCityCenter, getSearcherLocationWithFallback, isProfileInRadarRange } from '../lib/geo';

type SearchFilters = {
  city: string;
  area: string;
  category: string;
  available_now: boolean;
  mobile_service: boolean;
  private_studio: boolean;
  verified: boolean;
  availability_status: string;
  radius: number;
  body_type: string;
  hair_color: string;
  origin: string;
  age_from: string;
  age_to: string;
  height_from: string;
  height_to: string;
  languages: string;
  price_max: string;
  orientation: string;
  audience: string[];
  visit_types: string[];
  service_tags: string[];
  tag_ids: string[];
  services: string[];
  payment_methods: string[];
};

function defaultFilters(city: string): SearchFilters {
  return {
    city,
    area: '',
    category: '',
    available_now: false,
    mobile_service: false,
    private_studio: false,
    verified: false,
    availability_status: 'all',
    radius: 25,
    body_type: '',
    hair_color: '',
    origin: '',
    age_from: '',
    age_to: '',
    height_from: '',
    height_to: '',
    languages: '',
    price_max: '',
    orientation: '',
    audience: [],
    visit_types: [],
    service_tags: [],
    tag_ids: [],
    services: [],
    payment_methods: []
  };
}

export function CityPage() {
  const { city = 'berlin' } = useParams();
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get('category');
  const cityLabel = cities.find((item) => item.slug === city)?.name || city;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [platformTags, setPlatformTags] = useState<Tag[]>([]);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => defaultFilters(city));
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => defaultFilters(city));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searcherLocation, setSearcherLocation] = useState<GeoPoint>(() => ({ ...getCityCenter(city), source: 'city_fallback' }));
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const { t, option } = useI18n();

  useEffect(() => {
    api.tags().then((data) => setPlatformTags(data.tags)).catch(() => setPlatformTags([]));
  }, []);

  useEffect(() => {
    const next = defaultFilters(city);
    if (urlCategory && categoryOptions.includes(urlCategory)) next.category = urlCategory;
    setDraftFilters(next);
    setAppliedFilters(next);
    setSearcherLocation({ ...getCityCenter(city), source: 'city_fallback' });
  }, [city, urlCategory]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const key of ['category', 'available_now', 'mobile_service', 'private_studio', 'verified'] as const) {
      const value = appliedFilters[key];
    if (value) params.set(key, String(value));
    }
    if (appliedFilters.tag_ids.length) params.set('tags', appliedFilters.tag_ids.join(','));
    return `?${params.toString()}`;
  }, [city, appliedFilters]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.profiles(query)
      .then((data) => setProfiles(applyFilters(data.profiles.length ? data.profiles : getDemoProfiles(), appliedFilters, searcherLocation)))
      .catch(() => setProfiles(applyFilters(getDemoProfiles(), appliedFilters, searcherLocation)))
      .finally(() => setLoading(false));
  }, [query, appliedFilters, searcherLocation]);

  function updateFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function updateRadarFilter<K extends 'radius' | 'availability_status'>(key: K, value: SearchFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
    setAppliedFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    const next = defaultFilters(city);
    setDraftFilters(next);
    setAppliedFilters(next);
  }

  async function useLocation() {
    const location = await getSearcherLocationWithFallback(appliedFilters.city);
    setSearcherLocation(location);
    setFallbackNotice(location.source === 'city_fallback');
  }

  return (
    <div className="page city-page">
      <section className="city-hero">
        <p className="eyebrow">{t('city.eyebrow')}</p>
        <h1>{cityLabel}</h1>
        <p>{t('city.copy')}</p>
        {appliedFilters.category && <div className="active-category-badge">{option(appliedFilters.category)}</div>}
        <div className="hero-actions">
          <a href="#profiles" className="button primary">{t('buttons.viewProfile')}</a>
          <Link to="/dashboard" className="button">{t('buttons.addListing')}</Link>
        </div>
      </section>

      <RadarPanel
        profiles={getDemoProfiles()}
        radius={draftFilters.radius}
        status={draftFilters.availability_status}
        city={appliedFilters.city}
        onRadiusChange={(value) => updateRadarFilter('radius', value)}
        onStatusChange={(value) => updateRadarFilter('availability_status', value)}
        searcherLocation={searcherLocation}
        onUseLocation={useLocation}
        fallbackNotice={fallbackNotice}
      />

      <section className="filter-panel">
        <div className="filter-panel-head">
          <div>
            <p className="eyebrow">{t('city.search')}</p>
            <h2>{t('city.advanced')}</h2>
          </div>
          <button className="button" type="button" onClick={() => setShowAdvanced((value) => !value)}>
            <SlidersHorizontal size={17} /> {showAdvanced ? t('buttons.hideAdvanced') : t('buttons.showAdvanced')}
          </button>
        </div>

        <div className="category-chips category-chips-prominent">
          <button className={draftFilters.category === '' ? 'chip selected' : 'chip'} type="button" onClick={() => updateFilter('category', '')}>{t('filters.allCategories')}</button>
          {categoryOptions.map((item) => (
            <button key={item} className={draftFilters.category === item ? 'chip selected' : 'chip'} type="button" onClick={() => updateFilter('category', item)}>
              {option(item)}
            </button>
          ))}
        </div>

        <div className="filters primary-filters">
          <select value={draftFilters.city} onChange={(event) => updateFilter('city', event.target.value)}>
            {cities.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <input placeholder={t('filters.area')} value={draftFilters.area} onChange={(event) => updateFilter('area', event.target.value)} />
          <select value={draftFilters.category} onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="">{t('filters.allCategories')}</option>
            {categoryOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
          </select>
          {(['available_now', 'mobile_service', 'private_studio', 'verified'] as const).map((key) => (
            <label key={key}>
              <input type="checkbox" checked={Boolean(draftFilters[key])} onChange={(event) => updateFilter(key, event.target.checked)} />
              {t(`badges.${key === 'available_now' ? 'availableNow' : key === 'mobile_service' ? 'mobile' : key === 'private_studio' ? 'private' : 'verified'}`)}
            </label>
          ))}
          <select value={draftFilters.availability_status} onChange={(event) => updateFilter('availability_status', event.target.value)}>
            <option value="all">{t('status.all')}</option>
            <option value="available">{t('status.available')}</option>
            <option value="busy">{t('status.busy')}</option>
            <option value="unavailable">{t('status.unavailable')}</option>
          </select>
        </div>

        <div className={showAdvanced ? 'advanced-filters open' : 'advanced-filters'}>
          <div className="range-grid">
            <input type="number" placeholder={t('filters.ageFrom')} value={draftFilters.age_from} onChange={(event) => updateFilter('age_from', event.target.value)} />
            <input type="number" placeholder={t('filters.ageTo')} value={draftFilters.age_to} onChange={(event) => updateFilter('age_to', event.target.value)} />
            <input type="number" placeholder={t('filters.heightFrom')} value={draftFilters.height_from} onChange={(event) => updateFilter('height_from', event.target.value)} />
            <input type="number" placeholder={t('filters.heightTo')} value={draftFilters.height_to} onChange={(event) => updateFilter('height_to', event.target.value)} />
          </div>
          <div className="range-grid">
            <input placeholder={t('filters.languages')} value={draftFilters.languages} onChange={(event) => updateFilter('languages', event.target.value)} />
            <select value={draftFilters.orientation} onChange={(event) => updateFilter('orientation', event.target.value)}>
              <option value="">{t('filters.anyOrientation')}</option>
              {orientationOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
          </div>
          <MultiSelect title={t('filters.audience')} values={draftFilters.audience} options={audienceOptions} onToggle={(value) => updateFilter('audience', toggleArrayValue(draftFilters.audience, value))} />
          <MultiSelect title={t('filters.visitType')} values={draftFilters.visit_types} options={visitTypeOptions} onToggle={(value) => updateFilter('visit_types', toggleArrayValue(draftFilters.visit_types, value))} />
          <div className="range-grid">
            <select value={draftFilters.body_type} onChange={(event) => updateFilter('body_type', event.target.value)}>
              <option value="">{t('filters.anyBodyType')}</option>
              {bodyTypeOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
            <select value={draftFilters.hair_color} onChange={(event) => updateFilter('hair_color', event.target.value)}>
              <option value="">{t('filters.anyHairColor')}</option>
              {hairColorOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
            <select value={draftFilters.origin} onChange={(event) => updateFilter('origin', event.target.value)}>
              <option value="">{t('filters.anyOrigin')}</option>
              {originOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
            <input type="number" placeholder={t('filters.priceMax')} value={draftFilters.price_max} onChange={(event) => updateFilter('price_max', event.target.value)} />
          </div>
          <MultiSelect title={t('filters.services')} values={draftFilters.services} options={defaultServiceMenuNames} onToggle={(value) => updateFilter('services', toggleArrayValue(draftFilters.services, value))} />
          <MultiSelect title={t('filters.serviceTags')} values={draftFilters.service_tags} options={serviceTagOptions} onToggle={(value) => updateFilter('service_tags', toggleArrayValue(draftFilters.service_tags, value))} />
          <TagSelect title={t('tags.title')} tags={platformTags} values={draftFilters.tag_ids} onToggle={(value) => updateFilter('tag_ids', toggleArrayValue(draftFilters.tag_ids, value))} />
          <MultiSelect title={t('filters.paymentMethods')} values={draftFilters.payment_methods} options={paymentMethodOptions} onToggle={(value) => updateFilter('payment_methods', toggleArrayValue(draftFilters.payment_methods, value))} />
        </div>

        <div className="filter-actions">
          <button className="button primary" type="button" onClick={() => setAppliedFilters(draftFilters)}>{t('buttons.apply')}</button>
          <button className="button" type="button" onClick={resetFilters}>{t('buttons.reset')}</button>
          <span>{t('radar.inRange', { count: profiles.length })}</span>
        </div>
      </section>

      <p className="demo-note">{t('home.demo')}</p>
      <p className="safety-line">{t('city.safety')}</p>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && (
        <div id="profiles" className="cards-grid marketplace-grid">
          {profiles.length ? profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />) : <div className="state-panel">{t('states.noProfiles')}</div>}
        </div>
      )}
    </div>
  );
}

function MultiSelect({ title, values, options, onToggle }: { title: string; values: string[]; options: string[]; onToggle: (value: string) => void }) {
  const { option: translateOption } = useI18n();
  return (
    <fieldset className="chip-fieldset">
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.map((item) => (
          <button key={item} className={values.includes(item) ? 'chip selected' : 'chip'} type="button" onClick={() => onToggle(item)}>
            {translateOption(item)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TagSelect({ title, values, tags, onToggle }: { title: string; values: string[]; tags: Tag[]; onToggle: (value: string) => void }) {
  return (
    <fieldset className="chip-fieldset premium-tag-picker">
      <legend>{title}</legend>
      <div className="chip-grid">
        {tags.map((tag) => (
          <button key={tag.id} className={values.includes(tag.id) ? 'chip selected neon' : 'chip neon'} type="button" onClick={() => onToggle(tag.id)}>
            {tag.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function applyFilters(profiles: Profile[], filters: SearchFilters, searcherLocation: GeoPoint) {
  const languageTokens = filters.languages.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const fromAge = Number(filters.age_from) || 0;
  const toAge = Number(filters.age_to) || 999;
  const fromHeight = Number(filters.height_from) || 0;
  const toHeight = Number(filters.height_to) || 999;
  const priceMax = Number(filters.price_max) || 0;

  return profiles.filter((profile) => {
    if (filters.city && profile.city !== filters.city) {
      const centerRange = isProfileInRadarRange(profile, searcherLocation, filters.radius);
      if (!centerRange.inRange) return false;
    }
    if (filters.area && !profile.area?.toLowerCase().includes(filters.area.toLowerCase())) return false;
    if (filters.category && profile.category !== filters.category) return false;
    if (filters.available_now && !profile.available_now) return false;
    if (filters.mobile_service && !profile.mobile_service) return false;
    if (filters.private_studio && !profile.private_studio) return false;
    if (filters.verified && !profile.verified) return false;
    if (filters.availability_status !== 'all' && profile.availability_status !== filters.availability_status) return false;
    const radarRange = isProfileInRadarRange(profile, searcherLocation, filters.radius);
    if (!radarRange.inRange) return false;
    profile.distance_km = radarRange.distance_km;
    if (filters.body_type && profile.body_type !== filters.body_type) return false;
    if (filters.hair_color && profile.hair_color !== filters.hair_color) return false;
    if (filters.origin && profile.origin !== filters.origin) return false;
    if (profile.age && (profile.age < fromAge || profile.age > toAge)) return false;
    if (profile.height && (profile.height < fromHeight || profile.height > toHeight)) return false;
    if (priceMax && profile.price_1h && profile.price_1h > priceMax) return false;
    if (languageTokens.length && !languageTokens.some((token) => profile.languages.some((language) => language.toLowerCase().includes(token)))) return false;
    if (filters.orientation && profile.orientation !== filters.orientation) return false;
    if (filters.audience.length && !filters.audience.some((item) => profile.audience?.includes(item))) return false;
    if (filters.visit_types.length && !filters.visit_types.some((item) => profile.visit_types?.includes(item))) return false;
    if (filters.services.length && !filters.services.some((item) => profile.service_menu?.some((service) => service.enabled && service.name === item))) return false;
    if (filters.service_tags.length && !filters.service_tags.some((item) => profile.service_tags?.includes(item))) return false;
    if (filters.tag_ids.length && !filters.tag_ids.some((item) => profile.tag_ids?.includes(item))) return false;
    if (filters.payment_methods.length && !filters.payment_methods.some((item) => profile.payment_methods?.includes(item))) return false;
    return true;
  });
}
