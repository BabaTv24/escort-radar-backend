import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Download, Heart, MessageCircle, Radar, Share2, ShieldCheck, Smartphone, Star, UserRound } from 'lucide-react';
import { Seo } from '../components/Seo';

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

  return (
    <div className="page narrow install-app-page">
      <Seo
        title="Install Escort Radar App - PWA for Android and iPhone"
        description="Install Escort Radar as a privacy-first 18+ nightlife marketplace app on Android, iPhone or desktop."
        canonical="https://escort-radar.fun/app"
      />
      <section className="install-hero legal-panel">
        <p className="eyebrow">Escort Radar App</p>
        <h1>Install App</h1>
        <p>Use Escort Radar like a mobile app with faster access to radar, messages, favorites and your account.</p>
        <div className="install-actions">
          {device === 'android' && canInstall ? (
            <button className="button primary" type="button" onClick={promptInstall}>
              <Download size={18} /> Install App
            </button>
          ) : null}
          {device === 'android' && !canInstall ? (
            <p className="install-note"><Smartphone size={18} /> Open this page in Chrome and use the browser install prompt when it appears.</p>
          ) : null}
          {device === 'ios' ? (
            <p className="install-note"><Share2 size={18} /> In Safari, tap Share, then choose Add to Home Screen.</p>
          ) : null}
          {device === 'desktop' ? (
            <p className="install-note"><Download size={18} /> Use your browser menu or address bar install icon to add Escort Radar to your device.</p>
          ) : null}
          {installed ? <p className="install-note success"><Star size={18} /> Escort Radar is installed on this device.</p> : null}
        </div>
      </section>

      <section className="install-benefits">
        <InstallBenefit icon={<Radar />} title="Radar" text="Open city radar without typing the address again." />
        <InstallBenefit icon={<MessageCircle />} title="Messages" text="Return to conversations with less friction." />
        <InstallBenefit icon={<Heart />} title="Favorites" text="Keep your saved profiles close from the home screen." />
        <InstallBenefit icon={<Bell />} title="Fast access" text="Launch in a standalone app-like window." />
        <InstallBenefit icon={<ShieldCheck />} title="Privacy-first" text="Designed for verified 18+ marketplace use." />
        <InstallBenefit icon={<UserRound />} title="Account" text="Reach dashboard tools quickly after login." />
      </section>

      <section className="legal-panel install-steps">
        <h2>{device === 'ios' ? 'iPhone instructions' : device === 'android' ? 'Android instructions' : 'Desktop instructions'}</h2>
        {device === 'ios' ? (
          <ol>
            <li>Open Escort Radar in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Choose Add to Home Screen and confirm.</li>
          </ol>
        ) : device === 'android' ? (
          <ol>
            <li>Open Escort Radar in Chrome.</li>
            <li>Tap Install App when the prompt is available.</li>
            <li>If no prompt appears, use Chrome menu, then Add to Home screen.</li>
          </ol>
        ) : (
          <ol>
            <li>Open Escort Radar in Chrome, Edge or another PWA-capable browser.</li>
            <li>Use the install icon in the address bar or browser menu.</li>
            <li>Launch Escort Radar from your desktop or app launcher.</li>
          </ol>
        )}
        <Link className="button" to="/city/berlin"><Radar size={17} /> Open Radar</Link>
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
