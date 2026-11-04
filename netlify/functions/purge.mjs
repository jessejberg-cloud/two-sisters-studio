// Once a day: pieces put away more than 30 days ago lose their web copies on the site. Their record stays (marked
// purged) and Google Drive keeps everything, including the details file that says it was put away.
import { store } from '../lib/store.mjs';
import { getPiece, savePiece, readIndex, webName } from '../lib/pieces.mjs';

export default async (req, context) => {
  const cutoff = Date.now() - 30 * 86400000, images = store('images', context);
  for (const s of await readIndex(context)) {
    if (!s.deleted || s.purged || Date.parse(s.deleted) > cutoff) continue;
    const p = await getPiece(context, s.id);
    if (!p) continue;
    for (const ph of p.photos) { await images.delete(webName(p.id, ph.n)); await images.delete(webName(p.id, ph.n, true)); }
    p.purged = true;
    await savePiece(context, p);
  }
};

export const config = { schedule: '@daily' };
