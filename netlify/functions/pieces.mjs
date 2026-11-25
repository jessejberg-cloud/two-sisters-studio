// The art API. Family logins save and edit; friends may only read the galleries on their link.
//   GET    /api/pieces?kid=leora              gallery list (kid's own pieces + "both" pieces), not deleted
//   GET    /api/pieces/recent                 family: recent uploads + recently deleted (30 days)
//   GET    /api/pieces/dupes?fp=a,b           family: pieces whose photo fingerprint is close to these
//   POST   /api/pieces/start                  family: reserve an id, make Drive upload addresses for the originals
//   POST   /api/pieces/<id>/photo/<n>         family: the web copies (multipart: web, thumb, meta)
//   POST   /api/pieces/<id>/print/<n>         family, Family Moments: the 3000px print copy (multipart: print)
//   POST   /api/pieces/<id>/finish            family: write the details file to Drive and show it in the gallery
//   POST   /api/pieces/<id>/edit              family: { caption?, date?, starred? }
//   POST   /api/pieces/<id>/delete | restore  family: put away (30 days) or bring back. Drive originals are never deleted.
//   GET    /api/pieces?kid=leora&section=photos   a girl's "My photos";  ?section=moments  photos the girls added to Family Moments
//   GET    /api/pieces/waiting                parent: photos from the girls' tablets waiting for an OK
//   POST   /api/pieces/<id>/ok                parent: show it on the site
// A special day (Family Moments, family logins): start with section 'moments', kid 'both' and
// event { key } for a day already on the page or { title, date } for a new one. The photo then shows in that day's section.
// A girl's tablet login (role kid) may read like a friend and save new photos (start, photo, finish) as herself only;
// they go to her art, her "My photos" (or Family Moments, if a parent allowed it) and wait for a parent's OK.
// A household's phone (role house, from an invite link) saves the same way, as that household: section 'house'
// (their own page, ?section=house) or a Family Moments day. Shown right away (Jesse, 2026-11-25). Family may read
// ?section=house&house=<id> (or every household without house=); a household reads only its own.
// Studios (build spec, 2026-11-25): every call may name ?studio= / "studio" (none: Jesse's). A studio's phones (its Invite) add
// to their own studio and to Family Moment, tagged for the studios they pick ("studios": [...], own studio by default).
// A studio without Google Drive keeps its photos on the site only (no originals). The phone that added a piece, a parent
// of its studio (PIN) or Jesse (owner PIN) may change or put it away; a kid-mode phone may not.
//   GET    /api/pieces?studio=smith&kid=ava        a studio kid's gallery;  ?studio=smith&section=moments  its Family Moment
import { who, isParent, isOwner, byOf, mayView, mayAdd, deviceKey } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { folder, putSmall, uploadAddress, hasDrive } from '../lib/drive.mjs';
import { getStudio, getDevice, MAIN } from '../lib/studios.mjs';
import { heads } from './studios.mjs';
import { KID_KEYS, slug, seasonOf, schoolYearOf, gradeFor, baseId, folderParts, webName, pdfName, extOf, details, getPiece, savePiece, readIndex, check, short, sectionOf, dayKey, printName, studioOf, tagsOf } from '../lib/pieces.mjs';

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
  if (p.noDrive) return;   // a studio without Google Drive: the site's copy is the only one
  const sid = studioOf(p);
  const parent = await folder(context, folderParts(p), sid);
  const res = await putSmall(context, parent, p.id + '.json', 'application/json', JSON.stringify(details(p), null, 2), p.detailsFile, { tss: 'piece' }, sid);
  p.detailsFile = res.id;
}
const bases = (s) => (s.kids || []).map((k) => ({ key: k.key, gradeBase: k.grade ? { grade: k.grade, schoolYear: k.schoolYear } : null }));
// Counts for Jesse's storage view, and the heads-up dot's "50+ uploads from one phone" / "20+ put away in an hour".
async function count(context, sid, field, n) {
  const st = store('studios', context), u = (await st.get('usage', { type: 'json' })) || {};
  u[sid] = { bytes: 0, pieces: 0, ...(u[sid] || {}) }; u[sid][field] += n;
  await st.setJSON('usage', u);
}
async function burst(context, sid, what, ref, limit) {
  const st = store('studios', context), k = 'rate/' + sid + '/' + what + (ref ? '/' + ref : '');
  const hour = Date.now() - 3600000, list = ((await st.get(k, { type: 'json' })) || []).filter((t) => t > hour);
  list.push(Date.now()); await st.setJSON(k, list.slice(-200));
  if (list.length === limit) await heads(sid, what, { ref: ref || '', n: list.length }, context);
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
  const askStudio = url.searchParams.get('studio') || MAIN;

  // ----- reading a studio's pages (not Jesse's: his keep the rules below) -----
  if (req.method === 'GET' && parts.length === 0 && askStudio !== MAIN) {
    const st = await getStudio(askStudio, context);
    if (!st || st.removed || !(mayView(me, askStudio) || (await isOwner(req, context)))) return json({ error: 'page' }, 401);
    const section = url.searchParams.get('section') || 'art', kid = url.searchParams.get('kid');
    const idx = (await readIndex(context)).filter((p) => !p.deleted && !p.waiting);
    const list = section === 'moments' ? idx.filter((p) => sectionOf(p) === 'moments' && tagsOf(p).includes(askStudio))
      : idx.filter((p) => studioOf(p) === askStudio && sectionOf(p) === (section === 'photos' ? 'photos' : 'art') && p.kid === kid);
    return json({ pieces: list.map(({ photos, ...p }) => ({ ...p, photos: photos.map(({ fp, ...ph }) => ph) })) });
  }

  // ----- reading -----
  if (req.method === 'GET' && parts.length === 0) {
    const section = url.searchParams.get('section') || 'art';
    const kid = url.searchParams.get('kid');
    const guest = me.role === 'guest';
    if (guest && !mayView(me, MAIN)) return json({ error: 'page' }, 401);
    let list;
    if (section === 'house') {
      if (guest) return json({ pieces: [] });
      const h = me.role === 'house' ? me.house : url.searchParams.get('house');
      if (!family && me.role !== 'house') return json({ error: 'page' }, 401);
      list = (await readIndex(context)).filter((p) => !p.deleted && !p.waiting && sectionOf(p) === 'house' && (!h || p.house === h));
    } else if (section === 'moments') {
      if (!family && !guest && !me.pages.includes('family-moments')) return json({ error: 'page' }, 401);
      list = (await readIndex(context)).filter((p) => !p.deleted && !p.waiting && sectionOf(p) === 'moments' && tagsOf(p).includes(MAIN));
    } else {
      if (!KID_KEYS.includes(kid) || kid === 'both' || !['art', 'photos'].includes(section)) return json({ error: 'kid' }, 400);
      if (!family && !guest && !me.pages.includes(kid)) return json({ error: 'page' }, 401);
      list = (await readIndex(context)).filter((p) => !p.deleted && !p.waiting && studioOf(p) === MAIN && sectionOf(p) === section
        && (p.kid === kid || (section === 'art' && p.kid === 'both')));
    }
    return json({ pieces: list.map(({ photos, ...p }) => ({ ...p, photos: photos.map(({ fp, ...ph }) => ph) })) });
  }
  // A studio phone (its Invite) saves as itself: 'd:<device id>'. Which studio comes from the call, or from the piece being saved.
  const devOf = (sid) => { const k = deviceKey(me, sid); return k ? 'd:' + k.d : null; };
  const anyDev = (me.keys || []).some((k) => k.t === 'd');
  const saver = byOf(me);   // a girl's tablet or a household's phone: may only add, as themselves
  const kidSaving = !!saver && req.method === 'POST' && (parts[0] === 'start' || ['photo', 'finish'].includes(parts[1])
    || (parts[1] === 'pdf' && me.role === 'kid') || (parts[1] === 'print' && me.role === 'house'));
  const studioWork = anyDev || (await isParent(req, context, askStudio)) || (await isOwner(req, context));
  if (!family && !kidSaving && !studioWork) return json({ error: 'family' }, 401);

  if (req.method === 'GET' && parts[0] === 'waiting') {
    if (!(await isParent(req, context))) return json({ error: 'pin' }, 401);
    const idx = await readIndex(context);
    return json({ waiting: idx.filter((p) => p.waiting && !p.deleted).sort((a, b) => (b.created || '').localeCompare(a.created || '')) });
  }

  if (req.method === 'GET' && parts[0] === 'recent') {
    // Family (Jesse's household): Jesse's studio. A studio phone or parent: that studio (a phone sees only what it added
    // unless a parent PIN is open), so a kid-mode phone never gets to put things away.
    const sid = family ? MAIN : askStudio;
    const mineOnly = !family && !(await isParent(req, context, sid)) && !(await isOwner(req, context));
    const dev = devOf(sid);
    if (!family && !dev && mineOnly) return json({ error: 'family' }, 401);
    const idx = (await readIndex(context)).filter((p) => studioOf(p) === sid && (!mineOnly || p.by === dev));
    const recent = idx.filter((p) => !p.deleted).sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 40);
    const cutoff = Date.now() - KEEP_DELETED_DAYS * 86400000;
    const deleted = idx.filter((p) => p.deleted && !p.purged && Date.parse(p.deleted) > cutoff).sort((a, b) => b.deleted.localeCompare(a.deleted));
    return json({ recent, deleted, keepDays: KEEP_DELETED_DAYS });
  }
  if (req.method === 'GET' && parts[0] === 'dupes') {
    const fps = (url.searchParams.get('fp') || '').split(',').filter((x) => /^[0-9a-f]{16}$/.test(x)).slice(0, 50);
    const sid = family ? MAIN : askStudio;
    const idx = (await readIndex(context)).filter((p) => studioOf(p) === sid), out = [];
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
    const sid = typeof b.studio === 'string' && b.studio ? b.studio : MAIN;
    // A studio phone adding to its own studio (Jesse's studio's own phones too, from its Invite).
    if (!family && !saver && !b.renew) {
      const dev = devOf(sid);
      if (!dev) return json({ error: 'family' }, 401);
      return startStudio(req, context, url, me, sid, dev, b, pend);
    }
    if (sid !== MAIN && !b.renew) return json({ error: 'family' }, 401);
    if (b.clientId) {   // the phone retries after a dropped signal: give back the same id and addresses
      const prev = await pend.get('c/' + b.clientId, { type: 'json' });
      if (prev && !b.renew) return json(prev);
      if (prev && b.renew) {   // Google's upload addresses last about a week: make fresh ones for the same piece
        const rec = await pend.get('p/' + prev.id, { type: 'json' });
        if (rec) {
          if (!family && rec.piece.by !== saver && rec.piece.by !== devOf(studioOf(rec.piece))) return json({ error: 'family' }, 401);
          const parent = await folder(context, folderParts(rec.piece), studioOf(rec.piece));
          prev.uploads = await Promise.all(prev.uploads.map(async (u) => ({ ...u, url: await uploadAddress(context, parent, u.name, u.type, u.size, url.origin, studioOf(rec.piece)) })));
          await pend.setJSON('c/' + b.clientId, prev);
          return json(prev);
        }
      }
    }
    if (!family && !saver) return json({ error: 'unknown' }, 404);
    // A girl's tablet saves as her, into her photos (or Family Moments if allowed), waiting for a parent's OK.
    const kidMe = me.role === 'kid', houseMe = me.role === 'house';
    // Her art (Jesse, 2026-11-25) goes to her gallery after the OK, like her snapshots.
    const section = kidMe ? (b.section === 'moments' && me.moments ? 'moments' : b.section === 'art' ? 'art' : 'photos')
      : houseMe ? (b.section === 'moments' && b.event ? 'moments' : 'house')
      : (['art', 'photos', 'moments'].includes(b.section) ? b.section : 'art');
    const p = { kid: kidMe ? me.kid : houseMe ? 'both' : b.kid, date: b.date, photos: (b.photos || []).map((ph, i) => ({ n: i + 1, ...ph })) };
    // A special day from a family phone: the whole family's, so kid 'both'; the day's own date.
    let day = null;
    if (!kidMe && section === 'moments' && b.event) {
      const title = String(b.event.title || '').trim().slice(0, 80), date = String(b.event.date || '');
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'bad', fields: ['event'] }, 400);
      day = { event: /^[a-z0-9-]{10,90}$/.test(b.event.key || '') ? b.event.key : dayKey(date, title), eventTitle: title, eventDate: date };
      p.kid = 'both'; if (!p.date) p.date = date;
    }
    if (section !== 'art' && section !== 'house' && p.kid === 'both' && !day) return json({ error: 'bad', fields: ['kid'] }, 400);
    const bad = check(p);
    if (bad.length) return json({ error: 'bad', fields: bad }, 400);
    const who_ = houseMe ? { house: me.house, from: me.name } : {};
    let id = section === 'house' ? `${p.date}_${slug(me.name, 2)}_${slug(b.caption || 'photo', 4)}_house` : (day ? `${day.event.slice(0, 60)}_${p.date}_${baseId(p.kid, p.date, b.caption).split('_').pop()}` : baseId(p.kid, p.date, b.caption)) + (section === 'art' ? '' : '_' + section), n = 1;
    while ((await getPiece(context, id + (n > 1 ? '-' + n : ''))) || (await pend.get('p/' + id + (n > 1 ? '-' + n : '')))) n++;
    if (n > 1) id += '-' + n;
    const piece = { id, kid: p.kid, date: p.date, season: seasonOf(p.date), schoolYear: schoolYearOf(p.date), caption: String(b.caption || '').slice(0, 200),
      starred: !!b.starred, created: now(), updated: now(), deleted: null, photos: p.photos.map((ph) => ({ n: ph.n })),
      section, waiting: kidMe, by: saver, ...(day || {}), ...who_ };
    // Family Moment from Jesse's household: it can show in other studios too (the studio chips). His own by default.
    if (section === 'moments' && family && Array.isArray(b.studios)) {
      const tags = [];
      for (const x of [...new Set(b.studios.filter((y) => typeof y === 'string'))].slice(0, 30)) { const o = await getStudio(x, context); if (o && !o.off && !o.removed) tags.push(o.slug); }
      if (tags.length && !(tags.length === 1 && tags[0] === MAIN)) piece.studios = tags;
    }
    piece.grade = p.kid === 'both' ? '' : gradeFor(p.kid, p.date);
    const parent = await folder(context, folderParts(piece));
    const origin = url.origin, uploads = [];
    for (const ph of p.photos) {
      const oext = ph.originalType === 'application/pdf' ? 'pdf' : extOf(ph.originalType) === 'png' ? 'png' : (/heic|heif/.test(ph.originalType || '') ? 'heic' : 'jpg');
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
    if (!family && rec.piece.by !== (saver || devOf(studioOf(rec.piece)))) return json({ error: 'family' }, 401);
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
    let wf = {}, tf = {};
    const sid = studioOf(rec.piece);
    if (!rec.piece.noDrive) {   // web copies in Drive too, so the site can be rebuilt from Drive alone
      const webFolder = await folder(context, ['_site', 'web'], sid);
      const ext = extOf(type);
      wf = await putSmall(context, webFolder, `${webName(id, n)}.${ext}`, type, await web.arrayBuffer(), null, null, sid);
      tf = await putSmall(context, webFolder, `${webName(id, n, true)}.${ext}`, type, await thumb.arrayBuffer(), null, null, sid);
    }
    await count(context, sid, 'bytes', web.size + thumb.size);
    Object.assign(ph, { w: +meta.w || 0, h: +meta.h || 0, fp: /^[0-9a-f]{16}$/.test(meta.fp || '') ? meta.fp : '', edits: Array.isArray(meta.edits) ? meta.edits.slice(0, 10) : [],
      original: meta.original || null, edited: meta.edited || null, web: wf.id || 'site', thumb: tf.id || null, webType: type });
    await pend.setJSON('p/' + id, rec);
    return json({ ok: true });
  }

  // A PDF piece: the picture of page 1 came in as the "web" copy above; this is the PDF itself, for opening on the site.
  // (Up to 5 MB, the most one function call takes. Bigger PDFs stay in Google Drive and show only their picture.)
  if (parts[1] === 'pdf') {
    const rec = await pend.get('p/' + id, { type: 'json' });
    if (!rec) return json({ error: 'unknown' }, 404);
    if (!family && rec.piece.by !== (saver || devOf(studioOf(rec.piece)))) return json({ error: 'family' }, 401);
    const ph = rec.piece.photos.find((x) => x.n === +parts[2]);
    if (!ph) return json({ error: 'photo' }, 400);
    const form = await req.formData();
    const file = form.get('pdf');
    if (!file || file.size > 5e6 || file.size < 8) return json({ error: 'pdf' }, 400);
    const bytes = await file.arrayBuffer();
    if (new TextDecoder('latin1').decode(bytes.slice(0, 1024)).indexOf('%PDF-') === -1) return json({ error: 'pdf' }, 400);
    await store('images', context).set(pdfName(id, ph.n), bytes, { metadata: { type: 'application/pdf', piece: id } });
    ph.pdf = true;
    await pend.setJSON('p/' + id, rec);
    return json({ ok: true });
  }

  // Family Moments: a print-size copy (3000px JPEG) for "Download all" and photo books. Optional: without it the web copy stands in.
  if (parts[1] === 'print') {
    const rec = await pend.get('p/' + id, { type: 'json' });
    if (!rec) return json({ error: 'unknown' }, 404);
    if (!family && rec.piece.by !== (saver || devOf(studioOf(rec.piece)))) return json({ error: 'family' }, 401);
    const ph = rec.piece.photos.find((x) => x.n === +parts[2]);
    if (!ph || sectionOf(rec.piece) !== 'moments') return json({ error: 'photo' }, 400);
    const file = (await req.formData()).get('print');
    if (!file || file.size > 5.5e6 || file.size < 100) return json({ error: 'print' }, 400);
    await store('images', context).set(printName(id, ph.n), await file.arrayBuffer(), { metadata: { type: 'image/jpeg', piece: id } });
    await count(context, studioOf(rec.piece), 'bytes', file.size);
    ph.print = true;
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
    if (!family && p.by !== (saver || devOf(studioOf(p)))) return json({ error: 'family' }, 401);
    if (p.photos.some((ph) => !ph.web)) return json({ error: 'photos-missing' }, 400);
    await writeDetails(context, p);
    await savePiece(context, p);
    await pend.delete('p/' + id);
    if (rec.clientId) await pend.delete('c/' + rec.clientId);
    await count(context, studioOf(p), 'pieces', 1);
    if (p.dev) await burst(context, studioOf(p), 'uploads', p.dev, 50);
    return json({ ok: true, piece: short(p) });
  }

  const p = await getPiece(context, id);
  if (!p) return json({ error: 'unknown' }, 404);
  // Who may change it: Jesse's family (his studio), a parent of its studio or Jesse (PIN), or the phone that added it
  // (not a kid-mode phone). A Family Moment photo: the phone that added it, or Jesse.
  const sid = studioOf(p);
  const parentHere = (await isOwner(req, context)) || (sectionOf(p) !== 'moments' || sid === MAIN ? await isParent(req, context, sid) : false);
  const myDev = devOf(sid), devRec = myDev && (await getDevice(myDev.slice(2), context));
  const mine = !!myDev && p.by === myDev && !devRec?.kid;
  if (parts[1] === 'ok') { if (!(await isParent(req, context))) return json({ error: 'pin' }, 401); }
  else if (!((family && sid === MAIN) || parentHere || mine)) return json({ error: 'family' }, 401);
  if (parts[1] === 'edit') {
    const b = await req.json();
    if (typeof b.caption === 'string') p.caption = b.caption.slice(0, 200);
    if (typeof b.starred === 'boolean') p.starred = b.starred;
    if (typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
      p.date = b.date; p.season = seasonOf(b.date); p.schoolYear = schoolYearOf(b.date);
      const st = sid === MAIN ? null : await getStudio(sid, context);
      p.grade = p.kid === 'both' || sectionOf(p) === 'moments' ? '' : st ? gradeFor(p.kid, b.date, bases(st)) : gradeFor(p.kid, b.date);
    }
  } else if (parts[1] === 'ok') {
    p.waiting = false;
  } else if (parts[1] === 'delete') { p.deleted = now(); await burst(context, sid, 'deletes', '', 20); }
  else if (parts[1] === 'restore') { if (p.purged) return json({ error: 'gone' }, 400); p.deleted = null; }
  else return json({ error: 'action' }, 404);
  p.updated = now();
  await writeDetails(context, p);
  await savePiece(context, p);
  return json({ ok: true, piece: short(p) });
}

