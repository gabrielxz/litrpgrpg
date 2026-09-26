# Gradebreaker companion app

The players' System Interface and the System's voice. The book under `book/` is the source of truth for procedures; the data under `rules/` is the source of truth for numbers, and the app imports it rather than restating it.

`DESIGN.md` holds the decisions, the milestones (M1 to M4, each item active or deferred), and the architecture.

## Layout

A pnpm workspace. `packages/engine` is the rules engine, a port of `tools/rules_engine.py`: it takes a rules snapshot (the parsed `rules/*.yaml`) and computes, with no state and no I/O. `packages/record` is the campaign record: an append-only log of actions (characters, VE awards, Consolidation, collapses, point placement, voids) and the sheets computed by replaying it, with a preview of any action or correction before it is recorded. It is pure TypeScript over the engine and does no storage of its own. `packages/server` serves campaigns over HTTP and WebSocket from Postgres: people signed in through Supabase Auth (Google), campaigns pinned to a rules version, invite links, the action log, and a live channel that pushes each person their own view after every append; it also serves the built web client. `packages/web` is that client (React and Vite): Google sign-in, invite links, the GM's screen (every sheet, a form per action with the server's preview before Record, the log with undo and corrections, the table and its invite links), and each player's System interface with the System's notices.

Node runs the TypeScript directly (type stripping), so the packages use only erasable syntax and nothing is built before it runs.

```bash
cd app && pnpm install
```

```bash
make app-check
```

`make app-check` typechecks the workspace and runs `rules/fixtures/` against the TypeScript engine; `make check` includes it once the install has run. A function added to the Python engine fails the check until `scripts/signatures.py` is rerun and the method is ported.

## Running it

Development keeps the data in a local Postgres (Docker, on 127.0.0.1:54340, apart from anything else on the machine) and signs people in through the real Supabase project, so no local Supabase is needed. Start the database, the API, and the web client:

```bash
docker compose up -d --wait
```

```bash
pnpm --filter @gradebreaker/server dev
```

```bash
pnpm --filter @gradebreaker/web dev
```

Open http://localhost:5173 (Vite forwards `/api` to the server on 8787). The dev script turns on **development sign-in**: a named test person signs in without Google, and each browser tab holds its own, so a GM tab and a player tab can run side by side. The server refuses `DEV_SIGNIN` in production, and the production image sets production. `.claude/launch.json` starts both processes for the desktop app's browser pane.

The server migrates on start and stores the repository's `rules/` under its version. `app/.env` (gitignored) holds `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (public; the browser needs it for Google sign-in), the production `DATABASE_URL`, and `DATABASE_URL_POOLER`, the IPv4 route to the same database for a machine without IPv6; the dev script points `DATABASE_URL` at the local database instead. The server tests need neither: they run on PGlite, Postgres compiled to WebAssembly, with sign-in tokens signed by a key made for the test.

Every table lives in the Postgres schema `gradebreaker`. The Supabase project runs with its Data API off, the schema grants nothing to Supabase's `anon` and `authenticated` roles, and row-level security is on with no policies; the server connects as the tables' owner.

## Deploying

Production is the Fly.io app `gradebreaker` in the **personal** organization (https://gradebreaker.fly.dev, region `ord`, one always-on machine), built from the repository root's `Dockerfile` and `fly.toml`. `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` are Fly secrets. The deploy token in the GitHub secret `FLY_API_TOKEN` deploys only this app and expires 2027-09-26; replace it with `flyctl tokens create deploy -a gradebreaker -x 8760h | gh secret set FLY_API_TOKEN`. The workflow `.github/workflows/deploy-app.yml` runs the tests and deploys on every push to `main` that touches `app/`, `rules/`, or the deploy files; it first waits until the health check reports nobody connected, and a manual run with `force` skips the wait. To deploy by hand:

```bash
flyctl deploy --remote-only -a gradebreaker
```

**The icon is the clave** (Gabriel, 2026-09-24), the same mark the book carries on every System notice. Masters are in `book/art/emblem/clave/` (SVG, and PNGs in cyan on blue-black, cyan on transparent, and ink on bone); `book/art/emblem/clave-mark.png` is the cropped pipeline asset and `clave-mark-ink.png` its ink recolour. The mark reads cyan on a dark ground and ink on a light one: against a pale ground cyan measures 1.04 contrast and disappears, so an app icon on a light tile takes the ink cut. The 8 mm proof is approved, so the mark holds at small sizes, though an icon at 16 or 32 pixels should be checked before shipping; the separation cuts close first and the open hooks and the unbroken bar are what have to survive.

The app is the players' System Interface, so the icon carrying the System's own mark is the point rather than branding: the thing on the phone is the thing in the fiction.
