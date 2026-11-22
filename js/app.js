import { CONFIG } from './config.js';
import { createApi } from './api.js';
import { createDemoApi } from './demo.js';

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
const MOMENTS = [['matin', 'Matin'], ['midi', 'Midi'], ['soir', 'Soir'], ['coucher', 'Coucher']];
const STATUTS = { actif: 'Actif', hospitalise: 'Hospitalisé', suspendu: 'Suspendu', arrete: 'Arrêté' };
const FORMES = ['comprimé', 'gélule', 'sachet', 'ampoule', 'capsule', 'gouttes', 'sirop', 'patch', 'injection', 'inhalateur', 'collyre', 'autre'];
const UNITES = { comprimé: 'cp', gélule: 'gél.', sachet: 'sachet(s)', ampoule: 'amp.', capsule: 'caps.' };
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
const unite = (l) => UNITES[l.forme] || '';
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
  pilule: '<svg viewBox="0 0 24 24"><rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m9.2 8 5.6 8"/></svg>'
};

// =====================================================================
// État
// =====================================================================
let api = null;
const S = {
  configure: !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY),
  user: null, moi: null, membres: new Map(),
  patients: [], lignes: [], ordonnances: [], preps: [],
  fiche: null, prep: {}, photos: new Map(),
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
  Object.assign(S, { user: null, moi: null, patients: [], lignes: [], ordonnances: [], preps: [], fiche: null, prep: {}, verrouille: false });
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
  const depuisLundi = new Date(parse(addDays(lundi(today()), -7))).toISOString();
  try {
    const [membres, patients, lignes, ordonnances, preps] = await Promise.all([
      api.membres(), api.patients(), api.lignes(), api.ordonnances(), api.preparations(depuisLundi)
    ]);
    S.membres = new Map(membres.map((m) => [m.user_id, m.nom]));
    Object.assign(S, { patients, lignes, ordonnances, preps });
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
    <a href="#/accueil" class="${onglet === 'accueil' ? 'actif' : ''}">${ICON.accueil}<span>Semaine</span></a>
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

function prepCetteSemaine(patientId) {
  const debut = lundi(today());
  return S.preps.filter((x) => x.patient_id === patientId && localDate(x.prepare_le) >= debut)
    .sort((a, b) => b.prepare_le.localeCompare(a.prepare_le))[0];
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

  let html = `<p class="bonjour">Bonjour ${esc(S.moi.nom)} · ${esc(JOURS[auj].toLowerCase())} ${fmt(today())}</p>`;

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

  // Piluliers de la semaine
  const actifs = S.patients.filter((p) => p.statut === 'actif');
  const sansJour = actifs.filter((p) => !p.jour_preparation);
  let faits = 0, total = 0;
  const jours = [];
  for (let d = 1; d <= 7; d++) {
    const ps = actifs.filter((p) => p.jour_preparation === d);
    if (!ps.length) continue;
    total += ps.length;
    const rangs = ps.map((p) => {
      const prep = prepCetteSemaine(p.id);
      if (prep) faits++;
      const etat = prep ? 'fait' : d < auj ? 'retard' : d === auj ? 'auj' : 'avenir';
      const nbAV = lignesDe(p.id).filter((l) => l.statut_validation === 'a_valider').length;
      return `<a class="ligne-liste etat-${etat}" href="#/patient/${p.id}${prep ? '' : '/preparer'}">
        <span class="puce"></span>
        <div><strong>${esc(nomPatient(p))}</strong>
          <div class="sous">${p.lieu_preparation === 'domicile' ? 'À domicile' : 'Au cabinet'}${prep ? ` · fait par ${esc(nomMembre(prep.prepare_par))} ${fmtCourt(localDate(prep.prepare_le))}` : etat === 'retard' ? ' · en retard' : ''}</div></div>
        ${nbAV ? badge(`${nbAV} à valider`, 'orange') : ''}
        <span class="chevron">›</span></a>`;
    }).join('');
    jours.push(`<div class="jour ${d === auj ? 'aujourdhui' : ''}"><h3>${JOURS[d]}${d === auj ? " · aujourd'hui" : ''}</h3>${rangs}</div>`);
  }
  html += `<section class="carte">
    <h2>Piluliers de la semaine <span class="compteur ${faits === total && total ? 'vert' : ''}">${faits}/${total}</span></h2>
    ${jours.join('') || '<p class="vide">Aucun patient avec un jour de pilulier. Renseigne-le dans la fiche patient.</p>'}
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

  return { titre: 'Cette semaine', corps: html, onglet: 'accueil', actions: '<button class="btn-icone" data-action="rafraichir" aria-label="Actualiser">↻</button>' };
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
    ${l.date_debut || l.date_fin ? `<p class="sous">${l.date_debut ? `Depuis le ${fmt(l.date_debut)}` : ''}${l.date_debut && l.date_fin ? ' · ' : ''}${l.date_fin ? `jusqu'au ${fmt(l.date_fin)}` : ''}</p>` : ''}
    ${ord ? `<p class="sous">Ordonnance du ${fmt(ord.date_prescription)}${ord.prescripteur ? ` · ${esc(ord.prescripteur)}` : ''}</p>` : ''}
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
    S.fiche = { id, preps: null, journal: null };
    Promise.all([api.preparationsPatient(id), api.journal(id)])
      .then(([preps, journal]) => { if (S.fiche?.id === id) { S.fiche.preps = preps; S.fiche.journal = journal; S.garderScroll = true; render({ garderSheet: true }); } })
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
        <a class="btn primaire" href="#/patient/${id}/preparer">${ICON.pilule} Préparer le pilulier</a>
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
      <div class="titre-section"><h2>Traitement en cours</h2><button class="btn petit primaire" data-action="nouvelle-ligne" data-patient="${id}">＋ Ajouter</button></div>
      ${actives.length ? actives.map(carteLigne).join('') : '<p class="vide">Aucun médicament. Ajoute d\'abord l\'ordonnance, puis les médicaments.</p>'}
    </section>

    <section class="carte">
      <div class="titre-section"><h2>Ordonnances</h2><button class="btn petit primaire" data-action="nouvelle-ordonnance" data-patient="${id}">＋ Ajouter</button></div>
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

    <section class="carte">
      <h2>Derniers piluliers</h2>
      ${S.fiche.preps === null ? '<p class="vide">Chargement…</p>' : S.fiche.preps.length ? S.fiche.preps.map((x) => `
        <div class="ligne-liste statique"><div><strong>${fmtCourt(localDate(x.prepare_le))}</strong> · ${esc(nomMembre(x.prepare_par))}
          <div class="sous">Pilulier du ${fmt(x.semaine_du)} (${x.nb_jours} j)${x.remarque ? ` · ${esc(x.remarque)}` : ''}</div></div>
          ${x.photo_path ? `<button class="vignette petite" data-action="voir-photo" data-path="${esc(x.photo_path)}"><img data-photo="${esc(x.photo_path)}" alt="Pilulier"></button>` : ''}</div>`).join('') : '<p class="vide">Aucun pilulier enregistré.</p>'}
    </section>

    ${arretees.length ? `<details class="carte"><summary><h2>Traitements arrêtés (${arretees.length})</h2></summary>${arretees.map(carteLigne).join('')}</details>` : ''}

    <details class="carte">
      <summary><h2>Historique des modifications</h2></summary>
      ${S.fiche.journal === null ? '<p class="vide">Chargement…</p>' : S.fiche.journal.length ? `<ul class="journal">${S.fiche.journal.map((j) => `<li><span class="sous">${fmt(localDate(j.quand))} ${new Date(j.quand).toTimeString().slice(0, 5)}</span> ${esc(decrireJournal(j))}</li>`).join('')}</ul>` : '<p class="vide">Rien pour l\'instant.</p>'}
    </details>`;
  return { titre: p.prenom ? `${p.nom.toUpperCase()}` : 'Patient', retour: '#/patients', corps, onglet: 'patients' };
}

// ---------------------------------------------------------------------
// Journal lisible
// ---------------------------------------------------------------------
const LIB = {
  medicament: 'médicament', dosage: 'dosage', forme: 'forme', matin: 'matin', midi: 'midi', soir: 'soir', coucher: 'coucher',
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
// Vue : préparation du pilulier
// ---------------------------------------------------------------------
function calculPrep(p, debut, nb) {
  const dates = Array.from({ length: nb }, (_, i) => addDays(debut, i));
  const fin = dates[dates.length - 1];
  const actives = lignesDe(p.id).filter((l) => l.actif);
  const dansPilulier = actives.filter((l) => !l.hors_pilulier && totalJour(l) > 0);
  const concernees = dansPilulier.filter((l) => dates.some((d) => actifLe(l, d)));
  const nonConcernees = dansPilulier.filter((l) => !concernees.includes(l));
  const moments = MOMENTS.map(([k, t]) => ({
    k, t,
    rangs: concernees.filter((l) => Number(l[k]) > 0).map((l) => ({ l, qte: Number(l[k]), jours: dates.map((d) => actifLe(l, d)) }))
  })).filter((m) => m.rangs.length);
  const totaux = concernees.map((l) => ({
    l, total: dates.reduce((s, d) => s + (actifLe(l, d) ? totalJour(l) : 0), 0)
  }));
  const evenements = [];
  actives.forEach((l) => {
    if (l.date_fin && l.date_fin >= debut && l.date_fin < fin) evenements.push(`${nomLigne(l)} : arrêt prévu après le ${fmtCourt(l.date_fin)}`);
    if (l.date_debut && l.date_debut > debut && l.date_debut <= fin) evenements.push(`${nomLigne(l)} : début le ${fmtCourt(l.date_debut)}`);
  });
  return {
    dates, fin, moments, totaux, evenements, nonConcernees,
    siBesoin: actives.filter((l) => l.si_besoin),
    hors: actives.filter((l) => l.hors_pilulier),
    aValider: actives.concat(lignesDe(p.id).filter((l) => !l.actif)).filter((l) => l.statut_validation === 'a_valider')
  };
}

function vuePreparation(id) {
  const p = patientById(id);
  if (!p) return vueFiche(id);
  if (!S.prep[id]) S.prep[id] = { debut: today(), nb: 7, coches: new Set() };
  const st = S.prep[id];
  const c = calculPrep(p, st.debut, st.nb);
  const moi = S.user.id;
  const cles = c.moments.flatMap((m) => m.rangs.map((r) => `${r.l.id}:${m.k}`));
  const nbCoches = cles.filter((k) => st.coches.has(k)).length;
  const ech = ordonnancesARenouveler(Math.max(0, ecart(today(), c.fin))).filter((x) => x.p.id === id);

  const alertes = [];
  if (p.statut !== 'actif') alertes.push(`<div class="bandeau rouge">Patient ${STATUTS[p.statut].toLowerCase()}${p.statut_depuis ? ` depuis le ${fmt(p.statut_depuis)}` : ''} : vérifier avant de préparer.</div>`);
  c.aValider.forEach((l) => alertes.push(`<div class="bandeau orange"><div><b>${esc(nomLigne(l))}</b> ${verbeLigne(l)} par ${esc(nomMembre(l.modifie_par))} ${depuis(l.modifie_le)}, pas encore validé.
    ${l.modifie_par !== moi ? `<button class="btn petit valider" data-action="valider-ligne" data-id="${l.id}">Valider</button>` : ''}</div></div>`));
  ech.forEach(({ o }) => { const e = echeanceTexte(o.date_fin); alertes.push(`<div class="bandeau ${e.c}">Ordonnance ${esc(o.prescripteur || '')} ${e.t} (fin le ${fmt(o.date_fin)}).</div>`); });
  if (p.allergies) alertes.push(`<div class="bandeau rouge">Allergies : ${esc(p.allergies)}</div>`);
  if (p.consignes) alertes.push(`<div class="bandeau bleu">${esc(p.consignes)}</div>`);
  c.evenements.forEach((e) => alertes.push(`<div class="bandeau bleu">${esc(e)}</div>`));

  const points = (jours) => (st.nb === 7
    ? `<span class="points">${jours.map((a, i) => `<i class="${a ? 'on' : ''}" title="${JOURS[isoDay(c.dates[i])]}">${JC[isoDay(c.dates[i])]}</i>`).join('')}</span>`
    : `<span class="sous">${jours.filter(Boolean).length}/${st.nb} j</span>`);

  const corps = `
    <section class="carte">
      <h2>${esc(nomPatient(p))}</h2>
      <div class="deux champs-prep">
        <label>Début du pilulier<input type="date" id="prep-debut" value="${st.debut}"></label>
        <label>Durée<select id="prep-nb">${[7, 14, 28].map((n) => `<option value="${n}" ${n === st.nb ? 'selected' : ''}>${n} jours</option>`).join('')}</select></label>
      </div>
      <p class="sous">Du ${fmtCourt(st.debut)} au ${fmtCourt(c.fin)}</p>
    </section>
    ${alertes.join('')}

    <section class="carte">
      <h2>À sortir des boîtes</h2>
      ${c.totaux.length ? `<ul class="totaux">${c.totaux.map(({ l, total }) => `<li><span>${esc(nomLigne(l))}</span><b>${q(total)} ${esc(unite(l))}</b></li>`).join('')}</ul>` : '<p class="vide">Rien à mettre dans le pilulier sur cette période.</p>'}
    </section>

    ${c.moments.map((m) => `
      <section class="carte moment">
        <h2>${m.t}</h2>
        ${m.rangs.map((r) => { const cle = `${r.l.id}:${m.k}`; return `
          <button class="coche ${st.coches.has(cle) ? 'fait' : ''} ${r.l.statut_validation === 'a_valider' ? 'a-valider' : ''}" data-action="cocher" data-patient="${id}" data-cle="${cle}">
            <span class="case"></span>
            <span class="coche-txt"><b>${esc(nomLigne(r.l))}</b>${r.l.consignes ? `<small>${esc(r.l.consignes)}</small>` : ''}</span>
            <span class="qte">${q(r.qte)}</span>
            ${points(r.jours)}
          </button>`; }).join('')}
      </section>`).join('')}

    ${c.siBesoin.length || c.hors.length || c.nonConcernees.length ? `<section class="carte">
      <h2>Hors pilulier</h2>
      ${c.siBesoin.map((l) => `<p class="info"><b>${esc(nomLigne(l))}</b> si besoin : ${esc(l.si_besoin)}</p>`).join('')}
      ${c.hors.filter((l) => !l.si_besoin).map((l) => `<p class="info"><b>${esc(nomLigne(l))}</b> géré à part${totalJour(l) ? ` (${MOMENTS.filter(([k]) => Number(l[k])).map(([k, t]) => `${t.toLowerCase()} ${q(l[k])}`).join(', ')})` : ''}</p>`).join('')}
      ${c.nonConcernees.map((l) => `<p class="info sous"><b>${esc(nomLigne(l))}</b> : pas de prise sur cette période (${esc(joursTexte(l))})</p>`).join('')}
    </section>` : ''}

    <form class="carte" data-form="preparation" data-patient="${id}">
      <h2>Terminer</h2>
      <p class="sous" data-compteur>${nbCoches}/${cles.length} cases cochées</p>
      <label>Remarque (facultatif)<textarea name="remarque" rows="2" placeholder="ex. manque Kardegic, prévenir la pharmacie"></textarea></label>
      <label class="photo-pick"><input type="file" name="photo" accept="image/*"><span>Photo du pilulier (facultatif)</span></label>
      <div class="apercu" data-apercu></div>
      <button class="btn primaire large" type="submit">Pilulier terminé</button>
    </form>`;
  return { titre: 'Préparation', retour: `#/patient/${id}`, corps, nav: false };
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
        <thead><tr><th>Médicament</th>${MOMENTS.map(([, t]) => `<th><span class="long">${t}</span><span class="court">${{ Matin: 'Mat.', Midi: 'Midi', Soir: 'Soir', Coucher: 'Couch.' }[t]}</span></th>`).join('')}<th>Remarques</th></tr></thead>
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
  const x = l || { jours: [1, 2, 3, 4, 5, 6, 7], matin: 0, midi: 0, soir: 0, coucher: 0, forme: 'comprimé' };
  const ords = ordonnancesDe(patientId).filter((o) => !o.archivee || o.id === x.ordonnance_id);
  const ordDefaut = l ? x.ordonnance_id : ords[0]?.id;
  ouvrirSheet(l ? 'Modifier le médicament' : 'Ajouter un médicament', `
    <form data-form="ligne" data-id="${l?.id || ''}" data-patient="${patientId}">
      ${l ? '<div class="bandeau orange">Toute modification devra être validée par une collègue.</div>' : ''}
      <label>Médicament *<input name="medicament" required value="${esc(x.medicament)}" list="dl-meds" autocomplete="off"></label>
      ${datalist('dl-meds', S.lignes.map((y) => y.medicament))}
      <div class="deux">
        <label>Dosage<input name="dosage" value="${esc(x.dosage)}" placeholder="ex. 75 mg"></label>
        <label>Forme<select name="forme">${FORMES.map((f) => opt(f, f, x.forme)).join('')}</select></label>
      </div>
      <fieldset class="poso-saisie"><legend>Posologie</legend>
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
  ouvrirSheet(o ? "Modifier l'ordonnance" : 'Nouvelle ordonnance', `
    <form data-form="ordonnance" data-id="${o?.id || ''}" data-patient="${patientId}">
      <label class="photo-pick"><input type="file" name="photo" accept="image/*,application/pdf"><span>${o?.photo_path ? 'Remplacer la photo' : "Photographier l'ordonnance"}</span></label>
      <div class="apercu" data-apercu></div>
      <div class="deux">
        <label>Date *<input name="date_prescription" type="date" required value="${esc(x.date_prescription)}"></label>
        <label>Prescripteur<input name="prescripteur" value="${esc(x.prescripteur)}" list="dl-presc"></label>
      </div>
      ${datalist('dl-presc', S.ordonnances.map((y) => y.prescripteur).concat(S.patients.map((y) => y.medecin)))}
      <label>Valable jusqu'au<input name="date_fin" type="date" value="${esc(x.date_fin)}"></label>
      <div class="raccourcis">${[1, 3, 6, 12].map((m) => `<button type="button" class="filtre" data-action="validite" data-mois="${m}">${m} mois</button>`).join('')}</div>
      <label>Remarque<input name="remarque" value="${esc(x.remarque)}"></label>
      ${o ? `<label class="interrupteur"><input type="checkbox" name="archivee" ${o.archivee ? 'checked' : ''}><span>Archivée (remplacée par une nouvelle ordonnance)</span></label>` : ''}
      <button class="btn primaire large" type="submit">Enregistrer</button>
      ${o ? `<button class="btn danger large" type="button" data-action="supprimer-ordonnance" data-id="${o.id}">Supprimer</button>` : ''}
    </form>`);
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
  cocher: (d, el) => {
    const st = S.prep[d.patient];
    st.coches.has(d.cle) ? st.coches.delete(d.cle) : st.coches.add(d.cle);
    el.classList.toggle('fait', st.coches.has(d.cle));
    const total = $$('[data-action=cocher]').length;
    const faits = $$('[data-action=cocher].fait').length;
    const cpt = $('[data-compteur]');
    if (cpt) cpt.textContent = `${faits}/${total} cases cochées`;
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
      ordonnance_id: val(f, 'ordonnance_id'), consignes: val(f, 'consignes'), hors_pilulier: f.hors_pilulier.checked
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
    const fichier = f.photo.files[0];
    if (fichier) o.photo_path = await api.uploadPhoto(await compresser(fichier), `ordonnances/${o.patient_id}`);
    if (!o.id) delete o.id;
    await api.saveOrdonnance(o);
    toast('Ordonnance enregistrée');
    S.garderScroll = true; await rafraichir();
  },
  async preparation(f) {
    const id = f.dataset.patient;
    const p = patientById(id);
    const st = S.prep[id];
    const c = calculPrep(p, st.debut, st.nb);
    const total = c.moments.reduce((s, m) => s + m.rangs.length, 0);
    const coches = c.moments.flatMap((m) => m.rangs.map((r) => `${r.l.id}:${m.k}`)).filter((k) => st.coches.has(k)).length;
    if (coches < total && !confirm(`${total - coches} case(s) non cochée(s). Enregistrer quand même ?`)) return;
    let photo_path = null;
    const fichier = f.photo.files[0];
    if (fichier) photo_path = await api.uploadPhoto(await compresser(fichier), `piluliers/${id}`);
    await api.savePreparation({
      patient_id: id, semaine_du: st.debut, nb_jours: st.nb, photo_path, remarque: val(f, 'remarque'),
      contenu: c.totaux.map(({ l, total: t }) => ({
        ligne_id: l.id, medicament: l.medicament, dosage: l.dosage, matin: l.matin, midi: l.midi, soir: l.soir, coucher: l.coucher,
        jours: l.jours, total: t, valide: l.statut_validation === 'valide'
      }))
    });
    delete S.prep[id];
    toast('Pilulier enregistré');
    location.hash = '#/accueil';
    await rafraichir();
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

document.addEventListener('input', (e) => {
  if (e.target.id === 'recherche') { S.recherche = e.target.value; $('#liste-patients').innerHTML = listePatientsHtml(); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'prep-debut' || t.id === 'prep-nb') {
    const id = route()[1];
    const st = S.prep[id];
    if (t.id === 'prep-debut' && t.value) st.debut = t.value;
    if (t.id === 'prep-nb') st.nb = Number(t.value);
    st.coches.clear(); S.garderScroll = true; render();
  }
  if (t.type === 'file' && t.files[0]) {
    const zone = t.closest('form').querySelector('[data-apercu]');
    if (zone) zone.innerHTML = t.files[0].type === 'application/pdf' ? `<p class="sous">${esc(t.files[0].name)}</p>` : `<img src="${URL.createObjectURL(t.files[0])}" alt="Aperçu">`;
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
