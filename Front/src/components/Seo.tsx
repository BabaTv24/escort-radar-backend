import { useEffect } from 'react';
import { useI18n } from '../i18n';

export type SeoLocale = 'de_DE' | 'en_US' | 'pl_PL';

export type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

export type SeoProps = {
  title: string;
  description: string;
  canonical?: string;
  robots?: string;
  noindex?: boolean;
  ogType?: 'website' | 'profile' | 'article';
  ogTitle?: string;
  ogDescription?: string;
  image?: string;
  locale?: SeoLocale;
  alternateLocales?: SeoLocale[];
  alternateLanguages?: Record<string, string>;
  jsonLd?: JsonLdValue;
};

export const SITE_URL = 'https://escort-radar.fun';
export const DEFAULT_SOCIAL_IMAGE = `${SITE_URL}/og/escort-radar-ai-panel-1200x630.jpg`;

export function Seo({
  title,
  description,
  canonical,
  robots,
  noindex = false,
  ogType = 'website',
  ogTitle,
  ogDescription,
  image = DEFAULT_SOCIAL_IMAGE,
  locale,
  alternateLocales = [],
  alternateLanguages,
  jsonLd
}: SeoProps) {
  const { lang } = useI18n();
  const effectiveLocale = locale || localeForLanguage(lang);

  useEffect(() => {
    const canonicalUrl = absoluteUrl(canonical || window.location.pathname);
    const socialImageUrl = absoluteUrl(image);
    const sensitiveQuery = hasSensitiveQuery(window.location.search);
    const effectiveNoindex = noindex || sensitiveQuery;
    const effectiveRobots = effectiveNoindex ? 'noindex,nofollow' : (robots || 'index,follow,max-image-preview:large');

    document.title = title;
    document.documentElement.lang = effectiveLocale.slice(0, 2);
    setMeta('name', 'description', description);
    setMeta('name', 'robots', effectiveRobots);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:site_name', 'Escort Radar');
    setMeta('property', 'og:title', ogTitle || title);
    setMeta('property', 'og:description', ogDescription || description);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:image', socialImageUrl);
    setMeta('property', 'og:image:width', '1200');
    setMeta('property', 'og:image:height', '630');
    setMeta('property', 'og:image:type', 'image/jpeg');
    setMeta('property', 'og:locale', effectiveLocale);
    setMetaList('property', 'og:locale:alternate', alternateLocales);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', ogTitle || title);
    setMeta('name', 'twitter:description', ogDescription || description);
    setMeta('name', 'twitter:image', socialImageUrl);
    setCanonical(canonicalUrl);
    setAlternateLanguages(alternateLanguages);
    setJsonLd(jsonLd);
  }, [alternateLanguages, alternateLocales, canonical, description, effectiveLocale, image, jsonLd, noindex, ogDescription, ogTitle, ogType, robots, title]);

  return null;
}

export function localeForLanguage(language: string): SeoLocale {
  if (language === 'de') return 'de_DE';
  if (language === 'en') return 'en_US';
  return 'pl_PL';
}

export function absoluteUrl(value: string) {
  return new URL(value, SITE_URL).toString();
}

export function hasSensitiveQuery(search: string) {
  const params = new URLSearchParams(search);
  return ['token', 'claim', 'session'].some((key) => params.has(key));
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  const elements = [...document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`)];
  const element = elements.shift() || document.createElement('meta');
  element.setAttribute(attribute, key);
  element.content = content;
  if (!element.parentNode) document.head.appendChild(element);
  elements.forEach((duplicate) => duplicate.remove());
}

function setMetaList(attribute: 'name' | 'property', key: string, values: string[]) {
  document.head.querySelectorAll(`meta[${attribute}="${key}"]`).forEach((element) => element.remove());
  values.forEach((value) => {
    const element = document.createElement('meta');
    element.setAttribute(attribute, key);
    element.content = value;
    document.head.appendChild(element);
  });
}

function setCanonical(href: string) {
  const elements = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')];
  const element = elements.shift() || document.createElement('link');
  element.rel = 'canonical';
  element.href = href;
  if (!element.parentNode) document.head.appendChild(element);
  elements.forEach((duplicate) => duplicate.remove());
}

function setAlternateLanguages(alternates?: Record<string, string>) {
  document.head.querySelectorAll('link[data-seo-alternate="true"]').forEach((element) => element.remove());
  Object.entries(alternates || {}).forEach(([language, href]) => {
    const element = document.createElement('link');
    element.rel = 'alternate';
    element.hreflang = language;
    element.href = absoluteUrl(href);
    element.dataset.seoAlternate = 'true';
    document.head.appendChild(element);
  });
}

function setJsonLd(value?: JsonLdValue) {
  const id = 'escort-radar-jsonld';
  const existing = document.getElementById(id);
  if (!value) {
    existing?.remove();
    return;
  }
  const element = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
  element.id = id;
  element.type = 'application/ld+json';
  element.textContent = JSON.stringify(value).replace(/</g, '\\u003c');
  if (!element.parentNode) document.head.appendChild(element);
}
