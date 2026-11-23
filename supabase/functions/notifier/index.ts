// Notifications du cabinet (Web Push vers les téléphones où elles sont activées).
// - type « envoi »     : appelé par la base quand une ordonnance est notée comme envoyée à la pharmacie
// - type « echeances » : appelé chaque matin par la tâche planifiée, résumé des ordonnances qui se terminent
import { createClient } from 'npm:@supabase/supabase-js@2';
import { envoyerPush, b64uEncode } from './webpush.js';

function cleServeur(): string {
  const ancienne = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (ancienne) return ancienne;
  const nouvelles = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  return Object.values(nouvelles)[0] as string;
}

const normaliser = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Même règle que l'appli : « Dr Lambert » = « Docteur Pierre LAMBERT »
function clePrescripteur(nom: string) {
  const mots = normaliser(nom).replace(/[^a-z\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 1 && !['dr', 'docteur', 'pr', 'professeur', 'medecin', 'mme', 'mr', 'm'].includes(w));
  return mots.length ? mots[mots.length - 1] : '';
}
const nomPatient = (p: { nom: string; prenom?: string }) => `${String(p.nom || '').toUpperCase()} ${p.prenom || ''}`.trim();
const fmt = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const aujourdhuiParis = () => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const heureParis = () => Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
const ecartJours = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, cleServeur(), { auth: { persistSession: false } });
  const { data: cfg } = await sb.from('config_privee').select('cle, valeur').in('cle', ['notifications', 'vapid_publique', 'vapid_privee', 'vapid_sujet']);
  const c = Object.fromEntries((cfg || []).map((x) => [x.cle, x.valeur]));
  if (!c.notifications || req.headers.get('x-cle-notif') !== c.notifications) return new Response('Accès refusé', { status: 401 });
  // Clés VAPID créées ici au premier appel : la clé privée ne quitte jamais la base
  if (!c.vapid_privee || !c.vapid_publique) {
    const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', paire.privateKey);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', paire.publicKey));
    c.vapid_privee = jwk.d as string;
    c.vapid_publique = b64uEncode(pub);
    await sb.from('config_privee').upsert([{ cle: 'vapid_privee', valeur: c.vapid_privee }, { cle: 'vapid_publique', valeur: c.vapid_publique }], { onConflict: 'cle' });
  }
  const vapid = { publique: c.vapid_publique, privee: c.vapid_privee, sujet: c.vapid_sujet || 'https://piluliers-cabinet.vercel.app' };
  const demande = await req.json().catch(() => ({}));
  if (demande.type === 'init') return Response.json({ ok: true, publique: c.vapid_publique });

  let message: { titre: string; corps: string; url: string; badge?: number } | null = null;
  let exclure: string | null = null;

  if (demande.type === 'envoi') {
    const { data: o } = await sb.from('ordonnances').select('id, patient_id, envoyee_via, envoyee_par, envoyee_a, date_prescription').eq('id', demande.id).single();
    if (!o) return Response.json({ ok: false, raison: 'ordonnance introuvable' });
    const [{ data: p }, { data: ph }, { data: m }] = await Promise.all([
      sb.from('patients').select('nom, prenom').eq('id', o.patient_id).single(),
      o.envoyee_a ? sb.from('pharmacies').select('nom').eq('id', o.envoyee_a).single() : Promise.resolve({ data: null }),
      o.envoyee_par ? sb.from('membres').select('nom').eq('user_id', o.envoyee_par).single() : Promise.resolve({ data: null })
    ]);
    exclure = o.envoyee_par;
    message = {
      titre: 'Ordonnance envoyée',
      corps: `${p ? nomPatient(p) : 'Patient'} · ${o.envoyee_via === 'sms' ? 'par SMS' : 'par e-mail'}${ph ? ` à ${ph.nom}` : ''}${m ? ` · par ${m.nom}` : ''}`,
      url: `#/patient/${o.patient_id}`
    };
  } else if (demande.type === 'echeances') {
    // La tâche passe à 5h30 et 6h30 UTC : on n'envoie qu'à 7h (heure de Paris), été comme hiver
    if (!demande.forcer && heureParis() !== 7) return Response.json({ ok: true, raison: 'pas l\'heure' });
    const auj = aujourdhuiParis();
    const [{ data: ords }, { data: pats }] = await Promise.all([
      sb.from('ordonnances').select('id, patient_id, prescripteur, date_prescription, date_fin').eq('archivee', false),
      sb.from('patients').select('id, nom, prenom, statut')
    ]);
    const patients = new Map((pats || []).map((p) => [p.id, p]));
    const derniere = new Map<string, typeof ords[number]>();
    for (const o of ords || []) {
      const p = patients.get(o.patient_id);
      if (!p || p.statut === 'arrete') continue;
      const k = `${o.patient_id}|${clePrescripteur(o.prescripteur) || '-'}`;
      const prec = derniere.get(k);
      if (!prec || o.date_prescription > prec.date_prescription) derniere.set(k, o);
    }
    const proches = [...derniere.values()].filter((o) => o.date_fin && ecartJours(auj, o.date_fin) <= 7)
      .sort((a, b) => a.date_fin.localeCompare(b.date_fin));
    if (!proches.length) return Response.json({ ok: true, raison: 'rien à signaler' });
    const lignes = proches.map((o) => {
      const j = ecartJours(auj, o.date_fin);
      const quand = j < 0 ? `échue depuis ${-j} j` : j === 0 ? "fin aujourd'hui" : `fin le ${fmt(o.date_fin)}`;
      return `${nomPatient(patients.get(o.patient_id))} (${o.prescripteur || 'médecin ?'}) : ${quand}`;
    });
    let corps = lignes.join('\n');
    if (corps.length > 900) corps = `${lignes.slice(0, 8).join('\n')}\n… et ${lignes.length - 8} autres`;
    message = { titre: `${proches.length} ordonnance${proches.length > 1 ? 's' : ''} à renouveler`, corps, url: '#/tableau/fins', badge: proches.length };
  } else {
    return Response.json({ ok: false, raison: 'type inconnu' }, { status: 400 });
  }

  let requete = sb.from('abonnements_push').select('id, user_id, endpoint, p256dh, auth');
  if (exclure) requete = requete.neq('user_id', exclure);
  const { data: abonnes } = await requete;
  const resultats = await Promise.all((abonnes || []).map(async (a) => {
    try {
      const r = await envoyerPush(a, JSON.stringify(message), vapid);
      if (r.statut === 404 || r.statut === 410) await sb.from('abonnements_push').delete().eq('id', a.id);
      return { statut: r.statut, texte: r.texte };
    } catch (e) { return { statut: 0, texte: String(e) }; }
  }));
  return Response.json({ ok: true, envoyes: resultats.filter((r) => r.statut >= 200 && r.statut < 300).length, resultats });
});
