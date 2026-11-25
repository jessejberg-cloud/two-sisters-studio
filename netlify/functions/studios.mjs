// Studios (build spec, 2026-11-25). One site, many studios; Jesse's studio at the root, the others at /<slug>/.
//   GET  /i/<invite>                    an invite: a household invite (old, still works), a capture invite of a studio
//                                       (this phone can add), or Jesse's invite to make a new studio (opens onboarding)
//   GET  /v/<view link>                 a studio's View link: this phone can look (no adding), never ends
//   GET  /api/studio/<slug>             what the pages and the app need: the studio, and what this phone may do there
//   GET  /api/studios/menu              the family menu: every studio's View link
//   POST /api/studios/create            onboarding: { name, kids: [{ name, kind, grade }], cats: [{ name, scan }], pin, color }
//                                       (needs Jesse's invite on this phone; kids are the artists: a kid, a grown-up or a pet)
//   POST /api/studio/<slug>/device      this phone picks its name once: { name, kid? } (a kid's name turns on kid mode)
//   POST /api/studio/<slug>/cats        a grown-up phone adds a category from the app: { name, scan, icon }
//   POST /api/studio/<slug>/pin         { pin } -> opens For parents for this visit (the studio PIN, or Jesse's owner PIN)
//   GET  /api/studio/<slug>/parent      For parents: links, kids, devices, Drive, skipped onboarding items
//   POST /api/studio/<slug>/parent      { do: view-reset | invite-reset | kids | cats | look | pin | device | skip | unskip, ... }
//   GET  /api/owner                     Jesse only (owner PIN): every studio, its use, and the studio invites
//   POST /api/owner                     { do: invite, name } | { do: invite-off, id, off } | { do: remove, slug }
import { who, isParent, isOwner, addKey, mayView, deviceKey, checkStudioPin, checkOwner, makeParentFor, readKeys, validKeys } from '../lib/auth.mjs';
import { setCookie, randomId, cookies, verify, sign, sha256, COOKIE, PARENT_MINUTES } from '../lib/core.mjs';
import { secret } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { MAIN, COLORS, GRADES, getStudio, putStudio, listStudios, makeStudio, newView, newInvite, studioByView, readInvite, writeInvite,
  getDevice, putDevice, newDevice, devicesOf, setPin, pubStudio, cleanKids, cleanCats, kindOf, forget } from '../lib/studios.mjs';
import { houseInvite } from './houses.mjs';
import { googleInfo } from '../lib/drive.mjs';

const json = (o, status = 200, headers) => {
  const h = new Headers(headers || {}); h.set('cache-control', 'no-store');
  return Response.json(o, { status, headers: h });
};
const KEY_DAYS = 400;   // the longest a browser keeps a cookie; the front door renews it every week, so it never ends
const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// The keys cookie, plus a small readable copy for the pages (which studios this phone can look at or add to).
export function keyCookies(h, token, keys) {
  h.append('set-cookie', setCookie(COOKIE.keys, token, { maxAge: KEY_DAYS * 86400 }));
  h.append('set-cookie', setCookie(COOKIE.hint, hintOf(keys), { maxAge: KEY_DAYS * 86400, httpOnly: false }));
}
export const hintOf = (keys) => keys.map((k) => k.s + ':' + k.t + (k.kid ? ':kid' : '')).join(',');
async function keysAfter(req, key, context) {
  const token = await addKey(req, key);
  const keys = await validKeys((await verify(token, secret())).k, context);
  return { token, keys };
}

