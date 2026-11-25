// Share one picture, a few, or a whole special day (studios batch 3, 2026-11-25). The link is the key: whoever has it
// sees just those things, with no login and nothing else of the studio. It counts opens, about how many phones, and
// when it was last opened, and a parent can turn it off (or on again) on the studio's For parents.
//   POST /api/shared                    { studio, ids: [piece id | 'v:'+video id] } or { studio, day: <day key> } -> a new link
//   GET  /api/shared?studio=<slug>      the studio's links (its parent PIN, or Jesse's owner PIN)
//   POST /api/shared/<id>/off | on      turn a link off or on again (the same)
//   GET  /api/shared/<id>               what the link shows (no login; the gate lets it through)
//   GET  /api/shared/<id>/img/<piece>/<n>[/sm|/print]   a picture on the link
//   GET  /api/shared/<id>/video/<video>[/poster]        a video on the link (byte ranges)
// Opening the link itself (/s/<id>) is in share.mjs: it counts the open and sends the phone to /shared/?l=<id>.
// A day link shows the day as it is now, so photos added later show too. Put-away pieces never show.
import { who, isParent, deviceKey, mayAdd } from '../lib/auth.mjs';
import { randomId, sha256 } from '../lib/core.mjs';
import { store } from '../lib/store.mjs';
import { getStudio, getDevice, MAIN } from '../lib/studios.mjs';
import { getPiece, readIndex, studioOf, sectionOf, webName, printName } from '../lib/pieces.mjs';
import { getVideo, studioOfV, play } from './videos.mjs';
import { heads } from './studios.mjs';

const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const ID = /^[A-Za-z0-9_-]{8,40}$/;
const KEY = (id) => 'items/' + id;
const MAX = 60;
export const MANY = 20;   // phones on one link before a heads-up   // a selection: up to 60 things

export const getShare = async (id, context) => (ID.test(id || '') ? store('links', context).get(KEY(id), { type: 'json' }) : null);
export const shareOpen = (l) => !!l && !l.off;
// Open, and its studio is still on (a studio Jesse turned off or removed takes its links with it).
export async function shareLive(l, context) {
  if (!shareOpen(l)) return false;
  if (l.studio === MAIN) return true;
  const st = await getStudio(l.studio, context);
  return !!st && !st.off && !st.removed;
}
const putShare = (l, context) => store('links', context).setJSON(KEY(l.id), l);

// Someone opened the link: one more open, this phone counted once (a random cookie, kept only as a short hash).
export async function countOpen(l, phoneId, context) {
  l.opens = (l.opens || 0) + 1;
  l.last = new Date().toISOString();
  const h = (await sha256('phone:' + phoneId)).slice(0, 12);
  l.phones = Array.isArray(l.phones) ? l.phones : [];
  const isNew = !l.phones.includes(h) && l.phones.length < 500;
  if (isNew) l.phones.push(h);
  await putShare(l, context);
  // Heads-up on the studio's For parents when one link has reached many phones (it may have been passed around).
  if (isNew && l.phones.length === MANY) await heads(l.studio, 'shared', { ref: l.id, n: MANY, title: l.title || '' }, context);
}

// Only the studio's own things: a Family Moment another studio tagged in stays that studio's to share.
const pieceOk = (p, sid) => p && !p.deleted && !p.waiting && !p.purged && studioOf(p) === sid;
const videoOk = (v, sid) => v && v.ready && !v.deleted && studioOfV(v) === sid;
// A household on Jesse's studio shares only what it may see: Family Moments, its own photos, the pages Jesse ticked.
const houseSees = (me, p) => me.role !== 'house' || sectionOf(p) === 'moments' || (sectionOf(p) === 'house' && p.house === me.house)
  || (sectionOf(p) !== 'house' && (p.kid === 'both' ? ['leora', 'amaya'] : [p.kid]).some((k) => (me.pages || []).includes(k)));
