import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';

const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || 'support@escort-radar.fun';

export function ContactPage() {
  return (
    <div className="page narrow">
      <Seo
        title="Contact Escort Radar Support"
        description="Contact Escort Radar support for account, platform access, business inquiries and abuse reports."
        canonical="https://escort-radar.fun/contact"
      />
      <section className="legal-panel">
        <p className="eyebrow">Escort Radar Support</p>
        <h1>Contact</h1>
        <p>Support email: <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
        <p>For payment support, include your account email, order number, product and payment provider.</p>
        <p>For business inquiries, use the same email with the subject “Business inquiry”.</p>
        <p>To report illegal, abusive or non-consensual content, use the dedicated abuse report page.</p>
        <Link className="button primary" to="/report-abuse">Report abuse</Link>
      </section>
    </div>
  );
}
