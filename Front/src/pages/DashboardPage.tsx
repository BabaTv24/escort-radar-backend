import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Clock, ImagePlus, Lock, Sparkles, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ProfileCard } from '../components/ProfileCard';
import {
  audienceOptions,
  labelize,
  orientationOptions,
  paymentMethodOptions,
  serviceTagOptions,
  toggleArrayValue,
  visitTypeOptions
} from '../data/filterOptions';

const emptyProfile = {
  display_name: '',
  city: 'berlin',
  area: '',
  category: 'private',
  description: '',
  age: 25,
  height: 170,
  languages: ['EN'],
  orientation: '',
  audience: [],
  visit_types: [],
  service_tags: [],
  payment_methods: [],
  availability_note: '',
  available_now: false,
  mobile_service: false,
  private_studio: false
};

export function DashboardPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState<Partial<Profile>>(emptyProfile);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState('');

  async function signIn(mode: 'sign-in' | 'sign-up') {
    const result = mode === 'sign-up'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setToken(result.data.session?.access_token || '');
    setMessage(mode === 'sign-up' ? 'Account created. Confirm email if Supabase requires it.' : 'Signed in.');
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!token) return setMessage('Sign in first.');

    const body = { ...profile, languages: String(profile.languages || '').split(',').map((item) => item.trim()).filter(Boolean) };
    const result = savedProfile
      ? await api.updateProfile(token, savedProfile.id, body)
      : await api.createProfile(token, body);

    setSavedProfile(result.profile);
    setMessage('Profile saved for moderation review.');
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token || !savedProfile) return;
    const form = new FormData();
    form.set('profile_id', savedProfile.id);
    form.set('image', file);
    await api.uploadImage(token, form);
    setMessage('Image uploaded. EXIF metadata is stripped by backend processing.');
  }

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <p className="eyebrow">Advertiser dashboard</p>
        <h1>Create private profile</h1>
        <p>Profiles start as pending and require moderation before public discovery.</p>
      </section>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="form-panel elevated">
            <h2><Lock size={18} /> Account</h2>
            <div className="form-grid">
              <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
              <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="row">
              <button className="button primary" onClick={() => signIn('sign-in')}>Login</button>
              <button className="button" onClick={() => signIn('sign-up')}>Register</button>
            </div>
          </section>

          <form className="stack" onSubmit={saveProfile}>
            <section className="form-panel elevated">
              <h2><UserRound size={18} /> Profile</h2>
              <div className="form-grid">
                <input placeholder="Display name" value={profile.display_name || ''} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} required />
                <select value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })}>
                  {['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'].map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                <input placeholder="Area" value={profile.area || ''} onChange={(event) => setProfile({ ...profile, area: event.target.value })} />
                <input placeholder="Category" value={profile.category || ''} onChange={(event) => setProfile({ ...profile, category: event.target.value })} />
                <input placeholder="Languages, comma separated" value={String(profile.languages || '')} onChange={(event) => setProfile({ ...profile, languages: event.target.value.split(',') as any })} />
              </div>
              <textarea placeholder="Description" value={profile.description || ''} onChange={(event) => setProfile({ ...profile, description: event.target.value })} />
              <div className="readonly">Verified status: {savedProfile?.verified ? 'Verified' : 'Read-only pending'}</div>
            </section>

            <section className="form-panel elevated">
              <h2><UserRound size={18} /> Search settings</h2>
              <div className="form-grid">
                <input type="number" min="18" placeholder="Age" value={profile.age || ''} onChange={(event) => setProfile({ ...profile, age: Number(event.target.value) })} />
                <input type="number" min="120" placeholder="Height in cm" value={profile.height || ''} onChange={(event) => setProfile({ ...profile, height: Number(event.target.value) })} />
                <select value={profile.orientation || ''} onChange={(event) => setProfile({ ...profile, orientation: event.target.value })}>
                  <option value="">Orientation</option>
                  {orientationOptions.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}
                </select>
                <input placeholder="Availability schedule placeholder" value={profile.availability_note || ''} onChange={(event) => setProfile({ ...profile, availability_note: event.target.value })} />
              </div>
              <DashboardMultiSelect title="Audience" values={profile.audience || []} options={audienceOptions} onToggle={(value) => setProfile({ ...profile, audience: toggleArrayValue(profile.audience, value) })} />
              <DashboardMultiSelect title="Visit type" values={profile.visit_types || []} options={visitTypeOptions} onToggle={(value) => setProfile({ ...profile, visit_types: toggleArrayValue(profile.visit_types, value) })} />
              <DashboardMultiSelect title="Services tags" values={profile.service_tags || []} options={serviceTagOptions} onToggle={(value) => setProfile({ ...profile, service_tags: toggleArrayValue(profile.service_tags, value) })} />
              <DashboardMultiSelect title="Payment methods" values={profile.payment_methods || []} options={paymentMethodOptions} onToggle={(value) => setProfile({ ...profile, payment_methods: toggleArrayValue(profile.payment_methods, value) })} />
              <p className="safety-line">All listings must be 18+, consensual, verified, and compliant with local law.</p>
            </section>

            <section className="form-panel elevated">
              <h2><Clock size={18} /> Availability</h2>
              <div className="toggle-grid">
                <label><input type="checkbox" checked={Boolean(profile.available_now)} onChange={(event) => setProfile({ ...profile, available_now: event.target.checked })} /> Available now</label>
                <label><input type="checkbox" checked={Boolean(profile.mobile_service)} onChange={(event) => setProfile({ ...profile, mobile_service: event.target.checked })} /> Mobile service</label>
                <label><input type="checkbox" checked={Boolean(profile.private_studio)} onChange={(event) => setProfile({ ...profile, private_studio: event.target.checked })} /> Private studio</label>
              </div>
              <button className="button primary" type="submit">Save profile</button>
            </section>
          </form>

          <section className="form-panel elevated">
            <h2><ImagePlus size={18} /> Photos</h2>
            <div className="photo-drop">
              <input type="file" accept="image/*" onChange={uploadImage} disabled={!savedProfile} />
              <button className="button" disabled type="button"><Sparkles size={16} /> Blur face - coming soon</button>
            </div>
          </section>

          {message && <div className="state-panel">{message}</div>}
        </div>

        <aside className="dashboard-preview">
          <p className="eyebrow">Live preview</p>
          <ProfileCard profile={previewProfile(profile, savedProfile)} />
          <p className="demo-note">Preview uses neutral placeholder imagery until you upload verified photos.</p>
        </aside>
      </div>
    </div>
  );
}

