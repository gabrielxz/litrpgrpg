#!/usr/bin/env python3
"""Bake the cover block onto the cover art.

Layout (fractions of the page, so any master size works):
  a tracked small-caps subtitle at the top, a short gold rule under it,
  the GRADEBREAKER wordmark, a hairline rule broken at its centre by the
  clave, and a dark bar along the bottom carrying the edition line on the
  left and the byline on the right. Every string is a constant below.

The art carries no text of its own; the bake renders the type at the
master's size, so upscale the art, never a titled cover.

Fonts resolve through kpathsea first and then book/assets/fonts/, so a face
that is not in the TeX tree can be dropped into that folder.
"""
import os, subprocess
from PIL import Image, ImageDraw, ImageFont

INK  = (19, 27, 32)
BONE = (244, 237, 225)
CYAN = (143, 230, 239)
GOLD = (125, 95, 30)          # #7d5f1e
DIM  = (128, 136, 144)

SUBTITLE  = "THE LITRPG RPG"
WORDMARK  = "GRADEBREAKER"
EDITION   = ["GRADE F", "VOL. 01", "CORE BOOK"]   # the F is set in cyan
BYLINE    = "GABRIEL BEAL"

FACE_WORDMARK = "ChakraPetch-Bold.ttf"       # book/assets/fonts/, OFL
FACE_MONO     = "JetBrainsMono-Regular.otf"
FACE_MONO_B   = "JetBrainsMono-Bold.otf"

CLAVE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "book", "art", "emblem", "clave-mark.png")

FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "book", "assets", "fonts")

def font(name, size):
    local = os.path.join(FONT_DIR, name)
    if os.path.exists(local):
        return ImageFont.truetype(local, size)
    path = subprocess.check_output(["kpsewhich", name], text=True).strip()
    if not path:
        raise SystemExit(f"font not found: {name} (TeX tree or {FONT_DIR})")
    return ImageFont.truetype(path, size)

def tracked_width(f, s, track):
    return sum(f.getlength(c) for c in s) + track * (len(s) - 1)

def tracked(d, x, y, s, f, track, fill, anchor="l", colors=None):
    """Draw s letter by letter with `track` px between letters. anchor: l, m, r
    for the x; y is the vertical centre of the caps. colors maps an index to a fill."""
    w = tracked_width(f, s, track)
    if anchor == "m": x -= w / 2
    elif anchor == "r": x -= w
    for i, c in enumerate(s):
        d.text((x, y), c, font=f, fill=(colors or {}).get(i, fill), anchor="lm")
        x += f.getlength(c) + track
    return w

def tinted(path, rgb):
    """The clave in one flat colour, alpha preserved."""
    src = Image.open(path).convert("RGBA")
    out = Image.new("RGBA", src.size, tuple(rgb) + (0,))
    out.putalpha(src.getchannel("A"))
    return out


def band_luminance(im, y0, y1):
    band = im.convert("L").crop((0, int(y0 * im.height), im.width, int(y1 * im.height))).resize((64, 8))
    return sum(band.get_flattened_data() if hasattr(band, "get_flattened_data") else band.getdata()) / (64 * 8)

def main(src, dst):
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    light_top = band_luminance(im, 0.02, 0.16) > 150
    ink = INK if light_top else BONE
    d = ImageDraw.Draw(im)

    # subtitle, tracked, centred near the top
    f_sub = font(FACE_MONO, int(H * 0.016))
    tracked(d, W / 2, H * 0.029, SUBTITLE, f_sub, track=f_sub.size * 0.42, fill=GOLD, anchor="m")

    # short gold rule under it
    rw, ry, rt = W * 0.165, H * 0.048, max(2, int(W * 0.0015))
    d.rectangle([W / 2 - rw / 2, ry - rt / 2, W / 2 + rw / 2, ry + rt / 2], fill=GOLD)

    # the wordmark: sized to a fixed width, centred, cap-centre at 8.85% of the height
    probe = font(FACE_WORDMARK, 200)
    x0, y0, x1, y1 = probe.getbbox(WORDMARK)
    f_wm = font(FACE_WORDMARK, int(200 * (W * 0.775) / (x1 - x0)))
    d.text((W / 2, H * 0.0885), WORDMARK, font=f_wm, fill=ink, anchor="mm")

    # the long hairline, broken at its centre by the clave. The mark takes the
    # same ink/bone choice as the wordmark: cyan measures 1.04 against this
    # art's pale sky and disappears, where ink measures 12.67.
    ly, lx0, lx1, ht = H * 0.135, W * 0.068, W * 0.932, max(1, int(W * 0.0008))
    mark = tinted(CLAVE, ink)
    mh = int(H * 0.042)
    mw = round(mark.width * mh / mark.height)
    mark = mark.resize((mw, mh), Image.LANCZOS)
    gap = mw / 2 + W * 0.010
    d.rectangle([lx0, ly - ht / 2, W / 2 - gap, ly + ht / 2], fill=GOLD)
    d.rectangle([W / 2 + gap, ly - ht / 2, lx1, ly + ht / 2], fill=GOLD)
    im.alpha_composite(mark, (int(W / 2 - mw / 2), int(ly - mh / 2)))
    d = ImageDraw.Draw(im)

    # the bottom bar
    bx0, bx1, by0, by1 = W * 0.05, W * 0.95, H * 0.915, H * 0.975
    bar = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(bar).rounded_rectangle([bx0, by0, bx1, by1], radius=int(W * 0.005), fill=INK + (218,))
    im.alpha_composite(bar)
    d = ImageDraw.Draw(im)
    f_ed, f_by = font(FACE_MONO, int(H * 0.0125)), font(FACE_MONO_B, int(H * 0.0125))
    ty, track = (by0 + by1) / 2, f_ed.size * 0.25
    x = W * 0.082
    for i, item in enumerate(EDITION):
        colors = {item.index("F"): CYAN} if item == "GRADE F" else None
        x += tracked(d, x, ty, item, f_ed, track, BONE, colors=colors)
        if i < len(EDITION) - 1:
            x += f_ed.size * 1.1
            d.text((x, ty), "|", font=f_ed, fill=DIM, anchor="lm")
            x += f_ed.getlength("|") + f_ed.size * 1.1
    tracked(d, W * 0.918, ty, BYLINE, f_by, track, BONE, anchor="r")

    im.convert("RGB").save(dst)

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    a = ap.parse_args()
    main(a.src, a.dst)
