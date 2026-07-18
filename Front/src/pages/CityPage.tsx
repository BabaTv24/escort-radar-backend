import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation as useRouterLocation, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LockKeyhole, RadioTower, Search, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile, Tag } from '../types';
import { ProfileCard } from '../components/ProfileCard';
import { EmptyState, ErrorState, LoadingState } from '../components/LoadingState';
import { activePublicCategoryOptions, categoryOptions, defaultServiceMenuNames, toggleArrayValue, visitTypeOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';
import { RadarPanel } from '../components/RadarPanel';
import type { GeoPoint } from '../lib/geo';
import { DEFAULT_RADAR_RADIUS_METERS, MAX_RADAR_RADIUS_METERS, MIN_RADAR_RADIUS_METERS, clearSavedSearchLocation, formatRadiusMeters, getCityCenter, getSearcherLocationWithFallback, isProfileInRadarRange, readSavedSearchLocation, resolveProfileRadarLocation, safeDistanceKm, saveSearchLocationToStorage } from '../lib/geo';
import { getPublicProfiles } from '../lib/publicProfiles';
import type { PublicProfilesMetrics } from '../lib/publicProfiles';
import { normalizeCategoryKey } from '../lib/categories';
import { GlobalLocationSearch } from '../components/GlobalLocationSearch';
import { getCityLabel, normalizeCity, normalizeCountry } from '../lib/globalLocations';
import { supabase } from '../lib/supabase';
import { Seo } from '../components/Seo';

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
    radius: DEFAULT_RADAR_RADIUS_METERS,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = searchParams.get('category');
  const diagnosticMode = searchParams.get('diagnostics') === '1';
  const urlCitySlug = normalizeCity(city) || 'berlin';
  const countryCode = normalizeCountry(searchParams.get('country')) || 'DE';
  const cityLabel = getCityLabel(urlCitySlug) || urlCitySlug;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [platformTags, setPlatformTags] = useState<Tag[]>([]);
  const [draftFilters, setDraftFilters] = useState<SearchFilters>(() => defaultFilters(urlCitySlug));
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(() => defaultFilters(urlCitySlug));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortMode, setSortMode] = useState<'best' | 'new' | 'near' | 'online'>('best');
  const [isMarketplaceCarouselPaused, setMarketplaceCarouselPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serverRadarMetrics, setServerRadarMetrics] = useState<PublicProfilesMetrics | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [searcherLocation, setSearcherLocation] = useState<GeoPoint>(() => readSavedSearchLocation() || ({ ...getCityCenter(urlCitySlug), source: 'city', label: cityLabel }));
  const [fallbackNotice, setFallbackNotice] = useState(false);
  const [favoriteProfileIds, setFavoriteProfileIds] = useState<Set<string>>(new Set());
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [hasClientSession, setHasClientSession] = useState(false);
  const [clientActivationState, setClientActivationState] = useState<'client_free' | 'client_activated'>('client_free');
  const marketplaceCarouselRef = useRef<HTMLDivElement | null>(null);
  const marketplacePauseTimeoutRef = useRef<number | null>(null);
  const location = useRouterLocation();
  const { t, option } = useI18n();

  useEffect(() => {
    api.tags().then((data) => setPlatformTags(data.tags)).catch(() => setPlatformTags([]));
  }, []);

  useEffect(() => {
    const next = defaultFilters(urlCitySlug);
    const normalizedCategory = normalizeCategoryKey(urlCategory);
    if (normalizedCategory && categoryOptions.includes(normalizedCategory)) next.category = normalizedCategory;
    setDraftFilters(next);
    setAppliedFilters(next);
    setProfiles([]);
    setSearcherLocation(readSavedSearchLocation() || { ...getCityCenter(urlCitySlug), source: 'city', label: cityLabel });
  }, [urlCitySlug, cityLabel, urlCategory, countryCode]);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      const accessToken = data.session?.access_token;
      if (!cancelled) setHasClientSession(Boolean(accessToken));
      if (!accessToken) {
        if (!cancelled) {
          setFavoriteProfileIds(new Set());
          setFavoritesLoaded(true);
          setClientActivationState('client_free');
        }
        const saved = readSavedSearchLocation();
        if (!cancelled && saved) {
          setSearcherLocation(saved);
          setFallbackNotice(false);
        }
        return;
      }
      try {
        const favoritesData = await api.myFavorites(accessToken);
        if (!cancelled) {
          setFavoriteProfileIds(new Set(favoritesData.favorites.map((favorite) => favorite.profile_id)));
          setFavoritesLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setFavoriteProfileIds(new Set());
          setFavoritesLoaded(true);
        }
      }
      try {
        const clientActivationData = await api.clientActivationMe(accessToken);
        if (!cancelled) setClientActivationState(clientActivationData.activation.state);
      } catch {
        if (!cancelled) setClientActivationState('client_free');
      }
      try {
        const { preferences } = await api.clientPreferences(accessToken);
        const lat = Number(preferences.client_search_lat);
        const lng = Number(preferences.client_search_lng);
        if (!cancelled && Number.isFinite(lat) && Number.isFinite(lng)) {
          setSearcherLocation({
            lat,
            lng,
            source: 'manual_saved',
            label: preferences.client_search_label || preferences.client_search_postal_code || cityLabel
          });
          setFallbackNotice(false);
        }
      } catch {
        const saved = readSavedSearchLocation();
        if (!cancelled && saved) {
          setSearcherLocation(saved);
          setFallbackNotice(false);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cityLabel]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('city', urlCitySlug);
    params.set('country', countryCode);
    params.set('radar', '1');
    if (diagnosticMode) params.set('diagnostics', '1');
    if (appliedFilters.category) params.set('category', appliedFilters.category);
    if (appliedFilters.tag_ids.length) params.set('tags', appliedFilters.tag_ids.join(','));
    return `?${params.toString()}`;
  }, [urlCitySlug, countryCode, appliedFilters.category, appliedFilters.tag_ids, diagnosticMode]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getPublicProfiles(query, { signal: controller.signal, onMetrics: setServerRadarMetrics })
      .then((publicProfiles) => {
        if (controller.signal.aborted) return;
        if (import.meta.env.DEV) {
          console.debug('[Category]', { raw: urlCategory, normalized: normalizeCategoryKey(urlCategory), urlCategory, selectedCategory: appliedFilters.category, profilesCount: publicProfiles.length });
        }
        setProfiles(publicProfiles);
      })
      .catch((reason) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) return;
        setProfiles([]);
        setError(reason instanceof Error ? reason.message : t('home.loadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [query, retryKey]);

  const filteredProfiles = useMemo(
    () => applyFilters(profiles, { ...appliedFilters, city: urlCitySlug }, searcherLocation),
    [profiles, appliedFilters, urlCitySlug, searcherLocation]
  );
  const statusFilteredProfiles = useMemo(
    () => draftFilters.availability_status === 'favorites'
      ? filteredProfiles.filter((profile) => favoriteProfileIds.has(profile.id))
      : filteredProfiles,
    [filteredProfiles, draftFilters.availability_status, favoriteProfileIds]
  );
  const sortedProfiles = useMemo(() => sortProfiles(statusFilteredProfiles, sortMode), [statusFilteredProfiles, sortMode]);
  const radarProfiles = useMemo(
    () => sortedProfiles.filter((profile) => getSearchRange(profile, searcherLocation, draftFilters.radius).inRange && matchesOperatorStatusFilter(profile, draftFilters.availability_status)),
    [sortedProfiles, searcherLocation, draftFilters.radius, draftFilters.availability_status]
  );
  const radarDiagnostics = useMemo(() => {
    const withLocation = profiles.filter((profile) => resolveProfileRadarLocation(profile));
    const inLocation = withLocation.filter((profile) => getSearchRange(profile, searcherLocation, draftFilters.radius).inRange);
    const afterStatus = inLocation.filter((profile) => matchesOperatorStatusFilter(profile, draftFilters.availability_status));
    return {
      publicCandidates: serverRadarMetrics?.candidates_public ?? profiles.length,
      inLocation: inLocation.length,
      missingLocation: serverRadarMetrics?.missing_location ?? profiles.length - withLocation.length,
      unpublished: serverRadarMetrics?.rejected_by_reason.unpublished || 0,
      moderationPending: serverRadarMetrics?.rejected_by_reason.not_approved || 0,
      excludedByFilters: inLocation.length - afterStatus.length
        + (serverRadarMetrics?.rejected_by_reason.inactive || 0)
        + (serverRadarMetrics?.rejected_by_reason.hidden_by_admin || 0)
    };
  }, [profiles, searcherLocation, draftFilters.radius, draftFilters.availability_status, serverRadarMetrics]);
  const topProfiles = sortedProfiles.slice(0, 12);
  const marketplaceCarouselProfiles = sortedProfiles.slice(0, 10);
  const onlineCount = sortedProfiles.filter((profile) => getOperatorStatus(profile) === 'ONLINE_NOW' || profile.available_now).length;
  const availableTodayCount = sortedProfiles.filter((profile) => ['ONLINE_NOW', 'AVAILABLE_TODAY'].includes(getOperatorStatus(profile)) || profile.availability_status === 'available').length;
  const categoryLabel = appliedFilters.category ? option(appliedFilters.category) : t('filters.allCategories');
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
  const isClientActivated = clientActivationState === 'client_activated';

  useEffect(() => {
    marketplaceCarouselRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [sortMode, appliedFilters, sortedProfiles.length]);

  useEffect(() => {
    return () => {
      if (marketplacePauseTimeoutRef.current) window.clearTimeout(marketplacePauseTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (marketplaceCarouselProfiles.length <= 1 || isMarketplaceCarouselPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      scrollMarketplace('next');
    }, 3000);
    return () => window.clearInterval(id);
  }, [isMarketplaceCarouselPaused, marketplaceCarouselProfiles.length]);

  if (import.meta.env.DEV) {
    console.debug('[CityPageProfiles]', {
      apiProfiles: profiles.length,
      listingProfiles: sortedProfiles.length,
      radarInputProfiles: sortedProfiles.length,
      radarProfiles: radarProfiles.length,
      favoriteProfiles: favoriteProfileIds.size,
      selectedRadius: formatRadiusMeters(draftFilters.radius),
      selectedCategory: appliedFilters.category,
      selectedCity: urlCitySlug,
      selectedCountry: countryCode,
      apiUrl: query
    });
  }

  function updateFilter<K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function updateRadarFilter<K extends 'radius' | 'availability_status'>(key: K, value: SearchFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
    setAppliedFilters((current) => ({ ...current, [key]: value }));
  }

  function getStatusSelectClass(status: string) {
    const variants: Record<string, string> = {
      all: 'status-select-all',
      favorites: 'status-select-favorites',
      online: 'status-select-online',
      BUSY: 'status-select-busy',
      OFFLINE: 'status-select-offline'
    };
    return `status-select ${variants[status] || 'status-select-all'}`;
  }

  function handleFavoriteChange(profileId: string) {
    setFavoriteProfileIds((current) => new Set([...current, profileId]));
  }

  function pauseMarketplaceTemporarily() {
    setMarketplaceCarouselPaused(true);
    if (marketplacePauseTimeoutRef.current) window.clearTimeout(marketplacePauseTimeoutRef.current);
    marketplacePauseTimeoutRef.current = window.setTimeout(() => setMarketplaceCarouselPaused(false), 15000);
  }

  function scrollMarketplace(direction: 'prev' | 'next') {
    const node = marketplaceCarouselRef.current;
    if (!node) return;
    const firstSlide = node.querySelector<HTMLElement>('.marketplace-carousel-slide');
    const slideWidth = firstSlide?.offsetWidth ?? 300;
    const gap = 18;
    const amount = slideWidth + gap;
    const maxScroll = node.scrollWidth - node.clientWidth;

    if (direction === 'next' && node.scrollLeft + amount >= maxScroll - 4) {
      node.scrollTo({ left: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }

    if (direction === 'prev' && node.scrollLeft <= 4) {
      node.scrollTo({ left: maxScroll, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }

    node.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }

  function goToPreviousMarketplaceSlide() {
    pauseMarketplaceTemporarily();
    scrollMarketplace('prev');
  }

  function goToNextMarketplaceSlide() {
    pauseMarketplaceTemporarily();
    scrollMarketplace('next');
  }

  function applyDraftFilters() {
    const canonicalCategory = normalizeCategoryKey(draftFilters.category);
    const next = { ...draftFilters, category: canonicalCategory };
    setAppliedFilters(next);
    const nextParams = new URLSearchParams(searchParams);
    if (canonicalCategory) nextParams.set('category', canonicalCategory);
    else nextParams.delete('category');
    setSearchParams(nextParams, { replace: false });
    setFiltersOpen(false);
  }

  function resetFilters() {
    const next = defaultFilters(urlCitySlug);
    setDraftFilters(next);
    setAppliedFilters(next);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('category');
    setSearchParams(nextParams, { replace: false });
  }

  async function useLocation() {
    const location = await getSearcherLocationWithFallback(urlCitySlug);
    setSearcherLocation(location);
    setFallbackNotice(location.source === 'city');
  }

  function setManualLocation(location: GeoPoint) {
    setSearcherLocation(location);
    setFallbackNotice(false);
    saveSearchLocationToStorage(location);
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      api.updateClientPreferences(accessToken, {
        client_search_country: countryCode,
        client_search_city: cityLabel,
        client_search_postal_code: location.label?.match(/\b\d{5}\b/)?.[0] || null,
        client_search_area: location.label || null,
        client_search_lat: location.lat,
        client_search_lng: location.lng,
        client_search_label: location.label || cityLabel
      }).catch(() => undefined);
    });
  }

  function clearManualLocation() {
    clearSavedSearchLocation();
    setSearcherLocation({ ...getCityCenter(urlCitySlug), source: 'city', label: cityLabel });
    setFallbackNotice(false);
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      api.clearClientSearchLocation(accessToken).catch(() => {
        api.updateClientPreferences(accessToken, {
          client_search_country: null,
          client_search_city: null,
          client_search_postal_code: null,
          client_search_area: null,
          client_search_lat: null,
          client_search_lng: null,
          client_search_label: null
        }).catch(() => undefined);
      });
    });
  }

  function renderFilters(mode: 'desktop' | 'mobile') {
    const advancedFiltersLocked = false;
    return (
      <section className={`filter-panel marketplace-filter-panel ${mode === 'mobile' ? 'mobile' : ''}`}>
        <div className="filter-panel-head">
          <div>
            <p className="eyebrow">{t('city.filtersEyebrow')}</p>
            <h2>{t('city.filtersTitle')}</h2>
          </div>
          {mode === 'mobile' ? (
            <button className="button" type="button" onClick={() => setFiltersOpen(false)} aria-label={t('city.closeFilters')}>
              <X size={17} />
            </button>
          ) : null}
        </div>

        <label className="radar-radius-slider premium-filter-group">
          <span className="radar-radius-slider-head">
            <span>{t('radar.radius')}</span>
            <strong>{formatRadiusMeters(draftFilters.radius)}</strong>
          </span>
          <input
            type="range"
            min={MIN_RADAR_RADIUS_METERS}
            max={MAX_RADAR_RADIUS_METERS}
            step={10}
            value={draftFilters.radius}
            onChange={(event) => updateRadarFilter('radius', Number(event.target.value))}
          />
        </label>

        <label className="premium-field compact-field">
          <span>{t('radar.status')}</span>
          <select
            className={getStatusSelectClass(draftFilters.availability_status)}
            value={draftFilters.availability_status}
            onChange={(event) => updateRadarFilter('availability_status', event.target.value)}
          >
            <option value="all">{t('status.all')}</option>
            <option value="favorites">{t('favorites.favoritesFilter')}</option>
            <option value="online">{t('status.onlineNow')}</option>
            <option value="BUSY">{t('status.busy')}</option>
            <option value="OFFLINE">{t('status.offline')}</option>
          </select>
        </label>

        <div className={advancedFiltersLocked ? 'premium-filter-locked radar-advanced-filters locked' : 'radar-advanced-filters'}>
          {advancedFiltersLocked && (
            <div className="premium-filter-lock-panel">
              <strong>{t('clientOffice.activateTitle')}</strong>
              <span>{t('activation.activationTokenBonusDescription')}</span>
              <Link className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to="/dashboard"><span>{t('clientOffice.activateCta')}</span></Link>
            </div>
          )}

        <label className="premium-field compact-field">
          <span>{t('filters.category')}</span>
          <select value={draftFilters.category} disabled={advancedFiltersLocked} onChange={(event) => updateFilter('category', event.target.value)}>
            <option value="">{t('filters.allCategories')}</option>
            {activePublicCategoryOptions.map((item) => <option key={item} value={item}>{option(item)}</option>)}
          </select>
        </label>

        <label className="premium-field compact-field">
          <span>{t('filters.price')}</span>
          <input type="number" placeholder={t('filters.priceMax')} value={draftFilters.price_max} disabled={advancedFiltersLocked} onChange={(event) => updateFilter('price_max', event.target.value)} />
        </label>

        <MultiSelect title={t('filters.visitType')} values={draftFilters.visit_types} options={visitTypeOptions} disabled={advancedFiltersLocked} onToggle={(value) => updateFilter('visit_types', toggleArrayValue(draftFilters.visit_types, value))} />

        <ServiceSelect
          search={draftFilters.service_search}
          selectedCount={draftFilters.services.length + draftFilters.service_tags.length + draftFilters.tag_ids.length}
          values={draftFilters.services}
          options={defaultServiceMenuNames}
          disabled={advancedFiltersLocked}
          onSearch={(value) => updateFilter('service_search', value)}
          onToggle={(value) => updateFilter('services', toggleArrayValue(draftFilters.services, value))}
        />

        <button className="button ghost more-filter-button er-btn er-glass-btn er-glass-btn--purple er-glass-btn--sm" type="button" disabled={advancedFiltersLocked} onClick={() => setShowAdvanced((value) => !value)}>
          <SlidersHorizontal size={17} /> <span>{t('city.moreFilters')}</span>
        </button>

        <div className={showAdvanced ? 'advanced-filters open compact-advanced-filters' : 'advanced-filters compact-advanced-filters'}>
          <MultiSelect title={t('filters.serviceTags')} values={draftFilters.service_tags} options={[]} disabled={advancedFiltersLocked} onToggle={(value) => updateFilter('service_tags', toggleArrayValue(draftFilters.service_tags, value))} />
          <TagSelect title={t('tags.title')} tags={platformTags} values={draftFilters.tag_ids} disabled={advancedFiltersLocked} onToggle={(value) => updateFilter('tag_ids', toggleArrayValue(draftFilters.tag_ids, value))} />
        </div>
        </div>

        <div className="filter-actions">
          <button className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" type="button" onClick={applyDraftFilters}><span>{t('buttons.apply')}</span></button>
          <button className="button er-btn er-glass-btn er-glass-btn--purple er-glass-btn--md" type="button" onClick={resetFilters}><span>{t('buttons.reset')}</span></button>
          <span>{t('radar.inRange', { count: radarProfiles.length })}</span>
        </div>
      </section>
    );
  }

  function renderLockedFilters() {
    const loginTarget = `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
    return (
      <section className="radar-filters-section radar-filters-section-locked">
        <div className="premium-lock-overlay">
          <LockKeyhole size={30} />
          <p className="eyebrow">Premium Radar Filters</p>
          <h3>{t('clientOffice.activateTitle')}</h3>
          <p>
            Aktywuj konto klienta za 0,99 EUR, aby korzystać z promienia, statusu, kategorii, ceny, typu wizyty, usług i tagów premium.
          </p>
          <div className="premium-lock-actions">
            <Link className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to="/dashboard"><span>{t('clientOffice.activateCta')}</span></Link>
            {!hasClientSession && <Link className="button secondary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" to={loginTarget}><span>{t('buttons.login')}</span></Link>}
          </div>
        </div>

        <div className="locked-filter-preview" aria-hidden="true">
          <span>{t('radar.radius')} <strong>{formatRadiusMeters(draftFilters.radius)}</strong></span>
          <span>{t('radar.status')}</span>
          <span>{t('filters.category')}</span>
          <span>{t('filters.price')}</span>
          <span>{t('filters.visitType')}</span>
          <span>{t('filters.services')}</span>
        </div>
      </section>
    );
  }

  return (
    <div className="page city-page luxury-city-page radar-search-page radar-city-page">
      <Seo
        title={`Escort Radar ${cityLabel} - Verified 18+ Nightlife Profiles`}
        description={`Explore privacy-first verified 18+ nightlife profiles in ${cityLabel}, with availability signals, city radar and moderated public listings.`}
        canonical={`https://escort-radar.fun/city/${urlCitySlug}`}
      />
      <section className="radar-search-header radar-city-header">
        <div className="radar-search-title">
          <p className="eyebrow">{t('city.eyebrow')}</p>
          <h1>{cityLabel} Radar</h1>
          <p>{t('search.showingSummary', { city: cityLabel, category: categoryLabel, count: sortedProfiles.length })}</p>
          {appliedFilters.category && <span className="active-category-badge">{option(appliedFilters.category)}</span>}
        </div>
        <div className="radar-search-controls">
          <GlobalLocationSearch
            initialCountry={countryCode}
            initialCity={cityLabel}
            initialCategory={appliedFilters.category || 'all'}
            compact
            showHeader={false}
            showPlaceSearch={false}
            showPopularCities={false}
          />
          <button className="button mobile-filter-trigger er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--sm" type="button" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={17} /> <span>{t('city.filter')}</span>
          </button>
        </div>
        <div className="radar-search-stats">
          <span><strong>{sortedProfiles.length}</strong> {t('city.activeProfiles')}</span>
          <span><strong>{onlineCount}</strong> {t('status.onlineNow')}</span>
          <span><strong>{availableTodayCount}</strong> {t('status.availableToday')}</span>
        </div>
      </section>

      <section id="city-radar" className="radar-map-stage radar-main-stage">
        <RadarPanel
          profiles={sortedProfiles}
          radius={draftFilters.radius}
          status={draftFilters.availability_status}
          city={urlCitySlug}
          onRadiusChange={(value) => updateRadarFilter('radius', value)}
          onStatusChange={(value) => updateRadarFilter('availability_status', value)}
          searcherLocation={searcherLocation}
          onUseLocation={useLocation}
          onSetManualLocation={setManualLocation}
          onClearManualLocation={clearManualLocation}
          fallbackNotice={fallbackNotice}
          mapApiKey={googleMapsApiKey}
          profilesWithoutLocationCount={profiles.filter((profile) => !resolveProfileRadarLocation(profile)).length}
        />
        {diagnosticMode ? (
          <aside className="radar-diagnostics" role="status">
            <strong>Radar diagnostics</strong>
            <span>API candidates before filters: {serverRadarMetrics?.candidates_before_filters ?? profiles.length}</span>
            <span>Public candidates: {radarDiagnostics.publicCandidates}</span>
            <span>In selected city/radius: {radarDiagnostics.inLocation}</span>
            <span>Missing location: {radarDiagnostics.missingLocation}</span>
            <span>Unpublished: {radarDiagnostics.unpublished}</span>
            <span>Moderation not approved: {radarDiagnostics.moderationPending}</span>
            <span>Excluded by status/filters: {radarDiagnostics.excludedByFilters}</span>
            <span>Response: {serverRadarMetrics?.duration_ms ?? 0} ms / {serverRadarMetrics?.response_bytes ?? 0} bytes</span>
          </aside>
        ) : null}
        {draftFilters.availability_status === 'favorites' && !hasClientSession && (
          <section className="state-panel">
            <p>{t('favorites.loginToSeeFavorites')}</p>
            <Link className="button primary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}><span>{t('favorites.openLogin')}</span></Link>
          </section>
        )}
        {draftFilters.availability_status === 'favorites' && hasClientSession && favoritesLoaded && !favoriteProfileIds.size && (
          <section className="state-panel">
            <p>{t('favorites.noFavoritesYet')}</p>
            <Link className="button primary er-btn er-glass-btn er-glass-btn--pink er-glass-btn--md" to="/dashboard#favorites"><span>{t('favorites.favorites')}</span></Link>
          </section>
        )}
      </section>

      {isClientActivated ? (
        <section className="radar-filters-section">
          {renderFilters('desktop')}
        </section>
      ) : renderLockedFilters()}

      <section className="radar-results-section">
        <div className="listing-toolbar radar-results-toolbar radar-results-header">
          <div>
            <p className="eyebrow">{sortedProfiles.length === 1 ? t('city.oneProfileNear', { city: cityLabel }) : t('city.profilesNearYou')}</p>
            <h2>{sortedProfiles.length ? t('city.marketplaceProfiles', { count: sortedProfiles.length }) : t('city.noProfilesNear', { city: cityLabel })}</h2>
          </div>
          <div className="sort-tabs" aria-label={t('city.sortProfiles')}>
            {[
              ['best', t('home.sort.best')],
              ['new', t('home.sort.new')],
              ['near', t('home.sort.near')],
              ['online', t('home.sort.online')]
            ].map(([key, label]) => (
              <button key={key} className={sortMode === key ? 'selected' : ''} type="button" onClick={() => setSortMode(key as typeof sortMode)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="radar-result-strip radar-avatar-strip">
          {topProfiles.length ? topProfiles.slice(0, 8).map((profile) => {
            const image = profile.profile_images?.find((item) => item.is_primary) || profile.profile_images?.[0];
            const statusClass = getStatusClass(profile);
            return (
              <Link to={`/profile/${profile.id}`} className={`top-avatar ${statusClass}`} key={profile.id}>
                {image?.public_url ? <img src={image.public_url} alt="" /> : <span>{getInitials(profile.display_name)}</span>}
                <strong>{profile.display_name}</strong>
                <small>{getOperatorStatus(profile).replaceAll('_', ' ')}</small>
              </Link>
            );
          }) : <p className="muted">{t('city.premiumProfilesEmpty')}</p>}
        </div>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={() => setRetryKey((value) => value + 1)} />}
        {!loading && !error && (
          sortedProfiles.length ? (
            <>
              <div className="radar-marketplace-carousel-controls profile-carousel-controls">
                <button className="er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" type="button" aria-label="Poprzednie profile marketplace" onClick={goToPreviousMarketplaceSlide}>
                  <ChevronLeft size={18} />
                </button>
                <button className="er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" type="button" aria-label="Następne profile marketplace" onClick={goToNextMarketplaceSlide}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div
                id="profiles"
                className={`radar-results-list radar-results-grid radar-marketplace-carousel profile-carousel ${sortedProfiles.length === 1 ? 'single-result-grid' : ''}`}
                aria-live="polite"
                ref={marketplaceCarouselRef}
                onMouseEnter={() => setMarketplaceCarouselPaused(true)}
                onMouseLeave={() => setMarketplaceCarouselPaused(false)}
                onFocus={() => setMarketplaceCarouselPaused(true)}
                onBlur={() => setMarketplaceCarouselPaused(false)}
                onPointerDown={pauseMarketplaceTemporarily}
                onTouchStart={pauseMarketplaceTemporarily}
              >
                <div className="radar-marketplace-carousel-track profile-carousel-track">
                  {marketplaceCarouselProfiles.map((profile) => (
                    <div className="radar-featured-profile-card marketplace-carousel-slide profile-carousel-card" key={profile.id}>
                      <ProfileCard profile={profile} isFavorite={favoriteProfileIds.has(profile.id)} onFavoriteChange={handleFavoriteChange} />
                    </div>
                  ))}
                </div>
              </div>
              {sortedProfiles.length === 1 && (
                <div className="premium-empty-state invite-empty-state">
                  <RadioTower size={32} />
                  <h2>{t('city.firstProfileTitle', { city: cityLabel })}</h2>
                  <p>{t('city.firstProfileText')}</p>
                  <Link className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" to="/dashboard"><span>{t('buttons.addListing')}</span></Link>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title={t('search.noProfilesForCity')}
              message={t('city.emptySearchText')}
              action={<button className="button primary er-btn er-glass-btn er-glass-btn--cyan er-glass-btn--md" type="button" onClick={() => updateRadarFilter('radius', Math.min(draftFilters.radius + 25_000, MAX_RADAR_RADIUS_METERS))}><span>{t('city.increaseRadius')}</span></button>}
            />
          )
        )}
      </section>

      <div className={filtersOpen ? 'mobile-filter-sheet open' : 'mobile-filter-sheet'} role="dialog" aria-modal="true" aria-label={t('city.profileFilters')}>
        <button className="mobile-filter-backdrop" type="button" aria-label={t('city.closeFilters')} onClick={() => setFiltersOpen(false)} />
        <div className="mobile-filter-panel">
          {isClientActivated ? renderFilters('mobile') : renderLockedFilters()}
        </div>
      </div>
    </div>
  );
}

function MultiSelect({ title, values, options, disabled = false, onToggle }: { title: string; values: string[]; options: string[]; disabled?: boolean; onToggle: (value: string) => void }) {
  const { option: translateOption } = useI18n();
  if (!options.length) return null;
  return (
    <fieldset className="chip-fieldset" disabled={disabled}>
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.slice(0, 10).map((item) => (
          <button key={item} className={values.includes(item) ? 'chip selected' : 'chip'} type="button" disabled={disabled} onClick={() => onToggle(item)}>
            {translateOption(item)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ServiceSelect({ search, selectedCount, values, options, disabled = false, onSearch, onToggle }: { search: string; selectedCount: number; values: string[]; options: string[]; disabled?: boolean; onSearch: (value: string) => void; onToggle: (value: string) => void }) {
  const { t, option: translateOption } = useI18n();
  const filteredOptions = options.filter((item) => translateOption(item).toLowerCase().includes(search.toLowerCase())).slice(0, 10);

  return (
    <fieldset className="chip-fieldset service-search-filter" disabled={disabled}>
      <legend>{t('filters.services')} {selectedCount ? `(${selectedCount})` : ''}</legend>
      <label className="service-search-input" aria-label={t('filters.services')}>
        <Search size={15} />
        <input value={search} placeholder={t('filters.searchServices')} disabled={disabled} onChange={(event) => onSearch(event.target.value)} />
      </label>
      <div className="chip-grid">
        {filteredOptions.map((item) => (
          <button key={item} className={values.includes(item) ? 'chip selected' : 'chip'} type="button" disabled={disabled} onClick={() => onToggle(item)}>
            {translateOption(item)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TagSelect({ title, values, tags, disabled = false, onToggle }: { title: string; values: string[]; tags: Tag[]; disabled?: boolean; onToggle: (value: string) => void }) {
  return (
    <fieldset className="chip-fieldset premium-tag-picker" disabled={disabled}>
      <legend>{title}</legend>
      <div className="chip-grid">
        {tags.slice(0, 10).map((tag) => (
          <button key={tag.id} className={values.includes(tag.id) ? 'chip selected' : 'chip'} type="button" disabled={disabled} onClick={() => onToggle(tag.id)}>
            {tag.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function applyFilters(profiles: Profile[], filters: SearchFilters, searcherLocation: GeoPoint) {
  const priceMax = Number(filters.price_max) || 0;
  const hasExplicitRadarCenter = ['browser', 'manual', 'manual_saved'].includes(searcherLocation.source);

  return profiles.map((profile) => {
    const radarRange = getSearchRange(profile, searcherLocation, filters.radius);
    return { ...profile, distance_km: radarRange.distance_km };
  }).filter((profile) => {
    const radarRange = getSearchRange(profile, searcherLocation, filters.radius);
    if (hasExplicitRadarCenter) {
      if (!radarRange.inRange) return false;
    } else if (filters.city && !profileMatchesCity(profile, filters.city)) return false;
    if (filters.category && normalizeCategoryKey(profile.category) !== filters.category) return false;
    if (!matchesOperatorStatusFilter(profile, filters.availability_status)) return false;
    if (priceMax && profile.price_1h && profile.price_1h > priceMax) return false;
    if (filters.visit_types.length && !filters.visit_types.some((item) => profile.visit_types?.includes(item))) return false;
    if (filters.services.length && !filters.services.some((item) => profile.service_menu?.some((service) => service.enabled && service.name === item))) return false;
    if (filters.service_tags.length && !filters.service_tags.some((item) => profile.service_tags?.includes(item))) return false;
    if (filters.tag_ids.length && !filters.tag_ids.some((item) => profile.tag_ids?.includes(item))) return false;
    return true;
  });
}

function getSearchRange(profile: Profile, searcherLocation: GeoPoint, selectedRadius: number) {
  const radarLocation = (searcherLocation.source === 'browser' || searcherLocation.source === 'manual' || searcherLocation.source === 'manual_saved')
    ? resolveProfileRadarLocation(profile)
    : null;
  if (!radarLocation) return isProfileInRadarRange(profile, searcherLocation, selectedRadius);
  const distance = safeDistanceKm(searcherLocation, radarLocation);
  if (distance === null) return { inRange: false, distance_km: null };

  return {
    inRange: distance * 1000 <= selectedRadius,
    distance_km: Math.round(distance * 10) / 10
  };
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
  const wanted = normalizeCityValue(city);
  const label = normalizeCityValue(cityName(city));
  return [profile.city, profile.work_city, profile.travel_city, profile.area, profile.work_area]
    .some((value) => {
      const nextValue = normalizeCityValue(value);
      return nextValue === wanted || nextValue === label || nextValue.includes(wanted) || nextValue.includes(label);
    });
}

function normalizeCityValue(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
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

