// GET /img/<piece id>/<n>        the web copy (1600px)
// GET /img/<piece id>/<n>/sm     the small copy for the grid
// GET /img/<piece id>/<n>/print  Family Moments: the print-size copy (the web copy when there is none)
// GET /img/<piece id>/<n>/pdf    the PDF itself, when the piece was added as a PDF
// Family: everything. Households: their own photos, plus Family Moments and their pages. Friends: only pieces of a kid on their link. Put-away pieces: family only.
import { who, mayView } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { getPiece, webName, pdfName, printName, studioOf, tagsOf } from '../lib/pieces.mjs';

export default async (req, context) => {
  const [, , id, n, size] = new URL(req.url).pathname.split('/');
  const me = await who(req, context);
  if (!me) return new Response('Please log in.', { status: 401 });
  const p = await getPiece(context, id);
  if (!p || !/^\d+$/.test(n || '')) return new Response('Not found', { status: 404 });
  // Studios: anyone who can look at the piece's studio, or (Family Moment) at any studio it was tagged for.
  const sid = studioOf(p), viaKeys = p.section === 'moments' ? tagsOf(p).some((x) => mayView({ keys: me.keys }, x)) : mayView({ keys: me.keys }, sid);
  if (viaKeys) { if (p.deleted || p.waiting) return new Response('Not found', { status: 404 }); }
  else if (sid !== 'main' && me.role !== 'family') return new Response('Not found', { status: 404 });
  else if (me.role !== 'family') {
    const kids = p.kid === 'both' ? ['leora', 'amaya'] : [p.kid];
    const allowed = p.section === 'moments' ? me.pages.includes('family-moments')
      : p.section === 'house' ? me.role === 'house' && p.house === me.house      // a household's own page: theirs and the family's only
      : kids.some((k) => me.pages.includes(k));
    if (p.deleted || p.waiting || !allowed) return new Response('Not found', { status: 404 });
  }
  if (size === 'pdf') {
    const pdf = await store('images', context).getWithMetadata(pdfName(id, +n), { type: 'arrayBuffer' });
    if (!pdf) return new Response('Not found', { status: 404 });
    return new Response(pdf.data, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${id}.pdf"`, 'cache-control': 'private, max-age=31536000, immutable' } });
  }
  const images = store('images', context);
  const got = (size === 'print' && (await images.getWithMetadata(printName(id, +n), { type: 'arrayBuffer' })))
    || (await images.getWithMetadata(webName(id, +n, size === 'sm'), { type: 'arrayBuffer' }));
  if (!got) return new Response('Not found', { status: 404 });
  return new Response(got.data, { headers: { 'content-type': got.metadata?.type || 'image/webp', 'cache-control': 'private, max-age=31536000, immutable' } });
};

export const config = { path: '/img/*' };
