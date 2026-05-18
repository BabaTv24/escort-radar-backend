import { Link } from 'react-router-dom';
import { BadgeCheck, MapPin, Radio, Smartphone, LockKeyhole } from 'lucide-react';
import type { Profile } from '../types';

export function ProfileCard({ profile }: { profile: Profile }) {
  const primary = profile.profile_images?.find((image) => image.is_primary) || profile.profile_images?.[0];

  return (
    <article className="profile-card">
      <div className="card-image">
        {primary?.public_url ? <img src={primary.public_url} alt="" /> : <div className="image-placeholder">Radar</div>}
        <span className={profile.available_now ? 'status live' : 'status'}>{profile.available_now ? 'Available now' : 'Offline'}</span>
      </div>
      <div className="card-body">
        <div>
          <h3>{profile.display_name}</h3>
          <p><MapPin size={15} /> {profile.city}{profile.area ? `, ${profile.area}` : ''}</p>
        </div>
        <div className="badges">
          {profile.verified && <span><BadgeCheck size={14} /> Verified</span>}
          {profile.mobile_service && <span><Smartphone size={14} /> Mobile</span>}
          {profile.private_studio && <span><LockKeyhole size={14} /> Private</span>}
          {profile.category && <span><Radio size={14} /> {profile.category}</span>}
        </div>
        <p className="muted line-clamp">{profile.description || 'Private premium profile with details available on profile page.'}</p>
        <Link to={`/profile/${profile.id}`} className="button full">View profile</Link>
      </div>
    </article>
  );
}
