// Kurti Post Maker service worker. It only handles addresses inside its own folder,
// so the rest of the website is never touched.
const CACHE = 'kurti-app-v1';
const SHARED = 'kurti-shared';
const FILES = ['./', './index.html', './jszip.min.js', './manifest.json', './icon-192.png', './icon-512.png'];
const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('kurti-app-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (e.request.method === 'POST' && url.pathname === BASE + 'share-target') {
    e.respondWith(receiveShare(e.request));
    return;
  }
  if (e.request.method !== 'GET' || url.pathname.startsWith(BASE + '__shared/')) return;
  // Network first so updates show up, saved copy when offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

async function receiveShare(request) {
  const back = new URL('./?shared=1', self.location).href;
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARED);
    for (const k of await cache.keys()) await cache.delete(k);
    const meta = { text: [form.get('title'), form.get('text'), form.get('url')].filter(Boolean).join('\n'), files: [] };
    let i = 0;
    for (const f of form.getAll('media')) {
      if (!f || typeof f === 'string' || !f.size) continue;
      const key = new URL('./__shared/' + (i++), self.location).href;
      await cache.put(key, new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }));
      meta.files.push({ key: './__shared/' + (i - 1), name: f.name || ('shared-' + i), type: f.type || '' });
    }
    await cache.put(new URL('./__shared/meta', self.location).href, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
  } catch (err) { /* open the app anyway */ }
  return Response.redirect(back, 303);
}