// A studio phone starts a piece: a kid's art or snapshot in its own studio, or a Family Moment photo for the studios it ticked.
async function startStudio(req, context, url, me, sid, dev, b, pend) {
  const st = await getStudio(sid, context);
  if (!st || st.off || st.removed) return json({ error: 'studio' }, 404);
  if (b.clientId) { const prev = await pend.get('c/' + b.clientId, { type: 'json' }); if (prev) return json(prev); }   // a retry: same id
  const device = await getDevice(dev.slice(2), context);
  const section = b.section === 'moments' ? 'moments' : b.section === 'photos' ? 'photos' : 'art';
  const kids = st.kids || [];
  const p = { kid: section === 'moments' ? 'both' : b.kid, date: b.date, photos: (b.photos || []).map((ph, i) => ({ n: i + 1, ...ph })) };
  const bad = check(p, [...kids.map((k) => k.key), 'both']);
  if (section !== 'moments' && p.kid === 'both' && !st.main) bad.push('kid');
  if (bad.length) return json({ error: 'bad', fields: bad }, 400);
  // Family Moment: the studios it shows in. Own studio first; any other real studio may be ticked. Never another studio's kid pages.
  let tags = null, day = null;
  if (section === 'moments') {
    const want = Array.isArray(b.studios) ? b.studios.filter((x) => typeof x === 'string').slice(0, 30) : [sid];
    tags = [];
    for (const x of [...new Set(want)]) { const o = x === sid ? st : await getStudio(x, context); if (o && !o.off && !o.removed) tags.push(o.slug); }
    if (!tags.length) tags = [sid];
    if (b.event) {
      const title = String(b.event.title || '').trim().slice(0, 80), date = String(b.event.date || '');
      if (title && /^\d{4}-\d{2}-\d{2}$/.test(date)) { day = { event: /^[a-z0-9-]{10,90}$/.test(b.event.key || '') ? b.event.key : dayKey(date, title), eventTitle: title, eventDate: date }; if (!p.date) p.date = date; }
    }
  }
  const kid = kids.find((k) => k.key === p.kid);
  const drive = st.main ? true : await hasDrive(context, sid);
  const prefix = st.main ? '' : sid + '_';
  let id = prefix + (day ? `${day.event.slice(0, 50)}_${p.date}_${slug(b.caption || 'photo', 3)}` : baseId(p.kid, p.date, b.caption)) + (section === 'art' ? '' : '_' + section), n = 1;
  id = id.slice(0, 110);
  while ((await getPiece(context, id + (n > 1 ? '-' + n : ''))) || (await pend.get('p/' + id + (n > 1 ? '-' + n : '')))) n++;
  if (n > 1) id += '-' + n;
  const piece = { id, kid: p.kid, date: p.date, season: seasonOf(p.date), schoolYear: schoolYearOf(p.date), caption: String(b.caption || '').slice(0, 200),
    starred: !!b.starred && section === 'art', created: now(), updated: now(), deleted: null, photos: p.photos.map((ph) => ({ n: ph.n })),
    section, waiting: false, by: dev, dev: dev.slice(2), byName: device?.name || '', ...(day || {}),
    ...(st.main ? {} : { studio: sid }), ...(tags ? { studios: tags } : {}), ...(kid && !st.main ? { kidName: kid.name } : {}), ...(drive ? {} : { noDrive: true }) };
  piece.grade = section === 'moments' || p.kid === 'both' ? '' : st.main ? gradeFor(p.kid, p.date) : gradeFor(p.kid, p.date, bases(st));
  const uploads = [];
  if (drive) {
    const parent = await folder(context, folderParts(piece), sid);
    for (const ph of p.photos) {
      const oext = ph.originalType === 'application/pdf' ? 'pdf' : extOf(ph.originalType) === 'png' ? 'png' : (/heic|heif/.test(ph.originalType || '') ? 'heic' : 'jpg');
      const o = { n: ph.n, kind: 'original', name: `${id}-${ph.n}-original.${oext}`, type: ph.originalType || 'image/jpeg', size: ph.originalSize };
      uploads.push({ ...o, url: await uploadAddress(context, parent, o.name, o.type, o.size, url.origin, sid) });
      if (ph.edited) {
        const e = { n: ph.n, kind: 'edited', name: `${id}-${ph.n}.jpg`, type: 'image/jpeg', size: ph.editedSize };
        uploads.push({ ...e, url: await uploadAddress(context, parent, e.name, e.type, e.size, url.origin, sid) });
      }
    }
  }
  const out = { id, uploads };
  await pend.setJSON('p/' + id, { piece, clientId: b.clientId || null, at: now() });
  if (b.clientId) await pend.setJSON('c/' + b.clientId, out);
  return json(out);
}

export const config = { path: ['/api/pieces', '/api/pieces/*'] };
