/*
 * Service Worker — ทำให้เปิดแอปได้แม้ไม่มีอินเทอร์เน็ต
 * กลยุทธ์: network-first (ได้ไฟล์ล่าสุดเสมอเมื่อออนไลน์) → ถ้าออฟไลน์ใช้สำเนาที่แคชไว้
 * ค่า __VERSION__ จะถูกแทนที่ตอน build (tools/build.py)
 */
const CACHE = 'xauusd-journal-__VERSION__';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/app.js',
  './assets/calc.js',
  './assets/store.js',
  './assets/csv.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
