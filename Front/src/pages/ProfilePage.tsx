import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, CalendarDays, Flag, Languages, LockKeyhole, MapPin, ShieldCheck, Tags } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { getDemoProfile } from '../data/demoProfiles';
import { labelize } from '../data/filterOptions';
import { useI18n } from '../i18n';

export function ProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const { t } = useI18n();

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

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api.createBookingRequest({
      profile_id: profile!.id,
      requester_email: String(form.get('email') || ''),
      requested_date: String(form.get('date') || ''),
      requested_time: String(form.get('time') || ''),
      duration_minutes: Number(form.get('duration') || 60),
      message: String(form.get('message') || '')
    });
    setBookingMessage('Booking request sent for advertiser review.');
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
          <div className="notice"><LockKeyhole size={18} /> {t('profile.contactSoon')}</div>
        </div>
      </section>

      <section className="notice safety"><AlertTriangle size={18} /> Use only consensual, legal adult services. Report suspected coercion, minors, abuse, or non-consensual data immediately.</section>

      <section className="profile-info-grid">
        <InfoPanel title="About" icon={<ShieldCheck size={18} />}>
          <p>{profile.age ? `${profile.age} years` : 'Age verified before publication'}{profile.height ? ` / ${profile.height} cm` : ''}</p>
          <p>{profile.body_type ? `Body type: ${labelize(profile.body_type)}` : 'Body type pending'}</p>
          <p>{profile.hair_color ? `Hair: ${labelize(profile.hair_color)}` : 'Hair details pending'}</p>
          <p>{profile.origin ? `Origin: ${labelize(profile.origin)}` : 'Origin pending'}</p>
          <p>{profile.experience_type ? `Experience: ${labelize(profile.experience_type)}` : 'Experience type pending'}</p>
          <TagList values={profile.body_features || []} raw />
          <p>{profile.orientation ? labelize(profile.orientation) : 'Orientation not specified'}</p>
          <p>{profile.audience?.length ? `Audience: ${profile.audience.map(labelize).join(', ')}` : 'Audience details pending'}</p>
        </InfoPanel>
        <InfoPanel title={t('profile.pricing')} icon={<LockKeyhole size={18} />}>
          <PriceList profile={profile} />
        </InfoPanel>
        <InfoPanel title={t('profile.availability')} icon={<CalendarDays size={18} />}>
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
        <InfoPanel title={t('profile.safety')} icon={<AlertTriangle size={18} />}>
          <p>{t('city.safety')}</p>
        </InfoPanel>
      </section>

      <section className="form-panel service-menu-panel">
        <h2><Tags size={18} /> {t('profile.serviceMenu')}</h2>
        <div className="service-menu-columns">
          <ServiceMenuList title={t('profile.included')} services={(profile.service_menu || []).filter((service) => service.enabled && service.included)} currency={profile.currency || 'EUR'} />
          <ServiceMenuList title={t('profile.extra')} services={(profile.service_menu || []).filter((service) => service.enabled && !service.included)} currency={profile.currency || 'EUR'} />
        </div>
      </section>

      <section className="form-panel booking-panel">
        <h2><CalendarDays size={18} /> {t('profile.booking')}</h2>
        <p className="safety-line">{t('city.safety')}</p>
        <form onSubmit={submitBooking} className="stack">
          <div className="form-grid">
            <input name="email" type="email" placeholder={t('form.email')} required />
            <input name="date" type="date" required />
            <input name="time" type="time" required />
            <select name="duration" defaultValue="60">
              <option value="60">60 min</option>
              <option value="120">120 min</option>
              <option value="240">240 min</option>
            </select>
          </div>
          <textarea name="message" placeholder={t('form.message')} />
          <button className="button primary" type="submit">{t('buttons.sendBooking')}</button>
          {bookingMessage && <p className="success">{bookingMessage}</p>}
        </form>
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

function PriceList({ profile }: { profile: Profile }) {
  const currency = profile.currency || 'EUR';
  const rows = [
    ['30 min', profile.price_30min],
    ['1 hour', profile.price_1h],
    ['2 hours', profile.price_2h],
    ['Night', profile.price_night],
    ['Outcall fee', profile.outcall_fee]
  ];

  return (
    <div className="price-list">
      {rows.map(([label, value]) => value ? <div key={label}><span>{label}</span><strong>{value} {currency}</strong></div> : null)}
    </div>
  );
}

function ServiceMenuList({ title, services, currency }: { title: string; services: NonNullable<Profile['service_menu']>; currency: string }) {
  return (
    <div className="service-menu-list">
      <h3>{title}</h3>
      {services.length ? services.map((service) => (
        <div className="service-menu-item" key={service.name}>
          <div>
            <strong>{service.name}</strong>
            {service.note && <p>{service.note}</p>}
          </div>
          <span>{service.included ? 'Included' : `${service.extra_price || 0} ${currency}`}</span>
        </div>
      )) : <p>Details pending.</p>}
    </div>
  );
}
