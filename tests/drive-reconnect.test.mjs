// Connecting Drive again (another Google account, or a folder deleted in Drive) must not leave the site using
// folder ids from the old Drive. Found by the real-Drive preview test, 2026-11-26: "Google Drive 404: File not found".
import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'z'.repeat(40);
process.env.FAMILY_PASSWORD = 'fam'; process.env.FRIENDS_PASSWORD = 'fr'; process.env.PARENT_PIN = '1';
useTestStores({});
const { saveGoogle, folder } = await import('../netlify/lib/drive.mjs');

let account = 'A', n = 0; const made = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: account, expires_in: 3600 });
  if (url.includes('/drive/v3/files?') && (opts.method || 'GET') === 'GET') return Response.json({ files: [] });
  if (url.includes('/drive/v3/files?fields=id')) { const id = account + (++n); made.push(id); return Response.json({ id }); }
  return new Response('?', { status: 404 });
};

test('a new Drive connection forgets the old Drive\'s folders', async () => {
  await saveGoogle({}, 'rt-a', { email: 'a@example.com' });
  const first = await folder({}, ['leora']);
  assert.match(first, /^A/);
  account = 'B';
  await saveGoogle({}, 'rt-b', { email: 'b@example.com' });
  const second = await folder({}, ['leora']);
  assert.match(second, /^B/, 'folders are found or made again in the new Drive');
});

test('a studio\'s new connection forgets only that studio\'s folders', async () => {
  account = 'C';
  await saveGoogle({}, 'rt-c', { email: 'c@example.com' }, 'rivera');
  const r1 = await folder({}, ['Sol'], 'rivera');
  const mainBefore = await folder({}, ['leora']);
  account = 'D';
  await saveGoogle({}, 'rt-d', { email: 'd@example.com' }, 'rivera');
  assert.match(await folder({}, ['Sol'], 'rivera'), /^D/);
  assert.notEqual(r1, await folder({}, ['Sol'], 'rivera'));
  assert.equal(await folder({}, ['leora']), mainBefore, 'Jesse\'s studio keeps its folders');
});
