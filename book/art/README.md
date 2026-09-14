# Art direction

`art-bible.md` is the standing visual direction for the book, the kit, the website, and the companion app (Gabriel with ChatGPT, adopted 2026-09-13). `project-instructions.md` is the short brief to give an image generator alongside it. Both are stored as received; their wording is ChatGPT's, and the book's own writing rules do not apply to them.

`references/` holds the ten approved reference images. `01-office-bone.png` is the standard every new image is judged against; `02` to `04` are its approved color variants; `05` to `10` show range. Every generation starts from one or two of these as style references, never from the text alone.

`glyph-vocabulary/` holds four images from the superseded stencil-and-ink direction. They show glyph construction only and are not style references.

`shot-list.md` is every image the book needs, with a description, placement, palette mode, System intent, and the size to request. ChatGPT is the generator for all of them.

Superseded: the stencil-and-sumi-e guide that lived at `book/assets/art_style_guide.md` (in git history), and every image in `book/assets/` made under it. They stay in place as placeholders until their replacements land.

`emblem/` holds the two emblem candidates from ChatGPT, keyed to transparent cyan (`emblem-a.png`: the compass ring; `emblem-b.png`: the torn ring). The cover art in `book/assets/art/cover.png` is stored mirrored from the generated file so its fracture meets the wordmark's break; `tools/cover.py` documents the alignment.
