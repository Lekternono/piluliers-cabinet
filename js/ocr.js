// Lecture d'ordonnance : texte d'une photo (Tesseract, dans le navigateur) ou d'un PDF (pdf.js),
// puis analyse de la posologie, de la date, du prescripteur et de la durée.
// Rien n'est envoyé à un service extérieur : les modules sont téléchargés puis tout tourne sur l'appareil.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const TESSERACT_SRI = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs';

export const normaliser = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

export const titre = (s) => (s || '').toLowerCase()
  .replace(/(^|[\s\-/(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());

export function formeDepuisBdpm(f) {
  f = normaliser(f);
  if (/sachet/.test(f)) return 'sachet';
  if (/gelule/.test(f)) return 'gélule';
  if (/capsule/.test(f)) return 'capsule';
  if (/comprime|lyophilisat/.test(f)) return 'comprimé';
  if (/gouttes/.test(f)) return 'gouttes';
  if (/ampoule/.test(f)) return 'ampoule';
  if (/injectable|perfusion/.test(f)) return 'injection';
  if (/transdermique|patch/.test(f)) return 'patch';
  if (/collyre/.test(f)) return 'collyre';
  if (/inhal/.test(f)) return 'inhalateur';
  if (/buvable|sirop/.test(f)) return 'sirop';
  return 'autre';
}

export const lienFicheOfficielle = (cis) => `https://base-donnees-publique.medicaments.gouv.fr/medicament/${encodeURIComponent(cis)}/extrait`;

// ---------------------------------------------------------------------
// Extraction du texte
// ---------------------------------------------------------------------
function chargerScript(src, integrity) {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.crossOrigin = 'anonymous';
    if (integrity) s.integrity = integrity;
    s.onload = ok;
    s.onerror = () => ko(new Error('Module de lecture indisponible : vérifie la connexion Internet'));
    document.head.appendChild(s);
  });
}

let moteur = null;
async function texteImage(source, progres) {
  await chargerScript(TESSERACT, TESSERACT_SRI);
  if (!moteur) {
    progres?.('Préparation du module de lecture (première fois : quelques secondes)…');
    moteur = await window.Tesseract.createWorker('fra', 1, {
      logger: (m) => { if (m.status === 'recognizing text') progres?.(`Lecture du texte… ${Math.round(m.progress * 100)} %`); }
    });
  }
  const { data } = await moteur.recognize(source);
  return data.text || '';
}

async function preparerImage(file) {
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * r); cv.height = Math.round(bmp.height * r);
  const ctx = cv.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.25)';
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv;
}

async function textePdf(file, progres) {
  progres?.('Ouverture du PDF…');
  const pdfjs = await import(PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= Math.min(doc.numPages, 4); n++) {
    const page = await doc.getPage(n);
    const contenu = await page.getTextContent();
    const items = contenu.items.filter((i) => i.str && i.str.trim());
    if (items.length >= 5) {
      // PDF avec texte (ordonnance numérique, PDF généré) : on reconstitue les lignes
      const rangs = [];
      for (const it of items) {
        const y = it.transform[5], x = it.transform[4];
        let r = rangs.find((z) => Math.abs(z.y - y) < 3);
        if (!r) { r = { y, morceaux: [] }; rangs.push(r); }
        r.morceaux.push({ x, s: it.str });
      }
      rangs.sort((a, b) => b.y - a.y);
      pages.push(rangs.map((r) => r.morceaux.sort((a, b) => a.x - b.x).map((m) => m.s).join(' ').replace(/\s+/g, ' ').trim()).join('\n'));
    } else {
      // PDF scanné : on photographie la page puis on la lit
      progres?.(`Page ${n} : lecture de l'image…`);
      const vue = page.getViewport({ scale: 2.5 });
      const cv = document.createElement('canvas');
      cv.width = vue.width; cv.height = vue.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vue }).promise;
      pages.push(await texteImage(cv, progres));
    }
  }
  return pages.join('\n');
}

export async function lireDocument(file, progres) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return textePdf(file, progres);
  progres?.("Préparation de l'image…");
  return texteImage(await preparerImage(file), progres);
}

// ---------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------
const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const pad = (n) => String(n).padStart(2, '0');

