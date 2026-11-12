import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import type { TrafficDay, TrafficSummary, TrafficWindow } from '../lib/api';
import { useI18n } from '../i18n';
import './adminTraffic.css';

type Metric = Exclude<keyof TrafficDay, 'day'>;
const chartMetrics: Metric[] = ['page_views', 'visitors', 'radar_views', 'city_searches', 'profile_views', 'premium_cta', 'advertiser_cta'];
const numberLocales: Record<string, string> = { de: 'de-DE', pl: 'pl-PL', en: 'en-GB' };

/** Traffic Intelligence (ER-V1-PUBLIC-PREVIEW-001): aggregated, pseudonymous figures from traffic_summary(). */
export function AdminTrafficIntelligence({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const [days, setDays] = useState<7 | 30>(30);
  const [metric, setMetric] = useState<Metric>('page_views');
  const [data, setData] = useState<TrafficSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [preview, setPreview] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [reload, setReload] = useState(0);
  const fmt = (value: number) => Number(value || 0).toLocaleString(numberLocales[lang] || 'de-DE');

  useEffect(() => {
    let active = true;
    setState('loading');
    api.adminTraffic(token, days)
      .then((response) => {
        if (!active) return;
        setData(response.traffic);
        setPreview(!response.commercial_operations_enabled);
        setCollecting(response.analytics_collection_enabled === true);
        setState('ready');
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [token, days, reload]);

  const period = data?.trends[days === 7 ? '7d' : '30d'];
  const max = useMemo(() => Math.max(1, ...(data?.daily || []).map((day) => Number(day[metric] || 0))), [data, metric]);

  if (state === 'error') return <section className="admin-card"><h2>{t('admin.traffic.title')}</h2><p className="error-text">{t('admin.traffic.loadError')}</p></section>;
  if (!data || !period) return <section className="admin-card"><h2>{t('admin.traffic.title')}</h2><p>{t('states.loading')}</p></section>;

  const trend = (current: number, previous: number) => {
    if (!previous) return current ? t('admin.traffic.trendNew') : '–';
    const change = Math.round(((current - previous) / previous) * 100);
    return `${change > 0 ? '+' : ''}${change} %`;
  };
  const per100 = (count: number) => (period.page_views ? (count / period.page_views * 100).toLocaleString(numberLocales[lang] || 'de-DE', { maximumFractionDigits: 1 }) : '0');

  const tiles: Array<{ key: string; value: number; note: string }> = [
    { key: 'pageViews', value: period.page_views, note: `${trend(period.page_views, period.page_views_previous)} ${t('admin.traffic.vsPrevious', { days })}` },
    { key: 'visitors', value: period.visitor_days, note: `${t('admin.traffic.avgPerDay', { value: (period.visitor_days / days).toLocaleString(numberLocales[lang] || 'de-DE', { maximumFractionDigits: 1 }) })} · ${trend(period.visitor_days, period.visitor_days_previous)}` },
    { key: 'radarViews', value: period.radar_views, note: t('admin.traffic.periodNote', { days }) },
    { key: 'citySearches', value: period.city_searches, note: t('admin.traffic.periodNote', { days }) },
    { key: 'profileViews', value: period.profile_views, note: t('admin.traffic.periodNote', { days }) },
    { key: 'premiumCta', value: period.premium_cta, note: t('admin.traffic.per100', { value: per100(period.premium_cta) }) },
    { key: 'advertiserCta', value: period.advertiser_cta, note: t('admin.traffic.per100', { value: per100(period.advertiser_cta) }) },
    { key: 'newAccounts', value: period.new_client_accounts + period.new_advertiser_accounts, note: t('admin.traffic.newAccountsSplit', { clients: fmt(period.new_client_accounts), advertisers: fmt(period.new_advertiser_accounts) }) }
  ];
  const daily = data.daily.slice(-days);

  return (
    <div className="at-root">
      <section className="admin-card at-head">
        <div>
          <h2>{t('admin.traffic.title')}</h2>
          <p>{t('admin.traffic.privacyNote')}</p>
          {preview ? <p className="at-badge">{t('admin.traffic.previewMode')}</p> : null}
          {!collecting ? <p className="at-badge" role="status">{t('admin.traffic.collectionDisabled')}</p> : null}
        </div>
        <div className="at-controls" role="group" aria-label={t('admin.traffic.period')}>
          {([7, 30] as const).map((value) => (
            <button key={value} type="button" className={days === value ? 'active' : ''} aria-pressed={days === value} onClick={() => setDays(value)}>{t('admin.traffic.days', { days: value })}</button>
          ))}
          <button type="button" aria-label={t('admin.traffic.refresh')} title={t('admin.traffic.refresh')} onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} /></button>
        </div>
      </section>

      <section className="admin-stat-grid at-tiles" aria-label={t('admin.traffic.kpis')}>
        {tiles.map((tile) => (
          <article className="admin-stat-card" key={tile.key}>
            <span>{t(`admin.traffic.kpi.${tile.key}`)}</span>
            <strong>{fmt(tile.value)}</strong>
            <small>{tile.note}</small>
          </article>
        ))}
      </section>

      <section className="admin-card">
        <div className="at-chart-head">
          <h3>{t('admin.traffic.dailyChart')}</h3>
          <select value={metric} onChange={(event) => setMetric(event.target.value as Metric)} aria-label={t('admin.traffic.metric')}>
            {chartMetrics.map((item) => <option key={item} value={item}>{t(`admin.traffic.metric.${item}`)}</option>)}
          </select>
        </div>
        <div className="at-chart" role="img" aria-label={`${t(`admin.traffic.metric.${metric}`)} · ${data.first_day} – ${data.last_day}`}>
          {daily.map((day) => {
            const value = Number(day[metric] || 0);
            return (
              <div className="at-bar-slot" key={day.day} tabIndex={0} aria-label={`${day.day}: ${fmt(value)}`}>
                <div className="at-bar" style={{ height: `${Math.max(value ? 4 : 0, (value / max) * 100)}%` }} />
                <span className="at-tip" role="tooltip">{day.day}<br /><strong>{fmt(value)}</strong></span>
              </div>
            );
          })}
        </div>
        <div className="at-axis"><span>{daily[0]?.day}</span><span>{t('admin.traffic.max', { value: fmt(max) })}</span><span>{daily[daily.length - 1]?.day}</span></div>
        <details className="at-table">
          <summary>{t('admin.traffic.tableView')}</summary>
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>{t('admin.traffic.day')}</th>{chartMetrics.map((item) => <th key={item}>{t(`admin.traffic.metric.${item}`)}</th>)}</tr></thead>
              <tbody>{[...daily].reverse().map((day) => <tr key={day.day}><td>{day.day}</td>{chartMetrics.map((item) => <td key={item}>{fmt(Number(day[item] || 0))}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="at-lists">
        <RankList title={t('admin.traffic.topCities')} empty={t('admin.traffic.empty')} rows={data.top_cities.map((row) => ({ label: row.city, value: row.searches + row.views, detail: t('admin.traffic.cityDetail', { searches: fmt(row.searches), views: fmt(row.views) }) }))} fmt={fmt} />
        <RankList title={t('admin.traffic.topProfiles')} empty={t('admin.traffic.empty')} rows={data.top_profiles.map((row) => ({ label: row.display_name ? `${row.display_name}${row.city ? ` · ${row.city}` : ''}` : row.profile_ref, value: row.views }))} fmt={fmt} />
        <RankList title={t('admin.traffic.sources')} empty={t('admin.traffic.empty')} rows={data.sources.map((row) => ({ label: row.source === 'direct' ? t('admin.traffic.direct') : row.source, value: row.page_views }))} fmt={fmt} />
        <RankList title={t('admin.traffic.devices')} empty={t('admin.traffic.empty')} rows={data.devices.map((row) => ({ label: t(`admin.traffic.device.${row.device}`), value: row.page_views }))} fmt={fmt} />
        <RankList title={t('admin.traffic.countries')} empty={t('admin.traffic.empty')} note={t('admin.traffic.countriesNote')} rows={data.countries.map((row) => ({ label: row.country === 'unknown' ? t('admin.traffic.unknown') : row.country, value: row.page_views }))} fmt={fmt} />
      </div>
      <p className="at-footnote">{t('admin.traffic.methodNote')}</p>
    </div>
  );
}

function RankList({ title, rows, empty, note, fmt }: { title: string; rows: { label: string; value: number; detail?: string }[]; empty: string; note?: string; fmt: (value: number) => string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="admin-card at-rank">
      <h3>{title}</h3>
      {note ? <p className="at-note">{note}</p> : null}
      {rows.length ? (
        <ol>
          {rows.map((row) => (
            <li key={row.label}>
              <div className="at-rank-line"><span>{row.label}</span><strong>{fmt(row.value)}</strong></div>
              <div className="at-rank-track"><div style={{ width: `${(row.value / max) * 100}%` }} /></div>
              {row.detail ? <small>{row.detail}</small> : null}
            </li>
          ))}
        </ol>
      ) : <p className="at-note">{empty}</p>}
    </section>
  );
}
