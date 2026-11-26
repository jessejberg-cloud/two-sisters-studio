// Photos shared in from Google Photos (Jesse, 2026-11-26: "Need solution to save it in the right spot"): they show on the
// first screen with a direct Family Moments button, and the special day is picked on purpose, never guessed.
import { test, expect, login, waitAllSent, addDay, shareIn } from './helpers.mjs';

test('shared photos: shown on the first screen, Family Moments asks which day, and they go to the day picked', async ({ page }) => {
  await login(page);
  await addDay(page, 'Wedding', '2026-06-14');
  await addDay(page, 'Fall bonfire', '2026-10-18');
  await page.goto('/upload/');
  await shareIn(page, 2);
  await expect(page.locator('#shared-tray img')).toHaveCount(2);
  await expect(page.locator('#shared-note')).toHaveText(/2 photos shared in/);
  await page.click('#shared-day');
  await expect(page.locator('#s-video')).toBeVisible();
  await expect(page.locator('#vid-event-pick')).toBeHidden();       // no small list that quietly picks the newest day
  await expect(page.locator('#day-shared-pics img')).toHaveCount(2);
  const days = page.locator('#day-choices [data-day]');
  await expect(days.first()).toContainText('Fall bonfire');
  await days.filter({ hasText: 'Wedding' }).click();                // an older day, on purpose
  await expect(page.locator('#who')).toHaveText(/Wedding/);
  await expect(page.locator('#list .item')).toHaveCount(2);
  await page.click('#save');
  await waitAllSent(page);
  const j = await (await page.request.get('/api/pieces?section=moments')).json();
  expect(j.pieces.filter((p) => p.eventTitle === 'Wedding').length).toBe(3);
  expect(j.pieces.filter((p) => p.eventTitle === 'Fall bonfire').length).toBe(1);
});

test('shared photos, no special days yet: it asks for the name and they go to that day', async ({ page }) => {
  await login(page);
  await page.goto('/upload/');
  await shareIn(page, 1);
  await page.click('#shared-day');
  await expect(page.locator('#vid-new')).toBeVisible();
  await page.fill('#vid-event-title', 'First day');
  await page.click('#day-shared');
  await expect(page.locator('#who')).toHaveText(/First day/);
});

test('shared photos: a new special day needs its name, then they go there', async ({ page }) => {
  await login(page);
  await addDay(page, 'Wedding', '2026-06-14');
  await page.goto('/upload/');
  await shareIn(page, 1);
  await page.click('#shared-day');
  await page.click('#day-new');
  await expect(page.locator('#vid-new')).toBeVisible();
  await page.click('#day-shared');
  await expect(page.locator('#day-status')).toHaveText(/name/);
  await page.fill('#vid-event-title', 'Grandpa visit');
  await page.click('#day-shared');
  await expect(page.locator('#who')).toHaveText(/Grandpa visit/);
  await page.click('#save');
  await waitAllSent(page);
  const j = await (await page.request.get('/api/pieces?section=moments')).json();
  expect(j.pieces.map((p) => p.eventTitle).sort()).toEqual(['Grandpa visit', 'Wedding']);
});

test('shared photos still go to an artist: pick her, Artwork, and they are on the list', async ({ page }) => {
  await login(page);
  await page.goto('/upload/');
  await shareIn(page, 1);
  await page.click('[data-home=leora]');
  await page.click('[data-pick=art]');
  await expect(page.locator('#list .item')).toHaveCount(1);
  await expect(page.locator('#shared-tray')).toBeHidden();
});

test('shared photos with no signal: the days from last time are still buttons, and no video controls get in the way', async ({ page, context }) => {
  await login(page);
  await addDay(page, 'Wedding', '2026-06-14');
  await page.goto('/upload/');
  await page.click('[data-home=leora]');
  await page.click('[data-pick=moment]');                          // the app learns the days once, with signal
  await expect(page.locator('#vid-event option', { hasText: 'Wedding' })).toHaveCount(1);
  await shareIn(page, 1);
  await page.route('**/api/pieces?section=moments*', (r) => r.abort());
  await page.click('#shared-day');
  await expect(page.locator('#day-choices [data-day]', { hasText: 'Wedding' })).toBeVisible();
  await expect(page.locator('#vid-new')).toBeHidden();
  await expect(page.locator('#vid-list')).toBeHidden();
  await expect(page.locator('#vid-file')).toBeHidden();
});