function previewProfile(profile: Partial<Profile>, savedProfile: Profile | null): Profile {
  return {
    id: savedProfile?.id || 'preview',
    display_name: profile.display_name || 'Your profile',
    age: profile.age || 25,
    height: profile.height || 170,
    slug: 'preview',
    city: profile.city || 'berlin',
    area: profile.area || 'Central',
    category: profile.category || 'private',
    description: profile.description || 'A polished preview helps you understand how your listing will appear after moderation.',
    languages: Array.isArray(profile.languages) ? profile.languages : ['English'],
    orientation: profile.orientation,
    audience: profile.audience || [],
    visit_types: profile.visit_types || [],
    service_tags: profile.service_tags || [],
    payment_methods: profile.payment_methods || [],
    availability_note: profile.availability_note,
    available_now: Boolean(profile.available_now),
    mobile_service: Boolean(profile.mobile_service),
    private_studio: Boolean(profile.private_studio),
    verified: Boolean(savedProfile?.verified),
    status: 'pending',
    subscription_status: 'preview',
    trial_ends_at: null,
    profile_images: [{
      id: 'preview-image',
      storage_path: 'preview',
      public_url: 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20640%20860%22%3E%3Crect%20width%3D%22640%22%20height%3D%22860%22%20fill%3D%22%23090909%22/%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22280%22%20r%3D%22130%22%20fill%3D%22%23150f14%22%20stroke%3D%22%23f7d46b%22%20stroke-width%3D%228%22/%3E%3Cpath%20d%3D%22M145%20762c24-170%20326-170%20350%200%22%20fill%3D%22%23150f14%22%20stroke%3D%22%23f7d46b%22%20stroke-width%3D%228%22/%3E%3Ctext%20x%3D%2250%22%20y%3D%22808%22%20fill%3D%22%23f7d46b%22%20font-family%3D%22Arial%22%20font-size%3D%2232%22%20font-weight%3D%22700%22%3EPreview%3C/text%3E%3C/svg%3E',
      is_primary: true,
      is_blurred: false
    }]
  };
}

function DashboardMultiSelect({ title, values, options, onToggle }: { title: string; values: string[]; options: string[]; onToggle: (value: string) => void }) {
  return (
    <fieldset className="chip-fieldset">
      <legend>{title}</legend>
      <div className="chip-grid">
        {options.map((option) => (
          <button key={option} className={values.includes(option) ? 'chip selected' : 'chip'} type="button" onClick={() => onToggle(option)}>
            {labelize(option)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
