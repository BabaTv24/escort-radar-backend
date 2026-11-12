import { Link } from 'react-router-dom';
import { MapPin, UserRound } from 'lucide-react';
import type { Profile } from '../types';
import { useI18n } from '../i18n';
import { getPublicLocationLabel } from '../lib/locationLabels';

/** Compact public profile tile: first public image, name, safe location label and real availability only. */
export function PremiumProfileTile({ profile }: { profile: Profile }) {
  const { t, option } = useI18n();
  const images = [...(profile.profile_images || []), ...(profile.images || [])];
  const image = images.find((item) => item.is_primary || item.is_cover) || images[0];
  const imageUrl = image?.public_url || image?.url || image?.image_url || '';
  const online = profile.available_now || profile.operator_status === 'ONLINE_NOW';
  return (
    <article className="pr-profile-card">
      <Link className="pr-profile-media" to={`/profile/${profile.id}`} aria-label={profile.display_name}>
        {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span className="pr-placeholder"><UserRound size={30} aria-hidden="true" /></span>}
        {online ? <span className="pr-profile-status pr-badge is-success">{t('badges.availableNow')}</span> : null}
        <span className="pr-profile-overlay">
          <strong>{profile.display_name}</strong>
          <small><MapPin size={12} aria-hidden="true" /> {getPublicLocationLabel(profile, t)}{profile.category ? ` · ${option(profile.category)}` : ''}</small>
        </span>
      </Link>
    </article>
  );
}
