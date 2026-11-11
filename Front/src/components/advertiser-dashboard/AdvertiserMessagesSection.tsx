import { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n';
import type { CommunicationSettingsRow } from '../../types';
import { ChatInbox } from '../chat/ChatInbox';
import '../chat/chat.css';

type SettingKey = 'text_chat_enabled' | 'ai_assistant_enabled';

/** Advertiser messages: per-profile Text chat / AI assistant switches and the customer conversations. */
export function AdvertiserMessagesSection({ token }: { token: string }) {
  const { t } = useI18n();
  const [profiles, setProfiles] = useState<CommunicationSettingsRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.communicationSettings(token);
      setProfiles(result.profiles);
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? 'unavailable' : 'error');
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(row: CommunicationSettingsRow, key: SettingKey) {
    setSaving(`${row.profile_id}:${key}`);
    setFeedback(null);
    try {
      const saved = await api.saveCommunicationSettings(token, { profile_id: row.profile_id, [key]: !row[key] });
      setProfiles((current) => current.map((item) => (item.profile_id === row.profile_id ? { ...item, ...saved } : item)));
      setFeedback({ tone: 'success', text: t('chat.settings.saved') });
    } catch {
      setFeedback({ tone: 'error', text: t('chat.settings.error') });
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="advertiser-stage-three er-chat-section" aria-labelledby="advertiser-messages-title">
      <header className="advertiser-dashboard-heading compact">
        <div>
          <p className="eyebrow">Escort Radar</p>
          <h1 id="advertiser-messages-title">{t('advertiserDashboard.section.messages')}</h1>
          <p>{t('chat.advertiser.subtitle')}</p>
        </div>
        <MessageCircle size={30} aria-hidden="true" />
      </header>

      <section className="advertiser-dashboard-panel" aria-labelledby="advertiser-chat-settings-title">
        <div className="advertiser-dashboard-panel-head">
          <div>
            <p className="eyebrow">{t('chat.settings.eyebrow')}</p>
            <h2 id="advertiser-chat-settings-title">{t('chat.settings.title')}</h2>
          </div>
        </div>
        {state === 'loading' ? <div className="er-chat-thread is-loading" aria-busy="true"><i /></div> : null}
        {state === 'unavailable' ? <p className="muted">{t('chat.unavailable')}</p> : null}
        {state === 'error' ? (
          <div className="advertiser-data-state error" role="alert">
            <p>{t('chat.settings.loadError')}</p>
            <button type="button" className="button primary" onClick={() => void load()}>{t('advertiserDashboard.retry')}</button>
          </div>
        ) : null}
        {state === 'ready' && !profiles.length ? <p className="muted">{t('chat.settings.noProfile')}</p> : null}
        {state === 'ready' ? profiles.map((row) => (
          <div className="er-chat-settings" key={row.profile_id}>
            {profiles.length > 1 ? <strong>{row.display_name}</strong> : null}
            {(['text_chat_enabled', 'ai_assistant_enabled'] as const).map((key) => (
              <div className="er-chat-setting" key={key}>
                <div>
                  <strong id={`${row.profile_id}-${key}`}>{t(`chat.settings.${key}`)}</strong>
                  <small>{t(`chat.settings.${key}.hint`)}</small>
                </div>
                <button type="button" role="switch" className="er-chat-switch" aria-checked={row[key]} aria-labelledby={`${row.profile_id}-${key}`}
                  disabled={saving === `${row.profile_id}:${key}`} onClick={() => void toggle(row, key)} />
              </div>
            ))}
            <div className="er-chat-setting">
              <div>
                <strong id={`${row.profile_id}-video`}>{t('chat.settings.video')}</strong>
                <small>{t('chat.settings.videoUnavailable')}</small>
              </div>
              <button type="button" role="switch" className="er-chat-switch" aria-checked={false} aria-labelledby={`${row.profile_id}-video`} disabled />
            </div>
          </div>
        )) : null}
        {feedback ? <p className={feedback.tone === 'success' ? 'success' : 'error-text'} role={feedback.tone === 'success' ? 'status' : 'alert'}>{feedback.text}</p> : null}
      </section>

      <section className="advertiser-dashboard-panel" aria-labelledby="advertiser-conversations-title">
        <div className="advertiser-dashboard-panel-head">
          <div>
            <p className="eyebrow">{t('chat.advertiser.eyebrow')}</p>
            <h2 id="advertiser-conversations-title">{t('chat.advertiser.conversations')}</h2>
          </div>
        </div>
        <ChatInbox token={token} role="owner" emptyText={t('chat.advertiser.empty')} />
      </section>
    </section>
  );
}
