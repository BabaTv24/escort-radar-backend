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
  categoryOptions,
  labelize,
  orientationOptions,
  paymentMethodOptions,
  serviceTagOptions,
  toggleArrayValue,
  visitTypeOptions
} from '../data/filterOptions';

type SearchFilters = {
  city: string;
  area: string;
  category: string;
  available_now: boolean;
  mobile_service: boolean;
  private_studio: boolean;
  verified: boolean;
  age_from: string;
  age_to: string;
  height_from: string;
  height_to: string;
  languages: string;
  orientation: string;
  audience: string[];
  visit_types: string[];
  service_tags: string[];
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
    age_from: '',
    age_to: '',
    height_from: '',
    height_to: '',
    languages: '',
    orientation: '',
    audience: [],
    visit_types: [],
    service_tags: [],
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
        <p>Premium adult nightlife listings with clear availability, private profile badges, and moderation-first publishing.</p>
        <div className="hero-actions">
          <a href="#profiles" className="button primary">Browse profiles</a>
          <Link to="/dashboard" className="button">Add listing</Link>
        </div>
      </section>

      <section className="filter-panel">
        <div className="filter-panel-head">
          <div>
            <p className="eyebrow">Search</p>
            <h2>Advanced filters</h2>
          </div>
          <button className="button" type="button" onClick={() => setShowAdvanced((value) => !value)}>
            <SlidersHorizontal size={17} /> {showAdvanced ? 'Hide advanced filters' : 'Show advanced filters'}
          </button>
        </div>

        <div className="filters primary-filters">
          <select value={draftFilters.city} onChange={(event) => updateFilter('city', event.target.value)}>
            {cities.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select>
          <input placeholder="Area" value={draftFilters.area} onChange={(event) => updateFilter('area', event.target.value)} />
          <select value={draftFilters.category} onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="">All categories</option>
            {categoryOptions.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
          </select>
          {(['available_now', 'mobile_service', 'private_studio', 'verified'] as const).map((key) => (
            <label key={key}>
              <input type="checkbox" checked={Boolean(draftFilters[key])} onChange={(event) => updateFilter(key, event.target.checked)} />
              {labelize(key)}
            </label>
          ))}
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
              {orientationOptions.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
            </select>
          </div>
          <MultiSelect title="Audience" values={draftFilters.audience} options={audienceOptions} onToggle={(value) => updateFilter('audience', toggleArrayValue(draftFilters.audience, value))} />
          <MultiSelect title="Visit type" values={draftFilters.visit_types} options={visitTypeOptions} onToggle={(value) => updateFilter('visit_types', toggleArrayValue(draftFilters.visit_types, value))} />
          <MultiSelect title="Services tags" values={draftFilters.service_tags} options={serviceTagOptions} onToggle={(value) => updateFilter('service_tags', toggleArrayValue(draftFilters.service_tags, value))} />
          <MultiSelect title="Payment methods" values={draftFilters.payment_methods} options={paymentMethodOptions} onToggle={(value) => updateFilter('payment_methods', toggleArrayValue(draftFilters.payment_methods, value))} />
        </div>

        <div className="filter-actions">
          <button className="button primary" type="button" onClick={() => setAppliedFilters(draftFilters)}>Apply filters</button>
          <button className="button" type="button" onClick={resetFilters}>Reset filters</button>
          <span>{profiles.length} results</span>
        </div>
      </section>

      <p className="demo-note">Demo profiles are fictional until verified advertisers join.</p>
      <p className="safety-line">All listings must be 18+, consensual, verified, and compliant with local law.</p>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && (
        <div id="profiles" className="cards-grid marketplace-grid">
          {profiles.length ? profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />) : <div className="state-panel">No active profiles yet.</div>}
        </div>
      )}
    </div>
  );
}

function MultiSelect({ title, values, options, onToggle }: { title: string; values: string[]; options: string[]; onToggle: (value: string) => void }) {
  return (
    <fieldset className="chip-fieldset">
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.map((option) => (
          <button key={option} className={values.includes(option) ? 'chip selected' : 'chip'} type="button" onClick={() => onToggle(option)}>
            {labelize(option)}
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

  return profiles.filter((profile) => {
    if (filters.city && profile.city !== filters.city) return false;
    if (filters.area && !profile.area?.toLowerCase().includes(filters.area.toLowerCase())) return false;
    if (filters.category && profile.category !== filters.category) return false;
    if (filters.available_now && !profile.available_now) return false;
    if (filters.mobile_service && !profile.mobile_service) return false;
    if (filters.private_studio && !profile.private_studio) return false;
    if (filters.verified && !profile.verified) return false;
    if (profile.age && (profile.age < fromAge || profile.age > toAge)) return false;
    if (profile.height && (profile.height < fromHeight || profile.height > toHeight)) return false;
    if (languageTokens.length && !languageTokens.some((token) => profile.languages.some((language) => language.toLowerCase().includes(token)))) return false;
    if (filters.orientation && profile.orientation !== filters.orientation) return false;
    if (filters.audience.length && !filters.audience.some((item) => profile.audience?.includes(item))) return false;
    if (filters.visit_types.length && !filters.visit_types.some((item) => profile.visit_types?.includes(item))) return false;
    if (filters.service_tags.length && !filters.service_tags.some((item) => profile.service_tags?.includes(item))) return false;
    if (filters.payment_methods.length && !filters.payment_methods.some((item) => profile.payment_methods?.includes(item))) return false;
    return true;
  });
}
