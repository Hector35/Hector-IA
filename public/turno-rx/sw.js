// v64: reconciliación por renglón + destino de Piso por cama/servicio + tabla operativa limpia.
const CACHE = 'turno-rx-shell-v58-tac-live-interaction-hotfix';
const SHELL = [
  '/turno-rx/',
  '/turno-rx/index.html',
  '/turno-rx/styles.css?v=7',
  '/turno-rx/capture-enhancements.css?v=2',
  '/turno-rx/integrity-v16.css?v=2',
  '/turno-rx/compact-v17.css?v=4',
  '/turno-rx/one-line-v24.css?v=1',
  '/turno-rx/space-v25.css?v=1',
  '/turno-rx/adaptive-row-v26.css?v=1',
  '/turno-rx/font-v27.css?v=1',
  '/turno-rx/sticky-close-v29.css?v=1',
  '/turno-rx/elegant-v30.css?v=2',
  '/turno-rx/full-redesign-v33.css?v=1',
  '/turno-rx/light-theme-v34.css?v=1',
  '/turno-rx/light-polish-v35.css?v=1',
  '/turno-rx/premium-v36.css?v=1',
  '/turno-rx/premium-v37.css?v=1',
  '/turno-rx/manual-quick-v38.css?v=1',
  '/turno-rx/patient-detail-v39.css?v=1',
  '/turno-rx/palette-v39.css?v=1',
  '/turno-rx/tac-flow-v42.css?v=1',
  '/turno-rx/progressive-photo-v45.css?v=1',
  '/turno-rx/category-tabs-v49.css?v=1',
  '/turno-rx/floor-rx-night-fix-v50.css?v=50',
  '/turno-rx/clinical-intelligence-v52.css?v=53',
  '/turno-rx/art-direction-v56.css?v=56',
  '/turno-rx/interaction-hotfix-v58.css?v=58',
  '/turno-rx/row-actions-v60.css?v=60',
  '/turno-rx/row-actions-v61.css?v=61',
  '/turno-rx/boleta-visibility-v64.css?v=64',
  '/turno-rx/quick-transport-v37.js?v=2',
  '/turno-rx/patient-detail-v39.js?v=4',
  '/turno-rx/floor-intelligence-v64.js?v=64',
  '/turno-rx/app-v16.js?v=58',
  '/turno-rx/progressive-photo-queue-v45.js',
  '/turno-rx/floor-workflow-v42.js?v=58',
  '/turno-rx/compact-v17.js?v=2',
  '/turno-rx/transport-v20.js?v=3',
  '/turno-rx/name-format-v23.js?v=1',
  '/turno-rx/adaptive-row-v26.js?v=1',
  '/turno-rx/cama-label-v28.js?v=1',
  '/turno-rx/polish-v32.js?v=1',
  '/turno-rx/full-redesign-v33.js?v=1',
  '/turno-rx/observer-guard-v59.js?v=59',
  '/turno-rx/premium-v37.js?v=4',
  '/turno-rx/manual-quick-v38.js?v=1',
  '/turno-rx/tac-flow-v42.js?v=58',
  '/turno-rx/row-actions-v60.js?v=60',
  '/turno-rx/row-actions-v61.js?v=61',
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
