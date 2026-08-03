import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, QrCode, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { api, type ReferralMe } from '../../lib/api';
import { copyTextWithFallback } from '../../lib/clipboard';
import { useI18n } from '../../i18n';

type LoadState = 'loading' | 'success' | 'error';
const qrFileName = 'escort-radar-referral-qr.png';

export function AdvertiserReferralSection({ token }: { token: string }) {
  const { t } = useI18n();
  const [referral, setReferral] = useState<ReferralMe | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [status, setStatus] = useState<LoadState>('loading');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const loadReferral = useCallback(async () => {
    setStatus('loading');
    setCopied(false);
    setCopyFailed(false);
    try {
      const result = await api.referralMe(token);
      const image = await QRCode.toDataURL(result.referralLink, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: 'M',
        color: { dark: '#070707', light: '#ffffff' }
      });
      setReferral(result);
      setQrImage(image);
      setStatus('success');
    } catch {
      setReferral(null);
      setQrImage('');
      setStatus('error');
    }
  }, [token]);

  useEffect(() => { void loadReferral(); }, [loadReferral]);

  async function copyReferralLink() {
    if (!referral?.referralLink) return;
    try {
      await copyTextWithFallback(referral.referralLink);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <section className="advertiser-stage-three" aria-labelledby="advertiser-referral-title" aria-busy={status === 'loading'}>
      <header className="advertiser-dashboard-heading compact">
        <div>
          <p className="eyebrow">Escort Radar</p>
          <h1 id="advertiser-referral-title">{t('advertiserDashboard.referral.title')}</h1>
          <p>{t('advertiserDashboard.referral.subtitle')}</p>
        </div>
        <QrCode size={30} aria-hidden="true" />
      </header>

      {status === 'loading' ? <div className="advertiser-referral-skeleton" aria-label={t('states.loading')}><i /><i /></div> : null}
      {status === 'error' ? (
        <div className="advertiser-data-state error">
          <p>{t('advertiserDashboard.referral.error')}</p>
          <button type="button" className="button primary" onClick={() => void loadReferral()}><RefreshCw size={16} /> {t('advertiserDashboard.retry')}</button>
        </div>
      ) : null}
      {status === 'success' && referral ? (
        <div className="advertiser-referral-card advertiser-dashboard-panel">
          <div className="advertiser-referral-copy">
            <div>
              <p className="eyebrow">{t('advertiserDashboard.referral.yourLink')}</p>
              <strong>{referral.referralCode}</strong>
            </div>
            <p className="advertiser-referral-url">{referral.referralLink}</p>
            <button type="button" className="button primary" onClick={() => void copyReferralLink()}>
              <Copy size={16} aria-hidden="true" /> {copied ? t('advertiserDashboard.referral.copied') : t('advertiserDashboard.referral.copy')}
            </button>
            {copyFailed ? <p className="advertiser-inline-error" role="alert">{t('advertiserDashboard.referral.copyError')}</p> : null}
          </div>
          <div className="advertiser-referral-qr">
            <div className="advertiser-qr-frame"><img src={qrImage} alt={t('advertiserDashboard.referral.qrAlt')} /></div>
            <a className="button" href={qrImage} download={qrFileName}><Download size={16} aria-hidden="true" /> {t('advertiserDashboard.referral.download')}</a>
            <small>{t('advertiserDashboard.referral.qrHint')}</small>
          </div>
        </div>
      ) : null}
    </section>
  );
}
