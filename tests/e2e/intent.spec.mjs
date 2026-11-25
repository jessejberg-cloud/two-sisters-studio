// The app's intent, checked by machine on every page and every size (docs/GUIDE.md, "Checklist": the items marked [auto]).
// Private, easy for a 5-year-old and for Grandma, calm, nothing that leaves the site.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, login, ownerInvite, newPhone, settled } from './helpers.mjs';

const PAGES = ['/', '/leora/', '/amaya/', '/pet-parents/', '/family-moments/', '/upload/', '/parent/'];
// Problems that were already on the site when these checks started (2026-11-25). Each is in docs/GUIDE.md "Known issues".
// Fix one, then delete its line here, so it can never come back. Never add a line to make a new change pass.
const KNOWN = {
  axe: ['label-content-name-mismatch'],      // gallery and Family Moments pictures: link name "Open … big" leaves out the visible tag text
  taps: ["Auntie Al's Family"],               // a Pet Parents guest link, 43px tall
};
const MIN_TAP = 44;   // Apple and WCAG 2.5.5 minimum; the app's own aim is 48 (repo CLAUDE.md "Design")

for (const path of PAGES) {
  test(`intent: ${path}`, async ({ page }) => {
    await login(page, undefined, path);
    const res = await page.goto(path);
    await settled(page);

    // Private: never in Google (GUIDE: Privacy 1-2).
    expect(res.headers()['x-robots-tag'] || '', 'X-Robots-Tag header').toMatch(/noindex/);
    expect(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex meta').toMatch(/noindex/);

    // Fits the phone: nothing wider than the screen (GUIDE: Easy 3).
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(wide, 'no sideways scrolling').toBeLessThanOrEqual(1);

    // Big tap targets (GUIDE: Easy 1): every visible button and link people tap, at least 44px tall and wide.
    const small = await page.evaluate(({ min, skip }) => [...document.querySelectorAll('button, a[href], [role=button], input[type=checkbox], input[type=radio], select')]
      .filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden], dialog:not([open])') && !e.classList.contains('skip'); })
      .filter((e) => { const r = (e.closest('label') || e).getBoundingClientRect(); return r.height < min || r.width < min; })
      .filter((e) => !(e.tagName === 'A' && e.closest('p, li') && !e.closest('nav') && getComputedStyle(e).display === 'inline'))   // a link inside a sentence is exempt (WCAG 2.5.8)
      .filter((e) => !skip.some((t) => (e.textContent || '').includes(t)))
      .map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`), { min: MIN_TAP, skip: KNOWN.taps });
    expect(small, `tap targets under ${MIN_TAP}px`).toEqual([]);

    // Readable and usable for everyone (GUIDE: Easy 2): contrast, labels, names, structure (WCAG 2.1 A and AA).
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(KNOWN.axe).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}× ${v.nodes[0].target.join(' ')} — ${v.help}`), 'accessibility').toEqual([]);
  });
}

test('intent: robots.txt keeps every crawler out', async ({ request }) => {
  const txt = await (await request.get('/robots.txt')).text();
  expect(txt).toMatch(/Disallow:\s*\/\s*$/m);
});

test('intent: a stranger with no link sees only the login page', async ({ page }) => {
  for (const path of ['/', '/leora/', '/upload/', '/parent/', '/family-moments/']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login\//);
  }
  expect((await page.request.get('/api/pieces?kid=leora')).status()).toBe(401);
});

test('intent: a new family setup has few words; only the PIN and Google Drive cannot be skipped', async ({ page, browser }, info) => {
  const invite = await ownerInvite(page, 'Words');
  const problems = [];
  const p = await newPhone(browser, info, page, problems);
  await p.goto(invite);
  const steps = await p.$$eval('section.step[data-step]', (s) => s.filter((x) => x.dataset.step !== '0').map((x) => ({
    step: x.dataset.step,
    skip: !!x.querySelector('[data-next].linkish'),
    // The words a person sees on the step, folded (optional) parts left out.
    words: (x.cloneNode(true), [...x.querySelectorAll('.st-label, .st-help, .big-label, label, button, a, p:not([hidden])')]
      .filter((e) => !e.closest('[hidden]')).map((e) => e.textContent).join(' ').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean).length),
  })));
  for (const s of steps) {
    // Skip on every step but the PIN (2), Google Drive (3: studios need Drive, Jesse 2026-11-25) and the last (6: Camera).
    if (['1', '4', '5'].includes(s.step)) expect(s.skip, `step ${s.step} has Skip`).toBeTruthy();
    if (['2', '3'].includes(s.step)) expect(s.skip, `step ${s.step} has no Skip`).toBeFalsy();
    expect(s.words, `step ${s.step}: words on screen`).toBeLessThanOrEqual(25);
  }
  expect(problems).toEqual([]);
  await p.context().close();
});
