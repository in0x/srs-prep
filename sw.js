const CACHE = 'srs-prep-v11';

// Everything the app needs to run offline
const PRECACHE = [
  '/srs-prep/',
  '/srs-prep/index.html',
  '/srs-prep/app.js',
  '/srs-prep/manifest.json',
  '/srs-prep/icon-192.png',
  '/srs-prep/icon-512.png',
  // React + ReactDOM from esm.sh — cached on first load
  'https://esm.sh/react@18.3.1',
  'https://esm.sh/react-dom@18.3.1/client',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // Precache local files; CDN files cached on first fetch
      cache.addAll([
        '/srs-prep/',
        '/srs-prep/index.html',
        '/srs-prep/app.js',
        '/srs-prep/manifest.json',
      ])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Remove old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Cache-first: serve from cache, fall back to network and cache the response
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Only cache valid responses
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('/srs-prep/index.html');
        }
      });
    })
  );
});
