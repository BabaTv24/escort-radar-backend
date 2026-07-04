import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { BadgeCheck, HeartHandshake, Home, Hotel, Languages, MapPin, MessageCircle, Radio, Star, Video, LockKeyhole } from 'lucide-react';
import type { Profile } from '../types';
import { useI18n } from '../i18n';
import { serviceLabel } from '../data/serviceCatalog';
import { getPublicLocationLabel } from '../lib/locationLabels';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { formatDistanceKm } from '../lib/geo';

export function ProfileCard({ profile, isFavorite = false, onFavoriteChange }: { profile: Profile; isFavorite?: boolean; onFavoriteChange?: (profileId: string) => void }) {
  const { t, option } = useI18n();
  const [favoriteState, setFavoriteState] = useState<'idle' | 'saved'>(isFavorite ? 'saved' : 'idle');
  const [favoriteMessage, setFavoriteMessage] = useState('');
  const primary = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];
  const status = profile.availability_status || (profile.available_now ? 'available' : 'unavailable');
  const operatorStatus = profile.operator_status || (status === 'available' ? 'ONLINE_NOW' : status === 'busy' ? 'BUSY' : 'OFFLINE');
  const operatorLabel = operatorStatusLabel(operatorStatus, t);
  const priceFrom = getPriceFrom(profile, t);
  const reviewCount = 12 + (profile.id.length % 37);
  const rating = (4.6 + (profile.id.length % 4) / 10).toFixed(1);
  const locationLabel = getPublicLocationLabel(profile, t);
  const distanceLabel = formatDistanceKm(profile.distance_km);
  const visitBadge = getVisitBadge(profile, t);
  const isNew = profile.created_at ? Date.now() - new Date(profile.created_at).getTime() < 1000 * 60 * 60 * 24 * 14 : profile.id.length % 2 === 0;
  const badges = [
    profile.is_sponsored ? 'SPONSOROWANY' : '',
    profile.is_seed_profile ? 'PREVIEW' : '',
    profile.verified ? 'VERIFIED' : '',
    profile.price_1h ? 'PLUS' : '',
    isNew ? 'NEW' : '',
    (profile.category === 'live_cam' || profile.service_tags?.includes('live-cam')) ? 'LIVE CAM' : ''
  ].filter(Boolean).slice(0, 3);

  useEffect(() => {
    setFavoriteState(isFavorite ? 'saved' : 'idle');
  }, [isFavorite]);

  return (
    <article className="profile-card premium-profile-card">
      <div className="card-image">
        {primary?.public_url ? <img src={primary.public_url} alt="" loading="lazy" /> : <div className="image-placeholder">{t('app.name')}</div>}
        <span className={`status ${operatorStatusClass(operatorStatus)}`}>{operatorLabel}</span>
        <div className="premium-card-badges">
          {badges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
        <div className="card-overlay">
          <div>
            <strong>{profile.display_name}</strong>
            <small>{profile.age ? `${profile.age} · ` : ''}{option(profile.category || 'other')}</small>
          </div>
          <span>{distanceLabel ? `~${distanceLabel}` : locationLabel}</span>
        </div>
      </div>
      <div className="card-body">
        <div>
          <h3>{profile.display_name}{profile.age ? <span>{profile.age}</span> : null}</h3>
          <p><MapPin size={15} /> {locationLabel}{distanceLabel ? ` - ~${distanceLabel}` : ''}</p>
        </div>
        <div className="premium-card-meta">
          <strong>{priceFrom}</strong>
          <span><Star size={14} /> {rating} ({reviewCount})</span>
        </div>
        <div className="mini-icon-row" aria-label="Profile features">
          {profile.visit_types?.includes('hotel') && <span title={t('profileCard.hotelVisit')}><Hotel size={15} /></span>}
          {profile.visit_types?.includes('incall') && <span title={t('profileCard.homeVisit')}><Home size={15} /></span>}
          {profile.service_tags?.includes('conversation') && <span title={t('profileCard.chat')}><MessageCircle size={15} /></span>}
          {profile.category === 'live_cam' && <span title={t('profileCard.cam')}><Video size={15} /></span>}
          {profile.verified && <span title={t('profileCard.verified')}><BadgeCheck size={15} /></span>}
          {profile.audience?.includes('couples') && <span title={t('profileCard.couples')}><HeartHandshake size={15} /></span>}
        </div>
        <div className="badges">
          {profile.private_studio && <span><LockKeyhole size={14} /> Private</span>}
          {visitBadge && <span>{visitBadge}</span>}
          {profile.languages?.length ? <span><Languages size={14} /> {profile.languages.slice(0, 3).join('/')}</span> : null}
          {profile.category && <span><Radio size={14} /> {option(profile.category)}</span>}
          {profile.hotspot_type && <span>{profile.hotspot_type}</span>}
          {profile.radar_score ? <span>Radar {profile.radar_score}</span> : null}
        </div>
        {profile.services?.length ? <p className="muted line-clamp">{profile.services.slice(0, 4).map(serviceLabel).join(' · ')}</p> : null}
        {profile.visibility_reason && <p className={profile.visibility_reason === 'visible' ? 'success' : 'error-text'}>{t(`visibility.${profile.visibility_reason}`)}</p>}
        <p className="muted line-clamp">{profile.description || t('profile.fallbackDescription')}</p>
        <div className="premium-card-actions">
          <button className="button icon-favorite-action" type="button" disabled={favoriteState === 'saved'} onClick={toggleFavorite} aria-label={favoriteState === 'saved' ? t('favorites.alreadyFavorite') : t('favorites.addToFavorites')}>
            <HeartHandshake size={16} />
          </button>
          <Link to={`/profile/${profile.id}`} className="button primary full">{t('buttons.viewProfile')}</Link>
        </div>
        {favoriteMessage && <p className={favoriteMessage === t('favorites.notEnoughTokens') ? 'error-text' : 'success'}>{favoriteMessage}</p>}
        {favoriteMessage === t('favorites.notEnoughTokens') && <Link className="button full" to="/tokens">{t('favorites.buyTokens')}</Link>}
        {favoriteMessage === t('favorites.loginToSeeFavorites') && <Link className="button full" to="/login">{t('buttons.login')}</Link>}
      </div>
    </article>
  );

  async function toggleFavorite() {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      setFavoriteMessage(t('favorites.loginToSeeFavorites'));
      return;
    }
    try {
      const result = await api.addFavorite(token, profile.id);
      setFavoriteState('saved');
      onFavoriteChange?.(profile.id);
      setFavoriteMessage(result.already_exists || result.already_favorited ? t('favorites.favoriteAlreadyAdded') : t('favorites.favoriteAddedTokenCharged'));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setFavoriteMessage(message.toLowerCase().includes('token') ? t('favorites.notEnoughTokens') : message || t('states.requestFailed'));
    }
  }
}

