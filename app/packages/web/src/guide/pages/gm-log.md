# Campaign log

The Campaign log is the campaign's record: every action anyone has recorded, newest first, with undo and correction. Beside it, the Sessions panel holds the campaign memory and each session's summary.

![The Campaign log with its entries on the left and the Sessions panel on the right.](gm-log.webp)

## Reading the log

Each entry shows its number, what it did in words, who recorded it, and the time. An entry you accepted from a draft adds "accepted from a draft". The log shows the 40 newest entries; **Earlier entries** at the foot loads 40 more each time.

Prepared items saved or removed in [Prep](guide:gm-prep) are preparation, so the log hides them. **Show Prep entries** in the panel's head, with their count, shows them.

## Undo and Correct

Every entry that still counts has **Undo** and **Correct** beside it.

1. Press **Undo** or **Correct**. For a correction, say **What was wrong**; the note stays in the log.
2. Read the preview. It shows what taking the entry back changes on each sheet, and lists every later entry that would stop applying because it depended on this one.
3. Press **Undo #57** or **Correct #57**, or **Cancel**.

Both record a new entry that voids the old one. The old entry stays in the log, struck through, marked "Undone" or "Corrected", and no longer counts. A correction does not rewrite the entry: record the right version afterward from the section where it belongs. An undo cannot itself be undone; to bring an entry back, record it again.

Undoing an entry that came from a draft sends the draft back to review in [Events](guide:gm-events) or [Suggestions](guide:gm-suggestions), marked, to accept again or dismiss.

> Undo is the only way to remove an event, a sweep, a quest step, a title, or anything else once recorded. Every section that records at once without a preview (quest buttons, attendance, conferring a due title) relies on it.

## Actions that no longer apply

An entry can stop applying after an earlier entry is undone, or when the campaign moves to a rules version that no longer accepts it (see [Rules](guide:gm-rules)). The log keeps it, marked **No longer applies** with the reason, and a callout at the top counts them. The same count shows on the **Campaign log** tab. Resolve each one: if it should stand, record it again; if not, leave it.

## Sessions

The **Sessions** panel appears once a session has started. Sessions start and end from [the table bar](guide:gm-session).

### Campaign memory

Every AI request for the campaign carries the campaign memory in place of the whole history: a campaign paragraph (the premise and where the story stands) and a chronicle for each character (who they have been so far). The panel shows the memory as it stands.

Open **Write the campaign memory** (or **Update the campaign memory** once one exists) to edit the paragraph and the chronicle of each living character present at the newest session, then press **Save the memory**. With the campaign's AI key, **Draft the rewrite** folds the newest session into the memory as it stood; the draft replaces the text in the fields, and nothing saves until you press.

### The session list

Each session shows its name, date, and real-world times; its in-game times when the clock was set; who was present and who left early; how many events were logged; and who was swept or "no sweep". Under it, the summary you wrote when you ended it.

Open **Edit the summary** (or **Write a summary**) to change it, then press **Save the summary**. With the AI key, **Draft it from the record** writes a draft from the session's events, kills, quests, titles, and levels, replacing the text in the field.

Players never see the log or the Sessions panel. An undo changes the record, so a player's screen shows its result: undoing a VE award leaves their VE lower.
