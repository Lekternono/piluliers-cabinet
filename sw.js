/* Piluliers : fonctionnement hors ligne
   - l'appli (pages, styles, scripts) : réseau d'abord, copie locale si pas de réseau
   - les scans d'ordonnances déjà affichés : gardés pour être consultables sans réseau
   - les données (API) ne passent jamais par ici : l'appli garde sa propre copie */
const APPLI = 'piluliers-appli-v3';
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
