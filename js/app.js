import { CONFIG } from './config.js';
import { createApi } from './api.js';
import { createDemoApi } from './demo.js';
import { lireDocument, analyserOrdonnance, analyserPosologie, analyserPatient, normaliser, titre, formeDepuisBdpm, lienFicheOfficielle } from './ocr.js';

// =====================================================================
// Utilitaires
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const addMonths = (s, n) => { const d = parse(s); d.setMonth(d.getMonth() + n); return ymd(d); };
const isoDay = (s) => { const x = parse(s).getDay(); return x === 0 ? 7 : x; };
const lundi = (s) => addDays(s, 1 - isoDay(s));
const ecart = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const localDate = (ts) => ymd(new Date(ts));
const fmt = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
const fmtCourt = (s) => (s ? `${JABR[isoDay(s)]} ${fmt(s).slice(0, 5)}` : '');
const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const JC = ['', 'L', 'M', 'M', 'J', 'V', 'S', 'D'];
const JABR = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const MOMENTS = [['matin', 'Matin'], ['midi', 'Midi'], ['soir', 'Soir'], ['coucher', 'Nuit']];
const STATUTS = { actif: 'Actif', hospitalise: 'Hospitalisé', suspendu: 'Suspendu', arrete: 'Arrêté' };
const FORMES = ['comprimé', 'gélule', 'sachet', 'ampoule', 'capsule', 'gouttes', 'sirop', 'patch', 'injection', 'inhalateur', 'collyre', 'autre'];
const UNITES = { comprimé: 'cp', gélule: 'gél.', sachet: 'sachet', ampoule: 'amp.', capsule: 'caps.' };
const pieces = (n) => Math.floor(n) + (n % 1 > 0 ? 1 : 0);
const DOSES = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5];
const FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

function q(n) {
  n = Number(n) || 0;
  if (!n) return '0';
  const e = Math.floor(n);
  const f = +(n - e).toFixed(2);
  return `${e || ''}${FRAC[f] || (f ? String(f).slice(1) : '')}` || '0';
}
function age(ddn) {
  if (!ddn) return '';
  const d = parse(ddn), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--;
  return `${a} ans`;
}
function depuis(ts) {
  if (!ts) return '';
  const min = Math.round((Date.now() - new Date(ts)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 24) return `il y a ${Math.round(min / 60)} h`;
  if (min < 60 * 24 * 7) return `il y a ${Math.round(min / 1440)} j`;
  return `le ${fmt(localDate(ts))}`;
}
const nomPatient = (p) => (p ? `${p.nom.toUpperCase()} ${p.prenom}` : 'Patient supprimé');
const nomMembre = (id) => (id ? S.membres.get(id) || 'Membre retiré' : 'Système');
const nomLigne = (l) => `${l.medicament}${l.dosage ? ' ' + l.dosage : ''}`;
const unite = (l, n = 1) => { const u = UNITES[l.forme] || ''; return u === 'sachet' && n > 1 ? 'sachets' : u; };
const quotidien = (l) => (l.jours || []).length === 7;
const joursTexte = (l) => (quotidien(l) ? 'tous les jours' : (l.jours || []).slice().sort().map((j) => JABR[j]).join(' '));
const totalJour = (l) => MOMENTS.reduce((s, [k]) => s + (Number(l[k]) || 0), 0);
const verbeLigne = (l) => (!l.actif ? 'arrêté' : l.created_at && l.modifie_le && Math.abs(new Date(l.modifie_le) - new Date(l.created_at)) < 10000 ? 'ajouté' : 'modifié');

function actifLe(l, s) {
  if (!l.actif) return false;
  if (l.date_debut && s < l.date_debut) return false;
  if (l.date_fin && s > l.date_fin) return false;
  return (l.jours || []).includes(isoDay(s));
}

const ICON = {
  accueil: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  patients: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6z"/><circle cx="17" cy="9" r="2.6"/><path d="M15.8 14.2c2.9-.4 5.2 1.6 5.7 4.8h-4"/></svg>',
  reglages: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.5 7.5 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.4z"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 9h8M8 12h8M8 15h5"/></svg>',
  pilule: '<svg viewBox="0 0 24 24"><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m9.2 8 5.6 8"/></svg>'
};

// =====================================================================
// État
// =====================================================================
let api = null;
const S = {
  configure: !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY),
  user: null, moi: null, membres: new Map(),
  patients: [], lignes: [], ordonnances: [],
  fiche: null, prep: {}, photos: new Map(), suggestions: [], ocr: null,
  filtre: 'actifs', recherche: '', authMode: 'connexion', authMessage: '',
  verrouille: false, recuperation: false, masqueLe: 0
};
const app = $('#app');

const patientById = (id) => S.patients.find((p) => p.id === id);
const lignesDe = (id) => S.lignes.filter((l) => l.patient_id === id);
const ordonnancesDe = (id) => S.ordonnances.filter((o) => o.patient_id === id);

