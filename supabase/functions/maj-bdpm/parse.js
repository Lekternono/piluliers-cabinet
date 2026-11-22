// Analyse des fichiers BDPM (format ANSM, séparateur tabulation)
export function decoder(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
export const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
const lignes = (txt) => txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split('\t').map((c) => c.trim()));

export function construire(txtCis, txtCompo, txtGener) {
  const compo = new Map();
  for (const c of lignes(txtCompo)) {
    if (c[6] !== 'SA') continue;
    const liste = compo.get(c[0]) || [];
    const s = `${c[3]}${c[4] ? ' ' + c[4] : ''}`;
    if (!liste.includes(s)) liste.push(s);
    compo.set(c[0], liste);
  }
  const gener = new Map();
  for (const g of lignes(txtGener)) gener.set(g[2], { id: Number(g[0]), libelle: g[1], type: Number(g[3]) });

  const res = [];
  for (const c of lignes(txtCis)) {
    const [cis, denomination, forme, voies, statut, procedure, commercialisation, , , , titulaire, surveillance] = c;
    if (!cis || !/^\d{8}$/.test(cis)) continue;
    if (/hom[eé]o/i.test(procedure || '')) continue;
    // nom : tout ce qui précède le premier chiffre ou la première virgule
    const m = denomination.match(/^(.*?)(?=\s\d|,|$)/);
    const nom = (m ? m[1] : denomination).trim();
    const d = denomination.match(/(\d+(?:[.,]\d+)?)\s*(microgrammes?|µg|mg|g|ui|u\.?i\.?|%|ml)\b/i);
    const mots = norm(nom).split(/[^a-z0-9]+/).filter(Boolean);
    const g = gener.get(cis);
    const subst = (compo.get(cis) || []).join(' + ');
    res.push({
      cis, denomination, nom, nom_norm: norm(nom), forme: (forme || '').trim(), voies: voies || null,
      dosage: d ? `${d[1]} ${d[2].toLowerCase().replace('microgrammes', 'µg').replace('microgramme', 'µg')}` : null,
      dosage_num: d ? d[1].replace(',', '.') : null,
      commercialise: /^commercialis/i.test(commercialisation || ''),
      autorise: /active/i.test(statut || ''),
      titulaire: (titulaire || '').trim() || null,
      surveillance: /oui/i.test(surveillance || ''),
      substances: subst || null,
      groupe_id: g ? g.id : null, groupe_libelle: g ? g.libelle : null, type_generique: g ? g.type : null,
      cle1: mots[0] || null, cle2: mots.length > 1 ? `${mots[0]} ${mots[1]}` : null,
      recherche: norm(`${denomination} ${subst}`)
    });
  }
  return res;
}
