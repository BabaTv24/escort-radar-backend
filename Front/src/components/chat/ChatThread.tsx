import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, Send, UserRound } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n';
import type { ChatConversation, SponsoredChatMessage } from '../../types';
import './chat.css';

const POLL_MS = 8_000;

/**
 * One conversation on the existing profile chat. Used by the client (profile page, client office)
 * and by the owner (advertiser messages). Replies arrive by polling while the tab is visible.
 */
export function ChatThread({ token, sessionId, onActivity }: { token: string; sessionId: string; onActivity?: () => void }) {
  const { t, lang } = useI18n();
  const [session, setSession] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<SponsoredChatMessage[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const result = await api.sponsoredChat(token, sessionId);
      setSession(result.session);
      setMessages(result.messages);
      setState('ready');
    } catch {
      setState((current) => (current === 'ready' ? current : 'error'));
    }
  }, [token, sessionId]);

  useEffect(() => {
    setState('loading');
    lastCount.current = 0;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      if (lastCount.current) onActivity?.();
      lastCount.current = messages.length;
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [messages, onActivity]);

  const isOwner = session?.my_role === 'owner';
  const chatClosedForClient = !isOwner && session?.communication.text_chat === false;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError('');
    try {
      const sent = await api.sendSponsoredChatMessage(token, sessionId, content, lang);
      setMessages((current) => [...current, sent.message, ...(sent.agent_message ? [sent.agent_message] : [])]);
      setDraft('');
      if (isOwner && session?.handled_by === 'agent') await load();
      onActivity?.();
    } catch (failure) {
      const code = failure instanceof ApiError ? String(failure.payload?.code || '') : '';
      setError(t(code === 'TEXT_CHAT_DISABLED' ? 'chat.error.disabled' : code === 'CHAT_CLOSED' ? 'chat.error.closed' : 'chat.error.send'));
      if (code === 'TEXT_CHAT_DISABLED') await load();
    } finally {
      setSending(false);
    }
  }

  async function toggleHandler() {
    if (!session) return;
    setSwitching(true);
    setError('');
    try {
      const result = session.handled_by === 'agent' ? await api.takeoverChat(token, sessionId) : await api.releaseChat(token, sessionId);
      setSession((current) => (current ? { ...current, ...result.session } : result.session));
      onActivity?.();
    } catch {
      setError(t('chat.error.handover'));
    } finally {
      setSwitching(false);
    }
  }

  if (state === 'loading') return <div className="er-chat-thread is-loading" aria-busy="true"><i /><i /><i /></div>;
  if (state === 'error' || !session) {
    return (
      <div className="er-chat-thread er-chat-state" role="alert">
        <p>{t('chat.error.load')}</p>
        <button type="button" className="button er-btn er-glass-btn er-glass-btn--gold er-glass-btn--sm" onClick={() => void load()}><span>{t('states.retry')}</span></button>
      </div>
    );
  }

  const counterpart = session.counterpart_name || (isOwner ? t('chat.clientFallback') : session.profile_name || t('chat.profileFallback'));
  return (
    <div className="er-chat-thread">
      <div className="er-chat-thread-head">
        <div>
          <strong>{counterpart}</strong>
          <span className={`er-chat-mode ${session.assistant_active ? 'is-ai' : 'is-human'}`}>
            {session.assistant_active ? <Bot size={14} aria-hidden="true" /> : <UserRound size={14} aria-hidden="true" />}
            {session.assistant_active ? t('chat.mode.ai') : session.handled_by === 'owner' ? t(isOwner ? 'chat.mode.ownerYou' : 'chat.mode.owner') : t('chat.mode.waiting')}
          </span>
        </div>
        {isOwner && !session.awaiting_owner_activation ? (
          <button type="button" className="button er-btn er-glass-btn er-glass-btn--sm" disabled={switching} onClick={() => void toggleHandler()}>
            <span>{session.handled_by === 'agent' ? t('chat.takeover') : t('chat.release')}</span>
          </button>
        ) : null}
      </div>
      {isOwner && session.handled_by === 'owner' && !session.communication.ai_assistant ? <p className="er-chat-hint">{t('chat.aiOffHint')}</p> : null}

      <div className="er-chat-messages" ref={listRef} aria-live="polite">
        {!messages.length ? <p className="er-chat-empty">{t('chat.emptyThread')}</p> : null}
        {messages.map((message) => {
          const mine = isOwner ? message.sender_type === 'owner' : message.sender_type === 'client';
          const author = message.sender_type === 'agent'
            ? t('chat.author.ai')
            : mine ? t('chat.author.you') : isOwner ? counterpart : session.profile_name || t('chat.profileFallback');
          return (
            <article key={message.id} className={`er-chat-message ${mine ? 'is-mine' : ''} is-${message.sender_type}`}>
              <header>
                {message.sender_type === 'agent' ? <Bot size={13} aria-hidden="true" /> : null}
                <strong>{author}</strong>
                <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })}</time>
              </header>
              <p>{message.content}</p>
            </article>
          );
        })}
      </div>

      {chatClosedForClient ? <p className="er-chat-hint" role="status">{t('chat.error.disabled')}</p> : (
        <form className="er-chat-compose" onSubmit={send}>
          <label className="er-chat-sr-only" htmlFor={`chat-draft-${sessionId}`}>{t('chat.placeholder')}</label>
          <textarea id={`chat-draft-${sessionId}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2} placeholder={t('chat.placeholder')} required />
          <button type="submit" className="button primary er-btn er-glass-btn er-glass-btn--gold er-glass-btn--md" disabled={sending || !draft.trim()}>
            <Send size={15} aria-hidden="true" /> <span>{sending ? t('states.loading') : t('chat.send')}</span>
          </button>
        </form>
      )}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
