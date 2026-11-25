// GET /api/admin/status  -> rebuild progress (parent)
// GET /api/whoami        -> { role, pages, parent } for the pages (hide tabs a friend cannot open)
import { who, isParent } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  if (url.pathname === '/api/whoami') {
    const me = await who(req, context);
    // Family logins also get the households (names only, never their invite links), for the More family page and tab.
    let houses;
    if (me?.role === 'family') {
      const s = store('links', context);
      houses = [];
      for (const b of (await s.list({ prefix: 'house/' })).blobs) { const h = await s.get(b.key, { type: 'json' }); if (h) houses.push({ id: h.id, name: h.name, off: !!h.off, created: h.created }); }
      houses.sort((a, b) => a.created.localeCompare(b.created));
    }
    return Response.json({ role: me?.role || null, pages: me?.pages || null, kid: me?.kid || null, moments: !!me?.moments, parent: me?.role === 'family' && (await isParent(req, context)),
      house: me?.house || null, name: me?.name || null, houses },
      { headers: { 'cache-control': 'no-store' } });
  }
  if (!(await isParent(req, context))) return Response.json({ error: 'pin' }, { headers: { 'cache-control': 'no-store' } });
  return Response.json({ rebuild: await store('drive', context).get('rebuild', { type: 'json' }) }, { headers: { 'cache-control': 'no-store' } });
};

export const config = { path: ['/api/admin/status', '/api/whoami'] };
