import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, MailX, RadioTower, ShieldCheck } from 'lucide-react';
import { ApiError, api, type WaitlistInterestType } from '../lib/api';
import { useI18n } from '../i18n';

type ConfirmState = 'loading' | 'confirmed' | 'expired' | 'invalid' | 'unavailable' | 'error';
type UnsubscribeState = 'ready' | 'loading' | 'done' | 'invalid' | 'error';

/** Double opt-in landing page: /waitlist/confirm?token=… (the token is posted once; GET alone changes nothing). */
export function WaitlistConfirmPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [state, setState] = useState<ConfirmState>('loading');
  const [type, setType] = useState<WaitlistInterestType | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = params.get('token') || '';
    api.waitlistConfirm(token)
      .then((result) => { setType(result.interest_type); setState('confirmed'); })
      .catch((error) => {
        const code = error instanceof ApiError ? String(error.payload?.code || '') : '';
        if (code === 'WAITLIST_TOKEN_EXPIRED') setState('expired');
        else if (code === 'WAITLIST_TOKEN_INVALID') setState('invalid');
        else if (code === 'WAITLIST_DISABLED' || code === 'WAITLIST_MAIL_UNAVAILABLE') setState('unavailable');
        else setState('error');
      });
  }, [params]);

  return (
    <WaitlistShell
      icon={state === 'confirmed' ? <MailCheck size={22} aria-hidden="true" /> : <ShieldCheck size={22} aria-hidden="true" />}
      title={t(`waitlist.confirm.${state}.title`)}
      body={state === 'confirmed' && type ? t('waitlist.confirm.confirmed.body', { product: t(`waitlist.product.${type}.name`) }) : t(`waitlist.confirm.${state}.body`)}
      status={state}
    />
  );
}

/** Withdrawal of consent: /waitlist/unsubscribe?id=…&token=… (needs one click, so link scanners cannot trigger it). */
export function WaitlistUnsubscribePage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [state, setState] = useState<UnsubscribeState>('ready');

  async function unsubscribe() {
    setState('loading');
    try {
      await api.waitlistUnsubscribe(params.get('id') || '', params.get('token') || '');
      setState('done');
    } catch (error) {
      setState(error instanceof ApiError && error.status === 400 ? 'invalid' : 'error');
    }
  }

  return (
    <WaitlistShell
      icon={<MailX size={22} aria-hidden="true" />}
      title={t(`waitlist.unsubscribe.${state === 'loading' ? 'ready' : state}.title`)}
      body={t(`waitlist.unsubscribe.${state === 'loading' ? 'ready' : state}.body`)}
      status={`unsubscribe-${state}`}
      action={state === 'ready' || state === 'loading' ? (
        <button type="button" className="pr-btn is-primary" disabled={state === 'loading'} onClick={unsubscribe}>
          {state === 'loading' ? t('states.loading') : t('waitlist.unsubscribe.action')}
        </button>
      ) : null}
    />
  );
}

function WaitlistShell({ icon, title, body, status, action }: { icon: React.ReactNode; title: string; body: string; status: string; action?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="onboarding-shell pr-auth waitlist-page" data-waitlist-status={status}>
      <div className="onboarding-bg" />
      <section className="onboarding-hero waitlist-page-hero">
        <div className="onboarding-card">
          <p className="eyebrow">{t('waitlist.modal.eyebrow')}</p>
          <h2>{icon} {title}</h2>
          <p>{body}</p>
          {action}
          <Link to="/city/berlin" className="pr-btn"><RadioTower size={17} aria-hidden="true" /> {t('register.preview.cta')}</Link>
        </div>
      </section>
    </div>
  );
}
