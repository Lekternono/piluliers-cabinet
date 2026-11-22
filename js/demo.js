// Mode démo : données fictives en mémoire, rien n'est envoyé ni enregistré
import { normaliser } from './ocr.js';

const MOI = 'demo-moi';
const JULIE = 'demo-julie';
const MARC = 'demo-marc';

function uid() { return crypto.randomUUID(); }
function jour(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ilYa(heures) { return new Date(Date.now() - heures * 3600e3).toISOString(); }
const clone = (o) => JSON.parse(JSON.stringify(o));

export function createDemoApi() {
  const db = seed();
  let user = null;
  const listeners = [];

  function log(table, action, avant, apres) {
    const rec = apres || avant;
    db.journal.unshift({
      id: db.journal.length + 1, quand: new Date().toISOString(), auteur: MOI, table_nom: table, action,
      patient_id: table === 'patients' ? rec.id : rec.patient_id, enreg_id: rec.id,
      avant: avant ? clone(avant) : null, apres: apres ? clone(apres) : null
    });
  }
  const CHAMPS_LIGNE = ['medicament', 'dosage', 'forme', 'matin', 'midi', 'soir', 'coucher', 'si_besoin', 'jours',
    'date_debut', 'date_fin', 'consignes', 'hors_pilulier', 'actif', 'ordonnance_id'];

  return {
    demo: true,
    async session() { return user; },
    onAuthChange(cb) { listeners.push(cb); },
    async signIn() { user = { id: MOI, email: 'demo@exemple.fr' }; listeners.forEach((cb) => cb('SIGNED_IN', user)); },
    async signUp() { return { needsConfirmation: false }; },
    async resetPassword() {},
    async updatePassword() {},
    async signOut() { user = null; listeners.forEach((cb) => cb('SIGNED_OUT', null)); },

    async moi() { return db.membres.find((m) => m.user_id === MOI); },
    async rejoindre() {},
    async membres() { return clone(db.membres); },
    async majMonNom(_id, nom) { db.membres.find((m) => m.user_id === MOI).nom = nom; },
    async changerCode() {},

    async patients() { return clone(db.patients).sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom)); },
    async savePatient(p) {
      if (p.id) {
        const i = db.patients.findIndex((x) => x.id === p.id);
        const avant = db.patients[i];
        db.patients[i] = { ...avant, ...p, updated_at: new Date().toISOString(), updated_by: MOI };
        log('patients', 'UPDATE', avant, db.patients[i]);
        return clone(db.patients[i]);
      }
      const n = { ...p, id: uid(), created_at: new Date().toISOString() };
      db.patients.push(n); log('patients', 'INSERT', null, n);
      return clone(n);
    },
    async deletePatient(id) {
      const p = db.patients.find((x) => x.id === id);
      db.patients = db.patients.filter((x) => x.id !== id);
      db.lignes = db.lignes.filter((x) => x.patient_id !== id);
      db.ordonnances = db.ordonnances.filter((x) => x.patient_id !== id);
      log('patients', 'DELETE', p, null);
    },

    async pharmacies() { return clone(db.pharmacies); },
    async savePharmacie(ph) {
      if (ph.id) { const i = db.pharmacies.findIndex((x) => x.id === ph.id); db.pharmacies[i] = { ...db.pharmacies[i], ...ph }; return clone(db.pharmacies[i]); }
      const n = { actif: true, ...ph, id: uid() }; db.pharmacies.push(n); return clone(n);
    },
    async marquerEnvoi(ordonnanceId, pharmacieId) {
      const o = db.ordonnances.find((x) => x.id === ordonnanceId);
      const avant = clone(o);
      Object.assign(o, { envoyee_le: new Date().toISOString(), envoyee_a: pharmacieId || null });
      log('ordonnances', 'UPDATE', avant, o);
    },

    async lignes() { return clone(db.lignes); },
    async saveLigne(l) {
      const now = new Date().toISOString();
      if (l.id) {
        const i = db.lignes.findIndex((x) => x.id === l.id);
        const avant = db.lignes[i];
        const apres = { ...avant, ...l };
        const change = CHAMPS_LIGNE.some((c) => JSON.stringify(apres[c] ?? null) !== JSON.stringify(avant[c] ?? null));
        if (change) Object.assign(apres, { modifie_par: MOI, modifie_le: now, statut_validation: 'a_valider', valide_par: null, valide_le: null });
        db.lignes[i] = apres; log('lignes', 'UPDATE', avant, apres);
        return clone(apres);
      }
      const n = { matin: 0, midi: 0, soir: 0, coucher: 0, jours: [1, 2, 3, 4, 5, 6, 7], actif: true, hors_pilulier: false,
        ...l, id: uid(), created_at: now, modifie_par: MOI, modifie_le: now, statut_validation: 'a_valider' };
      db.lignes.push(n); log('lignes', 'INSERT', null, n);
      return clone(n);
    },
    async validerLigne(id) {
      const l = db.lignes.find((x) => x.id === id);
      if (l.modifie_par === MOI) throw new Error('Le double contrôle doit être fait par une autre infirmière');
      const avant = clone(l);
      Object.assign(l, { statut_validation: 'valide', valide_par: MOI, valide_le: new Date().toISOString() });
      log('lignes', 'UPDATE', avant, l);
    },
    async deleteLigne(id) {
      const l = db.lignes.find((x) => x.id === id);
      db.lignes = db.lignes.filter((x) => x.id !== id); log('lignes', 'DELETE', l, null);
    },

    async ordonnances() { return clone(db.ordonnances).sort((a, b) => b.date_prescription.localeCompare(a.date_prescription)); },
    async saveOrdonnance(o) {
      if (o.id) {
        const i = db.ordonnances.findIndex((x) => x.id === o.id);
        const avant = db.ordonnances[i];
        db.ordonnances[i] = { ...avant, ...o }; log('ordonnances', 'UPDATE', avant, db.ordonnances[i]);
        return clone(db.ordonnances[i]);
      }
      const n = { archivee: false, ...o, id: uid(), created_at: new Date().toISOString(), created_by: MOI };
      db.ordonnances.push(n); log('ordonnances', 'INSERT', null, n);
      return clone(n);
    },
    async deleteOrdonnance(o) {
      db.ordonnances = db.ordonnances.filter((x) => x.id !== o.id);
      db.lignes.forEach((l) => { if (l.ordonnance_id === o.id) l.ordonnance_id = null; });
      log('ordonnances', 'DELETE', o, null);
    },

    async journal(patientId) { return clone(db.journal.filter((j) => j.patient_id === patientId).slice(0, 80)); },
    async journalLigne(id) { return clone(db.journal.filter((j) => j.enreg_id === id)); },

    async chercherMedicaments(texte) {
      const mots = normaliser(texte).split(' ').filter(Boolean);
      if (normaliser(texte).length < 3) return [];
      return REF.filter((m) => mots.every((w) => m.recherche.includes(w))).slice(0, 12);
    },
    async equivalents(cis) {
      const g = REF.find((m) => m.cis === cis)?.groupe_id;
      return g ? REF.filter((m) => m.groupe_id === g) : [];
    },
    async reconnaitre(lignes) {
      const res = [];
      lignes.map(normaliser).forEach((l, i) => {
        const mots = l.split(/[^a-z0-9]+/);
        const c = REF.filter((m) => mots.includes(m.cle1)).sort((a, b) =>
          (l.includes(` ${b.dosage_num}`) - l.includes(` ${a.dosage_num}`)))[0];
        if (c) res.push({ ligne: i + 1, cis: c.cis, denomination: c.denomination, nom: c.nom, dosage: c.dosage, forme: c.forme, score: 4 });
      });
      return res;
    },

    async uploadPhoto(blob) {
      const path = 'demo/' + uid();
      db.photos[path] = URL.createObjectURL(blob);
      return path;
    },
    async photoUrl(path) { return db.photos[path] || ''; },
    async exportAll() { return { exporte_le: new Date().toISOString(), demo: true, ...clone(db) }; }
  };
}

