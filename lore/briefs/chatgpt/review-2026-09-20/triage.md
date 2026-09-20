# Triage of ChatGPT's whole-book review

Review of build 20260920-112039 (three documents in this folder: `whole-book-review.md`, `chapter-change-log.md`, `voice-standard.md`). This file is the index for working through it; the review's own text is the content. Every finding below was checked against the source chapters and `rules/*.yaml` before it was bucketed, because ChatGPT read the PDF and holds neither. Verdict codes on findings: CONFIRMED, PARTLY, NOT CONFIRMED (ChatGPT misread; the row says what the source says), SILENT (the source does not answer a question play will ask).

**Buckets.**

- **A, apply.** An obvious fix: the source contradicts itself or the rules data, and the repair has one reading. Applied as one commit after Gabriel skims the list for vetoes.
- **B, decide.** A rules or design call. Each carries a recommendation; Gabriel cuts.
- **C, decline.** ChatGPT's finding does not hold, or the proposed change loses something the book wants.
- **Rewrites (the V-IDs).** Every one is Gabriel's call, as agreed. Codes: APPLY (take ChatGPT's text), EDIT (take the point, with the wording noted), DECLINE (keep the original), DECIDE (hangs on a B item), DEFER (belongs to a pass already queued: the System voice section and the judge-and-explain sweep are next session's items 1 and 5).

**Applied 2026-09-20 (Gabriel's rulings, second pass).** Everything in this file has been applied, the DEFER items included (V09-05, V09-06, V12-07 landed with the voice section and the judge-and-explain sweep on 2026-09-20 evening), except the C rows and the DECLINE verdicts. Gabriel's overrides, applied as he ruled: ChatGPT's text for V01-01, V02-04, V02-05, V02-15, V02-16, V03-01, V03-06, V03-07, V04-02, V04-04, V04-05, V05-01, V05-03, V05-04, V05-05, V05-06, V05-09, V05-10, V05-16, V05-17, V05-18 (the "Power is not granted" line cut with it), V06-02, V06-04, V06-07, V06-09, V07-01, V07-03, V07-09, V07-10, V07-12, V07-14, V07-16, V08-03, V08-08, V10-03, V10-05, V10-06, V10-10, V10-13, V11-02, V11-04, V11-10, V12-01, V12-03, V12-04, V12-06, V13-02, V14-01, V14-02, V14-09, V14-11, V14-13, V15-11, V15-14, V15-15, V15-20, V15-21 (without its "X, not Y"), V15-24, V15-25, V15-26, V15-28, V15-29 (no page numbers); Claude's rewording for V02-08, V02-12, V10-04, V14-07, V15-13; V07-05 follows D3 rather than ChatGPT (the two conflicted); V08-09 and V17-01 as Claude had them; V09-02 written for an app that ships with the book; V10-12 cut; V11-07 dropped (not in the source). Decisions: D8 Famine and Majesty; D16 the numbered dial; D20 one holder serves both directions; D23 the middle path (memory is the default, a cue is allowed, never a score). Also: the pregens' "and nothing else" brag cut; the NPC in running clothes named Marisol Vega (Claude's pick, open to veto).

**Walk order.** The five "fix first" items, then the cross-cutting decisions, then chapter by chapter in book order with each chapter's rewrites taken right after its findings, then production, then the voice standard. Each chapter section carries, in order: ChatGPT's content findings verbatim, what the source actually says (verified, with line numbers), Claude's buckets, and every rewrite with the original text, ChatGPT's suggestion and reasoning, and Claude's verdict with proposed wording.

**Counts.** 185 rewrite quotes; 184 located in source, one (V11-07) not found and to be located at apply time. Content findings: 156 rows across 17 chapters.

---

## The five "fix first" items

### F1. The two HVE procedures describe different games

**Approved (Gabriel, 2026-09-20): the A rows and the recommendation.**

**CONFIRMED.** `book/50-hidden-vector-engine.md`: the sweep adds one Deep tally to a side whose Current lead is 2 or more, then wipes Current (lines 85 and 117; `rules/hve.yaml` `deep_update`). Structured logging adds the full intensity to Current and half to Deep, halves Current, decays Deep by a tenth, and admits a 0.5 tier (line 172; `rules/hve.yaml` `structured_logging`). Line 172 then claims "The Coherence bands and every output read the same either way; a table can switch ... by copying the standing totals across." ChatGPT's eight-session example is right: eight identical two-tally sessions give Deep 8 on paper and about 5.1 structured, which is Singular (+20) against Defined (+10) at the Breakthrough.

**B. Recommendation: the sweep is the algorithm; structured logging is an event record that the sweep is computed from.** At session end the app sums intensities per side into Current, applies the lead-of-2 rule to Deep, and wipes Current. Half-value, the tenth decay, and the separate numeric vectors go. The 0.5 tier stays app-only and counts as half a tally in the Current sum. Consequences: the "copy the totals across" sentence becomes true; the Coherence bands read integer tallies in every mode; the Personal Opportunity prompt's "Deep tally count or value" becomes "Deep tally count"; `rules/hve.yaml` `structured_logging` shrinks to the intensities and the entry fields; `rules/version.yaml` bumps. The chapter's Design Intent "Recency" constraint is already served by Current wiping. Alternative (not recommended): keep the numeric variant and calibrate it separately, which puts two Coherence scales in a book whose Breakthrough reads one.

Also in F1: Personal Opportunities read Current, which the sweep wipes (`rules/quests.yaml` line 6 "tests it when Current and Deep disagree"). **A:** state that offers are drafted at the sweep, from Current before it wipes.

### F2. The reference material changes core rules

**Approved (Gabriel, 2026-09-20): the A rows and the recommendation.**

| Subject | Verdict | Bucket |
|---|---|---|
| Soft Failure | CONFIRMED. Core (`10-core-mechanics.md` 186, 190) defaults to a setback with a way forward and calls success-at-a-cost a tool to spend sparingly. Quick Reference line 25 and the kit's GM screen (`table-kit.html` 1537) say "success at a cost". | **A:** copy Core's definition into both. |
| Aether restoration | CONFIRMED. Core 535 and 546, Cultivation 62, Quick Reference 62, kit 1475 say only Consolidation refills Aether; Items 63 and 168 restore it with Aether Pills and Pulse Shards. | **A:** "Aether does not regenerate; Consolidation refills it, and Aether Pills and Pulse Shards restore it." The kit's "a full pool buys at most two of these between rests" gains "without a pill". |
| Visible titles | CONFIRMED; the conflict is inside What Can Be Seen itself, and Titles defers to it. Table (`57-what-can-be-seen.md` 65 to 69): worn Bestowed titles need an observer one Grade higher. Prose (74, 78): worn titles and negative titles are legible to equal or higher Grade. Titles defers to this chapter (`40-titles.md` 262). | **B. Recommendation: the prose wins.** A worn title exists to be seen by the people you meet; a table that hides it from peers makes "worn" meaningless. New table: Same Grade: Achievement, HVE-Resonant, worn Bestowed, negative titles. Two Grades higher: plus hidden Bestowed. Three or more: everything, Hidden Achievement included. The "One Grade higher" row goes. |
| Hidden information | CONFIRMED. What Can Be Seen 94 "Hidden Quests do not appear in the log until they resolve" against Quests' three modes (`55-quests.md` 344 to 369; Fully Obscured "appears in the log immediately"). "Nobody at any Grade sees another person's Attributes, Health, Aether" (70) against the party frame (84). "Hidden Achievement titles are private until the holder chooses otherwise" (76) against the table's three-Grades row. | **A:** What Can Be Seen defers to Quests for hidden-quest presentation; "by inspection" qualifies the nobody-sees line; "private from peers" qualifies Hidden Achievements. |

Kit items under F2: the Marks line on the sheet lacks the untrained-to-Trained step (`table-kit.html` 378 and its three copies); Flanking wording (1454); Suppression's effect is absent from the GM screen (1592 shows the save only). **A**, applied last, after the rules above settle.

### F3. The resource and damage examples

**Approved (Gabriel, 2026-09-20): the A rows and the recommendation.**

| Finding | Verdict | Bucket |
|---|---|---|
| Grade-gap example, `10-core-mechanics.md` 464 to 468 | CONFIRMED. FOR 120 is 240 HP (line 466 says 120; Quick Reference 156 has 240). A 130-damage hit on 80 Max HP is Downed, and line 439 of the same chapter says exactly that; line 468 says "simply dead". "Survives at 68 and dies to the next one" is Downed too. The E-Initiate rolls offense on FOR 120 with no offensive Attribute named, here and in Quick Reference example 3 (`rules/fixtures/core-mechanics.yaml` 149 encodes the same Force 12). | **A:** 240 HP; Downed in both places; give the E-Initiate STR 120 as well ("STR and FOR 120"). Fixture numbers do not change. |
| Surge on an odd pool | CONFIRMED. Surge costs half Maximum Aether rounded up (541, `rules/combat.yaml` 82, engine `math.ceil`) against the global "all fractions round down, always" (31). Line 546 promises "Two Surges empty a full pool." Andre, a pregen, has Aether 5: one Surge at 3, then 2 left and no second Surge. Kara at 6 works only because 6 is even. | **B, see D1.** |
| Healing rounding | CONFIRMED. One fifth of Max HP per hour (`25-cultivation.md` 55, `rules/cultivation.yaml` 33) with round-down heals Kara and Joe (14 HP) 2 per hour: 10 after the five hours the chapter promises "a full set of wounds" in. | **B, see D2.** |
| Consolidation at zero VE | PARTLY. Cultivation 55 says the minimum is one hour "however little VE needs processing" and Aether refills at the first full hour; zero is never named, and Core 521 ties refilling to VE in the fiction. The engine runs at 0 VE. | **A:** one sentence: Consolidation with nothing stored still takes its first hour and still restores Aether and HP. |
| Refined VE at the level cap | SILENT in prose. Cultivation 81 says stored VE keeps accumulating and counts in full toward Ignition, and Saturation applies to the stockpile. Whether resting at the cap refines the stockpile away is unstated. | **B, see D3.** |

### F4. The Tutorial climax

**Approved (Gabriel, 2026-09-20): the A rows and the recommendation.**

**CONFIRMED.** `70-tutorial.md` Phase 5 gives the gate's one-person-per-round rate (1185), the Warden's three Zones per turn (1135), thirty fictional minutes with "count rounds only on the causeway" (1122), and the queue's length ("a queue of eight is eight rounds", 1187). It never says where the Warden starts, how many Zones the causeway is, or how many rounds the party has before the Purge reaches the gate. The sector benefits ("a round before the Warden", "the queue starts a round early", "one Beat of movement that round") are adjustments to a baseline the text does not state. **B, see D5**, with a proposed setup table.

The Warden's state (Bestiary 180 to 188 and tutorial 1133 to 1139): the tutorial has the 48-damage threshold and the Cornered exception, the Bestiary has neither; both say "does not attack unless attacked" under Indifferent Mode, so its behaviour between the first point of damage and the quarter is undefined; a three-Beat creature that "gives up both Beats" has one Beat unaccounted for; the Sacrifice needs it to turn Hostile regardless of damage. **B, see D6.**

The Wraith: Bestiary 170 gives ordinary physical attacks −10; tutorial 901 says ordinary weapons pass through it and it can be hit by an attack aimed with PER Force. **B, see D7.**

The survival exception (1232, no accidental player-character death) sits in Phase 5's Watch For; the first private fight is in Phase 2. **A:** add it to Pre-Tutorial Setup and cross-reference it from the arrival fight.

### F5. The Tutorial reward ledger

**Approved (Gabriel, 2026-09-20): the A rows and the recommendation.**

**CONFIRMED** on every point checked (ledger at 1446 to 1465, sector awards at 842, 879, 910, 943, 985, 1236; camp text at 951; sample summaries at 1299 to 1357):

- Two Frenzy Rats are Easy kills at 5 each (10), against the ledger's "2 to 4" for the arrival kill.
- Session survival is 5 per session, listed once; two-session and four-session formats differ by 10 VE.
- "One sector pays about a level's worth of VE, 120" (951) holds for a full clear. The survey is 40; the Arcane sector without its Wraith pays 40 total; the Martial sector's Sentries pay 10 each. "Mild Saturation for everyone" after one sector needs the kills.
- The 60 VE Kith encounter is once, and is listed under Phase 4 as if it were per sector.
- The low route's "265 VE, which is Level 3 with a third of a level banked": 265 is two levels plus 25, about a fifth.
- The sample summaries project a level from stored VE without stating the character's current level (265 stored, "Level 5").
- The completion bonus (1465) tops every character up to Level 4, so the "low route ends at Level 3" sentence describes earned VE before the bonus and should say so.

**A:** rebuild the ledger with columns for guaranteed, optional, and per-session awards, show a cautious route and a full route, state that the completion bonus brings every character to 360 earned VE, add the current level to the summary template's VE line, and rewrite 951 with the survey and kill numbers. The numbers are already in the chapter; this is arithmetic and layout, so it needs no decision beyond Gabriel's skim.

---

## Cross-cutting decisions

### D1. Surge rounding (rules change)

**Approved (Gabriel, 2026-09-20).**

Options: (a) keep round-up and rewrite line 546 to say odd pools afford one Surge; (b) round down with a minimum of 1, which keeps the global rounding rule and makes "a full pool is at least two Surges" true for every pool of 2 or more (Andre: 2 each, one point left; Aether 3: three Surges at 1 each, harmless); (c) a flat cost (3 at F, ×10 per Grade), which breaks the "half a pool" design. **Recommendation: (b).** Touches `rules/combat.yaml` 82, `tools/rules_engine.py` `surge_cost`, Core 541 to 548, Quick Reference 75, the kit's Surge card (1475, "at most two" stays true), `rules/retired.yaml`, `rules/version.yaml` to 0.1.5. Kara's fixture (3) is unchanged.

### D2. Healing rounding (rules change)

**Approved (Gabriel, 2026-09-20).**

Options: (a) "one fifth of Max HP, rounded up", which guarantees full HP at hour five for every Max HP and is the one named exception to round-down; (b) round down and add "and full HP at the fifth hour"; (c) round down and drop the five-hour promise. **Recommendation: (a)**, with the global rounding sentence gaining "unless a rule says otherwise" and this being the rule that does. Touches `rules/cultivation.yaml` 33, Cultivation 55 and 165, Quick Reference 66, the kit (1508), the tutorial's first-Consolidation walkthrough (744).

### D3. VE at the level cap

**Approved (Gabriel, 2026-09-20).**

Cultivation 81 already says stored VE counts in full toward Ignition and the Critical clock runs; the design record says the same. The missing sentence: **at the cap, Consolidation refines nothing; the stockpile waits for Ignition and Saturation applies until it is spent.** A capped character cannot rest their way out of Saturation; they Ignite or they collapse, one temporary point at a time. **Recommendation: state it as written above** (it is the existing intent). Breakthroughs 77 ("the gathered charge draining away with nothing to show for it", V07-05) is then wrong and gets rewritten to say what an abandoned charge does. Also state where Level 26 comes from: **the successful Breakthrough makes the character Level 26 with zero stored VE** (Progression 86 and Cultivation 79 leave two readings; the ritual burns the VE).

### D4. Title visibility

**Approved (Gabriel, 2026-09-20).**

See F2. Recommendation: the prose wins; rebuild the table.

### D5. The causeway setup (proposed numbers, for Gabriel to cut)

A small GM table before "Cornered":

| Element | Default | Adjusted by |
|---|---|---|
| The span | Two Zones: the span and the gate mouth. Nowhere to be driven on either. | none |
| The party reaches the span | Round 1 | Survival (Sector B): the Warden is one round further behind |
| The Warden reaches the span | Round 4 | Martial (Sector A): each held bottleneck costs it a Beat of movement, so one round per bottleneck, at most two |
| The gate opens | The round the first character reaches the mouth | Civic (Sector D): already open; the queue starts one round early |
| Throughput | One person per round, in the order the party sets | none |
| The Purge reaches the gate mouth | Round 12 from the party's first round on the span | Arcane (Sector C): the party is never flanked by it before the span; no round change |
| Anyone still on the span at round 12 | A player character is Salvaged; an NPC is gone | none |

A full queue (four player characters, Ray, the runner, up to three Node strangers, four Kith) is thirteen, one more than the default deadline, so a party that kept everyone alive needs a sector benefit or the Sacrifice, which is the pressure the scene wants. Warden arrival, deadline, and queue size are the three dials. **Recommendation: adopt the numbers above.** **Approved (Gabriel, 2026-09-20) with these numbers.** What each dial does: the Warden's round-4 arrival gives a bare party three clear rounds on the span; the round-12 deadline is one short of a full queue, so keeping everyone alive means earning a sector benefit or choosing the Sacrifice; a failed gate check never delays the queue.

### D6. The Warden's one state description (Bestiary and tutorial)

**Approved (Gabriel, 2026-09-20).**

Proposed: **Indifferent** until it has taken 47 damage (a quarter of 190, rounded down: Hostile at 143 HP or less), all three Beats on movement toward the gate, and it ignores attacks entirely (cut "does not attack unless attacked"). **Hostile** at 143 HP or less, or the moment a character attacks it and stays in its path (the Sacrifice), two Beats on the last thing that hurt it, one on movement. **Yield:** it gives up two of its three Beats for −40 and keeps one, never moves when it Yields, and Cornered does not limit it. Copy the block into both places and the yaml. "Cannot be beaten in a straight fight" becomes "built to overwhelm a Level 1 to 4 party in a straight fight" (V13-05, V15-03), since the chapter itself supplies Edge Shards, the plating gap, and a kill award.

### D7. The Wraith

**Approved (Gabriel, 2026-09-20).**

Options: (a) the Bestiary's −10 to physical attacks, with the tutorial rewritten to match; (b) the tutorial's "pass through", with the Bestiary rewritten to immunity. **Recommendation: (a), plus the tutorial's PER rule as the Bestiary's stated exception:** an attack aimed with the attacker's PER Force hits it at full and takes the +10 vulnerability; a Principle Application or Infusion ignores the −10. Name which shards hurt it (Edge Shards do; Pulse Shards restore Aether and do not).

### D8. Family example renames (rules data, `rules/hve.yaml` and `rules/principles.yaml`)

**Pending: Gabriel picks the words.** Context. The eight families each list five example Principles a character in that family might crystallize. The two lists in question:

- **Consumption** (the Hunger pole): Devouring, Blood, **The Void**, Assimilation, Corrosion. The family is about taking in: eating, draining, absorbing, eroding. "The Void" reads as a Principle of emptiness that swallows, which is on theme, but Principles 173 names Void as one of the five Axioms (Time, Void, Luck, Truth, Distance), which behaviour cannot produce and which are earned only by exposure to a place where the thing is loose. One word cannot be both a behavioral family example and an Axiom. Candidates that keep the swallowing image without the Axiom's name: **Famine** (hunger as a force that empties a region; nothing else in the book uses it), **Hollowing** (what devouring leaves behind), **The Maw** (a mouth; concrete, a little pulpy), **Rot** (close to Corrosion, already listed). Claude's pick: Famine.
- **Imposition** (the Will pole): **Conqueror's Haki**, Mind Control, Pressure, Fear, Sovereignty. The family is about bending others by force of self. "Conqueror's Haki" is One Piece's term for an aura that makes the weak-willed faint or kneel; it is a borrowed coinage on the IP-scrub list and the only franchise term in the book. What the slot needs is a word for overwhelming presence, distinct from Pressure and Sovereignty, which sit beside it, and from Dominion, which is Governance. Candidates: **Majesty** (presence that makes people kneel without a word), **Overawe** (the verb made a noun; plain), **Command** (voice that is obeyed; overlaps Mind Control), **Tyranny** (rule by terror; overlaps Fear). Claude's pick: Majesty.

Both changes touch the family lists in `50-hidden-vector-engine.md`, `rules/hve.yaml`, and `rules/principles.yaml`, and the rendered family table.

### D9. Kara across chapters

**Approved (Gabriel, 2026-09-20).**

Principles' Kara is Weight (Impact family, Sudden Weight, fixtures). HVE's Kara accrues toward Consumption (50, lines 29 and 117) while her own sheet shows Deep Force 3 leading Hunger 2, which is Impact. **Recommendation:** keep the opening pill vignette and its notice as session one, and fix the session-three sheet paragraph to read Impact with Consumption behind it, which is what the sheet shows and what Principles needs. Also the circled margin notes: "S1: took the pill" is the table's one-tally example and cannot be Defining; keep one circled note for a three-tally moment.

### D10. IP bookkeeping (Principles)

**Approved (Gabriel, 2026-09-20).**

Cumulative IP is the rule (154); Kara's sheet says "10/10 spent into Seed" (83). **A** for the sheet. **B** for Fusion: the text gives the tier (the lower parent's) and the loss (the higher parent loses 10) but not the fused total. **Recommendation:** the fused Principle keeps the higher parent's IP after the loss and sits at the lower parent's tier until its next Distillation; in a tie of tiers the player picks which parent pays; a parent at exactly 10 drops to 0 and the fused Principle starts at Initial Insight.

### D11. Attack Applications and the Beat

**Approved (Gabriel, 2026-09-20).**

Principles 212 prices an Application at "1 Beat plus Aether"; Core lists Attack and Activate a Principle Application as separate Beat actions; Kara's Sudden Weight example shows "+10 to the Clash" and no roll. At two Beats a turn, an Application that costs its own Beat and then the attack's is the whole turn for +10, against Surge's free +5. **Recommendation: an Application that shapes an attack is part of that attack: the attack's Beat plus the Aether.** Then complete Kara's roll in the example.

### D12. Infusion's minimum rule

**Approved (Gabriel, 2026-09-20).**

Principles 159 names Infusion (Mid Fragment, 25 IP) as "rides your ordinary actions at no Beat or Aether cost" and the Bestiary keys the Wraith's −10 to it; nothing says what it does. 25 IP is reachable inside the F-Grade book. **Recommendation:** define it in one paragraph: every Clash the character makes with the Principle's kind of force carries it (+5 where the Principle applies, counts as Principle-infused for creature rules, no cost, no Beat). Domains are D-Grade and stay a one-line promise.

### D13. Titles that grant free actions

**Approved (Gabriel, 2026-09-20).**

Titles 129 ("Your first attack of any combat does not consume a Beat") is a free action outside the Master rule that Core 272 says is the only one. **Recommendation:** reshape such titles as Beats ("gain 1 Beat on your first turn"), which is the sanctioned title shape (Core 272, "The Hungering Edge" at Titles 277), and delete the "only thing in the game shaped that way" sentence (V02-07).

### D14. Echoed titles and stat points

**Approved (Gabriel, 2026-09-20).**

Flat bonuses are applied once, the day they land (Titles 100); a replaced HVE-Resonant title becomes Echoed and "no longer mechanically active" (86). **Recommendation:** an Echoed title's stat points stay on the sheet (erase-and-rewrite has no memory of them; trust the paper); only its triggered and conditional effects stop. Points already lost to a cap stay lost. Conditional FOR and POW bonuses change Force and never Max HP or Aether.

### D15. Faction reputation

**Ruled (Gabriel, 2026-09-20): no formal reputation mechanic now.** Quests 130, 258, and 264 and `rules/quests.yaml` 49 use "+1 reputation" and "faction-tracked stat" as if a counter existed; 403 admits it does not. Fix: every consequence is stated qualitatively, in the quest's own words ("Standing with the Ashfall patrol improves"; "The faction's door closes for a season"; "Reputation drop" becomes "The issuing faction remembers the refusal"), and the Open Design Space entry keeps the deferral. Nothing is counted. **A.**

### D16. Reward bands

**Pending Gabriel; context in the 2026-09-20 chat.**

Quests 156 tells the GM to set a reward at "the top or bottom of that band"; the table has one number per cell. **Recommendation:** keep the single numbers and price the dial: exceptional performance pays half again, poor performance half. Alternative: cut the band sentence.

### D17. Resonance Shard disclosure

**Approved (Gabriel, 2026-09-20).**

Tutorial 666 and Items 239: "Say only that it resonates." The tutorial's own design note (1498) promises enough information to choose, and the scenario voice rule says hidden consequences of a player's own resource make the choice evidence of ignorance. **Recommendation:** the System identifies the kind, in its own units: *[Resonance Shard. Insight: +1 on meditation. Principle: undetermined.]* The exact Principle stays hidden; the trade (a shard now against insight later) becomes a real choice.

