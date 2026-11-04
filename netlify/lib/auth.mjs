// Who is visiting: family (family password), parent (family + parent PIN), friend (share link + friends password).
// Passwords start as Netlify environment variables (FAMILY_PASSWORD, FRIENDS_PASSWORD, PARENT_PIN); a parent can
// change them in the app, which stores a hash here. Each level has a "generation": changing that level's password
// gives it a new one, and every cookie carrying the old one stops working (that logs out every device using it).
import { sign, verify, sha256, sameText, hashPassword, checkPassword, randomId, cookies, encrypt, decrypt, COOKIE, DAY, PAGES } from './core.mjs';
import { store } from './store.mjs';

export const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? globalThis.process?.env?.[k];
export const LEVELS = { family: 'FAMILY_PASSWORD', friends: 'FRIENDS_PASSWORD', pin: 'PARENT_PIN' };

export function secret() {
  const s = env('TSS_SECRET');
  if (!s || s.length < 32) throw new Error('TSS_SECRET is missing or too short');
  return s;
}

let cache = { at: 0, cfg: null };
export async function config(context, fresh = false) {
  if (!fresh && cache.cfg && Date.now() - cache.at < 20000) return cache.cfg;
  const cfg = (await store('auth', context).get('config', { type: 'json' })) || {};
  cache = { at: Date.now(), cfg };
  return cfg;
}
export function forgetConfig() { cache = { at: 0, cfg: null }; }

export async function generation(level, context) {
  const cfg = await config(context);
  if (cfg[level]?.gen) return cfg[level].gen;
  const v = env(LEVELS[level]);
  return v ? 'env-' + (await sha256(level + ':' + v)).slice(0, 12) : null;
}

export async function isSetUp(level, context) { return !!(await generation(level, context)); }

export async function checkLevel(level, pw, context) {
  if (!pw) return false;
  const cfg = await config(context, true);
  if (cfg[level]?.hash) return checkPassword(pw, cfg[level]);
  const v = env(LEVELS[level]);
  return !!v && sameText(pw, v);
}

export async function changeLevel(level, pw, context) {
  const s = store('auth', context);
  const cfg = (await s.get('config', { type: 'json' })) || {};
  cfg[level] = { ...(await hashPassword(pw)), gen: randomId(9), changed: new Date().toISOString() };
  // The friends password is also kept locked (encrypted), so a parent can tap "Send password" after making a link.
  if (level === 'friends') cfg[level].enc = await encrypt(pw, secret());
  await s.setJSON('config', cfg);
  forgetConfig();
}

// The friends password as text, for a parent's "Send password" button.
export async function friendsPasswordText(context) {
  const cfg = await config(context, true);
  if (cfg.friends?.enc) return decrypt(cfg.friends.enc, secret());
  if (cfg.friends?.hash) return null;
  return env(LEVELS.friends) || null;
}

// ---- tokens ----
export async function makeLogin(role, context, extra = {}) {
  const level = role === 'friend' ? 'friends' : 'family';
  return sign({ r: role, g: await generation(level, context), iat: Date.now(), ...extra }, secret());
}
export async function makeParent(context, minutes) {
  return sign({ r: 'parent', g: await generation('pin', context), exp: Date.now() + minutes * 60000 }, secret());
}

// Reads the login cookie and checks it is still good. Returns { role, link?, pages?, iat } or null.
export async function who(req, context) {
  const c = cookies(req);
  const p = await verify(c[COOKIE.login], secret());
  if (!p) return null;
  if (p.r === 'family') {
    if (p.g !== (await generation('family', context))) return null;
    return { role: 'family', iat: p.iat };
  }
  if (p.r === 'friend') {
    if (p.g !== (await generation('friends', context))) return null;
    const link = await getLink(p.l, context);
    if (!linkOpen(link)) return null;
    return { role: 'friend', link: link.id, pages: link.pages, iat: p.iat };
  }
  return null;
}

export async function isParent(req, context) {
  const fam = await who(req, context);
  if (fam?.role !== 'family') return false;
  const p = await verify(cookies(req)[COOKIE.parent], secret());
  return !!p && p.r === 'parent' && p.g === (await generation('pin', context));
}

// ---- share links (phase 6 uses these; the gate checks them on every friend visit) ----
const linkCache = new Map();
export async function getLink(id, context) {
  if (!id) return null;
  const hit = linkCache.get(id);
  if (hit && Date.now() - hit.at < 15000) return hit.link;
  const link = await store('links', context).get('link/' + id, { type: 'json' });
  linkCache.set(id, { at: Date.now(), link });
  return link;
}
export function forgetLink(id) { linkCache.delete(id); }
export function linkOpen(link) {
  return !!link && !link.off && (!link.expires || Date.now() < link.expires);
}
export function friendMayOpen(pages, pathname) {
  const first = pathname.split('/')[1] || '';
  if (first === '') return true;                       // the welcome page (shows only their tabs)
  if (['styles.css', 'main.js', 'robots.txt', 'favicon.ico'].includes(first)) return true;
  if (first === 'assets') {
    const kind = pathname.split('/')[2];
    if (kind === 'art') return pages.includes(pathname.split('/')[3]) || (pathname.split('/')[3] === 'episodes' && pages.includes('pet-parents'));
    if (kind === 'moments') return pages.includes('family-moments');
    if (kind === 'audio') return pages.includes('pet-parents');
    return true;                                       // fonts, drawings, brand
  }
  if (first === 'moments') return pages.includes('family-moments');
  if (first === 'img') return true;                    // live art: the function checks the piece's kid
  if (first === 'api') return ['logout', 'pieces', 'whoami'].includes(pathname.split('/')[2]);
  return PAGES.includes(first) && pages.includes(first);
}

export { DAY };
