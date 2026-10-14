// Offline cache for connect.caudals.com. The build replaces the two
// placeholders with the release version and the files to precache.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `connect-${VERSION}`;
const PEOPLE = new RegExp('^/(__PEOPLE__)/?$');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('connect-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const language = () => ((self.navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es');

async function offlinePage(url) {
  const cache = await caches.open(CACHE);
  const exact = await cache.match(url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`);
  if (exact) return exact;
  const short = PEOPLE.exec(url.pathname);
  if (short) {
    const page = await cache.match(`/${language()}/${short[1]}/`);
    if (page) return page;
  }
  if (url.pathname === '/') {
    const index = await cache.match(`/${language()}/`);
    if (index) return index;
  }
  return (await cache.match('/404.html')) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && !response.redirected && url.pathname.endsWith('/')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() => offlinePage(url)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && url.pathname.startsWith('/assets/')) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