async function tooMany(req, context, failed) {
  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const key = 'pin/' + (await sha256('tss-ip:' + ip)).slice(0, 20);
  const s = store('attempts', context);
  const rec = (await s.get(key, { type: 'json' })) || { n: 0, until: 0 };
  if (rec.until > Date.now()) return true;
  if (failed === undefined) return false;
  if (failed) { rec.n += 1; if (rec.n >= 8) { rec.until = Date.now() + 15 * 60000; rec.n = 0; } await s.setJSON(key, rec); }
  else if (rec.n) await s.delete(key);
  return false;
}
// Five wrong PINs in a row on a studio: the heads-up dot on its For parents.
async function pinMiss(studio, ok, context) {
  const s = store('studios', context), k = 'miss/' + studio;
  if (ok) { await s.delete(k); return; }
  const n = ((await s.get(k, { type: 'json' }))?.n || 0) + 1;
  await s.setJSON(k, { n, at: new Date().toISOString() });
  if (n >= 5) await heads(studio, 'pin', { n }, context);
}
// The heads-up dot (build spec): one dot on For parents; tap shows what happened and the fix beside it.
export async function heads(studio, kind, data, context) {
  const s = store('studios', context), k = 'heads/' + studio;
  const list = (await s.get(k, { type: 'json' })) || [];
  const old = list.find((x) => x.kind === kind && !x.seen && (!data?.ref || x.ref === data.ref));
  if (old) { Object.assign(old, data, { at: new Date().toISOString() }); }
  else list.unshift({ id: randomId(6), kind, ...data, at: new Date().toISOString(), seen: false });
  await s.setJSON(k, list.slice(0, 30));
}

const origin = (url) => url.origin;
const inviteUrl = (url, s) => s.invite?.secret ? origin(url) + '/i/' + s.invite.secret : null;
const viewUrl = (url, s) => s.view?.secret ? origin(url) + '/v/' + s.view.secret : null;

export default async (req, context) => {
  try { return await handle(req, context); }
  catch (e) { console.error('studios failed:', e.message); return json({ error: 'server', message: String(e.message || e).slice(0, 200) }, 500); }
};