// =====================================================================
// Démarrage et chargement
// =====================================================================
function initApiReelle() {
  api = createApi(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  api.onAuthChange((evt, user) => {
    if (evt === 'PASSWORD_RECOVERY') { S.user = user; S.recuperation = true; render(); }
    if (evt === 'SIGNED_OUT' && S.user) { reinitialiser(); render(); }
  });
}

async function demarrer() {
  if (S.configure) {
    initApiReelle();
    try {
      const user = await api.session();
      if (user) { await connecte(user); return; }
    } catch (e) { toast(e.message, 'err'); }
  }
  render();
}

function reinitialiser() {
  Object.assign(S, { user: null, moi: null, patients: [], lignes: [], ordonnances: [], fiche: null, prep: {}, ocr: null, verrouille: false });
  S.membres = new Map(); S.photos = new Map();
}

async function connecte(user) {
  S.user = user;
  S.moi = await api.moi(user.id);
  if (S.moi) {
    if (!api.demo && verrouActif()) S.verrouille = true;
    await charger();
  }
  render();
}

async function charger() {
  try {
    const [membres, patients, lignes, ordonnances] = await Promise.all([
      api.membres(), api.patients(), api.lignes(), api.ordonnances()
    ]);
    S.membres = new Map(membres.map((m) => [m.user_id, m.nom]));
    Object.assign(S, { patients, lignes, ordonnances });
  } catch (e) { toast(e.message, 'err'); }
}

async function rafraichir() {
  S.fiche = null;
  await charger();
  render();
}

// =====================================================================
// Rendu
// =====================================================================
function route() {
  const h = location.hash.startsWith('#/') ? location.hash.slice(2) : 'accueil';
  return h.split('/');
}

function render(opts = {}) {
  if (!opts.garderSheet) fermerSheet();
  if (!S.user) return renderAuth();
  if (S.recuperation) return renderNouveauMdp();
  if (!S.moi) return renderRejoindre();
  if (S.verrouille) return renderVerrou();
  const [page, id, sous] = route();
  let v;
  if (page === 'patients') v = vuePatients();
  else if (page === 'patient' && sous === 'preparer') v = vuePreparation(id);
  else if (page === 'patient' && sous === 'plan') v = vuePlan(id);
  else if (page === 'patient') v = vueFiche(id);
  else if (page === 'reglages') v = vueReglages();
  else v = vueAccueil();
  app.innerHTML = shell(v);
  window.scrollTo(0, S.garderScroll ? window.scrollY : 0);
  S.garderScroll = false;
  chargerPhotos();
}

function shell({ titre, retour, corps, actions = '', nav = true, onglet = '', classe = '' }) {
  return `
  ${api.demo ? '<div class="bandeau-demo">Mode démo : patients fictifs, rien n\'est enregistré</div>' : ''}
  <header class="topbar">
    ${retour ? `<a class="retour" href="${retour}" aria-label="Retour">‹</a>` : '<span class="retour"></span>'}
    <h1>${esc(titre)}</h1>
    <div class="top-actions">${actions}</div>
  </header>
  <main class="${classe}">${corps}</main>
  ${nav ? `
  <nav class="tabbar">
    <a href="#/accueil" class="${onglet === 'accueil' ? 'actif' : ''}">${ICON.accueil}<span>Piluliers</span></a>
    <a href="#/patients" class="${onglet === 'patients' ? 'actif' : ''}">${ICON.patients}<span>Patients</span></a>
    <a href="#/reglages" class="${onglet === 'reglages' ? 'actif' : ''}">${ICON.reglages}<span>Réglages</span></a>
  </nav>` : ''}`;
}

const badge = (texte, type = '') => `<span class="badge ${type}">${esc(texte)}</span>`;
const statutBadge = (p) => (p.statut === 'actif' ? '' : badge(STATUTS[p.statut], p.statut === 'arrete' ? 'gris' : 'rouge'));

// ---------------------------------------------------------------------
// Calculs transverses
// ---------------------------------------------------------------------
function aValider() {
  return S.lignes.filter((l) => l.statut_validation === 'a_valider' && patientById(l.patient_id));
}

function ordonnancesARenouveler(horizon = 21) {
  const limite = addDays(today(), horizon);
  const res = [];
  for (const p of S.patients) {
    if (p.statut === 'arrete') continue;
    const parPrescripteur = new Map();
    for (const o of ordonnancesDe(p.id)) {
      if (o.archivee || !o.date_fin) continue;
      const cle = (o.prescripteur || '—').trim().toLowerCase();
      const prec = parPrescripteur.get(cle);
      if (!prec || o.date_prescription > prec.date_prescription) parPrescripteur.set(cle, o);
    }
    for (const o of parPrescripteur.values()) if (o.date_fin <= limite) res.push({ p, o });
  }
  return res.sort((a, b) => a.o.date_fin.localeCompare(b.o.date_fin));
}

function echeanceTexte(fin) {
  const j = ecart(today(), fin);
  if (j < 0) return { t: `échue depuis ${-j} j`, c: 'rouge' };
  if (j === 0) return { t: "expire aujourd'hui", c: 'rouge' };
  return { t: `expire dans ${j} j`, c: j <= 7 ? 'rouge' : 'orange' };
}

function changementsRecents(patientId, jours = 7) {
  const limite = Date.now() - jours * 86400e3;
  return lignesDe(patientId).filter((l) => l.modifie_le && new Date(l.modifie_le).getTime() >= limite);
}

// ---------------------------------------------------------------------
// Vue : semaine (accueil)
// ---------------------------------------------------------------------
function vueAccueil() {
  const moi = S.user.id;
  const av = aValider();
  const pourMoi = av.filter((l) => l.modifie_par !== moi);
  const parMoi = av.filter((l) => l.modifie_par === moi);
  const auj = isoDay(today());

  let html = `<p class="bonjour">Bonjour ${esc(S.moi.nom)} · ${esc(JOURS[auj].toLowerCase())} ${fmt(today())}</p>
    <button class="carte bouton-scan" data-action="scanner">
      <span class="icone-scan">${ICON.scan}</span>
      <span><b>Scanner une ordonnance</b><small>Photo ou fichier : la fiche du patient et son traitement se remplissent automatiquement</small></span>
    </button>`;

  // Double contrôle
  if (av.length) {
    const groupes = new Map();
    pourMoi.forEach((l) => groupes.set(l.patient_id, [...(groupes.get(l.patient_id) || []), l]));
    html += `<section class="carte alerte-orange">
      <h2>À valider <span class="compteur">${pourMoi.length}</span></h2>
      <p class="aide">Changements de traitement faits par une collègue, à contrôler avant le prochain pilulier.</p>
      ${pourMoi.length ? [...groupes.entries()].map(([pid, ls]) => `
        <a class="ligne-liste" href="#/patient/${pid}">
          <div><strong>${esc(nomPatient(patientById(pid)))}</strong>
          <div class="sous">${ls.map((l) => esc(nomLigne(l))).join(', ')}</div>
          <div class="sous">par ${esc(nomMembre(ls[0].modifie_par))} ${depuis(ls[0].modifie_le)}</div></div>
          <span class="chevron">›</span></a>`).join('') : '<p class="vide">Rien à valider pour toi.</p>'}
      ${parMoi.length ? `<p class="aide">${parMoi.length} changement${parMoi.length > 1 ? 's' : ''} de ta part en attente de validation par une collègue.</p>` : ''}
    </section>`;
  }

  // Piluliers par jour, à partir d'aujourd'hui
  const actifs = S.patients.filter((p) => p.statut === 'actif');
  const sansJour = actifs.filter((p) => !p.jour_preparation);
  const blocs = [];
  for (let k = 0; k < 7; k++) {
    const d = ((auj - 1 + k) % 7) + 1;
    const ps = actifs.filter((p) => p.jour_preparation === d);
    if (!ps.length) continue;
    const libelle = k === 0 ? `Aujourd'hui · ${JOURS[d].toLowerCase()}` : k === 1 ? `Demain · ${JOURS[d].toLowerCase()}` : JOURS[d];
    blocs.push(`<div class="jour ${k === 0 ? 'aujourdhui' : ''}"><h3>${libelle}</h3>${ps.map((p) => {
      const nbAV = lignesDe(p.id).filter((l) => l.statut_validation === 'a_valider').length;
      const recents = changementsRecents(p.id);
      const nbMed = lignesDe(p.id).filter((l) => l.actif && !l.hors_pilulier && totalJour(l) > 0).length;
      const dernier = recents.map((l) => l.modifie_le).sort().pop();
      return `<a class="ligne-liste" href="#/patient/${p.id}/preparer">
        <div><strong>${esc(nomPatient(p))}</strong>
        <div class="sous">${p.lieu_preparation === 'domicile' ? 'À domicile' : 'Au cabinet'} · ${nbMed} médicament${nbMed > 1 ? 's' : ''} dans le pilulier</div>
        ${nbAV || dernier ? `<div class="badges gauche">${nbAV ? badge(`${nbAV} à valider`, 'orange') : ''}${dernier ? badge(`changé le ${fmt(localDate(dernier)).slice(0, 5)}`, 'bleu') : ''}</div>` : ''}</div>
        <span class="chevron">›</span></a>`;
    }).join('')}</div>`);
  }
  html += `<section class="carte">
    <h2>Piluliers par jour <span class="compteur">${actifs.length - sansJour.length}</span></h2>
    ${blocs.join('') || '<p class="vide">Aucun patient avec un jour de pilulier. Renseigne-le dans la fiche patient.</p>'}
    ${sansJour.length ? `<p class="aide">${sansJour.length} patient${sansJour.length > 1 ? 's' : ''} actif${sansJour.length > 1 ? 's' : ''} sans jour de pilulier : ${sansJour.map((p) => `<a href="#/patient/${p.id}">${esc(nomPatient(p))}</a>`).join(', ')}</p>` : ''}
  </section>`;

  // Ordonnances à renouveler
  const ren = ordonnancesARenouveler();
  if (ren.length) {
    const parMedecin = new Map();
    ren.forEach((r) => { const k = r.o.prescripteur || 'Prescripteur non précisé'; parMedecin.set(k, [...(parMedecin.get(k) || []), r]); });
    html += `<section class="carte">
      <h2>Ordonnances à renouveler <span class="compteur">${ren.length}</span></h2>
      <p class="aide">Regroupées par médecin : un seul appel pour tous ses patients.</p>
      ${[...parMedecin.entries()].map(([med, rs]) => `
        <div class="groupe"><h3>${esc(med)}</h3>
        ${rs.map(({ p, o }) => { const e = echeanceTexte(o.date_fin); return `
          <a class="ligne-liste" href="#/patient/${p.id}"><div><strong>${esc(nomPatient(p))}</strong>
          <div class="sous">fin le ${fmt(o.date_fin)}</div></div>${badge(e.t, e.c)}<span class="chevron">›</span></a>`; }).join('')}
        </div>`).join('')}
    </section>`;
  }

  // En pause
  const pause = S.patients.filter((p) => p.statut === 'hospitalise' || p.statut === 'suspendu');
  if (pause.length) {
    html += `<section class="carte">
      <h2>En pause</h2>
      ${pause.map((p) => `<a class="ligne-liste" href="#/patient/${p.id}"><div><strong>${esc(nomPatient(p))}</strong>
        <div class="sous">${STATUTS[p.statut]}${p.statut_depuis ? ` depuis le ${fmt(p.statut_depuis)}` : ''}</div></div><span class="chevron">›</span></a>`).join('')}
    </section>`;
  }

  return { titre: 'Piluliers', corps: html, onglet: 'accueil', actions: '<button class="btn-icone" data-action="rafraichir" aria-label="Actualiser">↻</button>' };
}

// ---------------------------------------------------------------------
// Vue : liste des patients
// ---------------------------------------------------------------------
function listePatientsHtml() {
  const r = S.recherche.trim().toLowerCase();
  const ps = S.patients.filter((p) => {
    if (S.filtre === 'actifs' && p.statut !== 'actif') return false;
    if (S.filtre === 'pause' && !['hospitalise', 'suspendu'].includes(p.statut)) return false;
    if (S.filtre === 'arretes' && p.statut !== 'arrete') return false;
    return !r || `${p.nom} ${p.prenom}`.toLowerCase().includes(r);
  });
  const echeances = new Set(ordonnancesARenouveler(7).map((x) => x.p.id));
  if (!ps.length) return '<p class="vide">Aucun patient.</p>';
  return ps.map((p) => {
    const ls = lignesDe(p.id).filter((l) => l.actif);
    const nbAV = ls.filter((l) => l.statut_validation === 'a_valider').length;
    return `<a class="ligne-liste" href="#/patient/${p.id}">
      <div><strong>${esc(nomPatient(p))}</strong>
      <div class="sous">${p.date_naissance ? `${fmt(p.date_naissance)} · ${age(p.date_naissance)} · ` : ''}${ls.length} médicament${ls.length > 1 ? 's' : ''}${p.jour_preparation ? ` · ${JOURS[p.jour_preparation].toLowerCase()}` : ''}</div></div>
      <div class="badges">${statutBadge(p)}${nbAV ? badge(`${nbAV} à valider`, 'orange') : ''}${echeances.has(p.id) ? badge('Ordonnance', 'rouge') : ''}</div>
      <span class="chevron">›</span></a>`;
  }).join('');
}

function vuePatients() {
  const f = (k, t) => `<button class="filtre ${S.filtre === k ? 'actif' : ''}" data-action="filtre" data-f="${k}">${t}</button>`;
  return {
    titre: 'Patients', onglet: 'patients',
    actions: '<button class="btn-icone plus" data-action="nouveau-patient" aria-label="Nouveau patient">＋</button>',
    corps: `
      <input class="recherche" id="recherche" type="search" placeholder="Rechercher un patient" value="${esc(S.recherche)}" autocomplete="off">
      <div class="filtres">${f('actifs', 'Actifs')}${f('pause', 'En pause')}${f('arretes', 'Arrêtés')}${f('tous', 'Tous')}</div>
      <section class="carte liste" id="liste-patients">${listePatientsHtml()}</section>`
  };
}

// ---------------------------------------------------------------------
// Vue : fiche patient
// ---------------------------------------------------------------------
function ordreLigne(l) {
  if (!l.actif) return 9;
  if (l.hors_pilulier) return 6;
  if (!totalJour(l)) return 7;
  return MOMENTS.findIndex(([k]) => Number(l[k]) > 0);
}

function derniereModif(l) {
  return (S.fiche?.journal || []).find((j) => j.enreg_id === l.id && j.action === 'UPDATE' && differences(j.avant, j.apres)) || null;
}

function datesLigne(l) {
  const parts = [];
  const debut = l.date_debut || (l.created_at ? localDate(l.created_at) : null);
  if (debut) parts.push(`Depuis le ${fmt(debut)}`);
  const m = derniereModif(l);
  if (m) parts.push(`modifié le ${fmt(localDate(m.quand))} par ${nomMembre(m.auteur)} : ${differences(m.avant, m.apres)}`);
  else if (verbeLigne(l) === 'modifié') parts.push(`modifié le ${fmt(localDate(l.modifie_le))}`);
  if (l.date_fin) parts.push(`${l.actif ? "jusqu'au" : 'arrêté le'} ${fmt(l.date_fin)}`);
  return parts.join(' · ');
}

const infoOfficielle = (cis) => `Lié à la base officielle · <a href="${lienFicheOfficielle(cis)}" target="_blank" rel="noopener">fiche du médicament ↗</a>`;

function carteLigne(l) {
  const moi = S.user.id;
  const ord = l.ordonnance_id ? S.ordonnances.find((o) => o.id === l.ordonnance_id) : null;
  const aVal = l.statut_validation === 'a_valider';
  const poso = totalJour(l) ? `<div class="poso">${MOMENTS.map(([k, t]) => `<div class="${Number(l[k]) ? '' : 'zero'}"><span>${t}</span><b>${Number(l[k]) ? q(l[k]) : '–'}</b></div>`).join('')}</div>` : '';
  return `<article class="med ${aVal ? 'a-valider' : ''} ${l.actif ? '' : 'arrete'}">
    <div class="med-tete" data-action="editer-ligne" data-id="${l.id}">
      <div><strong>${esc(l.medicament)}</strong> ${l.dosage ? `<span class="dosage">${esc(l.dosage)}</span>` : ''}
      <div class="sous">${esc(l.forme || '')}${!quotidien(l) ? ` · <b>${esc(joursTexte(l))}</b>` : ''}${l.hors_pilulier ? ' · hors pilulier' : ''}</div></div>
      <span class="chevron">›</span>
    </div>
    ${poso}
    ${l.si_besoin ? `<p class="info">Si besoin : ${esc(l.si_besoin)}</p>` : ''}
    ${l.consignes ? `<p class="info">${esc(l.consignes)}</p>` : ''}
    <p class="dates">${esc(datesLigne(l))}</p>
    ${ord ? `<p class="sous">Ordonnance du ${fmt(ord.date_prescription)}${ord.prescripteur ? ` · ${esc(ord.prescripteur)}` : ''}</p>` : ''}
    <div class="med-liens">
      <button class="lien petit" data-action="historique-ligne" data-id="${l.id}">Historique</button>
      ${l.cis ? `<a class="lien petit" href="${lienFicheOfficielle(l.cis)}" target="_blank" rel="noopener">Fiche officielle ↗</a>
      <button class="lien petit" data-action="equivalents" data-cis="${esc(l.cis)}">Génériques</button>` : ''}
    </div>
    ${aVal ? `<div class="validation">
      <span>${verbeLigne(l).replace(/^./, (c) => c.toUpperCase())} par ${esc(nomMembre(l.modifie_par))} ${depuis(l.modifie_le)}</span>
      ${l.modifie_par !== moi ? `<button class="btn petit valider" data-action="valider-ligne" data-id="${l.id}">Valider</button>` : '<span class="sous">en attente d\'une collègue</span>'}
    </div>` : ''}
  </article>`;
}

function vueFiche(id) {
  const p = patientById(id);
  if (!p) return { titre: 'Patient', retour: '#/patients', corps: '<p class="vide">Patient introuvable.</p>', onglet: 'patients' };
  if (!S.fiche || S.fiche.id !== id) {
    S.fiche = { id, journal: null };
    api.journal(id)
      .then((journal) => { if (S.fiche?.id === id) { S.fiche.journal = journal; S.garderScroll = true; render({ garderSheet: true }); } })
      .catch((e) => toast(e.message, 'err'));
  }
  const ls = lignesDe(id).sort((a, b) => ordreLigne(a) - ordreLigne(b));
  const actives = ls.filter((l) => l.actif);
  const arretees = ls.filter((l) => !l.actif);
  const ords = ordonnancesDe(id);
  const nbAV = ls.filter((l) => l.statut_validation === 'a_valider').length;
  const nbAVautres = ls.filter((l) => l.statut_validation === 'a_valider' && l.modifie_par !== S.user.id).length;
  const ech = ordonnancesARenouveler(14).filter((x) => x.p.id === id);

  const info = (label, val, cls = '') => (val ? `<div class="info-ligne ${cls}"><span>${label}</span><b>${esc(val)}</b></div>` : '');

  const corps = `
    <section class="carte entete-patient">
      <div class="nom-patient"><h2>${esc(nomPatient(p))}</h2>${statutBadge(p)}</div>
      <p class="sous">${p.date_naissance ? `Né(e) le ${fmt(p.date_naissance)} · ${age(p.date_naissance)}` : 'Date de naissance non renseignée'}</p>
      ${info('Pilulier', p.jour_preparation ? `${JOURS[p.jour_preparation]} · ${p.lieu_preparation === 'domicile' ? 'à domicile' : 'au cabinet'}` : 'jour non défini')}
      ${p.statut !== 'actif' && p.statut_depuis ? info('Statut', `${STATUTS[p.statut]} depuis le ${fmt(p.statut_depuis)}`, 'rouge') : ''}
      ${info('Allergies', p.allergies, 'rouge')}
      ${info('Consignes', p.consignes, 'orange')}
      ${info('Médecin', p.medecin)}
      ${info('Pharmacie', p.pharmacie)}
      <div class="actions-patient">
        <a class="btn primaire" href="#/patient/${id}/preparer">${ICON.pilule} Contenu du pilulier</a>
        <div class="deux">
          <a class="btn" href="#/patient/${id}/plan">Plan de prise</a>
          <button class="btn" data-action="editer-patient" data-id="${id}">Modifier la fiche</button>
        </div>
      </div>
    </section>

    ${nbAV ? `<div class="bandeau orange"><div><span>${nbAV} changement${nbAV > 1 ? 's' : ''} à valider (double contrôle)</span>
      ${nbAVautres > 1 ? `<button class="btn petit valider" data-action="valider-tout" data-patient="${id}">Tout valider (${nbAVautres})</button>` : ''}</div></div>` : ''}
    ${ech.map(({ o }) => { const e = echeanceTexte(o.date_fin); return `<div class="bandeau ${e.c}">Ordonnance ${esc(o.prescripteur || '')} ${e.t}</div>`; }).join('')}

    <section class="carte">
      <div class="titre-section"><h2>Traitement en cours</h2>
        <div class="boutons-titre"><button class="btn petit" data-action="nouvelle-ordonnance" data-patient="${id}">Scanner</button>
        <button class="btn petit primaire" data-action="nouvelle-ligne" data-patient="${id}">＋ Ajouter</button></div></div>
      ${actives.length ? actives.map(carteLigne).join('') : '<p class="vide">Aucun médicament. Touche « Scanner » pour lire l\'ordonnance (photo ou fichier) : l\'appli propose les médicaments.</p>'}
    </section>

    <section class="carte">
      <div class="titre-section"><h2>Ordonnances</h2><button class="btn petit primaire" data-action="nouvelle-ordonnance" data-patient="${id}">＋ Photo ou fichier</button></div>
      ${ords.length ? ords.map((o) => { const e = o.date_fin && !o.archivee ? echeanceTexte(o.date_fin) : null; return `
        <div class="ordo ${o.archivee ? 'archivee' : ''}">
          ${o.photo_path ? (o.photo_path.endsWith('.pdf') ? `<button class="vignette pdf" data-action="voir-photo" data-path="${esc(o.photo_path)}">PDF</button>` : `<button class="vignette" data-action="voir-photo" data-path="${esc(o.photo_path)}"><img data-photo="${esc(o.photo_path)}" alt="Ordonnance"></button>`) : '<div class="vignette vide-photo">—</div>'}
          <div class="ordo-txt" data-action="editer-ordonnance" data-id="${o.id}">
            <strong>${fmt(o.date_prescription)}${o.prescripteur ? ` · ${esc(o.prescripteur)}` : ''}</strong>
            <div class="sous">${o.date_fin ? `Valable jusqu'au ${fmt(o.date_fin)}` : 'Validité non précisée'}${o.archivee ? ' · archivée' : ''}</div>
            ${o.remarque ? `<div class="sous">${esc(o.remarque)}</div>` : ''}
          </div>
          ${e && ecart(today(), o.date_fin) <= 21 ? badge(e.t, e.c) : ''}
        </div>`; }).join('') : '<p class="vide">Aucune ordonnance.</p>'}
    </section>

    ${arretees.length ? `<details class="carte"><summary><h2>Traitements arrêtés (${arretees.length})</h2></summary>${arretees.map(carteLigne).join('')}</details>` : ''}

    <details class="carte">
      <summary><h2>Historique du traitement</h2></summary>
      ${S.fiche.journal === null ? '<p class="vide">Chargement…</p>' : S.fiche.journal.length ? `<ul class="journal">${S.fiche.journal.map((j) => `<li><span class="sous">${fmt(localDate(j.quand))} ${new Date(j.quand).toTimeString().slice(0, 5)}</span> ${esc(decrireJournal(j))}</li>`).join('')}</ul>` : '<p class="vide">Rien pour l\'instant.</p>'}
    </details>`;
  return { titre: p.prenom ? `${p.nom.toUpperCase()}` : 'Patient', retour: '#/patients', corps, onglet: 'patients' };
}

// ---------------------------------------------------------------------
// Journal lisible
// ---------------------------------------------------------------------
const LIB = {
  medicament: 'médicament', dosage: 'dosage', forme: 'forme', matin: 'matin', midi: 'midi', soir: 'soir', coucher: 'nuit',
  si_besoin: 'si besoin', jours: 'jours', date_debut: 'début', date_fin: 'fin', consignes: 'consignes', hors_pilulier: 'hors pilulier',
  ordonnance_id: 'ordonnance liée', nom: 'nom', prenom: 'prénom', date_naissance: 'date de naissance', statut: 'statut',
  statut_depuis: 'statut depuis', jour_preparation: 'jour du pilulier', lieu_preparation: 'lieu', medecin: 'médecin',
  pharmacie: 'pharmacie', allergies: 'allergies', date_prescription: 'date', prescripteur: 'prescripteur', photo_path: 'photo',
  remarque: 'remarque', archivee: 'archivée'
};
function valeur(k, v) {
  if (v === null || v === undefined || v === '') return '∅';
  if (['matin', 'midi', 'soir', 'coucher'].includes(k)) return q(v);
  if (k === 'jours') return v.length === 7 ? 'tous' : v.slice().sort().map((j) => JABR[j]).join(' ');
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (k === 'statut') return STATUTS[v] || v;
  if (k === 'jour_preparation') return JOURS[v] || v;
  if (k === 'photo_path' || k === 'ordonnance_id') return 'modifiée';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fmt(v);
  return String(v);
}
function differences(a, b) {
  return Object.keys(LIB).filter((k) => k in (b || {}) && JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null))
    .map((k) => `${LIB[k]} ${valeur(k, a?.[k])} → ${valeur(k, b?.[k])}`).join(', ');
}
function decrireJournal(j) {
  const qui = nomMembre(j.auteur);
  const r = j.apres || j.avant || {};
  if (j.table_nom === 'lignes') {
    const n = nomLigne(r);
    if (j.action === 'INSERT') return `${qui} a ajouté ${n}`;
    if (j.action === 'DELETE') return `${qui} a supprimé ${n}`;
    if (j.avant?.statut_validation === 'a_valider' && j.apres?.statut_validation === 'valide') return `${qui} a validé ${n}`;
    if (j.avant?.actif && !j.apres?.actif) return `${qui} a arrêté ${n}`;
    return `${qui} a modifié ${n} : ${differences(j.avant, j.apres) || 'détails'}`;
  }
  if (j.table_nom === 'patients') {
    if (j.action === 'INSERT') return `${qui} a créé la fiche`;
    if (j.action === 'DELETE') return `${qui} a supprimé la fiche`;
    return `${qui} a modifié la fiche : ${differences(j.avant, j.apres) || 'détails'}`;
  }
  if (j.table_nom === 'ordonnances') {
    const n = `l'ordonnance du ${fmt(r.date_prescription)}${r.prescripteur ? ` (${r.prescripteur})` : ''}`;
    if (j.action === 'INSERT') return `${qui} a ajouté ${n}`;
    if (j.action === 'DELETE') return `${qui} a supprimé ${n}`;
    return `${qui} a modifié ${n} : ${differences(j.avant, j.apres) || 'détails'}`;
  }
  if (j.table_nom === 'preparations') return `${qui} a préparé le pilulier du ${fmt(r.semaine_du)}`;
  return `${qui} : ${j.action}`;
}

