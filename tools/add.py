#!/usr/bin/env python3
"""Add a new episode or new art to the Pet Parents site, with the privacy steps built in.

  python3 tools/add.py episode <folder>            audio + drawing + notes.txt -> new episode
  python3 tools/add.py art daughter <image> [...]  her other art  -> Artwork page
  python3 tools/add.py art sister   <image> [...]  her sister's art -> "[Sister]'s Art" page
  python3 tools/add.py check                       re-check every audio file and image on the site

Options for images:  --crop LEFT,TOP,RIGHT,BOTTOM   (pixels to cut off each edge, e.g. a signature)
                     --title "Title"   --alt "What the drawing shows"

What it does for you
  Audio  -> MP3, mono, 64 kbps, volume evened out, and ALL tags/metadata removed (no ID3, no encoder tag).
  Images -> turned upright, resized (max 1600px), saved as WebP with ALL EXIF/GPS/metadata removed.

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

def cmd_art(a):
    data = json.loads(ART.read_text())
    lst = data.setdefault(a.who, [])
    for src in map(Path, a.images):
        n = 1 + max([int(re.search(r"(\d+)", Path(x["src"]).stem).group(1)) for x in lst] or [0])
        rel = f"art/{a.who}/{a.who}-{n:03d}.webp"
        w, h = process_image(src, ASSETS / rel, a.crop)
        title = a.title or ""
        lst.insert(0, {"src": rel, "title": title, "alt": a.alt or title or "A drawing", "w": w, "h": h,
                       "added": date.today().isoformat()})
        print(f"Added {rel}. LOOK AT THIS IMAGE before committing: {ASSETS / rel}")
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
    r = sub.add_parser("art"); r.add_argument("who", choices=["daughter", "sister"]); r.add_argument("images", nargs="+")
    r.add_argument("--crop", type=crop_arg); r.add_argument("--title"); r.add_argument("--alt")
    sub.add_parser("check")
    a = ap.parse_args()
    {"episode": cmd_episode, "art": cmd_art, "check": cmd_check}[a.cmd](a)

if __name__ == "__main__":
    main()