### D18. Skill Synthesis

**Approved (Gabriel, 2026-09-20).**

System AI 111: "Skill Crystals" exist nowhere else (Items has Skill Shards); permanence is unstated; "attach a limitation if the merged bonus lands above +20" prices outside the Modifier Budget it cites. **Recommendation:** sources are two or more Skill Shards or techniques; the result is permanent; the Modifier Budget caps it at +20 and the above-20 clause goes.

### D19. The Kith and the Civic tally (lore)

**Approved (Gabriel, 2026-09-20).**

Tutorial 77 has the Kith entering nineteen days ago; the Civic wall tally (923) has nineteen marks with the last three shorter; the Hidden Opportunity (941) says they lived there nineteen days and left three days ago. Two of the three can be true. **Recommendation:** sixteen days inside, gone three; the three short marks were cut by Kes, who came back each day to add one, which matches the Phase 2 Tally (453) and makes counting his habit. Lore file updated with whichever reading Gabriel takes.

### D20. Interpretation and the Kith (lore)

**Ruled (Gabriel, 2026-09-20), three facts the GM must hold:** the Kith do not have Interpretation; nobody inside the tutorial sector has it; humans (and Aru) outside the tutorial have it. The reason that produces all three from one setting fact, and makes it discoverable: Interpretation was added to the accession package after Oren's accession, so Kith never received it and do not receive it on Earth (the adopted version-drift quirk, in a form a Kith can tell you about); the tutorial sector runs that older version too, so nothing inside grants it; humans and Aru receive it at registration, the party included, past the gate. **One open point for Gabriel:** whether one holder is enough for both directions of a conversation. Recommendation: yes. Interpretation carries any deliberate message its holder is party to, so on Earth the party understands the Kith and the Kith understand the party through the party's faculty; otherwise every Kith scene on Earth runs one way, which the Day 3 beliefs and first-week wants in `lore/setting.md` do not support. Text lands in the tutorial's Arriving Initiates note (968), the Stinger, and `lore/setting.md` Interpretation and The Kith of Oren.

### D21. Came Back Whole's effect

**Approved (Gabriel, 2026-09-20).**

The kit card says the effect is the GM's to set; Titles and the tutorial name none. "Numbers, not adjectives." **Recommendation: +1 HRT, fixed**, so a Salvaged character who releases the title comes back one point stronger than before it (the −2 returns on release). Everywhere: `rules/titles.yaml`, the tutorial table, the kit card.

### D22. Numbers in the Bestiary's encounter guidance

**Approved (Gabriel, 2026-09-20).**

"Closer to quadrupling the danger", "near even odds of losing the whole party", "roughly doubles the danger" (60, lines 216 and 218) were asserted in the 2026-08-08 sim notes without figures; "a third longer" has them (2.3 to 3.1 rounds). The sim script is not in `tools/`. **Done 2026-09-20:** `tools/combat_sim.py`, data-driven from the rules yaml. Results (20,000 trials each): L1 standard TPK 0.2%, any-down 21%; Cornered raises whole-party loss two to four times at low body counts (0.2 to 0.8, 1.3 to 3.6, 1.5 to 4.3) and characters on the floor by about half; two peers to four against a party of four takes downs from 0.4 to 1.5 per fight and TPK from 1.3% to 27.5% at Level 1 (46.7% with four Snarljaws at Level 3); the Husk Sentinel with Yield runs 2.5 to 3.4 rounds and TPK 16% to 24%, so "stays about as dangerous" was wrong and the Bestiary now says the danger grows a little less than in step. The Bestiary's three sentences carry these numbers.

### D23. The memory-only sweep

**Pending Gabriel; context in the 2026-09-20 chat.**

ChatGPT suggests permitting private reminder words. The 2026-08-25 ruling stands (memory is the filter; no bookkeeping during play). **Recommendation: decline the change; add one sentence to Design Intent naming the accepted cost** (memory favours loud scenes and loud players).

---

---

## Chapter 1, Introduction

Gabriel writes this chapter; every rewrite here is his to make. Claude's read is given for each.

### ChatGPT's content findings, verbatim

**Content findings after cross-checking**

- **p. 3, Force explanation:** 'first two digits' is an approximation. Core Mechanics §2.6.3 explicitly permits lagging stats and Force 0. Suggested accurate short form: “Resolution converts each stat to a small Force value using the character’s Grade.”
- **p. 4, reading route:** Progression and What Can Be Seen are absent. Add these chapters to the GM reading route, with Quick Reference as a preparation aid.
- **p. 4, tutorial promise:** Replace “every mechanic” with “the starting characters’ core procedures.” Chapter15 defaults to two long sessions or four short ones, not the promised three; it does not teach every later-Grade procedure.
- **p. 4, teaching advice:** “Do not stop play to teach rules” and the single-sentence combat answer are too absolute. The example itself pauses to explain Yield, Momentum, and Exposed. Suggest: “Teach each rule when it becomes relevant, using the tutorial’s introduction schedule. Start with the basic roll, then explain the choices the player needs for the current action.”
- **pp. 6–7, example:** The Snarljaw’s listed Forces and HP match the Bestiary, and its Moderate reward is10VE. HP24 −12 −3 =9, then16 damage defeats it. No arithmetic correction is needed there.

**Preserve**

- “In this game, a build is a biography”: concise explanation, not empty gravitas.
- “Two characters can win the same fight and be offered different futures, because they won it differently”: concrete distinction central to the game.
- The System's opening status screen and the short survivor epigraph.
- Kara and Andre's dialogue, especially “What does a big one give?” / “Don’t.” It shows different attitudes without explaining them to death.

### What the source says, verified

| Item | What the source says |
|---|---|
| Reading route | `00-introduction.md` 60 to 70: six numbered items; Progression and What Can Be Seen absent. |
| Sessions | 69 "your campaign's first three sessions"; tutorial 23 "usually takes two sessions", 38 "Two sessions of three and a half to four hours is the default", 40 "Four sessions of two hours". |
| Level 2 | 85 "Kara ... and Andre ... are Level 2"; 103 "your 14 HP"; the numbers equal the Level 1 pregens in `rules/character.yaml` 164 to 184, and nothing places the five Level 2 points. |
| Kara's reason | 105 "It's not getting my whole turn. One Beat." |
| Snarljaw arithmetic | ChatGPT checked it: HP 24 − 12 − 3 = 9, then 16 defeats it; matches the Bestiary. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 1.1 | Reading route omits Progression and What Can Be Seen | CONFIRMED (60 to 70) | **A:** Progression joins item 1; What Can Be Seen joins item 3; the Quick Reference named as the table aid. |
| 1.2 | "first three sessions" | CONFIRMED (69) against tutorial 23 and 38 | **A:** "first two sessions, or four short ones". |
| 1.3 | "introduces every mechanic in play" | CONFIRMED overclaim | **EDIT:** "introduces the rules of pre-class play, phase by phase". |
| 1.4 | "Do not stop play to teach rules" | CONFIRMED against the tutorial's "explain a rule when a player needs it to choose" (1486) | **EDIT:** align to the tutorial's principle; keep the combat one-liner. |
| 1.5 | "first two digits" Force shorthand | PARTLY (lagging stats pad with zeros) | **C:** the Introduction may approximate; Core defines. |
| 1.6 | Kara and Andre "are Level 2" with Level 1 pregen numbers (85, 103) | CONFIRMED | **B:** make them Level 1, or show the five held points. Recommendation: Level 1. |
| 1.7 | Snarljaw arithmetic in the example | NOT CONFIRMED as a defect; ChatGPT checked it and it holds | none |

### Rewrites

**V01-01** · p. 2, opening description, optional tightening
- Original: “ordinary people pulled into a multiverse that keeps score, where every level is paid for in blood and sweat, quests arrive in cold blue status screens, and the only deal on offer is grow, or die.”
- ChatGPT: A good central image ('a multiverse that keeps score') is followed by three familiar promotional flourishes. 'Every level' and 'only deal' also overstate a game that offers several advancement paths.
- Suggested: “ordinary people pulled into a multiverse that keeps score. Quests appear on blue status screens, and characters gain power by surviving, exploring, and overcoming challenges.”
- ChatGPT adds: Keep the original if this is deliberately jacket-copy intensity; it is less suitable as the model for rules prose.
- Claude: **DECIDE.** Jacket copy on the opening page is a choice; the rules voice begins at 1.1. Claude would keep it.

**V01-02** · p. 2, §1.1, clearer explanation
- Original: “Neither god nor villain, it is an adaptive construct that discovers stable patterns of reality by putting conscious agents under pressure and recording what they do.”
- ChatGPT: 'Conscious agents' shifts into research language, and 'neither god nor villain' supplies a judgment rather than explaining its behavior.
- Suggested: “It studies how people respond to pressure, looking for stable patterns in their actions and in reality itself.”
- ChatGPT adds: If its construct nature is necessary here, retain “The System is an adaptive construct” before this sentence. Do not quietly change the setting's explanation of its purpose.
- Claude: **EDIT.** Keep the construct, cut the frame: “The System is an adaptive construct. It finds the stable patterns of reality by putting people under pressure and recording what they do.” Matches `lore/setting.md`, Purpose.

**V01-03** · p. 3, §1.2, identify the player option
- Original: “The track rewards talking through what a character has learned, and it plays at full strength without a word of it.”
- ChatGPT: 'It' changes referent, and the apparent contradiction makes the Quiet Path harder to understand.
- Suggested: “Players can describe what their characters have learned or use the Quiet Path procedure; both offer full access to Principle progression.”
- ChatGPT adds: §5.11 confirms the same tier and mechanical benefits; this replacement preserves the Quiet Path.
- Claude: **EDIT.** Name the mechanism: “The track rewards talking through what a character has learned, and the Quiet Path plays it at full strength without a word of it.”

**V01-04** · p. 3, Recognition bullet, name the benefit
- Original: “a Breakthrough: a ritual gamble that lifts every ceiling at once.”
- ChatGPT: 'Every ceiling' does not identify what changes and risks implying simultaneous advancement across all tracks.
- Suggested: “a Breakthrough: a risky ritual that advances the character to the next Grade and raises their stat caps.”
- Claude: **DECLINE.** “Lifts every ceiling at once” is true: every cap goes tenfold. Optionally “lifts every ceiling tenfold”.

**V01-05** · p. 4, §1.4, remove circular emphasis
- Original: “knowing that changes nothing, because the System is watching either way.”
- ChatGPT: Circular justification; it does not explain the boundary between public rules and private logs.
- Suggested: “Players may read how the Hidden Vector Engine works. Keep each character’s scored behavior log private.”
- ChatGPT adds: The following sentence, 'Scored behavior stays honest only while the scoring stays out of sight,' can become “Keeping scores private discourages players from choosing actions solely to raise a particular score.” This states the design intention without pretending it guarantees honest behavior.
- Claude: **EDIT.** ChatGPT's two plain sentences, and the second one as “Keeping the scores private discourages players from choosing actions to move a score.” The “stays honest only while” closer goes.

**V01-06** · p. 5, §1.7, simplify the explanatory metaphor
- Original: “They are a camera, and the camera serves the story. A Zone is a piece of story geography; a Beat is a slice of dramatic time.”
- ChatGPT: The camera metaphor does little work; the next two terms can be defined directly.
- Suggested: “Zones divide a scene into useful areas, and Beats measure how much a character can do on a turn. Neither has a fixed length in meters or seconds.”
- ChatGPT adds: Keep the later advice about whether an exploit makes the table 'lean in or check out': it is conversational and gives the GM an observable criterion.
- Claude: **DECLINE and APPLY.** Keep the camera (it is canon in the design philosophy); add the literal definitions after it: “Zones divide a scene into useful areas, and Beats measure how much a character can do on a turn. Neither has a fixed length in meters or seconds.”

**V01-07** · p. 7, GM bookkeeping after example, high-value change
- Original: “(And in the GM’s memory, where nobody can see it: Kara took the ambush head-on and gave one Beat rather than be moved, then asked what a bigger kill pays. Andre counted himself among the numbered, and told her to leave it alone. Both moments will still be there at the end of the session, which is when the Engine gets them.)”
- ChatGPT: The parenthetical performs secrecy instead of explaining what to record. 'Counted himself among the numbered' abstracts a clear line of dialogue; 'the Engine gets them' is cryptic. The rewrite should retain the memory-based procedure rather than quietly introduce live bookkeeping.
- Suggested: “At session end, the GM recalls Kara standing her ground during the ambush and asking about the reward for a larger kill, and Andre discouraging further exploration. The GM considers these decisions during the Hidden Vector Engine sweep.”
- ChatGPT adds: Chapter10 deliberately uses memory rather than live notes. The replacement preserves that procedure; allowing live notes would be a separate design recommendation, not a voice correction.

The original 'rather than be moved' should be reconsidered: Kara's stated reason was keeping a Beat, and an editor should not convert that into a different motivation.
- Claude: **EDIT.** Kara's stated reason (line 105) was keeping a Beat, so the motive goes: “(The GM writes nothing down. At session end they will still remember Kara taking the ambush head-on and giving one Beat to keep her ground, then asking what a bigger kill pays, and Andre telling her to leave it alone. Those moments go to the Engine at the sweep.)”

**V01-08** · p. 7, final summary, correct the slogan
- Original: “That is the whole loop: fiction first, one roll, numbers that mean something, and a System quietly observing what each of you is becoming.”
- ChatGPT: The example contains many rolls, including opposed rolls; 'numbers that mean something' is self-praise rather than information.
- Suggested: “Describe an action, resolve it with the relevant roll, and apply the result. At session end, the GM reviews the characters’ choices to help shape future System rewards.”
- ChatGPT adds: ### Content findings after cross-checking

- **p. 3, Force explanation:** 'first two digits' is an approximation. Core Mechanics §2.6.3 explicitly permits lagging stats and Force 0. Suggested accurate short form: “Resolution converts each stat to a small Force value using the character’s Grade.”
- **p. 4, reading route:** Progression and What Can Be Seen are absent. Add these chapters to the GM reading route, with Quick Reference as a preparation aid.
- **p. 4, tutorial promise:** Replace “every mechanic” with “the starting characters’ core procedures.” Chapter15 defaults to two long sessions or four short ones, not the promised three; it does not teach every later-Grade procedure.
- **p. 4, teaching advice:** “Do not stop play to teach rules” and the single-sentence combat answer are too absolute. The example itself pauses to explain Yield, Momentum, and Exposed. Suggest: “Teach each rule when it becomes relevant, using the tutorial’s introduction schedule. Start with the basic roll, then explain the choices the player needs for the current action.”
- **pp. 6–7, example:** The Snarljaw’s listed Forces and HP match the Bestiary, and its Moderate reward is10VE. HP24 −12 −3 =9, then16 damage defeats it. No arithmetic correction is needed there.
- Claude: **EDIT.** “That is the whole loop: fiction first, one roll per action, and a System observing what each of you is becoming.”

## Chapter 2, Core Mechanics

### ChatGPT's content findings, verbatim

**Content corrections and questions:**

1. **pp.25–26, Grade-gap example:** FOR120 means240 HP, not120. A130-damage hit against80 Max HP causes Downed, not instant death; the annihilation threshold is800. Similarly, the next hit on the198-HP example causes Downed unless another rule applies. Correct these before using the example to explain lethality.
2. **pp.10,29, Surge:** global round-down conflicts with an explicitly rounded-up cost. Add “unless a rule says otherwise.” With odd Max Aether, two Surges are unaffordable from a full pool: at5, each costs3. Replace the universal two-Surge claim with the correct odd/even explanation or change the cost rule deliberately.
3. **pp.18,28, Aura:** “one Beat or zero” conflicts with the defined Suppressed result of one Beat. State when zero occurs, if ever. Also define Yield's available budget under Suppression and under a genuine third-Beat feature.
4. **pp.19–20, Flanking:** flanking is listed as a reason to assign Exposed, then grants each hostile+10. Confirm whether it normally creates a20-point swing or only the explicit+10 flanking bonus.
5. **pp.21–23, Yield:** specify whether the Margin after Yield controls Driven Back/Exposed or only damage, and that spent next-turn Beats cannot be spent again against subsequent attacks.
6. **p.17, Momentum:** with multiple qualifying shifts in a round, which wins? With three sides, what order do the remaining sides use after the new leader moves first?
7. **p.15, Marks:** clarify whether Master requires10 cumulative Marks or10 additional after Seasoned, whether cascades grant one Mark or several, and whether a defensive weapon use receives its Proficiency bonus and Marks.
8. **pp.28–29, Aether:** lore suggests refinement requires VE. State explicitly whether a character with0 stored VE can Consolidate to regain Aether and HP.
9. **p.20, free strikes:** if several hostiles share the Zone, does each get a strike, and is there a per-round limit? Spell out interaction with forced movement from Driven Back as well as Yield.
10. **p.30, attrition example:** Infusion, free Master actions, and features granting extra Beats can invalidate “two kills a turn.” Frame this as an example of a character with two single-target attacks, not a universal upper bound.

**Preserve:** the first epigraph's 'learned this with my face'; the distinction between free movement and paying to change position; examples explaining why to drive an enemy away from an ally or doorway; the clear no-damage-on-defense rule.

### What the source says, verified

| # | Verdict | Evidence (`10-core-mechanics.md` unless named) | rules data |
|---|---|---|---|
| Surge | CONFIRMED | 31 "all fractions round down, always"; 541 "spend half your Maximum Aether, rounded up"; 546 "Two Surges empty a full pool". Andre has Max Aether 5 (`15-character-creation.md` 217): each Surge costs 3, the second is unaffordable. Kara (POW 6) works only because 6 is even. | `grades.yaml` 4 rounding down; `combat.yaml` 82 rounded up; engine `surge_cost` uses `math.ceil`; `fixtures/character.yaml` 17 Andre max_aether 5. |
| Aura | PARTLY | 274 "reduces a character to one Beat or zero"; 503 "Suppressed, dropping from 2 Beats to 1"; 507 "Spending a Beat, if they have one". No passage says when zero occurs. Yield under Suppression: SILENT (276 and 392 assume two next-turn Beats). Third Beat: 272 says such features "say so explicitly". | `combat.yaml` 79 suppressed_beats 1; 58 max_beats 2 for Yield. |
| Flanking | CONFIRMED (double-listed, no combining rule) | 297 Exposed is "caught in the open, flanked, or off balance: −10"; 311 "every one of those hostiles gains +10". Bestiary 68, 94 and Quick Reference 20 apply only +10. | `resolution.yaml` 55 Flanking +10 Standard; Exposed not keyed to flanking in data. |
| Yield | SILENT on Driven Back; PARTLY on re-giving | 390 "once the Margin is known and before damage is applied"; 397 "Damage is the remaining Margin"; 363 Driven Back "if the attacker wins by 40 or more". Nothing says whether the reduced Margin also cancels Driven Back or Exposed. 392 "two is all you have to give"; 276 "yielded twice since their last turn has no Beats". | `combat.yaml` 56 to 62, no ordering. |
| Momentum | SILENT | 248 to 254 three triggers, no precedence; 246 multi-faction order "highest to lowest, until a Shift fires"; nothing on order after a shift. | `combat.yaml` 23 to 26 triggers only. |
| Marks | PARTLY / SILENT | 176 "3 Marks: Trained becomes Seasoned"; 177 "10 Marks: Seasoned becomes Master", "banks Marks past 10"; 178 unheld-domain Marks "are spent in the granting". One tally implied, never stated. 170 marks per triggering roll; 200 "Each new die can cascade"; no statement on extra dice. Defensive use: 151 "+5 to Clashes and skill checks in the domain". | `character.yaml` 96, 99 marks_required 3 and 10; 104 trigger "a Clash or skill check". |
| Aether at 0 VE | SILENT | 535 "refills only through Consolidation, restoring in full when the first hour of the rest completes"; 521 "Waiting gives you nothing to refine." `25-cultivation.md` 55 "The minimum is 1 hour ... however little VE needs processing". | `cultivation.yaml` 34 minimum_hours 1; engine runs at 0 VE. |
| Free strikes | PARTLY | 309 "that enemy gets a free strike" (singular). 395 "Forced movement provokes no free strike" (two-Beat Yield). Driven Back's drive: Core silent; Quick Reference 24 "(no free strike)". | `combat.yaml` 33, 60. |
| Attrition | NOT CONFIRMED as universal | 573 sits inside a worked case: "A D-Grade warrior facing an F-Grade horde ... two Beats a turn is two kills a turn". | none |
| Grade-gap example | CONFIRMED, plus an HP error | 464 "FOR 120: Force 12, plus 100 for the gap, effective 112"; 466 "20 damage against 120 HP" (FOR 120 is 240 HP by 83; Quick Reference 156 has 240); 468 "162 against 149, Margin 13 ... 130 damage", "survives at 68 and dies to the next one", "FOR 40 and 80 HP is simply dead" (439 says the same blow leaves that scout "Downed and counting"). No offensive Attribute for the E-Initiate. | `fixtures/core-mechanics.yaml` 149 att_force 12; `fixtures/quick-reference.yaml` 33 F-Peak 198 HP. |
| STR anchors | CONFIRMED | 61 "STR 8 is a competitive collegiate powerlifter, STR 9 a professional strongman"; `15-character-creation.md` 56 STR 9 "College shot-putter", STR 10 "World-record deadlifter". | `character.yaml` 51 carries the shot-putter anchors; Core's sentence is prose only. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 2.1 | Grade-gap example | CONFIRMED | **A** (F3). |
| 2.2 | Surge rounding | CONFIRMED | **B** (D1). |
| 2.3 | Aura "one Beat or zero" (274); Yield budget under Suppression and third Beats | PARTLY; SILENT | **A:** "to one Beat; a combatant with one Beat is reduced to none." Yield: "you may give every Beat your next turn will have, and no more" (one while Suppressed, three with a third Beat). |
| 2.4 | Flanking listed as an Exposed condition (297) and as its own +10 (311) | CONFIRMED | **A:** drop "flanked" from the Exposed examples; Flanking is the +10 and nothing else. |
| 2.5 | Yield and Driven Back; Beats given twice | SILENT; PARTLY | **A:** the reduced Margin is the Margin for everything, damage and the 40+ triggers alike; Beats already given this round are gone. |
| 2.6 | Momentum: two triggers in a round; three sides after a shift | SILENT | **B:** recommend "the last trigger in the round wins" and "the new leader acts first; the other sides keep their order". |
| 2.7 | Marks: cumulative 10; one Mark per cascade or per die; defensive weapon use | PARTLY; SILENT; SILENT | **A:** "10 Marks in all"; "one Mark per roll, however many dice". Defensive use: leave to the domain rule (a Clash in the domain). |
| 2.8 | Consolidation at zero VE | PARTLY | **A** (F3). |
| 2.9 | Free strikes from several hostiles; Driven Back's drive | SILENT; Quick Reference says no free strike, Core is silent | **B:** recommend one free strike per engaging hostile (Disengage exists for a reason). **A:** copy "no free strike" on Driven Back into Core. |
| 2.10 | "two kills a turn" | NOT CONFIRMED as a universal claim; it sits inside a worked case | **C.** |
| 2.11 | STR 9 calibration differs from Character Creation (61 against 15:56; the yaml carries the shot-putter) | CONFIRMED | **A:** align Core's sentence to the data. |

### Rewrites

**V02-01** · p.9
- Original: “Everything in this game resolves the same way”
- ChatGPT: “Most uncertain actions use d100 plus the relevant Force, compared with an opponent’s total or a fixed Resistance.” The current claim erases automatic successes and specialist procedures before readers encounter them.
- Claude: **EDIT.** “Every roll in this game resolves the same way.” True, and it keeps the punch; ChatGPT's “most uncertain actions” hedges.

**V02-02** · p.9
- Original: “every number that touches dice stays between 1 and 99”
- ChatGPT: “Force values stay small even as raw stats grow. Grade differences and other modifiers are applied separately.” Force may be zero; Resistance can be165 and the Grade adjustment100+. This is misleading compression, not merely style.
- Claude: **EDIT.** “Force stays at two digits at every Grade; Grade differences are added separately.”

