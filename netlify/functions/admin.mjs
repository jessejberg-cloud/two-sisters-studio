// GET /api/admin/status  -> rebuild progress (parent)
// GET /api/whoami        -> { role, pages, parent } for the pages (hide tabs a friend cannot open)
import { who, isParent } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';

export default async (req, context) => {
  const url = new URL(req.url);
  if (url.pathname === '/api/whoami') {
    const me = await who(req, context);
    return Response.json({ role: me?.role || null, pages: me?.pages || null, parent: me?.role === 'family' && (await isParent(req, context)) },
      { headers: { 'cache-control': 'no-store' } });
  }
  if (!(await isParent(req, context))) return Response.json({ error: 'pin' }, { headers: { 'cache-control': 'no-store' } });
  return Response.json({ rebuild: await store('drive', context).get('rebuild', { type: 'json' }) }, { headers: { 'cache-control': 'no-store' } });
};

export const config = { path: ['/api/admin/status', '/api/whoami'] };
