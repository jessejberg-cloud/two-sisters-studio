# Pet Parents podcast site: notes for Claude

A small, unlisted site for family and friends. Kids 10–12 are the audience. Built by `tools/build.cjs`
(no dependencies) into `dist/`; Netlify runs the build on every push to `main`.

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
- Netlify subdomain only; it must not contain a last name. No password for now (can be switched on later).
- `node tools/audit.cjs` checks most of this. Run it after every build.

## Where things live
- Names and tagline: `content/site.json`. Placeholders in [brackets] until Jesse gives names.
- Episodes: `content/episodes.json` (written by `tools/add.py episode`). Art: `content/art.json`.
- Audio: `site-src/assets/audio/`. Art: `site-src/assets/art/{episodes,daughter,sister}/`.
- Drawings (hand-drawn style SVG): `site-src/assets/drawings/`. Styles: `site-src/styles.css`.
- Logo: placeholder wordmark. To use her drawing, save it as `site-src/assets/logo/logo.webp` (or .png,
  metadata stripped) and run `node tools/make-brand.cjs` to remake the link-preview image and icon.
- How updates work: [UPDATES.md](UPDATES.md).

## Design
Hand-drawn, neat and orderly, kid-friendly, not Office-looking. Motif: pets and their people. Any people drawn are
racially and ethnically diverse. Busyness medium; gentle movement only, all off for reduced motion. Big text
(19px body), big tap targets (48px+), AA contrast.

## Checking a change
```
node tools/build.cjs && node tools/audit.cjs && python3 tools/add.py check
python3 -m http.server 5190 --directory dist     # local preview
```
