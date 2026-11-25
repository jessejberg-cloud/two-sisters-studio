# Two Sisters Studio: notes for Claude

A private family site for Leora and Amaya, behind one family password, not indexed. Its main job is to
display and archive the girls' artwork over many years, to be passed down to them. The Pet Parents podcast is
one section. Built by `tools/build.cjs` (no dependencies) into `dist/`; Netlify runs the build and the audit
on every push to `main`.

## Jesse's decisions (2026-11-03; these replace the older Pet Parents-only rules where they differ)
- **Name:** Two Sisters Studio. **Domain:** twosistersstudio.com (registered in Netlify on this project).
- **Repo:** `two-sisters-studio` on Jesse's GitHub account (private; was `pet-parents-site`). **Netlify project:** `two-sisters-studio`
  (id 271d83f2-9273-47b1-be88-e195689f2cb8, Pro team, so the site-wide password is a Netlify setting).
- **Access:** one shared family password for the whole site, set by Jesse in Netlify. Never put it in the repo or chat.
- **Not indexed:** noindex meta + `X-Robots-Tag` + robots.txt disallow + no sitemap.
- **Names:** Leora (older; co-hosts the podcast) and Amaya (younger), and Jesse.
- **Structure:** Welcome page with four big buttons (Leora, Amaya, Pet Parents, Family Moments); the same tabs on every page;
  simple enough for the youngest to tap through; tabs come from one list so more can be added later.
