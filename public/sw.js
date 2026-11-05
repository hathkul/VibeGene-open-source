const CACHE_NAME = 'vibegene-v1.6.3'

self.addEventListener('install', (event) => {
  // Activate this worker immediately so returning visitors leave the alpha shell behind.
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/logo_favicon.png',
        '/vibegene-logo-splash-bright.png',
        '/vibegene-logo-splash-dark.png',
        '/beta-badge.png',
      ]),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // Never cache telemetry/admin API — stale empty responses hide new bug reports.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) {
    event.respondWith(fetch(event.request))
    return
  }

  const accept = event.request.headers.get('accept') || ''
  const isNavigation = event.request.mode === 'navigate'
  const isHtml = accept.includes('text/html')
  const isAppShell =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.webmanifest'

  // Always prefer network for HTML / shell so splash branding and releases update.
  if (isNavigation || isHtml || isAppShell) {
    event.respondWith(networkFirst(event.request))
    return
  }

  event.respondWith(cacheFirst(event.request))
})

function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      }
      return response
    })
    .catch(() => caches.match(request).then((cached) => cached || Response.error()))
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (!response || response.status !== 200 || response.type === 'opaque') return response
      const copy = response.clone()
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
      return response
    })
  })
}
