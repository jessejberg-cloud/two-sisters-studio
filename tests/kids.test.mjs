// The girls' tablets: own login per girl, photos wait for a parent's OK, Family Moments only when allowed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'k'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '1234';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: api } = await import('../netlify/functions/pieces.mjs');
const { default: img } = await import('../netlify/functions/img.mjs');
const { default: share } = await import('../netlify/functions/share.mjs');
const { default: login } = await import('../netlify/functions/login.mjs');
const { default: gate } = await import('../netlify/edge-functions/gate.js');
const { store } = await import('../netlify/lib/store.mjs');

let fileN = 0;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'a', expires_in: 3600 });
  if (url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') return Response.json({ files: [] });
  if (url.includes('/drive/v3/files?fields=id')) return Response.json({ id: 'F' + (++fileN) });
  if (url.includes('uploadType=resumable')) return new Response(null, { headers: { location: 'https://www.googleapis.com/upload/session/' + (++fileN) } });
  if (url.includes('uploadType=multipart')) return Response.json({ id: 'M' + (++fileN) });
  return new Response('?', { status: 404 });
};
await saveGoogle({}, 'rt', {});
const ctx = { next: async () => new Response('<p>page</p>', { headers: { 'content-type': 'text/html' } }) };
const parentCookie = `tss=${encodeURIComponent(await auth.makeLogin('family', {}))}; tssp=${encodeURIComponent(await auth.makeParent({}, 5))}`;
const req = (path, cookie, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, ...(opts.headers || {}) } });
const post = (path, cookie, body) => req(path, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const cookieOf = (res) => (res.headers.get('set-cookie') || '').match(/tss=([^;]+)/)?.[1];

let leora;
test('a parent sets a tablet password; it must differ from the family password', async () => {
  let r = await (await share(post('/api/admin/password', parentCookie, { level: 'kid-leora', password: 'family-pw' }), {})).json();
  assert.equal(r.error, 'same');
  r = await (await share(post('/api/admin/password', parentCookie, { level: 'kid-leora', password: 'rainbow' }), {})).json();
  assert.equal(r.ok, true);
  r = await (await share(post('/api/admin/password', parentCookie, { level: 'kid-amaya', password: 'rainbow' }), {})).json();
  assert.equal(r.error, 'same', 'two tablets cannot share a password');
  const k = await (await share(req('/api/admin/kids', parentCookie), {})).json();
  assert.deepEqual(k.kids.leora, { moments: false, password: true });
  assert.deepEqual(k.kids.amaya, { moments: false, password: false });
});

test('her tablet password logs in as her and lands on Add art', async () => {
  const res = await login(new Request('https://twosistersstudio.com/api/login', { method: 'POST', body: form({ password: 'rainbow', next: '/' }) }), { ip: '1.1.1.1' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/upload/');
  leora = 'tss=' + cookieOf(res);
  const me = await auth.who(req('/', leora), {});
  assert.equal(me.role, 'kid'); assert.equal(me.kid, 'leora');
  assert.ok(!me.pages.includes('family-moments'));
});

test('the gate: her pages and Add art yes; parent page and Family Moments no', async () => {
  assert.equal((await gate(req('/upload/', leora), ctx)).status, 200);
  assert.equal((await gate(req('/amaya/', leora), ctx)).status, 200);
  const page = await gate(req('/leora/', leora), ctx);
  assert.match(page.headers.get('set-cookie') || '', /tssv=leora%2Camaya%2Cpet-parents%2Cupload%2Ckid-leora/);
  assert.equal((await gate(req('/parent/', leora), ctx)).headers.get('location'), 'https://twosistersstudio.com/');
  assert.equal((await gate(req('/family-moments/', leora), ctx)).headers.get('location'), 'https://twosistersstudio.com/');
});

let photoId;
async function kidSave(cookie, body) {
  const s = await (await api(post('/api/pieces/start', cookie, { date: '2026-11-04', photos: [{ originalType: 'image/jpeg', originalSize: 100 }], ...body }), {})).json();
  const f = new FormData();
  f.set('meta', JSON.stringify({ w: 10, h: 10 })); f.set('web', new Blob(['w'], { type: 'image/webp' }), 'w.webp'); f.set('thumb', new Blob(['t'], { type: 'image/webp' }), 't.webp');
  assert.equal((await api(req('/api/pieces/' + s.id + '/photo/1', cookie, { method: 'POST', body: f }), {})).status, 200);
  const fin = await (await api(post('/api/pieces/' + s.id + '/finish', cookie, {}), {})).json();
  return fin.piece;
}

test('her photo saves as hers, into her photos, waiting for an OK', async () => {
  const p = await kidSave(leora, { kid: 'amaya', section: 'art', caption: 'My cat' });   // tries to be Amaya's art: not allowed
  photoId = p.id;
  assert.equal(p.kid, 'leora'); assert.equal(p.section, 'photos'); assert.equal(p.waiting, true);
  const shown = await (await api(req('/api/pieces?kid=leora&section=photos', parentCookie), {})).json();
  assert.equal(shown.pieces.length, 0, 'not on the site until OK');
  assert.equal((await img(req('/img/' + photoId + '/1/sm', leora), {})).status, 404);
  assert.equal((await img(req('/img/' + photoId + '/1/sm', parentCookie), {})).status, 200);
});

test('she cannot edit, delete, see recent uploads, or OK her own photo', async () => {
  for (const a of ['edit', 'delete', 'ok']) assert.equal((await api(post('/api/pieces/' + photoId + '/' + a, leora, {}), {})).status, 401);
  assert.equal((await api(req('/api/pieces/recent', leora), {})).status, 401);
  assert.equal((await api(req('/api/pieces/waiting', leora), {})).status, 401);
});

test('a parent sees it waiting, taps OK, and it shows in her photos (not her art)', async () => {
  const w = await (await api(req('/api/pieces/waiting', parentCookie), {})).json();
  assert.deepEqual(w.waiting.map((p) => p.id), [photoId]);
  assert.equal((await api(post('/api/pieces/' + photoId + '/ok', parentCookie, {}), {})).status, 200);
  const photos = await (await api(req('/api/pieces?kid=leora&section=photos', leora), {})).json();
  assert.deepEqual(photos.pieces.map((p) => p.id), [photoId]);
  const art = await (await api(req('/api/pieces?kid=leora', leora), {})).json();
  assert.ok(!art.pieces.some((p) => p.id === photoId));
  assert.equal((await img(req('/img/' + photoId + '/1/sm', leora), {})).status, 200);
});

test('Family Moments: off by default; a parent switches it on; her photo waits, then shows', async () => {
  const p0 = await kidSave(leora, { section: 'moments', caption: 'Grandma' });
  assert.equal(p0.section, 'photos', 'without permission it goes to her photos');
  await share(post('/api/admin/kids', parentCookie, { kid: 'leora', moments: true }), {});
  auth.forgetConfig();
  assert.equal((await gate(req('/family-moments/', leora), ctx)).status, 200);
  const p = await kidSave(leora, { section: 'moments', caption: 'Wedding' });
  assert.equal(p.section, 'moments'); assert.equal(p.waiting, true);
  await api(post('/api/pieces/' + p.id + '/ok', parentCookie, {}), {});
  const m = await (await api(req('/api/pieces?section=moments', leora), {})).json();
  assert.deepEqual(m.pieces.map((x) => x.id), [p.id]);
  await share(post('/api/admin/kids', parentCookie, { kid: 'leora', moments: false }), {});
  auth.forgetConfig();
  assert.equal((await api(req('/api/pieces?section=moments', leora), {})).status, 401);
});

test('changing her tablet password logs that tablet out', async () => {
  await share(post('/api/admin/password', parentCookie, { level: 'kid-leora', password: 'sunshine' }), {});
  auth.forgetConfig();
  assert.equal(await auth.who(req('/', leora), {}), null);
});
