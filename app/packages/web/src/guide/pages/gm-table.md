# The Table section

The Table section holds who is in the campaign and how they got there: the members and invite links, who plays which character, the campaign's AI key, the rules version, and any test recordings. Open it from **Table** in the Table group of the section tabs.

![The Table section with the members, invite links, Who plays whom, the AI card, and the Rules card.](gm-table.webp)

## Table

The **Table** card lists every member: you as **GM**, and each player with the characters they play, or *no character yet*.

### Invite links

Under **Invite links**, each open link shows its full address, how many people have joined through it (*2 joined of 4* when it has a limit), **Copy**, and **Revoke**.

To make a link, enter a number in **How many people the link admits**, or leave it at *Any*, and press **New invite link**. Anyone holding a link can join as a player until it reaches its number or you press **Revoke**. A link that is used up or revoked leaves the list. With no open links, the card reads *No open links.*

What a player sees when they open a link is on [Getting started](guide:start).

## Who plays whom

Once the campaign has a character, **Who plays whom** lists each one with a **Played by** menu: **The GM** or any player. Pick someone and a **Hand Kara to Joe** button appears under the table with its preview. Press it to record the change. The character moves to the screen of the person you picked. Choose **The GM** to take a character over yourself, for a player who has left or one who is away for a while.

A character you create in the Record panel goes to the player you pick in its **Player** menu, or stays **Held by the GM** (see [The Record panel](guide:gm-record)).

## AI

The **AI** card holds the campaign's Anthropic API key, the model it runs, whether the key works, and what its requests have spent. Adding and checking a key is on [Setting up a campaign](guide:gm-setup).

![The AI card with a saved key, the model menu, and the usage table.](gm-ai.webp)

- **Model** switches the model; with a key saved, the change takes effect at once.
- **Check again** sends one request to see whether the key still works, and the tag beside the key shows the result and when it was checked.
- **Remove key** deletes the key. Every AI feature then offers its manual path only.
- A key pasted into the field and saved with **Check and save** replaces the saved one.

The **Usage** table lists requests, failed requests, input tokens, output tokens, and tokens read from cache, for **This session** while one runs, **Last 30 days**, and **All time**, then each feature's all-time line. With no requests yet, it reads *No requests yet.* The cost shows in your Anthropic console.

## Rules

The **Rules** card shows the rules version the campaign runs on. The campaign follows each rules version as it is released. An action you recorded that a later version no longer applies moves to the rejected list in the Campaign log (see [Campaign log](guide:gm-log)).

## Test recordings

The **Test recordings** card appears once the campaign has a recording (making one is on [Listening](guide:gm-listening)). A recording in progress shows its start and who it keeps. An ended one shows its date, its length in minutes, and who is in it, with a file to download for each:

- each person's track, as audio;
- **Timeline**, the lines heard, with your corrections;
- **Timeline as heard**, the lines as the speech-to-text returned them, once you have corrected any;
- **Second opinion**, once one has run.

### Correcting the lines

Press **Correct the lines** to open every line with its time and speaker. Press the time to hear the line. Edit the text where it is wrong, or press **Right as heard** where it is right, then press **Save** and the count of lines. Saved lines are marked **checked**. The menu shows **Not yet checked**, **Every line**, or, once a second opinion exists, **Where the two disagree**. The list shows 150 lines at a time.

**Get a second opinion** transcribes the tracks again with a more accurate service, faster than real time, and appears only when the server holds a key for it. Where the second opinion differs, the line shows it with **Take it**.

**Delete** removes the recording at once, with no confirmation. The server deletes any recording 7 days after it ends.
