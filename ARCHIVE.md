# The art archive

The girls' full-quality originals live in Jesse's personal Google Drive, **not** in this repo and not on the site.
The site only shows resized copies (WebP, all photo data removed) that `tools/add.py` makes from them.

## Where
`Google Drive / Two Sisters Studio /` on Jesse's personal Google account (decided 2026-11-03; OneDrive was tried
first, but his Microsoft account can't register an app without Azure).

- **With the Google sign-in set up**, the app's Save files each piece into the folders below by itself.
  The app only has `drive.file` access: it can see only what it made.
- **Before that (Share-button mode)**, Jesse shares the photos to the Drive app into the one
  `Two Sisters Studio` folder. That is fine: the file names and the .json say whose art it is and when.

```
Two Sisters Studio/
  Leora/
    2026-27/
      School Year/
        2026-11-03_leora_fall_blue-cat.jpg
        2026-11-03_leora_fall_blue-cat.json
      Summer/
  Amaya/
    2026-27/
      School Year/
      Summer/
```

- **School year** runs September to August. Summer (June to August) belongs to the school year that just ended,
  so summer 2027 is in `2026-27/Summer`.
- **Seasons:** fall (Sep–Nov), winter (Dec–Feb), spring (Mar–May), summer (Jun–Aug).

## File names
`date_kid_season_short-title`, all lowercase, no spaces: `2026-11-03_leora_fall_blue-cat.jpg`.
First names only. If two pieces would get the same name, the upload app adds `-2`, `-3`.

## Edited pictures
If Jesse crops, turns or adds glow in the app, it saves the edited picture as `name.jpg` and the untouched one as
`name-original.<ext>`; the .json says `"edited": true` and names the original. `tools/add.py new-art` uses the edited one.

## The .json beside each piece
```json
{
  "kid": "leora",
  "date": "2026-11-03",
  "grade": "5th grade",
  "season": "fall",
  "caption": "My blue cat is very grumpy",
  "featured": false
}
```
- `caption` is optional: one line, in the kid's own words.
- `grade` can be left empty; then it comes from `grades` in `content/site.json` for that school year.
- `featured: true` shows the piece large at the top of its season (up to 2 per season).
- A piece with no .json still works if its file name starts with the date.

## Adding new art to the site
Jesse says "new art is in". Claude then:
1. Downloads the new files from the Drive folder with the Google Drive connector (read only; never changes,
   moves or deletes anything there).
2. Runs `python3 tools/add.py new-art <copied folder>`. It skips pieces already on the site, turns photos upright,
   makes a 1600px and a 640px WebP with no photo data, and lists every new image.
3. Opens every new image at full size and looks for last names, school names or other identifying text.
   Crops it (`tools/add.py art ... --crop`) or flags it to Jesse and leaves that piece out.
4. Checks captions for last names, school, teacher, places, ages and birthdays.
5. Runs `node tools/build.cjs && node tools/audit.cjs && python3 tools/add.py check`, commits, pushes.
6. Tells Jesse what went up and anything left out.

## Family Moments (real photos)
Drive: `Two Sisters Studio/Family Moments/<YYYY-MM-DD Event title>/` with the photos inside. Optional `event.json`
in the event folder: `{"title", "date", "endDate", "note"}`. Optional photo `.json` beside a photo: `{"caption", "date"}`.
Claude downloads the new folders with the Google Drive connector, looks at every photo, then runs
`python3 tools/add.py moments <folder>`. The site keeps WebP copies (1600px and 640px) in `assets/moments/<event>/`
and print copies (3000px JPEG) in `site-src/moments-print/<event>/` for the event's Download all zip.
All metadata is removed; the originals in Drive are never changed.
