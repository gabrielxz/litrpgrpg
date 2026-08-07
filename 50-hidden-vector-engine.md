![Hidden Vector Engine](./assets/hidden_vector_engine.png)

# The Hidden Vector Engine

**The Behavioral Identity System**

---

## Core Purpose

The Hidden Vector Engine tracks how a character actually behaves under pressure and converts those patterns into a structured identity that the System can use.

This identity is an evolving behavioral signature derived from repeated actions. It records conduct without judging it; moral alignment plays no part. The engine answers the question: *How does this conscious agent manage entropy and adapt to the unknown?*

The engine enables: dynamic class generation based on lived behavior, forging of personalized Principles tailored to the character's systemic footprint, adaptive world reactions from factions, environments, and entities, and long-term narrative coherence across sessions.

Players should feel observed. They should not see the underlying numbers. The system must remain hidden to preserve authentic decision-making.

---

## Design Principles

The engine follows five constraints:

- **Orthogonality:** Each axis measures one thing.
- **Weight:** Meaningful moments outweigh routine play. Important decisions shape identity more than filler activity.
- **Recency:** Identity evolves. Recent behavior matters more than distant history.
- **Structure:** Inputs are structured. The system interprets clearly defined events, not vague narrative summaries.
- **Pressure:** The system responds and challenges. It does not merely describe the player. It generates pressure, opportunity, and consequence.

---

## Behavioral Axes & Principle Affinities

The engine tracks four bipolar axes. Each represents a distinct dimension of behavior. The System observes these behaviors to forge the character's Internal Power: the specific Principles that crystallize for them (see The Principle System, "Your First Principle"). The eight affinity families named below are what the System reports before a Principle crystallizes.

### Force ↔ Method (Interaction)

*How does the character solve problems?*

- **Force (+):** Aggressive engagement, applying pressure immediately, relying on overwhelming presence or impact. *Principle Affinity:* Yields Principles of Impact, like Momentum, Weight, Shattering, Kinetic Energy, or Heat.

- **Method (−):** Planning, positioning, altering conditions before acting, solving situations indirectly. *Principle Affinity:* Yields Principles of Architecture, like Space, Leverage, Misdirection, Shadows, or Geometry.

### Hunger ↔ Restraint (Desire)

*What is the character's relationship to gain?*

- **Hunger (+):** Pursuit of wealth, power, or advantage; prioritizing gain over safety. *Principle Affinity:* Yields Principles of Consumption, like Devouring, Blood, The Void, Assimilation, or Corrosion.

- **Restraint (−):** Passing on excess reward, prioritizing mission or people over loot. *Principle Affinity:* Yields Principles of Preservation, like Shielding, Purification, Iron, Stasis, or Resilience.

### Will ↔ Accord (Social)

*How does the character relate to others and systems of order?*

- **Will (+):** Coercion, intimidation, dominance, shaping outcomes through pressure. *Principle Affinity:* Yields Principles of Imposition, like Conqueror's Haki, Mind Control, Pressure, Fear, or Sovereignty.

- **Accord (−):** Negotiation, cooperation, adaptation, working within systems. *Principle Affinity:* Yields Principles of Harmony, like Resonance, Symbiosis, Life, Empathy, or The Hearth.

### Control ↔ Freedom (Governance)

*Does the character impose structure, or allow outcomes to emerge?*

- **Control (+):** The drive to impose order, establish hierarchy, restrict variables. *Principle Affinity:* Yields Principles of Governance, like Gravity, Chains, Dominion, Logic, or Suppression.

- **Freedom (−):** The drive to break chains, subvert authority, embrace emergence. *Principle Affinity:* Yields Principles of Subversion, like Wind, Severance, Spatial Rupture, Entropy, or Illusions.

---

## Multi-Vector Intersections

Axes do not exist in a vacuum. The System AI looks at the synthesis of all four vectors to determine the character's true systemic footprint. Illustrative examples:

- **The Apex Predator (Force + Hunger + Will + Freedom):** Applies overwhelming violence to devour resources, bends others to their dominance, and violently rejects any rules or bindings. The System grants highly volatile, destructive Principles (e.g., Dao of the Devouring Storm).

- **The System Architect (Method + Restraint + Accord + Control):** Plans meticulously, takes only what is required, builds deep alliances, and enforces strict laws. The System grants sprawling, environmental Principles (e.g., Dao of the Inescapable Labyrinth).

