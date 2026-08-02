import type { JsonLdValue } from '../components/Seo';
import { DEFAULT_SOCIAL_IMAGE, SITE_URL } from '../components/Seo';
export { localeForLanguage } from '../components/Seo';

export const homeSeo = {
  title: 'Escort Radar – panel AI do rezerwacji, klientów i lokalnej widoczności',
  description: 'Zarządzaj rezerwacjami, klientami, wiadomościami i widocznością w mieście z jednego prywatnego panelu wspieranego przez AI.',
  canonical: `${SITE_URL}/`,
  image: DEFAULT_SOCIAL_IMAGE
} as const;

export const homeFaq = [
  {
    question: 'Czym jest Escort Radar?',
    answer: 'Escort Radar jest prywatnym panelem AI do zarządzania klientami, rezerwacjami, dostępnością i lokalną widocznością.'
  },
  {
    question: 'Dla kogo jest Escort Radar?',
    answer: 'System jest przeznaczony dla niezależnych ogłaszających i firm, które chcą zarządzać profilem, wiadomościami i rezerwacjami w jednym miejscu.'
  },
  {
    question: 'Jak działa asystent AI?',
    answer: 'Asystent AI odpowiada na podstawowe pytania na podstawie informacji zapisanych w profilu. Właściciel profilu może w dowolnym momencie przejąć rozmowę.'
  },
  {
    question: 'Jak działa prywatność lokalizacji?',
    answer: 'Właściciel profilu wybiera poziom lokalizacji: dokładny punkt, obszar kodu pocztowego, miasto albo brak publicznej lokalizacji.'
  },
  {
    question: 'Jak działają rezerwacje?',
    answer: 'Klient wysyła prośbę o rezerwację, którą właściciel profilu może zaakceptować, odrzucić albo przełożyć.'
  }
] as const;

export const homeJsonLd: JsonLdValue = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Escort Radar',
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/favicon-512x512.png`
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Escort Radar',
      url: `${SITE_URL}/`,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: ['pl', 'de', 'en']
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#application`,
      name: 'Escort Radar',
      url: `${SITE_URL}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      browserRequirements: 'Requires a modern browser with JavaScript enabled',
      description: 'Panel AI do zarządzania rezerwacjami, klientami, wiadomościami, dostępnością i lokalną widocznością.',
      publisher: { '@id': `${SITE_URL}/#organization` }
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: homeFaq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer }
      }))
    }
  ]
};
