// Copia della web app sull'iPhone, per aprirla anche senza rete.
// File dell'app: prima la rete (così gli aggiornamenti arrivano subito), se manca si usa la copia.
// File grandi e fissi (lettura delle copertine): prima la copia.
// L'archivio online (Supabase) e i cataloghi non passano di qui: ci pensa db.js con la sua copia locale.
const CACHE = "lei-web-20261022-170144";
const CORE = [
  "./", "index.html", "web.css", "style.css", "scrittura.css", "collection.css",
  "config.js", "core.js", "db.js", "sync.js", "sections.js", "allenamento.js", "dieta.js", "scrittura.js",
  "categorie.js", "dispensa.js", "zxing.min.js", "scanner.js", "collection.js", "manifest.webmanifest", "icon-180.png", "icon-192.png"
];
const BIG = /\.(gz|wasm\.js)$|tesseract/;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("lei-web-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (BIG.test(req.url)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    })));
    return;
  }
  e.respondWith(
    fetch(req, { cache: "no-cache" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("index.html")))
  );
});