**V02-03** · p.11
- Original: “Progression covers the pre-class years in detail”
- ChatGPT: “Progression covers Levels 1–9 in detail.” 'Years' introduces an unsupported fictional timescale.
- Claude: **APPLY.** “Levels 1 to 9”.

**V02-04** · p.12
- Original: “Forty is the swing number throughout these rules: win by 40 and the outcome is decisive, whatever the arena”
- ChatGPT: “A Margin of 40 triggers several major outcomes, described below.” Not every procedure has the same threshold or effect.
- Claude: **DECLINE.** The Rule of 40 is the design, and the sentence is accurate across Clash and skill checks.

**V02-05** · p.15
- Original: “which is how scavenged junk becomes a fourth Proficiency”
- ChatGPT: “Repeated use can therefore earn a new Proficiency.” The object does not become a Proficiency. The rest of this paragraph already explains the example.
- Claude: **EDIT.** “which is how three Marks with scavenged junk become a fourth Proficiency”.

**V02-06** · p.15
- Original: “The ancient script does the thing it warned about”
- ChatGPT: “Misreading the warning activates the ward.” A catastrophic-failure example benefits from naming the cause and consequence. Adjust the specific event to fit the intended fiction.
- Claude: **EDIT.** “Misreading the warning sets off the ward it describes.”

**V02-07** · p.18
- Original: “it is the only thing in the game shaped that way”
- ChatGPT: delete. An unnecessary promise about every present and future ability. The preceding sentence already distinguishes a free action from a Beat.
- Claude: **APPLY.** Delete. D13 needs it gone as well.

**V02-08** · p.21
- Original: “Tactical Modifiers all draw from one budget”
- ChatGPT: “Use these ranges when assigning Tactical Modifiers.” 'Budget' suggests a shared total limit; this table gives individual modifier sizes. If a total cap is intended, specify it separately.
- Claude: **DECLINE.** “Modifier Budget” is the book's term for the closed set of sizes; ChatGPT read it as a shared total. Optionally “one scale”.

**V02-09** · p.23
- Original: “before the Grade multiplier reaches it”
- ChatGPT: “before multiplying the remaining Margin by the attacker’s Grade multiplier.” The calculation should be literal.
- Claude: **APPLY.**

**V02-10** · p.26
- Original: “An average exchange gives 162 against 149”
- ChatGPT: “For example, rolls of 50 produce totals of 162 and 149.” A single selected roll pair is not the average outcome of opposed exploding dice with Yield choices.
- Claude: **APPLY.** Same fix in Quick Reference example 3.

**V02-11** · p.28
- Original: “you have to be standing to lift someone”
- ChatGPT: delete. The stated restriction—an intervening ally cannot be Suppressed—is sufficient. The slogan could imply a prone ally cannot help.
- Claude: **APPLY.** Delete the closer.

**V02-12** · p.28
- Original: “Aether is what you have. Volatile Energy is what you took”
- ChatGPT: “Aether powers your abilities. VE must be refined before it contributes to growth.” The original distinction is false: characters also possess stored VE and can absorb it environmentally.
- Claude: **DECLINE.** A first definition in lore terms (VE is Aether wearing the shape of what held it last); the closer rule covers restatements only.

**V02-13** · p.28
- Original: “Cultivation owns the VE economy in full”
- ChatGPT: “See Cultivation for earning, storing, and refining VE.” Give the reader a useful destination.
- Claude: **APPLY.**

**V02-14** · p.29
- Original: “asking the same question every time”
- ChatGPT: delete, or “It remains available even when a character has no suitable Application.” The question is never stated.
- Claude: **EDIT.** State the question: “asking the same question every time: is this roll worth half your pool?”

**V02-15** · p.30, optional
- Original: “By D-Grade it is pennies”
- ChatGPT: “By D-Grade, its cost is a small fraction of most Aether pools.” Keep a conversational comparison only if it does not overpromise for characters with low POW.
- Claude: **DECLINE.** The line prices a Seed Application's fixed 10 against a D-Grade pool, which is true.

**V02-16** · p.30
- Original: “They win the encounter and cannot keep winning encounters without rest”
- ChatGPT: “Using costly area effects can deplete their Aether even when individual enemies pose little threat.” The original guarantees both victory and exhaustion, neither of which follows from the rules.
- Claude: **EDIT.** “They win the encounter and have no Aether for the next one.”

## Chapter 3, Character Creation

### ChatGPT's content findings, verbatim

**Content checks:** p.34's STR9 'college shot-putter' does not match p.11's STR9 'professional strongman' and STR8 'competitive collegiate powerlifter.' Use one illustrative calibration rather than implying precise equivalence among sports. The POW table's pre-System uncanny experiences introduce a setting fact; keep only if pre-Integration supernatural signs are intentional. State how Earth knowledge proficiencies apply to alien languages, flora, and machinery. All three premade point totals and HP/Aether values check out. Explain that the Level2 introduction characters have advanced from these Level1 sheets, or show their changed statistics/held points where relevant.

**Preserve:** 'making a thing work with the wrong materials, briefly'; 'keeping a story straight'; both epigraphs; the premades' distinct practical motivations.

### What the source says, verified

| # | Verdict | Evidence |
|---|---|---|
| STR anchors | CONFIRMED | See Chapter 2's last row. |
| POW table | CONFIRMED (table); SILENT (setting) | `15-character-creation.md` 60 POW row: "Never notices the uncanny / Occasional gut feelings / Vivid dreams that sometimes land / The family everyone called witches / The monastery would have taken them", under a heading that says anchors are "in pre-Integration human terms" (51). Same text at `rules/character.yaml` 55. `lore/setting.md` has no statement about pre-Integration supernatural signs. |
| Earth Proficiencies | SILENT | Neither 15 nor 10 addresses alien languages, flora, or machinery. 15:69 "A Proficiency covers weapons in its domain"; 15:123 ancient languages = "Dead scripts, inscriptions, and their conventions". `lore/setting.md` 141: Interpretation translates alien language; 143 "converts no computer protocols and supplies no scientific expertise". |
| Pregens | CONFIRMED correct | Kara HP 14 / Aether 6, Joe 14 / 4, Andre 10 / 5 (15:188 to 218) match `rules/character.yaml` 164 to 184 and the fixtures. |
| Aether single digits | CONFIRMED | 15:155 "Aether is single digits"; 15:21 "maximum of 10"; 15:149 "Max Aether: Equal to your Raw POW"; the Aspiring Cultivator spread has POW 10 (15:42). `rules/character.yaml` 29 min_per_stat 3, 30 max_per_stat 10. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 3.1 | STR calibration | CONFIRMED | **A** (2.11). |
| 3.2 | POW table's pre-Integration uncanny experiences (60; `rules/character.yaml` 55) | CONFIRMED as a setting fact; the lore file is silent | **B:** keep and add to `lore/setting.md` (Cultivation readiness), or cut. Recommendation: keep. |
| 3.3 | Earth Proficiencies against alien languages, flora, machinery | SILENT; Interpretation covers language (`lore/setting.md` 141) | **B:** one sentence: a Proficiency is a method and works on its alien counterpart at the same tier; language is Interpretation's. |
| 3.4 | Pregens against the data | CONFIRMED correct | none |
| 3.5 | "Aether is single digits" (155) against POW 10 | CONFIRMED | **A:** "Starting Aether is 3 to 10." |

### Rewrites

**V03-01** · p.33, optional
- Original: “bodies and minds that are failing, and the System integrates them all the same”
- ChatGPT: “Scores of1 and2 represent limitations below the starting-character range; NPCs may have these scores.” The original mixes a rules clarification with a portentous aside. Preserve universal Integration in setting text if needed.
- Claude: **DECLINE.** Grounded texture in a table note; Gabriel's call.

**V03-02** · p.34, HRT10
- Original: “Unbreakable under interrogation”
- ChatGPT: “Maintains resolve under extreme coercion.” 'Unbreakable' reads as immunity that the dice rules do not confer.
- Claude: **DECLINE.** Table anchors are calibration prose; “World-record deadlifter” sits beside it.

**V03-03** · p.38
- Original: “Aether is single digits”
- ChatGPT: “Starting Aether ranges from3 to10.” POW10 is explicitly allowed.
- Claude: **APPLY.** “Starting Aether is 3 to 10.”

**V03-04** · p.38
- Original: “whatever they built” / “surviving hard things”
- ChatGPT: “regardless of their starting Attributes” / “the experiences they have in play.” These replacements make the progression explanation more specific.
- Claude: **EDIT.** Take ChatGPT's two specifics: “regardless of their starting Attributes” and “what they survive in play”.

**V03-05** · p.38
- Original: “See the Principles document”
- ChatGPT: “See The Principle System, Chapter5.” Remove the leftover reference to a separate source document.
- Claude: **APPLY.** “See The Principle System.”

**V03-06** · p.40, optional
- Original: “Her generosity is real, and it is never first”
- ChatGPT: “She can be generous, but usually considers her own reward first.” Keep if wanted as character voice; it is an aphoristic ending, not a procedural failure.
- Claude: **DECLINE.** Pregen character voice.

**V03-07** · p.41, optional
- Original: “When the party gets loud, he is the one counting”
- ChatGPT: “When the others argue, he checks supplies and escape routes.” Specify what Andre does if this is intended as roleplaying guidance.
- Claude: **DECLINE.** Optionally “counting exits”.

## Chapter 4, Progression

### ChatGPT's content findings, verbatim

**Content questions:** The book's class-generation framework is explicitly unfinished at the first major promised milestone. Define a playable minimum or clearly delimit this edition's supported campaign range. Specify who can hold which points: the free two only, or also the three System-assigned points? At Level10, does class selection precede that level's normal allocation? At a Breakthrough, does reaching Level26 cost1200 VE after the ritual, or come with the Grade change? These are sequencing questions, not requests to redesign progression.

**Preserve:** the healer and gardener epigraphs; the split-allocation examples; the direct description of leveling during rest.

### What the source says, verified

| # | Verdict | Evidence |
|---|---|---|
| "Every kill ... adds VE" | CONFIRMED overclaim | `17-progression.md` 21. Exclusions: `25-cultivation.md` 116 "A victim below your Grade pays nothing"; `rules/cultivation.yaml` 61 sub_grade_kill 0. Treasures: 25:131 cores pay "VE awarded once, when consumed ... treasures that raise an Attribute permanently are a separate category"; `65-items.md` 116 "An Attribute Treasure never touches stored VE at all". "Ordeal" maps to Session Survival 5 (25:124). |
| Level 9 table | CONFIRMED correct | Eight level-ups: 3×8 = 24, 2×8 = 16, 40 + 24 + 16 = 80 (17:63 to 70, rendered from `rules/character.yaml` 70 to 74). |
| Held points | SILENT on the split | 17:32 "Freshly earned points arrive unallocated and sit there until the character spends them" applies to all five; nothing distinguishes the 3 GM points (17:29) from the 2 free (17:30). `rules/character.yaml` 64 points_can_wait true, no split. |
| Level 10 order | PARTLY (implied) | 17:29 "From Level 10 onward, the class's stat profile assigns them instead"; 17:78 to 80 put class selection first. No sentence says Level 10's own points wait for the selection. |
| Level 26 | SILENT (two readings) | 17:86 "leveling resumes at Level 26 at the E-Grade cost per level"; 25:79 "Entering E-Grade (and Level 26) requires a Grade Breakthrough ... It is not an automatic level-up." `30-breakthroughs.md` never mentions Level 26; the ritual burns the banked VE (30:84). |
| Class framework | CONFIRMED | 17:76 "The class generation framework is still in development and will appear in a later revision of this book." `45-system-ai.md` 54 to 74 has Class Generation with In/Out, an Unplugged procedure (58), and a prompt (62 to 74). |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 4.1 | "framework still in development" (76) while System AI 54 to 74 has the procedure | CONFIRMED | **A:** point at System AI's procedure as the interim method. The full framework is the classes project. |
| 4.2 | Which points can be held | SILENT (32 applies to all five) | **A:** the three System points are placed when the level lands; the two free points may wait. |
| 4.3 | Level 10 order | PARTLY (implied at 78 to 80) | **A:** class selection first, then Level 10's points from the class. |
| 4.4 | Level 26 | SILENT | **B** (D3). |
| 4.5 | Level 9 table | CONFIRMED correct | none |

### Rewrites

**V04-01** · p.43
- Original: “Every kill, completed quest, survived ordeal, and absorbed treasure adds VE”
- ChatGPT: “Eligible kills, quests, survival awards, and some treasures grant VE.” Later chapters exclude lower-Grade victims and distinguish fuel treasures from other items.
- Claude: **EDIT.** “Kills at or above your Grade, completed quests, session survival, and consumed cores add VE to the character's stored pool.”

**V04-02** · p.44, optional
- Original: “holding them is a real cost paid for a real option”
- ChatGPT: “Holding points delays their benefits but lets the player allocate them after seeing what the character needs.” Explain the tradeoff without balanced rhetorical phrasing.
- Claude: **EDIT.** “Holding points delays their benefit and keeps the choice open until the character knows what they need.”

**V04-03** · p.44
- Original: “a body headed for Breakthrough ends up broader than the obsession that built it”
- ChatGPT: “Once a favored stat reaches its cap, further level-up points improve other Attributes.” Strong example of a straightforward rule turning into a pronouncement.
- Claude: **APPLY.**

**V04-04** · p.45
- Original: “This is the Hidden Vector Engine’s primary mechanical lever during F-Grade”
- ChatGPT: “This is how behavioral observation affects stat growth before Level10.” The actual behavior-assigned period ends well before F-Grade does.
- Claude: **EDIT.** “This is how behavioral observation shapes stat growth before Level 10.”

**V04-05** · p.45, heading
- Original: “What Nine Levels Produce”
- ChatGPT: “Your Stats at Level9.” The calculation contains eight level-ups; the table itself is correct.
- Claude: **EDIT.** Heading: “The Sheet at Level 9”.

**V04-06** · p.46
- Original: “The GM no longer assigns the fixed portion. The class does”
- ChatGPT: “Use the selected class’s fixed allocation for the three System points.” One clear instruction replaces an ornamental contrast.
- Claude: **APPLY.** X-not-Y.

**V04-07** · p.46
- Original: “the stat allocation lever now belongs to the class”
- ChatGPT: delete after the revised procedure; it repeats the same information.
- Claude: **APPLY.**

## Chapter 5, The Principle System

### ChatGPT's content findings, verbatim

**Content questions:**

1. IP is labeled **cumulative**, but Kara's sheet says “10/10 spent into Seed.” Specify whether totals persist; retain the cumulative total if that is intended. Explain IP after losses and successful Fusion.
2. Initial Insight crystallizes automatically at3 IP, contrary to the unqualified “Meeting an IP threshold does not advance the tier.” State that Distillation is required from Seed onward. Correct the p.49 diagram too: it currently includes3 IP among the Distillation thresholds.
3. Resolve IP assignment when one experience fits two Principles, whether awards can stack for a single event, and whether a Battle Memory is consumed after one meditation. Otherwise the claims about dividing attention have no enforceable basis.
4. Define the minimum usable Infusion and Domain procedure: effect, area, duration, activation, resistance, and limits. A price and evocative description cannot substitute for these core grants.
5. Clarify whether attack Applications include the attack in their1-Beat cost or buff a later attack. Kara's Sudden Weight example should demonstrate the complete roll.
6. Attunement's 'comfortable' in extreme heat and knife-storms needs a boundary: sensory comfort, environmental protection, and damage immunity are materially different.
7. Fusion: which IP total survives, what happens to existing Applications, what happens below a tier threshold, and does a failure's10-IP loss have a floor? If both parents are the same tier, which loses IP?
8. First Principle naming is lifelong and GM-controlled. Give a brief procedure for correcting a mistaken reading with the player before locking the slot. Quiet Path veto at later Distillation does not explicitly cover crystallization.

**Preserve:** the old cultivator sensing the coal; the two different Fire expressions; most of Kara's conversation; the Quiet Path's acceptance of players who do not enjoy philosophical speeches; the concrete Axiom locations.

### What the source says, verified

| # | Verdict | Evidence (`20-principles.md` unless named) | rules data |
|---|---|---|---|
| 1 IP cumulative | PARTLY; post-Fusion SILENT | 154 header "Cumulative IP"; 83 "Insight: 10/10 spent into Seed."; 163 "IP accrues normally past 100"; 204 Refinement "same slot, same tier, same IP"; 257 fused Principle "at the lower parent's tier", no IP stated. | `principles.yaml` 17 to 22 cumulative_ip; 55 success "at the lower parent's tier", IP unstated. |
| 2 Three IP | CONFIRMED | 136 "At 3 IP, the Principle crystallizes."; 75 crystallized mid-meditation, no Distillation; 183 "Meeting an IP threshold does not advance the tier."; 156 ladder lists Initial Insight at 3. Diagram: 35 `./assets/principle_loop.png`, empty alt; `book/assets/principle_loop.svg` 43 "at 3 / 10 / 25 / 50 / 100 IP" under INSIGHT POINTS, before DISTILLATION (svg 47). | `principles.yaml` 25 crystallizes_at_ip 3; 26 advancement_requires_distillation true. Fixture expects Initial Insight at 4 IP. |
| 3 Assignment, stacking, one use | SILENT; allowed; stated in T and K only | 93 "toward the Principle the memory most closely expresses"; 137 "How the player describes their meditations shapes which Principle a memory feeds." Tutorial 1080 "A card converts to IP once, at this meditation; the +1 IP some triggers award on the spot ... is a separate award." Tutorial 411, 877 events are both +1 IP and a Battle Memory trigger. Kit 1076 "IT CONVERTS AT A CONSOLIDATION AND IS SPENT WHEN ITS IP IS AWARDED." | `principles.yaml` 29 meditation 1 to 3; no assignment rule. |
| 4 Infusion and Domain | CONFIRMED | Infusion: 159 "rides your ordinary actions at no Beat or Aether cost"; 237 spell-plus-Application "requires Infusion tier"; Bestiary 170 "an active Principle infusion". Domain: 160 "a zone where your Principle is briefly law"; 163 D-Grade gate; 222 "3,000 + 500 per round held". No area, duration cap, activation, resistance, or limits anywhere. | `principles.yaml` 21, 22, 47. |
| 5 Attack Applications | SILENT on the Beat; no complete roll | 212 "costing 1 Beat plus Aether." Core 260, 264 list "Attack" and "Activate a Principle Application" as separate Beat actions. 81 "her strike lands with the mass of something far larger, +10 to the Clash": reads as the strike itself; no d100, Resistance, or Margin shown. | `principles.yaml` 48 application_cost_beats 1; 44 Seed 10. |
| 6 Attunement | CONFIRMED unquantified | 245 "You are comfortable in environments the Principle dominates (extreme heat, knife-storms of debris, warped space)." 247 "Attunements are fictional capability rather than combat mechanics". | no yaml entry. |
| 7 Fusion | SILENT on the surviving IP, the fate of old Applications, sub-threshold results, a failure floor, the tie | 257 "at the lower parent's tier, occupying one slot. The System generates its Applications from both parent identities." 258 "The higher-tier parent loses 10 IP"; a Seed parent at 10 IP would reach 0. "Higher-tier parent" undefined when tiers match. | `principles.yaml` 52 to 56 mirrors. |
| 8 Pre-lock correction | SILENT; Quiet Path veto covers Distillation only | 136 "The GM names one specific Principle, and the System announces it ... The slot fills for life"; 137 drift fixed by Refinement, after the fact; 265 veto: "vetoes it and Distills at a later Consolidation." Tutorial 1080 "crystallizes their first Principle here and the System names it", no veto. | n/a |
| 9 "A safe career" | PARTLY | 122 "A safe career earns nothing here." 114 "Consuming an affinity treasure 1–2"; 115 "Consolidation vision 1"; 117 "Any other Principle-aligned experience, GM's call 1–3"; 125 lore "monks who sat with Weight for sixty years". Items 171 "Resonance Shard: Add 1 IP". | `principles.yaml` 28 to 33 matches. |
| 10 Kara | CONFIRMED mismatch | 33 "Kara whose Principle turns out to be Weight"; 48 "Resonance accruing: IMPACT. 2/3."; 70 "[Initial Insight: Weight.]". HVE 29 "[Resonance accruing: CONSUMPTION. 2/3.]"; HVE 117 "accruing toward the Consumption family." HVE sheet 108 to 113 shows Deep Force 3 (Impact) leading Hunger 2. | n/a |
| 11 The Void; Haki | CONFIRMED | HVE 52 "Consumption family (Devouring, Blood, The Void, Assimilation, Corrosion)." 173 "Time. Void. Luck. Truth. Distance. These are Axioms ... no amount of behavior points at one." Conqueror's Haki appears once: HVE 61. | `hve.yaml` families; `principles.yaml` 63, 65, 71. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 5.1 | IP cumulative against "spent into Seed"; IP after Fusion | PARTLY; SILENT | **A** for the sheet; **B** (D10). |
| 5.2 | 3 IP automatic against "Meeting an IP threshold does not advance the tier" (136, 183); the diagram (`book/assets/principle_loop.svg` line 43) lists 3 among the Distillation thresholds | CONFIRMED | **A:** "from Seed onward"; edit the SVG to "at 10 / 25 / 50 / 100 IP" and re-render the PNG (no SVG renderer is installed; install rsvg-convert or render via Chromium, which the kit build already uses). |
| 5.3 | IP assignment between two Principles; stacking; one-use Battle Memory | SILENT; allowed; stated only in the tutorial and kit | **A:** move the one-use rule into Principles. Assignment is moot at F (one slot); one line for E: one memory feeds one Principle, the player's choice. |
| 5.4 | Infusion and Domain procedure | CONFIRMED absent | **B** (D12). |
| 5.5 | Attack Applications and the Beat | SILENT | **B** (D11). |
| 5.6 | Attunement comfort boundary | CONFIRMED unquantified; 247 already says "fictional capability rather than combat mechanics" | **A:** add "it never reduces damage". |
| 5.7 | Fusion details | SILENT | **B** (D10). |
| 5.8 | Correcting a mistaken first naming | SILENT | **B:** recommend the GM proposes the name and the player may ask once for a different reading, in the Quiet Path's spirit. |
| 5.9 | "A safe career earns nothing here" against contemplative and treasure awards (114 to 117) | PARTLY | **EDIT** (V05-06). |
| 5.10 | Kara mismatch | CONFIRMED | **B** (D9). |
| 5.11 | The Void; Conqueror's Haki | CONFIRMED | **B** (D8). |

### Rewrites

