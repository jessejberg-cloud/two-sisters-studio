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
  if (url.includes('/upload/session/') && opts.method === 'PUT') return Response.json({ id: 'V' + (++fileN) });   // a video piece (the last one)
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
  assert.deepEqual(k.studio.cats, [{ key: 'lego', name: 'Lego builds', scan: false, icon: '' }]);
  const a = await (await studios(post('/api/studio/lee/parent', p, { do: 'kids', kids: [...made.studio.kids, { name: 'Aunt Bee', kind: 'adult' }] }), {})).json();
  assert.deepEqual(a.studio.kids.map((x) => x.key), ['mia', 'grandpa-joe', 'biscuit', 'aunt-bee']);
});

test('a grown-up phone adds a category from the app; a kid-mode phone cannot', async () => {
  const j = await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Kim' }), {})).json();
  const inv = new URL(j.creates[0].url).pathname;
  let p = jar('', await studios(req(inv, ''), {}));
  p = jar(p, await studios(post('/api/studios/create', p, { name: 'Kim', pin: '3333', kids: [{ name: 'Jo' }] }), {}));
  const r = await (await studios(post('/api/studio/kim/cats', p, { name: 'Awards', scan: true, icon: '🏅' }), {})).json();
  assert.deepEqual(r.cat, { key: 'awards', name: 'Awards', scan: true, icon: '🏅' });
  const again = await (await studios(post('/api/studio/kim/cats', p, { name: 'awards', scan: false }), {})).json();
  assert.equal(again.studio.cats.length, 1, 'the same name twice is one category');
  let t = jar('', await studios(req(inv, ''), {}));
  t = jar(t, await studios(post('/api/studio/kim/device', t, { kid: 'jo' }), {}));
  assert.equal((await studios(post('/api/studio/kim/cats', t, { name: 'Lego' }), {})).status, 401);
  const bad = await (await studios(post('/api/studio/kim/cats', p, { name: 'Sports', icon: '<b>' }), {})).json();
  assert.equal(bad.cat.icon, '');
});

test('a family studio adds a video: its own Family Moments, its own Drive, never Jesse\'s', async () => {
  const { default: videos } = await import('../netlify/functions/videos.mjs');
  const { copyToDrive } = await import('../netlify/functions/video-drive-background.mjs');
  const j = await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Ray' }), {})).json();
  const inv = new URL(j.creates[0].url).pathname;
  let p = jar('', await studios(req(inv, ''), {}));
  const made = await (await studios(post('/api/studios/create', p, { name: 'Ray', pin: '4444', kids: [{ name: 'Zed' }] }), {}));
  p = jar(p, made); const view = (await made.json()).view;
  p = jar(p, await studios(post('/api/studio/ray/device', p, { name: 'Dad' }), {}));
  await saveGoogle({}, 'rt-ray', {}, 'ray');
  const s = await (await videos(post('/api/videos/start', p, { studio: 'ray', eventTitle: 'Beach day', eventDate: '2026-11-20', size: 5, type: 'video/mp4' }), {})).json();
  assert.ok(s.id, JSON.stringify(s));
  assert.equal((await videos(req('/api/videos/' + s.id + '/part/0', p, { method: 'POST', body: new Uint8Array(5) }), {})).status, 200);
  const fin = await (await videos(post('/api/videos/' + s.id + '/finish', p, {}), {})).json();
  assert.equal(fin.video.from, 'Dad'); assert.equal(fin.video.studio, 'ray');
  // On Ray's Family Moments, not on Jesse's.
  const mine = await (await videos(req('/api/videos?studio=ray', p), {})).json();
  assert.deepEqual(mine.videos.map((v) => v.id), [s.id]);
  assert.ok(!(await (await videos(req('/api/videos', family), {})).json()).videos.some((v) => v.id === s.id), 'not on Jesse\'s page');
  // A View link of Ray's watches it; a stranger's phone cannot.
  const vp = jar('', await studios(req(new URL(view).pathname, ''), {}));
  assert.equal((await videos(req('/api/videos/' + s.id + '/play', vp, { headers: { range: 'bytes=0-1' } }), {})).status, 206);
  assert.equal((await videos(post('/api/videos/start', vp, { studio: 'ray', eventTitle: 'X', eventDate: '2026-11-26', size: 5 }), {})).status, 401, 'a View link only looks');
  assert.equal((await videos(req('/api/videos?studio=ray', ''), {})).status, 401);
  // Ray's Drive gets it.
  const before = fileN;
  await copyToDrive({}, s.id, 'https://twosistersstudio.com');
  const after = await (await videos(req('/api/videos?studio=ray', p), {})).json();
  assert.equal(after.videos[0].drive, 'done', JSON.stringify(after.videos[0]));
  assert.ok(fileN > before);
  // Dad can put his own video away and bring it back.
  assert.equal((await videos(post('/api/videos/' + s.id + '/delete', p, {}), {})).status, 200);
  assert.equal((await videos(post('/api/videos/' + s.id + '/restore', p, {}), {})).status, 200);
});

