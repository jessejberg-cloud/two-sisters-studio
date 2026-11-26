// Ease-of-use batch (Jesse, 2026-11-25): All (made by several artists), Whose / Where in Recent, a girl's photo in a
// special day, her waiting pictures shown (marked) but never to links, and an artist's own icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'e'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '1234';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: api } = await import('../netlify/functions/pieces.mjs');
const { default: img } = await import('../netlify/functions/img.mjs');
const { default: studios } = await import('../netlify/functions/studios.mjs');
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
const family = `tss=${encodeURIComponent(await auth.makeLogin('family', {}))}`;
const parent = `${family}; tssp=${encodeURIComponent(await auth.makeParent({}, 5))}`;
const leora = `tss=${encodeURIComponent(await auth.makeLogin('kid', {}, { k: 'leora' }))}`;
const req = (path, cookie, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, accept: 'text/html', ...(opts.headers || {}) } });
const post = (path, cookie, body) => req(path, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
function jar(cookie, res) {
  const m = new Map(cookie.split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const line of res.headers.getSetCookie?.() || []) { const [kv] = line.split(';'); const [k, v] = kv.split('='); if (v) m.set(k, kv); else m.delete(k); }
  return [...m.values()].join('; ');
}
async function save(cookie, body) {
  const s = await (await api(post('/api/pieces/start', cookie, { date: '2026-11-20', photos: [{ originalType: 'image/jpeg', originalSize: 10 }], ...body }), {})).json();
  assert.ok(s.id, JSON.stringify(s));
  const f = new FormData();
  f.set('meta', JSON.stringify({ w: 10, h: 10 })); f.set('web', new Blob(['w'], { type: 'image/webp' }), 'w.webp'); f.set('thumb', new Blob(['t'], { type: 'image/webp' }), 't.webp');
  assert.equal((await api(req('/api/pieces/' + s.id + '/photo/1', cookie, { method: 'POST', body: f }), {})).status, 200);
  const fin = await (await api(post('/api/pieces/' + s.id + '/finish', cookie, {}), {})).json();
  assert.ok(fin.ok, JSON.stringify(fin));
  return fin.piece;
}
const ids = async (path, cookie) => (await (await api(req(path, cookie), {})).json()).pieces.map((p) => p.id);

let firstBoth = null;
const both = () => firstBoth;
test('All on Jesse\'s studio: both girls, or one girl when only one is ticked', async () => {
  const bothP = await save(family, { kid: 'both', kids: ['leora', 'amaya'], caption: 'Fort' });
  assert.equal(bothP.kid, 'both'); assert.equal(bothP.kids, undefined, 'everyone: no list'); firstBoth = bothP.id;
  const one = await save(family, { kid: 'both', kids: ['amaya'], caption: 'Mask' });
  assert.equal(one.kid, 'amaya', 'only one ticked: just hers');
  assert.ok((await ids('/api/pieces?kid=leora', family)).includes(bothP.id));
  assert.ok(!(await ids('/api/pieces?kid=leora', family)).includes(one.id));
});

let fam3, owner;
test('All in a family studio with three artists: only the ticked artists\' galleries', async () => {
  owner = jar(family, await studios(post('/api/studio/main/pin', family, { pin: '1234' }), {}));
  const j = await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Ruiz' }), {})).json();
  fam3 = jar('', await studios(req(new URL(j.creates[0].url).pathname, ''), {}));
  const r = await studios(post('/api/studios/create', fam3, { name: 'Ruiz', pin: '5555', kids: [{ name: 'Ava', icon: 'dino' }, { name: 'Ben', icon: '<b>' }, { name: 'Cy' }] }), {});
  const made = await r.json(); fam3 = jar(fam3, r);
  assert.deepEqual(made.studio.kids.map((k) => k.icon), ['dino', '', ''], 'an icon from the list, or none');
  fam3 = jar(fam3, await studios(post('/api/studio/ruiz/device', fam3, { name: 'Mom' }), {}));
  const p = await save(fam3, { studio: 'ruiz', kid: 'both', kids: ['ava', 'ben'], section: 'art', caption: 'Mural' });
  assert.deepEqual([p.kid, p.kids], ['both', ['ava', 'ben']]);
  assert.ok((await ids('/api/pieces?studio=ruiz&kid=ava', fam3)).includes(p.id));
  assert.ok((await ids('/api/pieces?studio=ruiz&kid=ben', fam3)).includes(p.id));
  assert.ok(!(await ids('/api/pieces?studio=ruiz&kid=cy', fam3)).includes(p.id));
  const snap = await (await api(post('/api/pieces/start', fam3, { studio: 'ruiz', kid: 'both', section: 'photos', date: '2026-11-20', photos: [{ originalType: 'image/jpeg' }] }), {})).json();
  assert.equal(snap.error, 'bad', 'a snapshot is one artist\'s');
  // For parents: change an icon later.
  const k = await (await studios(post('/api/studio/ruiz/parent', fam3, { do: 'kids', kids: made.studio.kids.map((x) => x.key === 'cy' ? { ...x, icon: 'rocket' } : x) }), {})).json();
  assert.deepEqual(k.studio.kids.map((x) => x.icon), ['dino', '', 'rocket']);
});

test('Recent: Whose and Where can be changed (wrong artist, Artwork <-> Snapshot)', async () => {
  const p = await save(family, { kid: 'leora', caption: 'Owl' });
  let e = await (await api(post('/api/pieces/' + p.id + '/edit', family, { kid: 'amaya' }), {})).json();
  assert.equal(e.piece.kid, 'amaya');
  assert.ok((await ids('/api/pieces?kid=amaya', family)).includes(p.id));
  e = await (await api(post('/api/pieces/' + p.id + '/edit', family, { section: 'photos' }), {})).json();
  assert.equal(e.piece.section, 'photos');
  assert.ok((await ids('/api/pieces?kid=amaya&section=photos', family)).includes(p.id));
  assert.ok(!(await ids('/api/pieces?kid=amaya', family)).includes(p.id));
  e = await (await api(post('/api/pieces/' + p.id + '/edit', family, { kid: 'both' }), {})).json();
  assert.equal(e.error, 'bad', 'a snapshot cannot be All');
  const r = await (await api(post('/api/pieces/' + both() + '/edit', family, { kid: 'leora' }), {})).json();
  assert.equal(r.piece.kid, 'leora');
});

test('her photo can go in a special day already on the page, waits for the OK, and links never see it waiting', async () => {
  const day = await save(family, { section: 'moments', event: { title: 'Snow day', date: '2026-11-21' }, caption: 'Sled' });
  await (await import('../netlify/functions/share.mjs')).default(post('/api/admin/kids', parent, { kid: 'leora', moments: true }), {});
  auth.forgetConfig();
  const mine = await save(leora, { section: 'moments', event: { key: day.event }, caption: 'Snowman' });
  assert.equal(mine.event, day.event); assert.equal(mine.eventTitle, 'Snow day'); assert.equal(mine.waiting, true);
  const made = await (await api(post('/api/pieces/start', leora, { section: 'moments', event: { title: 'My party', date: '2026-11-22' }, date: '2026-11-22', photos: [{ originalType: 'image/jpeg' }] }), {})).json();
  const rec = await store('pending', {}).get('p/' + made.id, { type: 'json' });
  assert.equal(rec.piece.event, undefined, 'a girl never makes a new day');
  const m = await (await api(req('/api/pieces?section=moments', leora), {})).json();
  assert.equal(m.pieces.find((x) => x.id === mine.id).waiting, true, 'she sees it, marked');
  await store('links', {}).setJSON('link/L9', { id: 'L9', pages: ['family-moments', 'leora'], expires: Date.now() + 86400000 });
  const fr = `tss=${encodeURIComponent(await auth.makeLogin('friend', {}, { l: 'L9' }))}`;
  assert.ok(!(await ids('/api/pieces?section=moments', fr)).includes(mine.id), 'a link never sees a waiting picture');
  assert.equal((await img(req('/img/' + mine.id + '/1/sm', fr), {})).status, 404);
  const amaya = `tss=${encodeURIComponent(await auth.makeLogin('kid', {}, { k: 'amaya' }))}`;
  assert.equal((await img(req('/img/' + mine.id + '/1/sm', amaya), {})).status, 404);
});
