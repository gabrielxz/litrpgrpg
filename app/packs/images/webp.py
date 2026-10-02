"""Makes each pack image's WebP, the file the app serves, from its PNG original beside it.

The originals are kept as delivered; the app ships only the WebP (`.dockerignore`). Run after
adding or replacing an image:  python3 app/packs/images/webp.py
"""
from pathlib import Path

from PIL import Image

LONGEST = 1600
QUALITY = 82

for png in sorted(Path(__file__).parent.glob("*/*.png")):
    webp = png.with_suffix(".webp")
    if webp.exists() and webp.stat().st_mtime >= png.stat().st_mtime:
        continue
    im = Image.open(png).convert("RGB")
    im.thumbnail((LONGEST, LONGEST), Image.LANCZOS)
    im.save(webp, "WEBP", quality=QUALITY, method=6)
    print(f"{webp.relative_to(Path(__file__).parent)}  {im.size[0]}x{im.size[1]}  {webp.stat().st_size // 1024} KB")