- **The Iron Adjudicator (Force + Restraint + Will + Control):** A frontline juggernaut who rejects excess loot, enforces a personal moral code, and binds reality to strict laws. The System grants heavy, crushing, defensive Principles (e.g., Dao of the Crushing Verdict).

- **The Phantom Thief (Method + Hunger + Accord + Freedom):** Uses leverage and stealth to acquire massive wealth, avoids violence by aligning incentives, and slips through every net. The System grants elusive, spatial Principles (e.g., Dao of the Severed Tether).

---

## Event-Based Scoring

Behavior is recorded through discrete events, not session summaries. Each event is defined by one primary axis, an intensity value, and an optional secondary axis (rare).

**Intensity Scale:**

- **0.5 (Minor):** Small but clear signal
- **1.0 (Meaningful):** A real decision with consequence
- **2.0 (Major):** High-stakes or risky choice
- **3.0 (Defining):** Rare, identity-shaping moment

---

## Structured Event Logging

Events must be recorded in a consistent JSON format: player, event_summary, context, intent, outcome, primary_axis, intensity, secondary_axis. This ensures reliable interpretation by the System AI.

The structured log is the format for AI-assisted and companion-app play. GMs running unplugged use "Tracking by Hand" (below) instead.

---

## Temporal Model

Each axis is tracked in two layers:

- **Current Vector:** Represents recent behavior and short-term direction. Full event value applies.
- **Deep Vector:** Represents long-term behavioral tendency. Partial event value applies.

At the end of each session, Current Vectors decay significantly while Deep Vectors decay slightly. This ensures characters can evolve naturally while their long-term patterns still shape their identity.

---

## Tracking by Hand

The model above (weighted events, structured logs, decaying vectors) is what the companion app implements and what an AI assistant can maintain from a pasted log. None of it requires software. The by-hand procedure preserves the axes, the weighting, and the recency bias, and drops the arithmetic.

**The sheet.** One half page per character: four rows (Force | Method, Hunger | Restraint, Will | Accord, Control | Freedom), each row split into a **Current** column (pencil) and a **Deep** column (pen).

**During play.** When a meaningful decision lands, make one pencil tally on the matching side of Current. A major, high-stakes choice: two tallies. A defining, identity-shaping moment: three tallies, circled, with a one-line note in the sheet margin. Minor signals get no tally; let them stay impressions.

**At session end.** For each axis: if one side of Current leads by 2 or more, add one pen tally to that side of Deep. Then erase Current. This is the decay model in miniature: recent behavior wipes every session; identity accretes slowly, in ink.

**Reading the profile.** Deep is the character's long-term identity: use it for class generation, HVE-Resonant Titles, and world response. The circled margin notes are the moments the System remembers; quote them back through titles, visions, and Personal Opportunities. For the Breakthrough Coherence bonus, read the Deep rows:

| **Profile** | **Deep tallies** | **Coherence Bonus** |
|---|---|---|
| Scattered | No side leads by 3+ | +0 |
| Leaning | One side leads by 3+ | +5 |
| Defined | One side leads by 5+, or two sides by 3+ | +10 |
| Singular | One side leads by 8+ | +20 |

These bands are the by-hand equivalents of the intensity thresholds in Grade Breakthroughs; use whichever form matches how you track.

---

## External Consequence (Macro-System Outputs)

While the individual vectors forge a character's Internal Power (Principles and Classes), the aggregate vector data feeds the System's macroscopic response to the player.

### World & Faction Response

- High **Hunger** attracts risky opportunities, black-market factions, and corrupting rewards.
- High **Accord** opens diplomatic pathways, attracts followers, and lowers merchant prices.
- High **Control** leads to structured opportunities, stable alliances, and invitations from bureaucratic Sects.
- High **Freedom** leads to volatile opportunities, emergent events, and bounties placed by authoritarian factions.

### Adversarial Design (Systemic Pressure)

The System generates challenges that actively pressure the character's dominant tendencies:

- **Force** is tested by enemies that punish physical contact or use kinetic reflection.
- **Control** is tested by Incursions of pure chaos, swarm enemies, or morphing environments.
- **Method** is tested by ticking-clock scenarios where planning time is reduced to zero.

---

## Hidden State and Narrative Expression

Numeric values are never exposed. The system expresses identity purely through titles, achievements, NPC reactions, System messages, class resonance, and environmental affinities. Players should feel the pattern without seeing the mechanism.
