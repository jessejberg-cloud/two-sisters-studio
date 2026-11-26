// Studios (Jesse's build spec, 2026-11-25): one codebase, one Netlify site, many studios, one per household.
//
// Jesse's studio is "main": it lives at the root (twosistersstudio.com), its kids come from content/site.json,
// and its old logins (family password, the girls' tablet passwords, household invites, share links) keep working.
// Every other studio lives at /<slug>/ and is made by its own family through onboarding, from an invite Jesse makes.
//
// Store "studios":
//   s/<slug>        the studio: { slug, name, color, kids: [{ key, name, color, grade, schoolYear }], pin, view, invite,
//                   drive, skipped: [...], created, off }  (s/main holds only what the root adds: view link, invite, name)
//   d/<device id>   a capture device: { id, studio, name, kid (a kid key: kid mode) | null, off, created, seen }
//   index           [slug, ...] in the order they were made
// Store "links":
//   invite/<secret> { kind: 'create', name, by, created, off, studio? }  an invite to make a new studio (Jesse's, owner only)
//                   { kind: 'device', studio }                          a studio's capture invite (its parents send it)
//                   { id }                                              a household invite (2026-11-25, still works)
//   view/<secret>   { studio }                                          a studio's View link
import site from '../../content/site.json' with { type: 'json' };
import { store } from './store.mjs';
import { randomId, hashPassword, checkPassword } from './core.mjs';

export const MAIN = 'main';
export const COLORS = ['coral', 'lav', 'mint', 'yellow', 'sky'];
export const GRADES = ['Pre-K', 'K4', 'K5', '1st grade', '2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade',
  '7th grade', '8th grade', '9th grade', '10th grade', '11th grade', '12th grade'];
// Addresses a studio can never take: every page and function of the site, and the root studio's own pages.
export const RESERVED = new Set(['', MAIN, 'api', 's', 'i', 'v', 'img', 'assets', 'upload', 'login', 'logout', 'privacy', 'parent', 'for-parents',
  'studio', 'start', 'moments', 'family-moments', 'family-moment', 'households', 'pet-parents', 'robots', 'robots.txt',
  'favicon.ico', 'styles.css', 'main.js', 'parent.js', 'studio.js', '404', 'new', 'admin', 'www', 'app', 'help', 'site', 'share', 'shared', 'shared.js', 'start.js', 'icons.js',
  ...site.kids.map((k) => k.key)]);
// Pages inside a studio, after /<slug>/: its kids, its Family Moment page, its For parents page.
export const STUDIO_PAGES = ['family-moment', 'for-parents'];

const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
export const toSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/g, '');
export const schoolYearNow = (d = new Date()) => { const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1; const s = m >= 9 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };

// ---------- the root studio, from content/site.json ----------
export function mainKids() {
  return site.kids.map((k) => ({ key: k.key, name: k.name, color: k.color, grade: k.gradeBase?.grade || '', schoolYear: k.gradeBase?.schoolYear || '' }));
}

// ---------- reading, with a short cache (the front door reads these on every page) ----------
const cache = new Map();
export function forget(slug) { if (slug) cache.delete(slug); else cache.clear(); }
export async function getStudio(slug, context) {
  if (typeof slug !== 'string' || slug.length > 40) return null;
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 15000) return hit.s;
  let s = await store('studios', context).get('s/' + slug, { type: 'json' });
  if (slug === MAIN) s = { slug: MAIN, name: site.siteName, color: 'coral', ...(s || {}), main: true, kids: mainKids(), off: false };
  cache.set(slug, { at: Date.now(), s });
  return s;
}
export async function putStudio(s, context) {
  const { main, kids, ...rest } = s;
  await store('studios', context).setJSON('s/' + s.slug, main ? rest : { ...rest, kids });
  forget(s.slug);
}
export async function listStudios(context) {
  const ids = (await store('studios', context).get('index', { type: 'json' })) || [];
  const out = [await getStudio(MAIN, context)];
  for (const id of ids) { const s = await getStudio(id, context); if (s && !s.removed) out.push(s); }
  return out;
}

