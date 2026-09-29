// GitHub Pages のプロジェクトサイトは同じ origin に複数の PWA が同居できる。
// キャッシュ名に公開パスを含め、このアプリ以外のキャッシュを消さない。
const APP_ROOT = new URL('./', self.location.href);
const CACHE_PREFIX = `gordon-pet:${APP_ROOT.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v29`;
const APP_FILES = [
  './', './index.html', './styles.css', './app.js', './state.js', './time.js', './dialogue.js', './sprites.js', './behaviors.js', './gadgets.js', './games.js', './foods.js',
  './manifest.webmanifest', './assets/gordon/gordon-idle.png',
  './assets/gordon/gordon-look.png', './assets/gordon/gordon-hat.png', './assets/gordon/gordon-tail.png', './assets/gordon/gordon-annoyed.png',
  './assets/gordon/gordon-feed.png', './assets/gordon/gordon-pet.png', './assets/gordon/gordon-sit.png', './assets/gordon/gordon-rest.png',
  './assets/gordon/gordon-walk.png', './assets/gordon/gordon-work.png',
  './assets/gordon/gordon-radio.png', './assets/gordon/gordon-caliper.png', './assets/gordon/gordon-label-maker.png',
  './assets/gadgets/radio.png', './assets/gadgets/caliper.png', './assets/gadgets/label-maker.png',
  './assets/gadgets/room-radio.svg', './assets/gadgets/room-caliper.svg', './assets/gadgets/room-label-maker.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_FILES.map(file => new URL(file, APP_ROOT).href)))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE_NAME).then(async cache => {
    if (event.request.mode === 'navigate') {
      // ?debug=1 付きのURLも、オフラインではこのプロジェクトのホームへ戻す。
      const cached = await cache.match(event.request, { ignoreSearch: true });
      return cached || fetch(event.request).catch(() => cache.match(new URL('./index.html', APP_ROOT).href));
    }
    return (await cache.match(event.request)) || fetch(event.request);
  }));
});
