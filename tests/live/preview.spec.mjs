// One real trip through the PR's Netlify preview, with real Google Drive (plan item 8).
// Safe by design:
//   - runs only against a deploy-preview address, never twosistersstudio.com (checked first);
//   - previews keep their own storage (Blobs stores named preview-*), so nothing shows on the live site;
//   - before sending anything, it checks the preview's Drive is the spare test account (PREVIEW_DRIVE_EMAIL),
//     so a test picture can never land in the family's real Drive;
//   - it puts the test piece away at the end (the copy in the spare Drive stays, which is fine).
// Needs GitHub secrets: PREVIEW_FAMILY_PASSWORD, PREVIEW_PARENT_PIN, PREVIEW_DRIVE_EMAIL. Without them it is skipped.
import { test, expect } from '@playwright/test';

const URL_OK = /^https:\/\/deploy-preview-\d+--two-sisters-studio\.netlify\.app\/?$/;
const { PREVIEW_URL = '', PREVIEW_FAMILY_PASSWORD: PW, PREVIEW_PARENT_PIN: PIN, PREVIEW_DRIVE_EMAIL: EMAIL } = process.env;

test.skip(!PW || !PIN || !EMAIL, 'preview secrets are not set in GitHub yet (see docs/GUIDE.md, "Testing")');

test('preview: add one piece with real Google Drive, see it, put it away', async ({ page }) => {
  expect(PREVIEW_URL, 'only ever a deploy preview').toMatch(URL_OK);

  await page.goto('/login/');
  await page.fill('#pw', PW);
  await page.locator('form.login-form button').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));

  const pin = await (await page.request.post('/api/studio/main/pin', { data: { pin: PIN } })).json();
  expect(pin.ok, 'parent PIN on the preview').toBeTruthy();
  const drive = await (await page.request.get('/api/google/status')).json();
  expect(drive.connected, 'the preview has a Drive connected').toBeTruthy();
  expect((drive.email || '').toLowerCase(), 'the preview Drive is the spare test account, not the family one').toBe(EMAIL.toLowerCase());

  await page.goto('/upload/');
  await page.click('[data-home=leora]');
  await page.click('[data-pick=art]');
  await page.setInputFiles('#pick', 'tests/e2e/files/art.jpg');
  const caption = 'robot test ' + Date.now();
  await page.fill('input[placeholder^="Caption"]', caption);
  await page.click('#save');
  await expect(page.locator('#status')).toContainText(/All sent|on the site/i, { timeout: 90_000 });

  const list = await (await page.request.get('/api/pieces?kid=leora')).json();
  const newest = (list.pieces || []).find((p) => p.caption === caption);
  expect(newest, 'the piece is on the preview').toBeTruthy();
  await page.goto('/leora/');
  await expect(page.locator(`a[data-caption="${caption}"]`)).toHaveCount(1);
  expect((await page.request.post(`/api/pieces/${newest.id}/delete`, { data: {} })).ok(), 'put away again').toBeTruthy();
});
