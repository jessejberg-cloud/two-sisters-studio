// Ease-of-use batch (Jesse, 2026-11-25): the app's first screen (artists + All, hand-drawn icons, no Quick), All with
// fewer artists ticked, Recent "Whose / Where", the OK bar with pictures, and a girl's tablet (one word buttons,
// Turn + Send only, what she sent stays on screen marked "waiting for OK").
import { test, expect, login, waitAllSent, newPhone, FILES, TEST } from './helpers.mjs';

test('first screen: a block per artist, All under them, icons for Recent, Podcast, Site, Parents; no Quick', async ({ page }) => {
  await login(page);
  await page.goto('/upload/');
  const blocks = page.locator('#home-buttons [data-home]');
  await expect(blocks).toHaveCount(3);
  await expect(blocks.last()).toHaveAttribute('data-home', 'both');
  await expect(blocks.last()).toHaveText(/All/);
  for (const name of ['Recent', 'Podcast', 'Site', 'Parents']) await expect(page.locator('.up-icons').getByText(name)).toBeVisible();
  await expect(page.locator('#quick-toggle')).toHaveCount(0);
  await expect(page.locator('#s-kid')).not.toContainText(/Family Moments/);
});

test('All: every artist ticked; untick one and it is just the other\'s; Recent can change Whose and Where', async ({ page }) => {
  await login(page);
  await page.goto('/upload/');
  await page.click('[data-home=both]');
  await expect(page.locator('#all-ticks .mark[aria-pressed=true]')).toHaveCount(2);
  await expect(page.locator('[data-pick=photos]')).toBeHidden();   // a snapshot is one artist's
  await page.locator('#all-ticks .mark', { hasText: 'Leora' }).click();
  await page.click('[data-pick=art]');
  await expect(page.locator('#who')).toHaveText(/Amaya/);
  await page.setInputFiles('#pick', FILES.art);
  await page.click('#save');
  await waitAllSent(page);
  await expect(page.locator('#sent-list img')).toHaveCount(1);
  await expect(page.locator('#art-look-a')).toHaveAttribute('href', '/amaya/');
  // Recent: it was really Leora's, and a snapshot
  await page.click('#back');
  await page.click('#recent');
  const row = page.locator('#recent-list li').first();
  await row.getByLabel('Whose').selectOption('leora');
  await expect(row.locator('.saved-note')).toHaveText(/Saved/);
  await row.getByLabel('Where').selectOption('photos');
  await expect(row.locator('.saved-note')).toHaveText(/Saved/);
  const j = await (await page.request.get('/api/pieces?kid=leora&section=photos')).json();
  expect(j.pieces.length).toBe(1);
});

test('her tablet: My art / Snapshot / Family Moments, Turn and Send only, and what she sent stays marked waiting', async ({ page, browser }, testInfo) => {
  await login(page);
  expect((await (await page.request.post('/api/studio/main/pin', { data: { pin: TEST.pin } })).json()).ok).toBeTruthy();
  expect((await (await page.request.post('/api/admin/password', { data: { level: 'kid-leora', password: 'tablet-test' } })).json()).ok).toBeTruthy();
  await page.request.post('/api/admin/kids', { data: { kid: 'leora', moments: true } });
  const problems = [];
  const tab = await newPhone(browser, testInfo, page, problems);
  await login(tab, 'tablet-test', '/upload/');
  await tab.goto('/upload/');
  const what = tab.locator('#s-kidhome [data-kidwhat]:visible');
  await expect(what).toHaveText(['My art', /Snapshot/, 'Family Moments']);
  await expect(tab.locator('#s-kidhome small')).toHaveCount(0);
  await tab.click('[data-kidwhat=art]');
  await tab.setInputFiles('#pick', FILES.art);
  await expect(tab.locator('#list .fix-btn')).toHaveText(['↻ Turn']);
  await expect(tab.locator('#list .more-photo')).toBeHidden();
  await expect(tab.locator('#save')).toHaveText('Send');
  await tab.click('#save');
  await expect(tab.locator('#sent-list .wait-mark')).toHaveText('waiting for OK', { timeout: 30_000 });
  expect(problems).toEqual([]);

  // The parent's phone: the OK bar shows the picture, with its own OK.
  await page.goto('/upload/');
  await expect(page.locator('#wait-list img')).toHaveCount(1);
  await page.locator('#wait-list .mark').click();
  await expect(page.locator('#waiting-bar')).toBeHidden();
});

test('a new phone in a studio asks for a name only; the Home Screen picture never covers it', async ({ page, browser }, testInfo) => {
  await login(page);
  await page.request.post('/api/studio/main/pin', { data: { pin: TEST.pin } });
  const inv = await (await page.request.post('/api/owner', { data: { do: 'invite', name: 'Ruiz' } })).json();
  const problems = [];
  const phone = await newPhone(browser, testInfo, page, problems);
  await phone.goto(new URL(inv.creates[0].url).pathname);
  await phone.locator('#st-name').fill('Ruiz');
  await phone.locator('#st-kids .st-kid input[type=text]').first().fill('Ava');
  await phone.locator('#st-kids .icon-now').first().click();
  await phone.locator('#st-kids .icon-row [data-icon=dino]').first().click();
  await phone.locator('.step[data-step="1"] .btn-big[data-next]').click();
  await phone.locator('#st-pin').fill('4321');
  await phone.click('#st-make');
  await expect(phone.locator('.step[data-step="3"]')).toBeVisible();
  const st = await (await phone.request.get('/api/studio/ruiz')).json();
  expect(st.studio.kids[0].icon).toBe('dino');
  // Another grown-up's phone, from the studio's Invite
  const links = await (await phone.request.get('/api/studio/ruiz/parent')).json();
  const mom = await newPhone(browser, testInfo, page, problems);
  await mom.goto(new URL(links.invite).pathname);
  await expect(mom.locator('#s-name')).toBeVisible();
  await expect(mom.locator('#s-name .big-button')).toHaveCount(0);
  await expect(mom.locator('#guide[open]')).toHaveCount(0);
  await mom.fill('#name-own', 'Mom');
  await mom.click('#name-ok');
  await expect(mom.locator('#s-kid')).toBeVisible();
  expect(problems).toEqual([]);
});
