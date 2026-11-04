import test from 'node:test';
import assert from 'node:assert/strict';
import { useTestStores, store } from '../netlify/lib/store.mjs';
process.env.TSS_SECRET = 'x'.repeat(40);
process.env.FAMILY_PASSWORD = 'f'; process.env.PARENT_PIN = '1';
useTestStores({});
const P = await import('../netlify/lib/pieces.mjs');

test('grades come from the date and move up each September', () => {
  assert.equal(P.gradeFor('leora', '2026-11-03'), '3rd grade');
  assert.equal(P.gradeFor('amaya', '2026-11-03'), 'K5');
  assert.equal(P.gradeFor('amaya', '2027-09-15'), '1st grade');
  assert.equal(P.gradeFor('leora', '2027-07-04'), 'summer after 3rd grade');
  assert.equal(P.gradeFor('amaya', '2027-07-04'), 'summer after K5');
  assert.equal(P.gradeFor('leora', '2026-03-01'), '2nd grade');
});
test('ids, seasons and folders', () => {
  assert.equal(P.seasonOf('2026-12-01'), 'winter');
  assert.equal(P.schoolYearOf('2027-06-30'), '2026-27');
  assert.equal(P.baseId('leora', '2026-11-03', 'Dog in the rain!'), '2026-11-03_leora_fall_dog-in-the-rain');
  assert.deepEqual(P.folderParts({ kid: 'both', schoolYear: '2026-27', season: 'fall' }), ['Both', '2026-27', 'Fall']);
});

test('rebuild from Drive alone', async () => {
  const { saveGoogle } = await import('../netlify/lib/drive.mjs');
  await saveGoogle({}, 'refresh-token', { email: 'x@example.com' });
  const details = { version: 1, id: '2026-11-03_leora_fall_dog', kid: 'leora', date: '2026-11-03', schoolYear: '2026-27', season: 'fall',
    grade: '3rd grade', caption: 'Dog', starred: true, photos: [{ n: 1, w: 10, h: 8, web: 'W1', thumb: 'T1', original: 'O1' }] };
  const files = { D1: JSON.stringify(details), W1: 'webp-bytes', T1: 'thumb-bytes' };
  globalThis.fetch = async (url) => {
    url = String(url);
    if (url.startsWith('https://oauth2.googleapis.com/token')) return Response.json({ access_token: 'a', expires_in: 3600 });
    if (url.includes('/files?')) return Response.json({ files: [{ id: 'D1', name: 'x.json' }] });
    const id = url.match(/files\/([^?]+)\?alt=media/)?.[1];
    if (id) return new Response(files[id]);
    return new Response('?', { status: 404 });
  };
  const auth = await import('../netlify/lib/auth.mjs');
  const { makeLogin, makeParent } = auth;
  const cookie = `tss=${encodeURIComponent(await makeLogin('family', {}))}; tssp=${encodeURIComponent(await makeParent({}, 5))}`;
  const { default: rebuild } = await import('../netlify/functions/rebuild-background.mjs');
  await rebuild(new Request('https://x/api/admin/rebuild', { method: 'POST', headers: { cookie } }), {});
  const report = await store('drive', {}).get('rebuild', { type: 'json' });
  assert.equal(report.state, 'done', JSON.stringify(report));
  assert.equal(report.indexed, 1);
  const idx = await P.readIndex({});
  assert.equal(idx[0].caption, 'Dog');
  assert.equal(await store('images', {}).get(P.webName(details.id, 1)), 'webp-bytes');
});
