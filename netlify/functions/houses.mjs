// Households (Jesse, 2026-11-25): Grandma's, an aunt's... each with its own invite link, no password.
//   GET  /i/<invite>                  someone taps their invite: this phone is in for a year, as that household,
//                                     and lands on the app (Add photos)
//   GET  /api/houses                  parent: the households and their invite links
//   POST /api/houses                  parent: { name, pages: [...] } -> a new household and its invite link
//   POST /api/houses/<id>             parent: { name?, pages?, off?: true|false, newLink?: true }
//                                     off logs their phones out (on lets them back in); newLink makes a new link,
//                                     the old one stops working and their phones are logged out
// What a household may do lives in lib/auth.mjs (houseMayOpen, housePages) and the pieces and videos functions.
import { who, isParent, forgetHouse, houseByInvite, housePages, makeHouseLogin } from '../lib/auth.mjs';
import { randomId, setCookie, COOKIE, PAGES, LOGIN_DAYS } from '../lib/core.mjs';
import { store } from '../lib/store.mjs';

const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const LABEL = { leora: 'Leora', amaya: 'Amaya', 'pet-parents': 'Pet Parents', 'family-moments': 'Family Moments' };
const cleanName = (s) => String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const cleanPages = (xs) => [...new Set((Array.isArray(xs) ? xs : []).filter((p) => PAGES.includes(p)))];
const pub = (h, origin) => ({ id: h.id, name: h.name, pages: housePages(h).filter((p) => PAGES.includes(p)), names: housePages(h).filter((p) => PAGES.includes(p)).map((p) => LABEL[p]),
  off: !!h.off, created: h.created, url: origin + '/i/' + h.invite });

// Invite text for the phone's Share list.
export const inviteText = (name) => `${name ? name + ', tap' : 'Tap'} this link to see the girls' pictures and add your own photos. No password needed.`;

export default async (req, context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] === 'i') {
    const house = await houseByInvite(parts[1], context);
    if (!house) return Response.redirect(new URL('/login/?e=invite', url), 303);
    const me = await who(req, context);
    // A family phone stays a family phone (Jesse testing his own link must not log himself out).
    if (me?.role === 'family') return Response.redirect(new URL('/households/?mine=1', url), 303);
    const h = new Headers({ location: '/upload/?welcome=1#i=' + house.invite, 'cache-control': 'no-store' });
    h.append('set-cookie', setCookie(COOKIE.login, await makeHouseLogin(house), { maxAge: LOGIN_DAYS * 86400 }));
    h.append('set-cookie', setCookie(COOKIE.view, [...housePages(house), 'upload', 'house'].join(','), { maxAge: LOGIN_DAYS * 86400, httpOnly: false }));
    h.append('set-cookie', setCookie(COOKIE.parent, '', { maxAge: 0 }));
    return new Response(null, { status: 303, headers: h });
  }

  const me = await who(req, context);
  if (me?.role !== 'family') return json({ error: 'login' }, 401);
  if (!(await isParent(req, context))) return json({ error: 'pin' });
  const s = store('links', context);

  if (req.method === 'GET' && parts.length === 2) {
    const out = [];
    for (const b of (await s.list({ prefix: 'house/' })).blobs) {
      const h = await s.get(b.key, { type: 'json' });
      if (h) out.push(pub(h, url.origin));
    }
    out.sort((a, b) => a.created.localeCompare(b.created));
    return json({ houses: out });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const b = await req.json().catch(() => ({}));

  if (parts.length === 2) {
    const name = cleanName(b.name);
    if (!name) return json({ ok: false, error: 'name' });
    const h = { id: randomId(6).toLowerCase().replace(/[^a-z0-9]/g, 'x'), name, pages: cleanPages(b.pages), invite: randomId(18), gen: randomId(9),
      off: false, created: new Date().toISOString() };
    await s.setJSON('house/' + h.id, h);
    await s.setJSON('invite/' + h.invite, { id: h.id });
    return json({ ok: true, house: pub(h, url.origin), text: inviteText(name) });
  }

  const h = /^[a-z0-9]{6,12}$/.test(parts[2] || '') ? await s.get('house/' + parts[2], { type: 'json' }) : null;
  if (!h) return json({ error: 'unknown' }, 404);
  if (typeof b.name === 'string' && cleanName(b.name)) h.name = cleanName(b.name);
  if (Array.isArray(b.pages)) h.pages = cleanPages(b.pages);
  if (typeof b.off === 'boolean') h.off = b.off ? new Date().toISOString() : false;
  if (b.newLink) {
    await s.delete('invite/' + h.invite);
    h.invite = randomId(18); h.gen = randomId(9);
    await s.setJSON('invite/' + h.invite, { id: h.id });
  }
  await s.setJSON('house/' + h.id, h);
  forgetHouse(h.id);
  return json({ ok: true, house: pub(h, url.origin), text: inviteText(h.name) });
};

export const config = { path: ['/i/*', '/api/houses', '/api/houses/*'] };
