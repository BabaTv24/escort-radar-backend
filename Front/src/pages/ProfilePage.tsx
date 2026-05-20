import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, CalendarDays, Flag, Languages, LockKeyhole, MapPin, ShieldCheck, Tags } from 'lucide-react';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ErrorState, LoadingState } from '../components/LoadingState';
import { getDemoProfile } from '../data/demoProfiles';
import { useI18n } from '../i18n';

export function ProfilePage() {
  const { id = '' } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [bookingMessage, setBookingMessage] = useState('');
  const { t, option } = useI18n();

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
    setReportMessage(t('profile.reportSuccess'));
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
    setBookingMessage(t('profile.bookingSuccess'));
    event.currentTarget.reset();
  }

  return (
    <div className="page narrow">
      <section className="profile-hero">
        <div className="gallery">
          {(profile.profile_images?.length ? profile.profile_images : [{ id: 'placeholder' } as any]).map((image) => (
            image.public_url ? <img key={image.id} src={image.public_url} alt="" /> : <div key={image.id} className="image-placeholder large">{t('profile.noImage')}</div>
          ))}
        </div>
        <div className="profile-summary">
          <span className={`status ${profile.availability_status || 'unavailable'}`}>{t(`status.${profile.availability_status || 'unavailable'}`)}</span>
          <h1>{profile.display_name}{profile.age ? <span>{profile.age}</span> : null}</h1>
          <p><MapPin size={16} /> {profile.city}{profile.area ? `, ${profile.area}` : ''}</p>
          <p>{profile.category ? option(profile.category) : option('other')} · {profile.approximate_location_area || profile.area}</p>
          <div className="badges">
            {profile.verified && <span><BadgeCheck size={14} /> {t('badges.verified')}</span>}
            {profile.mobile_service && <span>{t('badges.mobile')}</span>}
            {profile.private_studio && <span>{t('badges.private')}</span>}
          </div>
          <p>{profile.description || t('profile.fallbackDescription')}</p>
          {profile.subscription_status === 'demo' && <p className="demo-note">{t('home.demo')}</p>}
          <p className="safety-line">{t('profile.availableWithin', { radius: profile.service_radius_km || 25 })}</p>
          <p className="safety-line">{t('radar.privacy')}</p>
          <div className="notice"><LockKeyhole size={18} /> {t('profile.contactSoon')}</div>
        </div>
      </section>

      <section className="notice safety"><AlertTriangle size={18} /> {t('city.safety')}</section>

      <section className="profile-info-grid">
        <InfoPanel title={t('profile.about')} icon={<ShieldCheck size={18} />}>
          <p>{profile.age ? t('profile.ageYears', { age: profile.age }) : t('profile.ageVerified')}{profile.height ? ` / ${profile.height} cm` : ''}</p>
          <p>{profile.body_type ? t('profile.bodyType', { value: option(profile.body_type) }) : t('profile.bodyPending')}</p>
          <p>{profile.hair_color ? t('profile.hair', { value: option(profile.hair_color) }) : t('profile.hairPending')}</p>
          <p>{profile.origin ? t('profile.origin', { value: option(profile.origin) }) : t('profile.originPending')}</p>
          <p>{profile.experience_type ? t('profile.experience', { value: option(profile.experience_type) }) : t('profile.experiencePending')}</p>
          <TagList values={profile.body_features || []} raw />
          <p>{profile.orientation ? option(profile.orientation) : t('profile.orientationPending')}</p>
          <p>{profile.audience?.length ? t('profile.audience', { value: profile.audience.map(option).join(', ') }) : t('profile.audiencePending')}</p>
        </InfoPanel>
        <InfoPanel title={t('profile.pricing')} icon={<LockKeyhole size={18} />}>
          <PriceList profile={profile} />
        </InfoPanel>
        <InfoPanel title={t('profile.availability')} icon={<CalendarDays size={18} />}>
          <p>{t(`status.${profile.availability_status || 'unavailable'}`)}</p>
          <p>{profile.availability_note || t('profile.detailsPending')}</p>
        </InfoPanel>
        <InfoPanel title={t('profile.servicesTags')} icon={<Tags size={18} />}>
          <TagList values={profile.service_tags || []} />
        </InfoPanel>
        <InfoPanel title={t('profile.languages')} icon={<Languages size={18} />}>
          <TagList values={profile.languages || []} raw />
        </InfoPanel>
        <InfoPanel title={t('profile.visitOptions')} icon={<MapPin size={18} />}>
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
            <input name="date" type="date" aria-label={t('form.date')} required />
            <input name="time" type="time" aria-label={t('form.time')} required />
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
        <h2><Flag size={18} /> {t('profile.reportTitle')}</h2>
        <form onSubmit={submitReport} className="stack">
          <input name="email" type="email" placeholder={t('form.emailOptional')} />
          <select name="reason" required>
            <option value="policy concern">{t('profile.reportReasonPolicy')}</option>
            <option value="suspected illegal content">{t('profile.reportReasonIllegal')}</option>
            <option value="non-consensual data">{t('profile.reportReasonData')}</option>
            <option value="other">{t('profile.reportReasonOther')}</option>
          </select>
          <textarea name="message" placeholder={t('profile.reportDetails')} />
          <button className="button primary" type="submit">{t('buttons.submitReport')}</button>
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
  const { t, option } = useI18n();
  if (!values.length) return <p>{t('profile.detailsPending')}</p>;
  return <div className="tag-list">{values.map((value) => <span key={value}>{raw ? value : option(value)}</span>)}</div>;
}

function PriceList({ profile }: { profile: Profile }) {
  const currency = profile.currency || 'EUR';
  const rows = [
    ['form.price30', profile.price_30min],
    ['form.price1h', profile.price_1h],
    ['form.price2h', profile.price_2h],
    ['form.priceNight', profile.price_night],
    ['form.outcallFee', profile.outcall_fee]
  ];
  const { t } = useI18n();

  return (
    <div className="price-list">
      {rows.map(([label, value]) => value ? <div key={label}><span>{t(String(label))}</span><strong>{value} {currency}</strong></div> : null)}
    </div>
  );
}

function ServiceMenuList({ title, services, currency }: { title: string; services: NonNullable<Profile['service_menu']>; currency: string }) {
  const { t, option } = useI18n();
  return (
    <div className="service-menu-list">
      <h3>{title}</h3>
      {services.length ? services.map((service) => (
        <div className="service-menu-item" key={service.name}>
          <div>
            <strong>{option(service.name)}</strong>
            {service.note && <p>{service.note}</p>}
          </div>
          <span>{service.included ? t('profile.includedLabel') : `${service.extra_price || 0} ${currency}`}</span>
        </div>
      )) : <p>{t('profile.detailsPending')}</p>}
    </div>
  );
}
