# Setting up a campaign

A campaign you start from Home opens on the Party section with nobody in it. This page covers the three steps that make it ready to play, then the campaign's AI key, speech-to-text, and the rules version it runs on.

## The Set up the table checklist

![The Set up the table checklist on the Party section of a campaign with no players yet.](gm-setup-checklist.webp)

The Party section of a campaign starts with a **Set up the table** checklist of three steps. Each step shows **Done** once the record shows it, in any order, and the checklist goes away once all three are done. **Hide** puts it away sooner, in this browser only (a table that keeps no clock never sets one).

1. **Invite players.** Make an invite link in the Table section and send it to your players. **Go to the Table** opens the section.
2. **Start a session.** Name it or keep the name the app offers (**Session 1** for the first), and tick who is at the table. The step's **Start a session** opens the same form in the table bar.
3. **Set the clock.** Enter the day, the hour, and dawn's hour where the party is. Day 1 is the day of Integration. The step's **Set the clock** opens the table bar's form.

### Inviting players

Open **Table** in the Table group of the section tabs. Under **Invite links**, leave **How many people the link admits** at *Any*, or enter a number, and press **New invite link**. The link appears in the list with **Copy** and **Revoke**. Press **Copy** and send the link however your table talks.

Anyone who opens the link and signs in joins as a player (what they see is on [Getting started](guide:start)). A link stops working once it reaches its number or you press **Revoke**.

Players build their own characters once they join. You can also make one in the Record panel and hand it to a player under **Who plays whom** (see [The Table section](guide:gm-table)).

### Starting the first session

In the table bar under the section tabs, press **Start a session**, untick any character who is absent, and press **Start Session 1** (the button carries the name, if you typed one). [Sessions and the clock](guide:gm-session) covers the rest of the table bar.

### Setting the clock

In the table bar, press **Set the clock**. Enter **Day**, **Hour**, and **Minute**, and **Dawn at hour** for where the party is; the field starts at the dawn hour the rules give, and hovering it shows that hour. Press **Set the clock**. The clock decides when once-a-day uses come back, when a timed quest falls due, and how many days each character has survived.

## The AI key

The drafting features, the rules questions, and the summaries run on a language model paid for with your own Anthropic API key. The key belongs to the campaign. Everything in the app has a manual path, so a campaign with no key plays in full; you log by hand what the key would have drafted.

![The AI card in the Table section with a saved key, its check, and usage.](gm-ai.webp)

To add a key, open the Table section and find the **AI** card.

1. Pick a **Model**: Claude Opus 5.5 (the default), Claude Opus 5, Claude Sonnet 5, or Claude Haiku 4.5.
2. Paste the key into the field (it starts `sk-ant-`) and press **Check and save**.

The app sends one request to check the key before it keeps it. A key the provider refuses is not saved, and the card shows why. A key that could not be checked (the provider busy or out of reach) is saved with that problem shown, and **Check again** retries.

Once saved, the card shows the key's last four characters, the date it was saved, and a **Works** tag with when it was checked. Changing **Model** takes effect at once. A key pasted into the field replaces the saved one; **Remove key** deletes it.

> The key stays on the server. No player receives it, and after saving you see only its last four characters. Players' rules questions spend it too.

The card's **Usage** table counts what the key has spent (see [The Table section](guide:gm-table)).

If the server cannot hold keys, the card reads *This server has no AI_KEY_SECRET, so it cannot hold a key.* Everything else works.

## Speech-to-text

Listening turns each person's microphone into lines of text with the server's own speech-to-text service (Soniox). A campaign has no speech-to-text key of its own, and the Table section has nothing to set for it. A server without the service still opens the microphones and shows each person's level to the GM, and transcribes nothing. Consent and the capture bar are on [Listening](guide:gm-listening).

## The rules version

Home shows the rules version a campaign starts on, and the **Rules** card in the Table section shows the version it runs on. A campaign follows each rules version as it is released. When a version stops applying an action you recorded earlier, the action moves to the rejected list in the Campaign log, and the **Campaign log** tab shows a count (see [Campaign log](guide:gm-log)).
