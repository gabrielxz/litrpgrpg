# Gradebreaker companion app

The players' System Interface and the System's voice. The book under `book/` is the source of truth for procedures; the data under `rules/` is the source of truth for numbers, and the app imports it rather than restating it.

`DESIGN.md` holds the decisions, the milestones (M1 to M4, each item active or deferred), and the architecture.

## Layout

A pnpm workspace. `packages/engine` is the rules engine, a port of `tools/rules_engine.py`: it takes a rules snapshot (the parsed `rules/*.yaml`) and computes, with no state and no I/O. `packages/record` is the campaign record: an append-only log of actions (characters, VE awards, Consolidation, collapses, point placement, voids) and the sheets computed by replaying it, with a preview of any action or correction before it is recorded. It is pure TypeScript over the engine and does no storage of its own. `packages/server` serves campaigns over HTTP and WebSocket from Postgres: people identified by a bearer token issued once, campaigns pinned to a rules version, invite links, the action log, and a live channel that pushes each person their own view after every append. The web client joins them as M1 reaches it.

Node runs the TypeScript directly (type stripping), so the packages use only erasable syntax and nothing is built before it runs.

```bash
cd app && pnpm install
```

```bash
make app-check
```

`make app-check` typechecks the workspace and runs `rules/fixtures/` against the TypeScript engine; `make check` includes it once the install has run. A function added to the Python engine fails the check until `scripts/signatures.py` is rerun and the method is ported.

To run the server against the development database (Docker; Postgres on 127.0.0.1:54340, apart from anything else on the machine):

```bash
docker compose up -d --wait
```

```bash
pnpm --filter @gradebreaker/server dev
```

It listens on port 8787 (`PORT`), reads `DATABASE_URL`, migrates on start, and stores the repository's `rules/` under its version. The server tests need no Docker: they run on PGlite, Postgres compiled to WebAssembly, in the test process.

**The icon is the clave** (Gabriel, 2026-09-24), the same mark the book carries on every System notice. Masters are in `book/art/emblem/clave/` (SVG, and PNGs in cyan on blue-black, cyan on transparent, and ink on bone); `book/art/emblem/clave-mark.png` is the cropped pipeline asset and `clave-mark-ink.png` its ink recolour. The mark reads cyan on a dark ground and ink on a light one: against a pale ground cyan measures 1.04 contrast and disappears, so an app icon on a light tile takes the ink cut. The 8 mm proof is approved, so the mark holds at small sizes, though an icon at 16 or 32 pixels should be checked before shipping; the separation cuts close first and the open hooks and the unbroken bar are what have to survive.

The app is the players' System Interface, so the icon carrying the System's own mark is the point rather than branding: the thing on the phone is the thing in the fiction.
