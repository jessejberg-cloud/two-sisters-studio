// The look: each main screen at each size, compared with the pictures Jesse last approved (tests/e2e/approved/).
// In GitHub (VISUAL=1) a screen that changed by more than 1% fails the PR and the report shows old, new and the difference.
// Elsewhere (Claude's container, Jesse's PC) fonts and emoji draw slightly differently, so the pictures are only saved
// to screens/<size>/ for Claude to look at and send to Jesse; nothing is compared.
// New look approved by Jesse -> run the "Approve the look" workflow in GitHub; it remakes the approved pictures.
import fs from 'node:fs';
import { test, expect, login, ownerInvite, waitAllSent, FILES } from './helpers.mjs';

const COMPARE = process.env.VISUAL === '1';

async function shot(page, name, testInfo) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  // Today's date and anything else that changes by itself is covered over.
  const mask = [page.locator('input[type=date], time, .art-label, .day-date, #status')];
  if (COMPARE) return expect(page).toHaveScreenshot(name + '.png', { fullPage: true, mask });
  const dir = `screens/${testInfo.project.name}`;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, mask });
}

test('look: login', async ({ page }, info) => {
  await page.goto('/login/');
  await shot(page, 'login', info);
});

test('look: home, a gallery, Family Moments, For parents', async ({ page }, info) => {
  await login(page);
  for (const [path, name] of [['/', 'home'], ['/leora/', 'gallery-leora'], ['/family-moments/', 'family-moments'], ['/parent/', 'for-parents']]) {
    await page.goto(path);
    await page.evaluate(async () => {
      document.querySelectorAll('img[loading=lazy]').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; setTimeout(ok, 3000); })));
    });
    await shot(page, name, info);
  }
});

test('look: the app, from home to a saved piece', async ({ page }, info) => {
  await login(page);
  await page.goto('/upload/');
  await expect(page.locator('#s-kid')).toBeVisible();
  await shot(page, 'app-1-home', info);
  await page.click('[data-home=leora]');
  await shot(page, 'app-2-pick', info);
  await page.click('[data-pick=art]');
  await page.setInputFiles('#pick', FILES.art);
  await expect(page.locator('#save')).toBeEnabled();
  await shot(page, 'app-3-photo', info);
  await page.click('#save');
  await waitAllSent(page);
});

test('look: a new family\'s setup, first step', async ({ page, browser }, info) => {
  const invite = await ownerInvite(page, 'Look');
  const ctx = await browser.newContext({ ...info.project.use, baseURL: new URL(page.url()).origin, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(invite);
  await expect(p.locator('#st-name')).toBeVisible();
  await shot(p, 'setup-1', info);
  await ctx.close();
});
