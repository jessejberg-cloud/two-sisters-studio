#!/usr/bin/env python3
"""Make SAMPLE art for the galleries, so the layout can be seen before real art arrives.
Every sample is marked "sample": true in content/art.json and shows a "Sample" tag on the site.
Remove them all with:  python3 tools/make-samples.py --remove
"""
import json, math, random, shutil, sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "site-src" / "assets"
ART = ROOT / "content" / "art.json"
GRADES = {k["key"]: k.get("grades", {}) for k in json.loads((ART.parent / "site.json").read_text())["kids"]}

PAPERS = [(255, 253, 247), (250, 246, 236), (246, 250, 255), (255, 250, 240)]
CRAYONS = [(228, 87, 46), (255, 190, 60), (95, 168, 211), (110, 190, 140), (125, 78, 158), (240, 120, 160), (60, 60, 70)]

def wobbly_line(d, pts, color, width, rnd):
    jit = [(x + rnd.uniform(-3, 3), y + rnd.uniform(-3, 3)) for x, y in pts]
    d.line(jit, fill=color, width=width, joint="curve")

def circle_pts(cx, cy, r, n=40, rnd=None):
    return [(cx + r * math.cos(2 * math.pi * i / n) * (1 + (rnd.uniform(-.04, .04) if rnd else 0)),
             cy + r * math.sin(2 * math.pi * i / n) * (1 + (rnd.uniform(-.04, .04) if rnd else 0))) for i in range(n + 1)]

def draw_sun(d, w, h, r):
    cx, cy, rad = w * .72, h * .25, min(w, h) * .12
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(255, 210, 90))
    wobbly_line(d, circle_pts(cx, cy, rad, rnd=r), (230, 150, 30), 6, r)
    for i in range(10):
        a = 2 * math.pi * i / 10
        wobbly_line(d, [(cx + rad * 1.3 * math.cos(a), cy + rad * 1.3 * math.sin(a)), (cx + rad * 1.8 * math.cos(a), cy + rad * 1.8 * math.sin(a))], (230, 150, 30), 6, r)

def draw_house(d, w, h, r):
    x0, y0, x1, y1 = w * .18, h * .5, w * .55, h * .85
    c = r.choice(CRAYONS)
    d.rectangle([x0, y0, x1, y1], fill=tuple(min(255, v + 90) for v in c))
    wobbly_line(d, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], c, 7, r)
    wobbly_line(d, [(x0 - 15, y0), ((x0 + x1) / 2, h * .3), (x1 + 15, y0)], (180, 60, 40), 8, r)
    wobbly_line(d, [(w * .33, y1), (w * .33, h * .68), (w * .41, h * .68), (w * .41, y1)], (90, 60, 40), 6, r)

def draw_flower(d, w, h, r):
    for k in range(r.randint(2, 4)):
        cx, cy = w * r.uniform(.15, .85), h * r.uniform(.45, .65)
        wobbly_line(d, [(cx, cy), (cx + r.uniform(-10, 10), h * .92)], (90, 160, 90), 7, r)
        c = r.choice(CRAYONS[:6])
        for i in range(6):
            a = 2 * math.pi * i / 6
            px, py, pr = cx + 34 * math.cos(a), cy + 34 * math.sin(a), 22
            d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=c)
        d.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=(255, 200, 60))