// ---------------------------------------------------------------------
// Vue : contenu du pilulier (aide à la préparation, sans suivi)
// ---------------------------------------------------------------------
function calculPilulier(p, debut, nb) {
  const dates = Array.from({ length: nb }, (_, i) => addDays(debut, i));
  const fin = dates[dates.length - 1];
  const toutes = lignesDe(p.id);
  const actives = toutes.filter((l) => l.actif);
  const dansPilulier = actives.filter((l) => !l.hors_pilulier && totalJour(l) > 0);
  const concernees = dansPilulier.filter((l) => dates.some((d) => actifLe(l, d)));
  const nonConcernees = dansPilulier.filter((l) => !concernees.includes(l));
  const cases = {};
  for (const [k] of MOMENTS) {
    cases[k] = dates.map((d) => {
      const ls = concernees.filter((l) => actifLe(l, d) && Number(l[k]) > 0).map((l) => ({ l, qte: Number(l[k]) }));
      return { n: ls.reduce((s, x) => s + pieces(x.qte), 0), demi: ls.some((x) => x.qte % 1 > 0), ls };
    });
  }
  const moments = MOMENTS.map(([k, t]) => ({
    k, t, rangs: concernees.filter((l) => Number(l[k]) > 0).map((l) => ({ l, qte: Number(l[k]), jours: dates.map((d) => actifLe(l, d)) }))
  })).filter((m) => m.rangs.length);
  const totaux = concernees.map((l) => ({ l, total: dates.reduce((s, d) => s + (actifLe(l, d) ? totalJour(l) : 0), 0) }));
  const evenements = [];
  actives.forEach((l) => {
    if (l.date_fin && l.date_fin >= debut && l.date_fin < fin) evenements.push(`${nomLigne(l)} : dernière prise le ${fmtCourt(l.date_fin)}`);
    if (l.date_debut && l.date_debut > debut && l.date_debut <= fin) evenements.push(`${nomLigne(l)} : première prise le ${fmtCourt(l.date_debut)}`);
  });
  const limite = Date.now() - 14 * 86400e3;
  const recents = toutes.filter((l) => l.modifie_le && new Date(l.modifie_le).getTime() >= limite)
    .sort((a, b) => b.modifie_le.localeCompare(a.modifie_le));
  return {
    dates, fin, cases, moments, totaux, evenements, recents, nonConcernees,
    siBesoin: actives.filter((l) => l.si_besoin),
    hors: actives.filter((l) => l.hors_pilulier && !l.si_besoin),
    aValider: toutes.filter((l) => l.statut_validation === 'a_valider')
  };
}