// Is this one piece or video on the link? (Checked for each picture, without rebuilding the whole link.)
const onLink = (l, id, sec, event, isVideo) => (l.day ? event === l.day && (isVideo || sec === 'moments') : (l.ids || []).includes(isVideo ? 'v:' + id : id));
const videoIndex = async (context) => (await store('videos', context).get('index', { type: 'json' })) || [];

// What the link shows now: pieces (short form) and videos.
async function itemsOf(l, context) {
  const out = [];
  if (l.day) {
    for (const p of await readIndex(context)) {
      if (p.event !== l.day || p.section !== 'moments') continue;
      const full = await getPiece(context, p.id);
      if (pieceOk(full, l.studio)) out.push(pieceOut(full));
    }
    for (const v of await videoIndex(context)) {
      if (v.event !== l.day) continue;
      const full = await getVideo(context, v.id);
      if (videoOk(full, l.studio)) out.unshift(videoOut(full));
    }
    return out;
  }
  for (const id of l.ids || []) {
    if (id.startsWith('v:')) { const v = await getVideo(context, id.slice(2)); if (videoOk(v, l.studio)) out.push(videoOut(v)); }
    else { const p = await getPiece(context, id); if (pieceOk(p, l.studio)) out.push(pieceOut(p)); }
  }
  return out;
}
const pieceOut = (p) => ({ kind: 'photo', id: p.id, caption: p.caption || '', date: p.date, from: p.byName || p.from || '',
  photos: p.photos.map((ph) => ({ n: ph.n, w: ph.w, h: ph.h, print: !!ph.print })) });
const videoOut = (v) => ({ kind: 'video', id: v.id, caption: v.caption || '', date: v.date || v.eventDate, poster: !!v.poster, type: v.type });

// Who may make a link: a grown-up who adds to the studio (Jesse's family, a household on his studio, a phone added with
// the studio's Invite that is not in kid mode). Never a View link, a share link or a girl's tablet.
async function sharer(me, sid, context) {
  if (!me || !mayAdd(me, sid) || me.role === 'kid') return null;
  if (sid === MAIN && me.role === 'family') return { by: 'Family' };
  if (sid === MAIN && me.role === 'house') return { by: me.name || '', me };
  const dk = deviceKey(me, sid);
  if (!dk) return null;
  const d = await getDevice(dk.d, context);
  if (!d || d.off || d.kid) return null;
  return { by: d.name || '', device: d.id };
}

