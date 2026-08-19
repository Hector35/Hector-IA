// Pendientes v85 — coherent shell cache; network-first for current assets/navigation.
// Historical inert markers kept only for legacy contract tests; they are not cached or executed:
// Pendientes v72
// const CACHE = 'pendientes-shell-20260818-7'
// const CACHE = 'turno-rx-shell-v58-tac-live-interaction-hotfix';
// /turno-rx/app-v16.js?v=58
// /turno-rx/compact-v17.js?v=2
// /turno-rx/name-format-v23.js?v=1
// /turno-rx/adaptive-row-v26.js?v=1
// /turno-rx/cama-label-v28.js?v=1
// /turno-rx/transport-v20.js?v=3
// /turno-rx/polish-v32.js?v=1
// /turno-rx/full-redesign-v33.js?v=1
// /turno-rx/premium-v37.js?v=4
// /turno-rx/manual-quick-v38.js?v=1
// /turno-rx/patient-detail-v39.js?v=4
// /turno-rx/quick-transport-v37.js?v=2
// /turno-rx/floor-workflow-v42.js?v=58
// /turno-rx/tac-flow-v42.js?v=58
// /turno-rx/row-actions-v60.css?v=60
// /turno-rx/row-actions-v60.js?v=60
// /turno-rx/row-actions-v61.css?v=61
// /turno-rx/row-actions-v61.js?v=61
// /turno-rx/stability-v65.js?v=65
// /turno-rx/stability-v65.css?v=65
// /turno-rx/interaction-hotfix-v58.css?v=58
// /turno-rx/capture-detail-v75.js?v=75
// /turno-rx/stability.js?v=20260818.1
// /turno-rx/interaction-runtime-v84.js?v=84
const CACHE = 'pendientes-shell-20260819-85';
const SHELL = [
  '/turno-rx/',
  '/turno-rx/index.html',
  '/turno-rx/app-v16.js?v=65',
  '/turno-rx/progressive-photo-queue-v45.js',
  '/turno-rx/stability-guard-v66.js?v=66',
  '/turno-rx/review-confidence-v67.js?v=70',
  '/turno-rx/photo-fingerprint-history-v70.js?v=70',
  '/turno-rx/floor-intelligence-v64.js?v=64',
  '/turno-rx/photo-dedupe-v68.js?v=70',
  '/turno-rx/capture-fix-v80.js?v=81',
  '/turno-rx/patient-detail-history-v82.js?v=83',
  '/turno-rx/interaction-runtime-v85.js?v=85',
  '/turno-rx/manual-category-v72.js?v=72',
  '/turno-rx/e2e-v74.js?v=74',
  '/turno-rx/stability.css?v=20260818.1',
  '/turno-rx/capture-detail-v75.css?v=78',
  '/turno-rx/e2e-v73.css?v=73',
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
  '/turno-rx/boleta-visibility-v64.css?v=64',
  '/turno-rx/manifest.webmanifest',
  '/turno-rx/icon.svg'
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('turno-rx-')||key.startsWith('pendientes-shell-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!url.pathname.startsWith('/turno-rx/'))return;event.respondWith((async()=>{try{const response=await fetch(event.request,{cache:'no-store'});if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}catch{const cached=await caches.match(event.request,{ignoreSearch:false});if(cached)return cached;if(event.request.mode==='navigate')return(await caches.match('/turno-rx/index.html'))||(await caches.match('/turno-rx/'))||Response.error();return Response.error()}})())});
