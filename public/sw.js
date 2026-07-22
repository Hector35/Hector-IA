const CACHE='hector-os-static-shell-v6';
const SHELL=['/','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
const PRIVATE_PREFIXES=['/api/','/control/','/generated/','/runner/','/evidence/','/self-improve/'];

function isPrivateRequest(request,url){
 return request.headers.has('Authorization')||PRIVATE_PREFIXES.some(prefix=>url.pathname.startsWith(prefix));
}
function isStaticAsset(url){
 return url.pathname==='/manifest.webmanifest'||url.pathname.startsWith('/assets/')||url.pathname.startsWith('/icons/');
}
function isCacheable(response){
 const policy=(response.headers.get('Cache-Control')||'').toLowerCase();
 return response.ok&&!policy.includes('no-store')&&!policy.includes('private')&&!response.headers.has('Set-Cookie');
}

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||isPrivateRequest(request,url))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request,{cache:'no-store'}).catch(()=>caches.match('/')));
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
