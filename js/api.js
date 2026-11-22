// Accès aux données — version Supabase
import { normaliser } from './ocr.js';

export function createApi(url, key) {
  const sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'piluliers-auth' }
  });

  const ok = ({ data, error }) => {
    if (error) throw new Error(traduireErreur(error.message));
    return data;
  };

  return {
    demo: false,

    async session() {
      const { data } = await sb.auth.getSession();
      return data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((evt, session) => cb(evt, session ? { id: session.user.id, email: session.user.email } : null));
    },
    async signIn(email, password) {
      ok(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password) {
      const data = ok(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } }));
      return { needsConfirmation: !data.session };
    },
    async resetPassword(email) {
      ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }));
    },
    async updatePassword(password) {
      ok(await sb.auth.updateUser({ password }));
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async moi(userId) {
      return ok(await sb.from('membres').select('*').eq('user_id', userId).maybeSingle());
    },
    async rejoindre(code, nom) {
      ok(await sb.rpc('rejoindre_cabinet', { p_code: code, p_nom: nom }));
    },
    async membres() {
      return ok(await sb.from('membres').select('*').order('nom'));
    },
    async majMonNom(userId, nom) {
      ok(await sb.from('membres').update({ nom }).eq('user_id', userId));
    },
    async changerCode(code) {
      ok(await sb.rpc('changer_code_cabinet', { p_nouveau: code }));
    },

    async patients() {
      return ok(await sb.from('patients').select('*').order('nom').order('prenom'));
    },
    async savePatient(p) {
      const { id, created_at, updated_at, updated_by, ...champs } = p;
      if (id) return ok(await sb.from('patients').update(champs).eq('id', id).select().single());
      return ok(await sb.from('patients').insert(champs).select().single());
    },
    async deletePatient(id) {
      ok(await sb.from('patients').delete().eq('id', id));
    },

    async lignes() {
      return ok(await sb.from('lignes').select('*').order('created_at'));
    },
    async saveLigne(l) {
      const { id, created_at, modifie_par, modifie_le, valide_par, valide_le, statut_validation, ...champs } = l;
      if (id) return ok(await sb.from('lignes').update(champs).eq('id', id).select().single());
      return ok(await sb.from('lignes').insert(champs).select().single());
    },
    async validerLigne(id) {
      ok(await sb.from('lignes').update({ statut_validation: 'valide' }).eq('id', id));
    },
    async deleteLigne(id) {
      ok(await sb.from('lignes').delete().eq('id', id));
    },

    async ordonnances() {
      return ok(await sb.from('ordonnances').select('*').order('date_prescription', { ascending: false }));
    },
    async saveOrdonnance(o) {
      const { id, created_at, created_by, ...champs } = o;
      if (id) return ok(await sb.from('ordonnances').update(champs).eq('id', id).select().single());
      return ok(await sb.from('ordonnances').insert(champs).select().single());
    },
    async deleteOrdonnance(o) {
      ok(await sb.from('ordonnances').delete().eq('id', o.id));
      if (o.photo_path) await sb.storage.from('documents').remove([o.photo_path]);
    },

    async journal(patientId) {
      return ok(await sb.from('journal').select('*').eq('patient_id', patientId).order('quand', { ascending: false }).limit(80));
    },
    async journalLigne(ligneId) {
      return ok(await sb.from('journal').select('*').eq('enreg_id', ligneId).order('quand', { ascending: false }).limit(60));
    },

    async chercherMedicaments(texte) {
      const q = normaliser(texte);
      if (q.length < 3) return [];
      return ok(await sb.rpc('chercher_medicaments', { p_q: q, p_n: 12 }));
    },
    async equivalents(cis) {
      return ok(await sb.rpc('equivalents_medicament', { p_cis: cis }));
    },
    async reconnaitre(lignes) {
      return ok(await sb.rpc('reconnaitre_medicaments', { p_lignes: lignes.map(normaliser) }));
    },

    async uploadPhoto(blob, dossier) {
      const pdf = blob.type === 'application/pdf';
      const path = `${dossier}/${crypto.randomUUID()}.${pdf ? 'pdf' : 'jpg'}`;
      ok(await sb.storage.from('documents').upload(path, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg', upsert: false }));
      return path;
    },
    async photoUrl(path) {
      const data = ok(await sb.storage.from('documents').createSignedUrl(path, 3600));
      return data.signedUrl;
    },

    async exportAll() {
      const [patients, lignes, ordonnances, membres] = await Promise.all([
        this.patients(), this.lignes(), this.ordonnances(), this.membres()
      ]);
      return { exporte_le: new Date().toISOString(), membres, patients, lignes, ordonnances };
    }
  };
}

function traduireErreur(m) {
  if (!m) return 'Erreur inconnue';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect';
  if (/Email not confirmed/i.test(m)) return 'E-mail pas encore confirmé : clique sur le lien reçu par mail';
  if (/User already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail';
  if (/Password should be at least/i.test(m)) return 'Mot de passe trop court (8 caractères minimum)';
  if (/rate limit/i.test(m)) return 'Trop de tentatives, réessaie dans quelques minutes';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion Internet';
  if (/row-level security|permission denied/i.test(m)) return 'Accès refusé';
  return m;
}
