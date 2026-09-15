#!/usr/bin/env python3
"""Bake the cover: the GRADEBREAKER wordmark, subtitle, the volume line bottom
left, the byline, and optionally an emblem (third argument)
onto the cover art. The wordmark is the heading face fractured between its
two halves, the right half displaced, with one cyan segment completing the
break (book/art/art-bible.md, section 7: one controlled interruption).

    python3 tools/cover.py book/assets/art/cover.png build/cover_titled.png
"""
import subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

INK = (19, 27, 32); BONE = (244, 237, 225); CYAN = (143, 230, 239)

def font(name, size):
    path = subprocess.check_output(["kpsewhich", name], text=True).strip()
    return ImageFont.truetype(path, size)

def wordmark(page_w, break_x, max_frac=0.92, fill=BONE, edge_col=INK, edge_w=0.014):
    """GRADEBREAKER in Montserrat Black, slightly condensed, cracked after
    GRADE: the crack runs past the letters into the sky, branches, throws
    shards, and is lit from inside. Returns the layer and the baseline y of
    the letters within it."""
    face = "Montserrat-Black.otf"
    f = font(face, 200)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    x0, y0, x1, y1 = probe.textbbox((0, 0), "GRADEBREAKER", font=f)
    condense = 0.92
    # size the word so the break lands on break_x with margins of 4% either side
    gfrac = probe.textbbox((0, 0), "GRADE", font=f)[2] / (x1 - x0)
    width = min(max_frac * page_w, (break_x - 0.04) * page_w / gfrac, (0.96 - break_x) * page_w / (1 - gfrac))
    size = int(200 * width / ((x1 - x0) * condense))
    f = font(face, size)
    k = size / 200.0
    edge = max(2, int(size * edge_w))
    x0, y0, x1, y1 = probe.textbbox((0, 0), "GRADEBREAKER", font=f, stroke_width=edge)
    tw, th = x1 - x0, y1 - y0
    reach = int(th * 0.25)                     # above the letters
    below = int(th * 0.9)                      # below them, running into the picture's crack
    pad = int(40 * k)
    w, h = tw + 2 * pad, th + reach + below
    letters = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(letters).text((pad - x0, reach - y0), "GRADEBREAKER", font=f, fill=fill,
                                 stroke_width=edge, stroke_fill=edge_col)
    letters = letters.resize((int(w * condense), h), Image.LANCZOS)
    w = letters.width
    # the crack: jagged, from above the word to below it, just after GRADE
    gx1 = probe.textbbox((0, 0), "GRADE", font=f)[2]
    xs = int((pad - x0 + gx1) * condense) + int(4 * k)
    top, bot = reach, reach + th
    path = [(xs - 26 * k, 0), (xs - 6 * k, top * 0.6), (xs + 10 * k, top + th * 0.28),
            (xs - 8 * k, top + th * 0.55), (xs + 22 * k, top + th * 0.82), (xs + 4 * k, h)]
    gap = int(26 * k)
    # split the letters along the crack; the right half drops and tilts
    mask_r = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask_r).polygon(path + [(w, h), (w, 0)], fill=255)
    blank = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    right = Image.composite(letters, blank, mask_r).rotate(-1.6, resample=Image.BICUBIC, center=(xs, top + th / 2))
    left = Image.composite(blank, letters, mask_r)
    dx, dy = int(16 * k), int(26 * k)
    out = Image.new("RGBA", (w + dx, h + dy), (0, 0, 0, 0))
    out.alpha_composite(left, (0, 0))
    out.alpha_composite(right, (dx, dy))
    # clear the break; the picture shows through it, with a soft light behind
    d = ImageDraw.Draw(out)
    d.line(path, fill=(0, 0, 0, 0), width=gap)
    glow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(path, fill=(236, 252, 255, 150), width=int(22 * k))
    out.alpha_composite(glow.filter(ImageFilter.GaussianBlur(int(14 * k))))
    glow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(path, fill=CYAN + (210,), width=int(7 * k))
    out.alpha_composite(glow.filter(ImageFilter.GaussianBlur(int(5 * k))))
    return out, reach, int(xs)

def band_luminance(im, y0, y1):
    """Mean luminance of a horizontal band, 0 to 255."""
    band = im.convert("L").crop((0, int(y0 * im.height), im.width, int(y1 * im.height))).resize((64, 8))
    return sum(band.getdata()) / (64 * 8)

def main(src, dst, emblem=None, break_x=None):
    """break_x: where a fracture in the art meets the title band, as a fraction
    of the width; the wordmark's break lands on it. None centers the word."""
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    k = W / 1050.0
    top_lum = band_luminance(im, 0.02, 0.16)
    bottom_lum = band_luminance(im, 0.93, 0.99)
    dark_top = top_lum < 80
    if dark_top:
        # a dark title band: dim whatever the art carries there under the title
        fade_h = int(H * 0.30)
        fade = Image.new("L", (1, fade_h))
        for y in range(fade_h):
            t = y / fade_h
            fade.putpixel((0, y), int(255 * (1 - t) ** 1.6 * 0.82))
        fade = fade.resize((W, fade_h))
        im.alpha_composite(Image.merge("RGBA", (*[Image.new("L", (W, fade_h), c) for c in INK], fade)), (0, 0))
    # letters: ink on a pale band, bone on a dark one, bone with a heavy edge on a mixed one
    if top_lum > 150:
        fill, edge_col, edge_w = INK, BONE, 0.012
    elif dark_top:
        fill, edge_col, edge_w = BONE, INK, 0.014
    else:
        fill, edge_col, edge_w = BONE, INK, 0.030
    if break_x is None:
        wm, reach, xs = wordmark(W, 0.46, fill=fill, edge_col=edge_col, edge_w=edge_w)
        x = (W - wm.width) // 2
    else:
        wm, reach, xs = wordmark(W, break_x, fill=fill, edge_col=edge_col, edge_w=edge_w)
        x = int(break_x * W) - xs
    im.alpha_composite(wm, (x, int(44 * k) - reach))
    d = ImageDraw.Draw(im)
    def text(xy, s, f, anchor, fill, edge, ew):
        d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=ew, stroke_fill=edge)
    y_sub = int(44 * k) - reach + wm.height - int(wm.height * 0.30)
    text((W // 2, y_sub), "The LitRPG RPG", font("EBGaramond-Italic.otf", int(58 * k)), "ma", fill, edge_col, max(2, int(2 * k)))
    if emblem:
        e = Image.open(emblem).convert("RGBA")
        side = int(110 * k)
        e = e.resize((side, side), Image.LANCZOS)
        im.alpha_composite(e, ((W - side) // 2, H - int(44 * k) - side))
    bfill, bedge = (INK, BONE) if bottom_lum > 120 else (BONE, INK)
    text((int(44 * k), H - int(44 * k)), "F-GRADE VOLUME",
         font("AlegreyaSans-Bold.otf", int(34 * k)), "ld", CYAN, INK, max(2, int(3 * k)))
    text((W - int(44 * k), H - int(44 * k)), "by Gabriel Beal",
         font("EBGaramond-Italic.otf", int(38 * k)), "rd", bfill, bedge, max(2, int(3 * k)))
    im.convert("RGB").save(dst)

if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--emblem", default=None)
    ap.add_argument("--break-x", type=float, default=None, help="fraction of the width where the art's fracture meets the title band")
    a = ap.parse_args()
    main(a.src, a.dst, a.emblem, a.break_x)
