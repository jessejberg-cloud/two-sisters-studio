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

test('anyone in the family can share a page with no PIN (the link never ends); the list needs the PIN', async () => {
  const r = await (await share(post('/api/links', fam, { pages: ['leora'], expiry: 'week' }), {})).json();
  assert.ok(r.ok); assert.equal(r.link.expires, null);
  assert.equal((await (await share(req('/api/links', fam), {})).json()).error, 'pin');
  const s = await share(post('/api/links', {}, { pages: ['leora'], expiry: 'week' }), {});
  assert.equal(s.status, 401);
});

test('a link is the key: opening it lets someone in on the chosen pages only, no password; turning it off logs them out', async () => {
  const p = await parent();
  const made = await (await share(post('/api/links', p, { pages: ['amaya', 'nope'], expiry: 'month' }), {})).json();
  assert.ok(made.ok); assert.deepEqual(made.link.pages, ['amaya']); assert.match(made.link.url, /\/s\/[A-Za-z0-9_-]{16}$/);

  const open = await share(req('/s/' + made.link.id, {}), {});
  assert.equal(open.status, 303); assert.equal(open.headers.get('location'), '/amaya/', 'one page: straight to it');
  const friend = jar(open);
  assert.equal(decodeURIComponent(friend.tssv), 'amaya');
  assert.equal((await share(req('/s/bad-link-0000000', {}), {})).headers.get('location'), 'https://twosistersstudio.com/login/?e=link', 'a made-up link does not open');
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
  const mine = list.links.find((l) => l.id === made.link.id); assert.ok(mine); assert.equal(mine.open, true);
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

test('the parent PIN is remembered on that phone for 30 days (a trusted phone, Jesse 2026-11-25)', async () => {
  const now = { tss: encodeURIComponent(await auth.makeLogin('family', {})) };   // the family password changed above
  const res = await login(post('/api/parent', now, { pin: '2468' }), { ip: '9.9.9.9' });
  assert.match(res.headers.get('set-cookie') || '', /tssp=[^;]+;.*Max-Age=2592000/i);
});

test('only the owner may set the owner PIN; then it opens For parents in every studio', async () => {
  const fam2 = { tss: encodeURIComponent(await auth.makeLogin('family', {})) };
  const plain = { ...fam2, tssp: encodeURIComponent(await auth.makeParentFor('main', {}, 15)) };
  assert.equal((await (await share(post('/api/admin/password', plain, { level: 'owner', password: '9090' }), {})).json()).error, 'pin');
  const owner = { ...fam2, tssp: encodeURIComponent(await auth.makeParentFor('*', {}, 15)) };
  const r = await share(post('/api/admin/password', owner, { level: 'owner', password: '9090' }), {});
  assert.ok((await r.json()).ok);
  assert.ok(await auth.checkOwner('9090', {}));
});
