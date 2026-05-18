import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Flag, LockKeyhole, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';

export function ProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    api.profile(id)
      .then((data) => setProfile(data.profile))
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <div className="page narrow"><ErrorState message={error} /></div>;
  if (!profile) return <div className="page narrow"><LoadingState /></div>;

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.report({
      profile_id: profile!.id,
      reporter_email: String(form.get('email') || ''),
      reason: String(form.get('reason') || 'policy concern'),
      message: String(form.get('message') || '')
    });
    setReportMessage('Report submitted for moderation review.');
    event.currentTarget.reset();
  }

  return (
    <div className="page narrow">
      <section className="profile-hero">
        <div className="gallery">
          {(profile.profile_images?.length ? profile.profile_images : [{ id: 'placeholder' } as any]).map((image) => (
            image.public_url ? <img key={image.id} src={image.public_url} alt="" /> : <div key={image.id} className="image-placeholder large">No image</div>
          ))}
        </div>
        <div className="profile-summary">
          <span className={profile.available_now ? 'status live' : 'status'}>{profile.available_now ? 'Available now' : 'Offline'}</span>
          <h1>{profile.display_name}</h1>
          <p><MapPin size={16} /> {profile.city}{profile.area ? `, ${profile.area}` : ''}</p>
          <div className="badges">
            {profile.verified && <span><BadgeCheck size={14} /> Verified</span>}
            {profile.mobile_service && <span>Mobile</span>}
            {profile.private_studio && <span>Private studio</span>}
          </div>
          <p>{profile.description || 'Profile description coming soon.'}</p>
          <div className="notice"><LockKeyhole size={18} /> Contact unlock coming soon.</div>
        </div>
      </section>

      <section className="notice safety"><AlertTriangle size={18} /> Use only consensual, legal adult services. Report suspected coercion, minors, abuse, or non-consensual data immediately.</section>

      <section className="form-panel">
        <h2><Flag size={18} /> Report profile</h2>
        <form onSubmit={submitReport} className="stack">
          <input name="email" type="email" placeholder="Your email (optional)" />
          <select name="reason" required>
            <option value="policy concern">Policy concern</option>
            <option value="suspected illegal content">Suspected illegal content</option>
            <option value="non-consensual data">Non-consensual data</option>
            <option value="other">Other</option>
          </select>
          <textarea name="message" placeholder="Add details for moderation" />
          <button className="button primary" type="submit">Submit report</button>
          {reportMessage && <p className="success">{reportMessage}</p>}
        </form>
      </section>
    </div>
  );
}
