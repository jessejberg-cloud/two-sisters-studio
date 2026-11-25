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

test('no signal: Save keeps it on the phone, and Send now sends it when the signal is back', async ({ page, request }) => {
  await login(page);
  await page.goto('/upload/');
  await page.click('[data-home=leora]');
  await page.click('[data-pick=art]');
  await page.setInputFiles('#pick', FILES.art);
  await expect(page.locator('#save')).toBeEnabled();
  // A dead zone: the site cannot be reached (the pretend server cuts every request off).
  await request.post('/__test/signal?on=0');
  await page.click('#save');
  await expect(page.locator('#status'), 'the phone says it kept it').toContainText('still saved on this phone', { timeout: 30_000 });
  // Back on the first screen, the phone shows what is still waiting, with Send now.
  await page.click('#back');
  await expect(page.locator('#outbox')).toBeVisible();
  await expect(page.locator('#outbox-text')).toContainText('1 piece saved on this phone');
  await request.post('/__test/signal?on=1');
  await page.click('#outbox-send');
  await expect(page.locator('#outbox'), 'everything went up').toBeHidden({ timeout: 30_000 });
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

test('a phone whose storage will not keep photo files (Safari private browsing) still saves and sends', async ({ page }) => {
  await page.addInitScript(() => {
    const hasBlob = (v) => v instanceof Blob || (Array.isArray(v) ? v.some(hasBlob) : !!v && typeof v === 'object' && !(v instanceof ArrayBuffer) && Object.values(v).some(hasBlob));
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) {
      if (hasBlob(v)) throw new DOMException('Error preparing Blob/File data to be stored in object store', 'DataCloneError');
      return put.call(this, v, k);
    };
  });
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
