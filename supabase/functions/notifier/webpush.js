// Envoi Web Push sans dépendance : chiffrement aes128gcm (RFC 8291) et signature VAPID (RFC 8292),
// avec WebCrypto uniquement (fonctionne dans Deno comme dans Node 20+).

const enc = new TextEncoder();

export function b64uDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
export function b64uEncode(u8) {
  let s = '';
  for (const x of new Uint8Array(u8)) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hmac(cle, donnees) {
  const k = await crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, donnees));
}
// HKDF en deux temps (extract puis expand sur un seul bloc, longueur ≤ 32)
async function hkdf(sel, ikm, info, longueur) {
  const prk = await hmac(sel, ikm);
  const t = await hmac(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, longueur);
}

// Clé privée VAPID (d, base64url) + clé publique (point non compressé, base64url) -> clé de signature ES256
async function cleVapid(publique, privee) {
  const pub = b64uDecode(publique);
  const jwk = { kty: 'EC', crv: 'P-256', d: privee, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function enteteVapid(endpoint, { publique, privee, sujet }) {
  const aud = new URL(endpoint).origin;
  const entete = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corps = b64uEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujet })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await cleVapid(publique, privee), enc.encode(`${entete}.${corps}`));
  return `vapid t=${entete}.${corps}.${b64uEncode(signature)}, k=${publique}`;
}

// Chiffre le message pour un abonné (p256dh, auth en base64url) ; renvoie le corps aes128gcm
export async function chiffrer(message, p256dh, auth) {
  const clientPub = b64uDecode(p256dh);
  const secret = b64uDecode(auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const cleClient = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const partage = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: cleClient }, local.privateKey, 256));
  const ikm = await hkdf(secret, partage, concat(enc.encode('WebPush: info\0'), clientPub, localPub), 32);
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sel, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const clair = concat(enc.encode(message), new Uint8Array([2])); // délimiteur de fin d'enregistrement
  const cle = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cle, clair));
  const rs = new Uint8Array([0, 0, 16, 0]); // taille d'enregistrement 4096
  return concat(sel, rs, new Uint8Array([localPub.length]), localPub, chiffre);
}

// Envoie une notification ; renvoie le code HTTP du service de push (201 = accepté, 404/410 = abonnement mort)
export async function envoyerPush(abonnement, message, vapid, ttl = 86400) {
  const corps = await chiffrer(message, abonnement.p256dh, abonnement.auth);
  const r = await fetch(abonnement.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await enteteVapid(abonnement.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal'
    },
    body: corps
  });
  return { statut: r.status, texte: r.ok ? '' : (await r.text()).slice(0, 300) };
}
