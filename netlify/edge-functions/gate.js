// The front door. Runs before every page and file.
// Old logins (Jesse's studio): family logins see everything, friends see only the pages on their share link, the girls'
// tablets and households see their pages. Studio keys (build spec, 2026-11-25): a View link lets a phone look at that
// studio, an Invite lets it add (the app). Everyone else goes to the login page, which takes a pasted link.
import { who, friendMayOpen, kidMayOpen, houseMayOpen, makeLogin, makeHouseLogin, getHouse, secret, isSetUp, mayView, readKeys } from '../lib/auth.mjs';
import { setCookie, cookies, verify, sign, COOKIE, DAY, LOGIN_DAYS } from '../lib/core.mjs';
import { getStudio, MAIN } from '../lib/studios.mjs';
import site from '../../content/site.json' with { type: 'json' };

const OPEN = [/^\/login\/?$/, /^\/api\/login$/, /^\/s\/[A-Za-z0-9_-]+(\/.*)?$/, /^\/i\/[A-Za-z0-9_-]+$/, /^\/v\/[A-Za-z0-9_-]+$/, /^\/styles\.css$/, /^\/main\.js$/,
  /^\/studio\.js$/, /^\/start\.js$/, /^\/icons\.js$/, /^\/start\/?$/, /^\/api\/studios\/create$/, /^\/assets\/fonts\//, /^\/assets\/brand\//, /^\/assets\/drawings\//, /^\/robots\.txt$/, /^\/favicon\.ico$/,
  /^\/shared\/?$/, /^\/shared\.js$/, /^\/api\/shared\/[A-Za-z0-9_-]+(\/.*)?$/, /^\/api\/google\/callback$/, /^\/privacy\/?$/];
// Jesse's studio's own pages, at the root.
const ROOT = new Set(['', ...site.kids.map((k) => k.key), 'pet-parents', 'family-moments', 'households', 'parent', 'moments']);
const ANY = new Set(['api', 'img', 'login', 'logout', 'i', 'v', 's', 'start', 'styles.css', 'main.js', 'studio.js', 'start.js', 'icons.js', 'parent.js', 'robots.txt', 'favicon.ico', '404.html', 'privacy']);

// What studio keys open (a View link looks; an Invite also opens the app).
async function keysOpen(me, pathname, context) {
  const keys = me.keys || [];
  if (!keys.length) return false;
  const parts = pathname.split('/'), first = parts[1] || '';
  if (ANY.has(first)) return true;
  if (first === 'upload') return keys.some((k) => k.t === 'd');
  if (first === 'assets') {
    const kind = parts[2];
    if (['art', 'moments', 'audio', 'app'].includes(kind)) return mayView(me, MAIN);
    return true;
  }
  if (ROOT.has(first)) return mayView(me, MAIN);
  if (keys.some((k) => k.s === first)) return true;
  return !(await getStudio(first, context));   // not a studio: the page-not-found page
}

export default async (req, context) => {
  const url = new URL(req.url);
  if (OPEN.some((re) => re.test(url.pathname))) return context.next();
  // Until the secret and the family password are both in Netlify, this door stays open and Netlify's built-in
  // password keeps guarding the site, exactly as before. Turn the built-in password off only after logging in works.
  try { secret(); } catch { return context.next(); }
  if (!(await isSetUp('family', context))) return context.next();

  const me = await who(req, context);
  const html = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
  if (!me) {
    if (html) {
      // The page they asked for rides along twice: in the address and in a short cookie, because some kid
      // browsers (Amazon Kids) drop the address part. Login sends them back to it either way.
      const want = url.pathname + url.search;
      const h = new Headers({ location: new URL('/login/?next=' + encodeURIComponent(want), url).toString(), 'cache-control': 'no-store' });
      h.append('set-cookie', setCookie(COOKIE.next, want, { maxAge: 600 }));
      return new Response(null, { status: 302, headers: h });
    }
    return new Response('Please log in.', { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const first = url.pathname.split('/')[1] || '';
  const viaKeys = await keysOpen(me, url.pathname, context);
  // A phone with only studio keys: the root opens its own studio.
  if (me.role === 'guest' && !viaKeys) {
    const home = me.keys[0]?.s === MAIN ? '/' : '/' + me.keys[0].s + '/';
    if (!html || url.pathname === home) return new Response('Not here.', { status: 403, headers: { 'cache-control': 'no-store' } });
    return Response.redirect(new URL(home, url), 302);
  }
  if (!viaKeys) {
    if (me.role === 'friend' && !friendMayOpen(me.pages, url.pathname)) return Response.redirect(new URL('/', url), 302);
    if (me.role === 'kid' && !kidMayOpen(me, url.pathname)) return Response.redirect(new URL('/', url), 302);
    if (me.role === 'house' && !houseMayOpen(me, url.pathname)) return Response.redirect(new URL('/', url), 302);
    // Family logins open every page; another studio's page shows that studio (the family menu has their View links anyway).
  }

  const res = await context.next();
  const out = new Response(res.body, res);
  const isHtml = (res.headers.get('content-type') || '').includes('text/html');
  // Studio keys: renewed every week, so they never run out; the pages get a readable copy of which studios this phone has.
  if (me.keys?.length) {
    const p = await verify(cookies(req)[COOKIE.keys], secret());
    if (p && Date.now() - (p.iat || 0) > 7 * DAY) out.headers.append('set-cookie', setCookie(COOKIE.keys, await sign({ k: await readKeys(req), iat: Date.now() }, secret()), { maxAge: 400 * 86400 }));
    if (isHtml) out.headers.append('set-cookie', setCookie(COOKIE.hint, me.keys.map((k) => k.s + ':' + k.t + (k.kid ? ':kid' : '')).join(','), { maxAge: 400 * 86400, httpOnly: false }));
  }
  // Keep family devices logged in: renew the cookie about once a week.
  if (me.role === 'family' && Date.now() - (me.iat || 0) > 7 * DAY) {
    out.headers.append('set-cookie', setCookie(COOKIE.login, await makeLogin('family', context), { maxAge: LOGIN_DAYS * 86400 }));
  }
  // A household's phone: stays logged in as long as they visit (renewed weekly), and the page learns its tabs.
  if (me.role === 'house') {
    if (Date.now() - (me.iat || 0) > 7 * DAY) {
      const house = await getHouse(me.house, context);
      if (house) out.headers.append('set-cookie', setCookie(COOKIE.login, await makeHouseLogin(house), { maxAge: LOGIN_DAYS * 86400 }));
    }
    if (isHtml) out.headers.append('set-cookie', setCookie(COOKIE.view, [...me.pages, 'upload', 'house'].join(','), { maxAge: LOGIN_DAYS * 86400, httpOnly: false }));
  }
  // A girl's tablet: tell the page which tabs to show (her pages, Add art, Family Moments if a parent allowed it).
  if (me.role === 'kid' && isHtml) {
    out.headers.append('set-cookie', setCookie(COOKIE.view, [...me.pages, 'upload', 'kid-' + me.kid].join(','), { maxAge: LOGIN_DAYS * 86400, httpOnly: false }));
  }
  return out;
};

export const config = {
  path: '/*',
  excludedPath: ['/assets/fonts/*', '/assets/brand/*', '/styles.css', '/main.js', '/login/', '/privacy/', '/robots.txt', '/favicon.ico'],
};
