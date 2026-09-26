# Gradebreaker companion app

The players' System Interface and the System's voice. The book under `book/` is the source of truth for procedures; the data under `rules/` is the source of truth for numbers, and the app imports it rather than restating it.

`DESIGN.md` holds the decisions, the milestones (M1 to M4, each item active or deferred), and the architecture.

## Layout

A pnpm workspace. `packages/engine` is the rules engine, a port of `tools/rules_engine.py`: it takes a rules snapshot (the parsed `rules/*.yaml`) and computes, with no state and no I/O. The server and the web client join it as M1 reaches them.

```bash
cd app && pnpm install
```

```bash
make app-check
```

`make app-check` typechecks the workspace and runs `rules/fixtures/` against the TypeScript engine; `make check` includes it once the install has run. A function added to the Python engine fails the check until `scripts/signatures.py` is rerun and the method is ported.

**The icon is the clave** (Gabriel, 2026-09-24), the same mark the book carries on every System notice. Masters are in `book/art/emblem/clave/` (SVG, and PNGs in cyan on blue-black, cyan on transparent, and ink on bone); `book/art/emblem/clave-mark.png` is the cropped pipeline asset and `clave-mark-ink.png` its ink recolour. The mark reads cyan on a dark ground and ink on a light one: against a pale ground cyan measures 1.04 contrast and disappears, so an app icon on a light tile takes the ink cut. The 8 mm proof is approved, so the mark holds at small sizes, though an icon at 16 or 32 pixels should be checked before shipping; the separation cuts close first and the open hooks and the unbroken bar are what have to survive.

The app is the players' System Interface, so the icon carrying the System's own mark is the point rather than branding: the thing on the phone is the thing in the fiction.