// ---------- artists (Jesse, 2026-11-25: a kid, a grown-up or a pet; the same to the site, only kids have a grade) ----------
// Who may do what comes from the phone (kid mode) and the PIN, never from the artist.
export const KINDS = ['kid', 'adult', 'pet'];
export const kindOf = (k) => (KINDS.includes(k?.kind) ? k.kind : 'kid');
// The hand-drawn icons an artist may pick (Jesse, 2026-11-25; drawn by tools/build.cjs ARTIST_ICONS). None: one by order.
export const ARTIST_ICONS = ['palette', 'crayon', 'star', 'rocket', 'flower', 'dino', 'ball', 'paw'];
export function cleanKids(list, old = []) {
  const out = [], used = new Set();
  for (const k of Array.isArray(list) ? list.slice(0, 16) : []) {
    const name = clean(k?.name, 30);
    if (!name) continue;
    const prev = old.find((o) => o.key === k.key);
    let key = prev ? prev.key : toSlug(name) || 'artist';
    if (!prev) { let n = 1, base = key; while (used.has(key) || STUDIO_PAGES.includes(key)) key = base + (++n); }
    used.add(key);
    const kind = KINDS.includes(k.kind) ? k.kind : 'kid';
    const grade = kind === 'kid' && GRADES.includes(k.grade) ? k.grade : '';
    const icon = ARTIST_ICONS.includes(k.icon) ? k.icon : (prev && ARTIST_ICONS.includes(prev.icon) && !('icon' in k) ? prev.icon : '');
    out.push({ key, name, kind, color: COLORS.includes(k.color) ? k.color : COLORS[out.length % COLORS.length], grade,
      schoolYear: grade ? (prev && prev.grade === grade ? prev.schoolYear : schoolYearNow()) : '', ...(icon ? { icon } : {}) });
  }
  return out;
}

// ---------- a studio's own categories, beside Artwork, A snapshot, Family Moments and A video (Jesse, 2026-11-25) ----------
// { key, name, scan }: scan = flat paper (the scan fix, like Artwork); otherwise a photo (Turn only, like a snapshot).
const BUILT_IN = ['art', 'photos', 'moments', 'video', 'house', 'cat', 'both'];
export function cleanCats(list, old = []) {
  const out = [], used = new Set();
  for (const c of Array.isArray(list) ? list.slice(0, 8) : []) {
    const name = clean(c?.name, 30);
    if (!name) continue;
    const prev = old.find((o) => o.key === c.key);
    let key = prev ? prev.key : toSlug(name).slice(0, 20) || 'things';
    if (!prev) { let n = 1, base = key; while (used.has(key) || BUILT_IN.includes(key)) key = base + (++n); }
    used.add(key);
    const icon = typeof c.icon === 'string' && /^\p{Extended_Pictographic}[\u200d\ufe0f\p{Extended_Pictographic}]{0,4}$/u.test(c.icon) ? c.icon : (prev?.icon || '');
    out.push({ key, name, scan: !!c.scan, ...(icon ? { icon } : {}) });
  }
  return out;
}

// ---------- making a studio (onboarding, from a create invite) ----------
export async function freeSlug(name, context) {
  let base = toSlug(name) || 'studio';
  if (/^\d/.test(base)) base = 's' + base;
  let slug = base, n = 1;
  const st = store('studios', context);
  while (RESERVED.has(slug) || (await st.get('s/' + slug, { type: 'json' }))) slug = base + (++n);   // a second "smith" becomes smith2
  return slug;
}
export async function makeStudio({ name, kids, cats, color, pin, by }, context) {
  const st = store('studios', context);
  const slug = await freeSlug(name, context);
  const s = { slug, name: clean(name, 40) || slug, color: COLORS.includes(color) ? color : 'sky', kids: cleanKids(kids), cats: cleanCats(cats),
    pin: pin ? { ...(await hashPassword(String(pin))), gen: randomId(9) } : null,
    view: null, invite: null, drive: false, skipped: [], created: new Date().toISOString(), by: by || null, off: false };
  await st.setJSON('s/' + slug, s);
  const idx = (await st.get('index', { type: 'json' })) || [];
  idx.push(slug); await st.setJSON('index', idx);
  await newView(s, context); await newInvite(s, context);
  return getStudio(slug, context);
}

