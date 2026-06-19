/* Rendix — Service Worker
   Estrategia:
   - Navegaciones (HTML): network-first con respaldo a caché (no se queda pegado en versiones viejas).
   - Estáticos propios (iconos, manifest): cache-first.
   - CDN (Firebase, Google Fonts): stale-while-revalidate (sirve offline tras la primera carga online).
   Sube el número de versión cada vez que cambies index.html para forzar actualización. */
const VERSION = 'rendix-v3.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

// Rutas relativas (clave para GitHub Pages en subcarpeta como /rendix/)
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const mismoOrigen = url.origin === self.location.origin;

  // 1) Navegaciones: network-first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(SHELL).then((c) => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // 2) Estáticos propios: cache-first
  if (mismoOrigen) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(SHELL).then((c) => c.put(req, copia));
        return res;
      }))
    );
    return;
  }

  // 3) CDN externo (gstatic / fonts): stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME).then((cache) =>
      cache.match(req).then((cached) => {
        const red = fetch(req).then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || red;
      })
    )
  );
});
