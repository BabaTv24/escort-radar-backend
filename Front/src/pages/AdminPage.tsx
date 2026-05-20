import { useState } from 'react';
import { Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { useI18n } from '../i18n';

export function AdminPage() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const { t } = useI18n();

  async function login() {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return setMessage(result.error.message);
    const accessToken = result.data.session?.access_token || '';
    setToken(accessToken);
    await load(accessToken);
  }

  async function load(accessToken = token) {
    const [profileData, reportData] = await Promise.all([api.adminProfiles(accessToken), api.adminReports(accessToken)]);
    setProfiles(profileData.profiles);
    setStats({ ...profileData.stats, reports_count: reportData.reports_count });
    setReports(reportData.reports);
  }

  async function setStatus(id: string, status: string) {
    await api.setProfileStatus(token, id, status);
    await load();
  }

  async function setReportStatus(id: string, status: string) {
    await api.setReportStatus(token, id, status);
    await load();
  }

  return (
    <div className="page narrow">
      <section className="section-head">
        <p className="eyebrow">Admin</p>
        <h1><Shield size={28} /> Moderation panel</h1>
      </section>

      {!token && (
        <section className="form-panel stack">
          <input type="email" placeholder={t('admin.email')} value={email} onChange={(event) => setEmail(event.target.value)} />
          <input type="password" placeholder={t('form.password')} value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button primary" onClick={login}>{t('buttons.login')}</button>
          {message && <p className="error-text">{message}</p>}
        </section>
      )}

      {token && (
        <>
          <div className="stats">
            {Object.entries(stats).map(([key, value]) => <div key={key}><strong>{value}</strong><span>{key.replaceAll('_', ' ')}</span></div>)}
          </div>
          <section className="table-panel">
            <h2>{t('admin.profiles')}</h2>
            {profiles.map((profile) => (
              <div className="admin-row" key={profile.id}>
                <span>{profile.display_name} / {profile.city}</span>
                <select value={profile.status} onChange={(event) => setStatus(profile.id, event.target.value)}>
                  {['pending', 'active', 'rejected', 'suspended'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            ))}
          </section>
          <section className="table-panel">
            <h2>{t('admin.reports')}</h2>
            {reports.map((report) => (
              <div className="admin-row" key={report.id}>
                <span>{report.reason} / {report.profiles?.display_name || 'profile'}</span>
                <select value={report.status} onChange={(event) => setReportStatus(report.id, event.target.value)}>
                  {['open', 'reviewing', 'resolved', 'dismissed'].map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
