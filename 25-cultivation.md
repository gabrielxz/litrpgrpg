![Cultivation](./assets/cultivation.png)

# Cultivation

---

## Volatile Energy & Consolidation

Characters do not gain traditional "Experience Points." They accumulate **Volatile Energy (VE)** from kills, consumables, and environmental sources. VE represents raw, unprocessed power absorbed from the Multiverse — essence that must be refined into permanent growth through structured rest.

### The Pressure Gauge

Every character has a **VE Tolerance** representing the raw energy their body and spirit can hold before refinement:

> **VE Tolerance = (Raw FOR + Raw POW) / 2 × 10**

An F-Grade character with FOR 60 and POW 60 has a Tolerance of 600. A pure warrior (FOR 80, POW 30) has a Tolerance of 550. A pure caster (FOR 30, POW 80) also has 550. The formula scales naturally with Grade — no special multiplier needed; the × 10 is a constant, and the Grade scaling comes from the stats themselves.

VE accumulates automatically after combat and from other sources. As long as stored VE remains below Tolerance, there is no penalty. Once VE exceeds Tolerance, the character enters **Saturation:**

- **Mild Saturation (101–150% Tolerance):** −10 to all rolls. Energy regeneration halved.
- **Heavy Saturation (151–200% Tolerance):** −25 to all rolls. HP begins bleeding (1% Max HP per round in combat, per hour outside combat).
- **Critical Saturation (200%+ Tolerance):** Stat degradation begins. Permanent attribute loss if not addressed.

**GM Note on Saturation:** The System does not announce band thresholds to the character. Narrate symptoms instead — skin feels hot and prickly, vision tunnels at the edges, muscles cramp, something under the breastbone flexes in ways that feel wrong. Let players learn the pattern by experience. This generates rich Hidden Vector signal: who pushes into the red zone chasing one more kill? (Hunger.) Who pulls back at the first warning? (Restraint.)

### Consolidation (Structured Rest)

To process VE, a character declares a **Consolidation** rest. This is not a mini-game. The player states they are consolidating, the GM tracks the clock and any interruptions, and the mechanical result resolves automatically.

**Declaration:** The player specifies a goal — process all current VE, process until the next level-up, or process a specific amount. The goal matters because the GM may interrupt for narrative reasons, and the player should know what they were reaching for.

**Minimum Duration:** 1 hour of in-game time, regardless of how little VE needs processing.

**Processing Rate:** **(Raw FOR + Raw POW) per hour of Consolidation.**

An F-Grade character with FOR 60 and POW 60 processes 120 VE per hour. A full tank (600 VE) takes 5 hours to empty. The same ratio holds at every Grade — an E-Grade character with FOR 500 and POW 400 processes 900 VE per hour, a full tank (4,500) in 5 hours. Time pressure is Grade-invariant.

**Result:** Processed VE converts into permanent level progress. When accumulated processed VE meets the threshold for the next level, the character advances (see Leveling below).

**HP Recovery:** During Consolidation, characters recover 25% of their Max HP per hour.

**Energy Recovery:** Energy refills completely at the start of any Consolidation rest, regardless of duration. This is the *only* source of Energy regeneration — Energy does not recover in combat, between combats, or through passive time. See Core Mechanics: "The Energy System".

**Partial Consolidation:** If interrupted, the character retains proportional progress on both VE processing and HP recovery. Unprocessed VE stays in the tank and remains subject to Saturation rules.

**Simultaneous Consolidation:** The entire party may consolidate at the same time. This is a tactical choice — the party is completely defenseless while consolidating. Posting a guard means that character is not consolidating.

**Environmental Modifiers:** Consolidating in a high-energy-density hex reduces required time by 25%. Consolidating while holding a Principle-affinity treasure grants a small bonus to Insight Points for that Principle Concept.

**Battle Memory Meditation:** Characters who hold a Battle Memory Card (see Principles document) process it during Consolidation. The GM feeds the memory context into the System AI, which generates a cryptic vision and awards Insight Points.

### Leveling: The VE Chart

Levels require accumulated processed VE following an exponential curve:

> **VE to reach next level = 100 × 1.2^(Level-in-Grade − 1) × Grade Multiplier**

Where Grade Multiplier is ×1 for F, ×10 for E, ×100 for D, ×1,000 for C, etc. — the same multiplier used everywhere else in the system.

**F-Grade reference (selected levels):**

| Level | VE to Next | Cumulative VE |
|---|---|---|
| 1 → 2 | 100 | 100 |
| 2 → 3 | 120 | 220 |
| 3 → 4 | 144 | 364 |
| 5 → 6 | 207 | 871 |
| 10 → 11 | 516 | 3,193 |
| 15 → 16 | 1,284 | 9,539 |
| 20 → 21 | 3,196 | 25,330 |
| **24 → 25 (cap)** | **6,625** | **39,248** |

At E-Grade, every entry is × 10 (Level 1 costs 1,000 VE). At D-Grade, × 100. The chart shape is identical at every Grade; only the magnitude shifts. Class features, rare titles, or specific treasures may tweak the multiplier for individual characters, but the baseline curve applies to everyone.

