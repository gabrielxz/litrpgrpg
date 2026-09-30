# Sessions and the clock

The table bar runs under the section tabs on every section of the GM's screen. It holds the running session and who is at the table, the listening controls, and the in-game clock. Sessions and the clock are your record; no player sees them.

![The table bar with a running session, the listening controls, and the clock.](gm-tablebar.webp)

Each part opens its form in a drawer under the bar. Pressing the same button again closes it.

## Starting a session

With no session running, the bar reads *No session running.* Press **Start a session**.

- **Name** is optional. Left empty, the session takes the next number: **Session 1**, **Session 2**, and so on.
- **At the table** lists every living character, all ticked. Untick anyone absent.

The form previews what it records. Press **Start** and the name to record it. One session runs at a time.

While a session runs, the bar shows its name, the time it started, and the characters at the table, with anyone who left early in brackets. Events and sweeps you record while it runs belong to it, and the Heard card collects what the listening hears during it.

## Arrivals and departures

Press **Attendance** to open a button for each living character: **Kara leaves** for someone at the table, **Kara joins** for someone who is not. A press records at once, and you undo it from the Campaign log.

Who is at the table decides who the listening waits on: you, and the player of each character present. A player who arrives without having consented stops the listening (see [Listening](guide:gm-listening)).

## Ending a session

Press **End the session**. The drawer holds three things.

1. **The sweep check.** If you recorded a Session-End Sweep this session, the drawer names who was swept. If not, it reads *No sweep recorded this session.* with **Go to the sweep**, which opens the HVE section (see [HVE](guide:gm-hve); the procedure is in The Hidden Vector Engine, "The Session-End Sweep").
2. **Summary.** Up to 2000 characters; the placeholder asks for three sentences: what happened, what changed, what is left open. With the campaign's AI key, **Draft it from the record** writes a draft from the session's events, kills, quests, titles, and levels. The draft replaces whatever is in the field, and you edit it before recording.
3. **End** and the session's name, with its preview. Press it to record the end.

Ending the session stops the listening and any test recording. You can write or replace a summary later, and write the campaign memory for the session, in the **Sessions** card of the Campaign log (see [Campaign log](guide:gm-log)).

## The clock

The clock reads the in-game day and time, *Day 12, 14:05*, counted from Day 1, 00:00, the day of Integration. Until you set it, the bar reads *No in-game clock.* with **Set the clock**.

Once it is set, the bar offers four controls.

- **Forward 1 hour** moves the clock an hour. It records at once; undo it from the Campaign log.
- **Forward to dawn** moves it to the next dawn, and the button shows how far that is, *Forward to dawn (9 hours)*. It records at once, with the same undo.
- **Forward…** opens **Hours** and **Minutes** for any span, with a preview, and records on **Forward** and the span.
- **Set…** opens **Day**, **Hour**, **Minute**, and **Dawn at hour**, with a preview, and records on **Set the clock**. **Set…** can move the clock backward as well as forward.

Dawn's hour starts at the hour the rules give. Change **Dawn at hour** when the party is somewhere dawn comes at another hour.

### What the clock drives

- **Dawn.** A class's once-a-day use is ready again at the next dawn, and a character can have one Consolidation vision per day, dawn to dawn. A form that would spend either a second time refuses until the clock passes dawn.
- **Timed quests.** A quest issued with a window in hours falls due that many hours later. Once the clock passes a due time, the quest's entry in Quests reads *time limit reached*, and a **Forward…** or **Set…** preview that crosses it says the quest *reaches its time limit*. The quest stays open until you fail or expire it there (see [Quests](guide:gm-quests)). A player sees their quest's hours remaining in their log.
- **Days survived.** Crossing into Day N counts N − 1 days survived for every living character, which titles that count days read.

## The echo

When a player's moment lands (a character Downed, a level reached, a title or class taken, class offers standing, a Proficiency tier, a quest completed), the right end of the table bar shows one line, *Kara reached Level 9*, for 8 seconds or until the next replaces it.
