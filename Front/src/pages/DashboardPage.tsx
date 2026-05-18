import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ImagePlus, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { Profile } from '../types';

const emptyProfile = {
  display_name: '',
  city: 'berlin',
  area: '',
  category: 'private',
  description: '',
  languages: ['English'],
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
    <div className="page narrow">
      <section className="section-head">
        <p className="eyebrow">Advertiser dashboard</p>
        <h1>Create private profile</h1>
        <p>Profiles start as pending and require moderation before public discovery.</p>
      </section>

      <section className="form-panel">
        <h2>Login / Registration</h2>
        <div className="stack">
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <div className="row">
            <button className="button primary" onClick={() => signIn('sign-in')}>Login</button>
            <button className="button" onClick={() => signIn('sign-up')}>Register</button>
          </div>
        </div>
      </section>

      <section className="form-panel">
        <h2>Profile details</h2>
        <form className="stack" onSubmit={saveProfile}>
          <input placeholder="Display name" value={profile.display_name || ''} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })} required />
          <select value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })}>
            {['berlin', 'hamburg', 'hannover', 'koeln', 'muenchen', 'warszawa'].map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
          <input placeholder="Area" value={profile.area || ''} onChange={(event) => setProfile({ ...profile, area: event.target.value })} />
          <input placeholder="Category" value={profile.category || ''} onChange={(event) => setProfile({ ...profile, category: event.target.value })} />
          <input placeholder="Languages, comma separated" value={String(profile.languages || '')} onChange={(event) => setProfile({ ...profile, languages: event.target.value.split(',') as any })} />
          <textarea placeholder="Description" value={profile.description || ''} onChange={(event) => setProfile({ ...profile, description: event.target.value })} />
          <label><input type="checkbox" checked={Boolean(profile.available_now)} onChange={(event) => setProfile({ ...profile, available_now: event.target.checked })} /> Available now</label>
          <label><input type="checkbox" checked={Boolean(profile.mobile_service)} onChange={(event) => setProfile({ ...profile, mobile_service: event.target.checked })} /> Mobile service</label>
          <label><input type="checkbox" checked={Boolean(profile.private_studio)} onChange={(event) => setProfile({ ...profile, private_studio: event.target.checked })} /> Private studio</label>
          <div className="readonly">Verified status: {savedProfile?.verified ? 'Verified' : 'Read-only pending'}</div>
          <button className="button primary" type="submit">Save profile</button>
        </form>
      </section>

      <section className="form-panel">
        <h2><ImagePlus size={18} /> Photos</h2>
        <input type="file" accept="image/*" onChange={uploadImage} disabled={!savedProfile} />
        <button className="button" disabled type="button"><Sparkles size={16} /> Blur face - coming soon</button>
      </section>

      {message && <div className="state-panel">{message}</div>}
    </div>
  );
}