test('share one picture, a few, or a whole day: the link opens with no login, counts opens and phones, and can be turned off', async () => {
  const { default: shared } = await import('../netlify/functions/shared.mjs');
  const { default: share } = await import('../netlify/functions/share.mjs');
  const day = await save(phone, { studio: 'smith', section: 'moments', event: { title: 'Snow day', date: '2026-11-21' } });
  // Only grown-up phones of the studio; never a View link, never a stranger.
  assert.equal((await shared(post('/api/shared', viewer, { studio: 'smith', ids: [art.id] }), {})).status, 401);
  assert.equal((await shared(post('/api/shared', '', { studio: 'smith', ids: [art.id] }), {})).status, 401);
  const one = await (await shared(post('/api/shared', phone, { studio: 'smith', ids: [art.id, 'not-a-piece'] }), {})).json();
  assert.ok(one.ok, JSON.stringify(one));
  assert.deepEqual(one.link.ids, [art.id], 'only real pieces of this studio');
  assert.match(one.link.url, /\/s\/[A-Za-z0-9_-]{16}$/);
  const dayLink = await (await shared(post('/api/shared', phone, { studio: 'smith', day: day.event }), {})).json();
  assert.equal(dayLink.link.title, 'Snow day');
  // Opening: no login needed, the gate lets the page and its pictures through.
  const path = new URL(one.link.url).pathname;
  assert.equal((await gate(req(path, ''), ctx)).status, 200);
  let r = await share(req(path, ''), {});
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/shared/?l=' + one.link.id);
  const phoneA = jar('', r);
  await share(req(path, phoneA), {});                 // the same phone again
  await share(req(path, ''), {});                     // a second phone
  assert.equal((await gate(req('/shared/?l=' + one.link.id, ''), ctx)).status, 200);
  assert.equal((await gate(req(`/api/shared/${one.link.id}/img/${art.id}/1`, ''), ctx)).status, 200);
  const got = await (await shared(req('/api/shared/' + one.link.id, ''), {})).json();
  assert.deepEqual(got.items.map((x) => x.id), [art.id]);
  assert.equal((await shared(req(`/api/shared/${one.link.id}/img/${art.id}/1`, ''), {})).status, 200);
  assert.equal((await shared(req(`/api/shared/${one.link.id}/img/${day.id}/1`, ''), {})).status, 404, 'not on this link');
  // A day link shows the day, including photos added after it was made.
  const later = await save(phone, { studio: 'smith', section: 'moments', event: { key: day.event, title: 'Snow day', date: '2026-11-21' } });
  const d = await (await shared(req('/api/shared/' + dayLink.link.id, ''), {})).json();
  assert.deepEqual(d.items.map((x) => x.id).sort(), [day.id, later.id].sort());
  assert.equal((await shared(req(`/api/shared/${dayLink.link.id}/img/${later.id}/1/sm`, ''), {})).status, 200);
  // The list (the studio's For parents): opens, about how many phones, last opened.
  assert.equal((await (await shared(req('/api/shared?studio=smith', phone), {})).json()).error, 'pin');
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '5678' }), {}));
  const list = await (await shared(req('/api/shared?studio=smith', par), {})).json();
  const mine = list.links.find((l) => l.id === one.link.id);
  assert.equal(mine.opens, 3); assert.equal(mine.phones, 2); assert.ok(mine.last); assert.equal(mine.open, true);
  assert.equal(mine.by, 'Mom'); assert.equal(mine.count, 1);
  assert.ok(!list.links.some((l) => l.studio !== 'smith'));
  // Off: the page and the pictures stop; on again works.
  assert.ok((await (await shared(post(`/api/shared/${one.link.id}/off`, par, {}), {})).json()).ok);
  assert.equal((await shared(req('/api/shared/' + one.link.id, ''), {})).status, 404);
  assert.equal((await shared(req(`/api/shared/${one.link.id}/img/${art.id}/1`, ''), {})).status, 404);
  assert.match((await share(req(path, ''), {})).headers.get('location'), /e=link/);
  assert.ok((await (await shared(post(`/api/shared/${one.link.id}/on`, par, {}), {})).json()).ok);
  assert.equal((await shared(req('/api/shared/' + one.link.id, ''), {})).status, 200);
  // Put away: a piece put away later drops off the link.
  await api(post(`/api/pieces/${art.id}/delete`, phone, {}), {});
  assert.equal((await (await shared(req('/api/shared/' + one.link.id, ''), {})).json()).items.length, 0);
  await api(post(`/api/pieces/${art.id}/restore`, phone, {}), {});
});

