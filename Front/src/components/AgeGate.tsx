import { useState } from 'react';
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n';

export function AgeGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(() => localStorage.getItem('escort-radar-age-ok') === 'yes');
  const { t } = useI18n();

  if (accepted) return <>{children}</>;

  return (
    <div className="age-gate">
      <section className="age-panel">
        <ShieldCheck size={34} />
        <p className="eyebrow">{t('age.eyebrow')}</p>
        <h1>{t('age.title')}</h1>
        <p>{t('age.copy')}</p>
        <button
          className="button primary full"
          onClick={() => {
            localStorage.setItem('escort-radar-age-ok', 'yes');
            setAccepted(true);
          }}
        >
          {t('age.accept')}
        </button>
      </section>
    </div>
  );
}
