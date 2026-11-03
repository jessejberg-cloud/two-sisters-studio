// The art archive. Google Drive is the source of truth; Netlify Blobs holds a fast copy for the galleries.
//
// Drive:  Two Sisters Studio / Leora|Amaya|Both / 2026-27 / Fall|Winter|Spring|Summer /
//           2026-11-03_leora_fall_dog-in-the-rain.json          the details file (appProperties tss=piece)
//           2026-11-03_leora_fall_dog-in-the-rain-1-original.jpg the untouched photo (always kept)
//           2026-11-03_leora_fall_dog-in-the-rain-1.jpg          the edited photo, if it was edited
//           ...-2-original.jpg, -2.jpg                           more photos of a 3D piece
//         Two Sisters Studio / _site / web /  <id>-1.webp, <id>-1-sm.webp   web copies, so the site can be
//                                                                           rebuilt from Drive alone
// Blobs:  pieces   p/<id> -> the details (same shape as the .json) + Drive ids;  index -> every piece, short form
//         images   <id>-<n>.webp, <id>-<n>-sm.webp
import site from '../../content/site.json' with { type: 'json' };
import { store } from './store.mjs';

export const KIDS = Object.fromEntries(site.kids.map((k) => [k.key, k.name]));
export const KID_KEYS = [...Object.keys(KIDS), 'both'];
export const SEASONS = ['fall', 'winter', 'spring', 'summer'];
export const SEASON_LABEL = { fall: 'Fall', winter: 'Winter', spring: 'Spring', summer: 'Summer' };
export const GRADES = ['Pre-K', 'K4', 'K5', '1st grade', '2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade',
  '7th grade', '8th grade', '9th grade', '10th grade', '11th grade', '12th grade'];

export const seasonOf = (iso) => { const m = +iso.slice(5, 7); return m >= 9 && m <= 11 ? 'fall' : (m === 12 || m <= 2) ? 'winter' : m <= 5 ? 'spring' : 'summer'; };
export const schoolYearOf = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); const s = m >= 9 ? y : y - 1; return `${s}-${String(s + 1).slice(2)}`; };
const syStart = (sy) => +sy.slice(0, 4);

// Grade from the date: each kid's grade is set once (content/site.json kids[].gradeBase) and moves up each September.
// Summer belongs to the school year that just ended: "summer after 3rd grade".
export function gradeFor(kid, iso, bases = site.kids) {
  const k = bases.find((x) => x.key === kid);
  const base = k?.gradeBase;
  if (!base) return '';
  const i = GRADES.indexOf(base.grade) + (syStart(schoolYearOf(iso)) - syStart(base.schoolYear));
  if (i < 0 || i >= GRADES.length) return '';
  const g = GRADES[i];
  return seasonOf(iso) === 'summer' ? `summer after ${g}` : g;
}

export const slug = (s, n = 5) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, n).join('-')) || 'untitled';

export function baseId(kid, iso, caption) {
  return `${iso}_${kid}_${seasonOf(iso)}_${slug(caption, 4) === 'untitled' ? 'art' : slug(caption, 4)}`;
}
export const folderParts = (p) => [p.kid === 'both' ? 'Both' : KIDS[p.kid], p.schoolYear, SEASON_LABEL[p.season]];
export const webName = (id, n, small) => `${id}-${n}${small ? '-sm' : ''}.webp`;

// The details file: everything needed to show the piece again, nothing about Netlify.
export function details(p) {
  return {
    version: 1, id: p.id, kid: p.kid, date: p.date, schoolYear: p.schoolYear, season: p.season, grade: p.grade,
    caption: p.caption || '', starred: !!p.starred, deleted: p.deleted || null, created: p.created, updated: p.updated,
    photos: (p.photos || []).map((ph) => ({ n: ph.n, w: ph.w, h: ph.h, fp: ph.fp || '', edits: ph.edits || [],
      original: ph.original || null, edited: ph.edited || null, web: ph.web || null, thumb: ph.thumb || null })),
    detailsFile: p.detailsFile || null,
  };
}

export function check(p) {
  const bad = [];
  if (!KID_KEYS.includes(p.kid)) bad.push('kid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) bad.push('date');
  if (!Array.isArray(p.photos) || !p.photos.length) bad.push('photos');
  return bad;
}

// Short form for the gallery index.
export const short = (p) => ({ id: p.id, kid: p.kid, date: p.date, schoolYear: p.schoolYear, season: p.season, grade: p.grade,
  caption: p.caption || '', starred: !!p.starred, deleted: p.deleted || null, updated: p.updated,
  photos: p.photos.map((ph) => ({ n: ph.n, w: ph.w, h: ph.h })) });

export async function getPiece(context, id) { return store('pieces', context).get('p/' + id, { type: 'json' }); }

export async function savePiece(context, p) {
  const s = store('pieces', context);
  await s.setJSON('p/' + p.id, p);
  const idx = (await s.get('index', { type: 'json' })) || [];
  const i = idx.findIndex((x) => x.id === p.id);
  if (i >= 0) idx[i] = short(p); else idx.push(short(p));
  await s.setJSON('index', idx);
}

export async function readIndex(context) {
  return (await store('pieces', context).get('index', { type: 'json' })) || [];
}

// Rebuild the index from every p/<id> record (if the index is ever lost or out of step).
export async function reindex(context) {
  const s = store('pieces', context);
  const { blobs } = await s.list({ prefix: 'p/' });
  const idx = [];
  for (const b of blobs) { const p = await s.get(b.key, { type: 'json' }); if (p) idx.push(short(p)); }
  await s.setJSON('index', idx);
  return idx.length;
}
