// Mise à jour de la base publique des médicaments (ANSM) dans la table medicaments_ref.
// Appelée une fois par mois par la tâche planifiée de la base (pg_cron).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { construire, decoder } from './parse.js';

const BASE = 'https://base-donnees-publique.medicaments.gouv.fr/download/file/';

async function lire(nom: string): Promise<string> {
  const r = await fetch(BASE + nom);
  if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
  return decoder(await r.arrayBuffer());
}

function cleServeur(): string {
  const ancienne = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (ancienne) return ancienne;
  const nouvelles = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  return Object.values(nouvelles)[0] as string;
}

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, cleServeur(), { auth: { persistSession: false } });
  const { data: cfg } = await sb.from('config_privee').select('valeur').eq('cle', 'import_bdpm').single();
  if (!cfg || req.headers.get('x-cle-import') !== cfg.valeur) {
    return new Response('Accès refusé', { status: 401 });
  }
  try {
    const debut = new Date().toISOString();
    const [cis, compo, gener] = await Promise.all([
      lire('CIS_bdpm.txt'), lire('CIS_COMPO_bdpm.txt'), lire('CIS_GENER_bdpm.txt')
    ]);
    const lignes = construire(cis, compo, gener).map((r) => ({ ...r, maj_le: debut }));
    if (lignes.length < 5000) throw new Error(`Fichier incomplet (${lignes.length} lignes)`);
    for (let i = 0; i < lignes.length; i += 1000) {
      const { error } = await sb.from('medicaments_ref').upsert(lignes.slice(i, i + 1000), { onConflict: 'cis' });
      if (error) throw new Error(error.message);
    }
    const { error } = await sb.from('medicaments_ref').delete().lt('maj_le', debut);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, medicaments: lignes.length, le: debut });
  } catch (e) {
    return Response.json({ ok: false, erreur: String((e as Error)?.message || e) }, { status: 500 });
  }
});

