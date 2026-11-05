// Pet Parents episodes, added from the app (Jesse, 2026-11-05).
//   GET  /api/episodes                       the episode list (family, and anyone whose pages include Pet Parents)
//   GET  /api/episodes?all=1                 family: also unfinished and put-away episodes
//   GET  /api/episodes/<id>/audio            the audio, in pieces (Range requests), for the page's player
//   GET  /api/episodes/<id>/drawing[/sm]     the episode drawing, if it has one
//   POST /api/episodes/start                 family: { title, number?, date, description, guests[], pets[], minutes,
//                                            audioType, audioSize } -> { id, number, chunkSize, chunks, upload }
//   POST /api/episodes/<id>/audio/<i>        family: one piece of the audio (raw bytes, at most chunkSize)
//   POST /api/episodes/<id>/drawing          family: the drawing (multipart: web, thumb, meta)
//   POST /api/episodes/<id>/finish           family: { driveAudio? } -> on the site
//   POST /api/episodes/<id>/edit | delete | restore   family
//
// Where things live. Google Drive (the archive): Two Sisters Studio / Pet Parents / Episode 3 - <title> /
//   the original audio (sent by the phone straight to Google), the drawing, and episode.json (the details).
// Netlify Blobs (for playing): episodes e/<id> + index, audio <id>/<i> (3 MB pieces, under Netlify's 6 MB limit).
import { who } from '../lib/auth.mjs';
import { store } from '../lib/store.mjs';
import { folder, putSmall, uploadAddress } from '../lib/drive.mjs';
import { slug } from '../lib/pieces.mjs';

export const CHUNK = 3 * 1024 * 1024;
const MAX_AUDIO = 400 * 1024 * 1024;
const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const now = () => new Date().toISOString();
const clean = (s, n) => String(s || '').trim().slice(0, n);

// What the pages see (no Drive ids, no upload bookkeeping).
export const pub = (e) => ({ id: e.id, number: e.number, title: e.title, date: e.date, description: e.description,
  guests: e.guests, pets: e.pets, minutes: e.minutes, audioType: e.audioType, audioSize: e.audioSize,
  drawing: e.drawing ? { w: e.drawing.w, h: e.drawing.h } : null, ready: !!e.ready, deleted: e.deleted || null, created: e.created });

const getEp = (context, id) => store('episodes', context).get('e/' + id, { type: 'json' });
async function readIndex(context) { return (await store('episodes', context).get('index', { type: 'json' })) || []; }
async function saveEp(context, e) {
  const s = store('episodes', context);
  e.updated = now();
  await s.setJSON('e/' + e.id, e);
  const idx = await readIndex(context);
  const i = idx.findIndex((x) => x.id === e.id);
  if (i >= 0) idx[i] = pub(e); else idx.push(pub(e));
  await s.setJSON('index', idx);
}
const folderOf = (e) => ['Pet Parents', `Episode ${e.number} - ${e.title.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60).trim()}`];
const details = (e) => ({ version: 1, kind: 'pet-parents-episode', ...pub(e), driveAudio: e.driveAudio || null, updated: e.updated });
async function writeDetails(context, e) {
  const parent = await folder(context, folderOf(e));
  const r = await putSmall(context, parent, 'episode.json', 'application/json', JSON.stringify(details(e), null, 2), e.detailsFile, { tss: 'episode' });
  e.detailsFile = r.id;
}

function people(list) { return (Array.isArray(list) ? list : []).map((x) => clean(x, 60)).filter(Boolean).slice(0, 8); }
function pets(list) {
  return (Array.isArray(list) ? list : []).map((p) => ({ name: clean(p && p.name, 40), kind: clean(p && p.kind, 40) })).filter((p) => p.name).slice(0, 8);
}
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

export default async (req, context) => {
  try { return await handle(req, context); }
  catch (e) {
    console.error('episodes failed:', e.code || '', e.status || '', e.message);
    return json({ error: e.code || 'server', message: String(e.message || e).slice(0, 300) }, 500);
  }
};

