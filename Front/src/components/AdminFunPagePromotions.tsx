import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type AdminFunPageAdvertisement, type AdminFunPagePromotionSettings } from '../lib/api';
import { useI18n } from '../i18n';

type Status = { kind: 'success' | 'error'; message: string } | null;

export function AdminFunPagePromotions({ token }: { token: string }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AdminFunPagePromotionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [status, setStatus] = useState<Status>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.adminFunPageAdvertisement(token);
      setSettings(result.settings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('states.requestFailed'));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => { void load(); }, [load]);

  async function addAdvertisement() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.createAdminFunPageAdvertisement(token);
      setSettings(result.settings);
      setExpandedId(result.advertisement.id);
      setStatus({ kind: 'success', message: t('admin.advertisement.addSuccess') });
    } catch (reason) {
      setStatus({ kind: 'error', message: reason instanceof Error ? reason.message : t('states.requestFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function moveAdvertisement(index: number, direction: -1 | 1) {
    if (!settings) return;
    const target = index + direction;
    if (target < 0 || target >= settings.advertisements.length) return;
    const ids = settings.advertisements.map((advertisement) => advertisement.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.reorderAdminFunPageAdvertisements(token, ids);
      setSettings(result.settings);
      setStatus({ kind: 'success', message: t('admin.advertisement.orderSuccess') });
    } catch (reason) {
      setStatus({ kind: 'error', message: reason instanceof Error ? reason.message : t('states.requestFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function deleteAdvertisement(advertisement: AdminFunPageAdvertisement) {
    if (!window.confirm(t('admin.advertisement.deleteConfirm'))) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.deleteAdminFunPageAdvertisement(token, advertisement.id);
      setSettings(result.settings);
      setExpandedId('');
      setStatus({ kind: 'success', message: t('admin.advertisement.deleteAdvertisementSuccess') });
    } catch (reason) {
      setStatus({ kind: 'error', message: reason instanceof Error ? reason.message : t('states.requestFailed') });
    } finally {
      setBusy(false);
    }
  }

  async function saveConfiguration() {
    if (!settings) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await api.saveAdminFunPagePromotionConfiguration(token, {
        rotationIntervalSeconds: settings.rotationIntervalSeconds,
        ticker: settings.ticker
      });
      setSettings(result.settings);
      setStatus({ kind: 'success', message: t('admin.advertisement.configurationSuccess') });
    } catch (reason) {
      setStatus({ kind: 'error', message: reason instanceof Error ? reason.message : t('states.requestFailed') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-card admin-advertisement-settings">
        <div className="profile-studio-head compact">
          <div>
            <p className="eyebrow">{t('admin.advertisement.eyebrow')}</p>
            <h2>{t('admin.advertisement.titlePlural')}</h2>
          </div>
          <button type="button" className="button primary" disabled={busy} onClick={addAdvertisement}><Plus size={17} /> {t('admin.advertisement.add')}</button>
        </div>

        {loading ? <p className="admin-muted" role="status">{t('states.loading')}</p> : null}
        {error ? (
          <div className="admin-advertisement-error" role="alert">
            <p className="error-text">{error}</p>
            <button type="button" className="button" onClick={load}>{t('states.retry')}</button>
          </div>
        ) : null}
        {!loading && !error && settings && settings.advertisements.length === 0 ? (
          <div className="admin-advertisement-empty">
            <p>{t('admin.advertisement.empty')}</p>
            <button type="button" className="button primary" disabled={busy} onClick={addAdvertisement}><Plus size={17} /> {t('admin.advertisement.addFirst')}</button>
          </div>
        ) : null}
        {settings?.advertisements.map((advertisement, index) => (
          <AdvertisementAdminCard
            key={advertisement.id}
            token={token}
            advertisement={advertisement}
            index={index}
            total={settings.advertisements.length}
            expanded={expandedId === advertisement.id}
            disabled={busy}
            onToggle={() => setExpandedId((current) => current === advertisement.id ? '' : advertisement.id)}
            onMove={(direction) => moveAdvertisement(index, direction)}
            onDelete={() => deleteAdvertisement(advertisement)}
            onSaved={(nextSettings, message, kind = 'success') => {
              setSettings(nextSettings);
              setStatus({ kind, message });
            }}
            onStatus={setStatus}
          />
        ))}
        {status ? <p className={status.kind === 'success' ? 'success-text' : 'error-text'} role={status.kind === 'success' ? 'status' : 'alert'}>{status.message}</p> : null}
      </section>

      <section className="admin-card admin-promotion-configuration">
        <div>
          <p className="eyebrow">{t('admin.advertisement.rotationEyebrow')}</p>
          <h2>{t('admin.advertisement.rotationTitle')}</h2>
        </div>
        <label className="admin-field">
          <span>{t('admin.advertisement.rotationInterval')}</span>
          <input
            type="number"
            min={3}
            max={30}
            value={settings?.rotationIntervalSeconds ?? 6}
            disabled={!settings || busy}
            onChange={(event) => setSettings((current) => current ? { ...current, rotationIntervalSeconds: Number(event.target.value) } : current)}
          />
          <small>{t('admin.advertisement.rotationHelp')}</small>
        </label>
        <button type="button" className="button primary" disabled={!settings || busy} onClick={saveConfiguration}>{busy ? t('states.loading') : t('admin.advertisement.saveRotation')}</button>
      </section>

      <section className="admin-card admin-ticker-settings">
        <div>
          <p className="eyebrow">{t('admin.ticker.eyebrow')}</p>
          <h2>{t('admin.ticker.title')}</h2>
        </div>
        <label className="admin-check-row">
          <input type="checkbox" checked={settings?.ticker.active || false} disabled={!settings || busy} onChange={(event) => setSettings((current) => current ? { ...current, ticker: { ...current.ticker, active: event.target.checked } } : current)} />
          {t('admin.ticker.active')}
        </label>
        <div className="admin-form-grid">
          <label className="admin-field">
            <span>{t('admin.ticker.text')}</span>
            <textarea maxLength={500} value={settings?.ticker.text || ''} disabled={!settings || busy} onChange={(event) => setSettings((current) => current ? { ...current, ticker: { ...current.ticker, text: event.target.value } } : current)} />
          </label>
          <label className="admin-field">
            <span>{t('admin.ticker.speed')}</span>
            <select value={settings?.ticker.speed || 'normal'} disabled={!settings || busy} onChange={(event) => setSettings((current) => current ? { ...current, ticker: { ...current.ticker, speed: event.target.value as 'slow' | 'normal' | 'fast' } } : current)}>
              <option value="slow">{t('admin.ticker.speedSlow')}</option>
              <option value="normal">{t('admin.ticker.speedNormal')}</option>
              <option value="fast">{t('admin.ticker.speedFast')}</option>
            </select>
          </label>
          <label className="admin-field">
            <span>{t('admin.ticker.targetUrl')}</span>
            <input maxLength={2048} value={settings?.ticker.targetUrl || ''} disabled={!settings || busy} onChange={(event) => setSettings((current) => current ? { ...current, ticker: { ...current.ticker, targetUrl: event.target.value || null } } : current)} />
          </label>
          <label className="admin-check-row">
            <input type="checkbox" checked={settings?.ticker.openInNewTab || false} disabled={!settings || busy} onChange={(event) => setSettings((current) => current ? { ...current, ticker: { ...current.ticker, openInNewTab: event.target.checked } } : current)} />
            {t('admin.advertisement.openInNewTab')}
          </label>
        </div>
        <div className="admin-ticker-preview" aria-label={t('admin.ticker.preview')}>
          <span>{settings?.ticker.text || t('admin.ticker.previewEmpty')}</span>
        </div>
        <button type="button" className="button primary" disabled={!settings || busy} onClick={saveConfiguration}>{busy ? t('states.loading') : t('admin.ticker.save')}</button>
      </section>
    </>
  );
}

function AdvertisementAdminCard({
  token,
  advertisement,
  index,
  total,
  expanded,
  disabled,
  onToggle,
  onMove,
  onDelete,
  onSaved,
  onStatus
}: {
  token: string;
  advertisement: AdminFunPageAdvertisement;
  index: number;
  total: number;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onSaved: (settings: AdminFunPagePromotionSettings, message: string, kind?: 'success' | 'error') => void;
  onStatus: (status: Status) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState(() => formFromAdvertisement(advertisement));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(advertisement.image?.publicUrl || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(formFromAdvertisement(advertisement));
    setFile(null);
    setPreview(advertisement.image?.publicUrl || '');
  }, [advertisement]);

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  function selectFile(nextFile: File | null) {
    if (!nextFile) return;
    if (file && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  async function save() {
    setSaving(true);
    try {
      const body = new FormData();
      body.set('settings', JSON.stringify({
        active: form.active,
        targetUrl: form.targetUrl.trim() || null,
        altText: form.altText.trim(),
        openInNewTab: form.openInNewTab,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null
      }));
      if (file) body.set('image', file);
      const result = await api.saveAdminFunPageAdvertisement(token, advertisement.id, body);
      onSaved(result.settings, result.warning || t('admin.advertisement.saveSuccess'), result.warning ? 'error' : 'success');
    } catch (reason) {
      onStatus({ kind: 'error', message: reason instanceof Error ? reason.message : t('states.requestFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function deleteImage() {
    setSaving(true);
    try {
      const result = await api.deleteAdminFunPageAdvertisementImage(token, advertisement.id);
      onSaved(result.settings, t('admin.advertisement.deleteSuccess'));
    } catch (reason) {
      onStatus({ kind: 'error', message: reason instanceof Error ? reason.message : t('states.requestFailed') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="admin-advertisement-card">
      <div className="admin-advertisement-summary">
        <div className="admin-advertisement-thumb">
          {advertisement.image?.publicUrl ? <img src={advertisement.image.publicUrl} alt="" /> : <span>{t('admin.advertisement.noImage')}</span>}
        </div>
        <div>
          <strong>{t('admin.advertisement.cardTitle', { count: index + 1 })}</strong>
          <small>{advertisement.active ? t('admin.advertisement.active') : t('admin.advertisement.inactive')}</small>
          <small>{scheduleSummary(advertisement, t('admin.advertisement.noSchedule'))}</small>
          <small>{advertisement.targetUrl || t('admin.advertisement.noTargetUrl')}</small>
        </div>
        <div className="admin-advertisement-card-actions">
          <button type="button" className="button icon-button" aria-label={t('admin.advertisement.moveUp')} disabled={disabled || index === 0} onClick={() => onMove(-1)}><ChevronUp size={17} /></button>
          <button type="button" className="button icon-button" aria-label={t('admin.advertisement.moveDown')} disabled={disabled || index === total - 1} onClick={() => onMove(1)}><ChevronDown size={17} /></button>
          <button type="button" className="button" disabled={disabled} onClick={onToggle}><Pencil size={16} /> {t('admin.actions.edit')}</button>
          <button type="button" className="button danger icon-button" aria-label={t('admin.advertisement.deleteAdvertisement')} disabled={disabled} onClick={onDelete}><Trash2 size={17} /></button>
        </div>
      </div>
      {expanded ? (
        <div className="admin-advertisement-editor">
          <label className="admin-check-row"><input type="checkbox" checked={form.active} disabled={saving} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> {t('admin.advertisement.enabled')}</label>
          <div className="admin-advertisement-image-editor">
            <label className="admin-field">
              <span>{t('admin.advertisement.image')}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => selectFile(event.target.files?.[0] || null)} />
              <small>{t('admin.advertisement.imageRecommendation')}</small>
            </label>
            {preview ? <img src={preview} alt={t('admin.advertisement.preview')} /> : <p className="admin-muted">{t('admin.advertisement.noImage')}</p>}
            <button type="button" className="button danger" disabled={saving || !advertisement.image} onClick={deleteImage}>{t('admin.advertisement.deleteImage')}</button>
          </div>
          <div className="admin-form-grid">
            <label className="admin-field"><span>{t('admin.advertisement.targetUrl')}</span><input maxLength={2048} value={form.targetUrl} disabled={saving} onChange={(event) => setForm({ ...form, targetUrl: event.target.value })} /></label>
            <label className="admin-field"><span>{t('admin.advertisement.altText')}</span><input maxLength={200} value={form.altText} disabled={saving} onChange={(event) => setForm({ ...form, altText: event.target.value })} /></label>
            <label className="admin-field"><span>{t('admin.advertisement.startsAt')}</span><input type="datetime-local" value={form.startsAt} disabled={saving} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
            <label className="admin-field"><span>{t('admin.advertisement.endsAt')}</span><input type="datetime-local" value={form.endsAt} disabled={saving} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
          </div>
          <label className="admin-check-row"><input type="checkbox" checked={form.openInNewTab} disabled={saving} onChange={(event) => setForm({ ...form, openInNewTab: event.target.checked })} /> {t('admin.advertisement.openInNewTab')}</label>
          <button type="button" className="button primary" disabled={saving} onClick={save}>{saving ? t('states.loading') : t('admin.advertisement.saveCard')}</button>
        </div>
      ) : null}
    </article>
  );
}

function formFromAdvertisement(advertisement: AdminFunPageAdvertisement) {
  return {
    active: advertisement.active,
    targetUrl: advertisement.targetUrl || '',
    altText: advertisement.altText,
    openInNewTab: advertisement.openInNewTab,
    startsAt: toDateTimeLocal(advertisement.startsAt),
    endsAt: toDateTimeLocal(advertisement.endsAt)
  };
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function scheduleSummary(advertisement: AdminFunPageAdvertisement, fallback: string) {
  if (!advertisement.startsAt && !advertisement.endsAt) return fallback;
  return `${advertisement.startsAt ? new Date(advertisement.startsAt).toLocaleString() : '…'} — ${advertisement.endsAt ? new Date(advertisement.endsAt).toLocaleString() : '…'}`;
}
