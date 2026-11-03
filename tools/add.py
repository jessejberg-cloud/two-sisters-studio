#!/usr/bin/env python3
"""Add new art or a new episode to Two Sisters Studio, with the privacy steps built in.

  python3 tools/add.py new-art <archive folder>    every piece in the archive that is not on the site yet
  python3 tools/add.py art <kid> <image> --date 2026-11-03 [--caption "..."] [--featured]   one piece by hand
  python3 tools/add.py episode <folder>            audio + drawing + notes.txt -> new Pet Parents episode
  python3 tools/add.py check                       re-check every audio file and image on the site

The archive (see ARCHIVE.md):  <Kid>/<2026-27>/<School Year|Summer>/<date_kid_season_short-title>.jpg
with a .json of the same name beside it: kid, date, grade, season, caption, featured.

Options for images:  --crop LEFT,TOP,RIGHT,BOTTOM   (pixels to cut off each edge, e.g. a signature)
                     --title "Title"   --alt "What the drawing shows"

What it does for you
  Audio  -> MP3, mono, 64 kbps, volume evened out, and ALL tags/metadata removed (no ID3, no encoder tag).
  Images -> turned upright, resized (max 1600px, plus a 640px copy for the grid), saved as WebP with
            ALL EXIF/GPS/metadata removed. The originals in Google Drive are never changed.

What it can NOT do (people must):
  * Listen to the whole episode for spoken last names, school, teacher, places, ages, birthdays.
    Jesse does this before dropping the file in. Claude cannot hear audio.
  * Look at every image for signatures with last names, school names or other identifying text.
    Claude opens each processed image and looks before committing; crop with --crop or flag it to Jesse.

Needs: ffmpeg, ffprobe, Python 3 with Pillow.
"""
import argparse, json, re, subprocess, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "site-src" / "assets"
EPISODES = ROOT / "content" / "episodes.json"
ART = ROOT / "content" / "art.json"
AUDIO_EXT = {".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".aiff", ".aif", ".mp4", ".mov", ".webm"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp", ".tif", ".tiff"}

# ---------------------------------------------------------------- audio
def process_audio(src: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
           "-map", "0:a:0", "-vn", "-sn", "-dn",
           "-map_metadata", "-1", "-map_chapters", "-1",
           "-fflags", "+bitexact", "-flags:a", "+bitexact",
           "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
           "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "64k",
           "-id3v2_version", "0", "-write_id3v1", "0", "-write_xing", "0",
           str(dest)]
    subprocess.run(cmd, check=True)
    check_audio(dest)
    return audio_seconds(dest)

def audio_seconds(p: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(p)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])

def check_audio(p: Path):
    head = p.read_bytes()[:16]
    tail = p.read_bytes()[-128:]
    if head.startswith(b"ID3") or tail.startswith(b"TAG"):
        sys.exit(f"STOP: {p} still has an ID3 tag.")
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", str(p)],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    tags = (data.get("format") or {}).get("tags") or {}
    for s in data.get("streams") or []:
        tags.update(s.get("tags") or {})
    if tags:
        sys.exit(f"STOP: {p} still has metadata: {tags}")
    raw = p.read_bytes()
    for marker in (b"Lavf", b"Lavc", b"LAME3", b"Xing", b"Info"):
        if marker in raw[:4096]:
            sys.exit(f"STOP: {p} has an encoder tag ({marker.decode()}).")

# ---------------------------------------------------------------- images
def process_image(src: Path, dest: Path, crop=None, max_side=1600):
    from PIL import Image, ImageOps
    try:
        import pillow_heif  # optional, for iPhone HEIC photos
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)          # turn upright, then the EXIF is dropped below
        if crop:
            l, t, r, b = crop
            im = im.crop((l, t, im.width - r, im.height - b))
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        im.thumbnail((max_side, max_side), Image.LANCZOS)
        clean = Image.frombytes(im.mode, im.size, im.tobytes())  # pixels only: no EXIF, GPS, XMP, ICC or comments
        clean.save(dest, "WEBP", quality=84, method=6)
        w, h = clean.size
    check_image(dest)
    return w, h

def check_image(p: Path):
    from PIL import Image
    with Image.open(p) as im:
        bad = {k: v for k, v in im.info.items() if k in ("exif", "xmp", "icc_profile", "comment")}
        if bad or im.getexif():
            sys.exit(f"STOP: {p} still has metadata: {list(bad) or 'EXIF'}")

# ---------------------------------------------------------------- notes
def read_notes(folder: Path):
    files = [f for f in folder.iterdir() if f.suffix.lower() in (".txt", ".md")]
    if not files:
        sys.exit("No notes.txt in the folder (title, date, description, guests, pets).")
    text = files[0].read_text(encoding="utf-8-sig")
    notes, key = {}, None
    for line in text.splitlines():
        m = re.match(r"^\s*([A-Za-z #]+?)\s*:\s*(.*)$", line)
        if m and m.group(1).strip().lower() in FIELDS:
            key = FIELDS[m.group(1).strip().lower()]
            notes[key] = m.group(2).strip()
        elif key and line.strip():
            notes[key] += " " + line.strip()
    return notes

