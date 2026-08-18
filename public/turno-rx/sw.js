const CACHE = 'turno-rx-shell-v24';
const SHELL = [
  '/turno-rx/',
  '/turno-rx/index.html',
  '/turno-rx/styles.css?v=7',
  '/turno-rx/capture-enhancements.css?v=2',
  '/turno-rx/integrity-v16.css?v=2',
  '/turno-rx/compact-v17.css?v=4',
  '/turno-rx/one-line-v24.css?v=1',
  '/turno-rx/app-v16.js?v=2',
  '/turno-rx/compact-v17.js?v=2',
  '/turno-rx/transport-v20.js?v=2',
  '/turno-rx/name-format-v23.js?v=1',
  '/turno-rx/manifest.webmanifest',
  '/turno-rx/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key.startsWith('turno-rx-')).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/turno-rx/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/turno-rx/index.html')))
  );
});
