"""Makes each pack image's WebP, the file the app serves.

A pack's own images are PNG originals kept beside their WebP as delivered. Images a pack takes
from the book's art are made from the book's masters (`book/assets/art`), named in FROM_BOOK, so
they are not copied twice. The app ships only the WebP (`.dockerignore`). Run after adding or
replacing an image:  python3 app/packs/images/webp.py
"""
from pathlib import Path

from PIL import Image

LONGEST = 1600
QUALITY = 82
HERE = Path(__file__).parent
BOOK_ART = HERE.parents[2] / "book" / "assets" / "art"

# Each pack's images from the book: the app's file name, and the master under book/assets/art.
FROM_BOOK = {
    "tutorial": {
        "the-void": "scenes/the-void.png",
        "valley-map": "map/valley-map.png",
        "the-arrival": "scenes/the-arrival.png",
        "husk-crawler": "spots/husk-crawler.png",
        "frenzy-rat": "spots/frenzy-rat.png",
        "glow-mote-swarm": "spots/glow-mote-swarm.png",
        "ray-okafor": "people/ray-okafor.png",
        "the-reactive-buckler": "spots/the-reactive-buckler.png",
        "healing-pills": "spots/healing-pills.png",
        "a-skill-shard": "spots/a-skill-shard.png",
        "the-recycling-node": "scenes/the-recycling-node.png",
        "the-node-pile": "openers/items.png",
        "marco-dele-and-wren": "scenes/marco-dele-and-wren.png",
        "a-resonance-shard": "spots/a-resonance-shard.png",
        "sector-a": "scenes/sector-a-the-martial-remnant.png",
        "sector-b": "scenes/sector-b-the-wild-fragment.png",
        "sector-c": "scenes/sector-c-the-arcane-debris.png",
        "sector-d": "scenes/sector-d-the-civic-fragment.png",
        "training-sentry": "spots/training-sentry.png",
        "snarljaw": "spots/snarljaw.png",
        "alpha-snarljaw": "spots/alpha-snarljaw.png",
        "glow-stalker": "spots/glow-stalker.png",
        "fragment-wraith": "spots/fragment-wraith.png",
        "husk-sentinel": "spots/husk-sentinel.png",
        "the-offering": "scenes/the-offering.png",
        "the-reality-purge": "scenes/the-reality-purge.png",
        "the-warden": "scenes/the-corrupted-system-warden.png",
        "the-causeway": "scenes/the-causeway.png",
        "the-other-side": "scenes/the-other-side.png",
    },
}


def make(src: Path, webp: Path) -> None:
    if webp.exists() and webp.stat().st_mtime >= src.stat().st_mtime:
        return
    im = Image.open(src).convert("RGB")
    im.thumbnail((LONGEST, LONGEST), Image.LANCZOS)
    im.save(webp, "WEBP", quality=QUALITY, method=6)
    print(f"{webp.relative_to(HERE)}  {im.size[0]}x{im.size[1]}  {webp.stat().st_size // 1024} KB")


for png in sorted(HERE.glob("*/*.png")):
    make(png, png.with_suffix(".webp"))
for pack, files in FROM_BOOK.items():
    for name, master in files.items():
        make(BOOK_ART / master, HERE / pack / f"{name}.webp")