def draw_cat(d, w, h, r):
    cx, cy, rad = w * .45, h * .55, min(w, h) * .22
    c = r.choice([(240, 160, 80), (120, 120, 130), (60, 60, 70)])
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=tuple(min(255, v + 60) for v in c))
    wobbly_line(d, circle_pts(cx, cy, rad, rnd=r), c, 7, r)
    wobbly_line(d, [(cx - rad * .8, cy - rad * .5), (cx - rad * .6, cy - rad * 1.35), (cx - rad * .2, cy - rad * .9)], c, 7, r)
    wobbly_line(d, [(cx + rad * .8, cy - rad * .5), (cx + rad * .6, cy - rad * 1.35), (cx + rad * .2, cy - rad * .9)], c, 7, r)
    for ex in (-.35, .35):
        d.ellipse([cx + rad * ex - 9, cy - rad * .2 - 9, cx + rad * ex + 9, cy - rad * .2 + 9], fill=(40, 40, 50))
    for s in (-1, 1):
        for k in (-.1, .1):
            wobbly_line(d, [(cx + s * rad * .2, cy + rad * .2), (cx + s * rad * 1.1, cy + rad * (.1 + k))], (40, 40, 50), 3, r)

def draw_rainbow(d, w, h, r):
    cx, cy = w * .5, h * .85
    for i, c in enumerate(CRAYONS[:6]):
        rad = min(w * .45, h * .6) * (1 - i * .11)
        pts = [(cx + rad * math.cos(math.pi + math.pi * k / 40), cy + rad * math.sin(math.pi + math.pi * k / 40)) for k in range(41)]
        wobbly_line(d, pts, c, 18, r)

def draw_scribble(d, w, h, r):
    for _ in range(r.randint(5, 9)):
        c = r.choice(CRAYONS)
        x, y = w * r.uniform(.1, .9), h * r.uniform(.1, .9)
        pts = []
        for _ in range(r.randint(8, 20)):
            x = min(w * .95, max(w * .05, x + r.uniform(-90, 90))); y = min(h * .95, max(h * .05, y + r.uniform(-90, 90)))
            pts.append((x, y))
        wobbly_line(d, pts, c, r.randint(6, 12), r)

def draw_person(d, w, h, r):
    for k in range(r.randint(1, 3)):
        cx = w * (.25 + k * .25); top = h * .35
        skin = r.choice([(120, 80, 55), (190, 135, 95), (235, 195, 160), (90, 60, 45), (210, 160, 120)])
        d.ellipse([cx - 40, top - 40, cx + 40, top + 40], fill=skin)
        wobbly_line(d, circle_pts(cx, top, 40, rnd=r), (60, 60, 70), 5, r)
        c = r.choice(CRAYONS)
        wobbly_line(d, [(cx, top + 40), (cx, top + 170)], c, 9, r)
        wobbly_line(d, [(cx - 60, top + 90), (cx + 60, top + 90)], c, 8, r)
        wobbly_line(d, [(cx - 45, top + 260), (cx, top + 170), (cx + 45, top + 260)], (60, 60, 70), 8, r)

SCENES = [[draw_sun, draw_house, draw_flower], [draw_cat], [draw_rainbow, draw_sun], [draw_scribble], [draw_person, draw_sun], [draw_flower], [draw_cat, draw_flower]]
SIZES = [(1200, 900), (900, 1200), (1000, 1000), (1400, 800), (800, 1300), (1100, 850)]

PLAN = {
  "leora": [
    ("2026-10-28", "fall", True, "Our cat when she is sleepy"), ("2026-10-09", "fall", True, "A rainbow after the rain"),
    ("2026-10-02", "fall", False, ""), ("2026-09-22", "fall", False, "Me and my friends at the park"), ("2026-09-12", "fall", False, "Flowers for Grandma"),
    ("2026-07-20", "summer", True, "The hottest day ever"), ("2026-06-30", "summer", False, ""),
    ("2026-04-18", "spring", True, "Spring flowers"), ("2026-03-09", "spring", False, "Scribble storm"),
    ("2026-01-15", "winter", True, "Snow day!"), ("2025-12-03", "winter", False, ""),
    ("2025-10-20", "fall", True, "Our house"), ("2025-09-25", "fall", False, "A very fancy cat"),
  ],
  "amaya": [
    ("2026-10-30", "fall", True, "This is my bunny"), ("2026-10-14", "fall", False, "Sun"),
    ("2026-09-30", "fall", False, ""), ("2026-09-15", "fall", False, "Rainbow!"),
    ("2026-08-04", "summer", True, "Beach"), ("2026-06-21", "summer", False, ""),
    ("2026-05-02", "spring", True, "Flowers"), ("2026-02-11", "winter", True, "Me and my sister"),
    ("2025-11-05", "fall", True, "My family"), ("2025-09-18", "fall", False, ""),
  ],
}