function seed() {
  const membres = [
    { user_id: MOI, nom: 'Vous', created_at: ilYa(500) },
    { user_id: JULIE, nom: 'Julie (démo)', created_at: ilYa(500) },
    { user_id: MARC, nom: 'Marc (démo)', created_at: ilYa(500) }
  ];
  const isoDay = (d) => { const x = new Date(d).getDay(); return x === 0 ? 7 : x; };
  const pharmacies = [
    ['Pharmacie République', 'Place de la République, rue Émile Zola, 62210 Avion', '03 21 43 09 87', 'demo-republique@exemple.invalid'],
    ['Pharmacie Boulert', '109 boulevard Gabriel Péri, 62210 Avion', '03 21 67 72 81', null],
    ['Pharmacie du Centre', '81-83 boulevard Gabriel Péri, 62210 Avion', '03 21 67 04 88', 'demo-centre@exemple.invalid'],
    ['Pharmacie du 4', '51 rue Émile Basly, 62210 Avion', '03 21 28 80 57', null],
    ['Pharmacie du Parc', '34 place Jacques Duclos, 62210 Avion', '03 21 67 68 71', null],
    ['Pharmacie de la Coulotte', '38 avenue Achille Thumerelle, 62210 Avion', '03 21 28 66 22', null],
    ["Pharmacie d'Éleu (Kozak)", '2 rue Gabriel Péri, 62300 Éleu-dit-Leauwette', '03 21 28 23 30', null]
  ].map(([nom, adresse, telephone, email]) => ({ id: uid(), nom, adresse, telephone, email, actif: true }));
  const ph = (nom) => pharmacies.find((x) => x.nom === nom).id;
  const aujourdhui = isoDay(new Date());
  const j = (k) => ((aujourdhui - 1 + k + 7) % 7) + 1;

  const P = (nom, prenom, ddn, extra) => ({
    id: uid(), nom, prenom, date_naissance: ddn, statut: 'actif', statut_depuis: null, jour_preparation: null,
    lieu_preparation: 'cabinet', medecin: null, pharmacie: null, allergies: null, consignes: null,
    created_at: ilYa(800), updated_at: ilYa(48), updated_by: JULIE, ...extra
  });
  const p1 = P('DEMO-DUPONT', 'Jeanne', '1938-04-12', { jour_preparation: j(0), medecin: 'Dr Lambert', pharmacie_id: ph('Pharmacie du Centre'), allergies: 'Pénicilline', consignes: 'Troubles de déglutition : écraser les comprimés sécables' });
  const p2 = P('DEMO-MARTIN', 'Robert', '1941-11-03', { jour_preparation: j(0), lieu_preparation: 'domicile', medecin: 'Dr Lambert', pharmacie_id: ph('Pharmacie République') });
  const p3 = P('DEMO-LEROY', 'Simone', '1935-07-22', { jour_preparation: j(-1), medecin: 'Dr Kaci', pharmacie_id: ph('Pharmacie du Centre') });
  const p4 = P('DEMO-PETIT', 'André', '1946-02-15', { jour_preparation: j(2), medecin: 'Dr Kaci', statut: 'hospitalise', statut_depuis: jour(-3) });
  const p5 = P('DEMO-MOREAU', 'Lucienne', '1932-09-30', { jour_preparation: j(4), lieu_preparation: 'domicile', medecin: 'Dr Lambert', pharmacie_id: ph('Pharmacie du Parc') });
  const patients = [p1, p2, p3, p4, p5];

  const O = (p, datePresc, prescripteur, fin, extra) => ({
    id: uid(), patient_id: p.id, date_prescription: datePresc, prescripteur, date_fin: fin, photo_path: null,
    remarque: null, archivee: false, created_at: ilYa(300), created_by: JULIE, ...extra
  });
  const o1 = O(p1, jour(-80), 'Dr Lambert', jour(10));
  const o2 = O(p2, jour(-40), 'Dr Lambert', jour(50));
  const o3 = O(p3, jour(-95), 'Dr Kaci', jour(-3));
  const o4 = O(p4, jour(-20), 'Dr Kaci', jour(70));
  const o5 = O(p5, jour(-10), 'Dr Lambert', jour(80));
  const ordonnances = [o1, o2, o3, o4, o5];

  const L = (p, o, medicament, dosage, forme, poso, extra) => ({
    id: uid(), patient_id: p.id, ordonnance_id: o.id, medicament, dosage, forme,
    matin: poso[0], midi: poso[1], soir: poso[2], coucher: poso[3], si_besoin: null,
    jours: [1, 2, 3, 4, 5, 6, 7], date_debut: null, date_fin: null, consignes: null, hors_pilulier: false, actif: true,
    statut_validation: 'valide', modifie_par: JULIE, modifie_le: ilYa(400), valide_par: MARC, valide_le: ilYa(390),
    created_at: ilYa(400), ...extra
  });
  const lignes = [
    L(p1, o1, 'Kardegic', '75 mg', 'sachet', [0, 1, 0, 0]),
    L(p1, o1, 'Bisoprolol', '2,5 mg', 'comprimé', [1, 0, 0, 0]),
    L(p1, o1, 'Furosémide', '40 mg', 'comprimé', [1, 0, 0, 0], { statut_validation: 'a_valider', modifie_par: JULIE, modifie_le: ilYa(5), valide_par: null, valide_le: null, consignes: 'Dose augmentée par le médecin (avant : ½ cp)' }),
    L(p1, o1, 'Lévothyrox', '50 µg', 'comprimé', [1, 0, 0, 0], { consignes: 'À jeun, 30 min avant le petit-déjeuner' }),
    L(p1, o1, 'Paracétamol', '1 g', 'comprimé', [0, 0, 0, 0], { si_besoin: 'Si douleur, max 3 par jour', hors_pilulier: true }),
    L(p2, o2, 'Metformine', '850 mg', 'comprimé', [1, 0, 1, 0]),
    L(p2, o2, 'Amlodipine', '5 mg', 'comprimé', [1, 0, 0, 0]),
    L(p2, o2, 'Atorvastatine', '20 mg', 'comprimé', [0, 0, 1, 0]),
    L(p2, o2, 'Vitamine D3', '100 000 UI', 'ampoule', [1, 0, 0, 0], { jours: [isoDay(new Date())], consignes: 'Une ampoule par mois, le jour indiqué' }),
    L(p3, o3, 'Donépézil', '10 mg', 'comprimé', [0, 0, 0, 1]),
    L(p3, o3, 'Seresta', '10 mg', 'comprimé', [0, 0, 0.5, 0], { statut_validation: 'a_valider', modifie_par: MARC, modifie_le: ilYa(20), valide_par: null, valide_le: null }),
    L(p3, o3, 'Inexium', '20 mg', 'comprimé', [1, 0, 0, 0], { date_fin: jour(3), consignes: 'Arrêt prévu en fin de cure' }),
    L(p4, o4, 'Eliquis', '2,5 mg', 'comprimé', [1, 0, 1, 0]),
    L(p5, o5, 'Ramipril', '5 mg', 'gélule', [1, 0, 0, 0]),
    L(p5, o5, 'Mianserine', '10 mg', 'comprimé', [0, 0, 0, 1]),
    L(p5, o5, 'Calcium Vitamine D3', '500 mg/400 UI', 'comprimé', [0, 1, 0, 0])
  ];

  const journal = [
    { id: 1, quand: ilYa(5), auteur: JULIE, table_nom: 'lignes', action: 'UPDATE', patient_id: p1.id, enreg_id: lignes[2].id,
      avant: { ...lignes[2], matin: 0.5, consignes: null }, apres: lignes[2] }
  ];

  return { membres, pharmacies, patients, ordonnances, lignes, journal, photos: {} };
}