// ---------- the View link: look only, never ends; a new one stops the old one and logs its viewers out ----------
export async function newView(s, context) {
  const links = store('links', context);
  if (s.view?.secret) await links.delete('view/' + s.view.secret);
  s.view = { secret: randomId(18), gen: randomId(9), at: new Date().toISOString() };
  await links.setJSON('view/' + s.view.secret, { studio: s.slug });
  await putStudio(s, context);
  return s.view;
}
export async function studioByView(secret, context) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(secret || '')) return null;
  const ref = await store('links', context).get('view/' + secret, { type: 'json' });
  const s = ref && (await getStudio(ref.studio, context));
  return s && !s.off && s.view?.secret === secret ? s : null;
}

// ---------- the Invite: makes a phone a capture device of the studio. Never ends; a new one stops the old link ----------
// (Devices already in keep working: a parent turns a single device off in For parents.)
export async function newInvite(s, context) {
  const links = store('links', context);
  if (s.invite?.secret) await links.delete('invite/' + s.invite.secret);
  s.invite = { secret: randomId(18), at: new Date().toISOString(), off: false };
  await links.setJSON('invite/' + s.invite.secret, { kind: 'device', studio: s.slug });
  await putStudio(s, context);
  return s.invite;
}
export async function readInvite(secret, context) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(secret || '')) return null;
  return store('links', context).get('invite/' + secret, { type: 'json' });
}
export async function writeInvite(secret, rec, context) { await store('links', context).setJSON('invite/' + secret, rec); }

// ---------- devices ----------
export async function getDevice(id, context) {
  if (!/^[A-Za-z0-9_-]{8,30}$/.test(id || '')) return null;
  const hit = cache.get('d:' + id);
  if (hit && Date.now() - hit.at < 15000) return hit.s;
  const d = await store('studios', context).get('d/' + id, { type: 'json' });
  cache.set('d:' + id, { at: Date.now(), s: d });
  return d;
}
export async function putDevice(d, context) { await store('studios', context).setJSON('d/' + d.id, d); cache.delete('d:' + d.id); }
export async function newDevice(studio, context, extra = {}) {
  const d = { id: randomId(9).replace(/[^A-Za-z0-9]/g, 'x'), studio, name: '', kid: null, off: false, created: new Date().toISOString(), ...extra };
  await putDevice(d, context);
  return d;
}
export async function devicesOf(studio, context) {
  const st = store('studios', context), out = [];
  for (const b of (await st.list({ prefix: 'd/' })).blobs) { const d = await st.get(b.key, { type: 'json' }); if (d && d.studio === studio) out.push(d); }
  return out.sort((a, b) => a.created.localeCompare(b.created));
}

// ---------- the studio PIN ----------
export async function setPin(s, pin, context) { s.pin = { ...(await hashPassword(String(pin))), gen: randomId(9) }; await putStudio(s, context); }
export async function checkPin(s, pin) { return !!s?.pin && checkPassword(String(pin || ''), s.pin); }

// What every page may know about a studio (never its secrets).
export const pubStudio = (s) => ({ slug: s.slug, name: s.name, color: s.color, main: !!s.main, href: s.main ? '/' : '/' + s.slug + '/',
  kids: (s.kids || []).map((k) => ({ key: k.key, name: k.name, kind: kindOf(k), color: k.color, grade: k.grade, schoolYear: k.schoolYear, icon: k.icon || '' })),
  cats: s.main ? [] : (s.cats || []).map((c) => ({ key: c.key, name: c.name, scan: !!c.scan, icon: c.icon || '' })),
  drive: !!s.drive, pages: s.pages || null });