function valeurFrequente(vals) {
  const n = new Map();
  vals.forEach((v) => n.set(v, (n.get(v) || 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function grillePilulier(c) {
  const blocs = [];
  for (let s = 0; s < c.dates.length; s += 7) {
    const idx = c.dates.slice(s, s + 7).map((_, i) => s + i);
    blocs.push(`<table class="grille">
      <thead><tr><th></th>${idx.map((i) => `<th><span>${JC[isoDay(c.dates[i])]}</span>${parse(c.dates[i]).getDate()}</th>`).join('')}</tr></thead>
      <tbody>${MOMENTS.map(([k, t]) => {
        const freq = valeurFrequente(c.cases[k].map((x) => x.n));
        return `<tr><th>${t}</th>${idx.map((i) => {
          const x = c.cases[k][i];
          return `<td class="${x.n ? '' : 'vide'} ${x.n !== freq ? 'diff' : ''}">${x.n || '–'}${x.demi ? '<sup>½</sup>' : ''}</td>`;
        }).join('')}</tr>`;
      }).join('')}</tbody></table>`);
  }
  return blocs.join('');
}

function compositionCase(x) {
  const parUnite = new Map();
  x.ls.forEach(({ l, qte }) => { const u = UNITES[l.forme] || l.forme || 'unité'; parUnite.set(u, (parUnite.get(u) || 0) + pieces(qte)); });
  return [...parUnite.entries()].map(([u, n]) => `${n} ${u === 'sachet' && n > 1 ? 'sachets' : u}`).join(' + ');
}

function vuePreparation(id) {
  const p = patientById(id);
  if (!p) return vueFiche(id);
  if (!S.prep[id]) S.prep[id] = { debut: today(), nb: 7 };
  const st = S.prep[id];
  const c = calculPilulier(p, st.debut, st.nb);
  const moi = S.user.id;
  const ech = ordonnancesARenouveler(Math.max(0, ecart(today(), c.fin))).filter((x) => x.p.id === id);
  const recentsIds = new Set(c.recents.map((l) => l.id));

  const alertes = [];
  if (p.statut !== 'actif') alertes.push(`<div class="bandeau rouge">Patient ${STATUTS[p.statut].toLowerCase()}${p.statut_depuis ? ` depuis le ${fmt(p.statut_depuis)}` : ''} : vérifier avant de préparer.</div>`);
  c.aValider.forEach((l) => alertes.push(`<div class="bandeau orange"><div><span><b>${esc(nomLigne(l))}</b> ${verbeLigne(l)} par ${esc(nomMembre(l.modifie_par))} ${depuis(l.modifie_le)}, pas encore validé.</span>
    ${l.modifie_par !== moi ? `<button class="btn petit valider no-print" data-action="valider-ligne" data-id="${l.id}">Valider</button>` : ''}</div></div>`));
  c.recents.filter((l) => l.statut_validation !== 'a_valider').forEach((l) => alertes.push(`<div class="bandeau bleu">Changement du ${fmt(localDate(l.modifie_le))} : <b>${esc(nomLigne(l))}</b> ${verbeLigne(l)}${l.actif ? ` (${MOMENTS.map(([k]) => q(l[k])).join(' · ')})` : ''}</div>`));
  ech.forEach(({ o }) => { const e = echeanceTexte(o.date_fin); alertes.push(`<div class="bandeau ${e.c}">Ordonnance ${esc(o.prescripteur || '')} ${e.t} (fin le ${fmt(o.date_fin)}).</div>`); });
  if (p.allergies) alertes.push(`<div class="bandeau rouge">Allergies : ${esc(p.allergies)}</div>`);
  if (p.consignes) alertes.push(`<div class="bandeau bleu">${esc(p.consignes)}</div>`);
  c.evenements.forEach((e) => alertes.push(`<div class="bandeau bleu">${esc(e)}</div>`));

  const resumeMoment = (k) => {
    const cs = c.cases[k];
    const freq = valeurFrequente(cs.map((x) => x.n));
    const type = cs.find((x) => x.n === freq);
    const autres = cs.map((x, i) => ({ x, d: c.dates[i] })).filter(({ x }) => x.n !== freq);
    return `${freq} par case${type && type.n ? ` (${compositionCase(type)})` : ''}${autres.length ? ` · sauf ${autres.map(({ x, d }) => `${fmtCourt(d)} : ${x.n}`).join(', ')}` : ''}`;
  };

  const corps = `
    <section class="carte">
      <h2>${esc(nomPatient(p))}</h2>
      <div class="deux champs-prep no-print">
        <label>Premier jour<input type="date" id="prep-debut" value="${st.debut}"></label>
        <label>Durée<select id="prep-nb">${[7, 14, 28].map((n) => `<option value="${n}" ${n === st.nb ? 'selected' : ''}>${n} jours</option>`).join('')}</select></label>
      </div>
      <p class="sous">Du ${fmtCourt(st.debut)} au ${fmtCourt(c.fin)}${p.allergies ? '' : ''}</p>
    </section>
    ${alertes.join('')}

    <section class="carte">
      <div class="titre-section"><h2>Contenu des cases</h2><button class="btn petit no-print" data-action="imprimer">Imprimer</button></div>
      ${c.totaux.length ? grillePilulier(c) : '<p class="vide">Rien à mettre dans le pilulier sur cette période.</p>'}
      <p class="aide">Chaque chiffre = nombre de comprimés, gélules ou sachets à trouver dans la case. ½ = la case contient un demi-comprimé. Case colorée = différente des autres jours.</p>
    </section>

    ${c.moments.map((m) => `
      <section class="carte moment">
        <h2>${m.t}</h2>
        <p class="resume">${esc(resumeMoment(m.k))}</p>
        ${m.rangs.map((r) => `<div class="rang ${r.l.statut_validation === 'a_valider' ? 'a-valider' : ''}">
          <span class="qte">${q(r.qte)}</span>
          <div><b>${esc(nomLigne(r.l))}</b> <span class="sous">${esc(r.l.forme || '')}</span>
            ${r.jours.every(Boolean) ? '' : `<div class="sous">uniquement : ${r.jours.map((a, i) => (a ? fmtCourt(c.dates[i]) : '')).filter(Boolean).join(', ')}</div>`}
            ${r.l.consignes ? `<small>${esc(r.l.consignes)}</small>` : ''}
            <div class="badges gauche">${r.l.statut_validation === 'a_valider' ? badge('à valider', 'orange') : ''}${recentsIds.has(r.l.id) ? badge(`changé le ${fmt(localDate(r.l.modifie_le)).slice(0, 5)}`, 'bleu') : ''}</div>
          </div>
        </div>`).join('')}
      </section>`).join('')}

    ${c.totaux.length ? `<section class="carte">
      <h2>À sortir des boîtes (${st.nb} jours)</h2>
      <ul class="totaux">${c.totaux.map(({ l, total }) => `<li><span>${esc(nomLigne(l))}</span><b>${q(total)} ${esc(unite(l, total))}</b></li>`).join('')}</ul>
    </section>` : ''}

    ${c.siBesoin.length || c.hors.length || c.nonConcernees.length ? `<section class="carte">
      <h2>Hors pilulier</h2>
      ${c.siBesoin.map((l) => `<p class="info"><b>${esc(nomLigne(l))}</b> si besoin : ${esc(l.si_besoin)}</p>`).join('')}
      ${c.hors.map((l) => `<p class="info"><b>${esc(nomLigne(l))}</b> géré à part${totalJour(l) ? ` (${MOMENTS.filter(([k]) => Number(l[k])).map(([k, t]) => `${t.toLowerCase()} ${q(l[k])}`).join(', ')})` : ''}</p>`).join('')}
      ${c.nonConcernees.map((l) => `<p class="info sous"><b>${esc(nomLigne(l))}</b> : pas de prise sur cette période (${esc(joursTexte(l))})</p>`).join('')}
    </section>` : ''}`;
  return { titre: 'Pilulier', retour: `#/patient/${id}`, corps, nav: false, classe: 'page-pilulier' };
}

// ---------------------------------------------------------------------
// Vue : plan de prise imprimable
// ---------------------------------------------------------------------
function vuePlan(id) {
  const p = patientById(id);
  if (!p) return vueFiche(id);
  const ls = lignesDe(id).filter((l) => l.actif).sort((a, b) => ordreLigne(a) - ordreLigne(b));
  const corps = `
    <div class="plan-outils"><button class="btn primaire" data-action="imprimer">Imprimer ou enregistrer en PDF</button></div>
    <article class="plan">
      <header>
        <div><h2>Plan de prise</h2><p>${esc(CONFIG.CABINET)}</p></div>
        <div class="plan-patient"><b>${esc(nomPatient(p))}</b><br>${p.date_naissance ? `Né(e) le ${fmt(p.date_naissance)}` : ''}<br>Édité le ${fmt(today())}</div>
      </header>
      ${p.allergies ? `<p class="plan-alerte">Allergies : ${esc(p.allergies)}</p>` : ''}
      <table>
        <colgroup><col class="col-med">${MOMENTS.map(() => '<col class="col-moment">').join('')}<col class="col-rem"></colgroup>
        <thead><tr><th>Médicament</th>${MOMENTS.map(([, t]) => `<th><span class="long">${t}</span><span class="court">${{ Matin: 'Mat.', Midi: 'Midi', Soir: 'Soir', Nuit: 'Nuit' }[t]}</span></th>`).join('')}<th>Remarques</th></tr></thead>
        <tbody>${ls.map((l) => `<tr>
          <td><b>${esc(l.medicament)}</b> ${esc(l.dosage || '')}<br><small>${esc(l.forme || '')}</small></td>
          ${MOMENTS.map(([k]) => `<td class="c">${Number(l[k]) ? q(l[k]) : ''}</td>`).join('')}
          <td><small>${[!quotidien(l) ? joursTexte(l) : '', l.si_besoin ? `Si besoin : ${l.si_besoin}` : '', l.consignes || '', l.date_fin ? `Jusqu'au ${fmt(l.date_fin)}` : '', l.hors_pilulier ? 'Hors pilulier' : ''].filter(Boolean).map(esc).join('<br>')}</small></td>
        </tr>`).join('')}</tbody>
      </table>
      ${p.consignes ? `<p><b>Consignes :</b> ${esc(p.consignes)}</p>` : ''}
      <footer>Document établi par ${esc(S.moi.nom)} à partir des ordonnances en cours. En cas de doute, contacter le cabinet infirmier.</footer>
    </article>`;
  return { titre: 'Plan de prise', retour: `#/patient/${id}`, corps, nav: false, classe: 'page-plan' };
}

// ---------------------------------------------------------------------
// Vue : réglages
// ---------------------------------------------------------------------
function vueReglages() {
  const membres = [...S.membres.entries()];
  const corps = `
    <section class="carte">
      <h2>Mon compte</h2>
      <form data-form="mon-nom" class="en-ligne">
        <label>Nom affiché<input name="nom" value="${esc(S.moi.nom)}" required maxlength="60"></label>
        <button class="btn" type="submit">Enregistrer</button>
      </form>
      <p class="sous">${esc(S.user.email)}</p>
    </section>

    <section class="carte">
      <h2>Verrou Face ID</h2>
      <p class="aide">Demande Face ID à l'ouverture de l'appli et après 3 minutes en arrière-plan. Ce réglage est propre à cet appareil.</p>
      ${api.demo ? '<p class="sous">Indisponible en mode démo.</p>' : verrouActif()
        ? '<button class="btn" data-action="verrou-off">Désactiver le verrou</button>'
        : '<button class="btn primaire" data-action="verrou-on">Activer le verrou Face ID</button>'}
    </section>

    <section class="carte">
      <h2>Membres du cabinet (${membres.length})</h2>
      ${membres.map(([idm, nom]) => `<div class="ligne-liste statique"><div>${esc(nom)}${idm === S.user.id ? ' <span class="sous">(moi)</span>' : ''}</div></div>`).join('')}
      <form data-form="code" class="en-ligne">
        <label>Nouveau code du cabinet<input name="code" type="text" minlength="8" autocomplete="off" placeholder="8 caractères minimum" required></label>
        <button class="btn" type="submit">Changer</button>
      </form>
      <p class="aide">Le code sert uniquement à rejoindre le cabinet lors de la création d'un compte.</p>
    </section>

    <section class="carte">
      <h2>Données</h2>
      <button class="btn" data-action="exporter">Exporter toutes les données (fichier JSON)</button>
      <p class="aide">Copie de sauvegarde à ranger sur le NAS du cabinet.</p>
    </section>

    <section class="carte">
      <h2>Installer sur l'iPhone</h2>
      <p class="aide">Dans Safari : bouton Partager, puis « Sur l'écran d'accueil ». L'appli s'ouvre ensuite en plein écran comme une vraie appli.</p>
    </section>

    <button class="btn danger large" data-action="deconnexion">Se déconnecter</button>`;
  return { titre: 'Réglages', corps, onglet: 'reglages' };
}

// ---------------------------------------------------------------------
// Écrans de connexion
// ---------------------------------------------------------------------
function ecranAuth(contenu) {
  app.innerHTML = `<div class="auth">
    <div class="logo">${ICON.pilule}</div>
    <h1>Piluliers</h1>
    <p class="sous">${esc(CONFIG.CABINET)}</p>
    ${S.authMessage ? `<div class="bandeau bleu">${esc(S.authMessage)}</div>` : ''}
    ${contenu}
  </div>`;
}

function renderAuth() {
  const demo = `<div class="separateur"><span>ou</span></div>
    <button class="btn large" data-action="demo">Essayer avec des patients fictifs</button>`;
  if (!S.configure) {
    return ecranAuth(`<div class="bandeau orange">La base du cabinet n'est pas encore branchée. Seul le mode démo est disponible.</div>${demo}`);
  }
  if (S.authMode === 'inscription') {
    return ecranAuth(`<form data-form="inscription" class="carte">
      <h2>Créer mon compte</h2>
      <label>Prénom et nom<input name="nom" required maxlength="60" autocomplete="name"></label>
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <label>Mot de passe<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primaire large" type="submit">Créer mon compte</button>
      <button class="lien" type="button" data-action="auth-mode" data-mode="connexion">J'ai déjà un compte</button>
    </form>`);
  }
  if (S.authMode === 'oubli') {
    return ecranAuth(`<form data-form="oubli" class="carte">
      <h2>Mot de passe oublié</h2>
      <p class="aide">Si aucun e-mail n'arrive d'ici quelques minutes, demande à Arnaud de réinitialiser ton mot de passe.</p>
      <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
      <button class="btn primaire large" type="submit">Recevoir un lien</button>
      <button class="lien" type="button" data-action="auth-mode" data-mode="connexion">Retour</button>
    </form>`);
  }
  return ecranAuth(`<form data-form="connexion" class="carte">
    <label>E-mail<input name="email" type="email" required autocomplete="username"></label>
    <label>Mot de passe<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn primaire large" type="submit">Se connecter</button>
    <div class="liens">
      <button class="lien" type="button" data-action="auth-mode" data-mode="inscription">Créer mon compte</button>
      <button class="lien" type="button" data-action="auth-mode" data-mode="oubli">Mot de passe oublié</button>
    </div>
  </form>${demo}`);
}

function renderRejoindre() {
  ecranAuth(`<form data-form="rejoindre" class="carte">
    <h2>Rejoindre le cabinet</h2>
    <p class="aide">Dernière étape : saisis le code du cabinet que t'a donné un associé.</p>
    <label>Prénom et nom<input name="nom" required maxlength="60" value="${esc(localStorage.getItem('piluliers-nom') || '')}"></label>
    <label>Code du cabinet<input name="code" required autocomplete="off" autocapitalize="off"></label>
    <button class="btn primaire large" type="submit">Rejoindre</button>
    <button class="lien" type="button" data-action="deconnexion">Se déconnecter</button>
  </form>`);
}

function renderNouveauMdp() {
  ecranAuth(`<form data-form="nouveau-mdp" class="carte">
    <h2>Nouveau mot de passe</h2>
    <label>Mot de passe<input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
    <button class="btn primaire large" type="submit">Enregistrer</button>
  </form>`);
}

function renderVerrou() {
  ecranAuth(`<div class="carte centre">
    <h2>Appli verrouillée</h2>
    <button class="btn primaire large" data-action="deverrouiller">Déverrouiller avec Face ID</button>
    <button class="lien" data-action="deconnexion">Se déconnecter</button>
  </div>`);
}

// =====================================================================
// Formulaires en feuille (bas d'écran)
// =====================================================================
function ouvrirSheet(titre, html) {
  $('#sheet-root').innerHTML = `<div class="sheet-fond" data-action="fermer-sheet"></div>
    <div class="sheet" role="dialog" aria-label="${esc(titre)}">
      <div class="sheet-tete"><h2>${esc(titre)}</h2><button class="btn-icone" data-action="fermer-sheet" aria-label="Fermer">✕</button></div>
      <div class="sheet-corps">${html}</div>
    </div>`;
  document.body.classList.add('sheet-ouverte');
  setTimeout(() => $('.sheet input:not([type=file]):not([type=checkbox]), .sheet textarea')?.focus({ preventScroll: true }), 50);
}
function fermerSheet() {
  $('#sheet-root').innerHTML = '';
  document.body.classList.remove('sheet-ouverte');
}

const opt = (v, t, sel) => `<option value="${esc(v)}" ${String(sel ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`;

function formPatient(p = {}) {
  ouvrirSheet(p.id ? 'Modifier la fiche' : 'Nouveau patient', `
    <form data-form="patient" data-id="${p.id || ''}">
      <div class="deux">
        <label>Nom *<input name="nom" required value="${esc(p.nom)}" autocapitalize="characters"></label>
        <label>Prénom *<input name="prenom" required value="${esc(p.prenom)}"></label>
      </div>
      <label>Date de naissance<input name="date_naissance" type="date" value="${esc(p.date_naissance)}"></label>
      <div class="deux">
        <label>Jour du pilulier<select name="jour_preparation">${opt('', 'Non défini', p.jour_preparation)}${[1, 2, 3, 4, 5, 6, 7].map((d) => opt(d, JOURS[d], p.jour_preparation)).join('')}</select></label>
        <label>Préparé<select name="lieu_preparation">${opt('cabinet', 'Au cabinet', p.lieu_preparation)}${opt('domicile', 'À domicile', p.lieu_preparation)}</select></label>
      </div>
      <div class="deux">
        <label>Statut<select name="statut">${Object.entries(STATUTS).map(([k, t]) => opt(k, t, p.statut || 'actif')).join('')}</select></label>
        <label>Depuis le<input name="statut_depuis" type="date" value="${esc(p.statut_depuis)}"></label>
      </div>
      <label>Médecin traitant<input name="medecin" value="${esc(p.medecin)}" list="dl-medecins"></label>
      <label>Pharmacie<input name="pharmacie" value="${esc(p.pharmacie)}" list="dl-pharmacies"></label>
      <label>Allergies<input name="allergies" value="${esc(p.allergies)}"></label>
      <label>Consignes particulières<textarea name="consignes" rows="2" placeholder="ex. écraser les comprimés, troubles de déglutition">${esc(p.consignes)}</textarea></label>
      ${datalist('dl-medecins', S.patients.map((x) => x.medecin).concat(S.ordonnances.map((o) => o.prescripteur)))}
      ${datalist('dl-pharmacies', S.patients.map((x) => x.pharmacie))}
      <button class="btn primaire large" type="submit">Enregistrer</button>
      ${p.id ? `<button class="btn danger large" type="button" data-action="supprimer-patient" data-id="${p.id}">Supprimer le patient</button>` : ''}
    </form>`);
}

function datalist(id, valeurs) {
  const uniques = [...new Set(valeurs.filter(Boolean).map((v) => v.trim()))].sort((a, b) => a.localeCompare(b));
  return `<datalist id="${id}">${uniques.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}

function formLigne(patientId, l = null) {
  const x = l || { jours: [1, 2, 3, 4, 5, 6, 7], matin: 0, midi: 0, soir: 0, coucher: 0, forme: 'comprimé', date_debut: today() };
  const ords = ordonnancesDe(patientId).filter((o) => !o.archivee || o.id === x.ordonnance_id);
  const ordDefaut = l ? x.ordonnance_id : ords[0]?.id;
  S.suggestions = [];
  ouvrirSheet(l ? 'Modifier le médicament' : 'Ajouter un médicament', `
    <form data-form="ligne" data-id="${l?.id || ''}" data-patient="${patientId}">
      ${l ? '<div class="bandeau orange">Toute modification est datée et devra être validée par une collègue.</div>' : ''}
      <div class="champ-med">
        <label>Médicament *<input name="medicament" id="saisie-med" required value="${esc(x.medicament)}" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Nom commercial ou molécule"></label>
        <div class="suggestions" id="suggestions"></div>
      </div>
      <input type="hidden" name="cis" value="${esc(x.cis)}">
      <p class="sous" id="med-officiel">${x.cis ? infoOfficielle(x.cis) : 'Tape 3 lettres pour chercher dans la base officielle des médicaments.'}</p>
      <div class="deux">
        <label>Dosage<input name="dosage" value="${esc(x.dosage)}" placeholder="ex. 75 mg"></label>
        <label>Forme<select name="forme">${FORMES.map((f) => opt(f, f, x.forme)).join('')}</select></label>
      </div>
      <fieldset class="poso-saisie"><legend>Posologie (nombre par prise)</legend>
        ${MOMENTS.map(([k, t]) => `<label>${t}<select name="${k}">${DOSES.map((d) => opt(d, d ? q(d) : '0', Number(x[k]) || 0)).join('')}</select></label>`).join('')}
      </fieldset>
      <fieldset class="jours-saisie"><legend>Jours de prise</legend>
        <div class="jours-chips">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label class="chip"><input type="checkbox" name="jours" value="${d}" ${(x.jours || []).includes(d) ? 'checked' : ''}><span>${JABR[d]}</span></label>`).join('')}</div>
      </fieldset>
      <label>Si besoin<input name="si_besoin" value="${esc(x.si_besoin)}" placeholder="ex. si douleur, 3 par jour maximum"></label>
      <div class="deux">
        <label>Début<input name="date_debut" type="date" value="${esc(x.date_debut)}"></label>
        <label>Fin<input name="date_fin" type="date" value="${esc(x.date_fin)}"></label>
      </div>
      <label>Ordonnance<select name="ordonnance_id">${opt('', 'Aucune', ordDefaut)}${ords.map((o) => opt(o.id, `${fmt(o.date_prescription)}${o.prescripteur ? ' · ' + o.prescripteur : ''}`, ordDefaut)).join('')}</select></label>
      <label>Consignes<textarea name="consignes" rows="2" placeholder="ex. à jeun, écraser, ne pas couper">${esc(x.consignes)}</textarea></label>
      <label class="interrupteur"><input type="checkbox" name="hors_pilulier" ${x.hors_pilulier ? 'checked' : ''}><span>Hors pilulier (gouttes, injection, géré à part)</span></label>
      <button class="btn primaire large" type="submit">Enregistrer</button>
      ${l && l.actif ? `<button class="btn large" type="button" data-action="arreter-ligne" data-id="${l.id}">Arrêter ce traitement</button>` : ''}
      ${l && !l.actif ? `<button class="btn large" type="button" data-action="reprendre-ligne" data-id="${l.id}">Reprendre ce traitement</button>` : ''}
      ${l ? `<button class="btn danger large" type="button" data-action="supprimer-ligne" data-id="${l.id}">Supprimer (erreur de saisie)</button>` : ''}
    </form>`);
}

function formOrdonnance(patientId, o = null) {
  const p = patientById(patientId);
  const x = o || { date_prescription: today(), prescripteur: p?.medecin || '' };
  S.ocr = null;
  ouvrirSheet(o ? "Modifier l'ordonnance" : 'Nouvelle ordonnance', `
    <form data-form="ordonnance" data-id="${o?.id || ''}" data-patient="${patientId}">
      <label class="photo-pick"><input type="file" name="photo" accept="image/*,application/pdf"><span>${o?.photo_path ? 'Remplacer le document' : 'Photographier ou choisir un fichier (photo, PDF)'}</span></label>
      <div class="apercu" data-apercu></div>
      <button type="button" class="btn large lire" data-action="lire-ordonnance" id="btn-lire" hidden>Lire l'ordonnance et repérer les médicaments</button>
      <div id="ocr-zone"></div>
      <div class="deux">
        <label>Date *<input name="date_prescription" type="date" required value="${esc(x.date_prescription)}"></label>
        <label>Prescripteur<input name="prescripteur" value="${esc(x.prescripteur)}" list="dl-presc"></label>
      </div>
      ${datalist('dl-presc', S.ordonnances.map((y) => y.prescripteur).concat(S.patients.map((y) => y.medecin)))}
      <label>Valable jusqu'au<input name="date_fin" type="date" value="${esc(x.date_fin)}"></label>
      <div class="raccourcis">${[1, 3, 6, 12].map((m) => `<button type="button" class="filtre" data-action="validite" data-mois="${m}">${m} mois</button>`).join('')}</div>
      <label>Remarque<input name="remarque" value="${esc(x.remarque)}"></label>
      ${o ? `<label class="interrupteur"><input type="checkbox" name="archivee" ${o.archivee ? 'checked' : ''}><span>Archivée (remplacée par une nouvelle ordonnance)</span></label>` : ''}
      <button class="btn primaire large" type="submit" id="btn-ordo">Enregistrer</button>
      ${o ? `<button class="btn danger large" type="button" data-action="supprimer-ordonnance" data-id="${o.id}">Supprimer</button>` : ''}
    </form>`);
}

// ---------------------------------------------------------------------
// Lecture d'ordonnance : propositions comparées au traitement en cours
// ---------------------------------------------------------------------
const cleMed = (nom, dosage) => `${normaliser(nom).split(/[^a-z0-9]+/).filter(Boolean)[0] || ''}|${((normaliser(dosage || '').match(/\d+(?:[.,]\d+)?/) || [''])[0]).replace(',', '.')}`;
const posoTexte = (l) => MOMENTS.map(([k]) => q(l[k])).join('-');

async function analyserDocument(f) {
  const fichier = f.photo.files[0];
  if (!fichier) throw new Error("Choisis d'abord une photo ou un fichier");
  const zone = $('#ocr-zone');
  const progres = (m) => { zone.innerHTML = `<p class="progression"><span class="roue"></span>${esc(m)}</p>`; };
  progres('Démarrage…');
  let texte;
  try { texte = await lireDocument(fichier, progres); } catch (e) { zone.innerHTML = ''; throw e; }
  const a = analyserOrdonnance(texte);
  if (!a.lignes.length) {
    zone.innerHTML = '<div class="bandeau orange">Aucun texte lisible. Reprends la photo bien à plat, nette et éclairée, ou ajoute les médicaments à la main.</div>';
    return null;
  }
  progres('Recherche des médicaments dans la base officielle…');
  const trouves = await api.reconnaitre(a.lignes);
  const parLigne = new Map(trouves.map((t) => [t.ligne, t]));
  const props = [];
  const vus = new Set();
  a.lignes.forEach((ligne, i) => {
    const t = parLigne.get(i + 1);
    if (!t) return;
    const suite = [];
    for (let k = i + 1; k <= i + 2 && k < a.lignes.length && !parLigne.has(k + 1); k++) suite.push(a.lignes[k]);
    const source = [ligne, ...suite].join(' · ');
    const poso = analyserPosologie(source.replace(/\d+(?:[.,]\d+)?\s*(?:mg|g|µg|microgrammes?|ui|ml)\b/gi, ' '));
    const lu = normaliser(ligne);
    const motsNom = normaliser(t.nom).split(/[^a-z0-9]+/).filter(Boolean);
    const presents = motsNom.filter((w) => lu.includes(w));
    const brut = new Map(ligne.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean).map((w) => [normaliser(w), w]));
    const medicament = titre((presents.length ? presents : [motsNom[0] || t.nom]).map((w) => brut.get(w) || w).join(' '));
    const cle = `${medicament}|${t.dosage}`;
    if (vus.has(cle)) return;
    vus.add(cle);
    props.push({ on: true, medicament, dosage: t.dosage || '', forme: formeDepuisBdpm(t.forme), cis: t.cis, source, ...poso });
  });
  // Préremplissage de l'ordonnance
  if (a.date) f.date_prescription.value = a.date;
  if (a.prescripteur && (!f.prescripteur.value || f.prescripteur.value === (patientById(f.dataset.patient)?.medecin || ''))) f.prescripteur.value = a.prescripteur;
  if (a.duree && !f.date_fin.value) {
    const base = f.date_prescription.value || today();
    f.date_fin.value = addDays(addMonths(base, a.duree.mois), a.duree.jours - 1);
  }
  return { texte, props };
}

// Compare les propositions au traitement en cours du patient
function comparer(props, patientId) {
  const actives = patientId ? lignesDe(patientId).filter((l) => l.actif) : [];
  const pris = new Set();
  for (const x of props) {
    if (x.manuel) { x.statut = 'nouveau'; x.match = null; continue; }
    const m = actives.find((l) => !pris.has(l.id) && ((x.cis && l.cis === x.cis) || cleMed(l.medicament, l.dosage) === cleMed(x.medicament, x.dosage)));
    x.match = m ? m.id : null;
    if (!m) { x.statut = 'nouveau'; x.on = true; continue; }
    pris.add(m.id);
    x.avant = posoTexte(m);
    if (x.aPreciser && !totalJour(x)) {
      MOMENTS.forEach(([k]) => { x[k] = Number(m[k]); });
      x.si_besoin = x.si_besoin || m.si_besoin;
      x.statut = 'non-lu'; x.on = false;
    } else if (MOMENTS.every(([k]) => Number(m[k]) === Number(x[k])) && !!m.si_besoin === !!x.si_besoin) {
      x.statut = 'identique'; x.on = false;
    } else {
      x.statut = 'modifie'; x.on = true;
    }
  }
  return actives.filter((l) => !pris.has(l.id));
}

function etiquetteStatut(x) {
  if (x.statut === 'identique') return badge('déjà en cours, identique', 'gris');
  if (x.statut === 'modifie') return badge(`posologie changée : ${x.avant} → ${posoTexte(x)}`, 'orange');
  if (x.statut === 'non-lu') return badge(`posologie non lue : actuelle reprise (${x.avant})`, 'orange');
  return badge('nouveau', 'bleu');
}

function carteProposition(x, i) {
  return `<div class="proposition ${x.on ? '' : 'off'}" data-i="${i}">
    <label class="interrupteur"><input type="checkbox" name="p${i}_on" ${x.on ? 'checked' : ''}>
      <span><b>${esc(x.medicament || 'Médicament à compléter')}</b>${x.aPreciser && x.statut !== 'non-lu' ? ' · <span class="txt-orange">posologie à préciser</span>' : ''}</span></label>
    ${x.statut ? `<div class="badges gauche statut">${etiquetteStatut(x)}</div>` : ''}
    <div class="deux">
      <label>Médicament<input name="p${i}_medicament" value="${esc(x.medicament)}"></label>
      <label>Dosage<input name="p${i}_dosage" value="${esc(x.dosage)}"></label>
    </div>
    <div class="poso-saisie">${MOMENTS.map(([k, t]) => `<label>${t}<select name="p${i}_${k}">${DOSES.map((d) => opt(d, d ? q(d) : '0', Number(x[k]) || 0)).join('')}</select></label>`).join('')}</div>
    <div class="deux">
      <label>Forme<select name="p${i}_forme">${FORMES.map((f) => opt(f, f, x.forme)).join('')}</select></label>
      <label>Si besoin<input name="p${i}_si_besoin" value="${esc(x.si_besoin)}"></label>
    </div>
    <input type="hidden" name="p${i}_cis" value="${esc(x.cis)}">
    ${x.source ? `<p class="sous source">Lu sur l'ordonnance : « ${esc(x.source)} »</p>` : ''}
  </div>`;
}

function lirePropositions(f) {
  return (S.ocr?.props || []).map((x, i) => {
    const v = (n) => f.elements[`p${i}_${n}`]?.value?.trim() || '';
    return {
      ...x, on: f.elements[`p${i}_on`]?.checked ?? false, medicament: v('medicament'), dosage: v('dosage'), forme: v('forme'),
      matin: Number(v('matin')), midi: Number(v('midi')), soir: Number(v('soir')), coucher: Number(v('coucher')),
      si_besoin: v('si_besoin') || null, cis: v('cis') || null
    };
  });
}

function rendreOcr() {
  const o = S.ocr;
  const absents = o.absents || [];
  $('#ocr-zone').innerHTML = `<div class="ocr">
    <h3>Médicaments repérés (${o.props.length})</h3>
    <p class="aide">Compare chaque ligne avec l'ordonnance : la lecture automatique peut se tromper, surtout sur une ordonnance manuscrite. Seules les lignes cochées seront enregistrées.</p>
    ${o.props.map(carteProposition).join('') || '<p class="vide">Aucun médicament reconnu. Ajoute-les à la main ci-dessous.</p>'}
    <button type="button" class="btn large" data-action="ocr-ajouter">＋ Ajouter un médicament non reconnu</button>
    ${absents.length ? `<div class="absents">
      <h3>En cours mais absents de cette ordonnance (${absents.length})</h3>
      <p class="aide">Une ordonnance de spécialiste ne reprend souvent qu'une partie du traitement : coche uniquement les arrêts certains.</p>
      ${absents.map((l) => `<label class="interrupteur"><input type="checkbox" name="arret_${l.id}"><span>Arrêter <b>${esc(nomLigne(l))}</b> (${posoTexte(l)})</span></label>`).join('')}
    </div>` : ''}
    <details class="texte-lu"><summary>Texte lu sur l'ordonnance</summary><pre>${esc(o.texte)}</pre></details>
  </div>`;
  majBoutonOrdo();
}

function majBoutonOrdo() {
  const f = $('form[data-form=ordonnance], form[data-form=scan]');
  const b = $('#btn-ordo');
  if (!f || !b || !S.ocr) return;
  const n = lirePropositions(f).filter((x) => x.on).length;
  const arrets = $$('input[name^=arret_]:checked', f).length;
  const morceaux = [n ? `${n} médicament${n > 1 ? 's' : ''}` : '', arrets ? `${arrets} arrêt${arrets > 1 ? 's' : ''}` : ''].filter(Boolean);
  b.textContent = morceaux.length ? `Enregistrer l'ordonnance et ${morceaux.join(' + ')}` : "Enregistrer l'ordonnance";
  $$('.proposition', f).forEach((el) => el.classList.toggle('off', !f.elements[`p${el.dataset.i}_on`].checked));
}

async function lireOrdonnance(f) {
  const r = await analyserDocument(f);
  if (!r) return;
  S.ocr = { ...r, absents: comparer(r.props, f.dataset.patient) };
  rendreOcr();
}

// Enregistre les propositions cochées : mise à jour si déjà en cours, ajout sinon ; puis les arrêts cochés
async function appliquerPropositions(f, patientId, ordonnanceId) {
  const props = S.ocr ? lirePropositions(f).filter((x) => x.on) : [];
  const arrets = $$('input[name^=arret_]:checked', f).map((c) => c.name.slice(6));
  for (const x of props) {
    const poso = { matin: x.matin, midi: x.midi, soir: x.soir, coucher: x.coucher, si_besoin: x.si_besoin };
    const hors = !totalJour(x) && !!x.si_besoin;
    if (x.match) {
      const l = S.lignes.find((y) => y.id === x.match);
      await api.saveLigne({ id: x.match, ...poso, ordonnance_id: ordonnanceId, cis: l?.cis || x.cis, hors_pilulier: hors || !!l?.hors_pilulier });
    } else {
      await api.saveLigne({
        patient_id: patientId, ordonnance_id: ordonnanceId, medicament: x.medicament, dosage: x.dosage || null, forme: x.forme,
        ...poso, cis: x.cis, jours: [1, 2, 3, 4, 5, 6, 7], date_debut: today(), hors_pilulier: hors
      });
    }
  }
  for (const id of arrets) await api.saveLigne({ id, actif: false, date_fin: today() });
  return { n: props.length, arrets: arrets.length };
}

function verifierPropositions(f) {
  for (const x of S.ocr ? lirePropositions(f).filter((y) => y.on) : []) {
    if (!x.medicament) throw new Error("Un médicament coché n'a pas de nom");
    if (!totalJour(x) && !x.si_besoin) throw new Error(`Indique la posologie de ${x.medicament} (ou décoche-le)`);
  }
}

// ---------------------------------------------------------------------
// Scanner une ordonnance depuis l'accueil
// ---------------------------------------------------------------------
function formScan() {
  S.ocr = null;
  ouvrirSheet('Scanner une ordonnance', `
    <form data-form="scan">
      <label class="photo-pick"><input type="file" name="photo" accept="image/*,application/pdf"><span>Photographier ou choisir un fichier (photo, PDF)</span></label>
      <div class="apercu" data-apercu></div>
      <button type="button" class="btn large lire" data-action="lire-ordonnance" id="btn-lire" hidden>Lire l'ordonnance</button>
      <div id="zone-patient"></div>
      <div id="ocr-zone"></div>
      <div id="zone-ordo" hidden>
        <h3>Ordonnance</h3>
        <div class="deux">
          <label>Date *<input name="date_prescription" type="date" required value="${today()}"></label>
          <label>Prescripteur<input name="prescripteur" list="dl-presc"></label>
        </div>
        ${datalist('dl-presc', S.ordonnances.map((y) => y.prescripteur).concat(S.patients.map((y) => y.medecin)))}
        <label>Valable jusqu'au<input name="date_fin" type="date"></label>
        <div class="raccourcis">${[1, 3, 6, 12].map((m) => `<button type="button" class="filtre" data-action="validite" data-mois="${m}">${m} mois</button>`).join('')}</div>
        <button class="btn primaire large" type="submit" id="btn-ordo">Enregistrer</button>
      </div>
    </form>`);
}

function trouverPatients(texte, extrait) {
  const t = ` ${normaliser(texte).replace(/[^a-z0-9]+/g, ' ')} `;
  const n = (x) => normaliser(x).replace(/[^a-z0-9]+/g, ' ').trim();
  return S.patients.map((p) => {
    let score = 0;
    if (n(p.nom) && t.includes(` ${n(p.nom)} `)) score += 2;
    if (n(p.prenom) && t.includes(` ${n(p.prenom)} `)) score += 1;
    if (p.date_naissance && extrait.ddn === p.date_naissance) score += 3;
    return { p, score };
  }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);
}

function rendrePatientScan() {
  const sc = S.scan;
  const choix = sc.patientId;
  $('#zone-patient').innerHTML = `<div class="bloc-patient">
    <h3>Patient</h3>
    ${choix && choix !== 'nouveau' ? `<div class="bandeau vert">${sc.reconnu === choix ? 'Reconnu sur l\'ordonnance : ' : ''}<b>${esc(nomPatient(patientById(choix)))}</b></div>`
      : choix === 'nouveau' ? '<div class="bandeau bleu">Nouveau patient : la fiche sera créée avec ces informations.</div>'
      : '<div class="bandeau orange">Patient non reconnu : choisis-le dans la liste ou crée sa fiche.</div>'}
    <label>Patient<select name="patient" id="scan-patient">
      ${opt('', '— Choisir —', choix)}
      ${opt('nouveau', '＋ Nouveau patient', choix)}
      ${S.patients.filter((p) => p.statut !== 'arrete').map((p) => opt(p.id, `${nomPatient(p)}${p.date_naissance ? ` (${fmt(p.date_naissance)})` : ''}`, choix)).join('')}
    </select></label>
    ${choix === 'nouveau' ? `<div class="deux">
        <label>Nom *<input name="nv_nom" value="${esc(sc.extrait.nom)}" autocapitalize="characters"></label>
        <label>Prénom *<input name="nv_prenom" value="${esc(sc.extrait.prenom)}"></label>
      </div>
      <div class="deux">
        <label>Date de naissance<input name="nv_ddn" type="date" value="${esc(sc.extrait.ddn)}"></label>
        <label>Jour du pilulier<select name="nv_jour">${opt('', 'Non défini', '')}${[1, 2, 3, 4, 5, 6, 7].map((d) => opt(d, JOURS[d], '')).join('')}</select></label>
      </div>` : ''}
  </div>`;
}

async function lireScan(f) {
  const r = await analyserDocument(f);
  if (!r) return;
  const extrait = analyserPatient(r.texte);
  const candidats = trouverPatients(r.texte, extrait);
  const reconnu = candidats.length && (candidats.length === 1 || candidats[0].score > candidats[1].score) ? candidats[0].p.id : null;
  S.scan = { extrait, reconnu, patientId: reconnu || (extrait.nom ? 'nouveau' : '') };
  const pid = S.scan.patientId !== 'nouveau' ? S.scan.patientId : null;
  S.ocr = { ...r, absents: comparer(r.props, pid) };
  rendrePatientScan();
  rendreOcr();
  $('#zone-ordo').hidden = false;
}

// =====================================================================
// Photos
// =====================================================================
async function urlPhoto(path) {
  if (!S.photos.has(path)) S.photos.set(path, await api.photoUrl(path));
  return S.photos.get(path);
}
function chargerPhotos() {
  $$('img[data-photo]').forEach(async (img) => {
    try { img.src = await urlPhoto(img.dataset.photo); } catch { /* vignette absente */ }
  });
}
async function compresser(file) {
  if (file.type === 'application/pdf') return file;
  const bmp = await createImageBitmap(file);
  const r = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * r); cv.height = Math.round(bmp.height * r);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.8));
}

