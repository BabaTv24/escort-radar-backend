import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { RadioTower, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile, Tag } from '../types';
import { ProfileCard } from '../components/ProfileCard';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { cities } from '../data/cities';
import { getDemoProfiles } from '../data/demoProfiles';
import { categoryOptions, defaultServiceMenuNames, toggleArrayValue, visitTypeOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import type { GeoPoint } from '../lib/geo';
import { getCityCenter, getSearcherLocationWithFallback, isProfileInRadarRange } from '../lib/geo';

type SearchFilters = {
  city: string;
  category: string;
  availability_status: string;
  radius: number;
  price_max: string;
  visit_types: string[];
  service_tags: string[];
  tag_ids: string[];
  services: string[];
  service_search: string;
};

function defaultFilters(city: string): SearchFilters {
  return {
    city,
    category: '',
    availability_status: 'all',
    radius: 25,
    price_max: '',
    visit_types: [],
    service_tags: [],
    tag_ids: [],
    services: [],
    service_search: ''
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'best' | 'new' | 'near' | 'online'>('best');
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
    if (appliedFilters.category) params.set('category', appliedFilters.category);
    if (appliedFilters.tag_ids.length) params.set('tags', appliedFilters.tag_ids.join(','));
    return `?${params.toString()}`;
  }, [appliedFilters.category, appliedFilters.tag_ids]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.profiles(query)
      .then((data) => {
        const sourceProfiles = data.profiles.length ? data.profiles : getDemoProfiles(appliedFilters.city);
        setProfiles(applyFilters(sourceProfiles, appliedFilters, searcherLocation));
      })
      .catch(() => setProfiles(applyFilters(getDemoProfiles(appliedFilters.city), appliedFilters, searcherLocation)))
      .finally(() => setLoading(false));
  }, [query, appliedFilters, searcherLocation]);

  const sortedProfiles = useMemo(() => sortProfiles(profiles, sortMode), [profiles, sortMode]);
  const topProfiles = sortedProfiles.slice(0, 12);
  const onlineCount = sortedProfiles.filter((profile) => getOperatorStatus(profile) === 'ONLINE_NOW' || profile.available_now).length;
  const availableTodayCount = sortedProfiles.filter((profile) => ['ONLINE_NOW', 'AVAILABLE_TODAY'].includes(getOperatorStatus(profile)) || profile.availability_status === 'available').length;

  function updateFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function updateRadarFilter<K extends 'radius' | 'availability_status'>(key: K, value: SearchFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
    setAppliedFilters((current) => ({ ...current, [key]: value }));
  }

  function applyDraftFilters() {
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
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

  function renderFilters(mode: 'desktop' | 'mobile') {
    return (
      <section className={`filter-panel marketplace-filter-panel ${mode === 'mobile' ? 'mobile' : ''}`}>
        <div className="filter-panel-head">
          <div>
            <p className="eyebrow">Curated search</p>
            <h2>Filters</h2>
          </div>
          {mode === 'mobile' ? (
            <button className="button" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
              <X size={17} />
            </button>
          ) : null}
        </div>

        <div className="premium-filter-group">
          <span>Radius</span>
          <div className="segmented-pills">
            {[5, 10, 25, 50, 100].map((radius) => (
              <button key={radius} className={draftFilters.radius === radius ? 'selected' : ''} type="button" onClick={() => updateRadarFilter('radius', radius)}>
                {radius} km
              </button>
            ))}
          </div>
        </div>

        <label className="premium-field compact-field">
          <span>Status</span>
          <select value={draftFilters.availability_status} onChange={(event) => updateRadarFilter('availability_status', event.target.value)}>
            <option value="all">{t('status.all')}</option>
            <option value="available">{t('status.available')}</option>
            <option value="busy">{t('status.busy')}</option>
            <option value="unavailable">{t('status.unavailable')}</option>
          </select>
        </label>

        <label className="premium-field compact-field">
          <span>Category</span>
          <select value={draftFilters.category} onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="">{t('filters.allCategories')}</option>
            {categoryOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
          </select>
        </label>

        <label className="premium-field compact-field">
          <span>Price</span>
          <input type="number" placeholder={t('filters.priceMax')} value={draftFilters.price_max} onChange={(event) => updateFilter('price_max', event.target.value)} />
        </label>

        <MultiSelect title={t('filters.visitType')} values={draftFilters.visit_types} options={visitTypeOptions} onToggle={(value) => updateFilter('visit_types', toggleArrayValue(draftFilters.visit_types, value))} />

        <ServiceSelect
          search={draftFilters.service_search}
          selectedCount={draftFilters.services.length + draftFilters.service_tags.length + draftFilters.tag_ids.length}
          values={draftFilters.services}
          options={defaultServiceMenuNames}
          onSearch={(value) => updateFilter('service_search', value)}
          onToggle={(value) => updateFilter('services', toggleArrayValue(draftFilters.services, value))}
        />

        <button className="button ghost more-filter-button" type="button" onClick={() => setShowAdvanced((value) => !value)}>
          <SlidersHorizontal size={17} /> More filters
        </button>

        <div className={showAdvanced ? 'advanced-filters open compact-advanced-filters' : 'advanced-filters compact-advanced-filters'}>
          <MultiSelect title={t('filters.serviceTags')} values={draftFilters.service_tags} options={[]} onToggle={(value) => updateFilter('service_tags', toggleArrayValue(draftFilters.service_tags, value))} />
          <TagSelect title={t('tags.title')} tags={platformTags} values={draftFilters.tag_ids} onToggle={(value) => updateFilter('tag_ids', toggleArrayValue(draftFilters.tag_ids, value))} />
        </div>

        <div className="filter-actions">
          <button className="button primary" type="button" onClick={applyDraftFilters}>{t('buttons.apply')}</button>
          <button className="button" type="button" onClick={resetFilters}>{t('buttons.reset')}</button>
          <span>{sortedProfiles.length} in range</span>
        </div>
      </section>
    );
  }

  return (
    <div className="page city-page luxury-city-page">
      <section className="city-hero compact-city-hero">
        <div>
          <p className="eyebrow">{t('city.eyebrow')}</p>
          <h1>{cityLabel}</h1>
          {appliedFilters.category && <div className="active-category-badge">{option(appliedFilters.category)}</div>}
        </div>
        <div className="city-hero-stats">
          <span><strong>{sortedProfiles.length}</strong> Active profiles</span>
          <span><strong>{onlineCount}</strong> Online now</span>
          <span><strong>{availableTodayCount}</strong> Available today</span>
        </div>
        <div className="hero-actions">
          <a href="#city-radar" className="button primary"><RadioTower size={17} /> Open radar</a>
          <Link to="/dashboard" className="button">{t('buttons.addListing')}</Link>
        </div>
      </section>

      <section className="top-escorts-strip marketplace-avatar-strip">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Top profiles</p>
            <h2>{cityLabel} Radar Select</h2>
          </div>
          <button className="button mobile-filter-trigger" type="button" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={17} /> Filter
          </button>
        </div>
        <div className="avatar-carousel">
          {topProfiles.length ? topProfiles.map((profile) => {
            const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
            const statusClass = getStatusClass(profile);
            return (
              <Link to={`/profile/${profile.id}`} className={`top-avatar ${statusClass}`} key={profile.id}>
                {image?.public_url ? <img src={image.public_url} alt="" /> : <span>{getInitials(profile.display_name)}</span>}
                <strong>{profile.display_name}</strong>
                <small>{getOperatorStatus(profile).replaceAll('_', ' ')}</small>
              </Link>
            );
          }) : <p className="muted">Premium profiles appear here when available.</p>}
        </div>
      </section>

      <section id="city-radar" className="compact-radar-wrap">
        <RadarPanel
          profiles={sortedProfiles}
          radius={draftFilters.radius}
          status={draftFilters.availability_status}
          city={appliedFilters.city}
          onRadiusChange={(value) => updateRadarFilter('radius', value)}
          onStatusChange={(value) => updateRadarFilter('availability_status', value)}
          searcherLocation={searcherLocation}
          onUseLocation={useLocation}
          fallbackNotice={fallbackNotice}
        />
      </section>

      <section className="premium-marketplace-layout">
        <aside className="desktop-filter-rail">
          {renderFilters('desktop')}
        </aside>
        <div className="listing-main">
          <div className="listing-toolbar">
            <div>
              <p className="eyebrow">{sortedProfiles.length === 1 ? `1 profile near ${cityLabel}` : 'Profiles near you'}</p>
              <h2>{sortedProfiles.length ? `${sortedProfiles.length} marketplace profiles` : `No profiles near ${cityLabel}`}</h2>
            </div>
            <div className="sort-tabs" aria-label="Sort profiles">
              {[
                ['best', 'Best'],
                ['new', 'New'],
                ['near', 'Near'],
                ['online', 'Online']
              ].map(([key, label]) => (
                <button key={key} className={sortMode === key ? 'selected' : ''} type="button" onClick={() => setSortMode(key as typeof sortMode)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading && <LoadingState />}
          {error && <ErrorState message={error} />}
          {!loading && !error && (
            sortedProfiles.length ? (
              <>
                <div id="profiles" className={`cards-grid marketplace-grid premium-profile-grid ${sortedProfiles.length === 1 ? 'single-result-grid' : ''}`}>
                  {sortedProfiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />)}
                </div>
                {sortedProfiles.length === 1 && (
                  <div className="premium-empty-state invite-empty-state">
                    <RadioTower size={32} />
                    <h2>Be one of the first profiles in {cityLabel}</h2>
                    <p>Berlin-style premium visibility is ready here as soon as more verified advertisers join.</p>
                    <Link className="button primary" to="/dashboard">Add listing</Link>
                  </div>
                )}
              </>
            ) : (
              <div className="premium-empty-state">
                <RadioTower size={34} />
                <h2>No profiles found in this area.</h2>
                <p>Try expanding your radius or changing availability filters.</p>
                <button className="button primary" type="button" onClick={() => updateRadarFilter('radius', Math.min(draftFilters.radius + 25, 100))}>Increase radius</button>
              </div>
            )
          )}
        </div>
      </section>

      <div className={filtersOpen ? 'mobile-filter-sheet open' : 'mobile-filter-sheet'} role="dialog" aria-modal="true" aria-label="Profile filters">
        <button className="mobile-filter-backdrop" type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
        <div className="mobile-filter-panel">
          {renderFilters('mobile')}
        </div>
      </div>
    </div>
  );
}

function MultiSelect({ title, values, options, onToggle }: { title: string; values: string[]; options: string[]; onToggle: (value: string) => void }) {
  const { option: translateOption } = useI18n();
  if (!options.length) return null;
  return (
    <fieldset className="chip-fieldset">
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.slice(0, 10).map((item) => (
          <button key={item} className={values.includes(item) ? 'chip selected' : 'chip'} type="button" onClick={() => onToggle(item)}>
            {translateOption(item)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ServiceSelect({ search, selectedCount, values, options, onSearch, onToggle }: { search: string; selectedCount: number; values: string[]; options: string[]; onSearch: (value: string) => void; onToggle: (value: string) => void }) {
  const { t, option: translateOption } = useI18n();
  const filteredOptions = options.filter((item) => translateOption(item).toLowerCase().includes(search.toLowerCase())).slice(0, 10);

  return (
    <fieldset className="chip-fieldset service-search-filter">
      <legend>{t('filters.services')} {selectedCount ? `(${selectedCount})` : ''}</legend>
      <label className="service-search-input" aria-label={t('filters.services')}>
        <Search size={15} />
        <input value={search} placeholder="Search services" onChange={(event) => onSearch(event.target.value)} />
      </label>
      <div className="chip-grid">
        {filteredOptions.map((item) => (
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
        {tags.slice(0, 10).map((tag) => (
          <button key={tag.id} className={values.includes(tag.id) ? 'chip selected' : 'chip'} type="button" onClick={() => onToggle(tag.id)}>
            {tag.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function applyFilters(profiles: Profile[], filters: SearchFilters, searcherLocation: GeoPoint) {
  const priceMax = Number(filters.price_max) || 0;

  return profiles.filter((profile) => {
    if (filters.city && !profileMatchesCity(profile, filters.city)) {
      const centerRange = isProfileInRadarRange(profile, searcherLocation, filters.radius);
      if (!centerRange.inRange) return false;
    }
    if (filters.category && profile.category !== filters.category) return false;
    if (filters.availability_status !== 'all' && profile.availability_status !== filters.availability_status) return false;
    const radarRange = isProfileInRadarRange(profile, searcherLocation, filters.radius);
    if (!radarRange.inRange) return false;
    profile.distance_km = radarRange.distance_km;
    if (priceMax && profile.price_1h && profile.price_1h > priceMax) return false;
    if (filters.visit_types.length && !filters.visit_types.some((item) => profile.visit_types?.includes(item))) return false;
    if (filters.services.length && !filters.services.some((item) => profile.service_menu?.some((service) => service.enabled && service.name === item))) return false;
    if (filters.service_tags.length && !filters.service_tags.some((item) => profile.service_tags?.includes(item))) return false;
    if (filters.tag_ids.length && !filters.tag_ids.some((item) => profile.tag_ids?.includes(item))) return false;
    return true;
  });
}

function sortProfiles(profiles: Profile[], sortMode: 'best' | 'new' | 'near' | 'online') {
  const copy = [...profiles];
  if (sortMode === 'online') {
    return copy.sort((left, right) => Number(right.available_now) - Number(left.available_now));
  }
  if (sortMode === 'near') {
    return copy.sort((left, right) => Number(left.distance_km || 999) - Number(right.distance_km || 999));
  }
  if (sortMode === 'new') {
    return copy.sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());
  }
  return copy.sort((left, right) => {
    const leftScore = Number(left.radar_score || 0) || Number(left.verified) * 3 + Number(left.available_now) * 2 + Number(Boolean(left.price_1h));
    const rightScore = Number(right.radar_score || 0) || Number(right.verified) * 3 + Number(right.available_now) * 2 + Number(Boolean(right.price_1h));
    return rightScore - leftScore;
  });
}

function profileMatchesCity(profile: Profile, city: string) {
  const label = cityName(city).toLowerCase();
  return profile.city === city
    || String(profile.work_city || '').toLowerCase() === label
    || String(profile.travel_city || '').toLowerCase() === label;
}

function cityName(slug: string) {
  const labels: Record<string, string> = {
    berlin: 'Berlin',
    hamburg: 'Hamburg',
    hannover: 'Hannover',
    koeln: 'Koeln',
    muenchen: 'Muenchen',
    warszawa: 'Warszawa'
  };
  return labels[slug] || slug;
}

function getOperatorStatus(profile: Profile) {
  return profile.operator_status || (profile.available_now ? 'ONLINE_NOW' : profile.availability_status === 'busy' ? 'BUSY' : 'OFFLINE');
}

function getStatusClass(profile: Profile) {
  const classes: Record<string, string> = {
    ONLINE_NOW: 'online-now',
    AVAILABLE_TODAY: 'available-today',
    BUSY: 'busy',
    APPOINTMENT_ONLY: 'appointment-only',
    TRAVELING: 'traveling',
    OFFLINE: 'offline'
  };
  return classes[getOperatorStatus(profile)] || 'offline';
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || 'P'}${parts[1]?.[0] || ''}`;
}
