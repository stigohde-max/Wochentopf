// Wochentopf offline cache. The version changes whenever a file changes, so updates arrive on the next start.
const CACHE = "wochentopf-7a2d2514b7";
const FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "fonts/bricolage.woff2", "fonts/figtree.woff2", "fonts/plexmono-400.woff2", "fonts/plexmono-600.woff2"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isPage = e.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isPage) {
    // the app itself: always try the newest version first, fall back to the saved copy offline
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); }
        return res;
      }).catch(() => caches.match("index.html"))
    );
    return;
  }
  // fonts, icons: saved copy first
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
