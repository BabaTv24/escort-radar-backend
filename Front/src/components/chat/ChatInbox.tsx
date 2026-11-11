import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n';
import type { ChatConversation } from '../../types';
import { ChatThread } from './ChatThread';
import './chat.css';

const POLL_MS = 15_000;

/** Conversation list + selected thread for one role ('client' office or 'owner' advertiser dashboard). */
export function ChatInbox({ token, role, emptyText, onUnreadChange }: {
  token: string;
  role: 'client' | 'owner';
  emptyText: string;
  onUnreadChange?: (unread: number) => void;
}) {
  const { t, lang } = useI18n();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unavailable'>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.chatConversations(token);
      setConversations(result.conversations.filter((item) => item.my_role === role));
      setState('ready');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 404 ? 'unavailable' : 'error');
    }
  }, [token, role]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const unread = useMemo(() => conversations.reduce((sum, item) => sum + (item.id === selectedId ? 0 : item.unread || 0), 0), [conversations, selectedId]);
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);

  const selected = conversations.find((item) => item.id === selectedId) || null;

  if (state === 'loading') return <div className="er-chat-thread is-loading" aria-busy="true"><i /><i /></div>;
  if (state === 'unavailable') return <div className="market-empty-state"><MessageCircle size={18} aria-hidden="true" /><p>{t('chat.unavailable')}</p></div>;
  if (state === 'error') {
    return (
      <div className="market-empty-state" role="alert">
        <p>{t('chat.error.list')}</p>
        <button type="button" className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" onClick={() => void load()}><span>{t('states.retry')}</span></button>
      </div>
    );
  }
  if (!conversations.length) return <div className="market-empty-state"><MessageCircle size={18} aria-hidden="true" /><p>{emptyText}</p></div>;

  return (
    <div className={`er-chat-inbox ${selected ? 'has-selection' : ''}`}>
      <div className="er-chat-list" role="list" aria-label={t('chat.listLabel')}>
        <div className="er-chat-list-head">
          <span>{t('chat.listLabel')}</span>
          <button type="button" className="er-chat-icon-button" onClick={() => void load()} aria-label={t('chat.refresh')}><RefreshCw size={15} aria-hidden="true" /></button>
        </div>
        {conversations.map((item) => {
          const name = item.counterpart_name || (role === 'owner' ? t('chat.clientFallback') : item.profile_name || t('chat.profileFallback'));
          const unreadCount = item.id === selectedId ? 0 : item.unread || 0;
          return (
            <button key={item.id} type="button" role="listitem" className={`er-chat-list-item ${item.id === selectedId ? 'active' : ''}`} aria-current={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
              <span className="er-chat-list-top">
                <strong>{name}</strong>
                {unreadCount ? <span className="er-chat-unread" aria-label={t('chat.unreadCount', { count: unreadCount })}>{unreadCount}</span> : null}
              </span>
              {role === 'owner' && item.profile_name ? <small>{item.profile_name}</small> : null}
              <span className="er-chat-list-preview">{item.last_message?.content || t('chat.noMessagesYet')}</span>
              <small>
                {item.last_message ? new Date(item.last_message.created_at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                {item.assistant_active ? ` · ${t('chat.mode.ai')}` : ''}
              </small>
            </button>
          );
        })}
      </div>
      <div className="er-chat-detail">
        {selected ? (
          <>
            <button type="button" className="text-button er-chat-back" onClick={() => setSelectedId(null)}>{t('chat.back')}</button>
            <ChatThread key={selected.id} token={token} sessionId={selected.id} onActivity={() => void load()} />
          </>
        ) : <p className="er-chat-empty">{t('chat.selectConversation')}</p>}
      </div>
    </div>
  );
}
