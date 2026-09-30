# Events

Events is where you log what happened at the table, with an HVE entry for each character whose choice counted. You can log by hand or draft from table talk with the campaign's AI key; both make the same record. Players never see events.

![The Events section: drafting and logging on the left, the event list on the right.](gm-events.webp)

## Log an event

The **Log an event** card works without any AI.

1. Write **What happened** in one line, and the **Context** (the scene or situation) if it helps.
2. Under **Who was in it**, check each character involved.
3. For a character whose choice counted, check **HVE entry** and fill it in: the **Side** (one of the eight, grouped by axis), the **Intensity**, **Also reads on** for a moment that reads on a second axis, **Intent**, **Outcome**, and **Coercion of a player character** where it applies.
4. Add **GM notes** if you want them.
5. Check the preview and press **Log the event**.

Intensity has four steps. 1, 2, and 3 carry the sweep's weights (Remembered, Surprised the table, Defining). 0.5 is below the sweep's threshold: it records the moment as a reminder, which the sweep leaves out unless you raise it to a full tally. **Also reads on** opens at intensity 2 and above, and the second side tallies one weight lower. Weighing is in The Hidden Vector Engine, "Weighing a Moment" and "Structured Event Logging".

Entries do nothing to a sheet when logged. They wait for the session-end sweep in [HVE](guide:gm-hve), which offers each one not yet swept.

## Draft from table talk

This card needs the campaign's AI key. Without one it says so and points to the AI card in the [Table](guide:gm-table) section.

1. Paste or type what was said into the box, one line each as `Name: words`. A name can be a character, a player's display name, or GM.
2. Under the box, a tag for each name shows how the app read it: a character and who plays them, the GM, a player out of character, or (highlighted) someone the GM voices. A name that matches no character and no one at the table reads as someone you voice; if it is a player, type their name as the Table section shows it.
3. Press **Draft**.

One run drafts at a time per campaign, up to 800 lines or 60,000 characters (about an hour of talk); draft a longer session in parts. While it runs, the card shows **Drafting from 42 lines…**. The three newest runs stay listed under the button; open one to see any draft that was dropped or repaired and why.

To draft what the listening heard, use **Heard this session** at the top of the section, described in [Listening](guide:gm-listening). With drafting off, its **Put them in the drafting box** button adds the undrafted lines to this box. The **Drafted in shadow** card, which compares your own logging with the drafts, is described there too.

## Reviewing drafts

Drafts wait under **To review**. Nothing is logged until you accept one. Each shows the lines it cites and the drafter's reason.

- **A moment** opens in the same editor as **Log an event**, with a **Drafted because:** line under each HVE entry. Edit anything, then press **Accept**.
- **Bookkeeping** opens in a small form: items found, changing hands, or used up; quest progress, completion, or failure; VE granted aloud; a party invitation or its answer; a count toward a title. Adjust the holders, items, counts, or VE and press **Accept**. An answer to an invitation drafted in the same run waits until you accept the invitation.

Every **Accept** shows the preview first, including any notice a player will receive (an item or VE award reaches them; the event itself does not). **Dismiss** moves a draft to **Dismissed**, where **Restore** brings it back. Accepted drafts collect under **Accepted**, and the Campaign log marks them "accepted from a draft".

Titles, Battle Memory Cards, Hidden Achievements, quests, and Prep cues from the same run go to [Suggestions](guide:gm-suggestions); a line under the drafts counts how many wait there.

> Undoing an accepted draft in the [Campaign log](guide:gm-log) brings it back to review, marked, to accept again or dismiss.

## The event list

The **Events** card on the right lists every event, newest first, with its session, the in-game time, when it was logged, and who was in it. Each HVE entry is tagged **for the sweep** until a sweep takes it in, then **swept**. **Show** filters the list to one character. To remove an event, undo it from the Campaign log.