**V05-01** · pp.48–49
- Original: “say the truth, receive its expression”
- ChatGPT: “Describe the character’s understanding and define the new ability with the GM.” Explain Distillation literally in its first definition; mention the Quiet Path alternative nearby.
- Claude: **EDIT.** Keep the phrase (it is the diagram's spine) and add the literal beside it: “say the truth, receive its expression: the player states what the character has learned, and the GM (or the System AI in assisted modes) defines the ability it becomes.”

**V05-02** · p.49
- Original: “Everything else in the chapter is detail hanging off this loop”
- ChatGPT: delete. The following example and diagram already provide orientation.
- Claude: **APPLY.**

**V05-03** · p.50
- Original: “Grade matters to this track only once”
- ChatGPT: “Grade limits the number of Principle slots and access to Domains; IP can otherwise accumulate at any Grade.” The E-Grade slot is another Grade gate.
- Claude: **EDIT.** “Grade touches this track twice: the second slot opens at E-Grade, and a Domain needs a D-Grade body. IP accrues at any Grade.”

**V05-04** · p.51
- Original: “the System named what her life had been spelling out”
- ChatGPT: “The GM named Weight as the Principle reflected in Kara’s actions and meditation.” Expose the actual table procedure outside the fictional vision.
- Claude: **DECLINE.** A fiction line inside the example; the procedure is stated at line 136.

**V05-05** · p.52
- Original: “What the System is forging from the number, it keeps to itself”
- ChatGPT: “Players see their IP totals, but the next ability is defined at Distillation.” Replace secretive personification with the information boundary; adjust if advance previews are allowed.
- Claude: **EDIT.** “The player sees the IP total. What it becomes is defined at Distillation.”

**V05-06** · p.53
- Original: “A safe career earns nothing here”
- ChatGPT: “Routine, risk-free activity does not normally earn Battle Memories or life-or-death IP.” This preserves the narrower rule without contradicting contemplative learning, treasures, and GM-awarded experience.
- Claude: **EDIT.** “A safe career earns no Battle Memories.”

**V05-07** · p.53
- Original: “Name the person, not the concept”
- ChatGPT: “Choose the family from the character’s behavior, then name the specific Principle.” The memorable directive is misleading in a section that literally names concepts.
- Claude: **APPLY.** X-not-Y.

**V05-08** · p.54
- Original: “two shallow Principles lose to one deep one in almost every fight that matters”
- ChatGPT: “Dividing IP between two Principles can delay access to higher-tier abilities.” The original makes an unsupported balance guarantee and judges which fights matter.
- Claude: **EDIT.** “Splitting IP across two Principles delays both.”

**V05-09** · p.55, optional
- Original: “where a Principle stops being something a person holds and becomes something the world has to account for”
- ChatGPT: “Higher tiers have effects beyond the scope of this book.” Keep a brief evocative promise only if it adds more than the existing future-volume sentence.
- Claude: **DECLINE.** One evocative promise; Gabriel's call.

**V05-10** · p.56
- Original: “where the thing is loose and wrong”
- ChatGPT: “where that aspect of reality behaves abnormally.” Keep the concrete examples immediately after it: they supply the atmosphere more effectively.
- Claude: **DECLINE.** An image with concrete examples after it.

**V05-11** · p.56
- Original: “what is being compressed is the character’s lived pattern”
- ChatGPT: “Base the result on the character’s experiences, not the player’s fluency.” The instruction is already present; remove the abstraction.
- Claude: **APPLY.** “Compressed” is a retired term (Compression became Distillation).

**V05-12** · p.57
- Original: “what it buys is a Principle that keeps up with who its holder is becoming”
- ChatGPT: “Refinement updates the Principle to reflect changed behavior without increasing its tier.”
- Claude: **APPLY.**

**V05-13** · p.58
- Original: “how much world the manifestation can touch”
- ChatGPT: “the size and strength of the effect.” If 'scale' includes range, area, and material resistance, name those separately.
- Claude: **EDIT.** “the size and reach of the effect”.

**V05-14** · p.59
- Original: “both identities go in, one comes out”
- ChatGPT: delete; the Fusion procedure immediately explains the result.
- Claude: **APPLY.**

**V05-15** · p.60
- Original: “Same grant, same tier, no discount”
- ChatGPT: “The player receives the same tier and mechanical benefits.” 'Discount' is the wrong direction for a statement intended to mean no penalty.
- Claude: **EDIT.** “Same grant, same tier, no penalty.”

**V05-16** · p.60
- Original: “it is a mood, and the System does not compress moods”
- ChatGPT: “If the wording is too vague, help the player identify a specific, bounded effect.” Avoid turning collaborative advice into a dismissive slogan.
- Claude: **EDIT.** “If the statement is a mood, help the player find the specific, bounded claim about the world inside it.” Also removes “compress”.

**V05-17** · p.61, §5.13
- Original: Replace the paragraph beginning “Principles are discovered in play rather than chosen from a list” with “Principles develop from a character’s experiences. Limited slots make those choices lasting, while Refinement, Broadening, and Fusion let a Principle change over time. Principle advancement is separate from level advancement.” This retains design intent without repeating the chapter in inflated language.
- ChatGPT: 
- Source passage: Principles are discovered in play rather than chosen from a list, because the discovery *is* the behavioral signal. Slots are scarce and entry is always at the bottom so that a character's one or two Principles, their Refinements, and the Fusion that may one day join them read as the mechanical transcript of who that character has been. The track runs beside the level track rather than inside it: the System integrates power on its own schedule, and hands out understanding only when it has been lived.
- Claude: **DECIDE.** The paragraph is quoted under Source below. Claude's read: the first sentence carries a genuine “rather than” and a rationale a GM would wonder about; the third sentence's “hands out understanding only when it has been lived” is the flourish. Recommend trimming the third sentence to “The track runs beside the level track.”

**V05-18** · pp.61–62, §5.14
- Original: The closing “conflict reveals limits, scarcity reveals priorities…” and “Power is not granted. It is recognized, distilled, and returned…” repeat the premise as a manifesto. Suggested short replacement: “The System tests how people respond to changing conditions. It turns useful discoveries into repeatable powers called Principles, then introduces new pressures that test their limits.” If this box is intended as an in-world statement, attribute it; otherwise it remains GM exposition and should meet that standard.
- ChatGPT: 
- Source passage: The System exists to discover and refine stable patterns of reality that cannot be derived directly. Reality is not fixed: zones shift, laws degrade, unknown conditions emerge faster than any static model can solve. So the System introduces conscious agents into constrained environments and observes: conflict reveals limits, scarcity reveals priorities, uncertainty reveals models, pressure reveals identity.

Patterns that succeed across contexts are compressed, formalized, and made reusable. That is a Principle, and that is why the System pressures its holders: dominant strategies are challenged, over-reliance is punished, and no single approach remains optimal forever. The System does not ask "Did you win?" It asks "How do you win, and what does that reveal?"

Power is not granted. It is recognized, distilled, and returned to those who discovered it.
- Claude: **DECIDE.** “Power is not granted.” is the chapter's closing line by ruling and stays. The lore box is in-world text (attributed to the System's behavior, in a lore callout), which is the register the voice standard exempts. Recommend keeping the box and cutting only “The System does not ask ‘Did you win?’ It asks ‘How do you win, and what does that reveal?’”, a rhetorical contrast.

## Chapter 6, Cultivation

### ChatGPT's content findings, verbatim

**Content questions:**

1. With global rounding down, MaxHP14 heals2/hour and is not fully restored after five hours. Either track cumulative fractional healing, round the running total, or explicitly restore full HP after five hours. Apply the chosen method to every summary and card.
2. Fixed Saturation boundaries80/160/240 should be labeled F-Grade; the general rule should use multiples of Tolerance.
3. Define Consolidation at zero VE, and define what happens to refined VE at the level cap. Can a capped character deliberately shed Saturation through rest, or does fuel remain stored until Ignition?
4. Explicitly distinguish ordinary ambient absorption1/3/6VE per hour from any faster ritual charging. Chapter7 says top-ups take minutes in rich sites; these rates do not support that.
5. Batching VE awards is compatible with delayed bookkeeping only if the GM still checks Saturation when it is crossed. Add that exception.
6. The text calls full rest the safest option but also makes the character defenseless. Prefer “requires a secure rest site” to an unqualified safety ranking.

**Preserve:** Joe's opening example; the one-line earn/push/rest/refine loop; the actual symptoms of Saturation; the full reward for each meaningful participant.

### What the source says, verified

| # | Verdict | Evidence (`25-cultivation.md` unless named) | rules data |
|---|---|---|---|
| C1 Healing | CONFIRMED | 55 "restores one fifth of your Max HP" and "a full set of wounds in five"; 25 "By the fifth hour ... his wounds are closed"; 165 same rate. Core 31 "all fractions round down, always." | `cultivation.yaml` 33 "one fifth of Max HP" (string, no rounding); the engine has no healing function. Any Max HP not divisible by 5 misses full at five hours. |
| C2 Bands | PARTLY | 39 to 41 give "past 80, up to 160" etc. with no Grade label; 33 Tolerance ×10 per Grade; Quick Reference 64 repeats bare F numbers. | The multiples rule lives only in `cultivation.yaml` 10 "Bands are multiples of Tolerance". |
| C3 Zero VE; the cap | PARTLY; SILENT | 55 "The minimum is 1 hour ... however little VE needs processing"; 62 Aether "refills completely when the first full hour completes". Cap: 81 "VE keeps accumulating with nowhere to go, and stored VE counts in full toward Breakthrough Ignition"; "Saturation applies to the stockpile as normal". | `cultivation.yaml` 48; the engine raises RulesGap past the cap. |
| C4 Ambient | CONFIRMED | 130 "1 VE/hour at Moderate density, 3 at High, 6 at Extreme". Breakthroughs 69 "minutes somewhere rich, hours of dangerous exposure somewhere barren." At 6 per hour a 20 VE top-up is over three hours. | `cultivation.yaml` 67 to 70. |
| C5 Batching | SILENT | 130 "the award batches per visit"; 137 "awarded in batches at rest points". | n/a |
| C6 Safest | CONFIRMED | 165 "Safest option, but it requires time."; 65 "A consolidating character is completely defenseless." | `cultivation.yaml` 38 defenseless true. |
| C7 Windfall | CONFIRMED (overreach) | 45 "A cross-Grade windfall is a collapse. An E-Grade peer kill pays ... 100 VE" then "A character who takes one is on the collapse clock". 116 prices only the 500 VE Peak as "a collapse". | Mild past 80 to 160; Critical past 240. |
| C8 "−10 to everything" | PARTLY | 25 "−10 to everything"; 39 "−10 to all rolls". Breakthroughs 84 "Saturation penalties never touch the Breakthrough Check." | `cultivation.yaml` 13 penalty −10, no scope. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 6.1 | Healing rounding | CONFIRMED | **B** (D2). |
| 6.2 | 80/160/240 unlabeled as F-Grade (39 to 41) | PARTLY (the multiples rule lives only in the yaml) | **A:** label the bullets and state the multiples rule in prose. |
| 6.3 | Zero VE; the cap | PARTLY; SILENT | **A**; **B** (D3). |
| 6.4 | Ambient 1/3/6 per hour against Breakthroughs 69 "minutes somewhere rich" | CONFIRMED | **A:** fix the Breakthroughs sentence to hours. |
| 6.5 | Batched awards and band crossings | SILENT | **A:** "check Saturation whenever a batch crosses a band". |
| 6.6 | "Safest option" while defenseless (165, 65) | CONFIRMED | **A:** "needs a secure site". |
| 6.7 | "A cross-Grade windfall is a collapse" (45); 100 VE is Mild | CONFIRMED | **EDIT** (V06-03). |
| 6.8 | "−10 to everything" | PARTLY | **A** (V06-01). |

### Rewrites

**V06-01** · p.64
- Original: “−10 to everything”
- ChatGPT: “−10 to all rolls.” Match the actual penalty.
- Claude: **APPLY.**

**V06-02** · p.65, optional
- Original: “what differs between characters is what they do with a full tank”
- ChatGPT: delete. The uniform tolerance rule is already clear; the later risk example shows the choice.
- Claude: **DECLINE.** The flat-Tolerance framing is the design's own argument.

**V06-03** · p.66
- Original: “A cross-Grade windfall is a collapse”
- ChatGPT: “Large cross-Grade rewards can push a character into Critical Saturation.” An E-peer's100VE alone is Mild, not Critical, and Critical collapse is delayed.
- Claude: **EDIT.** “A cross-Grade windfall can be a collapse. An E-Grade peer kill pays an F-Grade character 100 VE, Mild on its own; an E-Peak pays 500, and a character who takes one is on the collapse clock at once.”

**V06-04** · p.66
- Original: “Several levels from one great kill, and a day unconscious paying for them, is the genre’s oldest beat; let it happen”
- ChatGPT: “Allow the reward to stand, and apply the normal Saturation and Consolidation rules.” This gives the GM the intended instruction without a genre superlative.
- Claude: **EDIT.** Drop the superlative: “Several levels from one great kill, and a day unconscious paying for them, is a genre beat; let it happen.”

**V06-05** · p.66
- Original: “This generates rich Hidden Vector signal”
- ChatGPT: “At session end, consider the decision to keep hunting or rest during the HVE sweep.” Concrete task instead of analytics jargon.
- Claude: **APPLY.** Inline bookkeeping is banned by the 2026-08-25 ruling.

**V06-06** · p.68
- Original: “The cap is the game telling a character to go get everything else before the door opens”
- ChatGPT: “At the level cap, characters can still earn Marks and IP, improve stats through rewards, and prepare for Breakthrough.” The metaphor exaggerates the requirement to acquire 'everything.'
- Claude: **EDIT.** “At the level cap a character can still earn Marks and IP, raise stats through titles and treasures, and prepare for the Breakthrough.”

**V06-07** · p.69
- Original: “four levels on the spot and a collapse with them”
- ChatGPT: “enough VE for four levels after refinement, with stored VE well above the Critical threshold.” Fix the misleading timing and certainty.
- Claude: **EDIT.** “four levels' worth of VE, and a collapse clock running until it is refined”.

**V06-08** · p.69
- Original: “Its VE is too thin a shape for an ascended body to refine”
- ChatGPT: “A lower-Grade victim grants no VE.” Retain a separate lore explanation only if it adds a clear reason beyond this mixed metaphor.
- Claude: **DECLINE.** The rule plus its lore reason, where a GM would wonder.

**V06-09** · p.70
- Original: “These are the System noticing something, so let the number match the moment”
- ChatGPT: “Choose the award within that range to reflect the achievement’s difficulty and significance.”
- Claude: **EDIT.** “Pick the number by what the achievement cost.”

**V06-10** · p.71
- Original: “When a character reaches the Grade-cap level, they must attempt a Grade Breakthrough”
- ChatGPT: “To advance beyond the Grade-cap level, a character must complete a Grade Breakthrough.” The current wording contradicts the option to remain capped while preparing.
- Claude: **APPLY.**

## Chapter 7, Grade Breakthroughs

### ChatGPT's content findings, verbatim

**Content questions:**

1. **p.81, Anchor:** a roll against fixed Moderate90 is a Resistance Roll, not an Opposed Roll. Use the correct term.
2. **pp.78–81, procedure order:** external threats and Anchor actions modify the main check. State that the party resolves those first and the cultivator then rolls, or explain how a pre-rolled result is held and modified. Add a concrete end condition for the defense scene.
3. **pp.77,80,82, Ward:** specify whether a failure converted to Stable by a Tribulation Ward can then gain Overcharge/Quality Enhancer tiers. 'Neither applies on a failure' suggests no; make that explicit if intended.
4. **pp.86,88, phenomena:** density table promises threats even at Barren/Low, while F→E says low-density sites may have none. State which takes precedence; also reconcile the Extreme site's Grade+ threat with 'minor' first-Breakthrough danger.
5. **p.88, probability example:** HRT60 plus preparation35–45 needs natural35–45, a56–66% success chance. Those thresholds are below96, so exploding rolls do not add extra chances of success; they improve successful margins. Replace “roughly even odds, plus the explosion tail.”
6. **p.88:** E→D is not the first time HVE matters mechanically: the coherence bonus already applies at F→E. Say that this transition gives HVE a more explicit role in the trial's imagery.
7. **pp.90–91, summary:** “Severe difficulty of the target Grade” invites the +100 adjustment expressly excluded on p.78. Write “DC140 plus the Overcharge modifier; no Cross-Grade Adjustment.” HRT Force range10–99 also excludes valid low F-Grade and lagging stats.
8. **pp.84–85, item categories:** Resonance Catalysts and Anchoring Artifacts have no default numerical effect; references to IP at Stable conflict with the listed +10 starting only at Pristine. Provide one runnable item in each category or explicitly require each item's own numbers.
9. **p.90, failure:** define the order and repeatability of POW loss and the Aether ceiling reduction. Identify whether later failures stack the reduction and what success restores. Specify which Principle loses IP in a tie.
10. **pp.78,88, preparation:** claims that a stat-independent +10 matters more at F→E than E→D do not follow from the same Force/DC math. Describe availability or consequences as the reason if that is the intended distinction.

**Preserve:** the leaning water epigraph; the density tradeoff; locking support roles before the trial; concrete consequences and grade-specific physical details where they replace rather than repeat abstract declarations.

### What the source says, verified

| # | Verdict | Evidence (`30-breakthroughs.md` unless named) | rules data |
|---|---|---|---|
| B1 Anchor | CONFIRMED (mixed) | 170 "makes an Opposed Roll ... against a Moderate difficulty of the current Grade." Core 99 Opposed = "both sides roll"; 107 Resistance Roll = "against a passive obstacle". | `breakthrough.yaml` 32 repeats "Opposed Roll ... vs Moderate". Moderate 90. |
| B2 Order; end | SILENT; PARTLY | 96 "makes a single roll"; threats "impose a penalty" (168); Anchor "grants +5" (170). No sequencing. End: 176 "no more than 10 minutes"; 168 "2–3 rounds maximum". No procedural trigger. | n/a |
| B3 Ward | SILENT | 150 "neither applies on a failure: a check that misses the DC is Cracked no matter the Overcharge." 192 Ward: "the Cracked result is upgraded to Stable." | `breakthrough.yaml` 54 failure_stays_cracked true. |
| B4 Density | CONFIRMED | Table 257 to 258: Barren "Minimal (1 weak threat)", Low "Light (1 moderate threat)". 291 "At low-density locations, these may not manifest at all." Extreme 261 "Severe (3 strong threats, possible Grade+ entity)" against 158 "pose no serious threat to a prepared party" and 286 "without threatening campaign-ending consequences". | `breakthrough.yaml` 57 to 61 matches the table. |
| B5 Probability | CONFIRMED | 305 "the roll needs 35 to 45: roughly even odds, plus the explosion tail." Actual: need ≥45 is 56%; need ≥35 is 66%. Every natural 96+ already clears each need, so explosion adds no success chance. | Threshold 96. |
| B6 First HVE | CONFIRMED | 311 "The first Breakthrough where HVE matters mechanically and narratively." Coherence (121, 127 to 132) applies to every check; 305 F→E example uses "Coherence of Defined (+10)". | `breakthrough.yaml` 38 to 42 unconditional. |
| B7 Summary | CONFIRMED | 344 "vs. Breakthrough DC: Severe difficulty of the target Grade + Overcharge modifier" against 102 "140 at every Grade transition ... There is no Cross-Grade Adjustment". 353 "HRT Force / Character stat / 10–99" against 110 "Heart bounded 1–99". | `breakthrough.yaml` 10 dc 140, flat. |
| B8 Items | CONFIRMED | 238 "Increase IP awarded at Stable or higher"; 239 "Reduce backlash damage". No numbers. Stable outputs (198 to 201) award no IP; 216 "+10 Insight Points" is Pristine only. | `breakthrough.yaml` 65, 66 no numbers; 85 principle_ip_bonus 10 under Pristine. |
| B9 Failure | PARTLY / SILENT | Order 326 to 330: Aether ceiling, Principle regression, Lockout, Cracked Foundation, Stat loss. Stacking: SILENT. Success restores the Aether ceiling (326) and Cracked Foundation (329); stat loss is "permanent until recovered through leveling or treasures" (330); IP loss never restored. Tie for "highest Principle" (327): SILENT. | `breakthrough.yaml` 98 to 103 mirrors. |
| B10 "+10 matters more" | CONFIRMED | 301 "Foundation Pills matter most at this Grade; the roll bonus they provide is a larger percentage of the total needed." Contradicted by 110 "The math is identical at every Breakthrough". Mirror claim 332 "The HVE Coherence bonus is more impactful" at E→D. | flat DC. |
| B11 "Permanent … until" | CONFIRMED | 326 "Permanent. Max Aether is reduced by one tenth (drop fractions) until the next successful Breakthrough." | `breakthrough.yaml` 99 identical. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 7.1 | Anchor is "an Opposed Roll" against Moderate 90 (170; yaml 32) | CONFIRMED | **A:** Resistance Roll. |
| 7.2 | Order of threats, Anchor, and the check; end condition | SILENT; PARTLY | **A:** the defense scene resolves first (2 to 3 rounds), then the cultivator rolls with what it produced. |
| 7.3 | Ward-rescued Stable and Overcharge tiers | SILENT | **B:** recommend no tier on a rescued result. |
| 7.4 | Density table against "may not manifest"; Extreme against "minor" | CONFIRMED | **A:** the table wins; "no serious threat" narrows to Moderate density or lower. |
| 7.5 | Probability example (305) | CONFIRMED: needing 35 to 45 is 56 to 66 percent; every 96+ already succeeds, so explosion adds no chance | **A:** "about six in ten; the explosion only raises the Margin". |
| 7.6 | "first Breakthrough where HVE matters mechanically" (311) | CONFIRMED (Coherence applies at F→E) | **EDIT.** |
| 7.7 | Summary "Severe difficulty of the target Grade"; HRT Force 10 to 99 (344, 353) | CONFIRMED | **A:** "DC 140 plus Overcharge; no Cross-Grade Adjustment"; "1 to 99". |
| 7.8 | Resonance Catalysts and Anchoring Artifacts without numbers; IP at Stable | CONFIRMED | **B:** give each a number (Catalyst +5 IP at Stable or better; Anchoring Artifact halves backlash). |
| 7.9 | Failure stacking; success restores what; the IP-loss tie | PARTLY; SILENT | **B:** the tenth off Max Aether does not stack; a tie is the player's pick. |
| 7.10 | "+10 matters more at F→E" (301) against a flat DC | CONFIRMED | **EDIT:** availability is the reason (a pill is the preparation an F-Grade character can reach). |
| 7.11 | "Permanent … until" | CONFIRMED | **A** (V07-17). |

### Rewrites

**V07-01** · p.75
- Original: Replace the paragraph ending “daring it to remake them” with “The same conditions that permit a Breakthrough can also produce dangerous external phenomena. The cultivator undergoes the transformation while companions deal with threats around the ritual site.” The original repeatedly announces danger without explaining participation.
- ChatGPT: 
- Source passage: This proximity is what makes the event possible. It is also what makes it dangerous. The same thinning of the boundary that allows ascension also allows external phenomena to manifest: tribulations, environmental backlash, spectral echoes of the energy being consumed. The cultivator is not simply meditating harder. They are standing at the threshold of a higher order of reality and daring it to remake them.
- Claude: **DECIDE.** The paragraph is quoted under Source below. ChatGPT's replacement is sound; Claude would take it.

**V07-02** · p.75
- Original: “This is where most quality dials are set”
- ChatGPT: “Choose the location, items, and support that will modify the check.”
- Claude: **APPLY.**

**V07-03** · p.76
- Original: “The party arranging themselves. The world going quiet”
- ChatGPT: “Describe the allies taking their positions and the immediate changes at the site.” Avoid prescribing a generic cinematic hush for every ritual.
- Claude: **EDIT.** “Describe the allies taking their positions and what changes at the site.”

**V07-04** · p.76
- Original: “This overcharge is not an accident; it is the fuel that powers the ascension”
- ChatGPT: “The cultivator commits stored VE as fuel for the Breakthrough.” Also note that minimum Ignition at exactly one Tolerance is not over-Tolerance.
- Claude: **APPLY.** X-not-Y.

**V07-05** · p.77
- Original: “the gathered charge draining away with nothing to show for it”
- ChatGPT: “the gathered VE is refined instead of being used for a Breakthrough.” Verify what refinement does at the cap before finalizing; 'nothing' conceals possible recovery benefits.
- Claude: **DECIDE.** Follows D3: at the cap nothing refines, so an abandoned charge stays stored and Saturated. Wording: “the gathered VE stays in the tank, Saturation and all, until the next Ignition.”

**V07-06** · p.78
- Original: “no other Attribute is consulted, because no other Attribute is being asked anything”
- ChatGPT: “Use HRT Force; no other Attribute contributes directly to the check.” Circular, performative reasoning adds no explanation.
- Claude: **APPLY.** Justification copy.

**V07-07** · p.78
- Original: “what separates them is how much they were willing to hold”
- ChatGPT: “Their HRT Force and preparation determine their odds.” Carrying VE does not itself set HRT, and willingness is not the formula.
- Claude: **DECLINE.** Overcharge is literally how much VE the character held; ChatGPT misread the formula.

**V07-08** · p.78
- Original: “They are becoming it”
- ChatGPT: delete after “There is no Cross-Grade Adjustment.” The rules statement is sufficient.
- Claude: **APPLY.**

**V07-09** · p.79
- Original: “The character knows who they are” / “The trial practically writes itself”
- ChatGPT: “Use +10 for a Defined profile and +20 for a Singular profile.” Keep the other band modifiers. Avoid treating a game score as a fact about self-knowledge.
- Claude: **EDIT.** “Use +10 for a Defined profile and +20 for a Singular one.” No verdicts on self-knowledge.

**V07-10** · p.79
- Original: “Characters who have lived with conviction are rewarded. Characters who have drifted aimlessly face a harder road”
- ChatGPT: “More concentrated HVE profiles receive a larger bonus.” A varied profile does not establish aimlessness.
- Claude: **EDIT.** “A more concentrated profile earns a larger bonus.”