- **Galleries:** by school year (Sept–Aug), newest open; School Year (fall, winter, spring) then Summer; labels are
  grade + season + date (grades are OK behind the password); 1–2 featured pieces large per season, masonry below,
  never cropped; tap opens a lightbox with the caption (one optional line in the kid's own words); filter by year,
  season, caption. Gallery area plain and neutral; hand-drawn style in header, buttons, tabs.
  Later, not now: a birthday "year in art" recap per kid.
- **Archive:** full-quality originals stay in Jesse's personal Google Drive (`Two Sisters Studio` folder), never in
  the repo (OneDrive was dropped 2026-11-03: his Microsoft account can't register an app without Azure). Folders
  kid / school year / season when the app saves by itself; one flat folder in Share-button mode. File names `date_kid_season_short-title`. A `.json` beside each piece: kid, date,
  grade, season, caption, featured. The site uses resized WebP copies with all metadata stripped, lazy-loaded.
- **Upload app:** a phone web app (PWA) at `/upload/` behind the same password, for Jesse's Android phone: pick a kid,
  take photos (or Share in from Google Photos), crop / turn / glow, caption each, Save. Save keeps everything on the
  phone first (IndexedDB) and sends it when online and signed in; a service worker (`site-src/upload/sw.js`) keeps
  the app working offline and receives shared pictures. The installed app's scope is the whole site (Jesse, 2026-11-03): it opens on Add art, a
  "Look at the site" row opens the galleries inside the app, and an "Add art" tab shows on site pages only inside the app. Edited pictures keep the original too. Save to Google Drive (`drive.file` only; client ID in `content/site.json` googleClientId;
  until it is set, Save opens the phone's share list to the Drive app). New art reaches the site by a manual
  "add new art" step: Claude downloads new files with the Google Drive connector, then runs `tools/add.py new-art`. A weekly routine can be added later.
- **Updates:** go straight to `main` after the checks pass.
- The older rules "Netlify subdomain only" and "no password" are replaced. Everything else below still applies.

## Brief update (Jesse, 2026-11-03 evening): approved 2026-11-03 23:28Z; phases 4-6 merged to main 2026-11-04 (PR #1), live
How it is built (phase 4): `netlify/edge-functions/gate.js` (the login check before every page), `netlify/functions/`
(login, parent PIN, Google connect, rebuild), `netlify/lib/` (shared), tests in `tests/` (`npm test`). Netlify Blobs
stores are prefixed `live-` or `preview-` so previews never touch live data. The gate stays open (Netlify's built-in
password guards the site) until TSS_SECRET and FAMILY_PASSWORD are set in Netlify. Environment variables, all set by
Jesse in Netlify, never in the repo or chat: TSS_SECRET (long random), FAMILY_PASSWORD, FRIENDS_PASSWORD, PARENT_PIN,
GOOGLE_CLIENT_SECRET (all five set 2026-11-04; the two secret ones are per context: Production + Deploy Previews). Google OAuth
client: Cloud project `two-sisters-studio` (No organization, jessejberg@gmail.com), redirect URIs `/api/google/callback`
on twosistersstudio.com and deploy-preview-1. Functions answer "wrong PIN" with 200 + `{ok:false}`: Netlify dev turns some 403s into
static fallbacks. Edge functions cannot run locally here (edge.netlify.com is blocked); test them on the preview.
Plan doc: https://claude.ai/artifact/EJYt34fYXdVsGch9mMePqB. These replace anything above that conflicts, once built. Phase 5-6 files: functions pieces.mjs (art API), img.mjs, purge.mjs, share.mjs (links, /s/<id>, password changes); upload app site-src/upload/app.js; galleries drawn in site-src/main.js from /api/pieces plus content/art.json (samples step aside once real art exists).
- **Publishing:** instant on Save. Original + details file go to Google Drive; a WebP web copy goes to Netlify Blobs
  via a Netlify Function; galleries load art live (no "new art is in" step for art). Drive is the source of truth:
  the site must be rebuildable from Drive alone. Privacy checks: none (trust Jesse).
- **Access:** custom login (Edge Function), replacing Netlify's built-in password once live. Family: family password,
  whole site + app, upload and edit, logged in for months. Parents (Jesse + partner): parent PIN in the app, also
  make/manage share links. Friends: share link + friends password, chosen pages only, no app. Passwords change
  separately; a change logs out every device using it. The upload function accepts only family logins.
- **Share links (parents only, PIN required):** tick pages (Leora, Amaya, Pet Parents, or all) and expiry (week, month,
  year, never). After creating, two buttons: "Send link" (only the link) and "Send password" (only
  "Password for the art site: [password]"), each opens the Android share menu. List of links; any can be turned off;
  a link always still needs the friends password.
- **Upload app:** take or pick photos; per photo crop, rotate, enhance Auto / Paper white / Vivid (portrait blur
  skipped); original always kept in Drive. Kid Leora / Amaya / Both; optional caption; date defaults to today.
  Grade from date: set each kid's current grade once, rolls over each September; summer = "summer after 1st grade".
  3D pieces: several photos per piece, swipe in the lightbox. Star to feature; if none starred, newest in the season
  shows large. Recent uploads: edit caption/date, star, delete. Duplicate warning. Weak signal: queue, retry, show
  pending. Recently deleted: 30 days, restorable, never touches Drive originals.
- **Galleries:** "Both" pieces in both galleries with a "made together" note; on phones the filters sit behind one button.
- **Fallback:** Android share menu to the Drive app if direct Drive writing fails.
- **Testing:** Pixel 10, iPhone Safari, an older browser, desktop.
- **Phases:** 4 Drive archive + login; 5 upload app + Drive + instant publishing; 6 share links, friends password,
  parent PIN, plain-language note (passwords/PIN, share links, which Google account, Drive space).

## The girls' tablets (Jesse, 2026-11-04)
- Amazon Fire tablets in Amazon Kids profiles. Each girl has a tablet password (auth level kid-<key>, set on the parent page);
  login role `kid` sees her pages + Add art, never /parent/; Family Moments only when a parent ticks the switch (auth config kidPerms).
- Kid uploads: section `photos` ("<name>'s photos" on her page) or `moments` (Family Moments, if allowed), `waiting: true`
  until a parent taps OK (/api/pieces/waiting, /<id>/ok). Art uploads from the family login are section `art`.
- Amazon Kids blocks getUserMedia and capture inputs: the girls take pictures with the Camera app, then Choose photos.
- Home page stays at 2 to 4 big buttons (4 is almost too much). Tests: tests/kids.test.mjs.

## Adding from the app (Jesse, 2026-11-05)
- The app's first screen asks "What do you want to add?": **Art**, **A snapshot** (section `photos`, a photo one of the girls
  took; no "Both"), **A podcast episode**. A girl's tablet skips it and opens on "<name>'s snapshots".
- Episodes: `netlify/functions/episodes.mjs` (family only to add; anyone with the Pet Parents page may listen). Audio in
  3 MB pieces in Blobs store `audio` (Netlify's 6 MB request limit), played with Range requests; original + drawing +
  episode.json to Drive `Pet Parents/Episode N - title/`. The Pet Parents page merges these with `content/episodes.json`
  (main.js); app episodes open at `/pet-parents/episode/?id=`. Rebuilding the site from Drive does not cover episodes yet.
  Tests: tests/episodes.test.mjs.

## Personal information (Jesse, 2026-11-03; replaces the older privacy rules)
- Personal information is allowed: last names, school, places, ages, birthdays, family photos. The whole site is
  behind the family password, and Jesse monitors what goes on it himself. Claude does not screen art, photos,
  captions or audio for personal information, and does not crop or leave things out for that reason.
- Family Moments: special events only (a wedding, a trip to family), not everyday life; one page, one section per
  event, newest first. Same family password. Each event has a "Download all" zip of print-size copies
  (3000px JPEG, in site-src/moments-print/, zipped at build time into dist/moments/) for photo books.
  Added with `python3 tools/add.py moments <folder>` from Drive "Two Sisters Studio/Family Moments/<2026-06-14 Event title>/".
  Photos the girls take themselves: later, not now.
- `tools/add.py` still strips file metadata (EXIF/GPS, ID3) as a housekeeping default: smaller files, no
  hidden location. Jesse can ask to drop that.

## Unlisted, no tracking
- noindex meta on every page + `X-Robots-Tag` header (`netlify.toml`), `robots.txt` disallows all, no sitemap.
- Link previews show only the name and logo (`og:title` + `og-image.png`; no description).
- No links to Jesse's other sites or socials. No analytics, cookies, trackers, comments, forms, Netlify Forms
  or third-party embeds. Fonts are self-hosted. The Content-Security-Policy only allows this site's own files.
- Custom domain twosistersstudio.com. Family password on (Netlify setting).
- `node tools/audit.cjs` checks the unlisted and no-tracking rules. Run it after every build (Netlify runs it too).

## Where things live
- Names and tagline: `content/site.json`.
- Episodes: `content/episodes.json` (written by `tools/add.py episode`). Art: `content/art.json`, one list per kid
  (written by `tools/add.py new-art`). The archive format and the "add new art" steps: [ARCHIVE.md](ARCHIVE.md).
- Each kid's grade per school year: `grades` in `content/site.json`.
- Audio: `site-src/assets/audio/`. Art: `site-src/assets/art/<kid>/<school year>/`, episode drawings in `art/episodes/`.
- Sample art: `tools/make-samples.py` (`--remove` takes it out once real art arrives).
- Drawings (hand-drawn style SVG): `site-src/assets/drawings/`. Styles: `site-src/styles.css`.
- Logo: placeholder wordmark. To use her drawing, save it as `site-src/assets/logo/logo.webp` (or .png,
  metadata stripped) and run `node tools/make-brand.cjs` to remake the link-preview image and icon.
- How-to for Jesse (add art, add an episode, if something breaks, Google Drive setup): [HOW-TO.md](HOW-TO.md).

## Design
Hand-drawn, neat and orderly, kid-friendly, not Office-looking. Motif: pets and their people. Any people drawn are
racially and ethnically diverse. Busyness medium; gentle movement only, all off for reduced motion. Big text
(19px body), big tap targets (48px+), AA contrast.

## Checking a change
```
node tools/build.cjs && node tools/audit.cjs && python3 tools/add.py check
python3 -m http.server 5190 --directory dist     # local preview
```

## Family Moments videos (Jesse, 2026-11-15)
- The app's first screen has **A video** (family logins only): choose a phone video, pick the special day (or name a new one
  with its date), a few optional words, Send. `netlify/functions/videos.mjs`; tests `tests/videos.test.mjs`.
- The phone sends the video once, to the site, in 3 MB pieces (Blobs store `video`, still picture `vid-<id>` in `images`);
  it plays from there with Range requests (up to 5 pieces per answer, streamed). The site then copies it into Drive by itself
  (`video-drive-background.mjs`, `/api/videos-drive/<id>`): `Family Moments/<2026-06-14 Title>/<id>.mp4` + `.json` + poster.
  Videos keep playing if Drive disconnects. Up to 2 GB per video. HEVC videos get a warning (may not play on the Fire tablets).
- The Family Moments page shows videos at the top of their day's section (main.js); a day with only videos gets its own section.
  The page now uses CSP_SELF (connect-src 'self'), which also fixes the girls' Family Moments photos that could not load.
- Rebuilding the site from Drive does not cover videos yet.
- Full screen + save (Jesse, 2026-11-15: "many different families will be using it"): every picture viewer (art galleries,
  Family Moments photos, snapshots / the girls' Family Moments photos) and every video has **⛶ Full screen** and **⬇ Save**.
  Shared helper `window.TSS` at the top of main.js (enter/exit full screen, save a file: iPhone share sheet, else download).
  Where the browser has no full screen (the tablet app's WebView), the item fills the page with a ✕. Videos save by fetching
  all their ranges into one file in the browser (fine for phone-sized videos).
- Auto crop (Jesse, 2026-11-19: crop is the most used fix; crop art photos by default, adjust after): every photo added as
  **Art** is cropped to the paper on the phone (`findArt` in app.js: edge-ring background colour, biggest connected patch
  that differs, padded bounding box; skipped when it would keep >92% or <10% of the photo). The original is still kept.
  Under each photo: a big **✂ Crop / ✂ Adjust the crop** button (opens the editor already cropping), **↻ Turn**, and
  **Undo the crop**. Snapshots and Family Moments photos are not auto-cropped. Crop handles are 44px.

## PDF art pieces (Jesse, 2026-11-23)
- A PDF can be added as an **Art** piece (family login, not the girls' tablets, not snapshots). The app draws page 1 with pdf.js (vendored in
  `site-src/upload/vendor/`, loaded only when a PDF is picked, not scanned by the audit) and that picture is the web copy; the original PDF goes to Drive as
  `<id>-<n>-original.pdf`. The PDF itself (up to 5 MB, one function call) is stored in Blobs `images` as `<id>-<n>-pdf` via `POST /api/pieces/<id>/pdf/<n>`
  and opens from `/img/<id>/<n>/pdf` ("Open the PDF" button in the lightbox). Bigger PDFs: picture only, PDF in Drive. Rebuilding from Drive restores the picture, not the site copy of the PDF.

## Special days from the app (Jesse, 2026-11-25; ease-of-use audit, batch 1 of 3)
- The app's **A special day** button (was "A video") opens one screen: pick the day (or name a new one), then **Choose photos** or
  **Choose a video**. Photos go through the normal outbox as section `moments`, kid `both`, with `event`/`eventTitle`/`eventDate`
  (`/api/pieces/start` with `event: { key }` or `{ title, date }`); Drive folder `Family Moments/<2026-06-14 Title>/`, the same as videos.
  No looks, crop, star or date on those photos; Turn stays. A 3000px JPEG print copy goes to Blobs `images` `<id>-<n>-print`
  (`POST /api/pieces/<id>/print/<n>`, served at `/img/<id>/<n>/print`, web copy stands in when missing; not restored by a Drive rebuild).
- The Family Moments page puts these photos in their day's section (`addToDays` in main.js, `TSS.daySection` shared with videos).
  A day with app photos gets **Download all** as a zip made in the browser (`TSS.zip`) plus Save all on phones; no build needed.
  The girls' own Family Moments photos (no day) stay in their own row. `tools/add.py moments` still works for hand-added days.
- Audit and the next two batches (one-link sharing; scan fix + girls add art): /mnt/project-files/two-sisters-studio/ease-audit-2026-11-25.md. Tests: tests/moments.test.mjs.

## One-link sharing (Jesse, 2026-11-25; audit batch 2 of 3)
- A share link is the key: `/s/<id>` logs the visitor in as a friend on the link's pages (straight to the page when there is one),
  no friends password. Links still expire and can be turned off; the friends-password generation still exists, so changing
  FRIENDS_PASSWORD in Netlify logs every friend out at once. "Send password" and the friends password row on For parents are gone.
- **📤 Share this page** on Leora, Amaya, Pet Parents and Family Moments (family logins only; main.js): pick how long, Share the link,
  the phone's Share list opens. Asks for the parent PIN when needed.
- The parent PIN cookie lasts 30 days (`PARENT_MINUTES` in netlify/lib/core.mjs).

## Scan fix and the girls' art (Jesse, 2026-11-25; audit batch 3 of 3)
- Replaces the looks (Auto, Paper white, Vivid, Glow) and the box crop. Every photo added as **Art** gets the scan fix by itself
  (`findPaper` + `straighten` + `evenLight` in app.js): finds the paper's four corners (furthest patch points toward each corner;
  a non-paper shape gets a straight box), straightens it (perspective, bilinear, max 3600px), and evens out the light per area
  with one gain for red, green and blue (hues unchanged; paint-filled areas ignored; dark paper left alone). Under each photo:
  **↻ Turn** (one tap), **✂ Fix corners** (drag four 44px dots), **Use the original**. Edits saved as straighten / light / turn.
  Snapshots and special-day photos: Turn only.
- The girls' tablets open on **My art** / **A snapshot**. Her art is section `art`, waiting for a parent's OK, then in her gallery.
- **OK all**: on For parents, and on the app's first screen for a parent's phone (shows when `/api/pieces/waiting` answers).

## Households: invite links (Jesse, 2026-11-25; after the audit, batch 4)
- For Jesse's mom and sister (iPhones) and other relatives: one invite link per household, no password. `netlify/functions/houses.mjs`:
  `/i/<invite>` logs the phone in as role `house` for a year (renewed weekly by the gate) and opens `/upload/?welcome=1`; `/api/houses`
  (parent PIN) makes, lists and changes them (name, pages, off, newLink). Store `links`: `house/<id>` {id, name, pages, invite, gen, off}
  and `invite/<secret>`. The id shows on pages; the invite secret never does. Turning off or a new link logs their phones out.
- A household sees: the pages Jesse ticked, Family Moments (always), and its own page `/households/` ("Grandma's photos").
  Family logins see every household there (tab **More family**, shown once a household exists). Households never see each other's.
- Their uploads show RIGHT AWAY (Jesse, 2026-11-25), no OK: section `house` (kid `both`, `house`/`from` fields, Drive `Family/<Name>'s photos/<year>`)
  or a Family Moments day (shared, labelled "from Grandma"); videos to a day too. They cannot edit, delete or see Recent uploads.
- iPhone: no Share-into-app on iOS. A Home Screen app may not share Safari's login, so the login page accepts the pasted invite link.
- Tests: tests/houses.test.mjs. Screenshots: /mnt/project-files/two-sisters-studio/batch4/.

## The small + on every page (Jesse, 2026-11-25)
- A round **＋ Add** button at the bottom right of every site page (not For parents, not login), for family phones, households and the
  girls' tablets; never for friends on a share link (main.js). It opens the app on that page's screen: `/upload/?add=art&kid=leora`,
  `?add=day` (Family Moments), `?add=episode` (Pet Parents), `?add=house` (More family); `jumpTo()` in app.js. Households: My photos or
  the special day; a girl's tablet: her My art / A snapshot screen. Where it shows, the Add art tab is hidden (top row stays roomy).
