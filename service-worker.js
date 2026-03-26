const CACHE_NAME = 'safeher-shell-v4';
const APP_SHELL_PATHS = [
  './',
  'index.html',
  'download.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon.png',
  'css/global.css',
  'css/landing.css',
  'css/app.css',
  'css/download.css',
  'js/runtime-config.js',
  'js/landing.js',
  'js/download.js',
  'js/app.js',
  'js/verify.js',
  'js/map.js',
  'js/sos.js',
  'js/danger.js',
  'js/rating.js',
  'js/incident-view.js',
  'pages/dashboard.html',
  'pages/verify.html',
  'pages/map.html',
  'pages/sos.html',
  'pages/danger.html',
  'pages/rating.html',
  'pages/incident-view.html'
];
const APP_SHELL = APP_SHELL_PATHS.map(path => new URL(path, self.location.href).pathname);
const INDEX_FALLBACK = new URL('index.html', self.location.href).pathname;
const IMAGE_FALLBACK = new URL('icon-192.png', self.location.href).pathname;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const shouldUseNetworkFirst =
    event.request.mode === 'navigate' ||
    ['script', 'style', 'document', 'manifest'].includes(event.request.destination);

  if (shouldUseNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request, { ignoreSearch: true }).then(cached => cached || caches.match(INDEX_FALLBACK))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          if (event.request.destination === 'image') {
            return caches.match(IMAGE_FALLBACK);
          }
          return caches.match(INDEX_FALLBACK);
        });
    })
  );
});
