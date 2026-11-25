// Studios (build spec, 2026-11-25): Jesse invites a family, they set up their own studio, add from their phones,
// share a View link, and Family Moment photos show in the studios they tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 's'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '1234';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { saveGoogle } = await import('../netlify/lib/drive.mjs');
const { toSlug, RESERVED } = await import('../netlify/lib/studios.mjs');
const { default: studios } = await import('../netlify/functions/studios.mjs');
const { default: api } = await import('../netlify/functions/pieces.mjs');
const { default: img } = await import('../netlify/functions/img.mjs');
const { default: gate } = await import('../netlify/edge-functions/gate.js');

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
await saveGoogle({}, 'rt', {});   // Jesse's studio has Drive
const ctx = { next: async () => new Response('<p>page</p>', { headers: { 'content-type': 'text/html' } }) };
const family = `tss=${encodeURIComponent(await auth.makeLogin('family', {}))}`;
const req = (path, cookie, opts = {}) => new Request('https://twosistersstudio.com' + path, { ...opts, headers: { cookie, accept: 'text/html', ...(opts.headers || {}) } });
const post = (path, cookie, body) => req(path, cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
// Cookies a response sets, merged into a cookie header.
function jar(cookie, res) {
  const m = new Map(cookie.split('; ').filter(Boolean).map((c) => [c.split('=')[0], c]));
  for (const line of res.headers.getSetCookie?.() || [res.headers.get('set-cookie')].filter(Boolean)) {
    const [kv] = line.split(';'); const [k, v] = kv.split('=');
    if (v) m.set(k, kv); else m.delete(k);
  }
  return [...m.values()].join('; ');
}
async function ownerCookie() {
  const r = await studios(post('/api/studio/main/pin', family, { pin: '1234' }), {});
  return jar(family, r);
}
async function save(cookie, body) {
  const s = await (await api(post('/api/pieces/start', cookie, { date: '2026-11-20', photos: [{ originalType: 'image/jpeg', originalSize: 10 }], ...body }), {})).json();
  assert.ok(s.id, JSON.stringify(s));
  const f = new FormData();
  f.set('meta', JSON.stringify({ w: 10, h: 10 })); f.set('web', new Blob(['w'], { type: 'image/webp' }), 'w.webp'); f.set('thumb', new Blob(['t'], { type: 'image/webp' }), 't.webp');
  assert.equal((await api(req('/api/pieces/' + s.id + '/photo/1', cookie, { method: 'POST', body: f }), {})).status, 200);
  const fin = await (await api(post('/api/pieces/' + s.id + '/finish', cookie, {}), {})).json();
  assert.ok(fin.ok, JSON.stringify(fin));
  return { ...fin.piece, uploads: s.uploads };
}

test('addresses: made from the name, reserved names blocked', () => {
  assert.equal(toSlug('The Smith Family!'), 'smith-family');
  assert.equal(toSlug('Zoë & Co'), 'zoe-co');
  for (const r of ['api', 'for-parents', 'leora', 'upload', 'family-moments']) assert.ok(RESERVED.has(r));
});

let owner, createUrl, phone, studio;
test('only Jesse (owner PIN) makes a studio invite', async () => {
  assert.equal((await (await studios(post('/api/owner', family, { do: 'invite', name: 'Smith' }), {})).json()).error, 'pin');
  owner = await ownerCookie();
  const j = await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Smith' }), {})).json();
  assert.equal(j.ok, true);
  createUrl = new URL(j.creates[0].url).pathname;
  assert.match(createUrl, /^\/i\//);
});

test('the invite opens onboarding; a PIN is needed; the studio is made at /smith/', async () => {
  assert.equal((await gate(req(createUrl, ''), ctx)).status, 200, 'the invite opens without a login');
  let r = await studios(req(createUrl, ''), {});
  assert.equal(r.headers.get('location'), '/start/');
  phone = jar('', r);
  assert.equal((await (await studios(req('/api/studios/create', phone), {})).json()).name, 'Smith');
  assert.equal((await (await studios(post('/api/studios/create', phone, { name: 'Smith', pin: '' }), {})).json()).error, 'pin', 'PIN is the one screen without Skip');
  r = await studios(post('/api/studios/create', phone, { name: 'Smith', pin: '4321', color: 'mint', kids: [{ name: 'Ava', grade: '2nd grade' }, { name: 'Ben' }] }), {});
  const j = await r.json();
  assert.equal(j.ok, true, JSON.stringify(j));
  studio = j.studio;
  assert.equal(studio.slug, 'smith');
  assert.deepEqual(studio.kids.map((k) => k.key), ['ava', 'ben']);
  assert.equal(new URL(j.invite).pathname, createUrl, 'Jesse\'s invite is now this studio\'s Invite');
  assert.match(j.view, /\/v\//);
  phone = jar(phone, r);
  assert.match(phone, /tsk=/);
  assert.equal((await gate(req('/smith/', phone), ctx)).status, 200, 'the setup phone can open its studio');
  assert.equal((await gate(req('/upload/', phone), ctx)).status, 200, 'and the app');
  assert.equal((await gate(req('/leora/', phone), ctx)).status, 302, 'not Jesse\'s pages');
});

test('a second "Smith" becomes smith2', async () => {
  const j = await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Smith' }), {})).json();
  const p2 = jar('', await studios(req(new URL(j.creates[0].url).pathname, ''), {}));
  const r = await (await studios(post('/api/studios/create', p2, { name: 'Smith', pin: '1111' }), {})).json();
  assert.equal(r.studio.slug, 'smith2');
});

test('the phone picks its name once; that name is the "added by"', async () => {
  let s = await (await studios(req('/api/studio/smith', phone), {})).json();
  assert.equal(s.me.add, true);
  assert.equal(s.me.named, false);
  const r = await studios(post('/api/studio/smith/device', phone, { name: 'Mom' }), {});
  phone = jar(phone, r);
  s = await (await studios(req('/api/studio/smith', phone), {})).json();
  assert.equal(s.me.device.name, 'Mom');
});

let view, viewer, art;
test('a studio phone adds art for its kid; no Drive means the site keeps it', async () => {
  art = await save(phone, { studio: 'smith', kid: 'ava', section: 'art', caption: 'A dog' });
  assert.equal(art.studio, 'smith');
  assert.equal(art.byName, 'Mom');
  assert.equal(art.noDrive, true);
  assert.equal(art.uploads.length, 0, 'no Drive: no originals sent');
  assert.equal(art.grade, '2nd grade');
  const bad = await (await api(post('/api/pieces/start', phone, { studio: 'smith', kid: 'leora', date: '2026-11-20', photos: [{ originalType: 'image/jpeg' }] }), {})).json();
  assert.equal(bad.error, 'bad', 'never another studio\'s kid');
  const no = await api(post('/api/pieces/start', phone, { kid: 'leora', date: '2026-11-20', photos: [{ originalType: 'image/jpeg' }] }), {});
  assert.equal(no.status, 401, 'never Jesse\'s studio');
  const list = await (await api(req('/api/pieces?studio=smith&kid=ava', phone), {})).json();
  assert.equal(list.pieces.length, 1);
  assert.equal((await img(req(`/img/${art.id}/1`, phone), {})).status, 200);
});

test('the View link looks, never adds, and can be reset', async () => {
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '4321' }), {}));
  const p = await (await studios(req('/api/studio/smith/parent', par), {})).json();
  assert.equal(p.ok, true);
  view = new URL(p.view).pathname;
  let r = await studios(req(view, ''), {});
  assert.equal(r.headers.get('location'), '/smith/?hello=1');
  viewer = jar('', r);
  assert.equal((await gate(req('/smith/ava/', viewer), ctx)).status, 200);
  assert.equal((await gate(req('/upload/', viewer), ctx)).status, 302, 'no app for a View link');
  assert.equal((await (await api(req('/api/pieces?studio=smith&kid=ava', viewer), {})).json()).pieces.length, 1);
  assert.equal((await img(req(`/img/${art.id}/1`, viewer), {})).status, 200);
  assert.equal((await api(post('/api/pieces/start', viewer, { studio: 'smith', kid: 'ava', date: '2026-11-20', photos: [{ originalType: 'image/jpeg' }] }), {})).status, 401);
  assert.equal((await api(post(`/api/pieces/${art.id}/delete`, viewer, {}), {})).status, 401);
  // reset: the old link stops, its viewers are out; the phones that add are not
  await studios(post('/api/studio/smith/parent', par, { do: 'view-reset' }), {});
  assert.match((await studios(req(view, ''), {})).headers.get('location'), /e=link/);
  assert.equal((await gate(req('/smith/', viewer), ctx)).status, 302);
  assert.equal((await gate(req('/smith/', phone), ctx)).status, 200);
});

