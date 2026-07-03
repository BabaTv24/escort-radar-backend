import { useEffect } from 'react';

type SeoProps = {
  title: string;
  description: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
};

const siteUrl = 'https://escort-radar.fun';

export function Seo({ title, description, canonical, ogTitle, ogDescription }: SeoProps) {
  useEffect(() => {
    const canonicalUrl = canonical || `${siteUrl}${window.location.pathname}`;
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', ogTitle || title);
    setMeta('property', 'og:description', ogDescription || description);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('name', 'twitter:title', ogTitle || title);
    setMeta('name', 'twitter:description', ogDescription || description);
    setCanonical(canonicalUrl);
  }, [canonical, description, ogDescription, ogTitle, title]);

  return null;
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}
