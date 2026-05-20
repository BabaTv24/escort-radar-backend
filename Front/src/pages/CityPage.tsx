import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types';
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
    services: [],
    payment_methods: []
  };
}

export function CityPage() {
  const { city = 'berlin' } = useParams();
  const cityLabel = cities.find((item) => item.slug === city)?.name || city;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => defaultFilters(city));
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => defaultFilters(city));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t, option } = useI18n();

  useEffect(() => {
    const next = defaultFilters(city);
    setDraftFilters(next);
    setAppliedFilters(next);
  }, [city]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ city: appliedFilters.city || city });
    for (const key of ['category', 'available_now', 'mobile_service', 'private_studio', 'verified'] as const) {
      const value = appliedFilters[key];
      if (value) params.set(key, String(value));
    }
    return `?${params.toString()}`;
  }, [city, appliedFilters]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.profiles(query)
      .then((data) => setProfiles(applyFilters(data.profiles.length ? data.profiles : getDemoProfiles(appliedFilters.city), appliedFilters)))
      .catch(() => setProfiles(applyFilters(getDemoProfiles(appliedFilters.city), appliedFilters)))
      .finally(() => setLoading(false));
  }, [query, appliedFilters]);

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

  return (
    <div className="page city-page">
      <section className="city-hero">
        <p className="eyebrow">City radar</p>
        <h1>{cityLabel}</h1>
        <p>{t('city.copy')}</p>
        <div className="hero-actions">
          <a href="#profiles" className="button primary">Browse profiles</a>
          <Link to="/dashboard" className="button">{t('buttons.addListing')}</Link>
        </div>
      </section>

      <RadarPanel
        profiles={getDemoProfiles(appliedFilters.city)}
        radius={draftFilters.radius}
        status={draftFilters.availability_status}
        city={appliedFilters.city}
        onRadiusChange={(value) => updateRadarFilter('radius', value)}
        onStatusChange={(value) => updateRadarFilter('availability_status', value)}
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

        <div className="filters primary-filters">
          <select value={draftFilters.city} onChange={(event) => updateFilter('city', event.target.value)}>
            {cities.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <input placeholder="Area" value={draftFilters.area} onChange={(event) => updateFilter('area', event.target.value)} />
          <select value={draftFilters.category} onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="">All categories</option>
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
            <input type="number" placeholder="Age from" value={draftFilters.age_from} onChange={(event) => updateFilter('age_from', event.target.value)} />
            <input type="number" placeholder="Age to" value={draftFilters.age_to} onChange={(event) => updateFilter('age_to', event.target.value)} />
            <input type="number" placeholder="Height from" value={draftFilters.height_from} onChange={(event) => updateFilter('height_from', event.target.value)} />
            <input type="number" placeholder="Height to" value={draftFilters.height_to} onChange={(event) => updateFilter('height_to', event.target.value)} />
          </div>
          <div className="range-grid">
            <input placeholder="Languages, e.g. EN, DE, PL" value={draftFilters.languages} onChange={(event) => updateFilter('languages', event.target.value)} />
            <select value={draftFilters.orientation} onChange={(event) => updateFilter('orientation', event.target.value)}>
              <option value="">Any orientation</option>
              {orientationOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
          </div>
          <MultiSelect title="Audience" values={draftFilters.audience} options={audienceOptions} onToggle={(value) => updateFilter('audience', toggleArrayValue(draftFilters.audience, value))} />
          <MultiSelect title="Visit type" values={draftFilters.visit_types} options={visitTypeOptions} onToggle={(value) => updateFilter('visit_types', toggleArrayValue(draftFilters.visit_types, value))} />
          <div className="range-grid">
            <select value={draftFilters.body_type} onChange={(event) => updateFilter('body_type', event.target.value)}>
              <option value="">Any body type</option>
              {bodyTypeOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
            <select value={draftFilters.hair_color} onChange={(event) => updateFilter('hair_color', event.target.value)}>
              <option value="">Any hair color</option>
              {hairColorOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
            <select value={draftFilters.origin} onChange={(event) => updateFilter('origin', event.target.value)}>
              <option value="">Any origin</option>
              {originOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
            </select>
            <input type="number" placeholder="Max 1h price" value={draftFilters.price_max} onChange={(event) => updateFilter('price_max', event.target.value)} />
          </div>
          <MultiSelect title="Services" values={draftFilters.services} options={defaultServiceMenuNames} onToggle={(value) => updateFilter('services', toggleArrayValue(draftFilters.services, value))} />
          <MultiSelect title="Services tags" values={draftFilters.service_tags} options={serviceTagOptions} onToggle={(value) => updateFilter('service_tags', toggleArrayValue(draftFilters.service_tags, value))} />
          <MultiSelect title="Payment methods" values={draftFilters.payment_methods} options={paymentMethodOptions} onToggle={(value) => updateFilter('payment_methods', toggleArrayValue(draftFilters.payment_methods, value))} />
        </div>

        <div className="filter-actions">
          <button className="button primary" type="button" onClick={() => setAppliedFilters(draftFilters)}>{t('buttons.apply')}</button>
          <button className="button" type="button" onClick={resetFilters}>{t('buttons.reset')}</button>
          <span>{profiles.length} {t('city.results')}</span>
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

function applyFilters(profiles: Profile[], filters: SearchFilters) {
  const languageTokens = filters.languages.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  const fromAge = Number(filters.age_from) || 0;
  const toAge = Number(filters.age_to) || 999;
  const fromHeight = Number(filters.height_from) || 0;
  const toHeight = Number(filters.height_to) || 999;
  const priceMax = Number(filters.price_max) || 0;

  return profiles.filter((profile) => {
    if (filters.city && profile.city !== filters.city) return false;
    if (filters.area && !profile.area?.toLowerCase().includes(filters.area.toLowerCase())) return false;
    if (filters.category && profile.category !== filters.category) return false;
    if (filters.available_now && !profile.available_now) return false;
    if (filters.mobile_service && !profile.mobile_service) return false;
    if (filters.private_studio && !profile.private_studio) return false;
    if (filters.verified && !profile.verified) return false;
    if (filters.availability_status !== 'all' && profile.availability_status !== filters.availability_status) return false;
    if ((profile.distance_km ?? 999) > filters.radius) return false;
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
    if (filters.payment_methods.length && !filters.payment_methods.some((item) => profile.payment_methods?.includes(item))) return false;
    return true;
  });
}