async function handle(req, context) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);

  // ----- an invite -----
  if (parts[0] === 'i') {
    const secretPart = parts[1] || '';
    const rec = await readInvite(secretPart, context);
    if (!rec) return Response.redirect(new URL('/login/?e=invite', url), 303);
    if (rec.id) return houseInvite(req, context, secretPart);   // a household invite (2026-11-25)
    if (rec.off) return Response.redirect(new URL('/login/?e=invite', url), 303);
    if (rec.kind === 'create') {
      // Jesse's invite to make a studio: onboarding. The phone keeps the invite for an hour while it sets up.
      const h = new Headers({ location: '/start/', 'cache-control': 'no-store' });
      h.append('set-cookie', setCookie(COOKIE.create, await sign({ c: secretPart, exp: Date.now() + 3 * 3600000 }, secret()), { maxAge: 3 * 3600 }));
      return new Response(null, { status: 303, headers: h });
    }
    const s = await getStudio(rec.studio, context);
    if (!s || s.off || s.removed || s.invite?.secret !== secretPart || s.invite?.off) return Response.redirect(new URL('/login/?e=invite', url), 303);
    // Already a device of this studio: just open the app. Otherwise this phone becomes one (it picks its name in the app).
    const me = await who(req, context);
    const have = deviceKey(me, s.slug);
    let d = have && (await getDevice(have.d, context));
    if (!d) d = await newDevice(s.slug, context, { via: 'invite' });
    const { token, keys } = await keysAfter(req, { t: 'd', s: s.slug, d: d.id }, context);
    const h = new Headers({ location: '/upload/?hello=1#i=' + secretPart, 'cache-control': 'no-store' });
    keyCookies(h, token, keys);
    return new Response(null, { status: 303, headers: h });
  }

  // ----- a View link -----
  if (parts[0] === 'v') {
    const s = await studioByView(parts[1], context);
    if (!s) return Response.redirect(new URL('/login/?e=link', url), 303);
    const me = await who(req, context);
    const h = new Headers({ location: (s.main ? '/' : '/' + s.slug + '/') + '?hello=1', 'cache-control': 'no-store' });
    // A phone that can already add to this studio keeps that (adding includes looking).
    if (!deviceKey(me, s.slug)) { const { token, keys } = await keysAfter(req, { t: 'v', s: s.slug, g: s.view.gen }, context); keyCookies(h, token, keys); }
    return new Response(null, { status: 303, headers: h });
  }

  const me = await who(req, context);

  // ----- the family menu -----
  if (parts[1] === 'studios' && parts[2] === 'menu') {
    if (!me || me.role === 'friend' || me.role === 'kid') return json({ studios: [] });
    const out = [];
    for (const s of await listStudios(context)) {
      if (s.off) continue;
      if (!s.view) await newView(s, context);
      out.push({ slug: s.slug, name: s.name, color: s.color, href: s.main ? '/' : '/' + s.slug + '/', view: viewUrl(url, s),
        mine: mayView(me, s.slug) });
    }
    return json({ studios: out });
  }

  // ----- onboarding: make the studio -----
  if (parts[1] === 'studios' && parts[2] === 'create' && req.method === 'POST') {
    const c = await verify(cookies(req)[COOKIE.create], secret());
    const rec = c && (await readInvite(c.c, context));
    if (!rec || rec.kind !== 'create' || rec.off) return json({ ok: false, error: 'invite' });
    const b = await req.json().catch(() => ({}));
    const pin = String(b.pin || '');
    if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: 'pin' });
    const s = await makeStudio({ name: clean(b.name, 40) || rec.name || 'Family', kids: b.kids, cats: b.cats, color: b.color, pin, by: c.c }, context);
    // Jesse's invite becomes the studio's own Invite: the same link now adds this household's phones.
    const links = store('links', context);
    await links.delete('invite/' + s.invite.secret);
    s.invite = { secret: c.c, at: new Date().toISOString(), off: false };
    s.skipped = Array.isArray(b.skipped) ? b.skipped.filter((x) => ['kids', 'name', 'look'].includes(x)) : [];
    if (!s.kids.length && !s.skipped.includes('kids')) s.skipped.push('kids');
    await putStudio(s, context);
    await writeInvite(c.c, { kind: 'device', studio: s.slug, made: rec.created, name: rec.name }, context);
    const d = await newDevice(s.slug, context, { via: 'setup', parent: true });
    const { token, keys } = await keysAfter(req, { t: 'd', s: s.slug, d: d.id }, context);
    const h = new Headers();
    keyCookies(h, token, keys);
    h.append('set-cookie', setCookie(COOKIE.parent, await makeParentFor(s.slug, context, 60), { maxAge: 3600 }));   // setup finishes Drive and links
    h.append('set-cookie', setCookie(COOKIE.create, '', { maxAge: 0 }));
    return json({ ok: true, studio: pubStudio(s), invite: inviteUrl(url, s), view: viewUrl(url, s) }, 200, h);
  }
  if (parts[1] === 'studios' && parts[2] === 'create' && req.method === 'GET') {
    const c = await verify(cookies(req)[COOKIE.create], secret());
    const rec = c && (await readInvite(c.c, context));
    return json({ ok: !!rec && rec.kind === 'create' && !rec.off, name: rec?.name || '', colors: COLORS, grades: GRADES });
  }

  // ----- Jesse only -----
  if (parts[1] === 'owner') {
    if (!(await isOwner(req, context))) return json({ error: 'pin' });
    const links = store('links', context), st = store('studios', context);
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b.do === 'invite') {
        const name = clean(b.name, 40);
        const sec = randomId(18);
        await links.setJSON('invite/' + sec, { kind: 'create', name, created: new Date().toISOString(), off: false });
        const list = (await st.get('creates', { type: 'json' })) || [];
        list.unshift({ id: sec.slice(0, 8), secret: sec, name, created: new Date().toISOString() });
        await st.setJSON('creates', list);
      } else if (b.do === 'invite-off') {
        const list = (await st.get('creates', { type: 'json' })) || [];
        const it = list.find((x) => x.id === b.id);
        if (it) { const rec = await readInvite(it.secret, context); if (rec && rec.kind === 'create') { rec.off = !!b.off; await writeInvite(it.secret, rec, context); } }
      } else if (b.do === 'remove') {
        const s = await getStudio(b.slug, context);
        if (!s || s.main) return json({ ok: false, error: 'studio' });
        s.removed = new Date().toISOString(); s.off = true; await putStudio(s, context);   // nothing is deleted: its photos and Drive stay
      } else if (b.do === 'restore') {
        const s = await getStudio(b.slug, context);
        if (s && !s.main) { s.removed = null; s.off = false; await putStudio(s, context); }
      }
    }
    const creates = [];
    for (const it of (await st.get('creates', { type: 'json' })) || []) {
      const rec = await readInvite(it.secret, context);
      creates.push({ id: it.id, name: it.name, created: it.created, url: origin(url) + '/i/' + it.secret, off: !!rec?.off,
        used: rec?.kind === 'device' ? rec.studio : null });
    }
    const usage = (await st.get('usage', { type: 'json' })) || {};
    const ids = (await st.get('index', { type: 'json' })) || [];
    const studios = [];
    for (const slug of [MAIN, ...ids]) {
      const s = await getStudio(slug, context);
      if (!s) continue;
      studios.push({ ...pubStudio(s), removed: s.removed || null, bytes: usage[slug]?.bytes || 0, pieces: usage[slug]?.pieces || 0 });
    }
    return json({ ok: true, studios, creates });
  }

  // ----- one studio -----
  if (parts[1] !== 'studio') return json({ error: 'path' }, 404);
  const s = await getStudio(parts[2] || '', context);
  if (!s || s.removed) return json({ error: 'studio' }, 404);
  const fam = me?.role === 'family' && s.main;
  const looks = fam || mayView(me, s.slug);

  if (!parts[3] && req.method === 'GET') {
    if (!looks) return json({ error: 'login' }, 401);
    const dk = deviceKey(me, s.slug);
    const dev = dk && (await getDevice(dk.d, context));
    return json({ studio: pubStudio(s), me: { add: fam || !!dk || (s.main && ['kid', 'house'].includes(me.role)), device: dev ? { name: dev.name, kid: dev.kid } : null,
      named: fam || !dk || !!dev?.name, role: me.role } });
  }

  if (parts[3] === 'device' && req.method === 'POST') {
    const dk = deviceKey(me, s.slug);
    const d = dk && (await getDevice(dk.d, context));
    if (!d) return json({ ok: false, error: 'device' }, 401);
    const b = await req.json().catch(() => ({}));
    const kid = (s.kids || []).find((k) => k.key === b.kid && kindOf(k) !== 'pet');
    d.name = clean(kid ? kid.name : b.name, 30) || d.name; d.kid = kid && kindOf(kid) === 'kid' ? kid.key : null;   // a grown-up artist: just the name d.named = new Date().toISOString();
    await putDevice(d, context);
    const { token, keys } = await keysAfter(req, { t: 'd', s: s.slug, d: d.id }, context);
    const h = new Headers(); keyCookies(h, token, keys);
    return json({ ok: true, device: { name: d.name, kid: d.kid } }, 200, h);
  }

  // A grown-up phone of this studio adds a category from the app ("＋ Something else"; Jesse, 2026-11-25). Never a kid-mode phone.
  if (parts[3] === 'cats' && req.method === 'POST') {
    const dk = deviceKey(me, s.slug);
    const d = dk && (await getDevice(dk.d, context));
    const parent = await isParent(req, context, s.slug);
    if (s.main || !((d && !d.off && !d.kid) || parent)) return json({ ok: false, error: 'device' }, 401);
    const b = await req.json().catch(() => ({}));
    const old = s.cats || [];
    if (old.length >= 8) return json({ ok: false, error: 'full' });
    const same = old.find((c) => c.name.toLowerCase() === clean(b.name, 30).toLowerCase());
    if (!same) { s.cats = cleanCats([...old, { name: b.name, scan: b.scan, icon: b.icon }], old); await putStudio(s, context); }
    const fresh = await getStudio(s.slug, context);
    return json({ ok: true, studio: pubStudio(fresh), cat: pubStudio(fresh).cats.find((c) => c.name.toLowerCase() === clean(b.name, 30).toLowerCase()) || null });
  }

  if (parts[3] === 'pin' && req.method === 'POST') {
    if (await tooMany(req, context)) return json({ ok: false, error: 'wait' });
    const b = await req.json().catch(() => ({}));
    const pin = String(b.pin || '');
    let as = null;
    // Jesse's studio: his PIN is the owner PIN until OWNER_PIN is set, so check the owner first there.
    if (s.main && (await checkOwner(pin, context))) as = '*';
    else if (await checkStudioPin(s.slug, pin, context)) as = s.slug;
    else if (await checkOwner(pin, context)) as = '*';
    await tooMany(req, context, !as);
    await pinMiss(s.slug, !!as, context);
    if (!as) return json({ ok: false, error: 'pin' });
    if (as !== '*' && s.main && !(fam || deviceKey(me, MAIN))) return json({ ok: false, error: 'login' });
    return json({ ok: true, owner: as === '*' }, 200, { 'set-cookie': setCookie(COOKIE.parent, await makeParentFor(as, context, PARENT_MINUTES), { maxAge: PARENT_MINUTES * 60 }) });
  }

  if (parts[3] === 'parent') {
    if (!(await isParent(req, context, s.slug))) return json({ error: 'pin' });
    const st = store('studios', context);
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      if (b.do === 'view-reset') await newView(s, context);
      else if (b.do === 'invite-reset') await newInvite(s, context);
      else if (b.do === 'invite-off') { s.invite = { ...(s.invite || {}), off: !!b.off }; await putStudio(s, context); }
      else if (b.do === 'kids' && !s.main) { s.kids = cleanKids(b.kids, s.kids); s.skipped = (s.skipped || []).filter((x) => x !== 'kids' || !s.kids.length); await putStudio(s, context); }
      else if (b.do === 'cats' && !s.main) { s.cats = cleanCats(b.cats, s.cats || []); await putStudio(s, context); }
      else if (b.do === 'look') {
        if (COLORS.includes(b.color)) s.color = b.color;
        if (Array.isArray(b.pages)) s.pages = b.pages.filter((p) => typeof p === 'string').slice(0, 20);
        s.skipped = (s.skipped || []).filter((x) => x !== 'look'); await putStudio(s, context);
      } else if (b.do === 'name' && !s.main) { const n = clean(b.name, 40); if (n) { s.name = n; s.skipped = (s.skipped || []).filter((x) => x !== 'name'); await putStudio(s, context); } }
      else if (b.do === 'pin' && !s.main) {
        if (!/^\d{4}$/.test(String(b.pin || ''))) return json({ ok: false, error: 'pin' });
        await setPin(s, b.pin, context);
        // This phone stays in For parents on the new PIN (unless it came in with Jesse's owner PIN, which still works).
        if (!(await isOwner(req, context))) return json({ ok: true }, 200, { 'set-cookie': setCookie(COOKIE.parent, await makeParentFor(s.slug, context, PARENT_MINUTES), { maxAge: PARENT_MINUTES * 60 }) });
        return json({ ok: true });
      }
      else if (b.do === 'device') {
        const d = await getDevice(b.id, context);
        if (!d || d.studio !== s.slug) return json({ ok: false, error: 'device' });
        if (typeof b.name === 'string' && clean(b.name, 30)) d.name = clean(b.name, 30);
        if ('kid' in b) d.kid = (s.kids || []).some((k) => k.key === b.kid && kindOf(k) === 'kid') ? b.kid : null;
        if (typeof b.off === 'boolean') d.off = b.off ? new Date().toISOString() : false;
        await putDevice(d, context);
      } else if (b.do === 'skip' && typeof b.item === 'string') { s.skipped = [...new Set([...(s.skipped || []), b.item.slice(0, 20)])]; await putStudio(s, context); }
      else if (b.do === 'unskip') { s.skipped = (s.skipped || []).filter((x) => x !== b.item); await putStudio(s, context); }
      else if (b.do === 'heads-seen') {
        const list = (await st.get('heads/' + s.slug, { type: 'json' })) || [];
        list.forEach((x) => { if (!b.id || x.id === b.id) x.seen = true; });
        await st.setJSON('heads/' + s.slug, list);
      }
      forget(s.slug);
    }
    const fresh = await getStudio(s.slug, context);
    if (!fresh.view) await newView(fresh, context);
    if (!fresh.invite) await newInvite(fresh, context);
    const devices = (await devicesOf(fresh.slug, context)).map((d) => ({ id: d.id, name: d.name, kid: d.kid, off: !!d.off, created: d.created }));
    const heads_ = ((await st.get('heads/' + fresh.slug, { type: 'json' })) || []).filter((x) => !x.seen);
    let drive = { connected: false };
    try { drive = await googleInfo(context, fresh.slug); } catch {}
    return json({ ok: true, owner: await isOwner(req, context), studio: pubStudio(fresh), invite: inviteUrl(url, fresh), inviteOff: !!fresh.invite?.off,
      view: viewUrl(url, fresh), devices, skipped: fresh.skipped || [], drive, heads: heads_, colors: COLORS, grades: GRADES });
  }
  return json({ error: 'path' }, 404);
}

export const config = { path: ['/i/*', '/v/*', '/api/studio/*', '/api/studios/*', '/api/owner'] };
