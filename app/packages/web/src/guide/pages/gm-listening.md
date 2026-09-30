# Listening

Listening turns what the table says into lines of text on your screen, and the drafting reads those lines to propose events and grants for you to accept. It runs only during a session, only while everyone at the table has consented, and only when you start it.

## Consent

Each person gives or withdraws their own consent, once per campaign. The people who must consent are you and the player of each character at the running session; a player whose character is absent is not asked and does not capture.

Press **Consent to listening…** in the table bar to read what listening does: the microphone goes through the Gradebreaker server to Soniox for speech-to-text, neither keeps the audio, and the text shows on the GM's screen only and is deleted 30 days after it was said. Press **I consent**, or **Not now**. Players see the same text in the strip above their screen (see [Listening, for players](guide:player-listening)).

**Withdraw consent** sits in the same place once given. A withdrawal by anyone at the table stops the listening for everyone.

## The capture bar

The listening part of the table bar shows the state: **Not listening**, **Listening**, or **Paused**.

- With no session running, it reads *Start a session to listen.*
- With a session running and someone yet to consent, the drawer under the bar reads *Waiting on consent from Joe and Nia.*, and there is no start button.
- With everyone consented, press **Start listening**.

While listening, the bar counts the streams, *3 of 5 live*, and offers **Pause for everyone** (then **Resume**) and **Stop listening**. Pausing turns every microphone off and drafts the lines so far; stopping also ends any test recording.

Listening also stops without you: when the session ends, when someone present withdraws consent, and when a character arrives whose player has not consented. The drawer says why, *Stopped: the session ended.* A player's strip says only that it stopped. Nothing starts listening again until you press **Start listening**.

### Each stream

When a stream is not live, the drawer lists every person present with its state: **live** (with a level meter), **muted**, **nothing arriving** (the tab is open and sends nothing for 2 seconds), **no microphone** (refused or missing), **no tab open**, or **not transcribed**, with the reason and *trying again every 30 s* when the speech service refuses or drops the stream.

### Your own microphone

Your tab captures like everyone's, with **Mute** and **Unmute**. If the browser waits for a click before it opens audio, press **Turn my microphone on**; after a refusal, allow the microphone for the site and press **Try again**. A person captures from one tab at a time: opening the campaign in another tab moves the microphone there, and **Use this tab** takes it back.

## Heard

![The Heard this session card in the Events section, with lines drafted and lines waiting.](gm-heard.webp)

The **Heard this session** card in the Events section lists the lines of the running session, or of the last one to end, each with its time and speaker, newest last. Lines already drafted are dimmed. Players never see these lines.

### Drafting on, in shadow, or off

With the campaign's AI key, **Drafting as the table talks** picks one of three modes. It starts **on**.

- **on**: the server drafts a window of lines once 20 have arrived and the table falls quiet for 10 seconds, at 40 lines regardless, and whenever you pause or stop the listening. The drafts wait in the Events section's drafts, and grants in Suggestions; nothing is logged until you accept one (see [Events](guide:gm-events) and [Suggestions](guide:gm-suggestions)).
- **in shadow**: the server drafts the same windows and keeps the drafts from review, so what you log by hand stays your own. The **Drafted in shadow** card counts the windows. **Compare with what you logged** shows what both caught, what you logged that the listener missed, and what it drafted that you did not log; comparing shows you the drafts. **Put the drafts in review** releases them, where one you let pass can still be accepted.
- **off**: nothing drafts on its own. **Put them in the drafting box** copies the lines not yet drafted into the drafting box as typed talk (a time, a name, the words).

In every mode, **Draft 12 new lines now** drafts what has arrived since the last window. Without a key, the card reads *Drafting from these needs the campaign's key* and the lines still arrive.

## Test recordings

A test recording keeps voices so the listener can be measured against real speech. It needs its own consent: **Test recordings…** opens the text, and **I consent to test recordings** gives it.

While listening, press **Record for testing**. It keeps the audio of each person present who consented to both listening and test recordings; the drawer names who is *Not recorded*, and each recorded person's tab shows **Recording for testing**. Press **Stop the test recording**, or stop the listening, to end it.

The **Test recordings** card in the Table section downloads, corrects, and deletes them (see [The Table section](guide:gm-table)); the server deletes a recording 7 days after it ends. Withdrawing test-recording consent deletes that person's part of every recording still on the server.
