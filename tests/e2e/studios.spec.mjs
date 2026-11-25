// Another family sets up their own studio alone (spec: "one relative on iPhone does full setup alone"),
// adds art from their phone, and a View link can look but never add.
import { test, expect, newPhone, ownerInvite, waitAllSent, driveFiles, FILES } from './helpers.mjs';

test('a new family: invite, setup, Drive, first art; a View link looks but cannot add', async ({ page, browser, request }, info) => {
  const invite = await ownerInvite(page, 'Rivera');

  // A brand-new phone opens the invite.
  const problems = [];
  const phone = await newPhone(browser, info, page, problems);
  await phone.goto(invite);
  await expect(phone).toHaveURL(/\/start\//);

  // 1: name and artists
  await phone.fill('#st-name', 'Rivera');
  const kid = phone.locator('#st-kids input[type=text]').first();
  await kid.fill('Sol');
  await phone.locator('[data-step="1"] .btn-big[data-next]').click();
  // 2: PIN (the one step with no Skip)
  await phone.locator('#st-pin').fill('4321');
  await phone.click('#st-make');
  // 3: Google Drive (faked: Google's page answers at once)
  await phone.click('#st-drive');
  await expect(phone.locator('[data-step="4"]')).toBeVisible();
  // 4: links -> 5: home screen picture -> 6: camera
  await phone.locator('[data-step="4"] .btn-big[data-next]').click();
  await phone.locator('[data-step="5"] .btn-big[data-next]').click();
  await phone.click('#st-camera');
  await expect(phone).toHaveURL(/\/upload\//);

  // The phone names itself once (first open), then adds Sol's art.
  await expect(phone.locator('#s-name'), 'a new phone asks its name once').toBeVisible();
  await phone.fill('#name-own', 'Mom');
  await phone.click('#name-ok');
  await phone.locator('#s-kid [data-home]').first().click();
  await phone.click('[data-pick=art]');
  await phone.setInputFiles('#pick', FILES.art);
  await phone.click('#save');
  await waitAllSent(phone);
  expect((await driveFiles(request)).some((f) => /original/.test(f))).toBeTruthy();

  await phone.goto('/rivera/');
  await expect(phone.locator('main')).toContainText('Sol');

  // The View link, from the studio's For parents.
  await phone.request.post('/api/studio/rivera/pin', { data: { pin: '4321' } });
  const view = new URL((await (await phone.request.get('/api/studio/rivera/parent')).json()).view).pathname;
  const viewer = await newPhone(browser, info, page, problems);
  await viewer.goto(view);
  await expect(viewer).toHaveURL(/\/rivera\//);
  await viewer.goto('/upload/');
  await expect(viewer).not.toHaveURL(/\/upload\//);
  const start = await viewer.request.post('/api/pieces/start', { data: { studio: 'rivera', kid: 'sol', date: '2026-11-20', photos: [{ originalType: 'image/jpeg' }] } });
  expect(start.status()).toBe(401);
  expect(problems, 'no errors and nothing sent outside the site, on the new phone or the viewer').toEqual([]);
  await phone.context().close(); await viewer.context().close();
});
