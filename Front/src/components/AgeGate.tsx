import { useState } from 'react';
import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';

export function AgeGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState(() => localStorage.getItem('escort-radar-age-ok') === 'yes');

  if (accepted) return <>{children}</>;

  return (
    <div className="age-gate">
      <section className="age-panel">
        <ShieldCheck size={34} />
        <p className="eyebrow">Adults only</p>
        <h1>18+ access</h1>
        <p>
          Escort Radar is an adult marketplace preview. Enter only if you are at least 18 and agree to report illegal, coerced, underage, or non-consensual content.
        </p>
        <button
          className="button primary full"
          onClick={() => {
            localStorage.setItem('escort-radar-age-ok', 'yes');
            setAccepted(true);
          }}
        >
          I am 18+
        </button>
      </section>
    </div>
  );
}
