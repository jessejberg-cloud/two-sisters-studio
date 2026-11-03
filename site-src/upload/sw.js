// Two Sisters Studio "Add art" service worker (scope /upload/).
// 1. Keeps the app's own files so it opens with no signal.
// 2. Receives pictures shared from other apps (Google Photos → Share → Add art), keeps them on the phone,
//    and opens the app, which picks them up.
// It never talks to anything outside this site.
'use strict';
const CACHE = 'tss-upload-__VERSION__';
const SHELL = __SHELL__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('tss-upload-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function saveShared(files) {
  return new Promise((ok, no) => {
    const r = indexedDB.open('two-sisters-studio', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('outbox', { keyPath: 'id' }); r.result.createObjectStore('shared', { keyPath: 'id' }); };
    r.onerror = () => no(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction('shared', 'readwrite'), s = t.objectStore('shared'), stamp = Date.now();
      files.forEach((f, i) => s.put({ id: stamp + '-' + i, file: f }));
      t.oncomplete = () => ok(); t.onerror = () => no(t.error);
    };
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method === 'POST' && url.pathname === '/upload/share') {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const files = form.getAll('photos').filter((f) => f && f.type && f.type.startsWith('image/'));
      await saveShared(files);
      return Response.redirect('/upload/?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate' && url.pathname.startsWith('/upload/')) {
    // Fresh copy when online (and keep it); the kept copy when there is no signal.
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/upload/', copy)); }
      return res;
    }).catch(() => caches.match('/upload/')));
    return;
  }
  if (SHELL.includes(url.pathname + url.search)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});
