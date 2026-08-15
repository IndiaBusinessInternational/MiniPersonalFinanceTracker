/* Mini Personal Finance Tracker — service worker v1.3.0
   Bump CACHE on every release, in step with the version badge in index.html. */
const CACHE  = 'mpft-v1.3.0';
// The icons are precached too: an installed app that opens offline still has to
// draw its own mark in the install dialog and the task switcher.
const ASSETS = ['./', './index.html', './manifest.json',
                './icon-192.png', './icon-512.png', './icon-maskable-512.png',
                './apple-touch-icon.png', './favicon-32.png', './favicon.ico'];

/* addAll() fetches through the ordinary HTTP cache, so a browser holding a
   still-fresh copy of index.html will happily precache YESTERDAY's file under
   today's cache name — a version bump that ships the old app. Forcing
   cache:'reload' makes each precache fetch go to the network. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(
      ASSETS.map(u => fetch(new Request(u, {cache: 'reload'}))
        .then(r => r.ok ? c.put(u, r) : null)
        .catch(() => null))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Only GETs are cacheable, and the backend must never be served from a cache —
  // a stale ledger read would look exactly like a real one.
  if (req.method !== 'GET') return;
  if (req.url.includes('script.google.com') ||
      req.url.includes('script.googleusercontent.com') ||
      req.url.includes('docs.google.com')) return;

  // Fonts and the icon webfont are cross-origin and rarely change: serve from
  // cache when present, otherwise fetch and keep a copy so the app still looks
  // right offline.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return r;
      }).catch(() => Response.error()))
    );
    return;
  }

  // Own files: network first so an update is picked up as soon as it exists,
  // cache as the fallback so a dead connection still opens the app.
  e.respondWith(
    fetch(req).then(r => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
