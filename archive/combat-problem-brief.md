# Problem Brief: Combat Lethality, Early-Game Verbs, and Proficiency

*A design brief for an in-development tabletop RPG. Written to be self-contained for an outside reader. Everything below is the current working state of the rules unless marked otherwise.*

---

## 1. What the game is

A tabletop RPG built on LitRPG / progression-fantasy fiction (*Defiance of the Fall*, *The Primal Hunter*, and similar cultivation and System-driven works). Earth has been absorbed into a galactic "System" that overlays reality with game mechanics: levels, stats, quests, classes, System messages in blue text. Characters start as ordinary humans on the day of Integration and climb.

Working title: *LitRPG: RPG*. Single volume, GM-facing, intended to be playable cold by a stranger.

### Design priorities, in strict order

1. **The power fantasy must be visible and satisfying.** Numbers go up and players feel it.
2. **Combat resolves fast.** No slog, no HP sponges.
3. **Table math stays simple.** The GM should never do arithmetic on large numbers.
4. **The Hidden Vector Engine must receive clean behavioral signal.** Every mechanic should generate meaningful data about how players act under pressure.
5. **Lighter side of rules-heavy.** If a subsystem adds tracking burden without proportional payoff, cut it.

### Standing constraints

- **The Unplugged Floor.** The book must be fully playable with no AI. A planned companion app (an AI listening app that auto-logs behavioral data from table talk) and general LLM assistance are amplifiers. Every mechanic that invokes the "System AI" must also have a stated manual procedure.
- **Complexity is asymmetric and that is deliberate.** Complexity on the GM side is affordable, because it lands on one person who is preparing in advance and who may eventually have software help. Complexity on the player side is expensive, because it multiplies across four to six people who are holding it in working memory at the table. Solutions that push load to the GM are strongly preferred.
- **Numbers should be big, round, memorable, and rhyme with each other.** The existing number vocabulary is 5, 10, 20, 40, 100. New thresholds should reuse it rather than invent new ones.
- **Crits should be rare and epic.** The reference point is d20 culture: 5% is a crit, 10% is a big upgrade. Frequent procs read as tedium.
- **Terminology collisions are defects.** Any new coinage gets checked against existing vocabulary for sound-alikes.

---

## 2. The core math

### Grades and the two-number system

Characters have a **Grade**: F, E, D, C, B, A. Each Grade spans 25 levels (Levels 1 to 25 are F-Grade, 26 to 50 are E-Grade, and so on). Grade is the fundamental power tier; the only way to advance a Grade is a dangerous ritual called a Breakthrough.

Every Attribute has two readings:

- **Raw:** the big LitRPG number on the character sheet. Grade caps are 99 at F, 999 at E, 9,999 at D, and so on. Excess above the cap is lost.
- **Force:** the number used at the table. Divide Raw by the Grade divisor (F ÷1, E ÷10, D ÷100) and drop fractions. For in-band stats this is the first two significant digits. Stats below the band pad with leading zeros: an E-Grade character with Raw STR 65 reads 065, Force 06.

Force is always read at the *character's* Grade, for every stat. Only Force is used in resolution. At F-Grade, Force equals Raw.

The purpose of this scheme: narrative numbers reach millions while table math stays in the 10 to 99 band.

### The two universal scaling constants

