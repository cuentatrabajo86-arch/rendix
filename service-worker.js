/* Rendix — Service Worker
   Estrategia:
   - Navegaciones (HTML): network-first con respaldo a caché (no se queda pegado en versiones viejas).
   - Estáticos propios (iconos, manifest): cache-first.
   - CDN (Firebase, Google Fonts): stale-while-revalidate (sirve offline tras la primera carga online).
   Sube el número de versión cada vez que cambies index.html para forzar actualización. */
const VERSION = 'rendix-v3.1.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const RED_TOPE_MS = 3000; // NUEVO v2.1: máximo que esperamos la red antes de servir el caché

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

  // 1) Navegaciones: network-first CON TOPE — si la red tarda más de 3s,
  //    servimos el caché al instante y la red sigue actualizando en segundo plano.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const red = fetch(req).then((res) => {
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      });
      const tope = new Promise((r) => setTimeout(() => r(null), RED_TOPE_MS));
      const primero = await Promise.race([red.catch(() => null), tope]);
      if (primero) return primero;
      const guardada = (await cache.match('./index.html')) || (await cache.match('./'));
      if (guardada) return guardada;      // señal lenta: entra ya con lo guardado
      return red.catch(() => new Response('Sin conexión y sin caché aún. Conéctate una vez.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    })());
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
