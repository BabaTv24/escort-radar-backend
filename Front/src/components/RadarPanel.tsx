import { Link } from 'react-router-dom';
import type { Profile } from '../types';
import { radiusOptions } from '../data/filterOptions';
import { useI18n } from '../i18n';

type RadarPanelProps = {
  profiles: Profile[];
  radius: number;
  status: string;
  city: string;
  onRadiusChange: (radius: number) => void;
  onStatusChange: (status: string) => void;
  compact?: boolean;
};

const positions = [
  [52, 22], [68, 35], [38, 42], [58, 58], [30, 62], [76, 70],
  [45, 75], [25, 32], [62, 82], [82, 48], [48, 34], [36, 78]
];

export function RadarPanel({ profiles, radius, status, city, onRadiusChange, onStatusChange, compact = false }: RadarPanelProps) {
  const { t } = useI18n();
  const visibleProfiles = profiles.filter((profile) => {
    const distance = profile.distance_km ?? 999;
    const matchesRadius = distance <= radius;
    const matchesStatus = status === 'all' || profile.availability_status === status;
    return matchesRadius && matchesStatus;
  });

  return (
    <section className={compact ? 'radar-panel compact' : 'radar-panel'}>
      <div className="radar-copy">
        <p className="eyebrow">{t('radar.eyebrow')}</p>
        <h2>{t('radar.title')}</h2>
        <p>{t('radar.subtitle')}</p>
        <p className="safety-line">{t('radar.privacy')}</p>
        <div className="radar-controls">
          <label>
            {t('radar.radius')}
            <select value={radius} onChange={(event) => onRadiusChange(Number(event.target.value))}>
              {radiusOptions.map((item) => <option key={item} value={item}>{item} km</option>)}
            </select>
          </label>
          <label>
            {t('radar.status')}
            <select value={status} onChange={(event) => onStatusChange(event.target.value)}>
              <option value="all">{t('status.all')}</option>
              <option value="available">{t('status.available')}</option>
              <option value="busy">{t('status.busy')}</option>
              <option value="unavailable">{t('status.unavailable')}</option>
            </select>
          </label>
        </div>
        <div className="radar-legend">
          <span><i className="dot available" /> {t('status.available')}</span>
          <span><i className="dot busy" /> {t('status.busy')}</span>
          <span><i className="dot unavailable" /> {t('status.unavailable')}</span>
        </div>
        {compact && <Link to={`/city/${city}`} className="button primary">{t('radar.cta')}</Link>}
      </div>
      <div className="radar-visual" aria-label={t('radar.title')}>
        <div className="radar-sweep" />
        <div className="radar-core" />
        {visibleProfiles.slice(0, 12).map((profile, index) => {
          const [left, top] = positions[index % positions.length];
          return (
            <Link
              key={profile.id}
              to={`/profile/${profile.id}`}
              className={`radar-point ${profile.availability_status || 'unavailable'}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              title={`${profile.display_name} · ${profile.distance_km ?? '?'} km`}
            />
          );
        })}
      </div>
    </section>
  );
}
