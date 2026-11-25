// Who is visiting: family (family password), parent (family + parent PIN), friend (share link + friends password).
// Passwords start as Netlify environment variables (FAMILY_PASSWORD, FRIENDS_PASSWORD, PARENT_PIN); a parent can
// change them in the app, which stores a hash here. Each level has a "generation": changing that level's password
// gives it a new one, and every cookie carrying the old one stops working (that logs out every device using it).
import { sign, verify, sha256, sameText, hashPassword, checkPassword, randomId, cookies, encrypt, decrypt, COOKIE, DAY, PAGES } from './core.mjs';
import { store } from './store.mjs';
import { getStudio, getDevice, checkPin, MAIN } from './studios.mjs';
import site from '../../content/site.json' with { type: 'json' };

export const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? globalThis.process?.env?.[k];
export const LEVELS = { family: 'FAMILY_PASSWORD', friends: 'FRIENDS_PASSWORD', pin: 'PARENT_PIN', owner: 'OWNER_PIN' };
// Each girl's tablet has its own password (set by a parent; none until then). Level names: kid-leora, kid-amaya.
export const GIRLS = site.kids.map((k) => k.key);
export const KID_PAGES = [...GIRLS, 'pet-parents'];
export const kidLevel = (k) => 'kid-' + k;

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
  const level = role === 'friend' ? 'friends' : role === 'kid' ? kidLevel(extra.k) : 'family';
  return sign({ r: role, g: await generation(level, context), iat: Date.now(), ...extra }, secret());
}
export async function makeParent(context, minutes) {
  return sign({ r: 'parent', g: await generation('pin', context), exp: Date.now() + minutes * 60000 }, secret());
}

// Reads the login cookies and checks they are still good. Returns { role, link?, pages?, iat, keys } or null.
// role is the old login (family, friend, house, kid) or 'guest' when the phone only holds studio keys (View link, Invite).
export async function who(req, context) {
  const keys = await validKeys(await readKeys(req), context);
  const me = await legacy(req, context);
  if (me) return Object.assign(me, { keys });
  return keys.length ? { role: 'guest', keys, pages: [] } : null;
}
async function legacy(req, context) {
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
  if (p.r === 'house') {
    const house = await getHouse(p.h, context);
    if (!house || house.off || p.g !== house.gen) return null;
    return { role: 'house', house: house.id, name: house.name, pages: housePages(house), iat: p.iat };
  }
  if (p.r === 'kid') {
    if (!p.k || p.g !== (await generation(kidLevel(p.k), context))) return null;
    const moments = await kidMayMoments(p.k, context);
    return { role: 'kid', kid: p.k, moments, pages: [...KID_PAGES, ...(moments ? ['family-moments'] : [])], iat: p.iat };
  }
  return null;
}

// A parent's switch: may this girl see Family Moments and add photos to it?
export async function kidMayMoments(k, context) { return !!(await config(context)).kidPerms?.[k]?.moments; }
export async function setKidMoments(k, on, context) {
  const s = store('auth', context);
  const cfg = (await s.get('config', { type: 'json' })) || {};
  cfg.kidPerms = { ...(cfg.kidPerms || {}), [k]: { ...(cfg.kidPerms?.[k] || {}), moments: !!on } };
  await s.setJSON('config', cfg);
  forgetConfig();
}
// What a girl's tablet may open: her pages (like a friend), plus Add art and the art API.
export function kidMayOpen(me, pathname) {
  const first = pathname.split('/')[1] || '';
  if (first === 'upload') return true;
  if (first === 'api') return ['logout', 'pieces', 'whoami', 'episodes', 'videos'].includes(pathname.split('/')[2]);
  return friendMayOpen(me.pages, pathname);
}

// ---- households (Jesse, 2026-11-25): Grandma's, an aunt's... Each has an invite link: one tap and that phone is in
// for a year, no password. They get their own page (households/), can add photos and videos to Family Moments days
// (shown right away), and see the pages a parent ticked. Store 'links': house/<id> and invite/<secret> -> id.
// The household's id is shown on pages; the invite secret never is. A new link or turning it off logs their phones out.
export const HOUSE_PAGE = 'households';
const houseCache = new Map();
export async function getHouse(id, context) {
  if (!id || typeof id !== 'string') return null;
  const hit = houseCache.get(id);
  if (hit && Date.now() - hit.at < 15000) return hit.house;
  const house = await store('links', context).get('house/' + id, { type: 'json' });
  houseCache.set(id, { at: Date.now(), house });
  return house;
}
export function forgetHouse(id) { houseCache.delete(id); }
export async function houseByInvite(secretPart, context) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(secretPart || '')) return null;
  const ref = await store('links', context).get('invite/' + secretPart, { type: 'json' });
  const house = ref && (await getHouse(ref.id, context));
  return house && !house.off && house.invite === secretPart ? house : null;
}
export const housePages = (house) => [...new Set([...(house.pages || []).filter((p) => PAGES.includes(p)), 'family-moments', HOUSE_PAGE])];
export async function makeHouseLogin(house) { return sign({ r: 'house', h: house.id, g: house.gen, iat: Date.now() }, secret()); }
// What a household's phone may open: their pages, the app, and the APIs the app and pages use.
export function houseMayOpen(me, pathname) {
  const first = pathname.split('/')[1] || '';
  if (first === 'upload') return true;
  if (first === 'api') return ['logout', 'pieces', 'whoami', 'episodes', 'videos', 'videos-drive'].includes(pathname.split('/')[2]);
  return friendMayOpen(me.pages, pathname);
}
// Who saved a piece or video: a girl's key, or h:<household id>. Family pieces have none.
export const byOf = (me) => (me?.role === 'kid' ? me.kid : me?.role === 'house' ? 'h:' + me.house : null);

