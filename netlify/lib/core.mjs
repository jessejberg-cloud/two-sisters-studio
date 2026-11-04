// Shared by the edge gate (Deno) and the functions (Node): signed cookies, password hashes, encryption.
// Web Crypto only, so the same code runs in both places.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  enc(bytes) {
    let s = '';
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};

export const randomId = (n = 16) => b64u.enc(crypto.getRandomValues(new Uint8Array(n)));

export async function sha256(text) {
  return b64u.enc(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

const hmacKeys = new Map();
async function hmacKey(secret) {
  if (!hmacKeys.has(secret)) {
    hmacKeys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  }
  return hmacKeys.get(secret);
}

// A signed token: base64url(JSON) + "." + signature. Not secret, but cannot be changed or forged.
export async function sign(payload, secret) {
  const body = b64u.enc(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64u.enc(sig);
}

export async function verify(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  let sig;
  try { sig = b64u.dec(token.slice(i + 1)); } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(body));
  if (!ok) return null;
  try {
    const p = JSON.parse(dec.decode(b64u.dec(body)));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch { return null; }
}

// Constant-time string compare (for passwords set as environment variables).
export function sameText(a, b) {
  const x = enc.encode(String(a ?? '')), y = enc.encode(String(b ?? ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// Password hashes for passwords changed in the app (PBKDF2, 210k rounds). Only the Node functions call these.
export async function hashPassword(pw, salt = randomId(16), rounds = 210000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: rounds }, key, 256);
  return { salt, rounds, hash: b64u.enc(bits) };
}
export async function checkPassword(pw, rec) {
  if (!rec?.hash) return false;
  const h = await hashPassword(pw, rec.salt, rec.rounds);
  return sameText(h.hash, rec.hash);
}

// AES-GCM for the Google Drive key kept in storage.
async function aesKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('tss-aes:' + secret));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function encrypt(text, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text));
  return b64u.enc(iv) + '.' + b64u.enc(ct);
}
export async function decrypt(blob, secret) {
  const [iv, ct] = String(blob).split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64u.dec(iv) }, await aesKey(secret), b64u.dec(ct));
  return dec.decode(pt);
}

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(name, value, { maxAge, httpOnly = true, path = '/' } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'Secure', 'SameSite=Lax',
    httpOnly ? 'HttpOnly' : '', maxAge != null ? `Max-Age=${maxAge}` : ''].filter(Boolean).join('; ');
}

export const DAY = 86400000;
export const COOKIE = { login: 'tss', parent: 'tssp', link: 'tssl', view: 'tssv', gstate: 'tssg', next: 'tssn' };
export const LOGIN_DAYS = 365;          // family devices stay logged in for a year, renewed as they visit
export const PARENT_MINUTES = 15;       // the parent PIN is asked again after 15 minutes without use
export const PAGES = ['leora', 'amaya', 'pet-parents', 'family-moments'];

// Storage names: previews never touch the live site's data.
export function scope(context) {
  const c = context?.deploy?.context || globalThis.Netlify?.env?.get?.('CONTEXT') || globalThis.process?.env?.CONTEXT || 'production';
  return c === 'production' ? 'live' : 'preview';
}
