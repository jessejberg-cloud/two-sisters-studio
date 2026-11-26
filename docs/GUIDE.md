# Two Sisters Studio: the guide

**Every build reads this first and updates it last.** It is the one place that says what the app is for, the rules
it keeps, how it works today, and how to check a change. If code and this guide disagree, one of them is wrong:
fix the code, or (if Jesse decided something new) fix the guide in the same PR.

- Sources behind it: Jesse's build spec (`spec.docx`, 2026-11-25), his decisions in the dated sections of
  [CLAUDE.md](../CLAUDE.md) (the history; this guide is the current summary), and the PRs.
- A PR that changes the app must add a Build log row here. GitHub fails the PR otherwise (`tools/check-guide.mjs`).
- Plain words, short lines. Jesse reads this too.

## 1. What it is for

A private family site and phone app to **keep the kids' art for the long term** and to bring the family together.
Its first job is easy capture: a kid, a parent or Grandma adds a picture in a few taps, and it is kept.

Priorities, in order (spec):
1. A working app now, refined until it is easy to use.
2. A way to share it, so other families get their own app and studio before the December trip (**deadline Dec 7, 2026**).
3. Self-setup: a family sets up its studio with no help from Jesse.
4. Easy for everyone: kids, Grandma, all adults.
5. Connected: studios linked, Family Moments shared.
6. Keepsakes for the long term, and a quick way to reach the site.
- Low: security. The main need is "not on Google".

## 2. Who uses it

| Who | Device | What they do |
|---|---|---|
| Jesse and his partner | Android phone (Pixel) | Add art, snapshots, episodes, special days; For parents (PIN) |
| Leora (3rd grade) and Amaya (K5) | Amazon Fire tablets (tablet app, a WebView of the live site) | My art / Snapshot / Family Moments (when allowed); waits for a parent's OK |
| Grandma and relatives | iPhones mostly | Look; add to their own studio and to Family Moments |
| Other families | Their own phones | Their own studio at twosistersstudio.com/name, set up alone |
| Viewers | Any browser | Look only, through a View link, or a shared link (one picture, video or day) |

## 3. Rules that never change

**Privacy**
1. Never findable on Google: noindex meta on every page, `X-Robots-Tag` header, `robots.txt` Disallow all, no sitemap.
2. Nothing leaves the site: no analytics, cookies for tracking, trackers, ads, comments, outside embeds, or outside fonts.
   The Content-Security-Policy allows only the site's own files; only the app may also talk to Google Drive.
3. Link previews show the name and logo only.
4. No links to Jesse's other sites or socials.
5. Passwords, PINs and secrets live only in Netlify (and GitHub secrets for tests). Never in the repo or chat.
6. Personal information is allowed (names, school, family photos). Claude does not screen uploads.

**Keeping things**
7. Google Drive is the source of truth for originals. The site keeps web copies. Each studio uses its own Drive (`drive.file` only).
8. Nothing is deleted at once: "put away" keeps it 30 days and can be undone. Drive originals are never deleted.
9. The original photo is always kept, even after a fix.
10. Uploads survive no signal: kept on the phone, sent when signal returns.

**Easy and calm (design)**
11. Big tap targets (48px aim, never under 44px), big text (19px body), AA contrast, text follows the phone's size setting.
12. Few words. In setup: one word per label, no intro, welcome, tips or persuasion. A picture or a word, not both.
13. Fewest screens and taps. Home: 2 to 4 big buttons.
14. Nothing required except, in setup, the PIN and Google Drive (Jesse, 2026-11-25: studios need Drive). Every other
    setup step has Skip (the last step, Camera, is simply the end); skipped things show in For parents.
15. Hand-drawn, neat, kid-friendly, not Office-looking. Gentle movement only, all off for reduced motion.
    No subtitle line under a page title, no tip or explainer boxes, no pill boxes (Jesse 2026-11-25): things explain themselves.
16. Website = view. App = capture. The website's design stays as it is unless Jesse asks.

**How Claude works on it** (spec, "Read first")
17. No drastic changes. Add benefit, keep what works. If the app already does it, keep its way.
18. A clearly better idea (fewer taps, clearer) wins; say so in the PR.
19. Questions never block work: build on the best default, keep a batched list, ask Jesse one question at a time.
20. Nothing goes live without Jesse's "approved" on the PR.

## 4. How it works now

