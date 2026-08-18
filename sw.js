const CACHE_NAME = 'moneta-v5.4.5';
const basePath = self.location.pathname.replace(/\/sw\.js$/, '').replace(/\/$/, '') || '';
const STATIC_ASSETS = [
  basePath + '/',
  basePath + '/index.html',
  basePath + '/styles.css',
  basePath + '/css/tokens.css',
  basePath + '/app.js',
  basePath + '/manifest.json',
  basePath + '/VERSION',
  basePath + '/icons/icon-192.png',
  basePath + '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

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

const ALLOWED_EXTERNAL_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isExternal = ALLOWED_EXTERNAL_HOSTS.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin && !isExternal) return;

  if (isExternal) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(response => {
            if (response && (response.status === 200 || response.type === 'opaque')) {
              cache.put(event.request, response.clone());
            }
            return response;
          })
        )
      ).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match(basePath + '/index.html') || caches.match(basePath + '/');
          }
          return new Response(null, { status: 503, statusText: 'Offline' });
        })
      )
    );
  }
});
