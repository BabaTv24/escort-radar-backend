import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Download, Heart, MessageCircle, Radar, Share2, ShieldCheck, Smartphone, Star, UserRound } from 'lucide-react';
import { Seo } from '../components/Seo';
import { useI18n } from '../i18n';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function usePwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice.catch(() => undefined);
    setInstallPrompt(null);
  }

  return { canInstall: Boolean(installPrompt), installed, promptInstall };
}

export function InstallAppPage() {
  const { canInstall, installed, promptInstall } = usePwaInstallPrompt();
  const device = useMemo(() => detectDevice(), []);
  const { t } = useI18n();

  return (
    <div className="page narrow install-app-page">
      <Seo
        title="Install Escort Radar App - PWA for Android and iPhone"
        description="Install Escort Radar as a privacy-first 18+ nightlife marketplace app on Android, iPhone or desktop."
        canonical="https://escort-radar.fun/app"
      />
      <section className="install-hero legal-panel">
        <p className="eyebrow">{t('install.eyebrow')}</p>
        <h1>{t('install.title')}</h1>
        <p>{t('install.copy')}</p>
        <div className="install-actions">
          {device === 'android' && canInstall ? (
            <button className="button primary" type="button" onClick={promptInstall}>
              <Download size={18} /> {t('install.title')}
            </button>
          ) : null}
          {device === 'android' && !canInstall ? (
            <p className="install-note"><Smartphone size={18} /> {t('install.androidPrompt')}</p>
          ) : null}
          {device === 'ios' ? (
            <p className="install-note"><Share2 size={18} /> {t('install.iosPrompt')}</p>
          ) : null}
          {device === 'desktop' ? (
            <p className="install-note"><Download size={18} /> {t('install.desktopPrompt')}</p>
          ) : null}
          {installed ? <p className="install-note success"><Star size={18} /> {t('install.installed')}</p> : null}
        </div>
      </section>

      <section className="install-benefits">
        <InstallBenefit icon={<Radar />} title={t('install.benefit.radar')} text={t('install.benefit.radarText')} />
        <InstallBenefit icon={<MessageCircle />} title={t('install.benefit.messages')} text={t('install.benefit.messagesText')} />
        <InstallBenefit icon={<Heart />} title={t('install.benefit.favorites')} text={t('install.benefit.favoritesText')} />
        <InstallBenefit icon={<Bell />} title={t('install.benefit.fast')} text={t('install.benefit.fastText')} />
        <InstallBenefit icon={<ShieldCheck />} title={t('install.benefit.privacy')} text={t('install.benefit.privacyText')} />
        <InstallBenefit icon={<UserRound />} title={t('install.benefit.account')} text={t('install.benefit.accountText')} />
      </section>

      <section className="legal-panel install-steps">
        <h2>{device === 'ios' ? t('install.iosInstructions') : device === 'android' ? t('install.androidInstructions') : t('install.desktopInstructions')}</h2>
        {device === 'ios' ? (
          <ol>
            <li>{t('install.iosStep1')}</li>
            <li>{t('install.iosStep2')}</li>
            <li>{t('install.iosStep3')}</li>
          </ol>
        ) : device === 'android' ? (
          <ol>
            <li>{t('install.androidStep1')}</li>
            <li>{t('install.androidStep2')}</li>
            <li>{t('install.androidStep3')}</li>
          </ol>
        ) : (
          <ol>
            <li>{t('install.desktopStep1')}</li>
            <li>{t('install.desktopStep2')}</li>
            <li>{t('install.desktopStep3')}</li>
          </ol>
        )}
        <Link className="button" to="/city/berlin"><Radar size={17} /> {t('home.openRadar')}</Link>
      </section>
    </div>
  );
}

function InstallBenefit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="feature install-benefit">
      <div className="feature-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function detectDevice() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const iPadDesktopMode = platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || iPadDesktopMode) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}
