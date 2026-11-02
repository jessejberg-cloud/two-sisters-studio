# Adding a new episode or new art

## Jesse's part

**1. Listen to the whole episode first.** Claude can't hear audio, so it can't catch spoken details.
Before you drop a file in, listen for and cut (or re-record):
- last names (anyone's, including guests')
- school or teacher names
- city, neighborhood, street, or other places that show where you live
- ages and birthdays

**2. Drop the files in the incoming folder** in the Pet Parents folder on your PC:
- **A new episode:** make one folder per episode (any name, e.g. `Biscuit`) with
  - the audio (MP3, M4A, WAV, or whatever the recorder makes)
  - the episode drawing (a photo or scan is fine)
  - `notes.txt`, filled in like this (copy `notes-template.txt`):
    ```
    Title: Biscuit the Very Good Boy
    Date: 11/15/2026
    Description: One or two sentences about the episode.
    Guests: Maya
    Pets: Biscuit (dog), Pepper (cat)
    Drawing description: Biscuit asleep on a pile of socks
    ```
    First names only. "Drawing description" is optional (it's read aloud by screen readers).
- **Her other art:** drop it in the subfolder for her art.
- **Her sister's art:** drop it in the subfolder for her sister's art.
  Add a `notes.txt` beside the pictures if you want titles (one line per picture: `filename: title`).

**3. Tell Claude** in the Pet Parents project: "new episode is in" (or "new art is in").

## Claude's part (every time, in this order)

1. Copy the new files from the incoming folder. Never move, rename, or delete anything in Jesse's folders;
   Claude only writes in its own subfolder.
2. Read `notes.txt`. Remove anything that breaks the privacy rules (last names, school, teacher, places,
   ages, birthdays) and tell Jesse what was removed.
3. Run the tool. It strips **all** metadata (ID3 tags, EXIF, GPS), turns photos upright, shrinks images,
   and compresses the audio (mono MP3, 64 kbps, even volume):
   ```
   python3 tools/add.py episode <episode folder>
   python3 tools/add.py art daughter <image> [more images] --title "Title"
   python3 tools/add.py art sister   <image> [more images] --title "Title"
   ```
4. **Look at every processed image** at full size. If there is a signature with a last name, a school name,
   a name tag, an address, or any other identifying text, re-run with `--crop LEFT,TOP,RIGHT,BOTTOM`
   (pixels cut from each edge). If cropping would ruin the drawing, stop and ask Jesse.
   No photos of real people, ever.
5. Check: `node tools/build.cjs && node tools/audit.cjs && python3 tools/add.py check`.
6. Commit and push to `main`. Netlify rebuilds the live site in about a minute.
   If anything was flagged in step 2 or 4, wait for Jesse before publishing.
7. Tell Jesse it's live, with the link, and list anything that was removed or cropped.

Newest episode shows first on Home automatically; the one before it moves to "More episodes".