**V07-11** · p.81
- Original: “not a slog, not a multi-hour ordeal”
- ChatGPT: delete. “The ritual takes no more than ten minutes in the fiction” and the suggested round count already give the GM usable limits.
- Claude: **APPLY.**

**V07-12** · p.82
- Original: “it turns catastrophe into mediocrity”
- ChatGPT: “it converts a failed check into a Stable ascension.” Do not disparage a successful result in instructional prose.
- Claude: **EDIT.** “it converts a Cracked result to Stable.”

**V07-13** · p.82
- Original: “Clean, competent, unremarkable”
- ChatGPT: delete. The heading “Stable (Standard Ascension)” says everything needed.
- Claude: **APPLY.**

**V07-14** · p.83
- Original: “This is the Breakthrough as promotion review…”
- ChatGPT: “Generate a unique reward from the character’s HVE profile, Principles, and significant actions.” The long corporate metaphor repeats established reward inputs.
- Source passage: - **System-Generated Unique Reward.** The System AI creates a one-of-one reward that exists nowhere else in the Multiverse. This is the Breakthrough as promotion review: the System looked at this character's entire behavioral record, their Principle mastery, their combat history, their choices under pressure, and decided to invest. Possible forms:
- Claude: **DECIDE.** The sentence is quoted under Source below. Claude would take ChatGPT's replacement; the promotion-review metaphor restates the inputs listed two lines earlier.

**V07-15** · p.88
- Original: “Who you have been determines the shape of who you become”
- ChatGPT: delete. The preceding sentence already explains that the Soul Sea reflects accumulated behavior.
- Claude: **APPLY.**

**V07-16** · p.89
- Original: “prove their will is genuine sovereignty and not mere cruelty”
- ChatGPT: “Confront a situation in which imposing their will creates a cost or conflict.” The original is an undefined moral test. If a moral test is intentional, explain how it relates to the System's nonmoral behavioral assessment.
- Claude: **EDIT.** “confront a situation where imposing their will costs them something.” The original is an X-not-Y and a moral test the System does not run.

**V07-17** · p.90
- Original: “Permanent…until the next successful Breakthrough”
- ChatGPT: “Lasts until the next successful Breakthrough.” Use the actual duration, not a contradictory adjective.
- Claude: **APPLY.**

**V07-18** · p.91
- Original: “They are not forgotten; they are deliberately deferred”
- ChatGPT: “The following rules are planned for later development.” Remove defensive production commentary.
- Claude: **APPLY.** X-not-Y.

## Chapter 8, Titles

### ChatGPT's content findings, verbatim

**Content questions:** Flat title stat bonuses are “applied…once,” but replaced HVE titles become mechanically inactive. Explain removing or replacing their stat points, especially points previously lost to a cap. Conditional raw FOR/POW bonuses need current/max resource handling. Define 'axis pair' using named examples so opposite poles are not mistaken for pairs of axes. The conditional bonus guidance uses the same scaling as raw stat bonuses, while examples give fixed Clash modifiers: distinguish the two. Free first attacks in title examples contradict Core Mechanics' claim that Mastery is the only free-action feature. 'The Open Hand' is both an HVE-Resonant title(p.96) and a Bestowed example(p.107); rename or explicitly permit reused names. Achievement kill counters need the same meaningful-participation/killing-blow distinction as VE. Tutorial title completeness is checked again against Chapter15 and cards.

**Preserve:** the oath epigraph; concrete catalog triggers; “a countable deed, a flat bonus, a short name.”

### What the source says, verified

| # | Verdict | Evidence (`40-titles.md` unless named) |
|---|---|---|
| T1 Echoed points | SILENT | 100 "a flat bonus is applied to the sheet once, the day it lands"; 86 Echoed = "no longer mechanically active"; 241 at Breakthrough the F title "is automatically replaced by its E-Grade evolution". `17-progression.md` 34 "Bonuses ... from titles or treasures, still overflow against a capped stat and are lost." Nothing says whether an Echoed title's points come off. |
| T2 Conditional FOR/POW | SILENT | Core 83 "Max HP: Raw FOR × 2"; 84 "Max Aether: equal to Raw POW". 117 permits conditional bonuses "below half HP" with magnitude "same range as a flat bonus" (119); no chapter states how current or max HP or Aether move when FOR or POW changes temporarily. |
| T3 "axis pair" | CONFIRMED undefined | Appears at 86, 241 to 248, HVE 125; never defined. Examples imply one pole from each of two axes (68). HVE 37 calls each axis "bipolar", so "pair" could be read as one axis's two poles. |
| T4 Units | PARTLY | 119 "the same range as a flat bonus of the title's class" (table 105 to 110 is in stat points); 121 "grant a flat Clash bonus ... ('+10 to Clashes against constructs')". Examples: 278 Cornerless "+5 STR and +5 DEX"; 279 "+5 to Clashes against beasts"; 290 "+10 to that defensive Clash". Clash bonuses price off the Modifier Budget (Core 345 to 352). |
| T5 Free attack | CONFIRMED | Core 272 "it is one specific action that costs nothing, and it is the only thing in the game shaped that way." 129 "Your first attack of any combat does not consume a Beat." 130 "take a free Beat outside the action economy". Core 272 also says "Certain titles ... grant [a third Beat]", so 128 and 277 ("gain 1 Beat next turn") are consistent; 129 is the contradiction. |
| T6 The Open Hand | CONFIRMED | 68 and 90 "The Open Hand" (Restraint + Accord), HVE-Resonant; 315 "The Open Hand \| Bestowed (Network) \| Granted by an underworld figure." `titles.yaml` 117 carries only the Bestowed one. |
| T7 "confirmed kill" | SILENT | 170, 171 "Tenth confirmed kill", "Hundredth confirmed kill"; never defined. `25-cultivation.md` 120 "The killing blow earns no extra share" governs VE only and routes individual credit to "titles, and Hidden Achievements instead". |
| T8 Tutorial table | CONFIRMED | Table 219 to 231 lists nine titles; Salvaged and Came Back Whole absent; `titles.yaml` 75 to 84 matches. Tutorial 1216 "Salvaged (Bestowed, negative) ... −2 Raw HRT"; 1222 "converts to the Achievement title 'Came Back Whole'". Kit has cards for both (1250, 1261). Also 217 "None of these names appears in the catalog above", yet the tutorial grants catalog title Pack-Breaker (tutorial 1311). |
| T9 "10× over-Grade" | undefined | 278 "Triggered by surviving an encounter that the System assessed as 10× over-Grade." Occurs nowhere else. |
| T10 "listed there" | CONFIRMED (dangling) | 19 "...is the Hidden Vector Engine's business, and the titles the Integration Tutorial hands out are listed there." The list is in Titles itself, 215 to 231. |
| T11 Visibility | Titles defers; the conflict is inside What Can Be Seen | 155 "visible ... to other characters within the limits in What Can Be Seen"; 262 defers. See Chapter 12. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 8.1 | Echoed titles and stat points | SILENT | **B** (D14). |
| 8.2 | Conditional FOR and POW and derived resources | SILENT | **B** (D14). |
| 8.3 | "axis pair" undefined (86, 241) | CONFIRMED | **A:** "one pole from each of two axes (Force + Hunger)". |
| 8.4 | Conditional guidance in stat points, examples in Clash bonuses | PARTLY | **A:** state both units and that Clash bonuses price off the Modifier Budget. |
| 8.5 | Free first attack (129) against Core 272 | CONFIRMED | **B** (D13). |
| 8.6 | "The Open Hand" twice (68, 315) | CONFIRMED | **A:** rename the Bestowed one; Gabriel picks. |
| 8.7 | "confirmed kill" undefined | SILENT | **A:** the finishing blow counts (Cultivation 120 routes individual credit to titles). |
| 8.8 | Tutorial table lacks Salvaged and Came Back Whole; "None of these names appears in the catalog" against Pack-Breaker | CONFIRMED | **A:** add both rows to `rules/titles.yaml` `tutorial_titles` and regenerate; fix the sentence. Version bump. |
| 8.9 | "10× over-Grade" (278) | CONFIRMED undefined | **B:** "an enemy a full Grade above you". |
| 8.10 | "listed there" points at the HVE chapter (19) | CONFIRMED | **A.** |

### Rewrites

**V08-01** · p.94
- Original: “the bonus stays on the record forever”
- ChatGPT: “The title becomes part of the character’s record; most bonuses remain active indefinitely.” HVE replacements and released penalties are exceptions.
- Claude: **EDIT.** “The title becomes part of the character's record. Its bonus stays active unless the title is Echoed or released.”

**V08-02** · p.94
- Original: “the titles the Integration Tutorial hands out are listed there”
- ChatGPT: “Tutorial titles are listed in §8.4.1.” 'There' currently points to the Hidden Vector Engine.
- Claude: **APPLY.**

**V08-03** · p.95
- Original: “This is the breadcrumb layer that makes the System feel constantly observant”
- ChatGPT: “Recurring awards show players that the System tracks their actions.”
- Claude: **EDIT.** “Recurring awards show players that the System counts what they do.”

**V08-04** · p.95, optional
- Original: “Rare, surprising, meaningfully buffed”
- ChatGPT: “Rare titles with stronger effects.”
- Claude: **DECLINE.** Achievement-layer tone is wanted here.

**V08-05** · p.96
- Original: “Mechanically variable, narratively heavy”
- ChatGPT: “Effects vary with the granting entity and may include access, obligations, or penalties.” Name the consequences.
- Claude: **EDIT.** “Effects vary with the granting entity: access, obligations, favors, or penalties.”

**V08-06** · p.98
- Original: “The trigger is not a discount that buys a bigger number; what it buys is a spike”
- ChatGPT: “A conditional bonus uses the same magnitude guidelines as an unconditional bonus of that category.” Clarify raw-stat versus Clash bonuses separately.
- Claude: **EDIT.** “A conditional bonus uses the same magnitudes as a flat bonus of its class and applies only while its condition holds.”

**V08-07** · p.99
- Original: “The mechanical bonuses always apply. The narrative weight always applies”
- ChatGPT: “Active titles apply automatically when their conditions are met. Echoed titles remain in the history without their former mechanical effects.”
- Claude: **APPLY.**

**V08-08** · p.103
- Original: “Titles are the only part of a character that other people can read”
- ChatGPT: “Ordinary inspection reveals titles, with visibility determined by Grade.” Formal parties reveal some resources too.
- Claude: **EDIT.** “Titles are the only part of a character that inspection can read.”

**V08-09** · p.104
- Original: “10× over-Grade”
- ChatGPT: **clarify**. Use an actual Grade gap or stated encounter difficulty. Grade is not multiplied in the rules.
- Claude: **DECIDE.** With 8.9: “an enemy a full Grade above you”.

## Chapter 9, The System AI

### ChatGPT's content findings, verbatim

**Content questions:** A usable minimum class-generation worksheet does exist here. Chapter4's 'framework still in development' should identify what is missing instead of suggesting no procedure exists. Add a complete example class with the normal allocation, one-time5–10-point bonus, and a fully specified Signature Skill. The references to an 'origin-Grade table' need an actual table or precise location. Several functions have guidance but no promised dedicated function prompt; either supply those prompts or revise the blanket instruction to paste one. Skill Synthesis needs acquisition prerequisites, permanence, and an explicit policy for bonuses above20; a cooldown alone is not a calibrated tradeoff. Clarify whether loot is per encounter, per creature, or per participant—the VE policy does not automatically settle item ownership.

**Preserve:** the role-based explanation that 'System AI' can mean a human GM; the rule that generated material is a draft; the short System notice examples.

### What the source says, verified

| # | Verdict | Evidence (`45-system-ai.md` unless named) |
|---|---|---|
| S1 Class procedure | CONFIRMED | 54 to 74 "Class Generation (Level 10)": In/Out, an "Unplugged procedure" (58), and a prompt (62 to 74). `17-progression.md` 76 "still in development". |
| S2 "origin-Grade table" | NOT CONFIRMED (no such table) | 58 and 111 cite "the origin-Grade table". Closest: Core 557 to 563 Application Costs (Seed 10, Early Fragment 15) plus Core 566 prose "Spells and class skills ... fixed by the Grade at which the skill was acquired, scaling ×10 per Grade", with no table. |
| S3 Prompts | PARTLY | 40 "paste the standing context (below), then the function prompt"; Introduction 75 "with the prompt templates provided". Prompts that exist: Class Generation (62 to 74; `rules/templates/class-generation.txt`), Personal Opportunities (`55-quests.md` 272 to 277; `templates/personal-opportunity.txt`), standing context (121 to 128). None for Battle Memory Visions, Hidden Achievements and Titles, Loot, Skill Synthesis, Identify. |
| S4 Skill Synthesis | PARTLY | 111 is the whole rule: sources "two or more source effects (crushed Skill Crystals, fused techniques)"; "attach one limitation (a cooldown, a trigger condition) if the merged bonus lands above +20". Permanence silent. "Skill Crystals" appears nowhere else (Items has Degraded Skill Shards, 160). The Modifier Budget caps at +15 to +20 (Core 349). |
| S5 Loot | SILENT (per enemy implied) | 94 "In: enemy difficulty tier and the circumstances of the kill"; 97 header "Enemy tier"; 107 "Bosses and named enemies drop one step up". Nothing on per encounter or per participant. |
| S6 Tracking; app | CONFIRMED planned | 40 "The GM runs the table with nothing to track and does the HVE session-end sweep as normal"; 48 "The full-automation mode: software that listens to the session". HVE 176 "A dedicated companion app for this game is planned". 17 and 46 to 48 present it as a current mode. |
| S7 Inspection pointer | CONFIRMED (misdirected) | 115 "governed by the Grade-differential inspection rules in the Titles chapter." Titles 258 to 262 defers to What Can Be Seen; the rules live at What Can Be Seen 62 to 78. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 9.1 | Class procedure exists here; Progression says none | CONFIRMED | **A** (4.1). |
| 9.2 | "origin-Grade table" (58, 111) does not exist | CONFIRMED | **A:** point at Core's Application Costs table and the ×10 sentence. |
| 9.3 | "paste the function prompt" while only two function prompts exist | PARTLY | **B:** reword now; write the missing prompts (visions, hidden achievements, loot, synthesis, identify) on the app path. |
| 9.4 | Skill Synthesis | PARTLY | **B** (D18). |
| 9.5 | Loot per what | SILENT | **A:** per creature; the party divides it. |
| 9.6 | "nothing to track"; "full-automation mode" | CONFIRMED | **EDIT** (V09-01, V09-02). |
| 9.7 | Inspection rules "in the Titles chapter" (115) | CONFIRMED | **A:** What Can Be Seen. |

### Rewrites

**V09-01** · p.111
- Original: “The GM runs the table with nothing to track”
- ChatGPT: “The GM completes HVE tracking after the session.” The game still has HP, VE, Marks, quests, and inventory to track during play.
- Claude: **EDIT.** “The GM runs the table with no HVE tracking during play and does the sweep at session end.”

**V09-02** · p.111
- Original: “The full-automation mode”
- ChatGPT: “The planned companion-app mode.” Chapter10 explicitly says the app is planned; GM review remains necessary.
- Claude: **EDIT.** “The planned companion-app mode”, and “planned” wherever the app is described until it ships.

**V09-03** · p.112
- Original: “stripped of one load-bearing detail”
- ChatGPT: “with one important detail changed or missing.” More natural instruction for composing an image.
- Claude: **APPLY.**

**V09-04** · p.113
- Original: “Grade-differential inspection rules in the Titles chapter”
- ChatGPT: “inspection rules in What Can Be Seen, §12.2.”
- Claude: **APPLY.**

**V09-05** · p.114
- Original: “It applies graded pressure and pays for what passes through”
- ChatGPT: “It presents challenges of increasing difficulty and rewards those who overcome them.”
- Claude: **DEFER.** Next session's voice section rewrites What the System Wants.

**V09-06** · p.114
- Original: “Why it selects, and toward what end, is not knowable at F-Grade”
- ChatGPT: “F-Grade characters do not know the System’s ultimate purpose.” Distinguish character knowledge from the explicit explanation already given to the GM in Chapter5.
- Claude: **DEFER.** Next session's judge-and-explain sweep owns this sentence.

## Chapter 10, The Hidden Vector Engine

### ChatGPT's content findings, verbatim

**Content questions:**

1. **Critical: paper and structured logging produce different scores.** Paper erases Current and adds at most one Deep tally per axis when the session's lead is at least2. Structured logging adds half every event's intensity to Deep, decays it by10%, halves Current, and admits0.5 events below the paper threshold. Identical play can therefore yield different Coherence bonuses, classes, Principles, and offers. Copying totals does not fix this. Choose one canonical update procedure, or explicitly present a variant with separate calibration.
2. If the physical sweep is private, say so before “say the session’s three biggest moments out loud.” Otherwise it sounds like a table discussion of the private scores.
3. The circled “S1: took the pill” note in Kara's example promotes the standard one-tally example to Defining without explaining higher stakes. Use a genuinely three-tally event or label the changed context.
4. Chapter5's recurring Kara discovers Weight/Impact, while this chapter has her accruing Consumption. Label alternative examples as alternatives or carry one canonical example character through the book.
5. 'The Void' under Consumption(p.117) conflicts with Void as an Axiom that behavior cannot produce(pp.55–56). Distinguish an ordinary void-like Principle from the Axiom, or remove it from the family examples. Consider 'Dominion' or another original term in place of the unexplained franchise-specific 'Conqueror’s Haki.'
6. Personal Opportunities compare Current and Deep, but the paper sweep erases Current. State when those offers are generated or retain a short recent-behavior summary for that purpose.
7. **Optional design consideration:** memory-only selection can favor louder scenes and players. If that is an intentional aesthetic rule, state the tradeoff. If reducing bookkeeping is the actual aim, permit a few private reminder words without treating them as formal scores. This would be a deliberate procedure change, not a voice edit.

**Preserve:** the lunch epigraph; tallying decisions rather than outcomes; distinct axis questions; the instruction to log “she took the pill” rather than “she was greedy.”

### What the source says, verified

| Item | What the source says (`50-hidden-vector-engine.md`) |
|---|---|
| Two algorithms | 85 sweep: "if one side of Current leads by 2 or more, add one tally to that side of Deep, and erase Current." 172 structured: "events add their full value to Current and half value to Deep, Current decays by half at each session end, Deep decays by a tenth." Then: "The Coherence bands and every output read the same either way; a table can switch ... by copying the standing totals across." `rules/hve.yaml` deep_update and structured_logging carry both. |
| "Out loud" | 85 "Say the session's three biggest moments out loud, and name what they share. Then, for each character, tally ..." Nothing says the tallies are the GM's alone until 144 "Never reveal an axis reading." |
| Kara's sheet | 108 to 113: Force 3, Hunger 2, Accord 1 in Deep. 115 margin notes, circled: "S1: took the pill." "S2: held the door alone against the pack." The weights table (98) lists "Taking the pill while the others argue" as the one-tally example and "Charging the pack alone to cover a stranger" as two; circled is three. 117 "an aggressive taker who cooperates when spoken to", "accruing toward the Consumption family". |
| Offers and Current | HVE 126 "Offers affirm the current pattern by default and occasionally test against it"; `rules/quests.yaml` 6 "tests it when Current and Deep disagree"; Quests 286 prompt field "HVE Dominant Lean: {axis and side, with Deep tally count or value}". Current is wiped at 85. |
| The Void; Haki | 52, 61; see Chapter 5's last row. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 10.1 | Two algorithms | CONFIRMED | **B** (F1). |
| 10.2 | "say the three biggest moments out loud" before saying the tallies are private | CONFIRMED ambiguity | **A:** the moments are said with the table; the tallies are the GM's alone. |
| 10.3 | Circled "S1: took the pill" is the one-tally example | CONFIRMED | **B** (D9). |
| 10.4 | Kara mismatch | CONFIRMED | **B** (D9). |
| 10.5 | The Void; Conqueror's Haki | CONFIRMED | **B** (D8). |
| 10.6 | Offers read Current after the wipe | CONFIRMED | **A** (F1). |
| 10.7 | Memory-only tradeoff | design ruling | **B** (D23). |

### Rewrites

**V10-01** · p.116
- Original: “She never saw a number. But it saw her”
- ChatGPT: “Kara sees the resonance total, but not the HVE score behind it.” The preceding notice literally shows2/3.
- Claude: **EDIT.** “The number she sees is the resonance count. The tally behind it stays on the GM's side of the screen.” Also a negation-and-revelation close.

**V10-02** · p.117
- Original: “the way the world leans in”
- ChatGPT: “NPC and faction responses.”
- Claude: **EDIT.** “the way NPCs and factions respond”.

**V10-03** · p.117
- Original: “Hidden state is what keeps decisions authentic”
- ChatGPT: “Keeping scores private is intended to discourage choosing actions solely for particular rewards.” State an intention, not a guarantee about authenticity.
- Claude: **EDIT.** Keep the rationale, drop the guarantee: “Scores stay hidden because a player who can read their own dials starts performing for them.”

**V10-04** · p.119
- Original: “Everything else…is this sheet by other means”
- ChatGPT: “The paper procedure is below; the structured logging variant is in §10.6.” Do not assert equivalence until the algorithms are reconciled.
- Claude: **DECIDE.** Becomes true under F1's approved recommendation; keep the sentence.

**V10-05** · pp.119–120
- Original: “the strain of live bookkeeping records everything and weighs nothing, and the Engine wants the weight”
- ChatGPT: “This procedure uses remembered moments to limit bookkeeping and focus the review on notable decisions.” That is the rationale without caricaturing all note-taking.
- Claude: **EDIT.** “Live notes record everything at one weight; the sweep keeps what was heavy enough to remember.”

**V10-06** · p.120
- Original: “if you are recalling none, no one was under pressure this session”
- ChatGPT: “If none come to mind, leave the sheet unchanged.” Failure to remember is not proof that no consequential choice occurred.
- Claude: **EDIT.** “If you recall none, leave the sheet blank; a quiet session is its own information.”

**V10-07** · p.121
- Original: “an aggressive taker who cooperates when spoken to”
- ChatGPT: “The recorded moments favor Force and Hunger, with one Deep Accord tally.” The original adds an unsupported motive to sparse data.
- Claude: **APPLY.** The chapter's own Structure constraint forbids the judgment.

**V10-08** · p.121
- Original: “arrives with her name on its logic”
- ChatGPT: “reflects those recorded decisions.”
- Claude: **EDIT.** “built from those recorded moments”.

**V10-09** · p.122
- Original: “If you catch yourself reaching for it mid-scene, the scene is not over”
- ChatGPT: delete. It is tautological and supplies no additional procedure.
- Claude: **APPLY.**

**V10-10** · p.122
- Original: “you’ve noticed the System notices you”
- ChatGPT: “The GM can explain that behavioral scores remain private.” Keep the fictional System's refusal separate from a clear answer to a player.
- Claude: **EDIT.** The GM's answer is plain: “the readings are private; the axes are in the book.”

**V10-11** · p.122
- Original: “That is how players feel seen without seeing the machine”
- ChatGPT: delete after the concrete instruction to reuse recorded moments in rewards.
- Claude: **APPLY.** Closer.

**V10-12** · p.123
- Original: “the app’s rehearsal”
- ChatGPT: “Testing the manual procedure can help identify what the app should record.” Optional production advice; consider keeping it in development notes rather than the rulebook.
- Claude: **EDIT.** Cut the sentence, or move it to Design Intent.

**V10-13** · p.123, heading
- Original: “External Consequence (Macro-System Outputs)”
- ChatGPT: “World and Faction Responses.” Plain description of the section's actual content.
- Claude: **EDIT.** “The World's Response”.

## Chapter 11, System Quests

### ChatGPT's content findings, verbatim

**Content questions:** The performance-reward instructions refer to the top/bottom of a 'band,' but the table supplies single amounts. Give ranges or a stated adjustment rule. Quest sharing needs rules for joining after partial completion, leaving, repeat joins, and nonparticipants; freeze/recalculate counts explicitly. Replace 'private subsection' inside an all-player shared document with a separate private record or an actual access-controlled implementation. Align the prompt's 'Level(in-Grade)' with continuous level numbering. The visible prompt prints '-13 lines'; likely intended '1–3 lines,' but confirm. The prompt requires a counter-pattern hidden outcome every time, while prose says testing is occasional; state whether having an alternative is different from a counter-pattern primary objective. Refusal after one offer versus the explicit3/6 thresholds needs consistent wording. Numeric faction reputation is used before its system exists: give a minimal temporary rule or make these consequences qualitative. Clarify whether a repeated kind of quest can recur under a new quest entry while a completed individual entry cannot be farmed.

