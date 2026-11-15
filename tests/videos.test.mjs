// Family Moments videos added from the app: start, pieces, finish, play by ranges, who may do what,
// and the site's own copy into Google Drive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'v'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '1234';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: videos, CHUNK } = await import('../netlify/functions/videos.mjs');
const { default: toDrive } = await import('../netlify/functions/video-drive-background.mjs');

// A pretend Google Drive: folders, a resumable upload session that collects the pieces, small files.
const drive = { made: [], received: [], small: [] };
let sessionOk = true;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'a', expires_in: 3600 });
  if (url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') return Response.json({ files: [] });
  if (url.includes('/drive/v3/files?fields=id')) { const b = JSON.parse(opts.body); drive.made.push(b.name); return Response.json({ id: 'F' + drive.made.length }); }
  if (url.includes('uploadType=resumable')) return new Response(null, { headers: { location: 'https://www.googleapis.com/upload/session/1' } });
  if (url.startsWith('https://www.googleapis.com/upload/session/')) {
    if (!sessionOk) return new Response('no', { status: 503 });
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(opts.headers['content-range']);
    drive.received.push([+m[1], +m[2]]);
    return +m[2] + 1 === +m[3] ? Response.json({ id: 'VIDEO1' }) : new Response(null, { status: 308, headers: { range: `bytes=0-${m[2]}` } });
  }
  if (url.includes('uploadType=multipart')) { drive.small.push(url); return Response.json({ id: 'M' + drive.small.length }); }
  return new Response('?', { status: 404 });
};
await saveGoogle({}, 'rt', {});
const family = 'tss=' + encodeURIComponent(await auth.makeLogin('family', {}));
const kid = 'tss=' + encodeURIComponent(await auth.makeLogin('kid', {}, { k: 'leora' }));
const req = (path, cookie, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, ...(opts.headers || {}) } });
const post = (path, cookie, body) => req(path, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const call = async (r) => { const res = await videos(r, {}); return { status: res.status, body: await res.clone().json().catch(() => null), res }; };

const SIZE = CHUNK * 6 + 5000;   // seven pieces: more than one play answer holds
const bytes = new Uint8Array(SIZE).map((_, i) => (i * 7) % 253);
let id;

test('family starts a video for a new special day', async () => {
  const r = await call(post('/api/videos/start', family, { eventTitle: 'Trip to the lake', eventDate: '2026-07-04', caption: 'Jumping off the dock',
    type: 'video/mp4', size: SIZE, seconds: 42.4, w: 1920, h: 1080 }));
  assert.equal(r.status, 200);
  assert.equal(r.body.chunks, 7);
  id = r.body.id;
  assert.match(id, /^2026-07-04_video_jumping-off-the-dock$/);
});

test('a name for the day is needed, and the size must make sense', async () => {
  assert.equal((await call(post('/api/videos/start', family, { eventTitle: '', size: 10 }))).status, 400);
  assert.equal((await call(post('/api/videos/start', family, { eventTitle: 'x', size: 0 }))).status, 400);
});

test('only family logins add videos; a girl\'s tablet cannot', async () => {
  assert.equal((await call(post('/api/videos/start', kid, { eventTitle: 'x', size: 10 }))).status, 401);
});

test('pieces must be the right size; it cannot finish with pieces missing', async () => {
  const bad = await call(req(`/api/videos/${id}/part/0`, family, { method: 'POST', body: bytes.slice(0, 10) }));
  assert.equal(bad.status, 400);
  await call(req(`/api/videos/${id}/part/0`, family, { method: 'POST', body: bytes.slice(0, CHUNK) }));
  const f = await call(post(`/api/videos/${id}/finish`, family, {}));
  assert.equal(f.status, 400); assert.deepEqual(f.body.missing, [1, 2, 3, 4, 5, 6]);
  assert.equal((await call(req('/api/videos', family))).body.videos.length, 0);
});

test('all pieces in: finished, on the page, waiting for its Drive copy', async () => {
  for (let i = 1; i < 7; i++) {
    const r = await call(req(`/api/videos/${id}/part/${i}`, family, { method: 'POST', body: bytes.slice(i * CHUNK, Math.min(SIZE, (i + 1) * CHUNK)) }));
    assert.equal(r.status, 200);
  }
  const f = await call(post(`/api/videos/${id}/finish`, family, {}));
  assert.equal(f.status, 200);
  const list = (await call(req('/api/videos', family))).body.videos;
  assert.equal(list.length, 1);
  assert.equal(list[0].event, '2026-07-04-trip-to-the-lake');
  assert.equal(list[0].drive, 'waiting');
});

async function range(h) {
  const res = await videos(req(`/api/videos/${id}/play`, family, { headers: h ? { range: h } : {} }), {});
  return { status: res.status, headers: res.headers, body: new Uint8Array(await res.arrayBuffer()) };
}

test('playing: ranges come back exactly, across pieces, a few pieces per answer', async () => {
  const a = await range('bytes=0-');
  assert.equal(a.status, 206);
  assert.equal(a.headers.get('content-range'), `bytes 0-${5 * CHUNK - 1}/${SIZE}`);
  assert.equal(a.body.length, 5 * CHUNK);
  assert.deepEqual(a.body.slice(CHUNK - 3, CHUNK + 3), bytes.slice(CHUNK - 3, CHUNK + 3));
  const mid = await range(`bytes=${CHUNK + 10}-${CHUNK * 3 + 20}`);
  assert.equal(mid.body.length, CHUNK * 2 + 11);
  assert.deepEqual(mid.body, bytes.slice(CHUNK + 10, CHUNK * 3 + 21));
  const tail = await range('bytes=-100');
  assert.deepEqual(tail.body, bytes.slice(SIZE - 100));
  assert.equal((await range(`bytes=${SIZE}-`)).status, 416);
});

test('a girl may watch only when a parent allowed Family Moments', async () => {
  assert.equal((await call(req('/api/videos', kid))).status, 401);
  await auth.setKidMoments('leora', true, {});
  const r = await call(req('/api/videos', kid));
  assert.equal(r.status, 200); assert.equal(r.body.videos.length, 1);
  assert.equal((await call(post(`/api/videos/${id}/delete`, kid, {}))).status, 401);
});

test('the gate lets friends and tablets reach the videos list, never the Drive copy', async () => {
  assert.equal(auth.friendMayOpen(['family-moments'], '/api/videos'), true);
  assert.equal(auth.friendMayOpen(['family-moments'], '/api/videos-drive/x'), false);
});

test('a Drive hiccup is remembered, and trying again copies the whole video into Drive', async () => {
  sessionOk = false;
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => realTimeout(fn, 0);
  await toDrive(req(`/api/videos-drive/${id}`, family, { method: 'POST' }), {});
  assert.equal((await call(req('/api/videos?all=1', family))).body.videos[0].drive, 'failed');
  sessionOk = true;
  await toDrive(req(`/api/videos-drive/${id}`, family, { method: 'POST' }), {});
  globalThis.setTimeout = realTimeout;
  assert.equal((await call(req('/api/videos?all=1', family))).body.videos[0].drive, 'done');
  assert.ok(drive.made.includes('Family Moments') && drive.made.includes('2026-07-04 Trip to the lake'));
  assert.deepEqual(drive.received.slice(-7).map((r) => r[0]), [0, 1, 2, 3, 4, 5, 6].map((i) => i * CHUNK));
  assert.equal(drive.received.at(-1)[1], SIZE - 1);
  assert.ok(drive.small.length >= 1);   // the details file
});

test('put away and bring back', async () => {
  await call(post(`/api/videos/${id}/delete`, family, {}));
  assert.equal((await call(req('/api/videos', family))).body.videos.length, 0);
  assert.equal((await range('bytes=0-')).status, 206);   // family can still reach it (to bring it back)
  await call(post(`/api/videos/${id}/restore`, family, {}));
  assert.equal((await call(req('/api/videos', family))).body.videos.length, 1);
});
