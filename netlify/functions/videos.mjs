// Family Moments videos, added from the app (Jesse, 2026-11-15).
//   GET  /api/videos                   the videos on the site (family, and anyone whose pages include Family Moments)
//   GET  /api/videos?all=1             family: also unfinished and put-away videos
//   GET  /api/videos/<id>/play         the video, by byte ranges, for the page's player
//   GET  /api/videos/<id>/poster       the still picture shown before it plays
//   POST /api/videos/start             family: { event, eventTitle, eventDate, caption?, date?, type, size, seconds?, w?, h?, hevc? }
//                                      -> { id, chunkSize, chunks }
//   POST /api/videos/<id>/part/<i>     family: one piece of the video (raw bytes, exactly chunkSize except the last)
//   POST /api/videos/<id>/poster       family: the still picture (multipart: poster, meta)
//   POST /api/videos/<id>/finish       family: every piece is in -> on the Family Moments page
//   POST /api/videos/<id>/edit | delete | restore   family
//
// The phone sends the video once, to the site, in 3 MB pieces (Netlify takes at most 6 MB per request).
// The pieces live in Netlify Blobs (store "video") and play from there, so videos keep playing even if
// Google Drive is ever disconnected. Right after, the site copies the whole file into Google Drive by itself
// (functions/video-drive-background.mjs): Two Sisters Studio / Family Moments / <2026-06-14 Wedding> /.
import { who, byOf } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { slug } from '../lib/pieces.mjs';

export const CHUNK = 3 * 1024 * 1024;           // a multiple of 256 KB, so each piece is also a valid Google Drive upload piece
export const MAX_VIDEO = 2 * 1024 * 1024 * 1024; // 2 GB: about 15 minutes of phone video at 1080p
const PER_ANSWER = 5;                             // pieces per play answer (15 MB, under Netlify's 20 MB streaming limit)
const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const now = () => new Date().toISOString();
const clean = (s, n) => String(s || '').trim().slice(0, n);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const TYPES = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/x-m4v': 'm4v' };

// What the pages see (no Drive ids, no upload bookkeeping).
export const pub = (v) => ({ id: v.id, event: v.event, eventTitle: v.eventTitle, eventDate: v.eventDate, caption: v.caption,
  date: v.date, type: v.type, size: v.size, seconds: v.seconds, w: v.w, h: v.h, hevc: !!v.hevc,
  poster: v.poster ? { w: v.poster.w, h: v.poster.h } : null, ready: !!v.ready, deleted: v.deleted || null, created: v.created,
  drive: v.drive ? v.drive.state : null, from: v.from || null });

export const eventKey = (date, title) => `${date}-${slug(title, 6)}`;
export const driveFolder = (v) => ['Family Moments', `${v.eventDate} ${v.eventTitle.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60).trim()}`];
export const fileName = (v) => `${v.id}.${TYPES[v.type] || 'mp4'}`;

export const getVideo = (context, id) => store('videos', context).get('v/' + id, { type: 'json' });
async function readIndex(context) { return (await store('videos', context).get('index', { type: 'json' })) || []; }
export async function saveVideo(context, v) {
  const s = store('videos', context);
  v.updated = now();
  await s.setJSON('v/' + v.id, v);
  const idx = await readIndex(context);
  const i = idx.findIndex((x) => x.id === v.id);
  if (i >= 0) idx[i] = pub(v); else idx.push(pub(v));
  await s.setJSON('index', idx);
}

export default async (req, context) => {
  try { return await handle(req, context); }
  catch (e) {
    console.error('videos failed:', e.code || '', e.status || '', e.message);
    return json({ error: e.code || 'server', message: String(e.message || e).slice(0, 300) }, 500);
  }
};

