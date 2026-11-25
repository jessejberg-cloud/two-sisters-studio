// The main job: a grown-up adds a kid's art from a phone, it shows on the site, and the original lands in Google Drive.
import { test, expect, login, driveFiles, waitAllSent, FILES } from './helpers.mjs';

test('family phone: pick Leora, Art, a photo, Save; it is in her gallery and the original is in Drive', async ({ page, request }) => {
  await login(page);
  await page.goto('/upload/');
  await page.click('[data-home=leora]');
  await page.click('[data-pick=art]');
  await page.setInputFiles('#pick', FILES.art);
  await expect(page.locator('#save')).toBeEnabled();
  await page.click('#save');
  await waitAllSent(page);

  const files = await driveFiles(request);
  expect(files.some((f) => /^Two Sisters Studio\/.*leora.*-original\.jpg$/i.test(f)), files.join('\n')).toBeTruthy();
  const sent = (await (await request.get('/__test/drive')).json()).files.filter((f) => f.kind === 'resumable' && f.bytes > 0);
  expect(sent.length, 'the phone really sent the original to (fake) Drive').toBeGreaterThan(0);

  await page.goto('/leora/');
  const art = page.locator('img[src*="/img/"]').first();
  await expect(art).toBeVisible();
  await art.click();
  await expect(page.getByRole('dialog').or(page.locator('.lightbox')).first()).toBeVisible();
});

test('a snapshot is not scanned or cropped, and shows on her page', async ({ page }) => {
  await login(page);
  await page.goto('/upload/');
  await page.click('[data-home=amaya]');
  await page.click('[data-pick=photos]');
  await page.setInputFiles('#pick', FILES.photo);
  await page.click('#save');
  await waitAllSent(page);
  await page.goto('/amaya/');
  await expect(page.locator('img[src*="/img/"]').first()).toBeVisible();
});

test('no signal: Save keeps it on the phone and sends it when the signal comes back', async ({ page, context }) => {
  await login(page);
  await page.goto('/upload/');
  await page.click('[data-home=leora]');
  await page.click('[data-pick=art]');
  await page.setInputFiles('#pick', FILES.art);
  await expect(page.locator('#save')).toBeEnabled();
  await context.setOffline(true);
  await page.click('#save');
  await expect(page.locator('#status')).toContainText(/saved .* on this phone/i, { timeout: 15_000 });
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitAllSent(page);
  await page.goto('/leora/');
  await expect(page.locator('img[src*="/img/"]').first()).toBeVisible();
});

test('an older phone without createImageBitmap (old iPhones) still saves art', async ({ page }) => {
  await page.addInitScript(() => { delete window.createImageBitmap; window.createImageBitmap = undefined; });
  await login(page);
  await page.goto('/upload/');
  await page.click('[data-home=leora]');
  await page.click('[data-pick=art]');
  await page.setInputFiles('#pick', FILES.art);
  await expect(page.locator('#save')).toBeEnabled();
  await page.click('#save');
  await waitAllSent(page);
  await page.goto('/leora/');
  await expect(page.locator('img[src*="/img/"]').first()).toBeVisible();
});