function chercherDate(t) {
  const n = normaliser(t);
  let m = n.match(/\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})\b/);
  if (m) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (a >= 2020 && a <= 2100 && Number(m[2]) <= 12 && Number(m[1]) <= 31) return `${a}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = n.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
  if (m) return `${m[3]}-${pad(MOIS[m[2]])}-${pad(m[1])}`;
  return null;
}

function chercherPrescripteur(lignes) {
  for (const l of lignes) {
    const m = l.match(/\b(?:Dr|Docteur|DR|DOCTEUR)\.?\s+([A-ZÀ-Ýa-zà-ÿ][\wÀ-ÿ'\-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'\-]+){0,2})/);
    if (m) return `Dr ${titre(m[1].trim())}`;
  }
  return null;
}

function chercherDuree(t) {
  const n = normaliser(t);
  const m = n.match(/(?:pendant|qsp|q\.s\.p\.?|pour|traitement de|duree)\s*:?\s*(\d+)\s*(mois|semaines?|jours?)/);
  if (!m) return null;
  let mois = 0, jours = 0;
  if (m[2].startsWith('mois')) mois = Number(m[1]);
  else if (m[2].startsWith('semaine')) jours = Number(m[1]) * 7;
  else jours = Number(m[1]);
  const r = n.match(/renouvel\w*\s*(\d+)\s*fois/);
  const fois = r ? Number(r[1]) + 1 : 1;
  return { mois: mois * fois, jours: jours * fois };
}

export function analyserOrdonnance(texte) {
  const lignes = texte.split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length >= 2);
  return { lignes, date: chercherDate(texte), prescripteur: chercherPrescripteur(lignes), duree: chercherDuree(texte) };
}

const MOTS_NB = { un: '1', une: '1', deux: '2', trois: '3', quatre: '4', demi: '0.5' };
const MOMENT = { matin: 'matin', midi: 'midi', soir: 'soir', coucher: 'coucher', nuit: 'coucher' };

export function analyserPosologie(brut) {
  const res = { matin: 0, midi: 0, soir: 0, coucher: 0, si_besoin: null, aPreciser: false };
  let t = normaliser(brut)
    .replace(/½/g, ' 0.5 ')
    .replace(/(\d+),(\d+)/g, '$1.$2')
    .replace(/\b(une?|deux|trois|quatre|demi)\b/g, (m) => MOTS_NB[m]);

  const sb = brut.match(/\b(?:si\s+(?:besoin|douleurs?|fi[eè]vre|n[eé]cessaire)|en\s+cas\s+d[e']?)[^·\n]*/i);
  if (sb) res.si_besoin = sb[0].trim().replace(/[.,;]+$/, '');

  t = t.replace(/\b1\s*\/\s*2\b(?!\s*\/\s*\d)/g, '0.5');

  // Forme 1-0-1 ou 1/0/1/0 (hors dates)
  const g = t.match(/(?:^|[^\d.])([0-4](?:\.5)?)\s*[-/]\s*([0-4](?:\.5)?)\s*[-/]\s*([0-4](?:\.5)?)(?:\s*[-/]\s*([0-4](?:\.5)?))?(?![\d.])/);
  if (g) {
    res.matin = Number(g[1]); res.midi = Number(g[2]); res.soir = Number(g[3]); res.coucher = Number(g[4] || 0);
    return res;
  }
  // « 1 cp 3 fois par jour »
  const f = t.match(/(?:(\d+(?:\.\d+)?)\s*(?:cp|comprimes?|gelules?|sachets?|capsules?)?\s*)?(\d)\s*(?:fois|x)\s*(?:par|\/)\s*(?:jour|j)\b/);
  if (f) {
    const qte = Number(f[1] || 1), n = Number(f[2]);
    const ordre = n >= 4 ? ['matin', 'midi', 'soir', 'coucher'] : n === 3 ? ['matin', 'midi', 'soir'] : n === 2 ? ['matin', 'soir'] : ['matin'];
    ordre.forEach((k) => { res[k] = qte; });
    return res;
  }

  // « 1 comprimé le matin et le soir », « 1/2 cp au coucher »
  const moments = '(?:matin|midi|soir|coucher|nuit)';
  const liaison = '(?:\\s*(?:,|et|\\+|-|/)\\s*(?:(?:le|au|a|la)\\s+)*)';
  const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:(?:cp|comprimes?|gelules?|sachets?|capsules?|ampoules?|doses?|bouffees?)\\s*)?(?:(?:le|au|a|la|du|des|en|par)\\s+)*(${moments}(?:${liaison}${moments})*)`, 'g');
  let trouve = false;
  for (const m of t.matchAll(re)) {
    const qte = Number(m[1]);
    if (qte > 6) continue;
    for (const mo of m[2].match(new RegExp(moments, 'g'))) { res[MOMENT[mo]] += qte; trouve = true; }
  }
  if (!trouve) {
    // Moment sans quantité : « matin et soir » → 1 par moment
    const seuls = t.match(new RegExp(`\\b${moments}\\b`, 'g'));
    if (seuls && !/\d+\s*(mois|jours?|semaines?)/.test(t)) { seuls.forEach((mo) => { res[MOMENT[mo]] = 1; }); trouve = true; }
  }
  if (!trouve && !res.si_besoin) res.aPreciser = true;
  return res;
}