**Logins and links**
- Jesse's studio is the root (twosistersstudio.com). Other studios are at `/name` (made from the studio name; a second "smith" is `smith2`).
- **View link** (`/v/…`): look only, never ends, can be reset. **Invite** (`/i/…`): makes a phone a capture device for one studio; never ends, can be turned off.
- A new phone types its name once ("added by"); every grown-up is just an adult, and a studio can have several. Kid mode
  (no Put away, no Parents, no Share) is set for a phone on For parents → Phones (PIN), never by tapping a face. The Add to
  Home Screen picture shows after the name, never over it.
- Old logins still work on Jesse's studio: the family password, the girls' tablet passwords, household invites.
- For parents needs the studio PIN; a trusted phone is remembered 30 days. Jesse's owner PIN opens every studio's For parents.
- **Privacy page** (`/privacy/`): open with no login (Google needs it to publish the app), still noindex. The login page links to it.
- Share links (`/s/…`): open only what was shared; can be turned off.
- Sharing one thing (`netlify/functions/shared.mjs`): 📤 Share in every picture viewer and under every video, and
  ONE 📤 Share button at the top of a page (main.js "The one 📤 Share button"). It offers This page, each special day on
  the page, or Photos (tap one or many, then 📤 Share: one link for up to 60). No other share buttons on the page. Grown-up phones that add to the studio only (not kid mode, not View links); a
  household shares only what it may see, and a studio shares only its own things (not a day another studio tagged in). The
  link opens `/shared/?l=…` with no login and shows just that picture, video or day (a day link shows photos added
  later too; put-away pieces drop off). For parents → Shared pictures: opens, about how many phones, last opened, Turn
  off / Turn back on. 20 phones on one link raises a heads-up. A studio turned off or removed takes its links with it.
  Counting phones uses one random cookie (`tssx`, only on `/s/`, one year), kept on the server as a short hash.

