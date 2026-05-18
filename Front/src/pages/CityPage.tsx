import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ProfileCard } from '../components/ProfileCard';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { cities } from '../data/cities';

export function CityPage() {
  const { city = 'berlin' } = useParams();
  const cityLabel = cities.find((item) => item.slug === city)?.name || city;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filters, setFilters] = useState({ available_now: false, mobile_service: false, private_studio: false, verified: false, category: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams({ city });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    return `?${params.toString()}`;
  }, [city, filters]);

  useEffect(() => {
    setLoading(true);
    setError('');
    api.profiles(query)
      .then((data) => setProfiles(data.profiles))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="page narrow">
      <section className="section-head">
        <p className="eyebrow">City radar</p>
        <h1>{cityLabel}</h1>
        <p>Approved private profiles, readable filters, and a calm mobile-first browsing flow.</p>
      </section>

      <div className="filters">
        {(['available_now', 'mobile_service', 'private_studio', 'verified'] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={Boolean(filters[key])}
              onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.checked }))}
            />
            {key.replace('_', ' ')}
          </label>
        ))}
        <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
          <option value="">All categories</option>
          <option value="private">Private</option>
          <option value="studio">Studio</option>
          <option value="event">Event</option>
        </select>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && (
        <div className="cards-grid">
          {profiles.length ? profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} />) : <div className="state-panel">No active profiles yet.</div>}
        </div>
      )}
    </div>
  );
}