test('Jesse\'s household shares from his studio too; a girl\'s tablet cannot', async () => {
  const { default: shared } = await import('../netlify/functions/shared.mjs');
  const mine = await save(family, { kid: 'leora', section: 'art', caption: 'Cat' });
  const j = await (await shared(post('/api/shared', family, { ids: [mine.id] }), {})).json();
  assert.ok(j.ok, JSON.stringify(j)); assert.equal(j.link.studio, 'main');
  assert.deepEqual((await (await shared(req('/api/shared/' + j.link.id, ''), {})).json()).items.map((x) => x.id), [mine.id]);
  const kid = `tss=${encodeURIComponent(await auth.makeLogin('kid', {}, { k: 'leora' }))}`;
  assert.equal((await shared(post('/api/shared', kid, { ids: [mine.id] }), {})).status, 401);
});

test('a shared link opened on many phones gives the studio a heads-up', async () => {
  const { default: shared, MANY } = await import('../netlify/functions/shared.mjs');
  const { default: share } = await import('../netlify/functions/share.mjs');
  const one = await (await shared(post('/api/shared', phone, { studio: 'smith', ids: [art.id] }), {})).json();
  const path = new URL(one.link.url).pathname;
  for (let i = 0; i < MANY; i++) await share(req(path, ''), {});
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '5678' }), {}));
  const p = await (await studios(req('/api/studio/smith/parent', par), {})).json();
  assert.ok(p.heads.some((h) => h.kind === 'shared' && h.ref === one.link.id), JSON.stringify(p.heads));
});

test('For parents: Download everything lists every picture of the studio with a tidy folder name, and its details', async () => {
  assert.equal((await (await studios(req('/api/studio/smith/export', phone), {})).json()).error, 'pin');
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '5678' }), {}));
  const j = await (await studios(req('/api/studio/smith/export', par), {})).json();
  assert.equal(j.ok, true, JSON.stringify(j));
  assert.equal(j.name, 'Smith');
  const a = j.files.find((f) => f.id === art.id);
  assert.ok(a, 'the art piece is in it');
  assert.equal(a.path, 'Ava/Artwork/2026-11-20_a-dog');
  assert.equal(a.url, `/img/${art.id}/1`);
  assert.ok(j.files.some((f) => f.path.startsWith('Family Moments/2026-11-21 Snow day/')), 'a day keeps its own folder');
  assert.ok(!j.files.some((f) => f.path.includes('Cat')), 'nothing from another studio');
  assert.ok(Array.isArray(j.details) && j.details.some((d) => d.id === art.id && d.caption === 'A dog'));
  assert.equal(typeof j.bytes, 'number');
});