**Preserve:** both epigraphs; quest entry fields; distinction between failure and refusal; three different hidden-quest presentations, once reconciled with Chapter12.

### What the source says, verified

| # | Verdict | Evidence (`55-quests.md` unless named) | rules data |
|---|---|---|---|
| Q1 Bands | CONFIRMED | 156 "sets the final number within the difficulty's band on the Reward Reference Table; the judged quality moves it toward the top or bottom of that band." Table 221 to 229 lists one integer per cell. | `quests.yaml` 28 to 34 single integers. |
| Q2 Sharing | mostly SILENT | 61 "Membership persists until a member leaves, the party disbands, or a member dies." 66 "re-prices a counted objective at the moment of sharing: the count multiplies by the number of holders." 67 "every holder who meaningfully participated collects the quest's award". Nothing on joining mid-quest, leaving, repeat joins, or whether the count freezes. | `quests.yaml` 16 shared_count_multiplies_by_holders true. |
| Q3 Private subsection | CONFIRMED; paper equivalent SILENT | 33 "Each player has a private subsection for personal and hidden quests visible only to them." Kit sheet has a `[ QUEST LOG ]` zone (`table-kit.html` 466 to 475), no private/shared distinction. | n/a |
| Q4 "Level (in-Grade)" | CONFIRMED | 285 and `templates/personal-opportunity.txt` 9 "Level (in-Grade): {level}". `25-cultivation.md` 73 "Levels are numbered continuously across Grades". Sample 315 uses "F-Grade L4". | n/a |
| Q5 "-13 lines" | NOT CONFIRMED in source | 311 and the template read "1–3 lines" (U+2013 en dash); the PDF listing mangles it. | n/a |
| Q6 Counter-pattern | CONFIRMED | Prompt 280 "and include a subtle counter-pattern option." and 306 item 6 "Hidden Alternative Outcome" (required). Prose 97 "By default it affirms ... and occasionally for no visible reason at all". | `quests.yaml` 6. |
| Q7 Refusal | PARTLY | No "after one offer" phrase exists. 170 "The System notes the refusal. Similar offers may decrease in frequency." Sample 328 "Refusal: Predator-tier opportunities offered less frequently for the next session." 180 to 181 "After 3 refusals: that quest type appears half as often. After 6 refusals: ... stops appearing." | `quests.yaml` 52 to 53. |
| Q8 Reputation | CONFIRMED | 130 "Reward: Faction reputation +1"; 258 "reputation, which is a faction-tracked stat that gates further faction quests"; 264 "Faction reputation (numeric, faction-tracked)"; 403 "Faction reputation is referenced throughout but not formalized." | `quests.yaml` 49 "Reputation drop with the issuing faction." |
| Q9 Recurrence | CONFIRMED (SILENT on kinds) | 101 Routine quests are "Reliable, repeatable, video-gamey." 142 "quest completion VE is awarded only once per quest ... once cleared, the same quest does not return on the same character." | `quests.yaml` 22 to 23. |
| Q10 Hidden modes | CONFIRMED | 344 to 369 modes: Fully Obscured, Partial Reveal, Post-Completion Only. 348 Fully Obscured "Appears in the log immediately when the System detects significant action". What Can Be Seen 94 "Hidden Quests do not appear in the log until they resolve". | `quests.yaml` 56. |
| Q11 Arbiter | CONFIRMED | 336 "The System AI is the arbiter; the GM uses the output as a draft and can revise". System AI 44 "The AI proposes; the GM decides. Nothing enters play unreviewed."; 156 "The GM, or the System AI in assisted modes, sets the final number". Same phrasing at Titles 90. | n/a |
| Q12 Party formation | CONFIRMED three triggers | 61 "Any Integrated being can extend a party invitation to another within line of sight; accepting is a thought." Tutorial 598 to 602 Q-001 "Stand within sight of two other Initiates. (0/2)" / "Party formation unlocked." Tutorial 634 to 637 "The moment two or more player characters stand within sight of each other, the System offers: ... Party formation: available." | `quests.yaml` 12. |
| Q13 Digital log | "required" NOT CONFIRMED | 35 "A handout-only or GM-narrated-only approach loses the in-fiction texture of the System UI. Make it present at the table." 33 frames the digital log as "Recommended table presentation". | n/a |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 11.1 | Reward bands against single numbers (156, 221) | CONFIRMED | **B** (D16). |
| 11.2 | Sharing edge cases | SILENT | **B:** counts set at sharing and frozen; a leaver keeps nothing; a joiner takes the current count. |
| 11.3 | "private subsection" of a shared document (33) | CONFIRMED; kit sheet has a quest-log zone | **A:** personal and hidden quests live on the player's own sheet or card. |
| 11.4 | "Level (in-Grade)" (285; template line 9) | CONFIRMED | **A:** "Level". |
| 11.5 | "-13 lines" | NOT CONFIRMED in source (311 reads "1–3 lines"); a rendering defect | **A:** "1 to 3 lines" in chapter and template; see Production. |
| 11.6 | Prompt requires a counter-pattern outcome every time; prose says occasional | CONFIRMED | **A:** the prompt's item 6 becomes optional. |
| 11.7 | Refusal wording against 3 / 6 | PARTLY | **A:** align. |
| 11.8 | Numeric reputation with no system (130, 258, 264, 403) | CONFIRMED | **B** (D15). |
| 11.9 | Recurrence of a quest kind | SILENT | **A:** "the same quest never returns; new quests of the same kind do". |
| 11.10 | Hidden-quest modes against What Can Be Seen | CONFIRMED | **A** (F2). |
| 11.11 | "The System AI is the arbiter" (336; also Titles 90) | CONFIRMED against System AI 44 | **A:** "The GM decides; the System AI drafts." Both places. |
| 11.12 | Party formation: Quests 61, Q-001 (tutorial 598 to 602), the Node offer (634) | CONFIRMED three triggers | **A:** the tutorial's offer appears when Q-001 completes, and says so. |
| 11.13 | Digital log "required" | NOT CONFIRMED (33 says "recommended") | **EDIT** (V11-02) only. |

### Rewrites

**V11-01** · p.126
- Original: “a softer consequence shape”
- ChatGPT: “a less punitive consequence.”
- Claude: **APPLY.**

**V11-02** · p.127
- Original: “A handout-only…approach loses the in-fiction texture”
- ChatGPT: “Make the log visible and persistent, using paper handouts or a shared digital record.” The book promises pencil-and-paper play; paper can present an interface effectively.
- Claude: **EDIT.** “Make the log present at the table: index cards, a shared page, or a screen.”

**V11-03** · p.128
- Original: “Party formation is itself HVE signal”
- ChatGPT: “A consequential decision to join or refuse a party may be relevant to the session-end sweep.” Routine acceptance alone does not meet Chapter10's cost requirement.
- Claude: **APPLY.** Inline bookkeeping.

**V11-04** · p.129
- Original: “Mandates are how the System bends the campaign”
- ChatGPT: “Use Mandates for regional objectives that affect the campaign.”
- Claude: **EDIT.** “Use Mandates for regional objectives that move the campaign.”

**V11-05** · p.130, optional
- Original: “Reliable, repeatable, video-gamey”
- ChatGPT: “Routine quests provide straightforward objectives and predictable reward scales.” Reconcile repeatability with the once-per-quest rule.
- Claude: **DECLINE.** The tone is wanted; “repeatable in kind” reconciles it with once-per-quest.

**V11-06** · p.132
- Original: “Below is the operational taxonomy”
- ChatGPT: “Use the following consequences by quest type.”
- Claude: **APPLY.**

**V11-07** · p.134
- Original: “They establish what ‘good’ looks like”
- ChatGPT: “Use these baseline awards to keep quest rewards consistent.”
- Claude: **LOCATE.** The quote is not in the source; find the sentence at apply time.

**V11-08** · p.136
- Original: “Locked content unlocked”
- ChatGPT: “Access to previously restricted regions, NPCs, vendors, or archives.”
- Claude: **APPLY.**

**V11-09** · p.137
- Original: “The System AI is the arbiter; the GM uses the output as a draft”
- ChatGPT: “The GM reviews and approves the generated quest.” Resolve the contradictory assignment of final authority.
- Claude: **APPLY.** With 11.11; also Titles line 90.

**V11-10** · p.138
- Original: “The title is a clue. The conditions are not”
- ChatGPT: “Give the player a suggestive title while leaving the exact conditions hidden.”
- Claude: **EDIT.** “The title is a clue; the conditions stay hidden.”

## Chapter 12, What Can Be Seen

### ChatGPT's content findings, verbatim

**Confirmed inconsistencies:** On p.144, the table reveals worn Bestowed titles only to an observer one Grade higher; the prose reveals them to peers. Choose one and align both, including permanently revealed Hidden Achievements and negative titles. On p.145, Hidden Quests never appear before resolution, contradicting Chapter11's Fully Obscured and Partial Reveal modes. State those exceptions. “Nobody at any Grade” sees another's HP/Aether should explicitly mean ordinary inspection, because the next section grants party access. Hidden Achievements are also not absolutely private until volunteered: the table gives three-Grades-higher inspection access. Define the action/range requirement for inspection and whether negative title effects must be seen to influence NPCs.

**Preserve:** explicit lists of visible information; distinction between glancing and studying an interface; the party frame as a meaningful benefit; translation epigraphs.

### What the source says, verified

| Item | What the source says (`57-what-can-be-seen.md`) |
|---|---|
| Table against prose | Table 65 to 69: "Same Grade: Achievement and HVE-Resonant titles. One Grade higher: The above, plus worn Bestowed titles. Two Grades higher: plus hidden Bestowed. Three or more: Everything, including Hidden Achievement titles." Prose 74 "A worn title is legible to every observer of equal or higher Grade." 78 negative titles: "everyone of equal or higher Grade can see them." Titles 262 defers here. |
| Nobody sees | 70 "Nobody at any Grade sees another person's Attributes, Health, Aether, Insight, or quest log." 84 the party frame shows "current Health, maximum Health, Aether, and whether they are Downed." |
| Hidden Achievements | 76 "Hidden Achievement titles are private until the holder chooses otherwise." Table row: three or more Grades higher sees them. |
| Hidden Quests | 94 "Hidden Quests do not appear in the log until they resolve"; Quests 348 Fully Obscured "Appears in the log immediately". |
| Mirrors | 92 "There is no in-fiction instrument that reads it and no title that reveals it." Tutorial 1027 "watching yourself the way the System sees you"; 1033 "treat their HVE Coherence as one tier higher." Breakthroughs 242 "Heart Demon Mirror (reveals HVE manifest during the trial)." |
| Inspection action | 48 to 52: the interface costs nothing and no Beat; inspecting others: no action or range stated. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 12.1 | Table against prose | CONFIRMED | **B** (D4). |
| 12.2 | Hidden Quests; "nobody sees"; Hidden Achievements | CONFIRMED | **A** (F2). |
| 12.3 | Inspection action and range | SILENT | **A:** a glance, no Beat, within sight. |
| 12.4 | Negative titles and NPCs who cannot see them | SILENT | **A:** a title only moves NPCs who can see it. |
| 12.5 | "No in-fiction instrument reads it" (92) against the tutorial's Mirror (1027, 1033) and the Heart Demon Mirror (Breakthroughs 242) | CONFIRMED | **A:** no instrument shows the axes or the numbers; mirrors and visions show the System's reading in images, and those can be wrong. |

### Rewrites

**V12-01** · p.142
- Original: “nothing at all about what it has concluded”
- ChatGPT: “keeps the underlying behavioral scores private.” Titles and classes plainly reveal some conclusions.
- Claude: **EDIT.** “and nothing about the record behind them”.

**V12-02** · p.142
- Original: “The systems being made visible are owned elsewhere”
- ChatGPT: “The rules for those systems appear in their respective chapters.”
- Claude: **APPLY.**

**V12-03** · p.143
- Original: “the interface reports state and never intention”
- ChatGPT: “The interface displays current statistics and unlocked information; it does not reveal hidden scoring or unearned rewards.” Quest objectives are intentional directives, so the slogan is too broad.
- Claude: **EDIT.** “the interface reports state and never the System's intent”.

**V12-04** · p.144
- Original: “a higher-Grade being does not resolve”
- ChatGPT: “Inspection returns no readable titles.” Readers should not infer that the being is visually blurred or unidentifiable by ordinary observation.
- Claude: **DECLINE.** “Does not resolve” is the endorsed in-fiction line; add the literal in the table cell: “Nothing: no titles resolve.”

**V12-05** · p.144
- Original: “concealment works on the people you meet and fails against the people you should be worried about”
- ChatGPT: “Concealment works against peers but not observers two or more Grades higher.” Avoid prescribing whom the character should fear.
- Claude: **EDIT.** “Concealment works against peers and fails against anyone two or more Grades higher.”

**V12-06** · p.145
- Original: “the frame is a fact where a person’s word is not”
- ChatGPT: “The party frame provides reliable resource information even between strangers.”
- Claude: **EDIT.** “the frame is a fact that needs no trust”.

**V12-07** · p.145
- Original: “It reports, it grants, and it withholds, and none of the withholding is negotiable”
- ChatGPT: “The System does not answer requests for hidden behavioral scores.” Narrow the rule to the information actually discussed.
- Claude: **DEFER.** The judge-and-explain sweep.

**V12-08** · p.145
- Original: Cut the final paragraph's repeated explanation of “the moment behavior becomes performance…” and cross-reference the privacy rule in Chapter10. The point has now been made in several chapters.
- ChatGPT: 
- Claude: **APPLY.** Cross-reference the Introduction's spoiler policy.

## Chapter 13, Bestiary

### ChatGPT's content findings, verbatim

**Content questions:** The Warden's behavior after the first damage but before losing a quarterHP is not defined: it stops qualifying for full-HP Indifferent Mode but has not entered Hostile Mode. Its3-Beats/two-Beat Yield needs explicit handling and an exception for not moving. At190HP, one quarter is47.5: specify whether hostile begins after47 or48 damage. State whether stat-block Force values include listed weapon training or whether the Rival Initiate adds its+5. Distinguish a monster's base catalog tier from its current difficulty to a particular character when calculating VE. Specify duration endpoints for 'one round' Exposed effects. The Wraith's PER-based attacks need an explicit exception to normal offensive-stat rules, and its 'active Principle infusion' should distinguish an attack carrying a Principle from the formal Mid Fragment Infusion tier. Explain whether the Alpha's Pack Tactics is normal Flanking or an additional bonus.

**Preserve:** concise creature behavior; the Wraith as a surviving ward rather than a soul; actual escape advice; the rule to telegraph an intelligent enemy's execution attempt.

### What the source says, verified

| # | Verdict | Evidence (`60-bestiary.md` unless named) | rules data |
|---|---|---|---|
| M1 Warden | PARTLY | 184 "While at full HP ... does not attack unless attacked"; 185 "Once it has lost a quarter of its HP"; the interval between first damage and the quarter is SILENT. 180 Beats 3; 186 "when it gives up both Beats"; Core 392 "two Beats, so two is all you have to give". Threshold: Bestiary gives no number; tutorial 1137 "48 damage"; Core 31 round-down makes 190/4 = 47. Cornered: tutorial 1139 "Cornered does not limit it; this is its stat block's exception"; Bestiary has no Cornered mention. | hp 190, beats 3, yields true; "a quarter", no number. |
| M2 Training | SILENT (general) / PARTLY (Rival) | 21 "Force values are pre-extracted at the creature's Grade". 131 "Wields a Knife (Trained blades, +5)" reads as on top of Off Force 30. Core 348 lists Trained Proficiency as a Tactical Modifier, separate from Force. | force 30; tactics "+5". |
| M3 Tier basis | PARTLY | 29 "Tier names size an enemy against opposition of its own Grade only". 194 "Force 30 fighting an enemy with Force 30 is a peer fight". Tutorial 879 pays catalog tier. | tier fixed per entry; `cultivation.yaml` 60 keys cross-Grade awards to "victim's tier within its own Grade". |
| M4 "One round" | undefined | 46 "Exposed for one round"; 94 "Exposed for next round". Core's own Exposed durations are "until the end of their next turn" (361, 363). | same wording. |
| M5 Wraith | Offense not stated; Infusion SILENT; physical CONFIRMED conflict | Core 323 to 327 Offensive Force is STR/DEX/POW only; PER is defensive (335). 172 "PER-based attacks (Sensory Pulse, Light or Truth Principles, scanning skills)"; "Sensory Pulse" occurs nowhere else. 170 "unless the weapon or attack carries an active Principle infusion" (Principles 159 names Infusion as the Mid Fragment tier). 170 "STR/DEX physical attacks are at −10" against tutorial 901 "Ordinary weapons pass through it; it can be hit by an attack aimed with PER Force ... and by skill shards". Tutorial 902 inventory is Edge, Pulse, Resonance; none named as harming it. | −10 text. |
| M6 Pack Tactics | SILENT | 153 "all of them gain +10 to Clashes" (unlabelled). 94 Snarljaw's own is labelled "(Flanking)". Stacking unstated. | same. |
| M7 Free strikes | CONFIRMED ambiguous | 57 "Ignores Free Strikes when leaving a Zone; it does not register the threat." | same. |
| M8 Surprise Beat | CONFIRMED mismatch | 105 "Surprise Beat on first turn." Core 237: surprising characters "immediately" take the Beat, "Then Initial Momentum is rolled normally"; Core 166 "a Beat outside a turn". Tutorial 865 repeats "on the first turn". | same. |
| M9 Multipliers | CONFIRMED phrases; sim partial | 27 "runs roughly a third longer"; 216 "closer to quadrupling the danger than to doubling it", "near even odds of losing the whole party"; 218 "roughly doubles the danger". `archive/backlog-resolved.md` 355 (2026-08-08 Monte Carlo) gives "Sentinel 2.3→3.1 rounds" (backs "a third"); the other two are asserted there without figures. The sim script is not in `tools/`. | yield_lengthens_by "about a third". |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 13.1 | Warden state | PARTLY | **B** (D6). |
| 13.2 | Stat-block Force and training | SILENT | **A:** state the convention in the chapter's opening: listed Force is what it rolls; listed Tactics bonuses add to it. |
| 13.3 | Catalog tier against current difficulty for VE | PARTLY | **A:** kills pay the catalog tier; `rules/cultivation.yaml` keys awards to the victim's tier within its Grade. |
| 13.4 | "One round" Exposed endpoints | undefined | **A:** "until the end of its next turn", Core's wording. |
| 13.5 | Wraith | CONFIRMED conflict | **B** (D7). |
| 13.6 | Pack Tactics | SILENT | **A:** label it Flanking. |
| 13.7 | "Ignores Free Strikes … does not register the threat" | ambiguous | **A:** "leaves a Zone without Disengaging; the free strike still comes". |
| 13.8 | "Surprise Beat on first turn" (105; tutorial 865) | CONFIRMED | **A:** Core's timing. |
| 13.9 | Danger multipliers | CONFIRMED unsupported | **B** (D22). |

### Rewrites

**V13-01** · p.149
- Original: “A solo elite that Yields runs roughly a third longer and stays about as dangerous”
- ChatGPT: “Yield can prolong a solo enemy’s survival by trading away its next actions.” Keep the number only if it has defined playtest support.
- Claude: **DECLINE.** The number has sim support (2.3 to 3.1 rounds).

**V13-02** · p.149
- Original: “reach for a group only when the grind is the point”
- ChatGPT: “Reserve group Yield for encounters intended to emphasize a coordinated defense.”
- Claude: **DECLINE.** Already permission form.

**V13-03** · p.150
- Original: “Ignores Free Strikes…does not register the threat”
- ChatGPT: **clarify**: “Leaves hostile Zones even when this provokes free strikes” if recklessness is intended; “Does not provoke free strikes” if immunity is intended. These produce different mechanics.
- Claude: **APPLY.** With 13.7: “leaves a Zone without Disengaging; the free strike still comes”.

**V13-04** · p.152
- Original: “Surprise Beat on first turn”
- ChatGPT: “Takes a Surprise Beat before Initial Momentum if its ambush succeeds.” Align timing with Core Mechanics.
- Claude: **APPLY.**

**V13-05** · p.157
- Original: “not winnable in a straight fight at F-Grade”
- ChatGPT: “Intended to overwhelm the low-level Tutorial party in a direct fight.” The late-F encounter table explicitly includes Peak enemies, and this Warden is F-Grade itself.
- Claude: **EDIT.** “built to overwhelm a Level 1 to 4 party in a straight fight”.

**V13-06** · p.158
- Original: “A character hitting the floor is a normal fight”
- ChatGPT: “Early encounters can Down a character; teach the stabilization rules before that happens.”
- Claude: **EDIT.** “Early fights put characters on the floor; the Downed rules are the safety net.”

**V13-07** · pp.158–159
- Original: “closer to quadrupling the danger” / “near even odds of losing the whole party” / “roughly doubles the danger”
- ChatGPT: replace with qualitative warnings about enemy action count, finite Yield, and restricted retreat. These precise-sounding balance claims need defined assumptions and evidence.
- Claude: **DECIDE.** D22, approved: rerun the sim; soften what it cannot back.

## Chapter 14, Items, Consumables & Volatile Artifacts

### ChatGPT's content findings, verbatim

**Confirmed production issue:** p.174's final bullet extends below the footer and off the page. The next page begins §14.8; the missing end is not readable. Restore the missing text and fix the layout before editing that passage. This was checked in the rendered PDF, not inferred solely from extraction.

**Content questions:** Aether Pills and Pulse Shards are explicit refill sources outside Consolidation; correct the earlier “nothing refills” statements. State whether lower-Grade healing/Aether pills work on higher-Grade bodies; the Attribute Treasure paragraph says its two-way lock is “the same logic as pills,” but the pill rule only explicitly forbids higher-to-lower use. Clarify whether shard backfire replaces or accompanies the normal effect. For the Reactive Buckler use “once after each recharge” if resting is the actual reset; 'once per encounter' alone misleads. Specify interactions between Anchor Shard's immovability and two-Beat Yield. Clarify which stat a thrown improvised explosive uses, how Area effects work, and why its proficiency differs from other throwing. Add Truthbinder action cost and a clear resistance/Grade policy. Check the tutorial's fixed scavenge list against p.174 before treating it as canonical.

**Preserve:** the shotgun and third-pill epigraphs; explicit administered-pill action cost; the split between fuel Cores and direct stat treasures; simple equipment benefits and constraints.

### What the source says, verified

