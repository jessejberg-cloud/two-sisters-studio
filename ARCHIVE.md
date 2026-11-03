# The art archive

The girls' full-quality originals live in OneDrive, **not** in this repo and not on the site.
The site only shows resized copies (WebP, all photo data removed) that `tools/add.py` makes from them.

## Where
`OneDrive / Apps / Two Sisters Studio /` (the upload app can only write inside this folder).

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
1. Copies the new files from the archive (read only; never changes, moves or deletes anything there).
2. Runs `python3 tools/add.py new-art <copied folder>`. It skips pieces already on the site, turns photos upright,
   makes a 1600px and a 640px WebP with no photo data, and lists every new image.
3. Opens every new image at full size and looks for last names, school names or other identifying text.
   Crops it (`tools/add.py art ... --crop`) or flags it to Jesse and leaves that piece out.
4. Checks captions for last names, school, teacher, places, ages and birthdays.
5. Runs `node tools/build.cjs && node tools/audit.cjs && python3 tools/add.py check`, commits, pushes.
6. Tells Jesse what went up and anything left out.
