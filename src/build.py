"""Builds the standalone, offline-capable Wochentopf app into app/ from index.html."""
import hashlib, json, pathlib, re

root = pathlib.Path(__file__).parent
repo = root.parent
src = (root / "wochentopf.html").read_text()
app = repo

title = re.search(r"<title>(.*?)</title>", src).group(1)
body = re.sub(r"<title>.*?</title>\n", "", src, count=1)
# swap Google Fonts for the bundled files so the app looks right offline
body = re.sub(r'<link rel="preconnect"[^>]*>\n', "", body)
body = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>\n', "", body)
fonts = """<style>
@font-face { font-family: "Bricolage Grotesque"; font-weight: 200 800; font-display: swap; src: url(fonts/bricolage.woff2) format("woff2"); }
@font-face { font-family: "Figtree"; font-weight: 300 900; font-display: swap; src: url(fonts/figtree.woff2) format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 400; font-display: swap; src: url(fonts/plexmono-400.woff2) format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 600; font-display: swap; src: url(fonts/plexmono-600.woff2) format("woff2"); }
</style>
"""
reset = (':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
         'body{margin:0;font:14px/1.4 system-ui,-apple-system,sans-serif;background:#f7f7f5}img{max-width:100%}[hidden]{display:none!important}')
head = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="Wochen-Essensplan und Einkaufsliste nach Supermarkt, Budget und Ziel.">
<meta name="theme-color" content="#2C6A43">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="{title}">
<style>{reset}</style>
{fonts}</head>
<body>
"""
(app / "index.html").write_text(head + body + "\n</body>\n</html>\n")

manifest = {
    "name": title, "short_name": title, "lang": "de",
    "description": "Wochen-Essensplan und Einkaufsliste nach Supermarkt, Budget und Ziel.",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#EEF2EC", "theme_color": "#2C6A43",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
    ],
}
(app / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

files = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png",
         "icons/icon-512.png", "fonts/bricolage.woff2", "fonts/figtree.woff2", "fonts/plexmono-400.woff2", "fonts/plexmono-600.woff2"]
h = hashlib.sha256()
for f in files[1:]:
    h.update((app / f).read_bytes())
version = h.hexdigest()[:10]
sw = f"""// Wochentopf offline cache. The version changes whenever a file changes, so updates arrive on the next start.
const CACHE = "wochentopf-{version}";
const FILES = {json.dumps(files)};
self.addEventListener("install", e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", e => {{
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", e => {{
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isPage = e.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  if (isPage) {{
    // the app itself: always try the newest version first, fall back to the saved copy offline
    e.respondWith(
      fetch(e.request, {{ cache: "no-store" }}).then(res => {{
        if (res.ok) {{ const copy = res.clone(); caches.open(CACHE).then(c => c.put("index.html", copy)); }}
        return res;
      }}).catch(() => caches.match("index.html"))
    );
    return;
  }}
  // fonts, icons: saved copy first
  e.respondWith(caches.match(e.request, {{ ignoreSearch: true }}).then(hit => hit || fetch(e.request)));
}});
"""
(app / "sw.js").write_text(sw)
print("built app/ version", version)
