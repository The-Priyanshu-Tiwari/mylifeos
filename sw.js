/* MyLife OS service worker — precaches the app shell so it works fully offline.
   Bump CACHE version whenever files change so clients pick up the update. */
const CACHE = 'mylifeos-v1.0.1';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/util.js', './js/db.js', './js/finance.js', './js/tasks.js', './js/models.js', './js/charts.js', './js/ui.js', './js/forms.js',
  './js/views/home.js', './js/views/tasks.js', './js/views/expenses.js', './js/views/finance.js', './js/views/more.js',
  './js/views/habits.js', './js/views/goals.js', './js/views/notes.js', './js/views/calendar.js', './js/views/reports.js', './js/views/settings.js',
  './js/app.js', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Cache-first for same-origin GET requests; fall back to network and cache the result.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
