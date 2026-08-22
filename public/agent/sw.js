const CACHE='hector-agent-v1.3';
const CACHE_PREFIX='hector-agent-';
const ASSETS=['./styles.css','./app.js','./manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }
  event.respondWith((async()=>{
    try{
      const res=await fetch(req,{cache:'no-store'});
      if(res.ok){
        const copy=res.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)));
      }
      return res;
    }catch{
      return await caches.match(req)||Response.error();
    }
  })());
});