**Grade Length:** Each Grade contains **25 levels**. Levels 1–25 are F-Grade; after L25, the character cannot advance through ordinary Consolidation and must attempt a Grade Breakthrough to enter E-Grade Levels 1–25, and so on. The exponential curve repeats identically at every Grade, scaled by the Grade Multiplier. The bottleneck near the cap is intentional — the last 3–5 levels of any Grade account for over 40% of that Grade's cumulative VE, producing the genre-typical "stuck before Breakthrough" pressure window.

**Grade Breakthrough** happens at the Grade-cap level (Level 25 within the current Grade). It is **not** an automatic level-up. See Breakthrough Consolidation below.

### The Interesting Decision

Consolidation is not about *how* — it is about *when*. Do you push one more fight while your gauge is in the red zone, gambling on a bigger haul before resting? Or do you pull back and consolidate safely, knowing that another group might claim the hunting ground while you meditate?

Players who hunt aggressively and consolidate efficiently pull ahead. Players who get greedy risk poisoning and permanent loss. This maps directly onto the Hunger/Restraint behavioral axis.

### VE Rewards by Source

The GM awards VE from multiple sources. The baseline rates below are tuned to F-Grade — multiply by ×10 per Grade for higher tiers (E-Grade enemies yield ×10 VE, D-Grade ×100, and so on), matching the leveling chart and damage Multiplier.

#### Combat Kills

The defeated enemy's difficulty tier (read from the Grade Reference Card) determines VE awarded:

| **Difficulty** | **F-Grade VE** |
|---|---|
| Trivial | 5 |
| Easy | 15 |
| Moderate | 30 |
| Hard | 60 |
| Severe | 100 |
| Peak | 150 |

Cross-Grade kills follow the multiplier — an E-Grade Moderate enemy yields 300 VE; a D-Grade Hard yields 6,000. A successful punch-up against a higher-Grade opponent is one of the fastest ways to leap forward in progression.

A stealth kill or trap kill yields half VE — the System rewards risk, not efficiency. A defeated boss-tier encounter (rare, named, or designed for the moment) may be worth 1.5× the listed amount at the GM's discretion.

#### Quest & Survival

- **Session Survival:** 10 VE (F-Grade) per character per session, awarded for surviving meaningful play. Scales with Grade.
- **Quest Completion:** GM-assigned. A typical F-Grade side quest awards 30–100 VE; a major quest arc may award the equivalent of a full level or more.
- **Hidden Achievements:** Rare. Award 50–200 VE (F-Grade) plus a Title or other narrative reward.

#### Environmental Sources

- **Energy-Density Hex Absorption:** During exploration of high-density terrain, characters passively absorb 5 VE/hour at Moderate density, 15 VE/hour at High density, 30 VE/hour at Extreme density. This is the absorption that funds Breakthrough Ignition; it also accumulates during normal play.
- **Treasure Cores & Affinity Crystals:** Lump VE awards on consumption. F-Grade examples: minor core (50 VE), refined core (150 VE), pristine core (400 VE).

#### Pacing Reference (F-Grade)

L1 → L2 requires 100 VE — roughly 7 Easy kills, 4 Moderate, or one strong quest plus survival. L1 → L10 requires 3,193 cumulative VE — across ~25–30 sessions of moderate-pace play. L1 → L25 (F-cap) requires 39,248 VE; the final 3 levels alone account for over 16,500 VE — the genre-standard pre-Breakthrough grind.

GMs should not micromanage VE awards mid-session. Track running totals between sessions and award in batches at meaningful rest points.

#### Bonus VE: The Risk-Rest Curve

Survival and quest completion guarantee baseline progression. Combat VE and environmental absorption are the accelerants — they reward characters who push into danger, hunt aggressively, and master the timing of risk and rest. Playing it safe means you still level. The aggressive cultivator who balances Saturation pressure against Consolidation timing pulls ahead.

### Toxins & Impurities

Consuming healing pills or forced-growth treasures adds **Toxin Points**. If Toxin Points exceed a character's Toxin Tolerance (Raw FOR × 2), Consolidation efficiency drops: more time is required per VE processed, and a percentage of VE is lost to impurity during each rest.

### Grade Breakthroughs

Ascending from one Grade to the next is a deliberate, dangerous act — not a passive level-up. When a character reaches the Grade-cap level (the last level within their Grade), they cannot advance further through ordinary Consolidation. Instead, they must attempt a **Grade Breakthrough** — a four-beat ritual involving deliberate VE overcharge, a Breakthrough Check (d100 + POW Force + HRT Force vs. Severe difficulty of the target Grade), external phenomena management, and System recognition.

The full mechanic — including the Overcharge Ratio risk-reward dial, the five Quality Tiers (Cracked through Transcendent), Breakthrough Item categories, Environment & Energy Density modifiers, Party Support mechanics, and Grade-specific trial themes — is documented in the **Grade Breakthroughs** section (08-breakthroughs.md).

---

## Healing

Recovery in the Multiverse is never free. There are three paths, each with a cost.

- **Rest Healing:** During Consolidation, characters recover 25% Max HP per hour. Safest option, but it requires time.

- **Healing Pills and Potions:** Instant recovery of a flat HP amount based on pill grade. However, every pill adds Toxin Points.

- **Healing Skills and Spells:** Some classes possess healing abilities generated by the System AI. These cost Energy and one Beat in combat.

There are no instant full heals outside of extraordinary systemic treasures. Attrition is real and Consolidation timing remains meaningful.
