const CACHE_NAME = 'liahonaap-v3';
const STATIC_ASSETS = [
  '/',
  '/manifest.json?v=3',
  '/favicon.svg',
  '/icons/icon.svg?v=3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.log('Some static assets failed to cache:', err);
        return cache.addAll(['/', '/manifest.json?v=3']);
      });
    })
  );
  self.skipWaiting();
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
  
  if (url.origin !== self.location.origin) {
    return;
  }
  
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  const isAppShell = url.pathname === '/' || 
    url.pathname.endsWith('.js') || 
    url.pathname.endsWith('.css') || 
    url.pathname.endsWith('.woff') || 
    url.pathname.endsWith('.woff2') ||
    url.pathname.includes('/assets/') ||
    url.pathname.includes('index-') ||
    url.pathname.includes('chunk-');

  if (isAppShell) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);
        
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  
  const options = {
    body: data.body || data.description || '',
    icon: '/icons/icon.svg?v=3',
    badge: '/icons/icon.svg?v=3',
    vibrate: [200, 100, 200],
    tag: data.tag || 'liahonaap-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    data: {
      url: data.url || '/',
      notificationId: data.notificationId
    },
    actions: data.actions || [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Liahonaap', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.focus();
            if (urlToOpen !== '/') {
              client.navigate(urlToOpen);
            }
            return;
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('Notification closed:', event.notification.tag);
});
