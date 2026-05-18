import { useParams } from 'react-router-dom';

const titles: Record<string, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  impressum: 'Impressum',
  'content-policy': 'Content Policy',
  'report-abuse': 'Report Abuse'
};

export function LegalPage() {
  const { page = 'terms' } = useParams();
  const title = titles[page] || 'Legal';

  return (
    <div className="page narrow">
      <section className="legal-panel">
        <p className="eyebrow">Legal placeholder</p>
        <h1>{title}</h1>
        <p>
          This page is a professional placeholder for an adult 18+ classified marketplace. Final legal text must be reviewed by a qualified lawyer before publication.
        </p>
        <p>
          Production policy must cover age verification, consent, prohibited content, trafficking prevention, takedown requests, GDPR rights, data retention, moderation, and urgent abuse reporting.
        </p>
      </section>
    </div>
  );
}
