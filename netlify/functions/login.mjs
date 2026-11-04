// POST /api/login  (the login page's form)   fields: password, next, kind (family | friend)
// POST /api/logout
// POST /api/parent  { pin }  -> parent cookie for 15 minutes (needs a family login first)
import { checkLevel, makeLogin, makeParent, who, getLink, linkOpen, kidLevel, GIRLS } from '../lib/auth.mjs';
import { setCookie, cookies, verify, sha256, COOKIE, LOGIN_DAYS, PARENT_MINUTES } from '../lib/core.mjs';
import { secret } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';

const MAX_TRIES = 8, LOCK_MINUTES = 15;

async function tooMany(req, context, failed) {
  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const key = 'ip/' + (await sha256('tss-ip:' + ip)).slice(0, 20);
  const s = store('attempts', context);
  const rec = (await s.get(key, { type: 'json' })) || { n: 0, until: 0 };
  if (rec.until > Date.now()) return true;
  if (failed === undefined) return false;
  if (failed) {
    rec.n += 1;
    if (rec.n >= MAX_TRIES) { rec.until = Date.now() + LOCK_MINUTES * 60000; rec.n = 0; }
    await s.setJSON(key, rec);
  } else if (rec.n) await s.delete(key);
  return false;
}

const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');
const back = (url, q) => Response.redirect(new URL('/login/?' + new URLSearchParams(q), url), 303);

async function readForm(req) {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return req.json();
  return Object.fromEntries((await req.formData()).entries());
}

export default async (req, context) => {
  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });

  if (action === 'logout') {
    const h = new Headers({ location: '/login/' });
    for (const c of [COOKIE.login, COOKIE.parent, COOKIE.view, COOKIE.link]) h.append('set-cookie', setCookie(c, '', { maxAge: 0 }));
    return new Response(null, { status: 303, headers: h });
  }

  const f = await readForm(req);

  if (action === 'parent') {
    const me = await who(req, context);
    if (me?.role !== 'family') return Response.json({ ok: false, error: 'login' }, { status: 401 });
    if (await tooMany(req, context)) return Response.json({ ok: false, error: 'wait' });
    const ok = await checkLevel('pin', String(f.pin || ''), context);
    await tooMany(req, context, !ok);
    if (!ok) return Response.json({ ok: false, error: 'pin' });
    return Response.json({ ok: true }, { headers: { 'set-cookie': setCookie(COOKIE.parent, await makeParent(context, PARENT_MINUTES), { maxAge: PARENT_MINUTES * 60 }) } });
  }

  // login
  const next = safeNext(f.next && f.next !== '/' ? f.next : cookies(req)[COOKIE.next]);
  if (await tooMany(req, context)) return back(url, { e: 'wait', next });
  const pw = String(f.password || '');
  const linkTok = cookies(req)[COOKIE.link];

  if (f.kind === 'friend' && linkTok) {
    const lp = await verify(linkTok, secret());
    const link = lp && (await getLink(lp.l, context));
    if (!linkOpen(link)) return back(url, { e: 'link' });
    const ok = await checkLevel('friends', pw, context);
    await tooMany(req, context, !ok);
    if (!ok) return back(url, { e: 'pw', kind: 'friend' });
    const h = new Headers({ location: '/' });
    h.append('set-cookie', setCookie(COOKIE.login, await makeLogin('friend', context, { l: link.id }), { maxAge: Math.max(60, Math.floor(((link.expires || Date.now() + LOGIN_DAYS * 86400000) - Date.now()) / 1000)) }));
    h.append('set-cookie', setCookie(COOKIE.view, link.pages.join(','), { maxAge: LOGIN_DAYS * 86400, httpOnly: false }));
    h.append('set-cookie', setCookie(COOKIE.link, '', { maxAge: 0 }));
    return new Response(null, { status: 303, headers: h });
  }

  const ok = await checkLevel('family', pw, context);
  if (!ok) {
    // A girl's tablet password: she gets her own login (her pages, Add art; photos wait for a parent's OK).
    for (const k of GIRLS) {
      if (!(await checkLevel(kidLevel(k), pw, context))) continue;
      await tooMany(req, context, false);
      const kh = new Headers({ location: next === '/' ? '/upload/' : next });
      kh.append('set-cookie', setCookie(COOKIE.login, await makeLogin('kid', context, { k }), { maxAge: LOGIN_DAYS * 86400 }));
      kh.append('set-cookie', setCookie(COOKIE.next, '', { maxAge: 0 }));
      return new Response(null, { status: 303, headers: kh });
    }
  }
  await tooMany(req, context, !ok);
  if (!ok) return back(url, { e: 'pw', next });
  const h = new Headers({ location: next });
  h.append('set-cookie', setCookie(COOKIE.login, await makeLogin('family', context), { maxAge: LOGIN_DAYS * 86400 }));
  h.append('set-cookie', setCookie(COOKIE.view, '', { maxAge: 0, httpOnly: false }));
  h.append('set-cookie', setCookie(COOKIE.next, '', { maxAge: 0 }));
  return new Response(null, { status: 303, headers: h });
};

export const config = { path: ['/api/login', '/api/logout', '/api/parent'] };
