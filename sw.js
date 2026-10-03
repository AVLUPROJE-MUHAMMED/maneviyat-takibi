const CACHE="maneviyat-v50";
const FILES=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","icon-180.png","ilceler.json"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:"no-cache"})).catch(()=>{}))))); self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET") return;
  const url=new URL(e.request.url);
  if(url.origin!==location.origin){ // yazı tipleri: önce önbellek
    e.respondWith(caches.open(CACHE).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(res=>{c.put(e.request,res.clone());return res}))));
    return;
  }
  // uygulama dosyaları: önce ağ (güncellemeler gelsin), internet yoksa önbellek
  // tarayıcının 10 dakikalık sayfa önbelleğini atla, her açılışta sunucuya sor (değişmediyse küçük bir 304 döner)
  e.respondWith(fetch(e.request,{cache:"no-cache"}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match(e.request).then(r=>r||caches.match("index.html"))));
});
// zamanlayıcıdan gelen bildirimler
self.addEventListener("push",e=>{
  let d={}; try{d=e.data?e.data.json():{}}catch(x){d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"CENNET YOLU",{body:d.body||"",tag:d.tag,renotify:!!d.tag,icon:"icon-192.png",badge:"icon-192.png",data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if("focus" in c) return c.focus()} return self.clients.openWindow(e.notification.data&&e.notification.data.url||"./")}));
});
