// Service worker: cangkang aplikasi tersedia offline; data & API TIDAK pernah di-cache.
const CACHE = 'ymic-shell-v1';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/ui.js', '/js/api.js', '/js/state.js', '/img/emblem.png', '/img/logo-full.jpg', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // jaringan dulu (agar pembaruan cepat), cadangan dari cache
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/') || url.pathname.startsWith('/img/'))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
