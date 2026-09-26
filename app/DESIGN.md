# Companion App Design

The app listens to an online session, logs what happened, keeps the HVE record, and offers the GM real-time suggestions for quests, titles, and classes. Around those four features it keeps the campaign's game record: characters, combat, Consolidation, advancement, and the System's notices to each player.

Sources, in order of authority: the book (`book/`) for procedures, `rules/*.yaml` for numbers, then this file. The ChatGPT handoff spec (2026-09-25) was input to this file; where the two differ, this file holds. A question the book does not answer goes into the book first (the RulesGap rule in `rules/README.md`), then into the app.

## Decisions

Ruled by Gabriel, 2026-09-25.

- **The core is listening, event logging, HVE logging, and live suggestions.** Rules answers are a convenience and sit at the bottom of the list.
- **First target: the tutorial, played online with Gabriel's group, after the app listens and logs.** In-person listening at a physical table stays an idea for later.
- **The GM is the captain.** AI observes, drafts, and proposes. Every AI-assisted action has a manual control that produces the same record.
- **What reaches a player needs the GM's tap.** Bookkeeping only the GM's tracker shows (start the round, apply damage, run a Consolidation) executes at once with undo. Awards, notices, titles, and anything else a player would see wait for one-tap confirmation, whether they came from speech, a suggestion, or a counter.
- **Dice are rolled in the app.** The engine reads the natural die, so explosions grant Marks and cascades grant Battle Memory Cards without anyone reporting them. The GM can roll privately. Typed-in results stay available and record the natural die and the extra dice.
- **Zones live in the combat tracker** as named buckets with each combatant in one. No map.
- **What Can Be Seen filters every player view,** including anything sent to a player-facing AI. Players wear or hide Bestowed titles from their own interface. Open HVE logs are a campaign option, off by default (Introduction, "Who Reads What").
- **Consolidation goals are table talk.** The GM enters hours per character; the app computes and previews.
- **The GM has one composer for System messages:** to one player, several, or the party; sent now or held; typed, or drafted by AI in the System's voice. The engine's automatic notices go through the same channel.
- **Campaigns pin a rules version** and migrate when the GM says so.
- **VE from a kill is shared** by every participant; a confirmed kill for the Slaughter titles is the finishing blow (Titles, "Achievement Titles"). With in-app dice, the finishing blow is whoever made the attack that took the creature to 0.
- **"Once a day" resets at dawn** in the fiction, on the app's in-game clock. The book sentence is queued in the backlog.

Ruled by Gabriel, 2026-09-26:

- **The notices' wording stands** as written in `packages/web/src/text.ts` (`noticeLine`); a test holds it to in-world words.
- **A correction changes a player's sheet silently.** No notice explains it, and a notice the correction made untrue stays in the feed; the GM explains at the table.
- **Notices are not stored.** They reach an open page; a player who reloads starts with an empty feed.

Also ruled by Gabriel, 2026-09-26 (characters and screens):

