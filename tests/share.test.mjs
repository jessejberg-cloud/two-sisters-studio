import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'y'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw'; process.env.FRIENDS_PASSWORD = 'friends-pw'; process.env.PARENT_PIN = '2468';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { default: share } = await import('../netlify/functions/share.mjs');
const { default: login } = await import('../netlify/functions/login.mjs');
const { default: pieces } = await import('../netlify/functions/pieces.mjs');

const ORIGIN = 'https://twosistersstudio.com';
const jar = (res) => Object.fromEntries((res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0].split('=')).map(([k, ...v]) => [k, v.join('=')]));
const cookieOf = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
let fam = { tss: encodeURIComponent(await auth.makeLogin('family', {})) };
const parent = async () => ({ ...fam, tssp: encodeURIComponent(await auth.makeParent({}, 15)) });
const req = (path, c, opts = {}) => new Request(ORIGIN + path, { ...opts, headers: { cookie: cookieOf(c), ...(opts.headers || {}) } });
const post = (path, c, body) => req(path, c, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('links need the parent PIN', async () => {
  const r = await (await share(post('/api/links', fam, { pages: ['leora'], expiry: 'week' }), {})).json();
  assert.equal(r.error, 'pin');
  const s = await share(post('/api/links', {}, { pages: ['leora'], expiry: 'week' }), {});
  assert.equal(s.status, 401);
});

test('a friend opens a link, logs in with the friends password, sees only the chosen pages; turning it off logs them out', async () => {
  const p = await parent();
  const made = await (await share(post('/api/links', p, { pages: ['amaya', 'nope'], expiry: 'month' }), {})).json();
  assert.ok(made.ok); assert.deepEqual(made.link.pages, ['amaya']); assert.match(made.link.url, /\/s\/[A-Za-z0-9_-]{16}$/);
  const pw = await (await share(req('/api/links/password', p), {})).json();
  assert.equal(pw.password, 'friends-pw');

  const open = await share(req('/s/' + made.link.id, {}), {});
  assert.equal(open.status, 303); assert.equal(open.headers.get('location'), '/login/?kind=friend');
  const c1 = jar(open);
  const form = (pwd) => { const f = new FormData(); f.set('password', pwd); f.set('kind', 'friend'); return f; };
  const bad = await login(req('/api/login', c1, { method: 'POST', body: form('family-pw') }), {});
  assert.match(bad.headers.get('location'), /e=pw/, 'the family password is not the friends password');
  const good = await login(req('/api/login', c1, { method: 'POST', body: form('friends-pw') }), {});
  assert.equal(good.headers.get('location'), '/');
  const friend = jar(good);
  assert.equal(decodeURIComponent(friend.tssv), 'amaya');
  const me = await auth.who(req('/', friend), {});
  assert.equal(me.role, 'friend'); assert.deepEqual(me.pages, ['amaya']);
  assert.equal(auth.friendMayOpen(me.pages, '/amaya/'), true);
  assert.equal(auth.friendMayOpen(me.pages, '/leora/'), false);
  assert.equal(auth.friendMayOpen(me.pages, '/upload/'), false);
  assert.equal(auth.friendMayOpen(me.pages, '/parent/'), false);
  assert.equal((await pieces(req('/api/pieces?kid=leora', friend), {})).status, 401);
  assert.equal((await pieces(req('/api/pieces?kid=amaya', friend), {})).status, 200);
  assert.equal((await pieces(req('/api/pieces/recent', friend), {})).status, 401, 'friends cannot edit');

  const list = await (await share(req('/api/links', p), {})).json();
  assert.equal(list.links.length, 1); assert.equal(list.links[0].open, true);
  assert.ok((await (await share(post(`/api/links/${made.link.id}/off`, p, {}), {})).json()).ok);
  auth.forgetLink(made.link.id);
  assert.equal(await auth.who(req('/', friend), {}), null, 'a turned-off link logs the friend out');
  const reopen = await share(req('/s/' + made.link.id, {}), {});
  assert.match(reopen.headers.get('location'), /e=link/);
});

test('"never" links have no end date; changing the friends password logs friends out and Send password shows the new one', async () => {
  const p = await parent();
  const made = await (await share(post('/api/links', p, { pages: ['leora', 'pet-parents'], expiry: 'never' }), {})).json();
  assert.equal(made.link.expires, null);
  const friend = { tss: encodeURIComponent(await auth.makeLogin('friend', {}, { l: made.link.id })) };
  assert.equal((await auth.who(req('/', friend), {})).role, 'friend');
  const short = await (await share(post('/api/admin/password', p, { level: 'friends', password: 'abc' }), {})).json();
  assert.equal(short.error, 'short');
  const ch = await (await share(post('/api/admin/password', p, { level: 'friends', password: 'new friends pw' }), {})).json();
  assert.ok(ch.ok);
  assert.equal(await auth.who(req('/', friend), {}), null);
  assert.equal((await (await share(req('/api/links/password', p), {})).json()).password, 'new friends pw');
  assert.equal(await auth.checkLevel('friends', 'friends-pw', {}), false);
});

test('changing the family password logs out other devices but keeps this one', async () => {
  const p = await parent();
  const other = { ...fam };
  const res = await share(post('/api/admin/password', p, { level: 'family', password: 'brand new family' }), {});
  assert.ok((await res.json()).ok);
  const mine = jar(res);
  assert.equal(await auth.who(req('/', other), {}), null, 'other devices are logged out');
  assert.equal((await auth.who(req('/', { tss: mine.tss }), {})).role, 'family', 'this device stays in');
  assert.equal(await auth.isParent(req('/', { tss: mine.tss, tssp: mine.tssp }), {}), true);
  const pin = await (await share(post('/api/admin/password', { tss: mine.tss, tssp: mine.tssp }, { level: 'pin', password: '12' }), {})).json();
  assert.equal(pin.error, 'short', 'a PIN is 4 to 8 numbers');
});