export default async (req, context) => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(2);   // after /api/shared

  // ----- making a link -----
  if (req.method === 'POST' && !parts.length) {
    const b = await req.json().catch(() => ({}));
    const sid = typeof b.studio === 'string' && b.studio ? b.studio : MAIN;
    const me = await who(req, context);
    const s = await sharer(me, sid, context);
    if (!s) return json({ error: 'login' }, 401);
    if (sid !== MAIN) { const st = await getStudio(sid, context); if (!st || st.off || st.removed) return json({ error: 'studio' }, 404); }
    const link = { id: randomId(12), kind: 'items', studio: sid, ids: [], day: null, title: String(b.title || '').slice(0, 80),
      created: new Date().toISOString(), by: s.by, device: s.device || null, opens: 0, phones: [], last: null, off: false };
    if (typeof b.day === 'string' && b.day) {
      const hit = (await readIndex(context)).find((p) => p.event === b.day && p.section === 'moments' && !p.deleted && studioOf(p) === sid)
        || (await videoIndex(context)).find((v) => v.event === b.day && !v.deleted && studioOfV(v) === sid);
      if (!hit) return json({ ok: false, error: 'day' });
      link.day = b.day;
      link.title = link.title || hit.eventTitle || '';
      link.date = hit.eventDate || '';
    } else {
      for (const id of (Array.isArray(b.ids) ? b.ids : []).slice(0, MAX)) {
        if (typeof id !== 'string' || link.ids.includes(id)) continue;
        let ok;
        if (id.startsWith('v:')) ok = videoOk(await getVideo(context, id.slice(2)), sid);
        else { const p = await getPiece(context, id); ok = pieceOk(p, sid) && (!s.me || houseSees(s.me, p)); }
        if (ok) link.ids.push(id);
      }
      if (!link.ids.length) return json({ ok: false, error: 'items' });
    }
    await putShare(link, context);
    return json({ ok: true, link: listOut(link, url.origin) });
  }

  // ----- the list, and the off switch (the studio's parent) -----
  if (req.method === 'GET' && !parts.length) {
    const sid = url.searchParams.get('studio') || MAIN;
    if (!(await isParent(req, context, sid))) return json({ error: 'pin' });
    const s = store('links', context), out = [];
    for (const b of (await s.list({ prefix: 'items/' })).blobs) {
      const l = await s.get(b.key, { type: 'json' });
      if (l && l.studio === sid) out.push(listOut(l, url.origin));
    }
    out.sort((a, b) => b.created.localeCompare(a.created));
    return json({ links: out });
  }
  const link = await getShare(parts[0], context);
  if (req.method === 'POST' && (parts[1] === 'off' || parts[1] === 'on')) {
    if (!link) return json({ error: 'unknown' }, 404);
    if (!(await isParent(req, context, link.studio))) return json({ error: 'pin' });
    link.off = parts[1] === 'off' ? new Date().toISOString() : false;
    await putShare(link, context);
    return json({ ok: true, link: listOut(link, url.origin) });
  }
  if (req.method !== 'GET') return json({ error: 'method' }, 405);

  // ----- looking (no login: the link is the key) -----
  if (!(await shareLive(link, context))) return json({ error: 'off' }, 404);
  if (parts.length === 1) {
    const st = link.studio === MAIN ? null : await getStudio(link.studio, context);
    return json({ title: link.title, date: link.date || '', studio: st ? st.name : '', items: await itemsOf(link, context) });
  }
  if (parts[1] === 'img' && /^\d+$/.test(parts[3] || '')) {
    const p = await getPiece(context, parts[2] || '');
    if (!pieceOk(p, link.studio) || !onLink(link, p.id, sectionOf(p), p.event, false)) return new Response('Not found', { status: 404 });
    const n = +parts[3], images = store('images', context);
    const got = (parts[4] === 'print' && (await images.getWithMetadata(printName(p.id, n), { type: 'arrayBuffer' })))
      || (await images.getWithMetadata(webName(p.id, n, parts[4] === 'sm'), { type: 'arrayBuffer' }));
    if (!got) return new Response('Not found', { status: 404 });
    return new Response(got.data, { headers: { 'content-type': got.metadata?.type || 'image/webp', 'cache-control': 'private, max-age=3600' } });
  }
  if (parts[1] === 'video') {
    const v = await getVideo(context, parts[2] || '');
    if (!videoOk(v, link.studio) || !onLink(link, v.id, 'moments', v.event, true)) return new Response('Not found', { status: 404 });
    if (parts[3] === 'poster') {
      const got = v.poster && (await store('images', context).getWithMetadata('vid-' + v.id, { type: 'arrayBuffer' }));
      if (!got) return new Response('Not found', { status: 404 });
      return new Response(got.data, { headers: { 'content-type': got.metadata?.type || 'image/webp', 'cache-control': 'private, max-age=3600' } });
    }
    return play(req, context, v);
  }
  return new Response('Not found', { status: 404 });
};

function listOut(l, origin) {
  return { id: l.id, studio: l.studio, title: l.title || '', day: l.day || null, ids: l.ids || [], count: l.day ? null : (l.ids || []).length,
    created: l.created, by: l.by || '', opens: l.opens || 0, phones: (l.phones || []).length, last: l.last || null,
    open: shareOpen(l), url: origin + '/s/' + l.id };
}

export const config = { path: ['/api/shared', '/api/shared/*'] };
