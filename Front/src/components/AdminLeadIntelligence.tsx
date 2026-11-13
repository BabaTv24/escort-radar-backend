import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCw, Send } from 'lucide-react';
import { ApiError, api, type AdminLeadSummaryResponse, type WaitlistInterestType } from '../lib/api';
import { API_URL } from '../lib/apiBase';
import { useI18n } from '../i18n';
import './adminTraffic.css';

const numberLocales: Record<string, string> = { de: 'de-DE', pl: 'pl-PL', en: 'en-GB' };
const segments: WaitlistInterestType[] = ['client_premium', 'advertiser'];
type Preview = { interest_type: WaitlistInterestType; subject: string; text: string; recipients: number; already_sent: boolean; send_enabled: boolean };

/**
 * LEAD INTELLIGENCE (ER-V1-PUBLIC-PREVIEW-003): confirmed interest-list figures only.
 * Leads are not customers: no orders, payments or accounts are read or mixed in here.
 */
export function AdminLeadIntelligence({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<AdminLeadSummaryResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState('');
  const fmt = (value: number) => Number(value || 0).toLocaleString(numberLocales[lang] || 'de-DE');

  useEffect(() => {
    let active = true;
    setState('loading');
    api.adminLeadSummary(token, 30)
      .then((response) => { if (active) { setData(response); setState('ready'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [token, reload]);

  const summary = data?.summary;
  const max = useMemo(() => Math.max(1, ...(summary?.daily || []).map((day) => day.client_premium + day.advertiser)), [summary]);

  async function exportSegment(type: WaitlistInterestType) {
    setNotice('');
    const response = await fetch(`${API_URL}/api/admin/leads/export?interest_type=${type}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!response.ok) return setNotice(t('admin.leads.exportFailed'));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `escort-radar-leads-${type}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(t('admin.leads.exported'));
  }

  async function loadPreview(type: WaitlistInterestType) {
    setNotice('');
    try {
      const response = await fetch(`${API_URL}/api/admin/leads/announcements/preview`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ interest_type: type, language: lang })
      });
      if (!response.ok) throw new ApiError('preview', response.status);
      setPreview(await response.json());
    } catch {
      setNotice(t('admin.leads.previewFailed'));
    }
  }

  async function send(type: WaitlistInterestType) {
    const phrase = `SEND ${type}`;
    if (window.prompt(t('admin.leads.sendConfirm', { phrase })) !== phrase) return;
    const response = await fetch(`${API_URL}/api/admin/leads/announcements/send`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ interest_type: type, confirm: phrase })
    });
    const body = await response.json().catch(() => ({}));
    setNotice(response.ok ? t('admin.leads.sendDone', { sent: fmt(body.sent), failed: fmt(body.failed) }) : `${t('admin.leads.sendFailed')} (${body.code || response.status})`);
    setReload((value) => value + 1);
  }

  if (state === 'error') return <section className="admin-card"><h2>{t('admin.leads.title')}</h2><p className="error-text">{t('admin.leads.loadError')}</p></section>;
  if (!data) return <section className="admin-card"><h2>{t('admin.leads.title')}</h2><p>{t('states.loading')}</p></section>;

  const badges = (
    <>
      <p className="at-badge" role="status">{t(data.collection_enabled ? 'admin.leads.collectionOn' : 'admin.leads.collectionOff')}</p>
      {!data.mail_configured ? <p className="at-badge" role="status">{t('admin.leads.mailMissing')}</p> : null}
      <p className="at-badge">{t(data.launch_send_enabled ? 'admin.leads.sendOn' : 'admin.leads.sendOff')}</p>
    </>
  );

  if (!data.available || !summary) {
    return (
      <section className="admin-card at-head" data-leads="unavailable">
        <div><h2>{t('admin.leads.title')}</h2><p>{t('admin.leads.migrationMissing')}</p>{badges}</div>
      </section>
    );
  }

  const tiles: Array<{ key: string; value: string; note: string }> = [
    { key: 'confirmedPeople', value: fmt(summary.confirmed_people), note: t('admin.leads.note.confirmedPeople', { records: fmt(summary.confirmed_total) }) },
    { key: 'confirmedPremium', value: fmt(summary.confirmed_client_premium), note: t('admin.leads.note.segment') },
    { key: 'confirmedAdvertiser', value: fmt(summary.confirmed_advertiser), note: t('admin.leads.note.segment') },
    { key: 'pending', value: fmt(summary.pending), note: t('admin.leads.note.pending', { expired: fmt(summary.pending_expired) }) },
    { key: 'new7', value: fmt(summary.new_confirmed_7d), note: t('admin.leads.note.confirmedOnly') },
    { key: 'new30', value: fmt(summary.new_confirmed_30d), note: t('admin.leads.note.confirmedOnly') },
    { key: 'rate', value: summary.confirmation_rate === null ? '–' : `${summary.confirmation_rate.toLocaleString(numberLocales[lang] || 'de-DE')} %`, note: t('admin.leads.note.rate', { submissions: fmt(summary.submissions) }) },
    { key: 'unsubscribed', value: fmt(summary.unsubscribed), note: t('admin.leads.note.unsubscribed') }
  ];

  return (
    <div className="at-root" data-leads="ready">
      <section className="admin-card at-head">
        <div>
          <h2>{t('admin.leads.title')}</h2>
          <p>{t('admin.leads.intro')}</p>
          {badges}
        </div>
        <div className="at-controls">
          <button type="button" aria-label={t('admin.traffic.refresh')} title={t('admin.traffic.refresh')} onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} /></button>
        </div>
      </section>

      <section className="admin-stat-grid at-tiles" aria-label={t('admin.leads.kpis')}>
        {tiles.map((tile) => (
          <article className="admin-stat-card" key={tile.key} data-kpi={tile.key}>
            <span>{t(`admin.leads.kpi.${tile.key}`)}</span>
            <strong>{tile.value}</strong>
            <small>{tile.note}</small>
          </article>
        ))}
      </section>

      <section className="admin-card">
        <div className="at-chart-head"><h3>{t('admin.leads.dailyChart')}</h3></div>
        <div className="at-chart" role="img" aria-label={t('admin.leads.dailyChart')}>
          {summary.daily.map((day) => {
            const value = day.client_premium + day.advertiser;
            return (
              <div className="at-bar-slot" key={day.day} tabIndex={0} aria-label={`${day.day}: ${fmt(value)}`}>
                <div className="at-bar" style={{ height: `${Math.max(value ? 4 : 0, (value / max) * 100)}%` }} />
                <span className="at-tip" role="tooltip">{day.day}<br /><strong>{fmt(value)}</strong><br />{t('admin.leads.segment.client_premium')}: {fmt(day.client_premium)}<br />{t('admin.leads.segment.advertiser')}: {fmt(day.advertiser)}</span>
              </div>
            );
          })}
        </div>
        <div className="at-axis"><span>{summary.daily[0]?.day}</span><span>{t('admin.traffic.max', { value: fmt(max) })}</span><span>{summary.daily[summary.daily.length - 1]?.day}</span></div>
        <details className="at-table">
          <summary>{t('admin.traffic.tableView')}</summary>
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>{t('admin.traffic.day')}</th><th>{t('admin.leads.segment.client_premium')}</th><th>{t('admin.leads.segment.advertiser')}</th><th>{t('admin.leads.submitted')}</th></tr></thead>
              <tbody>{[...summary.daily].reverse().map((day) => <tr key={day.day}><td>{day.day}</td><td>{fmt(day.client_premium)}</td><td>{fmt(day.advertiser)}</td><td>{fmt(day.submitted)}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="at-lists">
        <LeadList title={t('admin.leads.languages')} empty={t('admin.leads.empty')} rows={summary.languages.map((row) => ({ label: row.name.toUpperCase(), value: row.count }))} fmt={fmt} />
        <LeadList title={t('admin.leads.sources')} empty={t('admin.leads.empty')} rows={summary.sources.map((row) => ({ label: t(`admin.leads.source.${row.name}`), value: row.count }))} fmt={fmt} />
        <section className="admin-card at-rank">
          <h3>{t('admin.leads.actions')}</h3>
          <p className="at-note">{t('admin.leads.actionsNote')}</p>
          {segments.map((type) => (
            <div className="at-lead-actions" key={type}>
              <strong>{t(`admin.leads.segment.${type}`)}</strong>
              <div>
                <button type="button" className="button" onClick={() => exportSegment(type)}><Download size={14} /> {t('admin.leads.export')}</button>
                <button type="button" className="button" onClick={() => loadPreview(type)}><Eye size={14} /> {t('admin.leads.preview')}</button>
                {data.launch_send_enabled && data.mail_configured ? <button type="button" className="button" onClick={() => send(type)}><Send size={14} /> {t('admin.leads.send')}</button> : null}
              </div>
            </div>
          ))}
          {notice ? <p className="at-note" role="status">{notice}</p> : null}
        </section>
      </div>

      {preview ? (
        <section className="admin-card" data-leads-preview={preview.interest_type}>
          <h3>{t('admin.leads.previewTitle', { segment: t(`admin.leads.segment.${preview.interest_type}`) })}</h3>
          <p className="at-note">{t('admin.leads.previewMeta', { recipients: fmt(preview.recipients) })}{preview.already_sent ? ` · ${t('admin.leads.alreadySent')}` : ''}{!preview.send_enabled ? ` · ${t('admin.leads.sendOff')}` : ''}</p>
          <p><strong>{preview.subject}</strong></p>
          <pre className="at-mail-preview">{preview.text}</pre>
        </section>
      ) : null}

      {data.announcements?.length ? (
        <section className="admin-card">
          <h3>{t('admin.leads.announcements')}</h3>
          <ul>{data.announcements.map((item) => <li key={item.interest_type}>{t(`admin.leads.segment.${item.interest_type}`)}: {item.status} · {fmt(item.sent)} / {fmt(item.recipients)} · {t('admin.leads.failed')}: {fmt(item.failed)}</li>)}</ul>
        </section>
      ) : null}
      <p className="at-footnote">{t('admin.leads.methodNote', { pending: data.retention.pendingDays, unsubscribed: data.retention.unsubscribedDays, confirmed: data.retention.confirmedDays })}</p>
    </div>
  );
}

function LeadList({ title, rows, empty, fmt }: { title: string; rows: { label: string; value: number }[]; empty: string; fmt: (value: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="admin-card at-rank">
      <h3>{title}</h3>
      {rows.length ? (
        <ol>
          {rows.map((row) => (
            <li key={row.label}>
              <div className="at-rank-line"><span>{row.label}</span><strong>{fmt(row.value)}</strong></div>
              <div className="at-rank-track"><div style={{ width: `${(row.value / max) * 100}%` }} /></div>
            </li>
          ))}
        </ol>
      ) : <p className="at-note">{empty}</p>}
    </section>
  );
}
