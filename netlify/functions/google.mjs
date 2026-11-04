// Connect Google Drive once (a parent, from the parent page).
//   GET /api/google/start      -> Google's consent page (needs the parent PIN)
//   GET /api/google/callback   <- Google sends the person back here with a one-time code
//   GET /api/google/status     -> { connected, email, used, limit } for the parent page
import { isParent, env, secret } from '../lib/auth.mjs';
import { sign, verify, randomId, cookies, setCookie, COOKIE } from '../lib/core.mjs';
import { clientId, saveGoogle, googleInfo, storageInfo } from '../lib/drive.mjs';

const back = (url, q) => Response.redirect(new URL('/parent/?' + new URLSearchParams(q), url), 303);

export default async (req, context) => {
  const url = new URL(req.url);
  const step = url.pathname.split('/').pop();
  const redirect = url.origin + '/api/google/callback';

  if (step === 'start') {
    if (!(await isParent(req, context))) return back(url, { e: 'pin' });
    if (!env('GOOGLE_CLIENT_SECRET')) return back(url, { e: 'secret' });
    const nonce = randomId(12);
    const state = await sign({ n: nonce, exp: Date.now() + 10 * 60000 }, secret());
    const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    g.search = new URLSearchParams({ client_id: clientId(), redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }).toString();
    return new Response(null, { status: 302, headers: { location: g.toString(), 'set-cookie': setCookie(COOKIE.gstate, nonce, { maxAge: 600 }) } });
  }

  if (step === 'callback') {
    const st = await verify(url.searchParams.get('state'), secret());
    if (!st || st.n !== cookies(req)[COOKIE.gstate]) return back(url, { e: 'state' });
    if (!(await isParent(req, context))) return back(url, { e: 'pin' });
    if (url.searchParams.get('error')) return back(url, { e: 'denied' });
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: clientId(), client_secret: env('GOOGLE_CLIENT_SECRET') || '', redirect_uri: redirect, grant_type: 'authorization_code' }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) return back(url, { e: j.refresh_token ? 'google' : 'norefresh' });
    if (!String(j.scope || '').includes('drive.file')) return back(url, { e: 'scope' });
    await saveGoogle(context, j.refresh_token, {});
    let info = {}; try { info = await storageInfo(context); } catch {}
    if (info.email) await saveGoogle(context, j.refresh_token, { email: info.email });
    return new Response(null, { status: 303, headers: { location: '/parent/?connected=1', 'set-cookie': setCookie(COOKIE.gstate, '', { maxAge: 0 }) } });
  }

  if (step === 'status') {
    if (!(await isParent(req, context))) return Response.json({ error: 'pin' }, { headers: { 'cache-control': 'no-store' } });
    const info = await googleInfo(context);
    if (info.connected) { try { Object.assign(info, await storageInfo(context)); } catch (e) { info.problem = e.message; } }
    return Response.json(info, { headers: { 'cache-control': 'no-store' } });
  }
  return new Response('Not found', { status: 404 });
};

export const config = { path: '/api/google/*' };
