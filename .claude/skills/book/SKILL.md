---
name: book
description: Start a Gradebreaker book session (chapters, rules data, lore, the table kit). Gabriel types /book at the top of a thread.
disable-model-invocation: true
---

# Book session

Start of session, in this order. Read only what is listed; everything else is looked up when the work needs it.

1. `git status --short`, `git log --oneline -5`, and `gh auth status` (it must show `gabrielxz` active; `gh auth switch -h github.com -u gabrielxz` fixes it). Check `pgrep -x make` so no build is already running.
2. `book/CLAUDE.md` (prose style, scenario voice, the build). The root CLAUDE.md is already loaded.
3. In `99-to-do.md`, the **Next Session** section only: "Next book session" and "Queued for the book" in full, then "Next app session" and "Queued for the app" for what the app has changed or needs. Stop at the next `## ` heading; the rest of the backlog is looked up by item when the work reaches it.
4. From memory, the files the index tags [book] or [both] that bear on today's work. The status memory's current paragraph is enough; its history lives in `archive/handoffs.md`.
5. Tell Gabriel in a few lines: the rules version, what is queued for the book, and the next step the handoff names. Then ask what he wants to start with, unless he already said.

Working rules that bite in this track:

- A read-through runs `make notes` (never rebuild or refresh the reading copy over uncollected notes), sorts the notes into agreed / his call / pushback, applies the agreed batch, runs `make check`, commits, archives the annotated copy to `reading/archive/`, and runs `make reading-copy`.
- Every edit under `rules/` updates the prose's worked examples, the fixtures, and `rules/retired.yaml`, bumps `rules/version.yaml` when a number or table changes, and runs `make check` before the commit.
- Applying an item from "Queued for the book" clears it from that list. If a book change alters something the app implements, add a line under "Queued for the app".
- A change to `book/kit/table-kit.html` gets `make kit` and a page count against the previous build (14 pages).

Close of session:

1. `make check` passes; commit.
2. Replace the "Next book session" block with the current state and the next step. Move the replaced block to the top of `archive/handoffs.md`. Keep the block short: state, next, and anything carried that is recorded nowhere else.
3. Update the status memory's current paragraph (replace it; do not stack).
4. Pushing a change under `rules/` deploys the app: ask Gabriel before pushing unless he already said to.
