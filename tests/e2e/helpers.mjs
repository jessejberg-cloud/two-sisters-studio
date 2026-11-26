// Shared steps for the robot-phone tests.
import { test as base, expect } from '@playwright/test';
import { TEST } from './values.mjs';
import fs from 'node:fs';
export { expect, TEST };

export const FILES = { art: 'tests/e2e/files/art.jpg', photo: 'tests/e2e/files/photo.jpg' };

// Every test starts on an empty pretend site, with Google faked in the browser too, and fails on any page error
// or any request that tries to leave the site (except the faked Google addresses).
export const test = base.extend({
  page: async ({ page, request }, use) => {
    await request.post('/__test/reset');
    const problems = [];
    await guard(page, problems);
    await use(page);
    expect(problems, 'no page errors and nothing sent outside the site').toEqual([]);
  },
});

// Everything a test page needs: errors noticed, and any request that tries to leave the site counted as a problem.
// Use it on every page, including new phones made with browser.newContext(). It only listens: nothing is rerouted.
export async function guard(page, problems) {
  await watch(page, problems);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost') problems.push('outside request: ' + r.url());
  });
}

// A second phone, the same kind as this test's (iPhone, Pixel, tablet, computer), with nothing on it yet.
export async function newPhone(browser, testInfo, page, problems) {
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL: new URL(page.url()).origin, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await guard(p, problems);
  return p;
}

// Waits until the page has drawn: no network for a moment (or 5 s), every picture loaded, fonts ready.
export async function settled(page) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; });
    await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; })));
    await document.fonts.ready;
  });
}

// Page errors, and promise errors nobody caught (an async click handler that throws shows nothing on screen).
export function watch(page, problems) {
  page.on('pageerror', (e) => problems.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.text().startsWith('[unhandled] ')) problems.push(m.text()); });
  return page.addInitScript(() => window.addEventListener('unhandledrejection', (e) => console.error('[unhandled] ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason))));
}

// Log in the way a person does: the login page, one box.
export async function login(page, password = TEST.family, next = '/') {
  await page.goto('/login/?next=' + encodeURIComponent(next));
  await page.fill('#pw', password);
  await page.locator('form.login-form button').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

// What the fake Google Drive was asked to keep.
export async function driveFiles(request) {
  return (await (await request.get('/__test/drive')).json()).paths;
}

// Jesse makes a studio invite with the owner PIN (For parents), the way the Families card does.
export async function ownerInvite(page, name) {
  await login(page);
  const pin = await page.request.post('/api/studio/main/pin', { data: { pin: TEST.pin } });
  expect((await pin.json()).ok, 'owner PIN works').toBeTruthy();
  const j = await (await page.request.post('/api/owner', { data: { do: 'invite', name } })).json();
  expect(j.ok, JSON.stringify(j)).toBeTruthy();
  return new URL(j.creates[0].url).pathname;
}

// Waits for the app's status line to say everything went.
export async function waitAllSent(page) {
  await expect(page.locator('#status')).toContainText(/All sent|on the site/i, { timeout: 30_000 });
}

// Photos shared in from Google Photos, and special days that already exist (tests/e2e/share.spec.mjs, look).
export async function addDay(page, title, date) {   // a special day that already has one photo from the app
  const s = await (await page.request.post('/api/pieces/start', { data: { kid: 'both', section: 'moments', event: { title, date }, caption: '', photos: [{ originalType: 'image/jpeg', originalSize: 10 }] } })).json();
  expect(s.id, JSON.stringify(s)).toBeTruthy();
  const web = fs.readFileSync(FILES.photo);
  expect((await page.request.post(`/api/pieces/${s.id}/photo/1`, { multipart: {
    meta: JSON.stringify({ w: 1600, h: 1200, fp: '0123456789abcdef', original: 'O1' }),
    web: { name: 'w.webp', mimeType: 'image/webp', buffer: web }, thumb: { name: 't.webp', mimeType: 'image/webp', buffer: web } } })).ok()).toBeTruthy();
  expect((await (await page.request.post(`/api/pieces/${s.id}/finish`)).json()).ok).toBeTruthy();
}

export async function shareIn(page, n) {   // what the service worker does with a share from Google Photos
  const b64 = fs.readFileSync(FILES.photo).toString('base64');
  await page.evaluate(async ({ b64, n }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const db = await new Promise((ok, no) => { const r = indexedDB.open('two-sisters-studio', 2); r.onsuccess = () => ok(r.result); r.onerror = no; });
    await new Promise((ok, no) => {
      const t = db.transaction('shared', 'readwrite');
      for (let i = 0; i < n; i++) t.objectStore('shared').put({ id: 's' + i, file: new File([bytes], 'shared-' + i + '.jpg', { type: 'image/jpeg' }) });
      t.oncomplete = ok; t.onerror = no;
    });
    db.close();
  }, { b64, n });
  await page.goto('/upload/?shared=1');
}