**Adding (the app, `/upload/`)**
- Home: one block per artist (its own hand-drawn icon), then **All** (same size, under the last artist; two artists or
  more). All ticks every artist; untick to choose fewer (brush marks); one left is just that artist's. Pieces: kid `both`
  plus `kids` when fewer than all. Then Artwork / Snapshot (not for All) / the studio's categories / Family Moments / Video.
  Under the blocks, hand-drawn icons, no circles: Recent, Podcast (Jesse's studio, family phones), Site, Parents.
- Take a photo is the big button; Choose photos is a smaller outlined one under it.
- Artist icons: 8 hand-drawn ones (palette, crayon, star, rocket, flower, dino, ball, paw; `site-src/icons.js`), picked
  in setup or on For parents → Artists; by order when none is picked (a pet gets the paw). Shown on the app and the studio site.
- Recent: caption, date, star, put away, and **Whose / Where** (another artist or All; Artwork ↔ Snapshot).
- Shared in from Google Photos (Android): the pictures wait on the app's first screen; the first place picked takes them,
  including Family Moments (an existing day or a new one with name and date).
- Artwork and "Paper" categories get the scan fix (find the paper, straighten, even the light). Under each photo: Turn, Fix corners, Use the original.
- Snapshots and special-day photos: Turn only.
- Save: kept on the phone, then the original goes to Drive and a web copy to the site. It shows on the site right away.
- Kids' uploads from tablets wait for a parent's OK and show at once, marked "waiting for OK", to the family and to her
  (her own only, not her sister's; never to links or households). On the site they carry the same mark and never show big. A parent's app home shows each one as a small picture with its own OK, and OK all.
- Her tablet: My art / Snapshot / Family Moments (when allowed: a day already on the page, never a new one). One camera +
  Choose photos; only Turn and Send; what she sent stays on screen with a "waiting for OK" brush mark.
- PDFs can be art (page 1 is the picture). Episodes: Jesse's studio only, for now.
- Videos (A video, or a special day): every studio. The video plays from the site and is copied into that studio's own
  Google Drive (`Family Moments/<date title>/`). It shows on that studio's Family Moments page. The phone that sent it can
  put it away and bring it back from the app's video list (not a kid-mode phone); so can the studio's parents. A video
  on a special day shows in the studios ticked for that day, like its photos.
- Quick capture: hold the app icon (Android) for Take a picture (last artist and category) or A special day. The ⚡ Quick
  switch on the app home is gone (Jesse, 2026-11-25).
- Gallery year and season filters are brush marks, not pills.

**Looking (the website)**
- Galleries by school year (Sept to Aug), newest open; fall, winter, spring, then summer. Featured pieces large; never cropped.
- Family Moments: one page, one section per special day, newest first; Download all per day.
- Every picture and video: Full screen and Save.
- For parents → Download everything (family studios): every picture as one zip made in the browser, a folder per
  artist (Artwork, Snapshots, each category) and per special day, plus `details.json`. Shows the count and the space
  used on the site. Videos and full-size originals stay in Google Drive.

**Setup for a new family** (`/start/`, from Jesse's invite): Studio name + artists → PIN + color → Google Drive (needed) → Invite and View links → Add to Home Screen picture → Camera.

## 5. Checklist for every change

Each line is checked on every PR. **[auto]** = the robot tests check it; **[Claude]** = Claude checks it by looking and says so in the PR;
**[Jesse]** = only Jesse can judge it.

1. [auto] Server tests pass (`npm test`).
2. [auto] Privacy audit passes (`tools/audit.cjs`): noindex, no outside links or trackers, CSP.
3. [auto] Pictures and audio carry no hidden data (`tools/add.py check`).
4. [auto] A stranger with no link sees only the login page.
5. [auto] On iPhone, Pixel, Fire tablet and computer (each test's second phone is the same kind): adding art, a snapshot,
   and a new family's whole setup work end to end; the original reaches (fake) Drive; nothing leaves the site; no page
   errors, including promise errors nobody caught.
6. [auto] No signal: Save keeps it and sends it later.
7. [auto] A View link can look and cannot add.
8. [auto] Every page: no sideways scroll; tap targets at least 44px; accessibility (WCAG 2.1 AA: contrast, labels, names).
9. [auto] Setup: Skip on steps 1, 4 and 5, none on the PIN and Drive steps; 25 words or fewer per step.
10. [auto] The look matches the last approved pictures (GitHub only; active once `tests/e2e/approved/` has pictures).
11. [auto] This guide got a Build log row.
12. [Claude] A new or changed feature has a test written first, and the test failed before the change.
13. [Claude] Screenshots of every changed screen at iPhone and tablet size, looked at, attached to the PR.
14. [Claude] Rules 11 to 16 by eye: few words, calm, no clutter, a 5-year-old could do it, Grandma could do it.
15. [Claude] A second Claude reviewed the change against this guide (`.claude/agents/guide-reviewer.md`) and its findings were fixed or answered.
16. [Claude] The spec's "Report": which suggestions were used, skipped, or already existed.
17. [Jesse] The look and the feel on his own phone. "approved" on the PR.

## 6. Testing

| What | Command | Where it runs |
|---|---|---|
| Server tests | `npm test` | Claude, GitHub |
| Robot phones (all sizes) | `npm run e2e` | Claude, GitHub |
| Screenshots to look at | `npm run screens` → `screens/<size>/` | Claude |
| Everything | `npm run check` | Claude before every push |
| Real Google on the PR preview | `playwright.live.config.mjs` | GitHub, when the preview is ready |

- **The pretend site** (`tests/e2e/server.mjs`) runs the real front door and real functions with in-memory storage and a
  fake Google. Nothing reaches the live site, real storage or real Google. Restart it after changing `netlify/` code
  (locally it is reused between runs).
- **Look checks:** fonts and emoji draw a little differently on each computer, so pictures are compared only in GitHub.
  After Jesse approves a new look, run the **Approve the look** workflow on the PR's branch; it saves new approved pictures.
- **Real Google:** the preview test uses a spare Google account's Drive, never the family's. It checks the account before
  sending anything. Setup (Jesse, once): see "Waiting on Jesse" below.
- **Still by hand** (a robot cannot do these): the real camera, the Fire tablet's Amazon Kids profile, iPhone Add to
  Home Screen, and how it feels. Before Dec 7: one relative on iPhone does the whole setup alone.

## 7. Every build (the routine)

1. Read this guide and `CLAUDE.md`. Check the open PRs and other threads so work does not collide.
2. Write the test first (in `tests/*.test.mjs` for the server, `tests/e2e/*.spec.mjs` for screens). See it fail.
3. Build the change. Keep to the rules in section 3.
4. `npm run check` until it is all green. Then `npm run screens` and look at every changed screen.
5. Ask the guide reviewer (a second Claude) to review the diff; fix what it finds.
6. Update this guide: section 4 if how it works changed, section 5 if a check changed, a Build log row always.
7. Open the PR with the screenshots, the checklist (section 5) and what was not done. Wait for Jesse's "approved".

## 8. Known issues (fix, then delete the line here and in `tests/e2e/intent.spec.mjs`)

- Gallery and Family Moments pictures: the link's spoken name ("Open … big") leaves out the visible tag text, like
  "Sample" (WCAG 2.5.3, voice control). Found 2026-11-25.
- Pet Parents: the "Auntie Al's Family" link is 43px tall (aim 48). Found 2026-11-25.

## 9. Waiting on Jesse

- **Preview test with real Drive:** set up by Jesse 2026-11-25 (spare Google account, Netlify preview values, GitHub
  secrets PREVIEW_FAMILY_PASSWORD / PREVIEW_PARENT_PIN / PREVIEW_DRIVE_EMAIL, redirect addresses for previews 15 and 16).
  Left: connect the spare account's Drive once on deploy-preview-15 (For parents → Connect Google Drive). All previews
  share one storage, so every later preview uses that connection.
  - Previews are public (no Netlify visitor password), so the robot can get in. A new preview address needs its own
    redirect address in Google Cloud only for connecting; the robot test itself never connects.
  - Safety: before sending anything, the robot checks that the preview's Drive is the spare account. If previews are
    connected to the family Drive, it stops instead.
- Google Cloud app "In production" (other families cannot connect Drive until then). Needs the privacy page live first
  (https://twosistersstudio.com/privacy/), then Publish app.
- Later (Jesse, 2026-11-25: "not needed for now"): the girls' tablet app (APK) cannot Save, Download or Share (its WebView has
  no download or share hand-off). Fix with a new APK version.

## Build log

| Date | What changed | PR |
|---|---|---|
| 2026-11-25 | Ease-of-use gaps batch: app home with artist blocks + All (any number of artists, untick to choose fewer), hand-drawn icon row, Quick removed; name-only new-phone screen, guide after the name; her tablet: one-word buttons, Family Moments into an existing day, Turn + Send only, sent pictures marked waiting; waiting pictures shown marked to family and her; OK bar with pictures; Recent Whose / Where; smaller Choose photos; Google Photos share lands on the first screen (new day too); artist icons; brush-mark filters. Tests `tests/ease.test.mjs`, `tests/e2e/ease.spec.mjs`. | (this PR) |
| 2026-11-25 | Preview test set up by Jesse (guide section 9 updated); it now says why when the preview will not take the test password. Public privacy page at /privacy/ (no login, noindex, plain words, Google's Limited Use sentence), linked from the login page; "privacy" can't be a studio name. Google asks for it before the app can go In production. A test covers it. | (this PR) |
| 2026-11-25 | Jesse's Family Moments notes: one 📤 Share button (This page, a special day, Photos: pick one or many); no subtitles under page titles and no tip boxes anywhere; day names as colored brush marks, not pill boxes; ＋ Add as a paint dab, not a pill. | (this PR) |
| 2026-11-25 | Pick several to share (Jesse: yes): ☑ Pick several to share at the top of a page with pictures; tap to pick, one link for all. Previews stay name and logo; the phone-count cookie stays (Jesse: yes). | (this PR) |
| 2026-11-25 | Studios batch 3b: share one picture, a video or a whole day by link (no login; opens, phones, last opened, off switch on For parents; heads-up at 20 phones) and Download everything as one zip on a studio's For parents. Tests first (`tests/studios.test.mjs`). | (this PR) |
| 2026-11-25 | Studios batch 3b: videos for every family studio, kept in that studio's own Google Drive and shown on its Family Moments page; a View link can watch, never add. Test first (`tests/studios.test.mjs`). | (this PR) |
| 2026-11-25 | First GitHub run (Safari's engine) found: photos could not be read where createImageBitmap is missing or refuses a file (older iPhones). App now falls back to a plain picture; a test covers it. Also: where a phone's storage will not keep photo files (Safari private browsing, WebKit), Save keeps the bytes instead; a test covers it. Look check waits for its first approved pictures instead of failing. | (this PR) |
| 2026-11-25 | Guide started. Robot-phone tests (iPhone, Pixel, Fire tablet, computer) on a pretend site with fake Drive; intent and look checks; GitHub checks on every PR; guide check; reviewer agent; preview test with real Drive (needs Jesse's setup). Fixed: a new family's phone stuck on "Who?" after naming itself. | (this PR) |
