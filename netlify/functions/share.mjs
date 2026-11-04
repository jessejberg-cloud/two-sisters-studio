// Share links and passwords (parents only, after the parent PIN).
//   GET  /s/<link>                    a friend opens a share link: remember it, then ask for the friends password
//   GET  /api/links                   the list of links
//   POST /api/links                   { pages: [...], expiry: week|month|year|never } -> a new link
//   POST /api/links/<id>/off          turn a link off (anyone using it is logged out)
//   GET  /api/links/password          the friends password as text, for the "Send password" button
//   POST /api/admin/password          { level: family|friends|pin|kid-leora|kid-amaya, password } -> change it; logs out every other device on it
//   GET|POST /api/admin/kids          { kid, moments } -> the girls' tablets: password set?, Family Moments switch
import { checkLevel, kidLevel, GIRLS, setKidMoments, config as authConfig, generation, who, isParent, getLink, forgetLink, linkOpen, makeLogin, makeParent, changeLevel, isSetUp, friendsPasswordText, secret } from '../lib/auth.mjs';
import { sign, randomId, setCookie, COOKIE, DAY, PAGES, LOGIN_DAYS, PARENT_MINUTES } from '../lib/core.mjs';
import { store } from '../lib/store.mjs';

const json = (o, init = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('cache-control', 'no-store');
  return Response.json(o, { status: init.status || 200, headers });
};
const EXPIRY = { week: 7, month: 31, year: 366, never: 0 };
const LABEL = { leora: 'Leora', amaya: 'Amaya', 'pet-parents': 'Pet Parents', 'family-moments': 'Family Moments' };

export default async (req, context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);

  // ----- a friend opens a link -----
  if (parts[0] === 's') {
    const link = await getLink(parts[1], context);
    if (!linkOpen(link)) return Response.redirect(new URL('/login/?e=link', url), 303);
    const me = await who(req, context);
    if (me && (me.role === 'family' || me.link === link.id)) return Response.redirect(new URL('/', url), 303);
    const h = new Headers({ location: '/login/?kind=friend' });
    h.append('set-cookie', setCookie(COOKIE.link, await sign({ l: link.id, exp: Date.now() + DAY }, secret()), { maxAge: 86400 }));
    return new Response(null, { status: 303, headers: h });
  }

  const me = await who(req, context);
  if (me?.role !== 'family') return json({ error: 'login' }, { status: 401 });
  if (!(await isParent(req, context))) return json({ error: 'pin' });
  const links = store('links', context);

  // ----- passwords -----
  if (parts[1] === 'admin' && parts[2] === 'password' && req.method === 'POST') {
    const { level, password } = await req.json();
    const pw = String(password || '').trim();
    const kidLevels = GIRLS.map(kidLevel);
    if (!['family', 'friends', 'pin', ...kidLevels].includes(level)) return json({ error: 'level' }, { status: 400 });
    const isKid = kidLevels.includes(level);
    if (level === 'pin' ? !/^\d{4,8}$/.test(pw) : pw.length < (isKid ? 4 : 6)) return json({ ok: false, error: 'short' });
    // The login page tells logins apart by password alone, so the family and tablet passwords must all differ.
    if (level === 'family' || isKid) {
      for (const other of ['family', ...kidLevels]) {
        if (other !== level && (await checkLevel(other, pw, context))) return json({ ok: false, error: 'same' });
      }
    }
    await changeLevel(level, pw, context);
    // This device stays in: give it fresh cookies on the new password. Every other device is logged out.
    const h = new Headers();
    if (level === 'family') h.append('set-cookie', setCookie(COOKIE.login, await makeLogin('family', context), { maxAge: LOGIN_DAYS * 86400 }));
    if (level === 'pin' || level === 'family') h.append('set-cookie', setCookie(COOKIE.parent, await makeParent(context, PARENT_MINUTES), { maxAge: PARENT_MINUTES * 60 }));
    return json({ ok: true }, { headers: h });
  }

  // ----- the girls' tablets: which have a password, and the Family Moments switch -----
  if (parts[1] === 'admin' && parts[2] === 'kids') {
    if (req.method === 'POST') {
      const b = await req.json();
      if (!GIRLS.includes(b.kid)) return json({ error: 'kid' }, { status: 400 });
      await setKidMoments(b.kid, !!b.moments, context);
    }
    const cfg = await authConfig(context, true), out = {};
    for (const k of GIRLS) out[k] = { moments: !!cfg.kidPerms?.[k]?.moments, password: !!(await generation(kidLevel(k), context)) };
    return json({ kids: out });
  }

  if (parts[1] !== 'links') return json({ error: 'path' }, { status: 404 });

  if (req.method === 'GET' && parts[2] === 'password') {
    const pw = await friendsPasswordText(context);
    return json(pw ? { password: pw } : { error: 'friends-not-set' });
  }

  if (req.method === 'GET' && !parts[2]) {
    const out = [];
    for (const b of (await links.list({ prefix: 'link/' })).blobs) {
      const l = await links.get(b.key, { type: 'json' });
      if (l) out.push({ ...l, open: linkOpen(l), url: url.origin + '/s/' + l.id, names: l.pages.map((p) => LABEL[p]) });
    }
    out.sort((a, b) => b.created.localeCompare(a.created));
    return json({ links: out, friendsPassword: await isSetUp('friends', context) });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, { status: 405 });

  if (!parts[2]) {
    const b = await req.json();
    const pages = (Array.isArray(b.pages) ? b.pages : []).filter((p) => PAGES.includes(p));
    if (!pages.length) return json({ ok: false, error: 'pages' });
    if (!(b.expiry in EXPIRY)) return json({ ok: false, error: 'expiry' });
    if (!(await isSetUp('friends', context))) return json({ ok: false, error: 'friends-not-set' });
    const days = EXPIRY[b.expiry];
    const link = { id: randomId(12), pages: [...new Set(pages)], expiry: b.expiry, expires: days ? Date.now() + days * DAY : null,
      created: new Date().toISOString(), off: false, note: String(b.note || '').slice(0, 60) };
    await links.setJSON('link/' + link.id, link);
    return json({ ok: true, link: { ...link, open: true, url: url.origin + '/s/' + link.id, names: link.pages.map((p) => LABEL[p]) } });
  }

  if (parts[3] === 'off') {
    const link = await links.get('link/' + parts[2], { type: 'json' });
    if (!link) return json({ error: 'unknown' }, { status: 404 });
    link.off = new Date().toISOString();
    await links.setJSON('link/' + link.id, link);
    forgetLink(link.id);
    return json({ ok: true });
  }
  return json({ error: 'path' }, { status: 404 });
};

export const config = { path: ['/s/*', '/api/links', '/api/links/*', '/api/admin/password', '/api/admin/kids'] };
