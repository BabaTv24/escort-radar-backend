const CACHE_NAME = 'escort-radar-v7';
const STATIC_ASSETS = ['/manifest.webmanifest', '/icon.svg', '/favicon-192x192.png', '/favicon-512x512.png'];

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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSupabase = url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in');
  const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/storage/');
  // Let the browser own cross-origin API streams. Proxying them through the
  // service worker adds an unnecessary response-body lifecycle boundary.
  if (url.origin !== self.location.origin) return;
  if (isApi || isSupabase) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname === '/sw.js') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).catch(async () => (
        await caches.match('/') || new Response('<!doctype html><title>Escort Radar offline</title><main style="font-family:system-ui;background:#050505;color:#f6f2e8;min-height:100vh;padding:2rem"><h1>Escort Radar is offline</h1><p>Please reconnect and reload the app.</p></main>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      ))
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (!response || response.status !== 200) return response;
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })));
    return;
  }
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
});