FIELDS = {"title": "title", "date": "date", "description": "description", "short description": "description",
          "guests": "guests", "guest": "guests", "guest first names": "guests", "pets": "pets", "pet": "pets",
          "pet names": "pets", "episode": "number", "episode #": "number", "number": "number",
          "drawing": "alt", "drawing description": "alt", "alt": "alt"}

def parse_date(s):
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y", "%B %d %Y"):
        try:
            from datetime import datetime
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    if s:
        sys.exit(f"Can't read the date '{s}'. Use 2026-11-15 or 11/15/2026.")
    return date.today().isoformat()

def split_names(s):
    return [x.strip() for x in re.split(r",|\band\b|&|;", s or "") if x.strip()]

def parse_pets(s):
    pets = []
    for item in split_names(s):
        m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", item) or re.match(r"^(.*?)\s+the\s+(.*)$", item)
        pets.append({"name": m.group(1).strip(), "kind": m.group(2).strip()} if m else {"name": item})
    return pets

# ---------------------------------------------------------------- commands
def cmd_episode(a):
    folder = Path(a.folder)
    files = [f for f in folder.iterdir() if f.is_file()]
    audio = [f for f in files if f.suffix.lower() in AUDIO_EXT]
    images = [f for f in files if f.suffix.lower() in IMAGE_EXT]
    if len(audio) != 1:
        sys.exit(f"Expected exactly one audio file in {folder}, found {len(audio)}.")
    notes = read_notes(folder)
    for need in ("title", "description"):
        if not notes.get(need):
            sys.exit(f"notes are missing '{need}'.")
    eps = json.loads(EPISODES.read_text())
    num = int(notes.get("number") or (max([e["number"] for e in eps], default=0) + 1))
    if any(e["number"] == num for e in eps) and not a.replace:
        sys.exit(f"Episode {num} already exists (use --replace to redo it).")
    tag = f"ep-{num:03d}"
    secs = process_audio(audio[0], ASSETS / "audio" / f"{tag}.mp3")
    ep = {"number": num, "title": notes["title"], "date": parse_date(notes.get("date")),
          "description": notes["description"], "guests": split_names(notes.get("guests")),
          "pets": parse_pets(notes.get("pets")), "audio": f"audio/{tag}.mp3", "minutes": round(secs / 60)}
    if images:
        w, h = process_image(images[0], ASSETS / "art" / "episodes" / f"{tag}.webp", a.crop)
        ep.update({"drawing": f"art/episodes/{tag}.webp", "drawingW": w, "drawingH": h,
                   "drawingAlt": a.alt or notes.get("alt") or f"{notes['title']}: drawing for episode {num}"})
    eps = [e for e in eps if e["number"] != num] + [ep]
    eps.sort(key=lambda e: e["number"])
    EPISODES.write_text(json.dumps(eps, indent=2, ensure_ascii=False) + "\n")
    print(f"Added episode {num}: {ep['title']} ({ep['minutes']} min)")
    if images:
        print(f"LOOK AT THIS IMAGE before committing: {ASSETS / ep['drawing']}")
    print("Reminder: the audio was only cleaned of file metadata. Jesse must have listened to it for spoken details.")

SITE = ROOT / "content" / "site.json"
SEASONS = ("fall", "winter", "spring", "summer")

def season_of(iso):
    m = int(iso[5:7])
    return "fall" if m in (9, 10, 11) else "winter" if m in (12, 1, 2) else "spring" if m in (3, 4, 5) else "summer"

def school_year_of(iso):
    y, m = int(iso[:4]), int(iso[5:7])
    return f"{y}-{str(y + 1)[2:]}" if m >= 9 else f"{y - 1}-{str(y)[2:]}"

def slug(s, n=5):
    return "-".join("".join(ch if ch.isalnum() else " " for ch in (s or "").lower()).split()[:n]) or "untitled"

def kids():
    return {k["key"]: k for k in json.loads(SITE.read_text())["kids"]}

