/* Paisa OS service worker: offline app shell, cached static assets, web push. */
const VERSION = "paisa-os-v2";
const SHELL = ["/", "/activity", "/cards", "/plan", "/more", "/review", "/manifest.webmanifest", "/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: stale-while-revalidate. Data lives in IndexedDB, so the cached shell
  // opens instantly (even on a slow network) and the fresh copy is used next
  // time. Hashed /_next/static assets stay cached, so an older shell still works.
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(url.pathname);
        const network = fetch(req).then((res) => {
          if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
          return res;
        });
        if (cached) {
          event.waitUntil(network.catch(() => {}));
          return cached;
        }
        return network.catch(() => cache.match("/"));
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Paisa OS", body: "", href: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { href: data.href || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(href);
          return c.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