test('studio PINs: its own opens only its For parents; the owner PIN opens every one; a wrong PIN does not', async () => {
  assert.equal((await (await studios(post('/api/studio/smith/pin', phone, { pin: '0000' }), {})).json()).error, 'pin');
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '4321' }), {}));
  assert.equal((await (await studios(req('/api/studio/smith2/parent', par), {})).json()).error, 'pin');
  assert.equal((await (await studios(req('/api/studio/smith/parent', owner), {})).json()).ok, true);
  assert.equal((await (await studios(req('/api/studio/smith2/parent', owner), {})).json()).ok, true);
});

test('Family Moment: tagged studios show it; own studio by default; delete by who added it or Jesse', async () => {
  const fm = await save(phone, { studio: 'smith', section: 'moments', studios: ['smith', 'main', 'nope'], event: { title: 'Thanksgiving', date: '2026-11-26' } });
  assert.deepEqual(fm.studios, ['smith', 'main']);
  assert.equal(fm.eventTitle, 'Thanksgiving');
  const root = await (await api(req('/api/pieces?section=moments', family), {})).json();
  assert.ok(root.pieces.some((x) => x.id === fm.id), 'shows on Jesse\'s Family Moment');
  const two = await save(phone, { studio: 'smith', section: 'moments' });
  assert.deepEqual(two.studios, ['smith']);
  const r2 = await (await api(req('/api/pieces?section=moments', family), {})).json();
  assert.ok(!r2.pieces.some((x) => x.id === two.id), 'untagged: not on Jesse\'s');
  const s2 = await (await api(req('/api/pieces?studio=smith2&section=moments', owner), {})).json();
  assert.equal(s2.pieces.length, 0);
  assert.equal((await (await api(post(`/api/pieces/${fm.id}/delete`, phone, {}), {})).json()).ok, true, 'the phone that added it');
});

