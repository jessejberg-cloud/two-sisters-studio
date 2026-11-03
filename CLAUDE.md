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

## Brief update (Jesse, 2026-11-03 evening): planned, waiting for his OK on the plan
Plan doc: https://claude.ai/artifact/EJYt34fYXdVsGch9mMePqB. These replace anything above that conflicts, once built.
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
