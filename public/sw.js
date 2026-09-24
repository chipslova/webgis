// Digital Earth Indonesia WebGIS - Service Worker
const CACHE_NAME = 'de-webgis-v1.5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/basemap/styles/esri-style-streets.json',
  '/basemap/styles/esri-style-topographic.json',
  '/basemap/styles/esri-style-imagery-clarity.json',
  '/basemap/styles/osm-style-humanitarian.json',
  '/basemap/styles/carto-style-dark-matter.json',
  '/basemap/styles/carto-style-voyager.json',
  '/basemap/styles/big-style-rbi.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some static assets failed to precache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Don't intercept live WMS or external large raster streaming
  if (url.hostname.includes('piksel.big.go.id') || url.pathname.includes('/api/wms-proxy')) {
    return;
  }

  // Network-first strategy with cache fallback for HTML navigation
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match('/index.html') || caches.match('/');
        })
    );
    return;
  }

  // Cache-first for local static styles and scripts
  if (url.origin === location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/basemap/'))) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});
