import { useLocation } from 'react-router-dom';
import { Seo, SITE_URL } from './Seo';

const privatePrefixes = ['/admin', '/dashboard', '/login', '/register', '/messages', '/settings', '/auth', '/tokens', '/coins', '/r/'];

const publicStaticMetadata: Record<string, { title: string; description: string }> = {
  '/terms': { title: 'Warunki korzystania – Escort Radar', description: 'Warunki korzystania z platformy Escort Radar.' },
  '/privacy': { title: 'Prywatność – Escort Radar', description: 'Informacje o prywatności i przetwarzaniu danych w Escort Radar.' },
  '/refund-policy': { title: 'Polityka zwrotów – Escort Radar', description: 'Zasady zwrotów za cyfrowe usługi platformy Escort Radar.' },
  '/content-rules': { title: 'Zasady treści – Escort Radar', description: 'Zasady publikowania treści i profili w Escort Radar.' },
  '/report-abuse': { title: 'Zgłoś nadużycie – Escort Radar', description: 'Sposób zgłaszania nadużyć, bezprawnych treści i naruszeń prywatności.' },
  '/imprint': { title: 'Nota prawna – Escort Radar', description: 'Dane operatora i informacje prawne Escort Radar.' },
  '/legal-notice': { title: 'Nota prawna – Escort Radar', description: 'Dane operatora i informacje prawne Escort Radar.' }
};

export function RouteSeo() {
  const { pathname, search } = useLocation();
  const isPrivate = privatePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
  const sensitive = /(?:^|[?&])(token|claim|session)=/i.test(search);

  if (isPrivate || sensitive) {
    return <Seo title="Escort Radar – prywatny panel" description="Prywatna strona użytkownika Escort Radar." canonical={`${SITE_URL}${pathname}`} noindex />;
  }

  const metadata = publicStaticMetadata[pathname];
  if (metadata) return <Seo {...metadata} canonical={`${SITE_URL}${pathname}`} />;

  if (pathname.startsWith('/legal/')) {
    return (
      <Seo
        title="Informacje prawne – Escort Radar"
        description="Publiczne informacje prawne i zasady korzystania z platformy Escort Radar."
        canonical={`${SITE_URL}${pathname}`}
      />
    );
  }

  return null;
}
