const CACHE_NAME = 'moneta-v5.2.1';
const basePath = self.location.pathname.replace(/\/sw\.js$/, '').replace(/\/$/, '') || '';
const STATIC_ASSETS = [
  basePath + '/',
  basePath + '/index.html',
  basePath + '/styles.css',
  basePath + '/css/tokens.css',
  basePath + '/app.js',
  basePath + '/manifest.json',
  basePath + '/icons/icon-192.png',
  basePath + '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => console.log('Cache failed:', err))
  );
});

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isExternal = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].some(domain => url.hostname.includes(domain));
  if (!url.origin.includes(self.location.hostname) && !isExternal) return;

  if (isExternal) {
    // Cache-first for external CDN assets (versioned, rarely change)
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(response => {
            if (response && response.status === 200 && response.type === 'cors') {
              cache.put(event.request, response.clone());
            }
            return response;
          })
        )
      ).catch(() => caches.match(event.request))
    );
  } else {
    // Network-first for local assets (ensures updates reflect immediately)
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response('Moneta is offline.', { status: 503 })
        )
      )
    );
  }
});
