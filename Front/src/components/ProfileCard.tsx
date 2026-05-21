import { Link } from 'react-router-dom';
import { BadgeCheck, HeartHandshake, Hotel, Languages, MapPin, Radio, Smartphone, LockKeyhole } from 'lucide-react';
import type { Profile } from '../types';
import { useI18n } from '../i18n';

export function ProfileCard({ profile }: { profile: Profile }) {
  const { t, option } = useI18n();
  const primary = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];
  const status = profile.availability_status || (profile.available_now ? 'available' : 'unavailable');

  return (
    <article className="profile-card">
      <div className="card-image">
        {primary?.public_url ? <img src={primary.public_url} alt="" /> : <div className="image-placeholder">{t('app.name')}</div>}
        <span className={`status ${status}`}>{t(`status.${status}`)}</span>
        <div className="card-overlay">
          <strong>{profile.display_name}</strong>
          {profile.distance_km ? <span>~{profile.distance_km} km</span> : null}
        </div>
      </div>
      <div className="card-body">
        <div>
          <h3>{profile.display_name}{profile.age ? <span>{profile.age}</span> : null}</h3>
          <p><MapPin size={15} /> {profile.city}{profile.area ? `, ${profile.area}` : ''}{profile.distance_km ? ` · ~${profile.distance_km} km` : ''}</p>
        </div>
        <div className="badges">
          {status === 'available' && <span>{t('badges.availableNow')}</span>}
          {profile.verified && <span><BadgeCheck size={14} /> {t('badges.verified')}</span>}
          {profile.mobile_service && <span><Smartphone size={14} /> {t('badges.mobile')}</span>}
          {profile.private_studio && <span><LockKeyhole size={14} /> {t('badges.private')}</span>}
          {profile.audience?.includes('couples') && <span><HeartHandshake size={14} /> {t('badges.couples')}</span>}
          {profile.visit_types?.includes('hotel') && <span><Hotel size={14} /> {t('badges.hotel')}</span>}
          {profile.languages?.length ? <span><Languages size={14} /> {profile.languages.slice(0, 3).join('/')}</span> : null}
          {profile.category && <span><Radio size={14} /> {option(profile.category)}</span>}
        </div>
        {profile.tags?.length ? (
          <div className="tag-list compact">
            {profile.tags.slice(0, 5).map((tag) => <span key={tag.id}>{tag.label}</span>)}
          </div>
        ) : null}
        {profile.price_1h && <p className="price-line">{t('profile.fromPrice', { price: profile.price_1h, currency: profile.currency || 'EUR' })}</p>}
        <p className="muted">{t('profile.availableWithin', { radius: profile.service_radius_km || 25 })}</p>
        {profile.visibility_reason && <p className={profile.visibility_reason === 'visible' ? 'success' : 'error-text'}>{t(`visibility.${profile.visibility_reason}`)}</p>}
        <p className="muted line-clamp">{profile.description || t('profile.fallbackDescription')}</p>
        <Link to={`/profile/${profile.id}`} className="button full">{t('buttons.viewProfile')}</Link>
      </div>
    </article>
  );
}