- **A character lives in one campaign.** The campaign's log is its record; it never belongs to two campaigns and never leaves one.
- **Players build characters, and so can the GM.** A player creates a character in a campaign they play in, or builds one outside any campaign and assigns it to a campaign later; assigning moves it into the campaign's log. The GM can still create a character and assign it to a player, and can reassign any character (a player leaves, the GM takes the character over). A character built outside a campaign is checked against the campaign's rules when it joins.
- **The player-choice rule.** A player records the choices the book gives to the player: spending free points, accepting one of the three class offers, choosing the Consolidation that meditates on a Battle Memory, wearing or hiding a Bestowed title, accepting an articulation on the Quiet Path, creating their own character. The GM records everything adjudicated: awards, outcomes, assigned points, offers, corrections. Combat declarations (Yield, Surge, a pill) are the player's too; whether players tap them on their own screens is settled with the combat tracker.
- **"Assigned points"** is the name for the three Attribute points the System assigns each level (the book's rename is queued). Free points are the player's.
- **Roles belong to a campaign,** never to an account: the GM screen and the player's interface differ by the role held in that campaign. The GM screen has sections, and the GM can view any player's screen as that player sees it.
- **Every GM action shows what it will record** under "If you record this", and its button names the action.

Ruled by Claude on Gabriel's delegation, 2026-09-25 (book sentences queued in the backlog):

- **A collapse's own involuntary Consolidation does not return its temporary point.** The next Consolidation completed without interruption does.
- **An hour of Consolidation that refines VE does not count toward the collapse clock.** Resting at Critical is the remedy the collapse would force. At the Level cap, where nothing refines, the clock keeps running (Grade Breakthroughs: it runs until Ignition).
- **A collapse ends when stored VE falls to Tolerance or below, or, once the character is at the Level cap, after 5 full hours in all.** A character who reaches the cap mid-collapse wakes at the fifth hour, or at once if five have passed.

## Milestones

Each milestone is usable at a table and feeds the next. Items are marked **active** or *deferred*.

### M1: the record and the manual app (no AI)

| Item | | Notes |
|---|---|---|
| Rules engine in TypeScript | **active** | Ported from `tools/rules_engine.py`; both engines pass `rules/fixtures/` |
| Campaigns, roles, invites | **active** | One GM per campaign; invite links; rules version pinned |
| Character creation | **active** | Point buy (40 points, 3 to 10, exactly 40), Background, derived values, the three pregens |
| Player interface | **active** | What Can Be Seen's list in its order; party frame; worn and hidden titles |
| GM character view and corrections | **active** | A correction is recorded apart from an award |
| Action log | **active** | Append-only, idempotent, undo, correction preview |
| Notices | **active** | Engine-emitted (VE acquired, level, title, quest, vital coherence) and the GM composer; the clave on every notice |
| Dice | **active** | d100, explosion at the Grade threshold, Advantage, Surge declared before the roll, private GM rolls |
| Combat tracker | **active** | Sides, Momentum roll and Seize, Decisive Tactical Reversal as a GM button, round and side, one character's Beats at a time, Yield debt, Zones, engagement and Flanking, the Clash with the Rule of 40, the Yield offer before damage, Exposed, Downed countdown and stabilizing, the two-per-kind pill limit, Aura Pressure and the Will Save |
| Encounter end | **active** | Participants, VE per character at their own tier with GM override, finishing blows, loot rolls |
| Bestiary library and encounter builder | **active** | From `rules/bestiary.yaml`, with the sizing table and party size |
| Prep | **active** | Encounters, quests, and notices prepared to fire live; the tutorial as a loadable content pack |
| Consolidation | **active** | Hours per character, guards excluded, preview and apply: refining, healing, Aether and recharges at the first hour, levels mid-rest, the cap, density, interruption, Saturation and the collapse clock |
| Level-ups | **active** | GM places System points with the Behavioral Stat Mapping table beside them; players hold and spend free points; capped stats redirect |
| Battle Memories and Principles | **active** | Automatic and GM-granted cards; meditation at a Consolidation the player chooses; IP, Resonance notices, crystallization, Distillation grants recorded |
| Proficiencies and Marks | **active** | Marks from exploding weapon rolls |
| Titles | **active** | The catalog, the tutorial's titles, custom titles; stacking, HVE-Resonant supersession, negative titles |
| Achievement counters | **active** | Counted from the tracker and rest log; fiction-only deeds ticked by the GM; crossing a count proposes the title |
| Quests | **active** | Five categories, the log with hidden modes, sharing rules, deadlines, completion and failure, refusal counts by flavor |
| In-game clock | **active** | Days, dawn, quest windows |
| Events | **active** | Manual entry with participants and GM notes; the record M2 and M3 write into |
| HVE sweep by hand | **active** | Per-character sheet, Current and Deep, the weights, the circled Defining note, Coherence |
| Sessions | **active** | Start, end, attendance |
| Inspection | **active** | The Grade-gap table in What Can Be Seen |
| Class offers entered by hand | **active** | The GM enters three offers, the player accepts one, the lead Attribute gains its bonus, and the profile places System points from Level 10; after the items the tutorial needs, before any campaign reaches Level 10 |
| Skill Synthesis | *deferred* | |
| Phone layout for players | *deferred* | Online play runs on laptops |

### M2: AI drafting from typed input

| Item | | Notes |
|---|---|---|
| Provider adapter and the GM's key | **active** | Held on the server per campaign, never sent to a player's browser; setup check and usage shown |
| Campaign memory | **active** | See "AI context" below |
| Suggestion panel | **active** | Battle Memories, titles, Hidden Achievements, Personal Opportunities, quests, overlooked rewards; alternatives where they differ; dismissed items stay dismissed |
| System voice drafting | **active** | Notices and visions, held to the voice rules in `rules/system-ai.yaml` |
| Stat allocation suggestions | **active** | Behavioral Stat Mapping from events since the last level |
| Class offers | **active** | Three offers from the record; the guarded list only when the GM asks |
| Sweep drafts | **active** | From logged events; 0.5 entries shown as reminders |
| Summaries | **active** | Running recap, session, per character; GM edits, publishes selected text |
| Rules questions | *deferred* | Chapter and heading citations; players' questions draw only on player chapters |

### M3: listening

| Item | | Notes |
|---|---|---|
| Consent and capture | **active** | Per-participant consent; capture indicator and mute in every tab; pause that stops capture |
| Speech-to-text adapter | **active** | Streaming, one stream per participant; vendor chosen here |
| Event and HVE drafting | **active** | Events, HVE entries, counter ticks, all as proposals |
| Shadow mode | **active** | Drafts to a GM-only panel with nothing proposed live, for measuring |
| Test recordings | **active** | Kept only with separate, explicit consent, as material for measuring the listener |
| A rehearsal session | **active** | Real voices on a throwaway scene before the tutorial |

### M4: spoken commands

| Item | | Notes |
|---|---|---|
| GM command recognition | **active** | Only the GM's stream carries authority; quotations, hypotheticals, and NPC speech stay speech |
| Execution rules | **active** | GM-only bookkeeping executes with undo; player-visible results become confirm taps; repeats are recognized and dropped |
| Auto-apply awards | *deferred* | A campaign toggle once precision is measured |

### Later

Spoken System delivery; campaign artifacts (survivors' forum retellings, character cards, timelines); a glyph-resolve effect on notices (the setting's script: meaning arrives with the sight); an in-app voice room; single-mic listening at a physical table; Battle Memory art. Grade Breakthrough workflows stay out.

## Architecture

- **One TypeScript workspace in `app/`**, managed with pnpm: `packages/engine`, `packages/record`, `packages/server`, and `packages/web` when M1 reaches it. The web client is React with Vite; the server is Node with HTTP and WebSockets and serves the built client too; Postgres holds the record.
- **Hosting (Gabriel, 2026-09-25):** one always-on Fly.io machine in the personal organization, beside a Supabase project (Postgres and Auth) in us-east-2. A single long-running process keeps the live channel, the per-campaign lock, and later the listening streams in one place; a second machine would need its updates passed between machines first. Deploys come from GitHub Actions and wait for an empty table.
- **The engine is pure.** It takes a rules snapshot and computes; it holds no state and does no I/O. The server stores one snapshot per rules version and builds each campaign's engine from the version it pins. The Python engine stays the reference for the book's tables and sims; the fixtures are the contract both engines meet.
- **The record is an append-only action log.** Every change is an action with an idempotency key, an actor (GM, player, accepted suggestion), a source (manual, voice, counter), and what caused it. Sheets are computed from the log. Undo is a compensating action. A correction's preview recomputes the log without the corrected action and shows the difference ("without this award Kara is Level 3, and her Level 4 points return unallocated"); the GM chooses what to apply. Suggestions live apart from the log until accepted.
- **Sign-in is a Supabase account, through Google** (Gabriel, 2026-09-25). The browser sends Supabase's access token and the server checks it against the project's published keys. The actor on every action comes from the token. An invite link makes a signed-in person a player; one GM per campaign.
- **What a player receives is filtered on the server.** A player's view holds their own characters' interfaces (What Can Be Seen, "Your Own Interface") and notices about them, never the log, its length, the Saturation band, or pending System points. The GM receives the whole record.
- **AI sits behind adapters** so providers can change without touching the game model: a language model (Claude by default) and a speech-to-text service. Deterministic rules never go through a model.

## Voice capture

Each participant opens the app in a browser tab; a player's tab is their character's interface. The tab captures that person's microphone and streams it to the server, and the group talks on Discord as usual. The app carries no conversation between people; it only listens. Each stream is one person, so the server knows who spoke.

Known costs:

- **Headphones.** A laptop speaker lets one microphone hear everyone. When the same words arrive on two streams at once, the server keeps the louder copy.
- **Two mutes.** Muting in Discord does not reach the app. Each tab shows a live capture indicator and its own mute, and a player who steps away to talk in the room mutes the app too.
- **The tab stays open** with microphone permission for the whole session.

A failure in capture loses the listening and leaves the game on Discord. The audio sits behind one interface, so an in-app voice room (LiveKit is the candidate) can replace it later without changes downstream.

## AI context

A model keeps nothing between requests. Every request carries a context the app assembles, and its size stays about constant however long the campaign runs:

1. **Standing context**, always sent: the premise and each character's sheet, Deep reads, and Defining moments (the book's template, `rules/templates/standing-context.txt`).
2. **Rolling summaries.** The GM approves a session summary at wrap-up. The campaign summary is rewritten from the previous one plus the new session's, and each character's chronicle the same way. GM edits are what the next rewrite starts from, so a correction stays corrected.
3. **Retrieval.** The full event log stays in the database; a suggestion that needs a callback gets the few events that match.
4. **The current scene:** the last minutes of transcript and the tracker's state.

Visibility is applied before assembly: a player-facing request never receives GM notes, HVE readings, hidden criteria, or another character's private record.

## Open

- **The speech-to-text vendor**, chosen at M3 against recorded test material.
- **The rehearsal scene** before the tutorial: content that spoils nothing in the tutorial.