test('review fixes: a household shares only what it may see; a removed studio takes its links; same captions both kept; a phone sees its own put-away video', async () => {
  const { default: shared } = await import('../netlify/functions/shared.mjs');
  const { default: share } = await import('../netlify/functions/share.mjs');
  const { store } = await import('../netlify/lib/store.mjs');
  // A household (Grandma): Family Moments yes, a kid page Jesse did not tick no.
  const house = { id: 'gma1', name: 'Grandma', pages: [], gen: 'g1', invite: 'x'.repeat(24), off: false };
  await store('links', {}).setJSON('house/gma1', house);
  const gma = `tss=${encodeURIComponent(await auth.makeHouseLogin(house))}`;
  const kidArt = await save(family, { kid: 'amaya', section: 'art', caption: 'Hidden' });
  assert.equal((await (await shared(post('/api/shared', gma, { ids: [kidArt.id] }), {})).json()).error, 'items');
  const fm = await save(family, { kid: 'both', section: 'moments', event: { title: 'Picnic', date: '2026-11-22' } });
  assert.ok((await (await shared(post('/api/shared', gma, { ids: [fm.id] }), {})).json()).ok);
  // Same date and caption twice: both in the zip.
  const twin = await save(phone, { studio: 'smith', kid: 'ava', section: 'art', caption: 'A dog' });
  const par = jar(phone, await studios(post('/api/studio/smith/pin', phone, { pin: '5678' }), {}));
  const ex = await (await studios(req('/api/studio/smith/export', par), {})).json();
  const paths = ex.files.filter((f) => f.id === art.id || f.id === twin.id).map((f) => f.path);
  assert.equal(new Set(paths).size, 2, JSON.stringify(paths));
  // A removed studio: its links stop.
  const one = await (await shared(post('/api/shared', phone, { studio: 'smith', ids: [art.id] }), {})).json();
  assert.equal((await shared(req('/api/shared/' + one.link.id, ''), {})).status, 200);
  const s = await store('studios', {}).get('s/smith', { type: 'json' });
  assert.ok(s, 'studio record key');
  await store('studios', {}).setJSON('s/smith', { ...s, off: true });
  const { forget } = await import('../netlify/lib/studios.mjs'); if (forget) forget('smith');
  assert.equal((await shared(req('/api/shared/' + one.link.id, ''), {})).status, 404);
  assert.match((await share(req(new URL(one.link.url).pathname, ''), {})).headers.get('location'), /e=link/);
  await store('studios', {}).setJSON('s/smith', s); if (forget) forget('smith');
});

test('a studio phone still lists its own put-away video, so it can bring it back', async () => {
  const { default: videos } = await import('../netlify/functions/videos.mjs');
  const inv = (await (await studios(post('/api/owner', owner, { do: 'invite', name: 'Lee' }), {})).json()).creates[0].url;
  let p = jar('', await studios(req(new URL(inv).pathname, ''), {}));
  const made = await studios(post('/api/studios/create', p, { name: 'Lee', pin: '7777', kids: [{ name: 'Mo' }] }), {});
  p = jar(p, made); const mj = await made.json(); const sl = mj.studio.slug;
  p = jar(p, await studios(post('/api/studio/' + sl + '/device', p, { name: 'Dad' }), {}));
  const s = await (await videos(post('/api/videos/start', p, { studio: sl, eventTitle: 'Park', eventDate: '2026-11-20', size: 5, type: 'video/mp4' }), {})).json();
  await videos(req('/api/videos/' + s.id + '/part/0', p, { method: 'POST', body: new Uint8Array(5) }), {});
  await videos(post('/api/videos/' + s.id + '/finish', p, {}), {});
  await videos(post('/api/videos/' + s.id + '/delete', p, {}), {});
  const all = await (await videos(req('/api/videos?all=1&studio=' + sl, p), {})).json();
  assert.ok(all.videos?.some((v) => v.id === s.id && v.deleted && v.mine === true), JSON.stringify([s, all]));
  assert.ok(!(await (await videos(req('/api/videos?studio=' + sl, p), {})).json()).videos.some((v) => v.id === s.id), 'not on the page');
});
