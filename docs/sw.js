// Offline-Cache für die App-Hülle. Open-Food-Facts-Anfragen gehen immer ins Netz.
const CACHE = 'kitchenplanner-v3';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'logic.js', 'foods.json', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.hostname.endsWith('openfoodfacts.org')) return;
  // Netz zuerst (damit Updates sofort ankommen), offline aus dem Cache.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('index.html'))),
  );
});
