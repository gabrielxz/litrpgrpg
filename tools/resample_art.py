#!/usr/bin/env python3
"""Resample the art masters for a build.

The masters under book/assets/art/ are stored at MASTER_PPI relative to the
7-inch trim width (a full-page master is 2100 px wide). A build embeds them
at --ppi, so the reading PDF stays small and a print build gets the detail:

    python3 tools/resample_art.py book/assets/art build/art-150/assets/art --ppi 150

Files whose master is older than the output are skipped. The cover is left
out; tools/cover.py reads the master directly.
"""
import argparse, os, sys
from PIL import Image

MASTER_PPI = 300

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--ppi", type=int, default=150)
    ap.add_argument("--master-ppi", type=int, default=MASTER_PPI)
    a = ap.parse_args()
    factor = a.ppi / a.master_ppi
    done = skipped = 0
    for root, _, files in os.walk(a.src):
        for name in sorted(files):
            if not name.lower().endswith(".png") or name == "cover.png":
                continue
            src = os.path.join(root, name)
            dst = os.path.join(a.dst, os.path.relpath(src, a.src))
            if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                skipped += 1
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            im = Image.open(src)
            if factor < 1:
                im = im.resize((max(1, round(im.width * factor)), max(1, round(im.height * factor))), Image.LANCZOS)
            im.save(dst, optimize=True)
            done += 1
    print(f"art at {a.ppi} ppi: {done} resampled, {skipped} current", file=sys.stderr)

if __name__ == "__main__":
    main()
