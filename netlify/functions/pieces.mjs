// The art API. Family logins save and edit; friends may only read the galleries on their link.
//   GET    /api/pieces?kid=leora              gallery list (kid's own pieces + "both" pieces), not deleted
//   GET    /api/pieces/recent                 family: recent uploads + recently deleted (30 days)
//   GET    /api/pieces/dupes?fp=a,b           family: pieces whose photo fingerprint is close to these
//   POST   /api/pieces/start                  family: reserve an id, make Drive upload addresses for the originals
//   POST   /api/pieces/<id>/photo/<n>         family: the web copies (multipart: web, thumb, meta)
//   POST   /api/pieces/<id>/finish            family: write the details file to Drive and show it in the gallery
//   POST   /api/pieces/<id>/edit              family: { caption?, date?, starred? }
//   POST   /api/pieces/<id>/delete | restore  family: put away (30 days) or bring back. Drive originals are never deleted.
//   GET    /api/pieces?kid=leora&section=photos   a girl's "My photos";  ?section=moments  photos the girls added to Family Moments
//   GET    /api/pieces/waiting                parent: photos from the girls' tablets waiting for an OK
//   POST   /api/pieces/<id>/ok                parent: show it on the site
// A girl's tablet login (role kid) may read like a friend and save new photos (start, photo, finish) as herself only;
// they go to her "My photos" (or Family Moments, if a parent allowed it) and wait for a parent's OK.
import { who, isParent } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { folder, putSmall, uploadAddress } from '../lib/drive.mjs';
import { KID_KEYS, seasonOf, schoolYearOf, gradeFor, baseId, folderParts, webName, extOf, details, getPiece, savePiece, readIndex, check, short, sectionOf } from '../lib/pieces.mjs';

const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const now = () => new Date().toISOString();
const KEEP_DELETED_DAYS = 30;

