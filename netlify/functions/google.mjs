// Connect Google Drive once (a parent, from the parent page). Each studio connects its own Drive (?s=<studio>;
// none means Jesse's studio). drive.file only: the site sees only the files it made, and Google shows no scary warning.
//   GET /api/google/start      -> Google's consent page (needs the parent PIN)   ?s=<studio>&from=start (onboarding)
//   GET /api/google/callback   <- Google sends the person back here with a one-time code
//   GET /api/google/status     -> { connected, email, used, limit } for the parent page
import { isParent, env, secret } from '../lib/auth.mjs';
import { sign, verify, randomId, cookies, setCookie, COOKIE } from '../lib/core.mjs';
import { clientId, saveGoogle, googleInfo, storageInfo } from '../lib/drive.mjs';
import { getStudio, putStudio, MAIN } from '../lib/studios.mjs';

const home = (studio, from) => from === 'start' ? '/start/' : !studio || studio === MAIN ? '/parent/' : '/' + studio + '/for-parents/';
const back = (url, q, studio, from) => Response.redirect(new URL(home(studio, from) + '?' + new URLSearchParams(q), url), 303);

export default async (req, context) => {
  const url = new URL(req.url);
  const step = url.pathname.split('/').pop();
  const redirect = url.origin + '/api/google/callback';

  const studio = url.searchParams.get('s') || MAIN;
  if (step === 'start') {
    const from = url.searchParams.get('from') === 'start' ? 'start' : '';
    if (!(await getStudio(studio, context))) return back(url, { e: 'studio' });
    if (!(await isParent(req, context, studio))) return back(url, { e: 'pin' }, studio, from);
    if (!env('GOOGLE_CLIENT_SECRET')) return back(url, { e: 'secret' }, studio, from);
    const nonce = randomId(12);
    const state = await sign({ n: nonce, s: studio, f: from, exp: Date.now() + 10 * 60000 }, secret());
    const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    g.search = new URLSearchParams({ client_id: clientId(), redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }).toString();
    return new Response(null, { status: 302, headers: { location: g.toString(), 'set-cookie': setCookie(COOKIE.gstate, nonce, { maxAge: 600 }) } });
  }

  if (step === 'callback') {
    const st = await verify(url.searchParams.get('state'), secret());
    if (!st || st.n !== cookies(req)[COOKIE.gstate]) return back(url, { e: 'state' });
    const sid = st.s || MAIN, from = st.f || '';
    if (!(await isParent(req, context, sid))) return back(url, { e: 'pin' }, sid, from);
    if (url.searchParams.get('error')) return back(url, { e: 'denied' }, sid, from);
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: clientId(), client_secret: env('GOOGLE_CLIENT_SECRET') || '', redirect_uri: redirect, grant_type: 'authorization_code' }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) return back(url, { e: j.refresh_token ? 'google' : 'norefresh' }, sid, from);
    if (!String(j.scope || '').includes('drive.file')) return back(url, { e: 'scope' }, sid, from);
    await saveGoogle(context, j.refresh_token, {}, sid);
    let info = {}; try { info = await storageInfo(context, sid); } catch {}
    if (info.email) await saveGoogle(context, j.refresh_token, { email: info.email }, sid);
    const s = await getStudio(sid, context);
    if (s && !s.main) { s.drive = true; s.skipped = (s.skipped || []).filter((x) => x !== 'drive'); await putStudio(s, context); }
    return new Response(null, { status: 303, headers: { location: home(sid, from) + '?connected=1', 'set-cookie': setCookie(COOKIE.gstate, '', { maxAge: 0 }) } });
  }

  if (step === 'status') {
    if (!(await isParent(req, context, studio))) return Response.json({ error: 'pin' }, { headers: { 'cache-control': 'no-store' } });
    const info = await googleInfo(context, studio);
    if (info.connected) { try { Object.assign(info, await storageInfo(context, studio)); } catch (e) { info.problem = e.message; } }
    return Response.json(info, { headers: { 'cache-control': 'no-store' } });
  }
  return new Response('Not found', { status: 404 });
};

export const config = { path: '/api/google/*' };
