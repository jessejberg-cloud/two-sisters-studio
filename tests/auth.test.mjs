import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
import { sign, verify, encrypt, decrypt, hashPassword, checkPassword } from '../netlify/lib/core.mjs';

process.env.TSS_SECRET = 'x'.repeat(40);
process.env.FAMILY_PASSWORD = 'family-pw';
process.env.FRIENDS_PASSWORD = 'friends-pw';
process.env.PARENT_PIN = '2468';
useTestStores({});
const auth = await import('../netlify/lib/auth.mjs');
const { default: login } = await import('../netlify/functions/login.mjs');
const { default: gate } = await import('../netlify/edge-functions/gate.js');
const ctx = { ip: '1.2.3.4', next: async () => new Response('page', { status: 200 }) };
const form = (o) => new URLSearchParams(o);
const req = (path, opts = {}) => new Request('https://twosistersstudio.com' + path, opts);
const cookieFrom = (res) => (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('signed tokens resist tampering and expire', async () => {
  const t = await sign({ r: 'family', exp: Date.now() + 1000 }, 's'.repeat(40));
  assert.equal((await verify(t, 's'.repeat(40))).r, 'family');
  assert.equal(await verify(t.replace(/^./, 'x'), 's'.repeat(40)), null);
  assert.equal(await verify(t, 'o'.repeat(40)), null);
  assert.equal(await verify(await sign({ exp: Date.now() - 1 }, 's'.repeat(40)), 's'.repeat(40)), null);
});
test('encryption and password hashes', async () => {
  assert.equal(await decrypt(await encrypt('refresh', 'k'.repeat(40)), 'k'.repeat(40)), 'refresh');
  const h = await hashPassword('pw');
  assert.ok(await checkPassword('pw', h));
  assert.ok(!(await checkPassword('nope', h)));
});
test('gate sends strangers to the login page', async () => {
  const r = await gate(req('/leora/', { headers: { accept: 'text/html' } }), ctx);
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /\/login\/\?next=%2Fleora%2F/);
  const r2 = await gate(req('/assets/art/leora/x.webp'), ctx);
  assert.equal(r2.status, 401);
  assert.equal((await gate(req('/login/'), ctx)).status, 200);
});
let familyCookie;
test('family password logs in; wrong one does not', async () => {
  const bad = await login(req('/api/login', { method: 'POST', body: form({ password: 'nope', next: '/amaya/' }) }), { ip: '9.9.9.9' });
  assert.match(bad.headers.get('location'), /e=pw/);
  const ok = await login(req('/api/login', { method: 'POST', body: form({ password: 'family-pw', next: '/amaya/' }) }), ctx);
  assert.equal(ok.headers.get('location'), '/amaya/');
  familyCookie = cookieFrom(ok);
  assert.match(familyCookie, /^tss=/);
  const page = await gate(req('/amaya/', { headers: { cookie: familyCookie } }), ctx);
  assert.equal(page.status, 200);
});
test('open redirect is refused', async () => {
  const ok = await login(req('/api/login', { method: 'POST', body: form({ password: 'family-pw', next: '//evil.example' }) }), ctx);
  assert.equal(ok.headers.get('location'), '/');
});
test('too many wrong tries lock that address for a while', async () => {
  const c = { ip: '5.5.5.5' };
  for (let i = 0; i < 8; i++) await login(req('/api/login', { method: 'POST', body: form({ password: 'x' }) }), c);
  const r = await login(req('/api/login', { method: 'POST', body: form({ password: 'family-pw' }) }), c);
  assert.match(r.headers.get('location'), /e=wait/);
});
test('parent PIN needs a family login and the right PIN', async () => {
  const no = await login(req('/api/parent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"pin":"2468"}' }), ctx);
  assert.equal(no.status, 401);
  const wrong = await login(req('/api/parent', { method: 'POST', headers: { 'content-type': 'application/json', cookie: familyCookie }, body: '{"pin":"1111"}' }), ctx);
  assert.equal((await wrong.json()).ok, false);
  const ok = await login(req('/api/parent', { method: 'POST', headers: { 'content-type': 'application/json', cookie: familyCookie }, body: '{"pin":"2468"}' }), ctx);
  assert.equal(ok.status, 200);
  const both = familyCookie + '; ' + cookieFrom(ok);
  assert.ok(await auth.isParent(req('/', { headers: { cookie: both } }), ctx));
  assert.ok(!(await auth.isParent(req('/', { headers: { cookie: familyCookie } }), ctx)));
});
test('changing the family password logs out every device', async () => {
  await auth.changeLevel('family', 'new-family-pw', ctx);
  const page = await gate(req('/amaya/', { headers: { cookie: familyCookie, accept: 'text/html' } }), ctx);
  assert.equal(page.status, 302);
  const old = await login(req('/api/login', { method: 'POST', body: form({ password: 'family-pw' }) }), { ip: '7.7.7.7' });
  assert.match(old.headers.get('location'), /e=pw/);
  const neu = await login(req('/api/login', { method: 'POST', body: form({ password: 'new-family-pw' }) }), { ip: '7.7.7.7' });
  assert.equal(neu.headers.get('location'), '/');
});
test('friends only open their pages', () => {
  assert.ok(auth.friendMayOpen(['leora'], '/leora/'));
  assert.ok(!auth.friendMayOpen(['leora'], '/amaya/'));
  assert.ok(!auth.friendMayOpen(['leora'], '/upload/'));
  assert.ok(!auth.friendMayOpen(['leora'], '/parent/'));
  assert.ok(!auth.friendMayOpen(['leora'], '/assets/art/amaya/2026-27/x.webp'));
  assert.ok(auth.friendMayOpen(['leora'], '/assets/art/leora/2026-27/x.webp'));
  assert.ok(!auth.friendMayOpen(['leora'], '/api/pieces-admin'));
  assert.ok(auth.friendMayOpen(['family-moments'], '/moments/a.zip'));
});