// =====================================================================
// Verrou Face ID (WebAuthn, propre à l'appareil)
// =====================================================================
const CLE_VERROU = 'piluliers-verrou';
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const verrouActif = () => !!localStorage.getItem(CLE_VERROU);

async function activerVerrou() {
  if (!window.PublicKeyCredential || !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
    throw new Error("Face ID n'est pas disponible dans ce navigateur");
  }
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Piluliers' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: S.user.email, displayName: S.moi.nom },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none'
  } });
  localStorage.setItem(CLE_VERROU, b64(cred.rawId));
}
async function deverrouiller() {
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: deb64(localStorage.getItem(CLE_VERROU)) }],
    userVerification: 'required', timeout: 60000
  } });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { S.masqueLe = Date.now(); return; }
  if (S.moi && !api?.demo && verrouActif() && S.masqueLe && Date.now() - S.masqueLe > 3 * 60e3) { S.verrouille = true; render(); }
});

// =====================================================================
// Actions (clics)
// =====================================================================
const ACTIONS = {
  'fermer-sheet': () => fermerSheet(),
  rafraichir: () => rafraichir().then(() => toast('À jour')),
  filtre: (d) => { S.filtre = d.f; render(); },
  'auth-mode': (d) => { S.authMode = d.mode; S.authMessage = ''; render(); },
  demo: async () => { api = createDemoApi(); await api.signIn(); await connecte(await api.session()); location.hash = '#/accueil'; },
  deconnexion: async () => {
    if (!confirm('Se déconnecter ?')) return;
    const etaitDemo = api.demo;
    await api.signOut(); reinitialiser();
    if (etaitDemo && S.configure) initApiReelle();
    location.hash = ''; render();
  },
  'nouveau-patient': () => formPatient(),
  'editer-patient': (d) => formPatient(patientById(d.id)),
  'supprimer-patient': async (d) => {
    const p = patientById(d.id);
    if (!confirm(`Supprimer définitivement ${nomPatient(p)}, ses traitements, ordonnances et piluliers ?`)) return;
    await api.deletePatient(d.id); toast('Patient supprimé'); location.hash = '#/patients'; await rafraichir();
  },
  'nouvelle-ligne': (d) => formLigne(d.patient),
  'editer-ligne': (d) => { const l = S.lignes.find((x) => x.id === d.id); formLigne(l.patient_id, l); },
  'valider-tout': async (d) => {
    const ls = lignesDe(d.patient).filter((l) => l.statut_validation === 'a_valider' && l.modifie_par !== S.user.id);
    if (!confirm(`Valider ${ls.length} changements ?\n\n${ls.map((l) => `• ${nomLigne(l)} (${verbeLigne(l)})`).join('\n')}`)) return;
    for (const l of ls) await api.validerLigne(l.id);
    toast(`${ls.length} changements validés`); S.garderScroll = true; await rafraichir();
  },
  'valider-ligne': async (d) => { await api.validerLigne(d.id); toast('Validé'); S.garderScroll = true; await rafraichir(); },
  'arreter-ligne': async (d) => {
    const l = S.lignes.find((x) => x.id === d.id);
    if (!confirm(`Arrêter ${nomLigne(l)} ?`)) return;
    await api.saveLigne({ id: l.id, actif: false, date_fin: l.date_fin && l.date_fin < today() ? l.date_fin : today() });
    toast('Traitement arrêté'); S.garderScroll = true; await rafraichir();
  },
  'reprendre-ligne': async (d) => {
    await api.saveLigne({ id: d.id, actif: true, date_fin: null });
    toast('Traitement repris'); S.garderScroll = true; await rafraichir();
  },
  'supprimer-ligne': async (d) => {
    const l = S.lignes.find((x) => x.id === d.id);
    if (!confirm(`Supprimer ${nomLigne(l)} ? Pour un arrêt de traitement, utilise plutôt « Arrêter ».`)) return;
    await api.deleteLigne(d.id); toast('Supprimé'); S.garderScroll = true; await rafraichir();
  },
  'nouvelle-ordonnance': (d) => formOrdonnance(d.patient),
  'editer-ordonnance': (d) => { const o = S.ordonnances.find((x) => x.id === d.id); formOrdonnance(o.patient_id, o); },
  'supprimer-ordonnance': async (d) => {
    const o = S.ordonnances.find((x) => x.id === d.id);
    if (!confirm('Supprimer cette ordonnance et sa photo ?')) return;
    await api.deleteOrdonnance(o); toast('Ordonnance supprimée'); S.garderScroll = true; await rafraichir();
  },
  validite: (d, el) => {
    const f = el.closest('form');
    const base = f.date_prescription.value || today();
    f.date_fin.value = addDays(addMonths(base, Number(d.mois)), -1);
  },
  'voir-photo': async (d) => {
    const url = await urlPhoto(d.path);
    if (d.path.endsWith('.pdf')) { window.open(url, '_blank', 'noopener'); return; }
    ouvrirSheet('Photo', `<img class="photo-pleine" src="${esc(url)}" alt="Document"><a class="btn large" href="${esc(url)}" target="_blank" rel="noopener">Ouvrir en grand</a>`);
  },
  'choisir-med': (d) => {
    const m = S.suggestions[Number(d.i)];
    const f = $('form[data-form=ligne]');
    if (!m || !f) return;
    f.medicament.value = titre(m.nom);
    f.dosage.value = m.dosage || '';
    f.forme.value = formeDepuisBdpm(m.forme);
    f.cis.value = m.cis;
    $('#suggestions').innerHTML = '';
    $('#med-officiel').innerHTML = `${infoOfficielle(m.cis)}${m.commercialise ? '' : ' · <b>non commercialisé</b>'}`;
  },
  equivalents: async (d) => {
    const ls = await api.equivalents(d.cis);
    ouvrirSheet('Génériques et princeps', ls.length
      ? `<p class="aide">Même molécule et même dosage : utile pour reconnaître la boîte délivrée par la pharmacie.</p>
        ${ls.map((m) => `<div class="ligne-liste statique"><div><strong>${esc(m.denomination)}</strong>
          <div class="sous">${m.type_generique === 0 ? 'Princeps (médicament de référence)' : 'Générique'}${m.titulaire ? ` · ${esc(m.titulaire)}` : ''}</div></div></div>`).join('')}`
      : '<p class="vide">Pas de groupe générique pour ce médicament.</p>');
  },
  'historique-ligne': async (d) => {
    const l = S.lignes.find((x) => x.id === d.id);
    const js = await api.journalLigne(d.id);
    ouvrirSheet(`Historique · ${nomLigne(l)}`, js.length
      ? `<ul class="journal">${js.map((j) => `<li><span class="sous">${fmt(localDate(j.quand))} ${new Date(j.quand).toTimeString().slice(0, 5)}</span> ${esc(decrireJournal(j))}</li>`).join('')}</ul>`
      : '<p class="vide">Aucun historique.</p>');
  },
  'lire-ordonnance': (d, el) => { const f = el.closest('form'); return f.dataset.form === 'scan' ? lireScan(f) : lireOrdonnance(f); },
  scanner: () => formScan(),
  'ocr-ajouter': (d, el) => {
    const f = el.closest('form');
    S.ocr.props = lirePropositions(f);
    S.ocr.props.push({ on: true, manuel: true, statut: 'nouveau', medicament: '', dosage: '', forme: 'comprimé', matin: 0, midi: 0, soir: 0, coucher: 0, si_besoin: null, cis: null });
    rendreOcr();
    $(`[name=p${S.ocr.props.length - 1}_medicament]`)?.focus();
  },
  imprimer: () => window.print(),
  'verrou-on': async () => { await activerVerrou(); toast('Verrou Face ID activé'); render(); },
  'verrou-off': () => { localStorage.removeItem(CLE_VERROU); toast('Verrou désactivé'); render(); },
  deverrouiller: async () => {
    try { await deverrouiller(); S.verrouille = false; render(); } catch { toast('Face ID non reconnu ou annulé', 'err'); }
  },
  exporter: async () => {
    const data = await api.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `piluliers-export-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'BUTTON') el.disabled = true;
  try { await fn(el.dataset, el, e); } catch (err) { toast(err.message || String(err), 'err'); }
  finally { if (el.isConnected && el.tagName === 'BUTTON') el.disabled = false; }
});

// =====================================================================
// Formulaires (validation)
// =====================================================================
const val = (f, n) => { const v = f.elements[n]?.value?.trim(); return v === '' || v === undefined ? null : v; };

const FORMS = {
  async connexion(f) {
    await api.signIn(val(f, 'email'), f.password.value);
    S.authMessage = '';
    await connecte(await api.session());
  },
  async inscription(f) {
    localStorage.setItem('piluliers-nom', val(f, 'nom'));
    const r = await api.signUp(val(f, 'email'), f.password.value);
    if (r.needsConfirmation) {
      S.authMode = 'connexion';
      S.authMessage = "Compte créé. Ouvre l'e-mail de confirmation reçu, clique sur le lien, puis reviens te connecter ici.";
      render();
    } else await connecte(await api.session());
  },
  async oubli(f) {
    await api.resetPassword(val(f, 'email'));
    S.authMode = 'connexion'; S.authMessage = 'Si un compte existe, un lien de réinitialisation vient de partir par e-mail.'; render();
  },
  async 'nouveau-mdp'(f) {
    await api.updatePassword(f.password.value);
    S.recuperation = false; toast('Mot de passe modifié');
    await connecte(await api.session());
  },
  async rejoindre(f) {
    await api.rejoindre(val(f, 'code'), val(f, 'nom'));
    await connecte(S.user);
  },
  async patient(f) {
    const p = {
      id: f.dataset.id || undefined, nom: val(f, 'nom'), prenom: val(f, 'prenom'), date_naissance: val(f, 'date_naissance'),
      jour_preparation: val(f, 'jour_preparation') ? Number(val(f, 'jour_preparation')) : null,
      lieu_preparation: val(f, 'lieu_preparation'), statut: val(f, 'statut'), statut_depuis: val(f, 'statut_depuis'),
      medecin: val(f, 'medecin'), pharmacie: val(f, 'pharmacie'), allergies: val(f, 'allergies'), consignes: val(f, 'consignes')
    };
    if (p.statut !== 'actif' && !p.statut_depuis) p.statut_depuis = today();
    if (p.statut === 'actif') p.statut_depuis = null;
    const r = await api.savePatient(p);
    toast('Fiche enregistrée');
    await rafraichir();
    if (!p.id) location.hash = `#/patient/${r.id}`;
  },
  async ligne(f) {
    const jours = $$('input[name=jours]:checked', f).map((c) => Number(c.value));
    if (!jours.length) throw new Error('Coche au moins un jour de prise');
    const l = {
      id: f.dataset.id || undefined, patient_id: f.dataset.patient,
      medicament: val(f, 'medicament'), dosage: val(f, 'dosage'), forme: val(f, 'forme'),
      matin: Number(val(f, 'matin')), midi: Number(val(f, 'midi')), soir: Number(val(f, 'soir')), coucher: Number(val(f, 'coucher')),
      jours, si_besoin: val(f, 'si_besoin'), date_debut: val(f, 'date_debut'), date_fin: val(f, 'date_fin'),
      ordonnance_id: val(f, 'ordonnance_id'), consignes: val(f, 'consignes'), hors_pilulier: f.hors_pilulier.checked,
      cis: val(f, 'cis')
    };
    if (!totalJour(l) && !l.si_besoin && !l.hors_pilulier) throw new Error('Indique une posologie, un « si besoin » ou coche « hors pilulier »');
    if (l.date_debut && l.date_fin && l.date_fin < l.date_debut) throw new Error('La date de fin est avant la date de début');
    if (!l.id) delete l.id;
    await api.saveLigne(l);
    toast(l.id ? 'Modifié : à faire valider par une collègue' : 'Ajouté : à faire valider par une collègue');
    S.garderScroll = true; await rafraichir();
  },
  async ordonnance(f) {
    const o = {
      id: f.dataset.id || undefined, patient_id: f.dataset.patient,
      date_prescription: val(f, 'date_prescription'), prescripteur: val(f, 'prescripteur'),
      date_fin: val(f, 'date_fin'), remarque: val(f, 'remarque')
    };
    if (f.archivee) o.archivee = f.archivee.checked;
    verifierPropositions(f);
    const fichier = f.photo.files[0];
    if (fichier) o.photo_path = await api.uploadPhoto(await compresser(fichier), `ordonnances/${o.patient_id}`);
    if (!o.id) delete o.id;
    const ordo = await api.saveOrdonnance(o);
    const r = await appliquerPropositions(f, o.patient_id, ordo.id);
    S.ocr = null;
    toast(r.n || r.arrets ? `Ordonnance enregistrée, ${r.n + r.arrets} changement${r.n + r.arrets > 1 ? 's' : ''} à faire valider par une collègue` : 'Ordonnance enregistrée');
    S.garderScroll = true; await rafraichir();
  },
  async scan(f) {
    if (!S.ocr) throw new Error("Lis d'abord l'ordonnance");
    verifierPropositions(f);
    let pid = S.scan?.patientId;
    if (!pid) throw new Error('Choisis le patient ou crée sa fiche');
    const cree = pid === 'nouveau';
    if (cree) {
      if (!val(f, 'nv_nom') || !val(f, 'nv_prenom')) throw new Error('Indique le nom et le prénom du nouveau patient');
      const p = await api.savePatient({
        nom: val(f, 'nv_nom').toUpperCase(), prenom: val(f, 'nv_prenom'), date_naissance: val(f, 'nv_ddn'),
        jour_preparation: val(f, 'nv_jour') ? Number(val(f, 'nv_jour')) : null,
        medecin: val(f, 'prescripteur'), statut: 'actif', lieu_preparation: 'cabinet'
      });
      pid = p.id;
    }
    const fichier = f.photo.files[0];
    const ordo = await api.saveOrdonnance({
      patient_id: pid, date_prescription: val(f, 'date_prescription'), prescripteur: val(f, 'prescripteur'), date_fin: val(f, 'date_fin'),
      photo_path: fichier ? await api.uploadPhoto(await compresser(fichier), `ordonnances/${pid}`) : null
    });
    const r = await appliquerPropositions(f, pid, ordo.id);
    S.ocr = null; S.scan = null;
    toast(`${cree ? 'Fiche patient créée · ' : ''}${r.n + r.arrets} changement${r.n + r.arrets > 1 ? 's' : ''} à faire valider par une collègue`);
    await rafraichir();
    location.hash = `#/patient/${pid}`;
  },
  async 'mon-nom'(f) {
    await api.majMonNom(S.user.id, val(f, 'nom'));
    S.moi.nom = val(f, 'nom'); toast('Nom enregistré'); await rafraichir();
  },
  async code(f) {
    await api.changerCode(val(f, 'code'));
    f.reset(); toast('Code du cabinet changé');
  }
};