def school_year(iso):
    y, m = int(iso[:4]), int(iso[5:7])
    return f"{y}-{str(y + 1)[2:]}" if m >= 9 else f"{y - 1}-{str(y)[2:]}"

def save_webp(im, path, side):
    im = im.copy(); im.thumbnail((side, side), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.frombytes(im.mode, im.size, im.tobytes()).save(path, "WEBP", quality=80, method=6)
    return im.size

def make():
    data = json.loads(ART.read_text())
    for kid, plan in PLAN.items():
        lst = [x for x in data.get(kid, []) if not x.get("sample")]
        for i, (iso, season, featured, caption) in enumerate(plan):
            r = random.Random(f"{kid}{i}")
            w, h = SIZES[(i * 5 + len(kid)) % len(SIZES)]
            im = Image.new("RGB", (w, h), r.choice(PAPERS)); d = ImageDraw.Draw(im)
            c = caption.lower()
            pick = ([draw_cat] if "cat" in c or "bunny" in c else [draw_rainbow, draw_sun] if "rainbow" in c
                    else [draw_flower] if "flower" in c else [draw_person, draw_sun] if any(k in c for k in ("me ", "friends", "family", "sister"))
                    else [draw_sun, draw_house, draw_flower] if "house" in c or "beach" in c or "hot" in c or "sun" in c
                    else [draw_scribble] if "scribble" in c or "snow" in c else SCENES[(i * 3 + len(kid)) % len(SCENES)])
            for fn in pick:
                fn(d, w, h, r)
            sy = school_year(iso)
            slug = (caption or "untitled").lower()
            slug = "-".join("".join(ch if ch.isalnum() else " " for ch in slug).split()[:4]) or "untitled"
            name = f"{iso}_{kid}_{season}_{slug}"
            rel = f"art/{kid}/samples/{name}"
            fw, fh = save_webp(im, ASSETS / f"{rel}.webp", 1600)
            save_webp(im, ASSETS / f"{rel}-sm.webp", 640)
            lst.append({"id": name, "src": f"{rel}.webp", "thumb": f"{rel}-sm.webp", "w": fw, "h": fh, "date": iso,
                        "schoolYear": sy, "season": season, "grade": GRADES.get(kid, {}).get(sy, ""), "caption": caption,
                        "alt": caption or "A drawing", "featured": featured, "sample": True})
        data[kid] = lst
    data.pop("daughter", None); data.pop("sister", None)
    ART.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print("Sample art written for", ", ".join(PLAN))

def remove():
    data = json.loads(ART.read_text())
    for kid in list(data):
        data[kid] = [x for x in data[kid] if not x.get("sample")]
        shutil.rmtree(ASSETS / "art" / kid / "samples", ignore_errors=True)
    ART.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    mom_path = ART.parent / "moments.json"
    mom = json.loads(mom_path.read_text())
    for ev in [e for e in mom.get("events", []) if e.get("sample")]:
        shutil.rmtree(ASSETS / "moments" / ev["key"], ignore_errors=True)
        shutil.rmtree(ROOT / "site-src" / "moments-print" / ev["key"], ignore_errors=True)
    mom["events"] = [e for e in mom.get("events", []) if not e.get("sample")]
    mom_path.write_text(json.dumps(mom, indent=2, ensure_ascii=False) + "\n")
    print("Sample art and sample Family Moments removed.")

if __name__ == "__main__":
    remove() if "--remove" in sys.argv else make()
