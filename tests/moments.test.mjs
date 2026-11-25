// Family Moments photos of a special day, added from the app (Jesse, 2026-11-25): straight into the day's section.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'm'.repeat(40);
process.env.FAMILY_PASSWORD = 'fam'; process.env.FRIENDS_PASSWORD = 'fr'; process.env.PARENT_PIN = '1';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: api } = await import('../netlify/functions/pieces.mjs');
const { default: img } = await import('../netlify/functions/img.mjs');

let fileN = 0; const folders = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'a', expires_in: 3600 });
  if (url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') return Response.json({ files: [] });
  if (url.includes('/drive/v3/files?fields=id')) { try { folders.push(JSON.parse(opts.body).name); } catch {} return Response.json({ id: 'F' + (++fileN) }); }
  if (url.includes('uploadType=resumable')) return new Response(null, { headers: { location: 'https://www.googleapis.com/upload/session/' + (++fileN) } });
  if (url.includes('uploadType=multipart')) return Response.json({ id: 'M' + (++fileN) });
  return new Response('?', { status: 404 });
};
await saveGoogle({}, 'rt', {});
const fam = `tss=${encodeURIComponent(await auth.makeLogin('family', {}))}`;
const R = (path, opts = {}, cookie = fam) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, ...(opts.headers || {}) } });
const J = (path, body, cookie) => R(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, cookie);

async function addPhoto(event, extra = {}) {
  const s = await (await api(J('/api/pieces/start', { kid: 'both', section: 'moments', event, caption: '', photos: [{ originalType: 'image/jpeg', originalSize: 10 }], ...extra }), {})).json();
  assert.ok(s.id, JSON.stringify(s));
  const f = new FormData();
  f.set('meta', JSON.stringify({ w: 1600, h: 1200, fp: '0123456789abcdef', original: 'O1' }));
  f.set('web', new Blob(['web'], { type: 'image/webp' }), 'w.webp'); f.set('thumb', new Blob(['th'], { type: 'image/webp' }), 't.webp');
  assert.equal((await api(R(`/api/pieces/${s.id}/photo/1`, { method: 'POST', body: f }), {})).status, 200);
  return s.id;
}

let first;
test('photos of a new special day land in that day, in its own Drive folder', async () => {
  first = await addPhoto({ title: 'Trip to Grandma', date: '2026-07-04' });
  const p = new FormData(); p.set('print', new Blob(['P'.repeat(200)], { type: 'image/jpeg' }), 'print.jpg');
  assert.equal((await api(R(`/api/pieces/${first}/print/1`, { method: 'POST', body: p }), {})).status, 200);
  assert.ok((await (await api(R(`/api/pieces/${first}/finish`, { method: 'POST' }), {})).json()).ok);
  assert.ok(folders.includes('2026-07-04 Trip to Grandma'), 'the same Drive folder the day\'s videos use');
  const list = (await (await api(R('/api/pieces?section=moments'), {})).json()).pieces;
  assert.equal(list.length, 1);
  assert.equal(list[0].event, '2026-07-04-trip-to-grandma');
  assert.equal(list[0].eventTitle, 'Trip to Grandma');
  assert.equal(list[0].date, '2026-07-04');
  assert.equal(list[0].photos[0].print, true);
});

test('the print copy is served for Download all; without one the web copy stands in', async () => {
  assert.equal(await (await img(R(`/img/${first}/1/print`), {})).text(), 'P'.repeat(200));
  const second = await addPhoto({ key: '2026-07-04-trip-to-grandma', title: 'Trip to Grandma', date: '2026-07-04' });
  await api(R(`/api/pieces/${second}/finish`, { method: 'POST' }), {});
  assert.equal(await (await img(R(`/img/${second}/1/print`), {})).text(), 'web');
  const list = (await (await api(R('/api/pieces?section=moments'), {})).json()).pieces;
  assert.equal(list.filter((p) => p.event === '2026-07-04-trip-to-grandma').length, 2, 'both photos join the same day');
});

test('a special day needs a name and a date; "both" without a day is still refused', async () => {
  const bad = await api(J('/api/pieces/start', { kid: 'both', section: 'moments', event: { title: '', date: '2026-07-04' }, photos: [{ originalType: 'image/jpeg' }] }), {});
  assert.equal(bad.status, 400);
  const noDay = await api(J('/api/pieces/start', { kid: 'both', section: 'moments', date: '2026-07-04', photos: [{ originalType: 'image/jpeg' }] }), {});
  assert.equal(noDay.status, 400);
});

test('a friend cannot send print copies', async () => {
  const id = await addPhoto({ title: 'Beach day', date: '2026-08-01' });
  const friend = `tss=${encodeURIComponent(await auth.makeLogin('friend', {}, { l: 'x' }))}`;
  const p = new FormData(); p.set('print', new Blob(['P'.repeat(200)], { type: 'image/jpeg' }), 'print.jpg');
  assert.equal((await api(R(`/api/pieces/${id}/print/1`, { method: 'POST', body: p }, friend), {})).status, 401);
});
