// Households (Jesse, 2026-11-25): an invite link per household (Grandma's, an aunt's), no password, photos show right away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'h'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '1234';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { default: api } = await import('../netlify/functions/pieces.mjs');
const { default: img } = await import('../netlify/functions/img.mjs');
const { default: houses } = await import('../netlify/functions/houses.mjs');
const { default: videos } = await import('../netlify/functions/videos.mjs');
const { default: login } = await import('../netlify/functions/login.mjs');
const { default: whoami } = await import('../netlify/functions/admin.mjs');
const { default: gate } = await import('../netlify/edge-functions/gate.js');

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
const ctx = { next: async () => new Response('<p>page</p>', { headers: { 'content-type': 'text/html' } }) };
const family = `tss=${encodeURIComponent(await auth.makeLogin('family', {}))}`;
const parent = `${family}; tssp=${encodeURIComponent(await auth.makeParent({}, 5))}`;
const req = (path, cookie, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, ...(opts.headers || {}) } });
const post = (path, cookie, body) => req(path, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const loginOf = (res) => 'tss=' + (res.headers.get('set-cookie') || '').match(/tss=([^;]+)/)?.[1];

async function save(cookie, body) {
  const s = await (await api(post('/api/pieces/start', cookie, { date: '2026-11-20', kid: 'leora', photos: [{ originalType: 'image/jpeg', originalSize: 10 }], ...body }), {})).json();
  assert.ok(s.id, JSON.stringify(s));
  const f = new FormData();
  f.set('meta', JSON.stringify({ w: 10, h: 10 })); f.set('web', new Blob(['w'], { type: 'image/webp' }), 'w.webp'); f.set('thumb', new Blob(['t'], { type: 'image/webp' }), 't.webp');
  assert.equal((await api(req('/api/pieces/' + s.id + '/photo/1', cookie, { method: 'POST', body: f }), {})).status, 200);
  return (await (await api(post('/api/pieces/' + s.id + '/finish', cookie, {}), {})).json()).piece;
}

let grandma, invite, gma;
test('a parent makes an invite; only a parent can', async () => {
  assert.equal((await (await houses(post('/api/houses', family, { name: 'Grandma', pages: ['leora'] }), {})).json()).error, 'pin');
  const r = await (await houses(post('/api/houses', parent, { name: 'Grandma', pages: ['leora', 'nope'] }), {})).json();
  assert.equal(r.ok, true);
  grandma = r.house; invite = new URL(grandma.url).pathname;
  assert.match(invite, /^\/i\/[A-Za-z0-9_-]{24}$/);
  assert.deepEqual(grandma.pages, ['leora', 'family-moments'], 'Family Moments always, plus what was ticked');
  const list = await (await houses(req('/api/houses', parent), {})).json();
  assert.equal(list.houses.length, 1);
});

test('tapping the invite logs that phone in for a year, no password, and opens the app', async () => {
  assert.equal((await gate(req(invite, ''), ctx)).status, 200, 'the invite opens without a login');
  const res = await houses(req(invite, ''), {});
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /^\/upload\/\?welcome=1#i=/);
  assert.match(res.headers.get('set-cookie'), /Max-Age=31536000/);
  gma = loginOf(res);
  const me = await auth.who(req('/', gma), {});
  assert.equal(me.role, 'house'); assert.equal(me.name, 'Grandma');
  const w = await (await whoami(req('/api/whoami', gma), {})).json();
  assert.equal(w.role, 'house'); assert.equal(w.name, 'Grandma'); assert.equal(w.houses, undefined, 'households never see the list');
});

test('a family phone that taps an invite stays a family phone', async () => {
  const res = await houses(req(invite, family), {});
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match(res.headers.get('location'), /households/);
});

test('the gate: their pages, the app and More family yes; other girls, For parents no', async () => {
  for (const p of ['/upload/', '/leora/', '/family-moments/', '/households/']) assert.equal((await gate(req(p, gma), ctx)).status, 200, p);
  for (const p of ['/amaya/', '/parent/', '/pet-parents/']) assert.equal((await gate(req(p, gma), ctx)).headers.get('location'), 'https://twosistersstudio.com/', p);
  const page = await gate(req('/leora/', gma), ctx);
  assert.match(page.headers.get('set-cookie') || '', /tssv=leora%2Cfamily-moments%2Chouseholds%2Cupload%2Chouse/);
});

let mine;
test('their photo lands on their own page right away, in its own Drive folder, as theirs', async () => {
  mine = await save(gma, { kid: 'amaya', section: 'art', caption: 'Garden' });
  assert.equal(mine.section, 'house'); assert.equal(mine.kid, 'both'); assert.equal(mine.waiting, false); assert.equal(mine.from, 'Grandma');
  assert.ok(folders.includes("Grandma's photos"));
  const theirs = await (await api(req('/api/pieces?section=house', gma), {})).json();
  assert.deepEqual(theirs.pieces.map((p) => p.id), [mine.id]);
  const forFamily = await (await api(req('/api/pieces?section=house&house=' + grandma.id, family), {})).json();
  assert.deepEqual(forFamily.pieces.map((p) => p.id), [mine.id]);
  assert.equal((await img(req('/img/' + mine.id + '/1/sm', gma), {})).status, 200);
  assert.equal((await img(req('/img/' + mine.id + '/1/sm', family), {})).status, 200);
  const friend = `tss=${encodeURIComponent(await auth.makeLogin('friend', {}, { l: 'x' }))}`;
  assert.equal((await img(req('/img/' + mine.id + '/1/sm', friend), {})).status, 401);
});

test('their photos of a special day join the shared day, right away, marked as from them', async () => {
  const p = await save(gma, { section: 'moments', event: { title: 'Thanksgiving', date: '2026-11-26' }, caption: 'Pie' });
  assert.equal(p.section, 'moments'); assert.equal(p.event, '2026-11-26-thanksgiving'); assert.equal(p.waiting, false); assert.equal(p.from, 'Grandma');
  const m = await (await api(req('/api/pieces?section=moments', family), {})).json();
  assert.ok(m.pieces.some((x) => x.id === p.id));
  assert.ok(folders.includes('2026-11-26 Thanksgiving'));
});

test('they cannot edit, put away, see recent uploads or OK; a family phone can put theirs away', async () => {
  for (const a of ['edit', 'delete', 'ok']) assert.equal((await api(post('/api/pieces/' + mine.id + '/' + a, gma, {}), {})).status, 401);
  assert.equal((await api(req('/api/pieces/recent', gma), {})).status, 401);
  assert.equal((await api(post('/api/pieces/' + mine.id + '/delete', family, {}), {})).status, 200);
  assert.equal((await (await api(req('/api/pieces?section=house', gma), {})).json()).pieces.length, 0);
  assert.equal((await img(req('/img/' + mine.id + '/1/sm', gma), {})).status, 404);
});

test('a second household sees only its own page', async () => {
  const r = await (await houses(post('/api/houses', parent, { name: 'Aunt Sara', pages: [] }), {})).json();
  const aunt = loginOf(await houses(req(new URL(r.house.url).pathname, ''), {}));
  const p = await save(aunt, { caption: 'Beach' });
  assert.equal((await (await api(req('/api/pieces?section=house&house=' + grandma.id, aunt), {})).json()).pieces.some((x) => x.id === p.id), true, 'house= is ignored: always their own');
  assert.equal((await img(req('/img/' + p.id + '/1/sm', gma), {})).status, 404, 'Grandma cannot open the aunt\'s photo');
  assert.equal((await gate(req('/leora/', aunt), ctx)).headers.get('location'), 'https://twosistersstudio.com/');
  const all = await (await whoami(req('/api/whoami', family), {})).json();
  assert.deepEqual(all.houses.map((h) => h.name), ['Grandma', 'Aunt Sara']);
});

test('they can add a video to a special day, not change one', async () => {
  const s = await (await videos(post('/api/videos/start', gma, { eventTitle: 'Thanksgiving', eventDate: '2026-11-26', size: 5, type: 'video/mp4' }), {})).json();
  assert.ok(s.id);
  assert.equal((await videos(req('/api/videos/' + s.id + '/part/0', gma, { method: 'POST', body: new Uint8Array(5) }), {})).status, 200);
  const fin = await (await videos(post('/api/videos/' + s.id + '/finish', gma, {}), {})).json();
  assert.equal(fin.video.from, 'Grandma');
  assert.equal((await videos(post('/api/videos/' + s.id + '/delete', gma, {}), {})).status, 401);
});

test('an iPhone Home Screen app: pasting the invite link on the login page logs it in', async () => {
  const f = new FormData(); f.set('password', grandma.url); f.set('next', '/upload/');
  const res = await login(new Request('https://twosistersstudio.com/api/login', { method: 'POST', body: f }), { ip: '2.2.2.2' });
  assert.equal(res.headers.get('location'), '/upload/');
  assert.equal((await auth.who(req('/', loginOf(res)), {})).role, 'house');
  const bad = new FormData(); bad.set('password', 'https://twosistersstudio.com/i/' + 'x'.repeat(24));
  assert.match((await login(new Request('https://twosistersstudio.com/api/login', { method: 'POST', body: bad }), { ip: '2.2.2.3' })).headers.get('location'), /e=invite/);
});

test('turning it off logs their phones out; on again lets them back; a new link stops the old one', async () => {
  await houses(post('/api/houses/' + grandma.id, parent, { off: true }), {});
  assert.equal(await auth.who(req('/', gma), {}), null);
  assert.match((await houses(req(invite, ''), {})).headers.get('location'), /e=invite/);
  await houses(post('/api/houses/' + grandma.id, parent, { off: false }), {});
  assert.equal((await auth.who(req('/', gma), {})).role, 'house');
  const r = await (await houses(post('/api/houses/' + grandma.id, parent, { newLink: true, pages: ['leora', 'amaya'] }), {})).json();
  assert.equal(await auth.who(req('/', gma), {}), null, 'the old phone is logged out');
  assert.match((await houses(req(invite, ''), {})).headers.get('location'), /e=invite/, 'the old link stops');
  const fresh = loginOf(await houses(req(new URL(r.house.url).pathname, ''), {}));
  assert.deepEqual((await auth.who(req('/', fresh), {})).pages, ['leora', 'amaya', 'family-moments', 'households']);
});
