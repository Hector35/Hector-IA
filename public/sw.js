const CACHE='hector-elegant-chat-v7';
const CACHE_PREFIX='hector-elegant-chat-';
const BRIDGE_ASSETS=['/bridge.html','/bridge.css','/bridge.js','/bridge-code-worker.mjs'];
const SHELL=['/','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png',...BRIDGE_ASSETS];
const PRIVATE_PREFIXES=['/api/','/control/','/generated/','/runner/','/evidence/','/self-improve/','/agent','/hector-agent'];

function isPrivateRequest(request,url){
  return request.headers.has('Authorization')||PRIVATE_PREFIXES.some(prefix=>url.pathname.startsWith(prefix));
}
function isStaticAsset(url){
  return url.pathname==='/manifest.webmanifest'||BRIDGE_ASSETS.includes(url.pathname)||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/icons/');
}
function isCacheable(response){
  const policy=(response.headers.get('Cache-Control')||'').toLowerCase();
  return response.ok&&!policy.includes('no-store')&&!policy.includes('private')&&!response.headers.has('Set-Cookie');
}
async function refreshRootShell(response){
  if(!isCacheable(response))return;
  const cache=await caches.open(CACHE);
  const html=await response.clone().text();
  await cache.put('/',response.clone());
  const assets=[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match=>match[1]);
  if(assets.length)await cache.addAll([...new Set(assets)]);
}

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||isPrivateRequest(request,url))return;
  if(request.mode==='navigate'){
    const fallback=url.pathname==='/bridge.html'?'/bridge.html':'/';
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        if(fallback==='/')await refreshRootShell(response);
        return response;
      }catch{
        return await caches.match(fallback)||Response.error();
      }
    })());
    return;
  }
  if(!isStaticAsset(url))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request,{cache:'no-store'});
      if(isCacheable(response))event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,response.clone())));
      return response;
    }catch{
      return await caches.match(request)||Response.error();
    }
  })());
});
