import { Link, useParams } from 'react-router-dom';
import { Radar } from 'lucide-react';
import { useI18n } from '../i18n';

export function ReferralPage() {
  const { referralCode = '' } = useParams();
  const { t } = useI18n();

  return (
    <div className="page narrow">
      <section className="legal-panel referral-panel">
        <p className="eyebrow">{t('referral.title')}</p>
        <h1><Radar size={30} /> {referralCode}</h1>
        <p>{t('referral.placeholder')}</p>
        <Link className="button primary" to={`/register?ref=${encodeURIComponent(referralCode)}`}>{t('onboarding.createPremiumAccount')}</Link>
      </section>
    </div>
  );
}
