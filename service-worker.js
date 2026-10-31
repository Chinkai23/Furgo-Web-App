const CACHE_NAME = 'furgo-pages-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('furgo-pages-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Revalidate with GitHub Pages on each request so updates replace stale browser copies.
      // `no-cache` can return a raw 304 response here. Service workers cannot
      // safely hand that response to the page, which can leave the app blank.
      // `reload` bypasses the HTTP cache and gives this worker a full response.
      const response = await fetch(new Request(request, { cache: 'reload' }));
      if (response.ok && response.type === 'basic') {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return await cache.match(request) || Response.error();
    }
  })());
});
