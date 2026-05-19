import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, CalendarDays, Flag, Languages, LockKeyhole, MapPin, ShieldCheck, Tags } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { getDemoProfile } from '../data/demoProfiles';
import { labelize } from '../data/filterOptions';

export function ProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [reportMessage, setReportMessage] = useState('');

  useEffect(() => {
    api.profile(id)
      .then((data) => setProfile(data.profile))
      .catch((err) => {
        const demo = getDemoProfile(id);
        if (demo) setProfile(demo);
        else setError(err.message);
      });
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
          <h1>{profile.display_name}{profile.age ? <span>{profile.age}</span> : null}</h1>
          <p><MapPin size={16} /> {profile.city}{profile.area ? `, ${profile.area}` : ''}</p>
          <div className="badges">
            {profile.verified && <span><BadgeCheck size={14} /> Verified</span>}
            {profile.mobile_service && <span>Mobile</span>}
            {profile.private_studio && <span>Private studio</span>}
          </div>
          <p>{profile.description || 'Profile description coming soon.'}</p>
          {profile.subscription_status === 'demo' && <p className="demo-note">Demo profiles are fictional until verified advertisers join.</p>}
          <div className="notice"><LockKeyhole size={18} /> Contact unlock coming soon.</div>
        </div>
      </section>

      <section className="notice safety"><AlertTriangle size={18} /> Use only consensual, legal adult services. Report suspected coercion, minors, abuse, or non-consensual data immediately.</section>

      <section className="profile-info-grid">
        <InfoPanel title="About" icon={<ShieldCheck size={18} />}>
          <p>{profile.age ? `${profile.age} years` : 'Age verified before publication'}{profile.height ? ` / ${profile.height} cm` : ''}</p>
          <p>{profile.orientation ? labelize(profile.orientation) : 'Orientation not specified'}</p>
          <p>{profile.audience?.length ? `Audience: ${profile.audience.map(labelize).join(', ')}` : 'Audience details pending'}</p>
        </InfoPanel>
        <InfoPanel title="Availability" icon={<CalendarDays size={18} />}>
          <p>{profile.available_now ? 'Available now' : 'Availability offline'}</p>
          <p>{profile.availability_note || 'Schedule placeholder will be confirmed by the advertiser.'}</p>
        </InfoPanel>
        <InfoPanel title="Services / tags" icon={<Tags size={18} />}>
          <TagList values={profile.service_tags || []} />
        </InfoPanel>
        <InfoPanel title="Languages" icon={<Languages size={18} />}>
          <TagList values={profile.languages || []} raw />
        </InfoPanel>
        <InfoPanel title="Visit options" icon={<MapPin size={18} />}>
          <TagList values={profile.visit_types || []} />
          <TagList values={profile.payment_methods || []} />
        </InfoPanel>
        <InfoPanel title="Safety notice" icon={<AlertTriangle size={18} />}>
          <p>All listings must be 18+, consensual, verified, and compliant with local law.</p>
        </InfoPanel>
      </section>

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

function InfoPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <article className="info-panel">
      <h2>{icon} {title}</h2>
      {children}
    </article>
  );
}

function TagList({ values, raw = false }: { values: string[]; raw?: boolean }) {
  if (!values.length) return <p>Details pending.</p>;
  return <div className="tag-list">{values.map((value) => <span key={value}>{raw ? value : labelize(value)}</span>)}</div>;
}
