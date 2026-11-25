// Shared steps for the robot-phone tests.
import { test as base, expect } from '@playwright/test';
import { TEST } from './values.mjs';
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

// Everything a test page needs: errors noticed, Google faked, and any request that tries to leave the site
// caught (and counted as a problem). Use it on every page, including new phones made with browser.newContext().
export async function guard(page, problems) {
  await watch(page, problems);
  await fakeGoogleInBrowser(page);
  // blob: and data: addresses are the page's own (WebKit shows them to routes; Chromium does not).
  await page.route((u) => /^https?:$/.test(u.protocol) && !['localhost', 'www.googleapis.com'].includes(u.hostname), (r) => {
    problems.push('outside request: ' + r.request().url());
    return r.abort();
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

// The phone sends originals straight to Google Drive, and Google sign-in is a trip to accounts.google.com and back.
// Both are answered here; nothing reaches Google.
export async function fakeGoogleInBrowser(page) {
  await page.route('https://www.googleapis.com/**', (r) => r.fulfill({ status: 200, json: { id: 'G' + Date.now() } }));
  // Google sign-in: the site's /api/google/start answers with a trip to accounts.google.com. Browsers do not let a test
  // catch a redirect, so the trip is cut short here: straight back to the site's callback with a fake code.
  await page.route('**/api/google/start*', async (r) => {
    const res = await r.fetch({ maxRedirects: 0 });
    const to = res.headers().location || '';
    if (!to.startsWith('https://accounts.google.com/')) return r.fulfill({ response: res });
    const u = new URL(to), back = new URL(u.searchParams.get('redirect_uri'));
    back.search = new URLSearchParams({ code: 'fake-code', state: u.searchParams.get('state') }).toString();
    // A page that moves on at once (WebKit will not let a test answer with a redirect). Google's cookie rides along.
    const headers = { 'content-type': 'text/html', 'set-cookie': res.headers()['set-cookie'] || '' };
    return r.fulfill({ status: 200, headers, body: `<meta http-equiv="refresh" content="0;url=${back}">` });
  });
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