test('kid mode: a phone named after a kid cannot put things away', async () => {
  const r = await studios(req(createUrl, ''), {});   // the studio's Invite on a second phone
  let tablet = jar('', r);
  assert.match(r.headers.get('location'), /^\/upload\//);
  tablet = jar(tablet, await studios(post('/api/studio/smith/device', tablet, { kid: 'ben' }), {}));
  const p = await save(tablet, { studio: 'smith', kid: 'ben', section: 'art' });
  assert.equal(p.byName, 'Ben');
  assert.equal((await api(post(`/api/pieces/${p.id}/delete`, tablet, {}), {})).status, 401);
});

test('the family menu lists every studio with its View link', async () => {
  const m = await (await studios(req('/api/studios/menu', viewer.length ? phone : phone), {})).json();
  assert.deepEqual(m.studios.map((s) => s.slug), ['main', 'smith', 'smith2']);
  assert.ok(m.studios.every((s) => /\/v\//.test(s.view)));
});

test('Jesse\'s old logins keep working on his studio', async () => {
  assert.equal((await gate(req('/leora/', family), ctx)).status, 200);
  const p = await save(family, { kid: 'leora', section: 'art' });
  assert.ok(!p.studio, 'Jesse\'s pieces have no studio field');
  assert.ok(p.uploads.length > 0, 'his Drive gets the original');
});

test('changing a studio PIN keeps this phone in For parents; the old PIN stops working', async () => {
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '4321' }), {}));
  const r = await studios(post('/api/studio/smith/parent', par, { do: 'pin', pin: '5678' }), {});
  assert.equal((await r.json()).ok, true);
  const after = jar(par, r);
  assert.equal((await (await studios(req('/api/studio/smith/parent', after), {})).json()).ok, true, 'still in');
  assert.equal((await (await studios(req('/api/studio/smith/parent', par), {})).json()).error, 'pin', 'the old cookie is out');
  assert.equal((await (await studios(post('/api/studio/smith/pin', phone, { pin: '4321' }), {})).json()).error, 'pin');
});