// Petit extrait fictif de la base officielle, pour le mode démo
const REF = [
  ['60000001', 'KARDEGIC 75 mg, poudre pour solution buvable en sachet-dose', 'KARDEGIC', '75 mg', 'poudre pour solution buvable en sachet-dose', 1],
  ['60000002', 'KARDEGIC 160 mg, poudre pour solution buvable en sachet', 'KARDEGIC', '160 mg', 'poudre pour solution buvable en sachet', 2],
  ['60000003', 'BISOPROLOL BIOGARAN 2,5 mg, comprimé pelliculé sécable', 'BISOPROLOL BIOGARAN', '2,5 mg', 'comprimé pelliculé sécable', 3],
  ['60000004', 'FUROSEMIDE ARROW 40 mg, comprimé sécable', 'FUROSEMIDE ARROW', '40 mg', 'comprimé sécable', 4],
  ['60000005', 'LEVOTHYROX 50 microgrammes, comprimé sécable', 'LEVOTHYROX', '50 µg', 'comprimé sécable', 5],
  ['60000006', 'DOLIPRANE 1000 mg, comprimé', 'DOLIPRANE', '1000 mg', 'comprimé', 6],
  ['60000007', 'METFORMINE BIOGARAN 850 mg, comprimé pelliculé', 'METFORMINE BIOGARAN', '850 mg', 'comprimé pelliculé', 7],
  ['60000008', 'AMLODIPINE ARROW 5 mg, gélule', 'AMLODIPINE ARROW', '5 mg', 'gélule', 8],
  ['60000009', 'ATORVASTATINE BIOGARAN 20 mg, comprimé pelliculé', 'ATORVASTATINE BIOGARAN', '20 mg', 'comprimé pelliculé', 9],
  ['60000010', 'ELIQUIS 2,5 mg, comprimé pelliculé', 'ELIQUIS', '2,5 mg', 'comprimé pelliculé', 10],
  ['60000011', 'SERESTA 10 mg, comprimé', 'SERESTA', '10 mg', 'comprimé', 11],
  ['60000012', 'RAMIPRIL ARROW 5 mg, gélule', 'RAMIPRIL ARROW', '5 mg', 'gélule', 12],
  ['60000013', 'DONEPEZIL BIOGARAN 10 mg, comprimé pelliculé', 'DONEPEZIL BIOGARAN', '10 mg', 'comprimé pelliculé', 13],
  ['60000014', 'INEXIUM 20 mg, comprimé gastro-résistant', 'INEXIUM', '20 mg', 'comprimé gastro-résistant', 14],
  ['60000015', 'ESOMEPRAZOLE ARROW 20 mg, comprimé gastro-résistant', 'ESOMEPRAZOLE ARROW', '20 mg', 'comprimé gastro-résistant', 14]
].map(([cis, denomination, nom, dosage, forme, groupe_id]) => ({
  cis, denomination, nom, dosage, forme, groupe_id, commercialise: true, type_generique: null,
  groupe_libelle: null, titulaire: 'Laboratoire fictif', dosage_num: dosage.split(' ')[0].replace(',', '.'),
  cle1: normaliser(nom).split(' ')[0], recherche: normaliser(denomination)
}));
