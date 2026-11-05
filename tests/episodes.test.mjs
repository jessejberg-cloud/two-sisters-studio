// Pet Parents episodes added from the app: start, audio in pieces, finish, listen with ranges, who may do what.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'e'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '1234';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: episodes, CHUNK } = await import('../netlify/functions/episodes.mjs');
const { default: gate } = await import('../netlify/edge-functions/gate.js');

const driveFiles = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'a', expires_in: 3600 });
  if (url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') return Response.json({ files: [] });
  if (url.includes('/drive/v3/files?fields=id')) return Response.json({ id: 'F' + driveFiles.push(url) });
  if (url.includes('uploadType=resumable')) return new Response(null, { headers: { location: 'https://www.googleapis.com/upload/session/' + driveFiles.push(url) } });
  if (url.includes('uploadType=multipart')) return Response.json({ id: 'M' + driveFiles.push(url) });
  return new Response('?', { status: 404 });
};
await saveGoogle({}, 'rt', {});
const family = 'tss=' + encodeURIComponent(await auth.makeLogin('family', {}));
const kid = 'tss=' + encodeURIComponent(await auth.makeLogin('kid', {}, { k: 'leora' }));
const req = (path, cookie, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, ...(opts.headers || {}) } });
const post = (path, cookie, body) => req(path, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const call = async (r) => { const res = await episodes(r, {}); return { status: res.status, body: await res.json().catch(() => null), res }; };

const SIZE = CHUNK * 2 + 1000;
const audio = new Uint8Array(SIZE).map((_, i) => i % 251);
let id;

test('family starts an episode: a number, pieces to send, and a Google Drive upload address', async () => {
  const r = await call(post('/api/episodes/start', family, { title: 'Biscuit the beagle', date: '2026-11-05', description: 'Loud dog.',
    guests: ['Grandma Ruth'], pets: [{ name: 'Biscuit', kind: 'beagle' }], minutes: 12, audioType: 'audio/mpeg', audioSize: SIZE }));
  assert.equal(r.status, 200);
  assert.equal(r.body.number, 1);
  assert.equal(r.body.chunks, 3);
  assert.match(r.body.upload, /^https:\/\/www\.googleapis\.com\/upload\/session\//);
  id = r.body.id;
  assert.match(id, /^ep-1-biscuit-the-beagle/);
});

test('a title is needed, and the audio size must make sense', async () => {
  assert.equal((await call(post('/api/episodes/start', family, { title: '', audioSize: 10 }))).status, 400);
  assert.equal((await call(post('/api/episodes/start', family, { title: 'x', audioSize: 0 }))).status, 400);
});

test('an unfinished episode is not on the page yet; it cannot finish with pieces missing', async () => {
  assert.equal((await call(req('/api/episodes', family))).body.episodes.length, 0);
  assert.equal((await call(req('/api/episodes?all=1', family))).body.episodes.length, 1);
  await call(req(`/api/episodes/${id}/audio/0`, family, { method: 'POST', body: audio.slice(0, CHUNK) }));
  const f = await call(post(`/api/episodes/${id}/finish`, family, {}));
  assert.equal(f.status, 400); assert.deepEqual(f.body.missing, [1, 2]);
});

test('a piece of the wrong size is refused', async () => {
  const r = await call(req(`/api/episodes/${id}/audio/2`, family, { method: 'POST', body: audio.slice(0, 10) }));
  assert.equal(r.status, 400); assert.equal(r.body.error, 'size');
});

test('all pieces, then finish: it is on the page, and its details go to Drive', async () => {
  await call(req(`/api/episodes/${id}/audio/1`, family, { method: 'POST', body: audio.slice(CHUNK, CHUNK * 2) }));
  await call(req(`/api/episodes/${id}/audio/2`, family, { method: 'POST', body: audio.slice(CHUNK * 2) }));
  const before = driveFiles.length;
  const f = await call(post(`/api/episodes/${id}/finish`, family, { driveAudio: 'D1' }));
  assert.equal(f.status, 200); assert.equal(f.body.episode.ready, true);
  assert.ok(driveFiles.slice(before).some((u) => u.includes('uploadType=multipart')), 'episode.json written to Drive');
  const list = (await call(req('/api/episodes', family))).body.episodes;
  assert.equal(list.length, 1); assert.equal(list[0].title, 'Biscuit the beagle');
  assert.deepEqual(list[0].pets, [{ name: 'Biscuit', kind: 'beagle' }]);
  assert.equal(list[0].driveAudio, undefined, 'no Drive ids on the page');
});

test('the player gets the right bytes, across a piece boundary too', async () => {
  let r = await episodes(req(`/api/episodes/${id}/audio`, family, { headers: { range: 'bytes=0-99' } }), {});
  assert.equal(r.status, 206); assert.equal(r.headers.get('content-range'), `bytes 0-99/${SIZE}`);
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), audio.slice(0, 100));
  r = await episodes(req(`/api/episodes/${id}/audio`, family, { headers: { range: `bytes=${CHUNK - 10}-${CHUNK + 10}` } }), {});
  assert.equal(r.headers.get('content-range'), `bytes ${CHUNK - 10}-${CHUNK - 1}/${SIZE}`, 'stops at the end of one piece');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), audio.slice(CHUNK - 10, CHUNK));
  r = await episodes(req(`/api/episodes/${id}/audio`, family, { headers: { range: 'bytes=-500' } }), {});
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), audio.slice(SIZE - 500));
  r = await episodes(req(`/api/episodes/${id}/audio`, family, { headers: { range: `bytes=${SIZE}-` } }), {});
  assert.equal(r.status, 416);
});

test('a girl’s tablet can listen (Pet Parents is one of her pages) but cannot add or change', async () => {
  assert.equal((await call(req('/api/episodes', kid))).body.episodes.length, 1);
  const r = await episodes(req(`/api/episodes/${id}/audio`, kid, { headers: { range: 'bytes=0-9' } }), {});
  assert.equal(r.status, 206);
  assert.equal((await call(post('/api/episodes/start', kid, { title: 'x', audioSize: 10 }))).status, 401);
  assert.equal((await call(post(`/api/episodes/${id}/delete`, kid, {}))).status, 401);
  assert.equal((await gate(req('/api/episodes', kid), { next: async () => new Response('ok') })).status, 200);
});

test('nobody logged in gets nothing', async () => {
  assert.equal((await call(req('/api/episodes', ''))).status, 401);
});

test('put away hides it from the page; bring back shows it again; the next number skips nothing', async () => {
  await call(post(`/api/episodes/${id}/delete`, family, {}));
  assert.equal((await call(req('/api/episodes', family))).body.episodes.length, 0);
  assert.equal((await episodes(req(`/api/episodes/${id}/audio`, kid), {})).status, 404);
  await call(post(`/api/episodes/${id}/restore`, family, {}));
  assert.equal((await call(req('/api/episodes', family))).body.episodes.length, 1);
  const r = await call(post('/api/episodes/start', family, { title: 'Two', number: 1, audioSize: 5 }));
  assert.equal(r.body.number, 2, 'number 1 is taken, so it gets the next one');
});
