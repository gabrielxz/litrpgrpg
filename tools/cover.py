#!/usr/bin/env python3
"""Bake the cover: the GRADEBREAKER wordmark, subtitle, tagline, and byline
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

def wordmark(width):
    """Render GRADEBREAKER at the given width, fractured after GRADE: ink
    letters with a thin bone edge, the right half displaced, the break lit."""
    f = font("Alegreya-Black.otf", 200)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    x0, y0, x1, y1 = probe.textbbox((0, 0), "GRADEBREAKER", font=f)
    size = int(200 * width / (x1 - x0))
    f = font("Alegreya-Black.otf", size)
    k = size / 200.0
    edge = max(2, int(size * 0.012))
    x0, y0, x1, y1 = probe.textbbox((0, 0), "GRADEBREAKER", font=f, stroke_width=edge)
    pad = int(40 * k)
    w, h = x1 - x0 + 2 * pad, y1 - y0 + 2 * pad
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((pad - x0, pad - y0), "GRADEBREAKER", font=f, fill=INK,
                               stroke_width=edge, stroke_fill=BONE)
    # the break: an angular line through the word just after GRADE
    gx1 = probe.textbbox((0, 0), "GRADE", font=f)[2]
    xs = pad - x0 + gx1 + int(6 * k)
    path = [(xs - 18 * k, 0), (xs + 10 * k, h * 0.36), (xs - 8 * k, h * 0.56), (xs + 22 * k, h)]
    gap = int(16 * k)
    mask_r = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask_r).polygon(path + [(w, h), (w, 0)], fill=255)
    blank = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    right = Image.composite(layer, blank, mask_r)
    left = Image.composite(blank, layer, mask_r)
    dx, dy = int(14 * k), int(22 * k)
    out = Image.new("RGBA", (w + dx, h + dy), (0, 0, 0, 0))
    out.alpha_composite(left, (0, 0))
    out.alpha_composite(right, (dx, dy))
    # clear the gap, then light it: a glow and a hard cyan line along the break
    ImageDraw.Draw(out).line(path, fill=(0, 0, 0, 0), width=gap)
    glow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(glow).line(path, fill=CYAN + (255,), width=int(10 * k))
    glow = glow.filter(ImageFilter.GaussianBlur(int(7 * k)))
    out.alpha_composite(glow)
    d = ImageDraw.Draw(out)
    d.line(path, fill=CYAN + (255,), width=int(4 * k))
    # two fine System ticks beside the break, the observation grammar
    for (px, py) in [(xs + 30 * k, h * 0.16), (xs - 30 * k, h * 0.80)]:
        d.line([(px, py), (px, py + 14 * k)], fill=CYAN + (255,), width=int(2 * k))
        d.line([(px - 5 * k, py), (px + 5 * k, py)], fill=CYAN + (255,), width=int(2 * k))
    return out

def main(src, dst):
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    k = W / 1050.0
    wm = wordmark(int(W * 0.92))
    im.alpha_composite(wm, ((W - wm.width) // 2, int(34 * k)))
    d = ImageDraw.Draw(im)
    def text(xy, s, f, anchor, fill, edge, ew):
        d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=ew, stroke_fill=edge)
    # subtitle on the pale sky: ink with a hairline of bone
    text((W // 2, int(34 * k) + wm.height + int(6 * k)), "The LitRPG RPG",
         font("EBGaramond-Italic.otf", int(58 * k)), "ma", INK, BONE, max(1, int(1 * k)))
    # tagline and byline on the dark ground: bone with an ink edge
    text((int(44 * k), H - int(44 * k)), "Power is not granted.",
         font("EBGaramond-Italic.otf", int(41 * k)), "ld", BONE, INK, max(2, int(3 * k)))
    text((W - int(44 * k), H - int(44 * k)), "by Gabriel Beal",
         font("EBGaramond-Italic.otf", int(38 * k)), "rd", BONE, INK, max(2, int(3 * k)))
    im.convert("RGB").save(dst)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