async function handle(req, context) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean).slice(2);   // after /api/episodes
  const me = await who(req, context);
  if (!me) return json({ error: 'login' }, 401);
  const family = me.role === 'family';
  const mayListen = family || (me.pages || []).includes('pet-parents');
  if (!mayListen) return json({ error: 'page' }, 401);

  // ----- listening -----
  if (req.method === 'GET') {
    if (parts.length === 0) {
      const all = family && url.searchParams.get('all');
      const list = (await readIndex(context)).filter((e) => all || (e.ready && !e.deleted)).sort((a, b) => b.number - a.number);
      return json({ episodes: list });
    }
    const e = await getEp(context, parts[0]);
    if (!e || (!family && (!e.ready || e.deleted))) return new Response('Not found', { status: 404 });
    if (parts[1] === 'audio') return audio(req, context, e);
    if (parts[1] === 'drawing' && e.drawing) {
      const got = await store('images', context).getWithMetadata('ep-' + e.id + (parts[2] === 'sm' ? '-sm' : ''), { type: 'arrayBuffer' });
      if (!got) return new Response('Not found', { status: 404 });
      return new Response(got.data, { headers: { 'content-type': got.metadata?.type || 'image/webp', 'cache-control': 'private, max-age=86400' } });
    }
    return new Response('Not found', { status: 404 });
  }

  if (!family) return json({ error: 'family' }, 401);
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // ----- adding an episode -----
  if (parts[0] === 'start') {
    const b = await req.json();
    const title = clean(b.title, 120);
    const size = +b.audioSize || 0;
    const type = /^audio\/[a-z0-9.+-]+$/i.test(b.audioType || '') ? b.audioType : 'audio/mpeg';
    const bad = [];
    if (!title) bad.push('title');
    if (!size || size > MAX_AUDIO) bad.push('audio');
    if (b.date && !isDate(b.date)) bad.push('date');
    if (bad.length) return json({ error: 'bad', fields: bad }, 400);
    const idx = await readIndex(context);
    const taken = new Set(idx.filter((e) => !e.deleted).map((e) => e.number));
    let number = Math.floor(+b.number || 0);
    if (number < 1 || taken.has(number)) number = Math.max(0, ...idx.map((e) => e.number)) + 1;
    let id = `ep-${number}-${slug(title, 5)}`, n = 1;
    while (await getEp(context, id + (n > 1 ? '-' + n : ''))) n++;
    if (n > 1) id += '-' + n;
    const e = { id, number, title, date: isDate(b.date) ? b.date : now().slice(0, 10), description: clean(b.description, 1000),
      guests: people(b.guests), pets: pets(b.pets), minutes: Math.max(0, Math.round(+b.minutes || 0)) || null,
      audioType: type, audioSize: size, chunkSize: CHUNK, chunks: Math.ceil(size / CHUNK), received: [],
      drawing: null, ready: false, deleted: null, created: now() };
    const ext = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' }[type] || 'audio';
    let upload = null;
    try {
      const parent = await folder(context, folderOf(e));
      upload = await uploadAddress(context, parent, `episode-${number}-${slug(title, 5)}.${ext}`, type, size, url.origin);
    } catch (err) {
      // Drive not connected (or a hiccup): the episode still goes on the site; the archive copy is skipped.
      console.error('episode drive address failed:', err.message);
    }
    await saveEp(context, e);
    return json({ id, number, chunkSize: CHUNK, chunks: e.chunks, upload });
  }

  const e = await getEp(context, parts[0]);
  if (!e) return json({ error: 'unknown' }, 404);

  if (parts[1] === 'audio') {
    const i = Math.floor(+parts[2]);
    if (!(i >= 0 && i < e.chunks)) return json({ error: 'piece' }, 400);
    const bytes = await req.arrayBuffer();
    const want = i < e.chunks - 1 ? CHUNK : e.audioSize - CHUNK * (e.chunks - 1);
    if (bytes.byteLength !== want) return json({ error: 'size', want, got: bytes.byteLength }, 400);
    await store('audio', context).set(e.id + '/' + i, bytes);
    const fresh = await getEp(context, e.id);   // pieces can arrive close together: add to the latest record
    if (!fresh.received.includes(i)) fresh.received.push(i);
    await saveEp(context, fresh);
    return json({ ok: true, have: fresh.received.length, of: fresh.chunks });
  }

  if (parts[1] === 'drawing') {
    const form = await req.formData();
    const web = form.get('web'), thumb = form.get('thumb'), meta = JSON.parse(form.get('meta') || '{}');
    if (!web || !thumb || web.size > 3e6 || thumb.size > 1e6) return json({ error: 'web' }, 400);
    const type = ['image/webp', 'image/jpeg', 'image/png'].includes(web.type) ? web.type : 'image/jpeg';
    const images = store('images', context);
    await images.set('ep-' + e.id, await web.arrayBuffer(), { metadata: { type } });
    await images.set('ep-' + e.id + '-sm', await thumb.arrayBuffer(), { metadata: { type } });
    e.drawing = { w: +meta.w || 0, h: +meta.h || 0, type };
    try {
      const parent = await folder(context, folderOf(e));
      const f = await putSmall(context, parent, 'drawing.' + (type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg'), type, await web.arrayBuffer());
      e.drawing.drive = f.id;
    } catch (err) { console.error('episode drawing to drive failed:', err.message); }
    await saveEp(context, e);
    return json({ ok: true });
  }

  if (parts[1] === 'finish') {
    const b = await req.json().catch(() => ({}));
    const missing = [];
    for (let i = 0; i < e.chunks; i++) if (!e.received.includes(i)) missing.push(i);
    if (missing.length) return json({ error: 'pieces-missing', missing }, 400);
    if (typeof b.driveAudio === 'string') e.driveAudio = b.driveAudio.slice(0, 200);
    e.ready = true;
    try { await writeDetails(context, e); } catch (err) { console.error('episode details to drive failed:', err.message); }
    await saveEp(context, e);
    return json({ ok: true, episode: pub(e) });
  }

  if (parts[1] === 'edit') {
    const b = await req.json();
    if (typeof b.title === 'string' && clean(b.title, 120)) e.title = clean(b.title, 120);
    if (typeof b.description === 'string') e.description = clean(b.description, 1000);
    if (isDate(b.date)) e.date = b.date;
    if (b.guests) e.guests = people(b.guests);
    if (b.pets) e.pets = pets(b.pets);
    if (b.number) {
      const n = Math.floor(+b.number);
      const idx = await readIndex(context);
      if (n < 1 || idx.some((x) => x.number === n && x.id !== e.id && !x.deleted)) return json({ error: 'number' }, 400);
      e.number = n;
    }
  } else if (parts[1] === 'delete') e.deleted = now();
  else if (parts[1] === 'restore') e.deleted = null;
  else return json({ error: 'action' }, 404);
  try { await writeDetails(context, e); } catch (err) { console.error('episode details to drive failed:', err.message); }
  await saveEp(context, e);
  return json({ ok: true, episode: pub(e) });
}

// The player asks for byte ranges; each answer is at most one stored piece (under Netlify's response limit).
async function audio(req, context, e) {
  const total = e.audioSize;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  let start = m && m[1] !== '' ? +m[1] : 0;
  let end = m && m[2] !== '' ? +m[2] : total - 1;
  if (m && m[1] === '' && m[2] !== '') { start = Math.max(0, total - +m[2]); end = total - 1; }   // "the last N bytes"
  if (start >= total || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
  const i = Math.floor(start / CHUNK);
  end = Math.min(end, total - 1, (i + 1) * CHUNK - 1);
  const piece = await store('audio', context).get(e.id + '/' + i, { type: 'arrayBuffer' });
  if (!piece) return new Response('Not found', { status: 404 });
  const body = piece.slice(start - i * CHUNK, end - i * CHUNK + 1);
  return new Response(body, { status: 206, headers: {
    'content-type': e.audioType, 'content-length': String(body.byteLength), 'accept-ranges': 'bytes',
    'content-range': `bytes ${start}-${end}/${total}`, 'cache-control': 'private, max-age=86400' } });
}

export const config = { path: ['/api/episodes', '/api/episodes/*'] };
