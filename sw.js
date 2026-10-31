const CACHE_NAME = 'classe-cache-v4-9';
const CACHE_PREFIX = 'classe-cache-';
const CORE_ASSETS = ['./','./index.html','./app.js','./native-notifications.js','./schedule-pdf.js','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;
  if(event.request.mode === 'navigate'){
    event.respondWith(fetch(event.request).then(r=>{
      if(r.ok){const c=r.clone();caches.open(CACHE_NAME).then(x=>x.put('./index.html',c)).catch(()=>{});return r;}
      return caches.match('./index.html').then(cached=>cached||r);
    }).catch(()=>caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(event.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE_NAME).then(x=>x.put(event.request,c)).catch(()=>{});}return r;}).catch(()=>caches.match(event.request)));
});
