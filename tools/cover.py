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
    """GRADEBREAKER in Montserrat Black, slightly condensed, cracked after
    GRADE: the crack runs past the letters into the sky, branches, throws
    shards, and is lit from inside. Returns the layer and the baseline y of
    the letters within it."""
    face = "Montserrat-Black.otf"
    f = font(face, 200)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    x0, y0, x1, y1 = probe.textbbox((0, 0), "GRADEBREAKER", font=f)
    condense = 0.92
    size = int(200 * width / ((x1 - x0) * condense))
    f = font(face, size)
    k = size / 200.0
    edge = max(2, int(size * 0.014))
    x0, y0, x1, y1 = probe.textbbox((0, 0), "GRADEBREAKER", font=f, stroke_width=edge)
    tw, th = x1 - x0, y1 - y0
    reach = int(th * 0.35)                     # how far the break runs above and below the letters
    pad = int(40 * k)
    w, h = tw + 2 * pad, th + 2 * reach
    letters = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(letters).text((pad - x0, reach - y0), "GRADEBREAKER", font=f, fill=INK,
                                 stroke_width=edge, stroke_fill=BONE)
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
    return out, reach

def main(src, dst):
    im = Image.open(src).convert("RGBA")
    W, H = im.size
    k = W / 1050.0
    wm, reach = wordmark(int(W * 0.92))
    im.alpha_composite(wm, ((W - wm.width) // 2, int(40 * k) - reach))
    d = ImageDraw.Draw(im)
    def text(xy, s, f, anchor, fill, edge, ew):
        d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=ew, stroke_fill=edge)
    # subtitle on the pale sky: ink with a hairline of bone
    text((W // 2, int(40 * k) - reach + wm.height - int(reach * 0.55)), "The LitRPG RPG",
         font("EBGaramond-Italic.otf", int(58 * k)), "ma", INK, BONE, max(1, int(1 * k)))
    # tagline and byline on the dark ground: bone with an ink edge
    text((int(44 * k), H - int(44 * k)), "Power is not granted.",
         font("EBGaramond-Italic.otf", int(41 * k)), "ld", BONE, INK, max(2, int(3 * k)))
    text((W - int(44 * k), H - int(44 * k)), "by Gabriel Beal",
         font("EBGaramond-Italic.otf", int(38 * k)), "rd", BONE, INK, max(2, int(3 * k)))
    im.convert("RGB").save(dst)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
