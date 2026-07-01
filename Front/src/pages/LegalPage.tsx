import { useLocation, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

export function LegalPage() {
  const params = useParams();
  const location = useLocation();
  const page = params.page || params['*'] || location.pathname.replace(/^\//, '') || 'terms';
  const { t } = useI18n();
  const title = t(`legal.title.${page}`);
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@escort-radar.fun';
  const legal = {
    operator: import.meta.env.VITE_LEGAL_OPERATOR_NAME || '',
    address: import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS || '',
    responsible: import.meta.env.VITE_LEGAL_RESPONSIBLE_PERSON || '',
    vat: import.meta.env.VITE_LEGAL_VAT_ID || ''
  };
  const missingNotice = import.meta.env.PROD ? '' : 'Information will be completed before commercial launch';

  if (page === 'refund-policy') {
    return <LegalShell title="Refund Policy" operator={legal.operator}>
      <p>Escort Radar sells digital platform access, profile visibility, advertising tools, subscriptions/prepaid 30-day plans and internal token credits.</p>
      <p>Because access may start immediately after approval or payment confirmation, refund requests are reviewed case by case. We do not promise automatic refunds after digital services or internal credits have been delivered.</p>
      <p>For token purchases, unused token issues can be reviewed when there is a technical error, duplicate payment or incorrect order approval.</p>
      <p>Contact support at <a href={`mailto:${supportEmail}`}>{supportEmail}</a> and include your account email, order number, payment provider, amount and reason.</p>
    </LegalShell>;
  }

  if (page === 'content-rules' || page === 'content-policy') {
    return <LegalShell title="Content Rules" operator={legal.operator}>
      <p>Escort Radar is an 18+ digital advertising and discovery platform. Content must be lawful, consensual and uploaded only by people who have the right to publish it.</p>
      <p>Do not upload illegal content, coercive content, minors, stolen media, impersonation, hateful content, violence or content that offers illegal services.</p>
      <p>Profiles and media may be moderated, rejected, hidden or removed when they breach platform rules or provider requirements.</p>
    </LegalShell>;
  }

  if (page === 'report-abuse') {
    return <LegalShell title="Report Abuse" operator={legal.operator}>
      <p>Report illegal, abusive, non-consensual, underage, impersonation or privacy-violating content immediately.</p>
      <p>Email: <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
      <p>Please include the profile URL, reason, screenshots if available and your contact email. Urgent safety reports are prioritized.</p>
    </LegalShell>;
  }

  if (page === 'imprint' || page === 'legal-notice') {
    return <LegalShell title="Legal Notice" operator={legal.operator}>
      <dl className="admin-detail-list">
        {legal.operator ? <><dt>Operator</dt><dd>{legal.operator}</dd></> : null}
        <dt>Product</dt><dd>Escort Radar</dd>
        {legal.address ? <><dt>Address</dt><dd>{legal.address}</dd></> : null}
        <dt>Email</dt><dd>{supportEmail}</dd>
        {legal.responsible ? <><dt>Responsible person</dt><dd>{legal.responsible}</dd></> : null}
        {legal.vat ? <><dt>VAT / tax number</dt><dd>{legal.vat}</dd></> : null}
      </dl>
      {!import.meta.env.PROD && !legal.operator ? <p className="muted">{missingNotice}</p> : null}
    </LegalShell>;
  }

  return (
    <div className="page narrow">
      <section className="legal-panel">
        <p className="eyebrow">{t('legal.eyebrow')}</p>
        <h1>{title}</h1>
        {legal.operator ? <p>{`Escort Radar is operated by ${legal.operator}`}</p> : null}
        <p>{t('legal.copy1')}</p>
        <p>{t('legal.copy2')}</p>
        <div className="legal-ownership">
          <p className="eyebrow">{t('legal.technologyTitle')}</p>
          <h2>{t('baba.powered')}</h2>
          <p>{t('legal.technologyCopy1')}</p>
          <p>{t('legal.technologyCopy2')}</p>
          <p>{t('legal.technologyCopy3')}</p>
          <a href="https://www.baba-ai.de" target="_blank" rel="noreferrer">baba-ai.de</a>
        </div>
      </section>
    </div>
  );
}

function LegalShell({ title, operator, children }: { title: string; operator?: string; children: ReactNode }) {
  return (
    <div className="page narrow">
      <section className="legal-panel">
        <p className="eyebrow">Escort Radar Legal</p>
        <h1>{title}</h1>
        {operator ? <p>{`Escort Radar is operated by ${operator}`}</p> : null}
        {children}
      </section>
    </div>
  );
}
