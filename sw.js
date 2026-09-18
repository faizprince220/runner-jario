/**
 * sw.js - Service Worker for Shadow Quest PWA
 * Versioned Offline Caching & Instant Playability
 */
const CACHE_NAME = 'shadow-quest-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './icon-192.png',
  './icon-512.png',
  './icon.png',
  './js/engine/Vector2.js',
  './js/engine/Input.js',
  './js/engine/Audio.js',
  './js/engine/Camera.js',
  './js/engine/Particles.js',
  './js/engine/Physics.js',
  './js/engine/Renderer.js',
  './js/entities/Player.js',
  './js/entities/Enemy.js',
  './js/entities/Boss.js',
  './js/entities/Collectibles.js',
  './js/entities/Interactive.js',
  './js/entities/Powerups.js',
  './js/levels/WorldData.js',
  './js/levels/LevelData.js',
  './js/save/SaveSystem.js',
  './js/ui/UIManager.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('Service Worker cache.addAll error:', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache
          return cachedResponse;
        }

        // Fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Cache new local resources dynamically
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return networkResponse;
          })
          .catch(() => {
            // Offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