// Fingerprints are 16 hex digits (a 64-bit picture hash); close = few differing bits.
function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i += 4) { let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

async function writeDetails(context, p) {
  const parent = await folder(context, folderParts(p));
  const res = await putSmall(context, parent, p.id + '.json', 'application/json', JSON.stringify(details(p), null, 2), p.detailsFile, { tss: 'piece' });
  p.detailsFile = res.id;
}

// Any failure comes back as plain words for the phone (and in the Netlify function log), not a bare 502.
export default async (req, context) => {
  try { return await handle(req, context); }
  catch (e) {
    console.error('pieces failed:', e.code || '', e.status || '', e.message);
    return json({ error: e.code || 'server', message: String(e.message || e).slice(0, 300) }, 500);
  }
};

async function handle(req, context) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(2);   // after /api/pieces
  const me = await who(req, context);
  if (!me) return json({ error: 'login' }, 401);
  const family = me.role === 'family';

  // ----- reading -----
  if (req.method === 'GET' && parts.length === 0) {
    const section = url.searchParams.get('section') || 'art';
    const kid = url.searchParams.get('kid');
    let list;
    if (section === 'moments') {
      if (!family && !me.pages.includes('family-moments')) return json({ error: 'page' }, 401);
      list = (await readIndex(context)).filter((p) => !p.deleted && !p.waiting && sectionOf(p) === 'moments');
    } else {
      if (!KID_KEYS.includes(kid) || kid === 'both' || !['art', 'photos'].includes(section)) return json({ error: 'kid' }, 400);
      if (!family && !me.pages.includes(kid)) return json({ error: 'page' }, 401);
      list = (await readIndex(context)).filter((p) => !p.deleted && !p.waiting && sectionOf(p) === section
        && (p.kid === kid || (section === 'art' && p.kid === 'both')));
    }
    return json({ pieces: list.map(({ photos, ...p }) => ({ ...p, photos: photos.map(({ fp, ...ph }) => ph) })) });
  }
  const kidSaving = me.role === 'kid' && req.method === 'POST' && (parts[0] === 'start' || ['photo', 'finish'].includes(parts[1]));
  if (!family && !kidSaving) return json({ error: 'family' }, 401);

  if (req.method === 'GET' && parts[0] === 'waiting') {
    if (!(await isParent(req, context))) return json({ error: 'pin' }, 401);
    const idx = await readIndex(context);
    return json({ waiting: idx.filter((p) => p.waiting && !p.deleted).sort((a, b) => (b.created || '').localeCompare(a.created || '')) });
  }

  if (req.method === 'GET' && parts[0] === 'recent') {
    const idx = await readIndex(context);
    const recent = idx.filter((p) => !p.deleted).sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 40);
    const cutoff = Date.now() - KEEP_DELETED_DAYS * 86400000;
    const deleted = idx.filter((p) => p.deleted && !p.purged && Date.parse(p.deleted) > cutoff).sort((a, b) => b.deleted.localeCompare(a.deleted));
    return json({ recent, deleted, keepDays: KEEP_DELETED_DAYS });
  }
  if (req.method === 'GET' && parts[0] === 'dupes') {
    const fps = (url.searchParams.get('fp') || '').split(',').filter((x) => /^[0-9a-f]{16}$/.test(x)).slice(0, 50);
    const idx = await readIndex(context), out = [];
    for (const fp of fps) for (const p of idx) {
      if (p.purged) continue;
      if (p.photos.some((ph) => distance(ph.fp, fp) <= 6)) out.push({ fp, id: p.id, kid: p.kid, date: p.date, caption: p.caption, deleted: !!p.deleted });
    }
    return json({ matches: out });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // ----- saving a new piece -----
  if (parts[0] === 'start') {
    const b = await req.json();
    const pend = store('pending', context);
    if (b.clientId) {   // the phone retries after a dropped signal: give back the same id and addresses
      const prev = await pend.get('c/' + b.clientId, { type: 'json' });
      if (prev && !b.renew) return json(prev);
      if (prev && b.renew) {   // Google's upload addresses last about a week: make fresh ones for the same piece
        const rec = await pend.get('p/' + prev.id, { type: 'json' });
        if (rec) {
          const parent = await folder(context, folderParts(rec.piece));
          prev.uploads = await Promise.all(prev.uploads.map(async (u) => ({ ...u, url: await uploadAddress(context, parent, u.name, u.type, u.size, url.origin) })));
          await pend.setJSON('c/' + b.clientId, prev);
          return json(prev);
        }
      }
    }
    // A girl's tablet saves as her, into her photos (or Family Moments if allowed), waiting for a parent's OK.
    const kidMe = me.role === 'kid';
    const section = kidMe ? (b.section === 'moments' && me.moments ? 'moments' : 'photos')
      : (['art', 'photos', 'moments'].includes(b.section) ? b.section : 'art');
    const p = { kid: kidMe ? me.kid : b.kid, date: b.date, photos: (b.photos || []).map((ph, i) => ({ n: i + 1, ...ph })) };
    if (section !== 'art' && p.kid === 'both') return json({ error: 'bad', fields: ['kid'] }, 400);
    const bad = check(p);
    if (bad.length) return json({ error: 'bad', fields: bad }, 400);
    let id = baseId(p.kid, p.date, b.caption) + (section === 'art' ? '' : '_' + section), n = 1;
    while ((await getPiece(context, id + (n > 1 ? '-' + n : ''))) || (await pend.get('p/' + id + (n > 1 ? '-' + n : '')))) n++;
    if (n > 1) id += '-' + n;
    const piece = { id, kid: p.kid, date: p.date, season: seasonOf(p.date), schoolYear: schoolYearOf(p.date), caption: String(b.caption || '').slice(0, 200),
      starred: !!b.starred, created: now(), updated: now(), deleted: null, photos: p.photos.map((ph) => ({ n: ph.n })),
      section, waiting: kidMe, by: kidMe ? me.kid : null };
    piece.grade = p.kid === 'both' ? '' : gradeFor(p.kid, p.date);
    const parent = await folder(context, folderParts(piece));
    const origin = url.origin, uploads = [];
    for (const ph of p.photos) {
      const oext = extOf(ph.originalType) === 'png' ? 'png' : (/heic|heif/.test(ph.originalType || '') ? 'heic' : 'jpg');
      const o = { n: ph.n, kind: 'original', name: `${id}-${ph.n}-original.${oext}`, type: ph.originalType || 'image/jpeg', size: ph.originalSize };
      uploads.push({ ...o, url: await uploadAddress(context, parent, o.name, o.type, o.size, origin) });
      if (ph.edited) {
        const e = { n: ph.n, kind: 'edited', name: `${id}-${ph.n}.jpg`, type: 'image/jpeg', size: ph.editedSize };
        uploads.push({ ...e, url: await uploadAddress(context, parent, e.name, e.type, e.size, origin) });
      }
    }
    const out = { id, uploads };
    await pend.setJSON('p/' + id, { piece, clientId: b.clientId || null, at: now() });
    if (b.clientId) await pend.setJSON('c/' + b.clientId, out);
    return json(out);
  }

  const id = parts[0];
  if (!/^[a-z0-9_-]{8,120}$/.test(id || '')) return json({ error: 'id' }, 400);
  const pend = store('pending', context);

  if (parts[1] === 'photo') {
    const rec = await pend.get('p/' + id, { type: 'json' });
    if (!rec) return json({ error: 'unknown' }, 404);
    if (me.role === 'kid' && rec.piece.by !== me.kid) return json({ error: 'family' }, 401);
    const n = +parts[2];
    const ph = rec.piece.photos.find((x) => x.n === n);
    if (!ph) return json({ error: 'photo' }, 400);
    const form = await req.formData();
    const meta = JSON.parse(form.get('meta') || '{}');
    const web = form.get('web'), thumb = form.get('thumb');
    if (!web || !thumb || web.size > 3e6 || thumb.size > 1e6) return json({ error: 'web' }, 400);
    const type = ['image/webp', 'image/jpeg', 'image/png'].includes(web.type) ? web.type : 'image/jpeg';
    const images = store('images', context);
    await images.set(webName(id, n), await web.arrayBuffer(), { metadata: { type, piece: id } });
    await images.set(webName(id, n, true), await thumb.arrayBuffer(), { metadata: { type, piece: id } });
    const webFolder = await folder(context, ['_site', 'web']);
    const ext = extOf(type);
    const wf = await putSmall(context, webFolder, `${webName(id, n)}.${ext}`, type, await web.arrayBuffer());
    const tf = await putSmall(context, webFolder, `${webName(id, n, true)}.${ext}`, type, await thumb.arrayBuffer());
    Object.assign(ph, { w: +meta.w || 0, h: +meta.h || 0, fp: /^[0-9a-f]{16}$/.test(meta.fp || '') ? meta.fp : '', edits: Array.isArray(meta.edits) ? meta.edits.slice(0, 10) : [],
      original: meta.original || null, edited: meta.edited || null, web: wf.id, thumb: tf.id, webType: type });
    await pend.setJSON('p/' + id, rec);
    return json({ ok: true });
  }

  if (parts[1] === 'finish') {
    const rec = await pend.get('p/' + id, { type: 'json' });
    if (!rec) {
      const done = await getPiece(context, id);   // already finished (a retry): fine
      return done ? json({ ok: true, piece: short(done) }) : json({ error: 'unknown' }, 404);
    }
    const p = rec.piece;
    if (me.role === 'kid' && p.by !== me.kid) return json({ error: 'family' }, 401);
    if (p.photos.some((ph) => !ph.web)) return json({ error: 'photos-missing' }, 400);
    await writeDetails(context, p);
    await savePiece(context, p);
    await pend.delete('p/' + id);
    if (rec.clientId) await pend.delete('c/' + rec.clientId);
    return json({ ok: true, piece: short(p) });
  }

  const p = await getPiece(context, id);
  if (!p) return json({ error: 'unknown' }, 404);
  if (parts[1] === 'edit') {
    const b = await req.json();
    if (typeof b.caption === 'string') p.caption = b.caption.slice(0, 200);
    if (typeof b.starred === 'boolean') p.starred = b.starred;
    if (typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
      p.date = b.date; p.season = seasonOf(b.date); p.schoolYear = schoolYearOf(b.date);
      p.grade = p.kid === 'both' ? '' : gradeFor(p.kid, b.date);
    }
  } else if (parts[1] === 'ok') {
    if (!(await isParent(req, context))) return json({ error: 'pin' }, 401);
    p.waiting = false;
  } else if (parts[1] === 'delete') p.deleted = now();
  else if (parts[1] === 'restore') { if (p.purged) return json({ error: 'gone' }, 400); p.deleted = null; }
  else return json({ error: 'action' }, 404);
  p.updated = now();
  await writeDetails(context, p);
  await savePiece(context, p);
  return json({ ok: true, piece: short(p) });
}

export const config = { path: ['/api/pieces', '/api/pieces/*'] };