async function handle(req, context) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(2);   // after /api/videos
  const me = await who(req, context);
  if (!me) return json({ error: 'login' }, 401);
  const family = me.role === 'family';
  const mayWatch = family || (me.pages || []).includes('family-moments');
  if (!mayWatch) return json({ error: 'page' }, 401);

  // ----- watching -----
  if (req.method === 'GET') {
    if (parts.length === 0) {
      const all = family && url.searchParams.get('all');
      const list = (await readIndex(context)).filter((v) => all || (v.ready && !v.deleted))
        .sort((a, b) => (b.eventDate + b.date + b.created).localeCompare(a.eventDate + a.date + a.created));
      return json({ videos: list });
    }
    const v = await getVideo(context, parts[0]);
    if (!v || (!family && (!v.ready || v.deleted))) return new Response('Not found', { status: 404 });
    if (parts[1] === 'play') return play(req, context, v);
    if (parts[1] === 'poster' && v.poster) {
      const got = await store('images', context).getWithMetadata('vid-' + v.id, { type: 'arrayBuffer' });
      if (!got) return new Response('Not found', { status: 404 });
      return new Response(got.data, { headers: { 'content-type': got.metadata?.type || 'image/webp', 'cache-control': 'private, max-age=86400' } });
    }
    return new Response('Not found', { status: 404 });
  }

  // A household's phone may add a video to a special day (start, its pieces, poster, finish), as itself, nothing else.
  const saver = me.role === 'house' ? byOf(me) : null;
  if (!family && !(saver && req.method === 'POST' && (parts[0] === 'start' || ['part', 'poster', 'finish'].includes(parts[1])))) return json({ error: 'family' }, 401);
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // ----- adding a video -----
  if (parts[0] === 'start') {
    const b = await req.json();
    const size = Math.floor(+b.size || 0);
    const type = TYPES[String(b.type || '').toLowerCase()] ? String(b.type).toLowerCase() : 'video/mp4';
    const eventTitle = clean(b.eventTitle, 80);
    const eventDate = isDate(b.eventDate) ? b.eventDate : (isDate(b.date) ? b.date : now().slice(0, 10));
    const bad = [];
    if (!eventTitle) bad.push('event');
    if (!size || size > MAX_VIDEO) bad.push('size');
    if (b.date && !isDate(b.date)) bad.push('date');
    if (bad.length) return json({ error: 'bad', fields: bad }, 400);
    const event = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(b.event || '') ? b.event : eventKey(eventDate, eventTitle);
    const date = isDate(b.date) ? b.date : eventDate;
    let id = `${date}_video_${slug(b.caption || eventTitle, 4)}`, n = 1;
    while (await getVideo(context, id + (n > 1 ? '-' + n : ''))) n++;
    if (n > 1) id += '-' + n;
    const v = { id, event, eventTitle, eventDate, caption: clean(b.caption, 200), date, type, size,
      seconds: Math.max(0, Math.round(+b.seconds || 0)) || null, w: Math.round(+b.w || 0) || null, h: Math.round(+b.h || 0) || null,
      hevc: !!b.hevc, chunkSize: CHUNK, chunks: Math.ceil(size / CHUNK), received: [], poster: null,
      ready: false, deleted: null, created: now(), drive: null, by: saver, from: saver ? me.name : null };
    await saveVideo(context, v);
    return json({ id, chunkSize: CHUNK, chunks: v.chunks });
  }

  const v = await getVideo(context, parts[0]);
  if (!v) return json({ error: 'unknown' }, 404);
  if (!family && v.by !== saver) return json({ error: 'family' }, 401);

  if (parts[1] === 'part') {
    const i = Math.floor(+parts[2]);
    if (!(i >= 0 && i < v.chunks)) return json({ error: 'piece' }, 400);
    const bytes = await req.arrayBuffer();
    const want = i < v.chunks - 1 ? CHUNK : v.size - CHUNK * (v.chunks - 1);
    if (bytes.byteLength !== want) return json({ error: 'size', want, got: bytes.byteLength }, 400);
    await store('video', context).set(v.id + '/' + i, bytes);
    const fresh = await getVideo(context, v.id);   // pieces can arrive close together: add to the latest record
    if (!fresh.received.includes(i)) fresh.received.push(i);
    await saveVideo(context, fresh);
    return json({ ok: true, have: fresh.received.length, of: fresh.chunks });
  }

  if (parts[1] === 'poster') {
    const form = await req.formData();
    const poster = form.get('poster'), meta = JSON.parse(form.get('meta') || '{}');
    if (!poster || poster.size > 3e6) return json({ error: 'poster' }, 400);
    const type = ['image/webp', 'image/jpeg', 'image/png'].includes(poster.type) ? poster.type : 'image/jpeg';
    await store('images', context).set('vid-' + v.id, await poster.arrayBuffer(), { metadata: { type } });
    v.poster = { w: +meta.w || 0, h: +meta.h || 0, type };
    await saveVideo(context, v);
    return json({ ok: true });
  }

  if (parts[1] === 'finish') {
    const missing = [];
    for (let i = 0; i < v.chunks; i++) if (!v.received.includes(i)) missing.push(i);
    if (missing.length) return json({ error: 'pieces-missing', missing }, 400);
    v.ready = true;
    if (!v.drive) v.drive = { state: 'waiting' };
    await saveVideo(context, v);
    return json({ ok: true, video: pub(v) });
  }

  if (parts[1] === 'edit') {
    const b = await req.json();
    if (typeof b.caption === 'string') v.caption = clean(b.caption, 200);
    if (isDate(b.date)) v.date = b.date;
    if (typeof b.eventTitle === 'string' && clean(b.eventTitle, 80)) {
      v.eventTitle = clean(b.eventTitle, 80);
      if (isDate(b.eventDate)) v.eventDate = b.eventDate;
      v.event = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(b.event || '') ? b.event : eventKey(v.eventDate, v.eventTitle);
    }
  } else if (parts[1] === 'delete') v.deleted = now();
  else if (parts[1] === 'restore') v.deleted = null;
  else return json({ error: 'action' }, 404);
  await saveVideo(context, v);
  return json({ ok: true, video: pub(v) });
}

