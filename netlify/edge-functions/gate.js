// The front door. Runs before every page and file: family logins see everything, friends see only the pages
// on their share link, everyone else goes to the login page. Netlify's built-in password can be turned off
// once this is live.
import { who, friendMayOpen, makeLogin, secret, isSetUp } from '../lib/auth.mjs';
import { setCookie, COOKIE, DAY, LOGIN_DAYS } from '../lib/core.mjs';

const OPEN = [/^\/login\/?$/, /^\/api\/login$/, /^\/s\/[A-Za-z0-9_-]+$/, /^\/styles\.css$/,
  /^\/assets\/fonts\//, /^\/assets\/brand\//, /^\/robots\.txt$/, /^\/favicon\.ico$/, /^\/api\/google\/callback$/];

export default async (req, context) => {
  const url = new URL(req.url);
  if (OPEN.some((re) => re.test(url.pathname))) return context.next();
  // Until the secret and the family password are both in Netlify, this door stays open and Netlify's built-in
  // password keeps guarding the site, exactly as before. Turn the built-in password off only after logging in works.
  try { secret(); } catch { return context.next(); }
  if (!(await isSetUp('family', context))) return context.next();

  const me = await who(req, context);
  if (!me) {
    const html = req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html');
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
  if (me.role === 'friend' && !friendMayOpen(me.pages, url.pathname)) {
    return Response.redirect(new URL('/', url), 302);
  }

  const res = await context.next();
  // Keep family devices logged in: renew the cookie about once a week.
  if (me.role === 'family' && Date.now() - (me.iat || 0) > 7 * DAY) {
    const out = new Response(res.body, res);
    out.headers.append('set-cookie', setCookie(COOKIE.login, await makeLogin('family', context), { maxAge: LOGIN_DAYS * 86400 }));
    return out;
  }
  return res;
};

export const config = {
  path: '/*',
  excludedPath: ['/assets/fonts/*', '/assets/brand/*', '/styles.css', '/login/', '/robots.txt', '/favicon.ico'],
};