document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const bouton = f.querySelector('[type=submit]');
  if (bouton) { bouton.disabled = true; bouton.dataset.txt = bouton.textContent; bouton.textContent = 'Un instant…'; }
  try { await FORMS[f.dataset.form](f); } catch (err) { toast(err.message || String(err), 'err'); }
  finally { if (bouton?.isConnected) { bouton.disabled = false; bouton.textContent = bouton.dataset.txt; } }
});

let minuteurMed;
document.addEventListener('input', (e) => {
  if (e.target.id === 'recherche') { S.recherche = e.target.value; $('#liste-patients').innerHTML = listePatientsHtml(); }
  if (e.target.id === 'saisie-med') {
    const f = e.target.form;
    if (f.cis.value) { f.cis.value = ''; $('#med-officiel').textContent = 'Saisie libre (non liée à la base officielle).'; }
    const texte = e.target.value;
    clearTimeout(minuteurMed);
    if (normaliser(texte).length < 3) { $('#suggestions').innerHTML = ''; return; }
    minuteurMed = setTimeout(async () => {
      try {
        const res = await api.chercherMedicaments(texte);
        if (e.target.value !== texte) return;
        S.suggestions = res;
        $('#suggestions').innerHTML = res.map((m, i) => `<button type="button" class="suggestion" data-action="choisir-med" data-i="${i}">
          <b>${esc(m.denomination)}</b>
          <span>${[m.commercialise ? '' : 'non commercialisé', m.type_generique === 0 ? 'princeps' : m.type_generique ? 'générique' : ''].filter(Boolean).join(' · ')}</span>
        </button>`).join('') || '<p class="sous">Aucun résultat dans la base officielle : saisie libre possible.</p>';
      } catch (err) { toast(err.message, 'err'); }
    }, 250);
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'prep-debut' || t.id === 'prep-nb') {
    const st = S.prep[route()[1]];
    if (t.id === 'prep-debut' && t.value) st.debut = t.value;
    if (t.id === 'prep-nb') st.nb = Number(t.value);
    S.garderScroll = true; render();
  }
  if (t.type === 'file' && t.files[0]) {
    const f = t.closest('form');
    const zone = f.querySelector('[data-apercu]');
    if (zone) zone.innerHTML = t.files[0].type === 'application/pdf' ? `<p class="sous">${esc(t.files[0].name)}</p>` : `<img src="${URL.createObjectURL(t.files[0])}" alt="Aperçu">`;
    const bouton = f.querySelector('#btn-lire');
    if (bouton) bouton.hidden = false;
  }
  if (/^p\d+_on$/.test(t.name || '') || /^arret_/.test(t.name || '')) majBoutonOrdo();
  if (t.id === 'scan-patient' && S.scan) {
    const f = t.form;
    S.ocr.props = lirePropositions(f);
    S.scan.patientId = t.value;
    S.ocr.absents = comparer(S.ocr.props, t.value && t.value !== 'nouveau' ? t.value : null);
    rendrePatientScan();
    rendreOcr();
  }
});

window.addEventListener('hashchange', () => { if (S.moi) render(); });

// =====================================================================
// Messages
// =====================================================================
let minuteurToast;
function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = `visible ${type}`;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { t.className = ''; }, type === 'err' ? 5000 : 2500);
}

demarrer();