// ---------- studio keys (build spec, 2026-11-25): what a phone holds after tapping a studio's View link or Invite ----------
// One signed cookie with a short list: { t: 'v', s: studio, g: view link generation } to look, { t: 'd', s, d: device id }
// to add (a capture device). A phone can hold keys for several studios (Grandma in two studios).
export async function readKeys(req) {
  const p = await verify(cookies(req)[COOKIE.keys], secret());
  return Array.isArray(p?.k) ? p.k.slice(0, 20) : [];
}
export async function validKeys(raw, context) {
  const out = [];
  for (const k of raw) {
    const s = await getStudio(k.s, context);
    if (!s || s.off || s.removed) continue;
    if (k.t === 'v' && s.view?.gen && k.g === s.view.gen) out.push({ t: 'v', s: s.slug });
    if (k.t === 'd') {
      const d = await getDevice(k.d, context);
      if (d && !d.off && d.studio === s.slug) out.push({ t: 'd', s: s.slug, d: d.id, kid: d.kid || null, name: d.name || '' });
    }
  }
  return out;
}
// Adds or replaces a key and returns the new cookie value (keys for other studios stay).
export async function addKey(req, key) {
  const list = (await readKeys(req)).filter((k) => !(k.s === key.s && (k.t === key.t || key.t === 'd')));
  list.unshift(key);
  return sign({ k: list.slice(0, 20), iat: Date.now() }, secret());
}
// May this login look at / add to a studio? (Old logins belong to the root studio.)
export function mayView(me, studio) {
  if (!me) return false;
  if (me.role === 'family') return true;   // Jesse's household looks at every studio (the family menu has every View link anyway)
  if (studio === MAIN && ['kid', 'house', 'friend'].includes(me.role)) return true;   // their own page rules apply too
  return (me.keys || []).some((k) => k.s === studio);
}
export function deviceKey(me, studio) { return (me?.keys || []).find((k) => k.t === 'd' && k.s === studio) || null; }
export function mayAdd(me, studio) {
  if (!me) return false;
  if (studio === MAIN && ['family', 'kid', 'house'].includes(me.role)) return true;
  return !!deviceKey(me, studio);
}
export const addsAnywhere = (me) => !!me && (['family', 'kid', 'house'].includes(me.role) || (me.keys || []).some((k) => k.t === 'd'));

// ---------- PINs: each studio has its own; Jesse's owner PIN opens For parents in every studio ----------
// The owner PIN is OWNER_PIN in Netlify (or changed in the app); until it is set, the root studio's parent PIN is the owner PIN.
export async function checkOwner(pin, context) {
  const cfg = await config(context, true);
  if (cfg.owner?.hash || env(LEVELS.owner)) return checkLevel('owner', pin, context);
  return checkLevel('pin', pin, context);
}
export async function ownerGen(context) {
  const cfg = await config(context);
  if (cfg.owner?.gen || env(LEVELS.owner)) return 'o-' + (await generation('owner', context));
  return 'p-' + (await generation('pin', context));
}
// The parent cookie says which studio's For parents it opens: a studio slug, or '*' for the owner (every studio).
export async function makeParentFor(studio, context, minutes) {
  const g = studio === '*' ? await ownerGen(context) : studio === MAIN ? await generation('pin', context) : (await getStudio(studio, context))?.pin?.gen;
  return sign({ r: 'parent', s: studio, g, exp: Date.now() + minutes * 60000 }, secret());
}
export async function checkStudioPin(studio, pin, context) {
  if (studio === MAIN) return checkLevel('pin', pin, context);
  return checkPin(await getStudio(studio, context), pin);
}
export async function parentOf(req, context) {
  const p = await verify(cookies(req)[COOKIE.parent], secret());
  if (!p || p.r !== 'parent') return null;
  if (p.s === '*') return p.g === (await ownerGen(context)) ? '*' : null;
  const s = p.s || MAIN;
  if (s === MAIN) return p.g === (await generation('pin', context)) ? MAIN : null;
  const st = await getStudio(s, context);
  return st?.pin?.gen && p.g === st.pin.gen ? s : null;
}
// A parent of this studio (its PIN), or the owner. The root studio also needs a family login or one of its keys, as before.
export async function isParent(req, context, studio = MAIN) {
  const got = await parentOf(req, context);
  if (!got) return false;
  if (got !== '*' && got !== studio) return false;
  if (studio !== MAIN || got === '*') return true;
  const fam = await who(req, context);
  return fam?.role === 'family' || mayAdd(fam, MAIN) && fam?.role === 'guest';
}
export async function isOwner(req, context) { return (await parentOf(req, context)) === '*'; }

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
  if (first === 'img') return true;
  if (first === HOUSE_PAGE) return pages.includes(HOUSE_PAGE);                    // live art: the function checks the piece's kid
  if (first === 'api') return ['logout', 'pieces', 'whoami', 'episodes', 'videos'].includes(pathname.split('/')[2]);
  return PAGES.includes(first) && pages.includes(first);
}

export { DAY };
