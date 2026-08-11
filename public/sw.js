// public/sw.js
// Service Worker with "Stale While Revalidate" strategy for API calls
// and "Cache First" for static assets

const CACHE_NAME = 'kbnl-v2';
const API_CACHE_NAME = 'kbnl-api-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/login',
  '/offline.html',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
];

// === Client context (set via postMessage from the page) ===
let CLIENT_VAPID_KEY = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

// Install: Cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching essential assets...');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== API_CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
  console.log('[SW] Activated and claimed clients');
});

// Fetch: Different strategies based on request type
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // NEVER cache Supabase API calls — always fetch fresh
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // In development: never cache anything, always go to network
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // API calls: "Stale While Revalidate"
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // HTML pages: Network first, fallback to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // Static assets (CSS, JS, images): Cache first
  event.respondWith(cacheFirst(request));
});

// === Stale While Revalidate Strategy ===
// Return cached data immediately (if available)
// Fetch fresh data in background and update cache
async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);

  // Fetch fresh data in background (don't wait for it)
  const fetchPromise = fetch(request)
    .then((response) => {
      // Only cache successful responses
      if (response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {
      // Network failed, return cached if available
      return cached || createOfflineResponse();
    });

  // Return cached data immediately (if available)
  // Or wait for fetch if nothing cached
  return cached || fetchPromise;
}

// === Network First Strategy (for HTML) ===
async function networkFirstHtml(request) {
  try {
    const response = await fetch(request);
    // Cache successful HTML responses
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed, return cached version
    const cached = await caches.match(request);
    return cached || createOfflineResponse();
  }
}

// === Cache First Strategy (for static assets) ===
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    // Cache successful responses
    if (response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return createOfflineResponse();
  }
}

// === Offline Fallback Response ===
function createOfflineResponse() {
  return new Response(
    JSON.stringify({
      error: 'Offline - No cached data available',
      offline: true,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

// === Message Handler ===
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data?.type)

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    const cache = caches.open(CACHE_NAME);
    cache.then((c) => c.addAll(event.data.urls));
  }

  if (event.data && event.data.type === 'SET_CLIENT_CONTEXT') {
    if (event.data.vapidKey) CLIENT_VAPID_KEY = event.data.vapidKey;
  }

  if (event.data && event.data.type === 'PING') {
    if (event.source) {
      event.source.postMessage({ type: 'PONG', scope: self.registration.scope });
    }
  }
});

// === Push Notification Handler ===
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received', event.data ? 'with data' : 'no data')

  if (!event.data) {
    console.warn('[SW] Push event has no data')
    return
  }

  let payload
  try {
    payload = event.data.json()
    console.log('[SW] Push payload:', payload)
  } catch (e) {
    console.warn('[SW] Push data is not JSON, treating as text:', e)
    payload = {
      title: 'KbNL',
      body: event.data.text(),
      icon: '/logo-192.png',
      url: '/',
      tag: 'kbnl-notification',
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/logo-192.png',
    badge: '/logo-192.png',
    tag: payload.tag || 'kbnl-notification',
    data: { url: payload.url || '/' },
    vibrate: [100, 50, 100],
    requireInteraction: false,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'KbNL', options)
      .then(() => console.log('[SW] Notification shown:', payload.title))
      .catch(err => console.error('[SW] showNotification failed:', err))
  )
})

// === Notification Click Handler ===
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag)
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(url)
              return
            } catch {
              // Fall through to openWindow.
            }
          } else {
            return
          }
        }
      }
      return clients.openWindow(url)
    })
  )
})

// === Push Subscription Change Handler ===
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const existing = await self.registration.pushManager.getSubscription();
      const options =
        event.oldSubscription?.options ||
        existing?.options ||
        (CLIENT_VAPID_KEY
          ? { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(CLIENT_VAPID_KEY) }
          : null);

      if (!options) {
        console.error('[SW] pushsubscriptionchange: no options available to re-subscribe');
        return;
      }

      const subscription = await self.registration.pushManager.subscribe(options);
      const json = subscription.toJSON();

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          oldEndpoint: event.oldSubscription?.endpoint,
        }),
      });
    })()
  );
})

console.log('[SW] Service Worker loaded');
