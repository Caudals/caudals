const CACHE_NAME = "caudals-pwa-v1";
const APP_SHELL = [
  "/pwa",
  "/pwa/offline",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-maskable-512.png",
  "/caudals_logo_white.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const assetExtensions = [
  ".js",
  ".css",
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".webp",
  ".woff2",
];

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isAsset = assetExtensions.some((ext) =>
    url.pathname.endsWith(ext)
  );

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("/pwa/offline").then((res) => res))
    );
    return;
  }

  if (url.pathname.startsWith("/pwa")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (isAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          });
        })
    );
  }
});