def add_piece(data, kid, src, meta, crop=None):
    """Make the web copies of one piece and add it to content/art.json. Returns the new entry, or None if already there."""
    iso = parse_date(meta.get("date"))
    season = (meta.get("season") or season_of(iso)).lower()
    if season not in SEASONS:
        sys.exit(f"{src}: season must be one of {', '.join(SEASONS)}")
    sy = meta.get("schoolYear") or school_year_of(iso)
    grade = (meta.get("grade") or kids()[kid].get("grades", {}).get(sy, "")).strip()
    caption = (meta.get("caption") or "").strip()
    pid = meta.get("id") or f"{iso}_{kid}_{season}_{slug(meta.get('title') or caption)}"
    pid = re.sub(r"[^a-z0-9_-]", "-", pid.lower())
    lst = data.setdefault(kid, [])
    if any(x["id"] == pid or x.get("original") == src.name for x in lst):
        return None
    rel = f"art/{kid}/{sy}/{pid}"
    w, h = process_image(src, ASSETS / f"{rel}.webp", crop)
    process_image(src, ASSETS / f"{rel}-sm.webp", crop, max_side=640)
    entry = {"id": pid, "src": f"{rel}.webp", "thumb": f"{rel}-sm.webp", "w": w, "h": h, "date": iso,
             "schoolYear": sy, "season": season, "grade": grade, "caption": caption,
             "alt": meta.get("alt") or caption or f"A drawing by {kids()[kid]['name']}",
             "featured": bool(meta.get("featured")), "original": src.name}
    lst.append(entry)
    return entry

def cmd_new_art(a):
    """Walk the archive and add every piece that is not on the site yet. Never writes to the archive."""
    root = Path(a.folder)
    data = json.loads(ART.read_text())
    names = {k["name"].lower(): key for key, k in kids().items()}
    added = []
    images = sorted(p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXT)
    stems = {p.with_suffix("") for p in images}
    for img in images:
        # The app saves an edited picture as name.jpg and the untouched one as name-original.ext: use the edited one.
        if img.stem.endswith("-original") and img.with_name(img.stem[:-9]) in stems:
            continue
        side = img.with_suffix(".json")
        meta = json.loads(side.read_text(encoding="utf-8-sig")) if side.exists() else {}
        # Which kid: the .json, then the file name (date_kid_season_title), then a folder named for her.
        m = re.match(r"\d{4}-\d{2}-\d{2}_([a-z]+)_", img.name.lower())
        kid = (meta.get("kid") if meta.get("kid") in kids() else None) or (m.group(1) if m and m.group(1) in kids() else None) \
            or next((names[part.lower()] for part in img.relative_to(root).parts if part.lower() in names), None)
        if not kid:
            print(f"SKIP (can't tell whose art it is): {img}"); continue
        if not meta.get("date"):
            m = re.match(r"(\d{4}-\d{2}-\d{2})", img.name)
            meta["date"] = m.group(1) if m else None
            if not meta["date"]:
                print(f"SKIP (no date in the name or .json): {img}"); continue
        if re.match(r"\d{4}-\d{2}-\d{2}_", img.stem):
            meta.setdefault("id", img.stem)
        entry = add_piece(data, kid, img, meta)
        if entry:
            added.append(entry)
    ART.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"Added {len(added)} new piece(s).")
    for e in added:
        print(f"LOOK AT THIS IMAGE before committing: {ASSETS / e['src']}")
    missing = sorted({e['schoolYear'] for e in added if not e['grade']})
    if missing:
        print(f"No grade set for school year(s) {', '.join(missing)}: add it under \"grades\" in content/site.json.")

def cmd_art(a):
    data = json.loads(ART.read_text())
    for src in map(Path, a.images):
        entry = add_piece(data, a.kid, src, {"date": a.date, "caption": a.caption, "featured": a.featured,
                                             "title": a.title, "alt": a.alt, "season": a.season}, a.crop)
        print(f"Added {entry['src']}. LOOK AT THIS IMAGE before committing: {ASSETS / entry['src']}" if entry else f"Already on the site: {src}")
    ART.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

def cmd_check(_a):
    n = 0
    for p in (ASSETS / "audio").glob("*.mp3"):
        check_audio(p); n += 1
    for p in (ASSETS / "art").rglob("*"):
        if p.suffix.lower() in IMAGE_EXT:
            check_image(p); n += 1
    print(f"OK: {n} audio/image files have no metadata.")

def crop_arg(s):
    parts = [int(x) for x in s.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("use LEFT,TOP,RIGHT,BOTTOM")
    return parts

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("episode"); e.add_argument("folder"); e.add_argument("--crop", type=crop_arg)
    e.add_argument("--alt"); e.add_argument("--replace", action="store_true")
    r = sub.add_parser("art"); r.add_argument("kid"); r.add_argument("images", nargs="+")
    r.add_argument("--date"); r.add_argument("--caption"); r.add_argument("--featured", action="store_true")
    r.add_argument("--season", choices=SEASONS); r.add_argument("--crop", type=crop_arg); r.add_argument("--title"); r.add_argument("--alt")
    n = sub.add_parser("new-art"); n.add_argument("folder")
    sub.add_parser("check")
    a = ap.parse_args()
    {"episode": cmd_episode, "art": cmd_art, "new-art": cmd_new_art, "check": cmd_check}[a.cmd](a)

if __name__ == "__main__":
    main()
