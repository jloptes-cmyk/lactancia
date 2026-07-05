const CACHE = 'gota-a-gota-v2';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))));
self.addEventListener('notificationclick', event => { event.notification.close(); event.waitUntil(clients.openWindow('./index.html')); });
