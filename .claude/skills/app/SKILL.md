---
name: app
description: Start a Gradebreaker companion app session (the TypeScript engine, record, server, and web client under app/). Gabriel types /app at the top of a thread.
disable-model-invocation: true
---

# App session

Start of session, in this order. Read only what is listed; everything else is looked up when the work needs it.

1. `git status --short`, `git log --oneline -5`, and `gh auth status` (it must show `gabrielxz` active; `gh auth switch -h github.com -u gabrielxz` fixes it). `gh run list --limit 3` for the last deploy.
2. `app/CLAUDE.md` (conventions, running, deploying). The root CLAUDE.md is already loaded.
3. In `99-to-do.md`, the **Next Session** section only: "Next app session" and "Queued for the app" in full, then "Next book session" and "Queued for the book" for what the book has changed or still owes. Stop at the next `## ` heading.
4. In `app/DESIGN.md`: Decisions, and the milestone table for the current milestone. The architecture and later milestones are read when the work reaches them.
5. From memory, the files the index tags [app] or [both] that bear on today's work. The status memory's current paragraph is enough; its history lives in `archive/handoffs.md`.
6. Tell Gabriel in a few lines: what is queued for the app, what the last deploy did, and the next M1 items. Then ask which to build, unless he already said.

Working rules that bite in this track:

- The book owns procedure and `rules/` owns numbers. A question the book does not answer goes under "Queued for the book" with a ruling or a recommendation; the app runs the recommendation meanwhile and records the call in `app/DESIGN.md` Decisions. Book prose is edited only in a book session.
- A field the app needs from the rules data is added to the data with a version bump and `make check`, and noted under "Queued for the book" if the prose should state it.
- Applying an item from "Queued for the app" clears it from that list.
- Verify every screen change in the browser pane with a GM tab and a player tab before calling it done.

Close of session:

1. `make app-check` (or `make check` if `rules/` changed) passes; commit, with the M1 table's notes updated in the same commit.
2. Replace the "Next app session" block with the current state and the next step. Move the replaced block to the top of `archive/handoffs.md`.
3. Update the status memory's current paragraph (replace it; do not stack).
4. Pushing `app/` code or `rules/` deploys: ask Gabriel before pushing unless he already said to, then check the run and the health check.