// The player asks for byte ranges. Each answer streams up to a few stored pieces, so a long video plays
// smoothly without ever asking Netlify for one huge answer.
export async function play(req, context, v) {
  const total = v.size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = m && m[1] !== '' ? +m[1] : 0;
  let end = m && m[2] !== '' ? +m[2] : total - 1;
  if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, total - +m[2]); end = total - 1; }   // "the last N bytes"
  if (start >= total || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
  const first = Math.floor(start / CHUNK);
  end = Math.min(end, total - 1, (first + PER_ANSWER) * CHUNK - 1);
  const last = Math.floor(end / CHUNK);
  const pieces = store('video', context);
  // Read the first piece before answering, so a missing video is a clean 404 and not a broken stream.
  const head = await pieces.get(v.id + '/' + first, { type: 'arrayBuffer' });
  if (!head) return new Response('Not found', { status: 404 });
  let i = first;
  const body = new ReadableStream({
    async pull(ctl) {
      try {
        const buf = i === first ? head : await pieces.get(v.id + '/' + i, { type: 'arrayBuffer' });
        if (!buf) throw new Error('piece ' + i + ' missing');
        const from = i === first ? start - i * CHUNK : 0;
        const to = i === last ? end - i * CHUNK + 1 : buf.byteLength;
        ctl.enqueue(new Uint8Array(buf.slice(from, to)));
        if (++i > last) ctl.close();
      } catch (e) { console.error('video play failed:', v.id, e.message); ctl.error(e); }
    },
  });
  return new Response(body, { status: 206, headers: {
    'content-type': v.type, 'content-length': String(end - start + 1), 'accept-ranges': 'bytes',
    'content-range': `bytes ${start}-${end}/${total}`, 'cache-control': 'private, max-age=86400' } });
}

export const config = { path: ['/api/videos', '/api/videos/*'] };
