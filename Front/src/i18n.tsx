import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import de from './locales/de.json';
import pl from './locales/pl.json';
import en from './locales/en.json';

type Lang = 'de' | 'pl' | 'en';
const dictionaries = { de, pl, en };

const I18nContext = createContext({
  lang: 'de' as Lang,
  setLang: (_lang: Lang) => {},
  t: (key: string, vars?: Record<string, string | number>) => key,
  option: (value: string) => value
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('escort-radar-lang');
    return saved === 'pl' || saved === 'en' || saved === 'de' ? saved : 'de';
  });

  const value = useMemo(() => ({
    lang,
    setLang: (next: Lang) => {
      localStorage.setItem('escort-radar-lang', next);
      setLangState(next);
    },
    t: (key: string, vars: Record<string, string | number> = {}) => {
      const text = (dictionaries[lang] as Record<string, string>)[key] || (dictionaries.de as Record<string, string>)[key] || key;
      return Object.entries(vars).reduce((current, [name, val]) => current.replaceAll(`{{${name}}}`, String(val)), text);
    },
    option: (value: string) => {
      const key = `options.${value}`;
      return (dictionaries[lang] as Record<string, string>)[key] || (dictionaries.de as Record<string, string>)[key] || value.replace(/[-_]/g, ' ');
    }
  }), [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
