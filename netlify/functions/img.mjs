// GET /img/<piece id>/<n>        the web copy (1600px)
// GET /img/<piece id>/<n>/sm     the small copy for the grid
// Family: everything. Friends: only pieces of a kid on their link. Put-away pieces: family only.
import { who } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { getPiece, webName } from '../lib/pieces.mjs';

export default async (req, context) => {
  const [, , id, n, size] = new URL(req.url).pathname.split('/');
  const me = await who(req, context);
  if (!me) return new Response('Please log in.', { status: 401 });
  const p = await getPiece(context, id);
  if (!p || !/^\d+$/.test(n || '')) return new Response('Not found', { status: 404 });
  if (me.role !== 'family') {
    const kids = p.kid === 'both' ? ['leora', 'amaya'] : [p.kid];
    const allowed = p.section === 'moments' ? me.pages.includes('family-moments') : kids.some((k) => me.pages.includes(k));
    if (p.deleted || p.waiting || !allowed) return new Response('Not found', { status: 404 });
  }
  const got = await store('images', context).getWithMetadata(webName(id, +n, size === 'sm'), { type: 'arrayBuffer' });
  if (!got) return new Response('Not found', { status: 404 });
  return new Response(got.data, { headers: { 'content-type': got.metadata?.type || 'image/webp', 'cache-control': 'private, max-age=31536000, immutable' } });
};

export const config = { path: '/img/*' };
