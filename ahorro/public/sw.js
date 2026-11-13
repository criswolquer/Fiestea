// Sin conexión: guarda la app y la sirve cuando no hay red. Los datos están en IndexedDB.
const CACHE = "ahorro-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// La app avisa de los archivos que ya ha cargado (en la primera visita aún no pasaban por aquí)
// para guardarlos y que funcione sin conexión desde el principio.
self.addEventListener("message", (e) => {
  if (e.data?.type !== "cache-urls" || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.filter((u) => { try { return new URL(u).origin === self.location.origin; } catch { return false; } });
  e.waitUntil(caches.open(CACHE).then((c) =>
    Promise.all(urls.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => undefined))))));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Archivos con hash en el nombre: nunca cambian, primero la caché.
  if (url.pathname.includes("/assets/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // El resto: primero la red para recibir actualizaciones; sin red, la caché.
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
});