function getVisitBadge(profile: Profile, t: (key: string) => string) {
  if (profile.visit_types?.includes('outcall') || profile.travels === true) return t('profileDetails.outcallBadge');
  if (profile.visit_types?.includes('incall') || profile.travels === false) return t('profileDetails.incallBadge');
  return '';
}

function operatorStatusClass(status: string) {
  const classes: Record<string, string> = {
    ONLINE_NOW: 'online-now',
    AVAILABLE_TODAY: 'available-today',
    BUSY: 'busy',
    APPOINTMENT_ONLY: 'appointment-only',
    TRAVELING: 'traveling',
    OFFLINE: 'offline'
  };
  return classes[status] || 'offline';
}

function operatorStatusLabel(status: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    ONLINE_NOW: t('status.onlineNow'),
    BUSY: t('status.busy'),
    TRAVELING: t('status.traveling'),
    AVAILABLE_TODAY: t('status.availableToday'),
    APPOINTMENT_ONLY: t('status.appointmentOnly'),
    OFFLINE: t('status.offline')
  };
  return labels[status] || t('status.offline');
}

function getPriceFrom(profile: Profile, t: (key: string) => string) {
  const prices = [profile.price_30min, profile.price_1h, profile.price_2h, profile.price_3h, profile.price_night]
    .map((value) => Number(value || 0))
    .filter((value) => value > 0);
  if (!prices.length) return t('profile.priceOnRequest');
  return `ab ${Math.min(...prices)} ${profile.currency || 'EUR'} / h`;
}
