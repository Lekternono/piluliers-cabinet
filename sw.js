/* Piluliers : fonctionnement hors ligne
   - l'appli (pages, styles, scripts) : réseau d'abord, copie locale si pas de réseau
   - les scans d'ordonnances déjà affichés : gardés pour être consultables sans réseau
   - les données (API) ne passent jamais par ici : l'appli garde sa propre copie */
const APPLI = 'piluliers-appli-v5';
const DOCS = 'piluliers-docs-v1';
const COQUILLE = [
  '/', '/css/app.css', '/css/theme.css', '/js/app.js', '/js/api.js', '/js/demo.js', '/js/ocr.js', '/js/config.js', '/js/zip.js', '/js/lib/supabase-2.119.2.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/img/fond-clair.jpg', '/img/fond-sombre.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(APPLI);
    await c.addAll(COQUILLE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![APPLI, DOCS].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const avecDelai = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('délai')), ms))]);

async function reseauDabord(req, cle) {
  const c = await caches.open(APPLI);
  try {
    const rep = await avecDelai(fetch(req), 5000);
    if (rep.ok) c.put(cle, rep.clone());
    return rep;
  } catch (err) {
    const copie = await c.match(cle, { ignoreSearch: true });
    if (copie) return copie;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Appli : la navigation renvoie toujours la page d'accueil (routes en #)
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/vendor/')) return; // moteur de lecture : gros fichiers, utile seulement en ligne
    const cle = req.mode === 'navigate' ? '/' : url.pathname;
    e.respondWith(reseauDabord(req, cle));
    return;
  }

  // Scans d'ordonnances (liens signés) : rangés sans le jeton, pour les retrouver hors ligne
  if (/\.supabase\.co$/.test(url.hostname) && url.pathname.startsWith('/storage/v1/object/sign/documents/')) {
    const cle = url.origin + url.pathname;
    e.respondWith((async () => {
      const c = await caches.open(DOCS);
      try {
        const rep = await fetch(req);
        if (rep.ok) c.put(cle, rep.clone());
        return rep;
      } catch (err) {
        const copie = await c.match(cle);
        if (copie) return copie;
        throw err;
      }
    })());
  }
});

// Notifications envoyées par le cabinet (ordonnance envoyée, échéances du matin)
self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { titre: 'Piluliers', corps: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(m.titre || 'Piluliers', {
      body: m.corps || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      data: { url: m.url || '#/accueil' }, tag: m.url && m.url.startsWith('#/tableau') ? 'echeances' : undefined
    });
    if (typeof m.badge === 'number' && self.navigator.setAppBadge) { try { await self.navigator.setAppBadge(m.badge); } catch { /* non pris en charge */ } }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = '/' + (e.notification.data?.url || '#/accueil');
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) {
      if ('focus' in f) { await f.focus(); f.postMessage({ aller: e.notification.data?.url || '#/accueil' }); return; }
    }
    await self.clients.openWindow(cible);
  })());
});