test('a phone added with Jesse\'s own Invite can add a Family Moments video and watch videos and episodes', async () => {
  const { default: videos } = await import('../netlify/functions/videos.mjs');
  const { default: episodes } = await import('../netlify/functions/episodes.mjs');
  const o = await ownerCookie();
  const inv = (await (await studios(req('/api/studio/main/parent', o), {})).json()).invite;
  let gp = jar('', await studios(req(new URL(inv).pathname, ''), {}));
  gp = jar(gp, await studios(post('/api/studio/main/device', gp, { name: 'Aunt Sara' }), {}));
  assert.equal((await videos(req('/api/videos', gp), {})).status, 200);
  assert.equal((await episodes(req('/api/episodes', gp), {})).status, 200);
  const s = await (await videos(post('/api/videos/start', gp, { eventTitle: 'Thanksgiving', eventDate: '2026-11-26', size: 5, type: 'video/mp4' }), {})).json();
  assert.ok(s.id, JSON.stringify(s));
  assert.equal((await videos(req('/api/videos/' + s.id + '/part/0', gp, { method: 'POST', body: new Uint8Array(5) }), {})).status, 200);
  const fin = await (await videos(post('/api/videos/' + s.id + '/finish', gp, {}), {})).json();
  assert.equal(fin.video.from, 'Aunt Sara');
  const view = (await (await studios(req('/api/studio/main/parent', o), {})).json()).view;
  const vp = jar('', await studios(req(new URL(view).pathname, ''), {}));
  assert.equal((await videos(post('/api/videos/start', vp, { eventTitle: 'X', eventDate: '2026-11-26', size: 5 }), {})).status, 401, 'a View link only looks');
});

test('artists: a kid, a grown-up or a pet; a grown-up\'s name is not kid mode; a studio\'s own categories', async () => {
  const j = await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Lee' }), {})).json();
  let p = jar('', await studios(req(new URL(j.creates[0].url).pathname, ''), {}));
  const r = await studios(post('/api/studios/create', p, { name: 'Lee', pin: '2222', kids: [{ name: 'Mia', kind: 'kid', grade: 'K5' },
    { name: 'Grandpa Joe', kind: 'adult', grade: '3rd grade' }, { name: 'Biscuit', kind: 'pet' }], cats: [{ name: 'School papers', scan: true }, { name: 'Lego', scan: false }, { name: 'Art' }] }), {});
  const made = await r.json();
  assert.ok(made.ok, JSON.stringify(made));
  p = jar(p, r);
  assert.deepEqual(made.studio.kids.map((k) => [k.key, k.kind, k.grade]), [['mia', 'kid', 'K5'], ['grandpa-joe', 'adult', ''], ['biscuit', 'pet', '']], 'only kids have a grade');
  assert.deepEqual(made.studio.cats.map((c) => [c.key, c.scan]), [['school-papers', true], ['lego', false], ['art2', false]], 'never a built-in key');
  // Grandpa's phone: his artist name, not kid mode.
  p = jar(p, await studios(post('/api/studio/lee/device', p, { kid: 'grandpa-joe' }), {}));
  const s = await (await studios(req('/api/studio/lee', p), {})).json();
  assert.deepEqual(s.me.device, { name: 'Grandpa Joe', kid: null });
  // His Lego, in its own category, on his page.
  const lego = await save(p, { studio: 'lee', kid: 'grandpa-joe', section: 'cat', cat: 'lego', caption: 'A castle' });
  assert.equal(lego.section, 'cat'); assert.equal(lego.cat, 'lego'); assert.equal(lego.grade, '');
  const bad = await (await api(post('/api/pieces/start', p, { studio: 'lee', kid: 'mia', section: 'cat', cat: 'nope', date: '2026-11-20', photos: [{ originalType: 'image/jpeg' }] }), {})).json();
  assert.equal(bad.error, 'bad');
  const list = await (await api(req('/api/pieces?studio=lee&kid=grandpa-joe&section=cat&cat=lego', p), {})).json();
  assert.deepEqual(list.pieces.map((x) => x.id), [lego.id]);
  assert.equal((await (await api(req('/api/pieces?studio=lee&kid=grandpa-joe', p), {})).json()).pieces.length, 0, 'not in the art gallery');
  // For parents: rename a category, add an artist; keys stay.
  const k = await (await studios(post('/api/studio/lee/parent', p, { do: 'cats', cats: [{ key: 'lego', name: 'Lego builds' }] }), {})).json();
  assert.deepEqual(k.studio.cats, [{ key: 'lego', name: 'Lego builds', scan: false }]);
  const a = await (await studios(post('/api/studio/lee/parent', p, { do: 'kids', kids: [...made.studio.kids, { name: 'Aunt Bee', kind: 'adult' }] }), {})).json();
  assert.deepEqual(a.studio.kids.map((x) => x.key), ['mia', 'grandpa-joe', 'biscuit', 'aunt-bee']);
});