| # | Verdict | Evidence (`65-items.md` unless named) | rules data |
|---|---|---|---|
| I1 Aether | CONFIRMED | 63 "Restore Aether mid-encounter"; 168 "Restore 30 Aether"; 74 "Aether primarily refills through Consolidation". Contradicting: Cultivation 62 "This is the only source of Aether regeneration"; Core 535 "It refills only through Consolidation"; Core 546 "nothing refills until Consolidation"; Quick Reference 62; kit 1475. | pills 10/25/50/80; shard 30. |
| I2 Pill direction | PARTLY | 49 "E-Grade pills heal ×10 ... An F-Grade body cannot process one at all" (one direction). 110 "Grade-locked in both directions, on the same logic as pills"; the pill rule states no upward direction. | higher_grade_pill_in_lower_body: no effect; treasures grade_locked_both_directions true. |
| I3 Backfire | CONFIRMED (discretion) | 172 "The GM and the System AI generate an unpredictable effect"; "The GM's discretion is the risk." No table. 175 "natural 01–05 backfire". Rows imply replacement ("you remain visible", "The IP is lost"). | backfire_natural [1, 5]. |
| I4 Buckler | CONFIRMED | 183 "Once per encounter ... does not reset until the next Consolidation." Tutorial 657, 670 same. | both clauses present. |
| I5 Anchor Shard | SILENT | 170 "cannot be moved by any effect (moving yourself is fine)"; Core 395 two-Beat Yield "may drive you into an adjacent Zone". | same. |
| I6 Explosive | PARTLY, self-conflicting | 146 "explosives ... are improvised objects, and the shell carries the user's Force"; 127 improvised = STR, Proficiency none; 142 "Anything you let go of is archery and throwing"; Core 325 "Ranged (bows, thrown, crossbow): DEX Force". Core 412 lists "a thrown explosive" as AoE. | improvised: STR, none. |
| I7 Truthbinder | SILENT | 200 "Forces a single yes/no answer from one detained, non-hostile target. Single use". No cost, resistance, or Grade. | same. |
| I8 Outfitting | lists MATCH | 244 is the overflowing bullet: "Items fill three roles for a classless character, and the tutorial leans on all three: shards and one-shots are verbs (a move available once), weapons and armor are vessels (a weapon carries no bonus of its own and decides which Force governs, routing Marks toward the domains a character uses; armor's modifiers are listed on it), and Resonance Shards and affinity treasures are seeds (insight paid forward)." 238 "One spear, one armor set, one buckler, four shards, one pill, one Resonance Glass" = tutorial 651 to 659. Tutorial 668 to 672 duplicates the verbs / vessels / seeds passage. | n/a |
| I9 Sets | CONFIRMED | 210 "Stackable up to one set per character." | "One set per character." |
| I10 "an edge" | CONFIRMED | 144 "and so does an axe Master who has never trained with an edge." | weapon_bonus +0 untrained. |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 14.1 | Pills and shards restore Aether against "only Consolidation" | CONFIRMED | **A** (F2). |
| 14.2 | Lower-Grade pills in higher bodies | PARTLY | **A:** they work at their own numbers. |
| 14.3 | Volatile Shard backfire is GM discretion (172) | CONFIRMED | **B:** recommend "the effect lands on the user" as the default backfire. |
| 14.4 | Reactive Buckler "once per encounter" and a Consolidation reset (183) | CONFIRMED | **A:** "once between Consolidations". |
| 14.5 | Anchor Shard and two-Beat Yield | SILENT | **A:** the Margin still drops; the drive fails. |
| 14.6 | Thrown explosive: stat and Proficiency (146, 127, 142) | PARTLY, self-conflicting | **A:** DEX, archery and throwing (anything you let go of). |
| 14.7 | Truthbinder cost and resistance | SILENT | **B:** 1 Beat, no roll, same Grade or lower. |
| 14.8 | "Outfitting the Tutorial" against the tutorial's scavenge list | MATCH | none; the page overflow is Production. |
| 14.9 | "Stackable up to one set" | CONFIRMED | **A.** |
| 14.10 | "trained with an edge" | CONFIRMED | **A.** |

### Rewrites

**V14-01** · p.164
- Original: “It takes an hour, and it puts you on the floor”
- ChatGPT: “Absorbing an Attribute Treasure takes one hour, during which the character is defenseless.” Keep one concrete sensation afterward if desired.
- Claude: **EDIT.** “Absorbing one takes an hour, and the character is defenseless for all of it.” One sensation afterward may stay.

**V14-02** · p.164
- Original: “The memorable time is the hour somebody spent lying on the floor of a ruin, changing”
- ChatGPT: “Absorbing one in an unsecured area requires allies to guard the character.” State the practical tradeoff; let play create the memorable scene.
- Claude: **EDIT.** “Absorbing one in the open needs someone standing guard.”

**V14-03** · p.165
- Original: “the genre expects nothing less”
- ChatGPT: delete. The rule allowing concentrated treasure investment needs no genre mandate.
- Claude: **APPLY.**

**V14-04** · p.165
- Original: “only one of them shows up on the Attribute line”
- ChatGPT: “Attribute Treasures raise a stat directly; Cores add VE toward later levels.” Cores can ultimately produce stat growth too.
- Claude: **EDIT.** “Attribute Treasures raise a stat directly; Cores add VE toward later levels.”

**V14-05** · p.165
- Original: “The wielder is the weapon” / “the Margin is the physics”
- ChatGPT: “Ordinary weapons use the wielder’s Force and the Clash Margin to determine damage.” This communicates the intended abstraction without overstating a physical model.
- Claude: **EDIT.** “Weapons carry no bonus; the wielder's Force and the Margin decide the damage.”

**V14-06** · p.167
- Original: “an axe Master who has never trained with an edge”
- ChatGPT: “an axe Master who has never trained with swords.” Axes also have edges; the game distinguishes weapon domains.
- Claude: **APPLY.**

**V14-07** · p.168
- Original: “disposable verbs”
- ChatGPT: “single-use actions.” The vocabulary belongs to design discussion; a player needs to know what the item lets them do. Also qualify 'exactly once' because some artifacts recharge.
- Claude: **DECIDE.** The verbs / vessels / seeds taxonomy is a design note; the book's own voice rule says a taxonomy must not stand in for the item rules. Recommend: keep it in the GM reference as framing, use “single-use action” in rules text (also V14-13, V15-13).

**V14-08** · p.169
- Original: “The GM’s discretion is the risk”
- ChatGPT: **clarify** the Volatile Shard's backfire outcome or supply a small random table. This is a missing effect, not an evocative description.
- Claude: **DECIDE.** With 14.3: default backfire is “the effect lands on the user”.

**V14-09** · p.169
- Original: “punish those who treat them as reliable tools”
- ChatGPT: “Each use has a5% backfire chance.” The probability explains the risk without prescribing punishment.
- Claude: **EDIT.** “backfire on a natural 01 to 05”.

**V14-10** · p.171
- Original: “Stackable up to one set per character”
- ChatGPT: “A character can benefit from only one set.”
- Claude: **APPLY.**

**V14-11** · p.172
- Original: “If the party is hoarding…never spending them, the GM is being too generous”
- ChatGPT: “If items go unused, check whether players understand their effects and expect opportunities to replace them before changing the drop rate.” Hoarding can arise from perceived scarcity, not abundance.
- Claude: **EDIT.** ChatGPT's diagnostic version.

**V14-12** · p.174
- Original: “the sharpest test in the tutorial”
- ChatGPT: “a choice between immediate equipment benefits and future Principle progress.” Name the decision instead of ranking its drama.
- Claude: **APPLY.** A superlative about the design's own scene.

**V14-13** · p.174
- Original: “they give…characters verbs beyond posture and position”
- ChatGPT: “they give starting characters additional actions before classes and Principles provide more abilities.”
- Claude: **DECIDE.** With V14-07.

## Chapter 15, The Tutorial: Integration Protocol

### ChatGPT's content findings, verbatim

**Content and procedure findings**

1. **Session count, pp.4,177–179:** the introduction promises three sessions; the Tutorial defaults to two long sessions or four short ones. Use the Tutorial's actual schedule everywhere.
2. **Probe timing, pp.186,190:** 'two or three minutes' conflicts with 'sixty seconds…two minutes is the ceiling.' Choose a single flexible target.
3. **Arrival privacy and teaching:** Phase2 asks four players to wait through roughly an hour of separate lessons. This is a real tradeoff, not necessarily a flaw. Preserve it if private decisions matter most, but tell the GM in preparation and offer short pre-session individual scenes or clearly defined downtime for waiting players. No chapter rearrangement is needed.
4. **Guaranteed combat, pp.192–202:** successful avoidance still produces the mandatory fight later, and the GM is told to add pressure until Yield matters. This can make the apparent tactical choice feel cosmetic. Make the guaranteed combat lesson a stated scenario premise and use the existing post-fight example when the character wins cleanly.
5. **Read-aloud disclosures, pp.192,197,222:** GM text says some facts remain unknown, while narration asserts motives or conclusions ('coming apart on purpose,' a nineteen-day count). Decide what is observable and what is GM knowledge. The concrete descriptions are strong enough without inferring intent for the player.
6. **Starting loot and scarcity, pp.203,207–208:** the slopes supply weapons for everyone and two or three shards per character before the Node's scarce pile. That may be intended, but it weakens the later claim that characters lack basic options. Keep the quantity if it supports play; describe the Node as competition for specific desirable upgrades rather than universal shortage.
7. **Party unlocking, pp.127,205,207:** core rules permit any Integrated being to invite another; Q-001 says party formation unlocks after seeing two others; the scene offers it when two PCs meet. Specify the Tutorial exception and exact unlock trigger.
8. **Battle Memory timing, pp.52,197,223,228–229:** general rules say next Consolidation; the Flicker says the rest at the end of the Ruins; another section permits the intervening camp. State that the player may process a Memory at any later Consolidation if banking is intended. Move the explicit one-use rule from p.229/cards into Chapter5.
9. **Trapped Intelligence IP, pp.226,229:** the choice says its meditation pays+1 IP, while the later rule lists it as an immediate+1 plus a separate1–3 from meditation. Choose one payout and synchronize the card guidance.
10. **Aura duration, pp.28,218,227:** core Suppression belongs to the encounter and allows situational retries. The Wild demonstration imposes it on the next encounter after the being passes; the Threshold imposes it for the entire Tutorial. State these as explicit special effects and specify whether normal recovery attempts work. A potentially lasting one-Beat penalty should be conveyed before an irreversible teaching choice.
11. **Wraith, pp.155,220:** Bestiary says ordinary physical attacks suffer−10; Tutorial says they pass through and implies PER or shards are required. Choose one. Also clarify which shards can actually harm it: a Pulse Shard only restores Aether.
12. **Civic chronology, pp.181,222–224:** Kith entered nineteen days ago; the three short marks imply they left three days ago; the reward explanation says they lived there nineteen days and then left three days ago. Clarify whether19 is elapsed time since arrival or duration of occupancy. Explain who added the short marks after they left, if that is what the tally means.
13. **Interpretation, pp.181,224,241:** the Kith come from an old Integrated world, while Interpretation is said to be granted to every Integrant at accession. Why do they lack it in this old sector? State whether the sector suppresses existing Interpretation, the Kith are newly acceded despite their origin, or something else. Also distinguish ordinary System notices from untranslated Kith records and legacy interfaces.
14. **Known information versus blind decisions, pp.208,225–228,249:** the book promises enough information to choose, but tells the GM to say only that the Resonance Shard 'resonates.' A player cannot knowingly choose delayed advancement without learning its broad function. Preserve hidden exact rewards, but give a clear category of consequence when asked.
15. **Offering, p.226:** a permanent Attunement can arrive before Seed, where the core rules normally grant it. Label this as a specific item exception. The knife also has an intrinsic bonus despite the general weapon claim; narrow that claim to ordinary equipment.
16. **Mirror, pp.145,226–227:** a surface showing how the System sees a character appears to contradict 'no in-fiction instrument' reads HVE. Specify that it shows an interpretation without exposing axes or scores if that is the intended distinction. The Heart Demon Mirror in Chapter7 needs the same boundary.
17. **Other Initiate, p.227:** 'fight the threat for them' appears to be helping, yet gives a separate half-reward; the character's prize vanishes when any resolution occurs. Define how this route differs from Help and what the player perceives about the time cost.
18. **Purge/causeway procedure, pp.231–239:** one person per round is clear, but initial Warden distance, causeway Zones, arrival timing, and rounds before the Purge reaches the gate are not. The30-minute fictional timer and unmeasured Beats do not determine them. Add a small setup diagram/table with defaults, then explicit adjustments for sector benefits and queue size. This is the largest missing procedure in the climax.
19. **Warden, pp.157,234,237:** p.234 supplies the missing48-damage threshold and Cornered immunity; copy both to the Bestiary. Define partial-damage behavior, the remaining Beat after two-Beat Yield, and whether a sacrificial attack triggers Hostile Mode regardless of48 damage. A taunt or attack should not rely on an unstated exception.
20. **Gate queue, pp.183,207,237:** the NPC table excludes unaided Node strangers from the queue; the Node scene puts each living stranger there; the gate scene says everyone kept alive is there. Pick one criterion. Name the woman in running clothes if she is intended to be a recurring saved NPC.
21. **Survival exception, p.239:** put this rule in the preparation checklist with a cross-reference from every potentially fatal scene. It changes Downed countdowns and annihilation, so a GM should know it before running the first private fight. Decide whether players learn it at setup or only if asked; that is an authorial choice about the experience.
22. **Gate and titles, pp.238–239,269:** specify whether Gate-Runner can go to an NPC sent first. Salvaged's−2 HRT needs a stat floor and a clear restoration rule upon release. “Came Back Whole” intentionally leaves its bonus to the GM on the card, but its main entry should also say that and give the relevant range. Add Salvaged and Came Back Whole to the supposedly complete Tutorial title table on pp.102–103.
23. **Level floor versus variable rewards, pp.247–248:** p.247 says a low route ends at Level3, but p.248 tops every character up to Level4. State the final policy in the ledger: “Before the completion bonus, a low route may be Level3. The bonus brings total earned VE to at least360.” Also265VE is Level3 plus25/120, not a third of a level.
24. **Arrival reward ledger, p.247:** two Frenzy Rats pay10VE, not the listed2–4. The probe stone can give10VE but Phase1 says no optional reward. Survival is per session, so two-session and four-session formats produce different survival totals. An arrival rescue without a kill also needs explicit handling before calling that award guaranteed.
25. **Sector income, pp.211,223,228:** a sector does not reliably pay120VE. For example, surveying the Arcane Debris without fighting the Wraith pays40VE before optional rewards. The one-time60VE Kith encounter cannot fund both sectors. Recalculate representative paths before promising everyone Mild Saturation and a first level at the intervening camp.
26. **Sample summaries, pp.242–243:** include starting level, previously refined remainder, and stored VE before projecting a finishing level. Stored VE alone cannot determine it. Ten-Slayer at4/10 exposes an unearned title threshold, contradicting the title privacy rule. Use a completed reveal or remove the visible progress line.
27. **Three-day ending, pp.240–244:** arrival on Earth is day3, followed by a full day or more of rest, then a stinger still says three days after disappearance. Either move the hook before the long rest or update elapsed time. The Kith's first translated sentence appears both before the summary and as a later first-time stinger; offer these as alternate placements.
28. **Outcome checklist, pp.246–248:** a character can win cleanly without ever choosing Yield; titles and Memories also depend on choices. Do not force a prior event to have occurred. Check whether a mechanic was understood, using an example if needed, and keep actual awards tied to actual play.

**Production correction, p.242:** the sample summary’s decorative separator lines run into the title and final VE field. Restore the intended line breaks.

**Preserve:** “Everything outside a box is for you”; the revised what-ends-each-phase column; clear NPC fates; fixed countdown after the Mandate; “If confusion is costing fun, stop and explain”; the mechanical versus effect-roll distinction at the runes; the Kith's language barrier and later translation payoff; the unsettling specificity of salvage from dead worlds. The stonefold, Kes's marks, and Hessar's technique provide more atmosphere than repeated claims that the System is watching.

### What the source says, verified

| # | Verdict | Evidence (`70-tutorial.md` unless named) |
|---|---|---|
| 1 Sessions | CONFIRMED | Introduction 69 "your campaign's first three sessions, ready to run." 23 "usually takes two sessions"; 38 "Two sessions of three and a half to four hours is the default"; 40 "Four sessions of two hours"; 1502 same. |
| 2 Probe timing | CONFIRMED | 152 "Two or three minutes per player." 251 "sixty seconds is about right and two minutes is the ceiling." |
| 3 Waiting | PARTLY | 261 "the players not in the scene are waiting." Alternatives: 155 "in another room or by direct message"; 263 "Take players aside, run them by message, or rotate around the table." No pre-session option stated. |
| 4 Mandatory fight | CONFIRMED | 291 "The arrival fight is not optional ... it comes however the scene ended." 513 "If the dice give the character an easy win, add pressure." Avoidance options exist (312 "Walk away", 483 "Back out without engaging"). |
| 5 Read-aloud inference | PARTLY | 296 "coming apart on purpose"; 923 "Nineteen days. The last three marks are shorter." 941 rewards deducing "a group lived here nineteen days," which 923 already states. |
| 6 Loot | PARTLY | 561 "a weapon for whoever wants one ... two or three Skill Shards per character." Items 237 "the shortfall is the point"; 243 "verbs beyond posture and position." |
| 7 Battle Memory timing | CONFIRMED | Principles 91 "During the next Consolidation, the player describes how their character meditates." 411 "note it for the Consolidation at the end of the Ruins." 956 "Battle Memories may be meditated on here [camp between sectors]." One use: 1080; kit 1077. Not in Principles. |
| 8 Trapped Intelligence | CONFIRMED | 1021 "the meditation carries the dying technique and pays +1 IP toward an Accord-aligned family." 1080 "awards 1 to 3 IP ... the +1 IP some triggers award on the spot (... the Trapped Intelligence) is a separate award." |
| 9 Aura duration | CONFIRMED; warning SILENT | Core 502 "resistant for the rest of the encounter"; Core 505 "Suppression breaks only on a meaningful change in the fiction". 875 "Suppressed (1 Beat) for the next encounter." 1051 "Suppressed for the rest of the tutorial (1 Beat)." Player-facing text is only 1049 and kit 1412 "Crossing: not recommended". |
| 10 Chronology | CONFIRMED | 77 "entered nineteen days ago"; 923 "Nineteen days. The last three marks are shorter"; 941 "lived here nineteen days ... left three days ago." `lore/setting.md` 404 "Kith arrival nineteen days early \| [nobody]"; no 19-versus-3 chronology. |
| 11 Interpretation | SILENT on the Kith | 968 "This sector predates Interpretation ... nothing in the valley grants it." `lore/setting.md` 145 same; 230 "Initiates ... from Oren, an older Integrated world"; neither says whether the Kith hold it outside. |
| 12 Resonance Shard | CONFIRMED | 666 "Say what the System says, which is that it resonates, and nothing more"; Items 239 "Say only that it resonates." 1498 "Every player still gets enough information to make their choices and understand the consequences." |
| 13 Offering | CONFIRMED | 1014 seed: "+2 IP toward that family and a permanent Attunement"; Principles 241 "From Seed tier, a Principle grants Attunements" (Seed = 10 IP). 1013 knife "+5 on the first Clash of any combat"; Items 120 "Weapons ... carry no bonus of their own"; Items 140 allows "System-forged ... bespoke items the GM designs." |
| 14 Mirror | CONFIRMED | 1027 "watching yourself the way the System sees you"; 1033 "treat their HVE Coherence as one tier higher." What Can Be Seen 92 "There is no in-fiction instrument that reads it." Breakthroughs 242 "Heart Demon Mirror (reveals HVE manifest during the trial)." |
| 15 Other Initiate | CONFIRMED | 1041 Help: "Bestowed title ... 'The Hand That Reached'"; 1043 "Fight the threat for them, then claim the prize. Half reward: no pill, three peer kills' worth of VE (30)"; 1045 "The window closes when the danger resolves, however it resolves." |
| 16 Queue | PARTLY | NPC table 89 "joins the gate queue in Phase 5" (if helped), 91 "part of the gate queue." Node 622 "everyone the party kept alive in Phase 2." Gate 1187 "Everyone the party's choices kept alive." The woman in running clothes is unnamed at 389, 622, 1187 and absent from the NPC table. |
| 17 Gate titles | SILENT / SILENT / CONFIRMED | Gate-Runner: 1198, Titles 222, `titles.yaml` 76 "First character through the tutorial gate"; no NPC ruling. Salvaged: 1217 "−2 Raw HRT"; no floor; 1222 "converts", no restoration stated. Came Back Whole: 1222, Titles 151, `titles.yaml` 44 name no effect; only kit 1192 "EFFECT IS YOURS TO SET FROM THE CATALOG'S RANGES." |
| 18 Three days | CONFIRMED | 1242 "three days after they left it"; 1275 "Elapsed: 3 days"; 1361 "a full day or more of camp"; 1375 "three days after they vanished." Kith sentence: 1278 "before the Individual Summary" and 1376 Stinger. |
| 19 Ten-Slayer 4/10 | CONFIRMED | 1314 "Hidden Quest revealed: 'Ten-Slayer.' Progress: 4/10." Ten-Slayer is an Achievement title (Titles 170, 275). What Can Be Seen 43: the interface does not display "criteria for any title, quest, or achievement that has not yet fired"; Titles 56 "Players never see criteria in advance." |
| 20 Outcome checklist | CONFIRMED | 1472 "Survived a Clash that would have dropped them, by choosing Yield." (1424 in the tracker says "taught".) |
| 21 Causeway | CONFIRMED | 1185 "It processes one person per round"; 1135 three Zones per turn; 1122 "count rounds only on the causeway"; 1187 "A queue of eight is eight rounds on the span." No Warden start, span length, or deadline in rounds. 1230 "the wall is 800 meters off and closing at a walking pace". |
| 22 Warden | CONFIRMED | 1133 to 1139: the 48 threshold and the Cornered exception are here and absent from the Bestiary (see Chapter 13). |
| 23 Ledger | CONFIRMED | 1446 to 1465; 496 "2 Frenzy Rats" (Easy, 5 each); 842, 879, 910, 943 sector awards; 951 "One sector pays about a level's worth of VE, 120"; 985 the Initiates' 60 once; 1316 "265 ... Level 5"; 1459 "265 VE, which is Level 3 with a third of a level banked"; 1465 completion bonus to Level 4. |
| 24 Survival exception | CONFIRMED | 1232 in Phase 5's Watch For; the first private fight is Phase 2 (487). |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 15.1 | Session count | CONFIRMED | **A** (1.2). |
| 15.2 | Probe timing: 152 "two or three minutes" against 251 "sixty seconds … two minutes" | CONFIRMED | **A:** one target, sixty seconds to two minutes. |
| 15.3 | Arrival waiting | PARTLY (261 names the wait; 155 and 263 allow messages) | **A:** state the pre-session option plainly: run Phases 1 and 2 by message before the session. |
| 15.4 | Mandatory fight (291) and "add pressure" (513) | CONFIRMED | **A:** the fight is a stated premise; cut "add pressure" and use the post-fight example (V15-09). |
| 15.5 | Read-aloud inference: "coming apart on purpose" (296); the tally reward restates the count (941) | PARTLY | **A:** "in an order"; the reward is for the deduction (they left, and why); the count is already on the wall. |
| 15.6 | Slopes loot against Node scarcity | PARTLY | **A:** the Node is competition for the good upgrades. |
| 15.7 | Battle Memory timing across four places; one-use rule | CONFIRMED | **A:** any later Consolidation; one-use rule into Principles (5.3). |
| 15.8 | Trapped Intelligence pays +1 twice (1021, 1080) | CONFIRMED | **A:** +1 on the spot; the meditation pays 1 to 3 like any memory. |
| 15.9 | Aura durations (Core 502, tutorial 875, 1051); the Threshold's lasting penalty unannounced | CONFIRMED; SILENT | **A:** label both as the scene's terms. **B:** the Threshold card carries the persistence in-world: *[Crossing: not recommended. Residual pressure: persistent.]* |
| 15.10 | Civic chronology | CONFIRMED | **B** (D19). |
| 15.11 | Kith and Interpretation | SILENT | **B** (D20). |
| 15.12 | Resonance Shard disclosure | CONFIRMED | **B** (D17). |
| 15.13 | Offering: Attunement before Seed; the knife's +5 against "no bonus" | CONFIRMED | **A:** label the Attunement as the item's exception; Items narrows "no bonus" to ordinary weapons (System-forged items may carry one, 140). |
| 15.14 | Mirrors | CONFIRMED | **A** (12.5). |
| 15.15 | Other Initiate: fight-for-them against Help | CONFIRMED thin | **A:** say what the player sees (the initiate a round from being overrun) and that claiming the prize is the difference. |
| 15.16 | Queue criterion; the unnamed runner | PARTLY (Node 622 and gate 1187 agree; the NPC table is per row) | **A:** one sentence in the NPC table: anyone alive at Phase 5 is in the queue. **B:** name the woman in running clothes (referred to three times). |
| 15.17 | Gate-Runner to an NPC; Salvaged floor and restoration; Came Back Whole | SILENT; SILENT; CONFIRMED | **A:** player characters only; −2 HRT to a minimum of 1, restored on release. **B** (D21). |
| 15.18 | Three-day ending (1242, 1361, 1375); the Kith sentence twice (1278, 1376) | CONFIRMED | **A:** the Stinger drops the day count; the Kith option says "if you held it back". |
| 15.19 | "Ten-Slayer. Progress: 4/10" (1314) against the no-criteria rule | CONFIRMED | **A:** cut the progress line from the sample. |
| 15.20 | Expected Outcomes "Survived a Clash … by choosing Yield" (1472) | CONFIRMED | **A:** "understands Yield: chose it, or was walked through the example after a clean win". |
| 15.21 | Causeway setup | CONFIRMED | **B** (D5). |
| 15.22 | Warden | CONFIRMED | **B** (D6). |
| 15.23 | Ledger and summaries | CONFIRMED | **A** (F5). |
| 15.24 | Survival exception placement | CONFIRMED | **A** (F4). |