- **×10 per Grade.** Damage multiplier (F ×1, E ×10, D ×100, C ×1,000), Aether costs, experience rewards, difficulty, and reward magnitudes all scale by this.
- **+100 per Grade of difference.** Called the Cross-Grade Adjustment. The higher-Grade side adds +100 per Grade of difference to its roll (or to a passive obstacle's Resistance).

### Core resolution

Everything resolves as **d100 + relevant Force + modifiers**.

**Opposed rolls** (against a living opponent): both sides roll, higher total wins, ties go to the initiator. The **Margin** is winner's total minus loser's total.

**Resistance rolls** (against a passive obstacle): roll against a flat value from this card.

| Difficulty | Resistance |
|---|---|
| Trivial | 40 |
| Easy | 65 |
| Moderate | 90 |
| Hard | 115 |
| Severe | 140 |
| Peak | 165 |

**Auto-success:** if your Force alone meets or exceeds the Resistance, you do not roll.

**The Rule of 40:** Margin 40+ is a dominant success in any arena. Skill checks fail Soft when missed by 1 to 39 (success at a cost) and Hard when missed by 40+ (failure plus consequence). Natural 01 to 05 is Catastrophic. Natural 96 to 100 is an Exceptional Success (narrate one step beyond what was asked; if the total still fails, the failure is Soft).

---

## 3. Combat as currently written

### The Clash

Combat is a series of opposed Clashes. There is no separate to-hit roll and damage roll.

```
Attacker: d100 + Offensive Force + modifiers
Defender: d100 + Defensive Force + modifiers

If attacker wins:  Damage = Margin × Grade Multiplier
If defender wins:  No damage. Attack deflected.
```

**Offensive Force** by attack type: heavy melee uses STR, finesse melee and ranged use DEX, spells and abilities use POW.

**Defensive Force** by defense chosen: dodge uses DEX, absorb uses FOR, mental/spiritual/coercive uses HRT, illusion uses PER. The defender picks a posture when targeted.

**There is no damage reduction and no armor subtraction step.** Defense is entirely folded into the defender's Clash roll. Armor and toughness are narrative reasons your FOR Force is high.

**Turned Aside:** if the defender wins by Margin 40+, the attacker becomes Exposed until the end of their next turn.

### Damage and health

- **Max HP = Raw FOR × 2.** A character with FOR 8 has 16 HP. A character with FOR 8,500 has 17,000 HP.
- **Damage = Margin × Grade Multiplier** (F ×1, E ×10, D ×100).

### Action economy

- **Beats.** Every character has **two Beats** per turn. One Beat is one meaningful action: attack, cast, move one Zone, use an item, activate an ability, attempt a skill check, disengage, or attempt to seize Momentum. A third Beat is described in the book as the rarest form of power.
- **Free actions:** speaking, drawing a weapon, moving within your current Zone.
- **Momentum instead of initiative.** Each side sends one roller (d100 + best DEX or PER Force on that side). The winning side takes a complete turn first, all its characters acting one at a time, each spending all their Beats before the next teammate acts. Momentum holds between rounds unless one of three triggers fires: reinforcements arrive, a decisive tactical reversal occurs (GM judgment), or someone spends a Beat to make an opposed Momentum roll.
- **Zones instead of a grid.** Each scene is a handful of loose fiction-defined areas. Moving within a Zone is free, moving to an adjacent Zone costs a Beat. Leaving a hostile's Zone without spending a Beat to Disengage provokes a free strike. A character with DEX Force 50+ gets one free Zone move per turn.
- **Positional States:** Advantaged (+10), Neutral, Exposed (−10). Assigned by the GM from the fiction. Spending a Beat to reposition within a Zone can change your state.

### The Modifier Budget

All flat modifiers in the game draw from one budget, and anything new prices against it.

| Modifier | Size | Examples |
|---|---|---|
| Minor bonus | +5 | Basic weapon Skill Bonus, Surge, minor blessings |
| Standard bonus | +10 | Advantaged, Flanking, Proficiency, most System-granted skills |
| Peak bonus (rare) | +15 to +20 | Peak abilities, one-shot relics, achievement rewards |
| Hindering environment | −10 | Darkness, difficult footing, driving rain |
| Crippling environment | −20 | Blindness, restrained, fighting submerged |

### Volatility (exploding dice)

If the **natural d100** (before any modifiers) meets the Grade threshold, roll again and add. Each cascade die checks its own natural result.

| Grade | Explodes on | Probability |
|---|---|---|
| F | 96 to 100 | 5% |
| E | 95 to 100 | 6% |
| D | 94 to 100 | 7% |
| C | 93 to 100 | 8% |

Volatility applies to combat Clash rolls and Will Saves by either side, plus one ritual check. Skill checks never explode. There is no separate critical hit rule; this fills that role. A cascade of two or more extra dice on a player's roll grants a **Battle Memory Card** (a token that later feeds the Principle progression track).

### Downed and death

- 0 HP means **Downed**: no Beats, cannot defend, HP floors at zero. Applies to player characters and named NPCs; ordinary creatures just die.
- A Downed character dies at the end of their third round Downed unless stabilized. Stabilizing takes any HP restoration, or 1 Beat plus a Moderate (90) check.
- A single hit dealing 10× the target's Max HP destroys them outright with no Downed state.
- Attacking a Downed character kills them: 1 Beat, no roll.
- Death is permanent.
- Surviving being Downed grants a Battle Memory Card.

### Aether and Surge

- **Max Aether = Raw POW.** A starting character has 3 to 10 Aether.
- **Aether refills only during a Consolidation rest, after the first full hour.** No in-combat, post-combat, or passive regeneration. This restriction exists to close a rest-tap refill exploit.
- **Surge** (the one universal active option every character has from day one): spend **half your Maximum Aether, round up**, to add **+5** to one Clash roll you are making. Declared before rolling. Costs no Beat. Stacks with everything. Works on offense or defense.

Half-pool pricing was chosen so that Surge is one or two uses per rest at every Grade forever, which is the anti-spam answer. The intended feel is that raw energy is crude and technique is why you cultivate.

---

## 4. Character creation and progression

### Creation

- **Point buy: 40 points across seven Attributes**, minimum 3, maximum 10 per stat. 10 represents the peak of pre-System human potential; 3 is a genuine deficiency. Most stats land 4 to 8.
- Attributes: **STR** (heavy melee), **DEX** (evasion, finesse, ranged), **FOR** (health and physical defense), **HRT** (resolve, mental defense), **POW** (supernatural output, Aether pool), **PER** (awareness, illusion defense), **CHA** (social).
- **Three Proficiencies** (see section 5).
- Derived: Max HP = FOR × 2. Max Aether = POW. VE Tolerance = (FOR + POW) ÷ 2 × 10.
- Starting characters have **no class, no abilities, and no Principle access.** They have whatever was in their pockets at Integration.

Sample starting spreads (all total 40):

| Archetype | STR | DEX | FOR | HRT | POW | PER | CHA |
|---|---|---|---|---|---|---|---|
| Brawler | 10 | 6 | 8 | 4 | 3 | 5 | 4 |
| Scout | 4 | 9 | 5 | 4 | 3 | 10 | 5 |
| Aspiring Cultivator | 4 | 5 | 5 | 6 | 10 | 7 | 3 |
| Natural Leader | 5 | 5 | 5 | 7 | 4 | 5 | 9 |

At Level 1 that means HP 10 to 16 and Aether 3 to 10.

### Leveling

Kills, quests, and ordeals award **Volatile Energy (VE)**. Stored VE does nothing until refined during a **Consolidation** rest (each full hour clears one fifth of your VE Tolerance; a full tank is five hours for everyone at every Grade). Levels arrive mid-rest when refined VE crosses the next threshold. Holding VE above Tolerance causes escalating **Saturation** penalties (−10, then −25 plus HP bleed, then an hourly collapse roll).

The level curve is `100 × 1.2^(level-in-grade − 1) × Grade Multiplier`. Reaching the F-Grade cap takes 39,251 cumulative VE.

**Each level grants 5 stat points at F-Grade:**
- **3 points assigned by the System.** Before Level 10 the GM assigns these based on how the character has actually behaved, using a Behavioral Stat Mapping table (charges in headlong: STR/FOR; plans and positions: DEX/PER; endures and holds the line: FOR/HRT; and so on). From Level 10 the class's stat profile assigns them.
- **2 points assigned freely by the player.**

Totals: 40 points at creation, 80 by Level 9.

### The Level 10 class milestone

At Level 10, the System offers class options generated from the character's accumulated behavioral profile. The player picks one, receives a one-time bonus allocation of 5 to 10 stat points, and from then on the class assigns the fixed 3 points per level.

**Levels 1 to 9 are therefore a deliberate pre-class observation window.** This is where most of the problems in this brief live.

---

## 5. Proficiencies as currently written

This is the subsystem under review. In full, it is:

> Each character begins with **three Proficiencies**: broad domains of competence in plain language ("wilderness survival," "ancient languages," "field medicine," "close combat," "stealth and infiltration"). The book offers a menu of thirty and invites players to invent more.
>
> - **Proficiency Bonus:** a flat **+10** on relevant skill checks.
> - **Routine Mastery:** with a relevant Proficiency you automatically succeed at Trivial and Easy tasks of your own Grade, no roll.
> - **Specialist Gating:** some tasks cannot be attempted at all without the relevant Proficiency, regardless of Force (surgery, deciphering ancient scripts, formation-craft). GM decides which.
> - **Weapons:** a weapon grants a **Skill Bonus** of +5 or +10 to Clashes, and you lose it without a relevant Proficiency. A trained soldier with a greatsword adds +10; a librarian swinging the same blade adds +0.
> - **Gaining new Proficiencies:** "Characters can earn new Proficiencies through play. The System AI may award them as class features, achievement rewards, or Consolidation visions."

That last line is the entire acquisition rule. It is not developed anywhere else in the book.

Proficiencies are otherwise barely referenced. They appear at character creation, in the skill check rules, in one stabilization clause, in one weapon clause, and in two tutorial checks. Nothing else in the game touches them.

---

## 6. Adjacent systems, for context

These exist and are settled. Solutions should interact with them cleanly rather than duplicate them.

### Principles (the deep progression track)

The philosophical/cultivation track. A character earns **Insight Points** by acting under pressure in ways aligned with a nascent Principle (Weight, Flame, Stillness, and so on). Thresholds are 3, 10, 25, 50, 100. A tier-up ritual called **Distillation** advances Seed to Fragment to Domain and can broaden the Principle itself (Weight becomes Gravity becomes Dominion).

**Slots are deliberately scarce: one at F-Grade, a second unlocked at the E-Grade Breakthrough, lifetime maximum two.** The design intent was "few and deep," modeled on the one-or-two-Dao shape of the source fiction.

A Principle grants **Applications**: active abilities costing Aether. Cost is set by the Application's tier and never by Grade: Seed 10, early Fragment 15, Infusion free, Domain 3,000 plus 500 per round. Scale follows the character's current Grade, so an Application grows with the body. Domains require a D-Grade body.

Practically: a character might have their first Application somewhere in the Level 3 to 6 range, and will have one or two active abilities by Level 9.

### The Hidden Vector Engine (design priority 4)

A hidden behavioral tracking system. The GM logs how the character behaves under pressure across four bipolar axes:

- **Force ↔ Method** (how they solve problems)
- **Hunger ↔ Restraint** (relationship to gain)
- **Will ↔ Accord** (relation to others and order)
- **Control ↔ Freedom** (impose structure or let it emerge)

Two layers: a Current Vector (recent, decays fast) and a Deep Vector (long-term, decays slow). It drives the pre-class stat assignment, Title awards, personalized quests, a Breakthrough bonus, and world/faction response. Players never see their numbers.

**Any new mechanic is evaluated partly on what behavioral signal it generates.** A mechanic that makes players reveal how they act under pressure is worth more than an equivalent one that does not.

### An earlier subsystem that was cut

"Stable Abilities" was a separate track of minor System-granted powers for the pre-class window. It was cut as a one-off subsystem that took up space without proportional payoff. Its removal is a known contributor to problem 2 below. Reinventing it under a new name is a valid proposal only if it earns its complexity.

---

## 7. The bestiary and encounter sizing

Creature stat blocks list only what the Clash needs. Creature HP also equals 2 × effective Raw FOR.

| Creature | Tier | HP | Beats | Off Force | Def Force |
|---|---|---|---|---|---|
| Husk Crawler | Trivial | 16 | 1 | 04 | 08 |
| Frenzy Rat | Easy | 12 | 2 | 12 | 12 |
| Pre-System Brigand | Easy | 14 | 2 | 08 | 07 |
| Snarljaw | Moderate | 24 | 2 | 14 | 18 |
| Glow-Stalker | Moderate | 20 | 2 | 22 | 22 |
| Training Sentry | Moderate | 50 | 2 | 18 | 25 |
| Rival Initiate | Hard | 56 | 2 | 30 | 30 |
| Alpha Snarljaw | Hard | 64 | 2 | 30 | 28 |
| Husk Sentinel | Hard | 80 | 2 | 35 | 40 |
| Fragment Wraith | Severe | 120 | 2 | 65 | 60 |
| Corrupted System Warden | Peak | 190 | 3 | 80 | 95 |

Current encounter sizing guidance for a party of four:

| Party Level | Easy Fight | Standard Fight | Hard Fight |
|---|---|---|---|
| 1 to 3 | 2 Trivial | 1 Easy + 1 Trivial | 1 Moderate or 2 Easy |
| 4 to 7 | 2 Easy | 1 Moderate + 1 Easy | 1 Hard or 2 Moderate |
| 8 to 12 | 2 Moderate | 1 Hard + 1 Moderate | 1 Severe or 2 Hard + 1 Easy |

---

## 8. Simulation findings

A Monte Carlo model of the Clash engine, 4,000 trials per configuration. Party of four against the stat blocks above.

**Party used.** Level 1 (Off Force, Def Force, Raw FOR): (10, 8, 8), (9, 9, 5), (5, 5, 5), (5, 5, 5), each with a +5 weapon. Level 5 (60 points): (16, 12, 12), (14, 14, 8), (9, 8, 8), (9, 9, 8), each with a +5 weapon.

**Model simplifications.** No healing or consumables, no positional modifiers, no Momentum shifts, no Turned Aside, no retreat, no execution of Downed characters, enemies target a random living player character, players never flee. Absolute TPK figures are therefore upper bounds. The relative comparisons between configurations are the usable signal.

### Finding 1: damage is stat-independent

A landed hit between near-peers deals **30 to 40 damage**, at every Grade, forever. The number is the spread of two d100s and barely moves with Force. Meanwhile HP is 2 × FOR.

So **hits-to-kill is about 0.5 at Level 1 and about 4 at the F-Grade cap.** Effective toughness varies by a factor of roughly 30 inside a single Grade band, and resets to fragile at every Breakthrough, because a freshly-broken-through character sits at the bottom of the new band with Force 10.

At Levels 1 to 3, characters die to the *median* landed hit.

### Finding 2: round count and death count are the same variable

Every dial that lengthens a fight raises deaths almost proportionally. There is no attrition phase.

Single boss against the Level 5 party:

| Boss | Rounds | Any PC downed | TPK |
|---|---|---|---|
| HP 80, Off 35 (current Husk Sentinel) | 2.1 | 57% | 12% |
| HP 200, Off 35 | 3.7 | 85% | 46% |
| HP 320, Off 35 | 4.5 | 95% | 75% |
| HP 320, Off 12 | 5.5 | 84% | 42% |

Adding bodies is worse than adding HP, because incoming attack volume is what kills:

| Encounter | Rounds | Any downed | TPK |
|---|---|---|---|
| L5 party vs 2 mobs | 1.3 | 46% | 8% |
| L5 party vs 4 mobs | 1.8 | 73% | 48% |
| L1 party vs 4 mobs | 1.8 | 69% | 42% |

Raising HP on both sides is a weak lever. Symmetric HP ×4 moves a Level 1 standard fight from 1.2 rounds to 1.4 rounds and TPK from 5.0% to 4.6%. Raising only player HP to FOR × 5 moves Level 1 TPK from 5.0% to 1.4% and changes fight length by 0.0 rounds.

There is also a **death spiral**: a Downed character removes 25% of party output, which lengthens the fight, which downs more characters.

### Finding 3: proactive defense does not work

A tested "Guard" stance (spend 1 Beat, gain +20 to your defensive Clashes until your next turn, used when below half HP) moved TPK by under one percentage point in every configuration. The reason is structural: a character goes from full HP to Downed in a single hit, so the turn in which they would brace never arrives. Guarding every turn regardless lengthened fights and left TPK roughly unchanged.

### Finding 4: reactive defense works enormously

A charge spent *at the moment of an incoming hit* to negate it entirely, once or twice per combat:

| Configuration | Rounds | Any downed | TPK |
|---|---|---|---|
| L1 standard, 0 charges | 1.2 | 43% | 5.7% |
| L1 standard, 1 charge | 1.1 | 7% | 0.0% |
| L5 hard, 0 charges | 1.5 | 53% | 16.6% |
| L5 hard, 1 charge | 1.2 | 15% | 0.1% |
| L5 boss (HP 200), 0 charges | 3.5 | 91% | 61% |
| L5 boss (HP 200), 1 charge | 3.5 | 45% | 8% |
| L5 boss (HP 200), 2 charges | 3.3 | 12% | 0.2% |
| L1 vs 3 mobs (HP 30), 0 charges | 1.8 | 73% | 46% |
| L1 vs 3 mobs (HP 30), 2 charges | 1.7 | 12% | 0.4% |

Round count barely moves. One charge per combat is roughly the right dose; two charges makes the game close to safe.

### Finding 5: attack-attack strictly dominates

With two Beats and a 1.2 to 1.5 round average fight, no Beat-priced tactical option is ever worth taking. Any maneuver system added to combat as it currently runs would produce options nobody picks.

---

## 9. The problems to solve

### Problem 1: combat is too lethal, and the lethality is structural

Standard fights run 5% TPK and hard fights 16% at Level 5 under the simplified model, with roughly half of all fights putting at least one character on the floor. Beyond the raw numbers, the deeper issue is Finding 1: hits-to-kill swings 30× inside a Grade band and resets at every Breakthrough, so no single constant fixes both ends.

The design does *want* danger. Downed is meant to be a normal outcome and the death clock is the safety net. What it does not want is characters deleted by the first roll of a fight with no decision in between.

### Problem 2: verbs in Levels 1 to 9 are sparse, and the road to Level 10 must feel epic

Before a class arrives, a character's entire combat repertoire is: attack, move, disengage, seize Momentum, use an item, Surge (+5, one or two uses per rest), and eventually one Principle Application. Positional states and flanking are GM-assigned rather than player-driven.

Two constraints on any fix:

- **No bolted-on one-off subsystems.** A previous attempt at this (Stable Abilities) was cut for exactly this reason.
- **The Level 10 class must land as a major payoff.** Front-loading ability acquisition into Levels 1 to 9 undercuts it. Whatever fills the early game should ideally *build toward* the class rather than substitute for it.

Note that Finding 5 makes this harder than it looks: new verbs need somewhere to be spent, and the current action economy has no room.

### Problem 3: there is no rule for how you gain a Proficiency

The book has one sentence and no procedure. If Proficiencies stay, this needs a real answer: what triggers a new one, how often, who decides, and how it interacts with the unplugged-play requirement.

### Problem 4: the genre's version of proficiency is much deeper than a binary flag

In the source fiction, proficiency is a life's investment. A character devotes decades to the axe and it becomes their identity. Several works run weapon or skill proficiencies as a **separate leveling track** parallel to character level, with their own ranks and their own progression messages.

A flat +10 badge does not carry that. But a genuine second experience track violates priority 5 (tracking burden) and priority 3 (table math).

There is a related open question. The book currently states that **weapons are vessels**: accuracy and damage come from the person, and the weapon only channels it. That framing is not load-bearing and can be discarded if a better model needs the weapon to matter more.

### The meta-problem: complexity budget

The player-facing surface is already: the Clash, Zones, Beats, Momentum, Principles and Applications, pills, Aura Pressure, Aether, Surge, and tactical modifiers like flanking and elevation. None of these individually is wrong, and richness is wanted. But each addition multiplies against the others in what a player holds at the table.

The strong preference is for solutions that **collapse several existing problems into one mechanic** rather than adding a mechanic per problem, and that **push load onto the GM** where load is unavoidable.

---

## 10. Solutions already considered, and why they did not close

Do not simply re-propose these. Improving on them, or explaining why one of them was dismissed too quickly, is welcome.

1. **Raise Max HP** (FOR × 4 or × 5). Weak. Changes fight length by essentially zero and only modestly dents TPK, because attack volume rather than the damage-to-HP ratio governs the outcome.

2. **Raise monster HP for longer fights.** Buys rounds at close to a one-for-one cost in deaths (Finding 2).

3. **Add more enemies.** Actively worse than adding HP. Multiplies incoming attacks, which is the TPK driver.

4. **A Beat-priced defensive stance.** Does not work at all (Finding 3): the character never gets the turn in which to use it.

5. **A reactive once-per-combat charge that negates an incoming hit.** Works dramatically (Finding 4), but concerns remain: it is a binary bookkeeping toggle rather than an interesting decision; two charges nearly deletes death; and hanging its count on a GM judgment call gives one judgment call enormous weight.

6. **Drop Proficiency entirely** and let classes and Principle Applications carry equivalent capability. Leaves Levels 1 to 9 with no skill identity at all, removes the thing Specialist Gating gates on, removes Routine Mastery's pacing role, and turns trained-versus-untrained contests of equals into coin flips.

7. **Drop the +10 but keep the badge** (trained means you may attempt gated tasks and get Routine Mastery, with no numeric bonus). Leaves the weapon Skill Bonus without a hook and does nothing for problems 1, 2, or 4.

8. **Promote one Proficiency to a "Practice" with Depth 1 to 3**, where Depth sets the reactive charge count, extends Routine Mastery up the difficulty ladder, and becomes the spine of the Level 10 class. Addresses problems 2, 3, and 4 together, but concentrates too much mechanical weight on a single GM judgment call at level-up, and risks deleting death if Depth reaches 3 before Level 10.

9. **Rebuild Surge as "add an extra d100 to a Clash"** (averaging +50, reusing the Volatility machinery) instead of the current +5. Makes Aether meaningful and unifies the offensive and defensive versions of one effect. Concern: a Surged attack averaging Margin 83 one-shots anything at F-Grade, which is a large change in ceiling, and it does not address problems 3 or 4.

---

## 11. What a good answer looks like

- It solves more than one of the four problems with one mechanic.
- It adds at most one new thing a player must hold in working memory, and preferably zero.
- Any arithmetic it introduces stays in the 10 to 99 band and uses the existing number vocabulary (5, 10, 20, 40, 100).
- It works with no AI, no app, and no software assistance.
- It generates behavioral signal about how the player acts under pressure.
- It preserves fast combat. A solution that fixes lethality by making fights long is not an improvement.
- It makes reaching Level 10 feel like the arrival of something the character has been building toward.
- It respects the settled invariants: d100 + Force resolution, Damage = Margin × Grade Multiplier, no damage reduction step, ×10 per Grade, +100 per Grade of difference, 25 levels per Grade, Grade caps at 99 / 999 / 9,999, two Beats per turn as the default, and at most two Principle slots in a lifetime.

Invariants that are open to challenge if the payoff is large enough, flagged so a proposal can say so explicitly: HP = Raw FOR × 2, Max Aether = Raw POW, Aether refilling only at rest, Surge's current shape and pricing, the weapons-as-vessels framing, and the Behavioral Stat Mapping split of 3 System points and 2 free points per level.
