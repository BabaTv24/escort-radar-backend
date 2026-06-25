const CACHE_NAME = 'escort-radar-v2';
const STATIC_ASSETS = ['/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname === '/sw.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })));
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
