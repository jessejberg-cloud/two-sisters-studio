import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'z'.repeat(40);
process.env.FAMILY_PASSWORD = 'fam'; process.env.FRIENDS_PASSWORD = 'fr'; process.env.PARENT_PIN = '1';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: api } = await import('../netlify/functions/pieces.mjs');
const { default: img } = await import('../netlify/functions/img.mjs');
const { store } = await import('../netlify/lib/store.mjs');

let fileN = 0; const driveFiles = {}; const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); calls.push([opts.method || 'GET', url]);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'a', expires_in: 3600 });
  if (url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') return Response.json({ files: [] });
  if (url.includes('/drive/v3/files?fields=id')) return Response.json({ id: 'F' + (++fileN) });
  if (url.includes('uploadType=resumable')) return new Response(null, { headers: { location: 'https://www.googleapis.com/upload/session/' + (++fileN) } });
  if (url.includes('uploadType=multipart')) { const id = url.match(/files\/([A-Za-z0-9]+)\?/)?.[1] || 'M' + (++fileN); driveFiles[id] = opts.method; return Response.json({ id }); }
  return new Response('?', { status: 404 });
};
await saveGoogle({}, 'rt', {});
const fam = `tss=${encodeURIComponent(await auth.makeLogin('family', {}))}`;
const R = (path, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie: fam, ...(opts.headers || {}) } });
const J = (path, body) => R(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('save a two-photo piece end to end, with a retry', async () => {
  const start = { clientId: 'phone-1', kid: 'leora', date: '2026-11-03', caption: 'Dog in the rain', starred: false,
    photos: [{ originalType: 'image/jpeg', originalSize: 1000, edited: true, editedSize: 500 }, { originalType: 'image/jpeg', originalSize: 900 }] };
  const s1 = await (await api(J('/api/pieces/start', start), {})).json();
  assert.equal(s1.id, '2026-11-03_leora_fall_dog-in-the-rain');
  assert.equal(s1.uploads.length, 3);
  const again = await (await api(J('/api/pieces/start', start), {})).json();
  assert.deepEqual(again, s1, 'a retry gets the same id and addresses');
  for (const n of [1, 2]) {
    const f = new FormData();
    f.set('meta', JSON.stringify({ w: 1600, h: 1200, fp: n === 1 ? 'ffff0000ffff0000' : '0123456789abcdef', original: 'O' + n, edited: n === 1 ? 'E1' : null, edits: ['crop'] }));
    f.set('web', new Blob(['web' + n], { type: 'image/webp' }), 'w.webp');
    f.set('thumb', new Blob(['th' + n], { type: 'image/webp' }), 't.webp');
    const r = await api(R(`/api/pieces/${s1.id}/photo/${n}`, { method: 'POST', body: f }), {});
    assert.equal(r.status, 200);
  }
  const fin = await (await api(R(`/api/pieces/${s1.id}/finish`, { method: 'POST' }), {})).json();
  assert.ok(fin.ok);
  assert.equal(fin.piece.grade, '3rd grade');
  const fin2 = await (await api(R(`/api/pieces/${s1.id}/finish`, { method: 'POST' }), {})).json();
  assert.ok(fin2.ok, 'finishing twice is fine');
  const list = await (await api(R('/api/pieces?kid=leora'), {})).json();
  assert.equal(list.pieces.length, 1);
  assert.equal(list.pieces[0].photos.length, 2);
  const none = await (await api(R('/api/pieces?kid=amaya'), {})).json();
  assert.equal(none.pieces.length, 0);
  const pic = await img(R(`/img/${s1.id}/1/sm`), {});
  assert.equal(await pic.text(), 'th1');
  assert.equal(pic.headers.get('content-type'), 'image/webp');
});

test('same name on the same day gets -2; both pieces show in both galleries', async () => {
  const mk = async (kid) => {
    const s = await (await api(J('/api/pieces/start', { kid, date: '2026-11-03', caption: 'Dog in the rain', photos: [{ originalType: 'image/jpeg' }] }), {})).json();
    const f = new FormData(); f.set('meta', '{"w":10,"h":10,"fp":"ffff0000ffff0001"}'); f.set('web', new Blob(['w'], { type: 'image/jpeg' })); f.set('thumb', new Blob(['t'], { type: 'image/jpeg' }));
    await api(R(`/api/pieces/${s.id}/photo/1`, { method: 'POST', body: f }), {});
    await api(R(`/api/pieces/${s.id}/finish`, { method: 'POST' }), {});
    return s.id;
  };
  assert.equal(await mk('leora'), '2026-11-03_leora_fall_dog-in-the-rain-2');
  const both = await mk('both');
  const a = await (await api(R('/api/pieces?kid=amaya'), {})).json();
  assert.deepEqual(a.pieces.map((p) => p.id), [both]);
  const l = await (await api(R('/api/pieces?kid=leora'), {})).json();
  assert.equal(l.pieces.length, 3);
});

test('duplicates, edit, delete and restore', async () => {
  const d = await (await api(R('/api/pieces/dupes?fp=ffff0000ffff0000'), {})).json();
  assert.ok(d.matches.length >= 2, 'close fingerprints count as duplicates');
  const id = '2026-11-03_leora_fall_dog-in-the-rain';
  const e = await (await api(J(`/api/pieces/${id}/edit`, { caption: 'Wet dog', starred: true, date: '2027-07-01' }), {})).json();
  assert.equal(e.piece.caption, 'Wet dog');
  assert.equal(e.piece.grade, 'summer after 3rd grade');
  assert.equal(e.piece.season, 'summer');
  await api(J(`/api/pieces/${id}/delete`, {}), {});
  let l = await (await api(R('/api/pieces?kid=leora'), {})).json();
  assert.ok(!l.pieces.some((p) => p.id === id));
  const rec = await (await api(R('/api/pieces/recent'), {})).json();
  assert.equal(rec.deleted[0].id, id);
  await api(J(`/api/pieces/${id}/restore`, {}), {});
  l = await (await api(R('/api/pieces?kid=leora'), {})).json();
  assert.ok(l.pieces.some((p) => p.id === id));
});

test('friends read only their kids, never save', async () => {
  await store('links', {}).setJSON('link/L1', { id: 'L1', pages: ['amaya'], expires: Date.now() + 86400000 });
  const fr = `tss=${encodeURIComponent(await auth.makeLogin('friend', {}, { l: 'L1' }))}`;
  const F = (path, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie: fr, ...(opts.headers || {}) } });
  assert.equal((await api(F('/api/pieces?kid=amaya'), {})).status, 200);
  assert.equal((await api(F('/api/pieces?kid=leora'), {})).status, 401);
  assert.equal((await api(F('/api/pieces/start', { method: 'POST', body: '{}' }), {})).status, 401);
  assert.equal((await img(F('/img/2026-11-03_leora_fall_dog-in-the-rain/1'), {})).status, 404);
  await store('links', {}).setJSON('link/L1', { id: 'L1', pages: ['amaya'], off: true });
  auth.forgetLink('L1');
  assert.equal((await api(F('/api/pieces?kid=amaya'), {})).status, 401, 'a turned-off link stops working');
});
