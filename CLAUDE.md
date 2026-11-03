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
- **Names:** Leora (older; co-hosts the podcast) and Amaya (younger), and Jesse. First names only.
  No last names anywhere: pages, titles, metadata, file names, URLs, docs. `tools/names-check.cjs` enforces this
  with hashes only; add another last name with `--hash` (the word itself must never be written to a file).
- **Structure:** Welcome page with three big buttons (Leora, Amaya, Pet Parents); the same three tabs on every page;
  simple enough for the youngest to tap through; tabs come from one list so more can be added later.
- **Galleries:** by school year (Sept–Aug), newest open; School Year (fall, winter, spring) then Summer; labels are
  grade + season + date (grades are OK behind the password); 1–2 featured pieces large per season, masonry below,
  never cropped; tap opens a lightbox with the caption (one optional line in the kid's own words); filter by year,
  season, caption. Gallery area plain and neutral; hand-drawn style in header, buttons, tabs.
  Later, not now: a birthday "year in art" recap per kid.
- **Archive:** full-quality originals stay in OneDrive (`Apps / Two Sisters Studio`), never in the repo. Folders
  kid / school year / season. File names `date_kid_season_short-title`. A `.json` beside each piece: kid, date,
  grade, season, caption, featured. The site uses resized WebP copies with all metadata stripped, lazy-loaded.
- **Upload app:** a phone web app (PWA) at `/upload/` behind the same password, for Jesse's Android phone: pick a kid,
  take photos, caption each, Save to OneDrive. New art reaches the site by a manual "add new art" step
  (Claude checks every piece for names or school text first); a weekly routine can be added later.
- **Updates:** go straight to `main` after the checks pass.
- The older rules "Netlify subdomain only" and "no password" are replaced. Everything else below still applies.

## Privacy rules (apply to the build and every update; never relax them)
- First names only (the girls, Jesse, guests). Pet names are fine.
- Never: last names, school, teacher, city/neighborhood/street, ages, birthdays.
- No photos of family or of any real people. Drawings only.
- Audio: MP3 with all ID3/file metadata stripped. Images: all EXIF/GPS stripped (`tools/add.py` does both).
- Inspect every image for signatures with last names, school names or other identifying text: crop it or flag it.
- No transcripts. Claude can't hear audio: Jesse listens to each episode for spoken details first.

## Unlisted, no tracking
- noindex meta on every page + `X-Robots-Tag` header (`netlify.toml`), `robots.txt` disallows all, no sitemap.
- Link previews show only the name and logo (`og:title` + `og-image.png`; no description).
- No links to Jesse's other sites or socials. No analytics, cookies, trackers, comments, forms, Netlify Forms
  or third-party embeds. Fonts are self-hosted. The Content-Security-Policy only allows this site's own files.
- Custom domain twosistersstudio.com; the Netlify subdomain must not contain a last name. Family password on (Netlify setting).
- `node tools/audit.cjs` checks most of this, including last names. Run it after every build (Netlify runs it too).

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
- How-to for Jesse (add art, add an episode, if something breaks, OneDrive setup): [HOW-TO.md](HOW-TO.md).

## Design
Hand-drawn, neat and orderly, kid-friendly, not Office-looking. Motif: pets and their people. Any people drawn are
racially and ethnically diverse. Busyness medium; gentle movement only, all off for reduced motion. Big text
(19px body), big tap targets (48px+), AA contrast.

## Checking a change
```
node tools/build.cjs && node tools/audit.cjs && python3 tools/add.py check
python3 -m http.server 5190 --directory dist     # local preview
```