### Rewrites

**V15-01** · p.181, optional
- Original: “it is a catastrophe with a direction”
- ChatGPT: delete after the new literal explanation of the Warden's route. It now repeats clear information rather than supplying it. It could survive as an epigraph or isolated description if desired.
- Claude: **DECLINE.** One strong line per scene is allowed.

**V15-02** · p.182
- Original: “None of this needs discovering; it is the ground the party walks on”
- ChatGPT: “Use this history to keep descriptions consistent; players do not need to uncover it to complete the tutorial.”
- Claude: **EDIT.** “This history is for consistency; players do not need to uncover it to finish the tutorial.”

**V15-03** · p.183
- Original: “The party cannot defeat it”
- ChatGPT: “The Warden is intended to overwhelm the starting party; emphasize escape and delay.” Elsewhere the text supplies damage-amplifying artifacts and even rewards for killing it.
- Claude: **EDIT.** With D6: “The Warden is built to overwhelm the party in a straight fight; play it as something to route around, slow, and outlast.”

**V15-04** · p.189
- Original: “choose the landing that fits the encounter you planned for them, and tell them it was their choice”
- ChatGPT: “Place them in the direction they chose, adapting the encounter to fit.” The original instructs the GM to claim player control while assigning the result independently. This is an agency recommendation, not just line polish.
- Claude: **EDIT.** “Place them where their choice leads, and fit the encounter to it.” Telling players a result was their choice when it was not is against the scenario voice.

**V15-05** · p.192
- Original: “A choice made without knowing a rule is a choice about the rule”
- ChatGPT: “Do not use an uninformed rules decision as evidence of the character’s motives.” The new version says exactly what the later sweep note intends.
- Claude: **EDIT.** The plain form of the book's own ruling: “Do not read a choice made in ignorance of a rule as evidence of the character's temperament.”

**V15-06** · p.193
- Original: “Nothing follows them for it”
- ChatGPT: “Walking away has no additional consequence in this scene.”
- Claude: **EDIT.** “Walking away costs nothing further in this scene.”

**V15-07** · p.195
- Original: “Which of three chances…the character takes when they can reach only one”
- ChatGPT: “Which situation they address first, knowing the others may change while they act.” Ray remains there until dark, so the claimed one-choice limit does not match the clocks.
- Claude: **EDIT.** “Which of the three they go to first, knowing the others may change while they act.”

**V15-08** · p.198
- Original: “the slowest safe road down, and their arrival creature finds them on it”
- ChatGPT: “a slower route that avoids the pack’s hunting ground; their arrival creature still finds them.” Qualify safety rather than immediately contradicting it.
- Claude: **EDIT.** “the slower road that skirts the pack's hunting ground; their arrival creature still finds them on it.”

**V15-09** · p.201
- Original: “the fight has to produce one”
- ChatGPT: “If the character never faces a damaging hit, explain Yield with the example after combat.” The paragraph already permits this. Removing the forced-loss premise avoids manufacturing danger merely to deliver a lesson.
- Claude: **EDIT.** “the fight usually produces one; if the character never faces a hit that would drop them, teach Yield with the example after.”

**V15-10** · p.202
- Original: “either way it closes on her again while she cannot act”
- ChatGPT: “On its next turn it can pursue or attack, depending on where it moved her.” The Husk Crawler has one Beat and cannot necessarily both move a Zone and attack.
- Claude: **EDIT.** The Crawler has one Beat: “on its next turn it closes or attacks, depending on where it moved her.”

**V15-11** · p.204
- Original: “Nothing gets written during the rotation”
- ChatGPT: “Leave HVE scoring until session end.” Players have been instructed to write resources and Marks, and the GM must track encounter state.
- Claude: **EDIT.** “Leave the HVE sheet alone during the rotation.”

**V15-12** · p.206
- Original: “Nobody is coming to collect it”
- ChatGPT: “No one is supervising the pile.” If the intended claim is permanent abandonment, reconcile it with the recovery cradle that will collect the valley.
- Claude: **EDIT.** “No one is guarding it.”

**V15-13** · pp.208–209
- Original: Replace **Verbs / Vessels / Seeds** with **Limited-use abilities / Equipment / Principle progress** if retaining this classification. 'Vessels' adds a metaphor but does not help a new GM use a spear or armor.
- ChatGPT: 
- Claude: **DECIDE.** With V14-07.

**V15-14** · p.211
- Original: “Do not tell the players it is time to rest. The System does that”
- ChatGPT: “Use the following System notice to introduce Consolidation.” A rhetorical opposition obscures a simple presentation instruction.
- Claude: **EDIT.** Table instruction is plain: “Introduce Consolidation with the System's advisory below.”

**V15-15** · p.212
- Original: “with most of the table a level or two up and Saturated for the first time”
- ChatGPT: “after the party has processed the rewards from its chosen sectors.” Saturation may already have ended during the very Consolidation named as the phase's endpoint; progression varies by route.
- Claude: **EDIT.** “after the party has taken what its sectors paid”.

**V15-16** · p.217
- Original: “wins that fight comfortably”
- ChatGPT: “faces a much more manageable fight.” A low-level party can still lose to a single Snarljaw; do not guarantee the result.
- Claude: **EDIT.** “has the easier fight”.

**V15-17** · p.218
- Original: “The save fails unless the die explodes”
- ChatGPT: “Characters with a combined bonus below15 can succeed only with an exploding roll.” Higher eligible Attributes can meet115 without an explosion. Use the actual bonus for the character being taught.
- Claude: **EDIT.** Decline the correction: a starting character's bonus (HRT Force plus half FOR Force) is at most 15 against 115, so only an exploding die reaches it, and ChatGPT's own condition (“below 15”) describes every starting character. Show the math once: “The save is d100 + HRT Force + half FOR Force against 115; a starting character's bonus is at most 15, so the save fails unless the die explodes.”

**V15-18** · p.222
- Original: “what it binds is the record”
- ChatGPT: “The ruling is recorded by the System and may influence later offers, but it is not enforced outside the building.”
- Claude: **EDIT.** “The System records the ruling and may quote it in later offers; nothing enforces it outside the building.”

**V15-19** · p.225
- Original: “the party has made an enemy in a closing world”
- ChatGPT: “The surviving Kith remain hostile and will not assist at the gate.” Supply a usable consequence.
- Claude: **EDIT.** “The surviving Kith stay hostile and will not help at the gate.”

**V15-20** · p.225, optional
- Original: “Charisma-invested characters need a stage the exploration choice cannot skip”
- ChatGPT: “Run this encounter for every party so social characters have a substantial opportunity to contribute.”
- Claude: **DECLINE.** Optional.

**V15-21** · p.226
- Original: “painful and disorienting” + “The technique arrives as the memory itself”
- ChatGPT: “The character receives a Battle Memory of the technique, not a usable ability.” Keep a short sensation in narration; make the reward unmistakable in GM text.
- Claude: **EDIT.** The technique memory is the lore ruling; make the reward unmistakable: “The character receives a Battle Memory of the technique. It pays IP at meditation like any memory.” A short sensation may stay in the read-aloud.

**V15-22** · p.227
- Original: “The warning was the lock”
- ChatGPT: “The door has no physical lock; it opens at a touch.” If retaining the original as a punchline, put the literal information first. Update the card's 'locked door' too.
- Claude: **EDIT.** Literal first: “The door has no lock; it opens at a touch. The warning was the only barrier.” Update the card's “locked door”.

**V15-23** · p.234
- Original: “Every competence the party invested in has a way to contribute”
- ChatGPT: “The following approaches can help the party reach the gate.” The table covers six approaches, not every possible character competence.
- Claude: **EDIT.** “The approaches below can each help the party reach the gate.”

**V15-24** · p.236
- Original: “every hit lands20 points harder”
- ChatGPT: “Cornered removes the option to spend a second Beat on Yield, so a character can prevent at most20 Margin per hit.” Damage does not always increase by20: small Margins, already-spent Beats, and choosing not to Yield are exceptions.
- Claude: **EDIT.** “Cornered removes the second Beat of Yield, so a character can shave at most 20 from any hit here, where 40 was possible on open ground.”

**V15-25** · p.239
- Original: “run it as terrain that moves”
- ChatGPT: “Keep its route and remaining movement visible, so players can plan how to delay or avoid it.” Helpful metaphor expanded into the actual GM task.
- Claude: **EDIT.** Keep the phrase, add the task: “run it as terrain that moves: keep its route and remaining movement visible so the players can plan around it.”

**V15-26** · p.239
- Original: “would put the party three times past Tolerance”
- ChatGPT: “could push some characters into a higher Saturation band before the crossing.” Calculate from each character's current stored VE;125 alone is not Critical.
- Claude: **EDIT.** “Paying it at the announcement would put a character carrying two sectors' worth into Critical for the crossing, with the collapse clock running through the climax.”

**V15-27** · p.243
- Original: “no clock”
- ChatGPT: “There is no pursuing threat, but Critical Saturation still uses its hourly clock.” The very next lines reinstate a clock.
- Claude: **EDIT.** “no pursuing threat, though Critical Saturation still runs its hourly clock”.

**V15-28** · p.245
- Original: “whether a stranger reads as a threat, a resource, or a person”
- ChatGPT: “whether the character threatens the Kith, seeks a trade, offers help, or keeps their distance.” Record actions without implying that cautious behavior denies personhood.
- Claude: **EDIT.** “whether the character threatens the Kith, trades, helps, or keeps their distance.” Actions, no verdict on personhood.

**V15-29** · p.249
- Original: “Every lethal threat…has a door”
- ChatGPT: “The tutorial uses the survival exceptions on p.239; escape routes and outside intervention keep accidental defeat from killing a player character.” Yield is not a guarantee of surviving any Margin.
- Claude: **EDIT.** Keep the list, cite the rule: “Every lethal threat in the tutorial has a door, and the survival exception (Phase 5, Watch For) closes the rest: ...”

## Chapter 16, Quick Reference

### ChatGPT's content findings, verbatim

**Content corrections:** Add opposed-tie and Momentum-tie rules; list the actual Suppressed effect and recovery conditions, not just the save. Keep Free Step's engagement restriction and Grade movement's terrain/Principle exceptions. Remove or define “Margin40+…dominant” for skills; the detailed skill outcomes do not give it a separate procedure. Mark the Grade ranges as normal bands, with lagging stats possible. Carry every corrected Yield, healing, Aether, and Marks rule into these pages. The cross-Grade example here correctly uses240HP, unlike Chapter2; use this as the canonical arithmetic example. Its E-Grade attack reuses FOR120 as offensive Force without stating an offensive Attribute; add STR120 or another valid offensive stat.

**Preserve:** compact resource reference, examples at multiple Grades, explicit no-explosion rule for skills.

### What the source says, verified

| Item | What the source says (`75-quick-reference.md`) |
|---|---|
| Resistance | 15 "Beat the Resistance"; Core 111 "Meet or exceed to succeed." |
| Flanking | 20 "+10 for every hostile engaging a target that two or more hostiles are engaging at once." |
| Soft failure | 25 "fail by 1–39 soft (success at a cost)"; Core 186 and 190 default to a setback. |
| Aether | 62 "Aether refills only on Consolidation, after the first full hour (no in-combat or passive regen)." |
| Pills | 86 "the first two of each kind per fight work in full". |
| Aura | 94 "At 3+ Grades of difference the GM may skip the save." No Suppressed effect listed. |
| Ties | No opposed-tie or Momentum-tie line; Core: ties reroll (design record). |
| Grade table | 111 to 116 Force ranges 1–99 / 10–99 with no lagging note; the lagging paragraph is at 60. |
| Example 3 | 154 to 166: "E-Initiate: FOR 120 (Force 12, +100 Grade bonus = 112), HP 240"; "E-Initiate rolls average: 50 + 112 = 162" (offense on FOR). |

### Claude's buckets

| # | Finding | Verdict | Bucket |
|---|---|---|---|
| 16.1 | Opposed ties and Momentum ties absent | CONFIRMED | **A:** ties reroll. |
| 16.2 | Suppressed effect absent (save only) | CONFIRMED | **A:** "Suppressed: one Beat per turn for the encounter". |
| 16.3 | Free Step's engagement restriction; Grade movement exceptions | check Core at apply | **A** if Core has them. |
| 16.4 | "Margin 40+ on any success is dominant" for skills | in the Rule of 40 | **C.** |
| 16.5 | Grade ranges as normal bands | CONFIRMED | **A:** a footnote for lagging stats. |
| 16.6 | Cross-Grade example STR | CONFIRMED | **A** (F3). |

### Rewrites

**V16-01** · p.251
- Original: “Beat the Resistance”
- ChatGPT: “Meet or exceed the Resistance.” Ties succeed.
- Claude: **APPLY.** Core line 111: “Meet or exceed to succeed.”

**V16-02** · p.251
- Original: “Flanking: +10 for every hostile…”
- ChatGPT: “When at least two hostiles engage a target, each gains+10 against that target.” The current wording can be read as+10 per ally on each roll.
- Claude: **APPLY.**

**V16-03** · p.252
- Original: “soft (success at a cost)”
- ChatGPT: “Soft: a setback with a way forward; success at a cost is an optional GM alternative.” Core Mechanics explicitly rejects success-at-cost as the default.
- Claude: **APPLY.**

**V16-04** · p.253
- Original: “Aether refills only on Consolidation”
- ChatGPT: “Consolidation fully restores Aether after one hour. Certain consumables also restore it.”
- Claude: **APPLY.** With D1's wording for Surge and F2's for Aether: “Aether does not regenerate; Consolidation refills it, and Aether Pills and Pulse Shards restore it.”

**V16-05** · p.254
- Original: “first two of each kind”
- ChatGPT: “first two Healing Pills and first two Aether Pills.” Prevent readers treating different named pills as different allowances.
- Claude: **DECLINE.** “Each kind” is deliberate (Healing, Aether, Foundation); optionally list them.

**V16-06** · p.254
- Original: “at3+ Grades…may skip the save”
- ChatGPT: “At a gap of three or more Grades, the GM may impose Suppression without a save.” State the intended result if that is what the core rule means.
- Claude: **APPLY.**

## Chapter 17, Table Kit

Applied last, after the rules settle.

### ChatGPT's content findings, verbatim

**Synchronization checklist:**

- PDF269 and274–276: the proficiency prompt “3 Marks: Seasoned” needs a second line for an untrained domain becoming Trained and spending those3 Marks. Four rows can be insufficient after several new proficiencies; provide an overflow convention.
- PDF274–276: prefilled sheets show maximum HP/Aether but leave current resources and storedVE blank. Fill current resources at maximum and storedVE0 if these are meant to be ready to play; otherwise label the remaining setup step.
- PDF277: “The party earns one or two a session” is a new pacing statement. Mark it as typical, never a cap on automatic triggers, and put the guidance in Chapter5 if retained.
- PDF278: Came Back Whole's blank effect is intentional per the page header, not a forgotten field. Move that author decision into the main title entry as well. Update Salvaged's release text to include all cases and HRT restoration/floor once decided.
- PDF279–280: probe and Opportunity cards correspond to the current prompts. Update the Threshold's 'locked' wording and any clarified choice information in both places. Do not put private GM outcomes on player cards.
- PDF281: clarify that only an attacker winning a Clash deals ordinary damage; “the Margin is the damage” can suggest a defender retaliates automatically. Add the tie rule and spending limits for Yield. 'At most two' Surges is more accurate than the main text's universal two, but consumables invalidate a between-rest cap.
- PDF282: label Saturation values as F-Grade and state Overcharge bonuses apply only on success. The screen needs the effect of Suppression, not only the save. Preserve the Tutorial's no-accidental-PC-death exception in a separate Tutorial note rather than changing the general screen's death rule.

**Preserve:** clear division between private GM tracking and player resources; repeatable blank cards; consistent premade statistics. The kit should be updated last, after the canonical rules are settled.

### What the source says, verified

| Item | What the kit says (`book/kit/table-kit.html`) |
|---|---|
| Marks | 378 (and three copies) "Natural 96+ with this Proficiency: tick a Mark. 3 Marks: Seasoned. 10 Marks and an E-Grade body: Master." No untrained-to-Trained line. |
| Memory cards | 1077 "ONE CARD PER MEMORY. THE PARTY EARNS ONE OR TWO A SESSION; HAND IT OVER THE MOMENT IT TRIGGERS. IT CONVERTS AT A CONSOLIDATION AND IS SPENT WHEN ITS IP IS AWARDED." 1086 "Cascade ×2". |
| Title cards | 1192 "CAME BACK WHOLE'S EFFECT IS YOURS TO SET FROM ..." 1256 Salvaged release text. |
| Player handout | 1445 "The difference is the Margin, and at Grade F the Margin is the damage." 1454 "FLANKING +10 for every hostile on a shared target". 1475 "Aether refills only at Consolidation, so a full pool buys at most two of these between rests." 1482 "[ THE DIE TALKS ]". |
| GM screen | 1537 "FAIL BY 1–39 Soft: success at a cost, or a way forward". 1562 "CASCADE ×2, PC ROLL Battle Memory Card". 1592 "AURA PRESSURE d100 + HRT Force + (FOR Force÷2) vs 115 calm / 140 flaring" (save only). 1601 "AT 0 HP dies end of third round unless stabilized". |

### Claude's buckets

| # | Item | Bucket |
|---|---|---|
| 17.1 | Marks line: add the untrained-to-Trained step; an overflow convention for the fourth Proficiency row | **A.** |
| 17.2 | Prefilled sheets: current HP and Aether at maximum, VE 0 | **A.** |
| 17.3 | "The party earns one or two a session" | **A:** "typically". |
| 17.4 | Came Back Whole card | **B** (D21). |
| 17.5 | Probe and Opportunity cards: the Threshold's "locked" wording and D17's disclosure | after D17. |
| 17.6 | "the Margin is the damage" | **A:** "the winner's Margin; a defender who wins deals none". Tie rule; Yield limits. |
| 17.7 | GM screen: Saturation labeled F-Grade; Overcharge on success only; Suppression's effect; the tutorial death exception as a tutorial note, never on the general screen | **A.** |

### Rewrites

**V17-01** · PDF281 player handout
- Original: “THE DIE TALKS”
- ChatGPT: “HIGH AND LOW ROLLS,” optional. A plain label is easier to find during play.
- Claude: **DECIDE.** “THE DIE TALKS” is the kit's voice; Gabriel's call.

**V17-02** · PDF281 player handout
- Original: “FLANKING +10 for every hostile on a shared target”
- ChatGPT: “Each of two or more engaging hostiles gains+10 against the target.” Same ambiguity as Quick Reference.
- Claude: **APPLY.**

**V17-03** · PDF282 GM screen
- Original: “Soft: success at a cost, or a way forward”
- ChatGPT: “Soft: setback with a way forward; success at a cost is optional.” Synchronize to the core default.
- Claude: **APPLY.**

**V17-04** · PDF277 Memory cards
- Original: “CASCADE ×2”
- ChatGPT: “Two or more extra dice.” Avoid confusion with two dice total or doubling a result.
- Claude: **EDIT.** “TWO EXTRA DICE”.

**V17-05** · PDF281
- Original: “Aether refills only at Consolidation”
- ChatGPT: “One hour of Consolidation fully restores Aether; specific consumables can also restore it.”
- Claude: **APPLY.**


## Production (all confirmed in the rendered PDF)

| Page | Defect | Fix |
|---|---|---|
| 137 (PDF 146) | "1–3 lines" renders as "-13 lines" inside the listing; the only en dash inside a code fence in the book | Write "1 to 3 lines" in `55-quests.md` 311 and `rules/templates/personal-opportunity.txt` 35. |
| 174 (PDF 183) | The last bullet of "Outfitting the Tutorial" runs through the footer and off the page; the list sits beside a spot-art float | Pipeline: the spot-art device (`\gbspotart`, the Lua `spot` class) must not leave the following list in an unbreakable box. Investigate at apply; the text is intact in source. |
| 242 (PDF 251) | The ═ rules in the summary template merge onto the title and VE lines | Replace the box-drawing characters with ASCII rules or set the template as a `systemvoice` block. |
| 49 (PDF 58) | The Principle diagram lists 3 IP among the Distillation thresholds | Edit `book/assets/principle_loop.svg` line 43 and re-render the PNG. |

## Scope and organization (from the whole-book review)

| Item | Bucket |
|---|---|
| Class procedure framing (Progression 76) | **A** (4.1); the full framework is the classes project. |
| Companion app described as present in some places, planned in others | **A:** "planned" everywhere until it ships. |
| Digital quest log against the paper promise | **EDIT** (V11-02). |
| Navigation 1: reading route | **A** (1.1). |
| Navigation 2: exceptions beside their first procedure | the glossary and link pass (Tier 2 item 11); **defer**. |
| Navigation 3: one canonical definition copied into summaries | this pass does it for Soft Failure, Aether, Yield, Flanking, Surge, healing, Marks. |
| Trim the design-intent manifestos (Principles 5.13 and 5.14, HVE Design Intent, Quests, Tutorial Design Notes) | **B:** show Gabriel each; the Principles closing line stays by ruling. |
| Acknowledge the memory-only tradeoff | **B** (D23). |

## The voice standard

ChatGPT's ten tests against the rules already in CLAUDE.md:

| ChatGPT test | Covered by | Adopt? |
|---|---|---|
| 1 Performed gravitas | Scenario voice: no performed gravitas | already |
| 2 Abstraction replacing an action | Name the referent; game terms in procedure | already |
| 3 Ornamental punchlines | Cut the closer | already |
| 4 False contrasts and non-answers | No "X, not Y"; positive description first | already |
| 5 Metaphors concealing procedures | partly (numbers not adjectives; precise claims need a rule) | **adopt the test as stated**: explain movement, timing, triggers, and outcomes literally before any image. It caught V15-25, V07-03, V05-13. |
| 6 Ambiguous actors and referents | Name the referent | **adopt the specific form**: distinguish player, character, GM, and System in every sentence that carries a consequence. It caught V01-03, V10-10, V15-14. |
| 7 Absolute claims contradicted by exceptions | Precise claims need a rule behind them | **adopt the specific form**: every "every", "always", "only", "nothing", "never" in rules text is checked against the exceptions. It caught more findings than any other test (V02-01, V02-02, V02-07, V08-07, V08-08, V11-10, V12-01, V12-07, V15-23, V15-29). |
| 8 Presentation imposing nonexistent symmetry | Structure fits the content | already |
| 9 Compressed slogans where a rule is missing | Precise claims need a rule; write the missing procedure | already |
| 10 Repetition of the premise | State the thing once | already, and worth adding the HVE-specific form: explain behavioural recognition fully once, in the HVE chapter, and elsewhere only where a procedure needs it. |

Recommendation: add tests 5, 6, and 7 to the project CLAUDE.md prose rules in their specific forms, and the premise-once rule for the HVE. The rest is already there. ChatGPT's own replacements fail our rules in two recurring ways, which is why the verdict column exists: hedges ("may", "can", "normally") where a rule wants a number or a flat statement, and "rather than" contrasts that are the banned construction in a milder coat.

## Apply plan

1. **Batch A, one commit.** Every A row in F1 to F5 and the approved decisions (D1 to D4, D6, D7, D9 to D15, D17 to D22), plus the production fixes that need no decision (the en dash, the diagram's SVG, the template's rules). The chapter tables' A rows follow once Gabriel has read them. `make check`; fixtures updated where an example changes; `rules/version.yaml` to 0.1.5.
2. **Decisions D1 to D23**, walked in order, Gabriel cutting. Rules changes land with retired values and fixtures.
3. **Rewrites**, chapter by chapter, before and after shown from the change log, Gabriel choosing.
4. **Kit sync and the p. 174 layout**, then a full build and a check of the affected pages.
