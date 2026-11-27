// The look: each main screen at each size, compared with the pictures Jesse last approved (tests/e2e/approved/).
// In GitHub (VISUAL=1) a screen that changed by more than 1% fails the PR and the report shows old, new and the difference.
// Elsewhere (Claude's container, Jesse's PC) fonts and emoji draw slightly differently, so the pictures are only saved
// to screens/<size>/ for Claude to look at and send to Jesse; nothing is compared.
// New look approved by Jesse -> run the "Approve the look" workflow in GitHub; it remakes the approved pictures.
import fs from 'node:fs';
import { test, expect, login, ownerInvite, waitAllSent, newPhone, settled, addDay, shareIn, FILES } from './helpers.mjs';

const COMPARE = process.env.VISUAL === '1';

async function shot(page, name, testInfo) {
  await settled(page);
  // Today's date and anything else that changes by itself is covered over.
  const mask = [page.locator('input[type=date], time, .art-label, .day-date, #status')];
  if (COMPARE) {
    // No approved picture yet for this size (before the first "Approve the look"): keep this one in the report, do not fail.
    const approved = testInfo.snapshotPath(name + '.png');
    if (!fs.existsSync(approved) && testInfo.config.updateSnapshots !== 'all') {
      testInfo.annotations.push({ type: 'look', description: `no approved picture yet: ${name}` });
      await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true, mask });
      return;
    }
    return expect(page).toHaveScreenshot(name + '.png', { fullPage: true, mask });
  }
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

test('look: photos shared in from Google Photos, then which special day', async ({ page }, info) => {
  await login(page);
  await addDay(page, 'Wedding', '2026-06-14');
  await addDay(page, 'Fall bonfire', '2026-10-18');
  await page.goto('/upload/');
  await shareIn(page, 3);
  await expect(page.locator('#shared-tray img')).toHaveCount(3);
  await shot(page, 'app-shared-1-home', info);
  await page.click('#shared-day');
  await expect(page.locator('#day-choices [data-day]')).toHaveCount(2);
  await shot(page, 'app-shared-2-days', info);
  await page.click('#day-new');
  await shot(page, 'app-shared-3-new-day', info);
});

test('look: Family Moments, move a photo to another day', async ({ page }, info) => {
  await login(page);
  await addDay(page, 'Lake day', '2026-07-12');
  await addDay(page, 'Snow day', '2026-11-20');
  await page.goto('/family-moments/');
  await page.locator('section.moment[id="2026-11-20-snow-day"] .piece-open').first().click();
  await expect(page.locator('.lightbox .lb-move')).toBeVisible();
  await shot(page, 'moments-move-1-viewer', info);
  await page.click('.lightbox .lb-move');
  await expect(page.locator('.move-box [data-day]')).toHaveCount(1);
  await shot(page, 'moments-move-2-days', info);
});

test('look: a new family\'s setup, first step', async ({ page, browser }, info) => {
  const invite = await ownerInvite(page, 'Look');
  const problems = [];
  const p = await newPhone(browser, info, page, problems);
  await p.goto(invite);
  await expect(p.locator('#st-name')).toBeVisible();
  await shot(p, 'setup-1', info);
  expect(problems).toEqual([]);
  await p.context().close();
});
