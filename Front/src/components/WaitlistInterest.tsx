import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Crown, MailCheck, Megaphone, ShieldCheck, X } from 'lucide-react';
import { ApiError, api, type WaitlistInterestType } from '../lib/api';
import { usePlatformStatus } from '../lib/platformStatus';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n';

/** Must match WAITLIST_CONSENT_VERSION on the server; a changed consent text needs a new version. */
export const WAITLIST_CONSENT_VERSION = 'waitlist-consent-2026-11-v1';
export type WaitlistSource = 'fanpage' | 'register' | 'pricing' | 'profile' | 'radar' | 'other';

const errorKeys: Record<string, string> = {
  WAITLIST_INVALID_EMAIL: 'waitlist.error.email',
  WAITLIST_CONSENT_REQUIRED: 'waitlist.error.consent',
  WAITLIST_RATE_LIMITED: 'waitlist.error.rateLimited',
  WAITLIST_MAIL_FAILED: 'waitlist.error.mailFailed',
  WAITLIST_MAIL_UNAVAILABLE: 'waitlist.error.unavailable',
  WAITLIST_DISABLED: 'waitlist.error.unavailable'
};

/**
 * Pre-launch interest action. Shown only during the public preview while the interest list is open;
 * otherwise the existing call to action (fallback) is rendered unchanged, so no second button appears.
 */
export function WaitlistInterestButton({ type, source, className, fallback, children }: {
  type: WaitlistInterestType;
  source: WaitlistSource;
  className?: string;
  fallback?: ReactNode;
  children?: ReactNode;
}) {
  const platform = usePlatformStatus();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const active = platform.loaded && !platform.commercial_operations_enabled && platform.waitlist_enabled;
  if (!active) return <>{fallback ?? null}</>;
  return (
    <>
      <button
        type="button"
        className={className || 'pr-btn is-primary'}
        data-waitlist={type}
        onClick={() => {
          trackEvent(type === 'advertiser' ? 'advertiser_cta_click' : 'premium_cta_click');
          setOpen(true);
        }}
      >
        {children ?? <>{type === 'advertiser' ? <Megaphone size={17} aria-hidden="true" /> : <Crown size={17} aria-hidden="true" />} {t(`waitlist.button.${type}`)}</>}
      </button>
      {open ? <WaitlistModal type={type} source={source} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function WaitlistModal({ type, source, onClose }: { type: WaitlistInterestType; source: WaitlistSource; onClose: () => void }) {
  const { t, lang } = useI18n();
  const titleId = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    emailRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], input:not([tabindex="-1"])')].filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!emailRef.current?.checkValidity()) return setError(t('waitlist.error.email'));
    if (!consent) return setError(t('waitlist.error.consent'));
    setState('sending');
    try {
      await api.waitlistInterest({ email: email.trim(), interest_type: type, language: lang, consent: true, consent_version: WAITLIST_CONSENT_VERSION, source_page: source, website });
      setState('sent');
    } catch (failure) {
      const code = failure instanceof ApiError ? String(failure.payload?.code || '') : '';
      setError(t(errorKeys[code] || 'waitlist.error.generic'));
      setState('idle');
    }
  }

  return createPortal(
    <div className="waitlist-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="waitlist-modal pr-card" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} data-waitlist-modal={type}>
        <button type="button" className="waitlist-close" aria-label={t('waitlist.modal.close')} onClick={onClose}><X size={18} aria-hidden="true" /></button>
        <p className="pr-eyebrow">{t('waitlist.modal.eyebrow')}</p>
        <h2 id={titleId} className="waitlist-title">
          {type === 'advertiser' ? <Megaphone size={20} aria-hidden="true" /> : <Crown size={20} aria-hidden="true" />} {t(`waitlist.product.${type}.name`)}
        </h2>
        <p className="waitlist-price">{t(`waitlist.product.${type}.price`)}</p>
        {state === 'sent' ? (
          <div className="waitlist-done" role="status">
            <p><MailCheck size={18} aria-hidden="true" /> {t('waitlist.sent.title')}</p>
            <p className="pr-muted">{t('waitlist.sent.body', { email: email.trim() })}</p>
            <p className="pr-muted">{t('waitlist.sent.duplicate')}</p>
            <button type="button" className="pr-btn is-primary" onClick={onClose}>{t('waitlist.modal.close')}</button>
          </div>
        ) : (
          <form className="waitlist-form" onSubmit={submit} noValidate>
            <p className="pr-muted">{t(`waitlist.modal.lead.${type}`)}</p>
            <ul className="waitlist-notices">
              {['account', 'order', 'reservation', 'payment', 'availability'].map((key) => <li key={key}><ShieldCheck size={15} aria-hidden="true" /> {t(`waitlist.notice.${key}`)}</li>)}
            </ul>
            <label className="waitlist-field">
              <span>{t('waitlist.modal.email')}</span>
              <input ref={emailRef} type="email" required maxLength={254} autoComplete="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {/* Honeypot for bots: hidden from people and assistive technology. */}
            <input className="waitlist-hp" type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(event) => setWebsite(event.target.value)} />
            <label className="waitlist-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>{t(`waitlist.consent.${type}`)} <Link to="/privacy" target="_blank" rel="noopener">{t('waitlist.consent.privacyLink')}</Link></span>
            </label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" className="pr-btn is-primary waitlist-submit" disabled={state === 'sending' || !email.trim() || !consent}>
              {state === 'sending' ? t('states.loading') : t('waitlist.modal.submit')}
            </button>
            <p className="waitlist-fineprint">{t('waitlist.modal.fineprint')}</p>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
