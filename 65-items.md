![Items](./assets/items.png)

# Items, Consumables & Volatile Artifacts

---

## Design Notes

This document covers the practical items players encounter during F-Grade play: the consumables, weapons, and one-shot oddities that fill the spaces between treasure tiers. The full economy, crafting professions, and merchant systems are deferred. This is what the GM needs at the table.

---

## Consumables

### Healing Pills

Restore HP instantly. In combat, consuming a pill costs **1 Beat**, spent by whoever takes the action: swallow one yourself, or administer one to an ally in the same Zone. The recipient of an administered pill spends nothing.

| **Pill** | **Grade** | **HP Restored** |
|---|---|---|
| Stuttering Tincture | F | 5 |
| Lesser Healing Pill | F | 15 |
| Healing Pill | F | 30 |
| Greater Healing Pill | F | 50 |
| Pristine Recovery Pill | F | 80 |

E-Grade pills heal ×10 the listed amount, still capped by Max HP, which an F-Grade user rarely benefits from. The materia is the real cost: an F-Grade body that ingests an E-Grade pill immediately adds 300 to its stored VE, which puts most F-Grade characters straight into Critical Saturation. The surplus is waste; it clears through Consolidation at the normal hourly rate and refines into no level progress.

**Healing pills cap at the user's Max HP.** Excess healing is wasted.

#### Pill Saturation in Combat

The body accepts only so much pill-borne help under stress. **The first two Healing Pills a character takes in a fight work in full. From the third on, pills have no effect on that character until they have spent ten quiet minutes out of combat.** Aether Pills follow the same rule, counted separately: two of each kind work per fight.

**Administering a pill to an ally** counts against the recipient's two, never the administrator's.

**Foundation Pills are exempt.** They are not consumed during combat.

### Aether Pills

Restore Aether mid-encounter. In combat, consuming one costs **1 Beat**.

| **Pill** | **Grade** | **Aether Restored** |
|---|---|---|
| Sparkstone Tablet | F | 10 |
| Lesser Aether Pill | F | 25 |
| Aether Pill | F | 50 |
| Greater Aether Pill | F | 80 |

Aether Pills should be rare. Aether primarily refills through Consolidation; widely available Aether Pills would collapse the scarcity the Aether system is built on.

### Foundation Pills

See the Breakthroughs document for full rules. Brief reference:

| **Pill** | **Grade** | **Breakthrough Bonus** |
|---|---|---|
| Dragon Marrow Pill | F | +5 |
| Nine Leaf Essence | F | +10 |
| Heavenly Foundation Pill | F | +15 |

Foundation Pills are consumed during Stage 1 of a Breakthrough (Preparation). Only one Foundation Pill effect applies per Breakthrough; the body cannot metabolize multiple at once.

---

## Weapons (F-Grade Reference)

Weapons do not deal flat damage. They determine which Force governs an attack and may grant a small **Skill Bonus** to the Clash. Quality and craftsmanship matter narratively but do not change the math.

The wielder is the weapon. In an Integrated body, accuracy and killing power both come from the person: Force decides them, and the Margin is the physics. The implement decides which Force applies and adds at most a small bonus for fit. This is why the tables here carry no damage dice and no high-damage weapon class: a greatsword in weak hands is a slow club, and a knife guided by Force 60 is deadlier than either.

| **Weapon** | **Governing Force** | **Skill Bonus** | **Notes** |
|---|---|---|---|
| Crude Club | STR | +0 | Found objects, broken table legs. |
| Knife / Dagger | DEX | +5 | Quick, concealable. Throwable as one-shot ranged. |
| Spear | DEX | +5 | Reach: free Disengage from one Zone-edge enemy per turn. |
| Battle Axe / Greatsword | STR | +10 | Heavy. Requires STR Force 05; below that, every Clash with it takes −10 (hindering). |
| Short Bow | DEX | +5 | Ranged: target enemies in adjacent Zones. |
| Crossbow (single-shot) | DEX | +10 | Requires 1 Beat to reload between shots. |
| Quarterstaff | STR or DEX | +5 | Versatile: choose Force at attack time. |
| Hand Axe (thrown) | STR | +5 | Ranged: one Zone. Recoverable. |

These are intended as starting and recovery tier. Higher-quality weapons (named, System-forged, Principle-attuned) are bespoke items the GM designs as treasure or quest rewards.

**Wielding without proficiency:** A character with no relevant Proficiency may still use a weapon, but loses the Skill Bonus. A trained soldier with a Greatsword adds +10; a librarian swinging the same blade adds +0.

---

## Volatile Artifacts (One-Shot and Tutorial-Grade)

Volatile Artifacts are scavenged debris from dead worlds, half-functioning constructs, and degraded shards of higher-tier equipment. They are unreliable, frequently single-use, and core to the tutorial's economy.

### Reactive Buckler

A small shield that absorbs one impact before its protective field collapses.

- **Effect:** Once per encounter, when the wielder would take damage from a physical Clash, reduce that damage to 0. The buckler's field discharges visibly and does not reset until the next Consolidation.
- **Limitations:** Does not protect against mental, spiritual, or illusion-based attacks. Does not negate the Margin; it only converts damage to 0 after the Clash resolves. Does not work against attacks the wielder did not see coming (Surprise Beat hits, ambushes from Hidden enemies).

### Degraded Skill Shards

Crystalline matrices containing fragments of dead techniques. Single-use. Activate as a 1-Beat action; the user describes intent and the GM rolls for backfire. Roll **1d100** when activating.

| **Shard Type** | **Effect** | **Backfire (on d100 ≤ 10)** |
|---|---|---|
| Edge Shard | Next Clash this turn gains +20. | Shard cracks: user takes 5 damage. |
| Pulse Shard | Restore 30 Aether. | Aether backlash: user takes 10 damage. |
| Veil Shard | Become invisible until end of next turn or until you act offensively. | Veil flickers: you remain visible but appear blurred (+5 to defense, no concealment). |
| Anchor Shard | Until end of next turn, you cannot be moved by any effect (moving yourself is fine), and your Defense Force gains +10. | You become **Rooted** for the rest of the encounter: unable to be moved, and unable to move under your own power. |
| Resonance Shard | Add 1 IP toward a Principle of your choice. | The IP is lost. |
| Volatile Shard | Roll d100 again. The GM and the System AI generate an unpredictable effect based on the result. | The GM's discretion is the risk. |

Shards are randomizers. They reward players who use them in moments where a wild outcome is acceptable, and punish those who treat them as reliable tools.

### Sensory Tools

- **Resonance Glass:** Spend 1 Beat. Reveals hidden energy signatures within your current Zone: concealed runes, dormant constructs, Principle resonance points. Does not reveal hidden creatures unless they have an active energy signature (cultivators using skills, magical creatures, etc.). Reusable.
- **Truthbinder Cuff:** Forces a single yes/no answer from one detained, non-hostile target. Single use; the cuff dissolves after activation. Cannot compel meaningful detail, only a binary truth.

### Single-Use Ranged Relic

Devastating weapon, one charge. Common in tutorial scavenger zones.

- **Effect:** A ranged Clash using DEX or POW Force (user's choice) at +20 to the roll. On hit, deals damage as normal but treats the user's Grade as **one tier higher** for the damage Multiplier (an F-Grade user deals E-Grade damage on this hit only: Margin × 10 instead of × 1).
- **Disposable:** After use, the relic burns out and crumbles. Cannot be repaired.

### Other Tutorial-Grade Items

- **Battered Medkit:** Heals 10 HP when used as a 1-Beat action on yourself or an ally in the same Zone. Does not count toward pill saturation. Three uses before the supplies are exhausted.
- **Low-Grade Armor Scraps:** Heavy. Grants +5 Defense Force when defending with FOR; imposes −5 to DEX-based Clashes (offensive or defensive). Stackable up to one set per character.
- **Sensory Tool (Generic):** Spend 1 Beat. Reveal one hidden feature within your Zone. Single use unless specified otherwise.
- **Battered Communicator:** Allows short-range communication between paired devices. Frequently malfunctions. Useful for the Civic Fragment terminal interaction in the tutorial.

---

## Item Acquisition

At F-Grade, items appear:

- As **tutorial scavenge** in Volatile Artifact zones (Phase 2 and Phase 3 of the Integration Tutorial).
- As **loot drops** from defeated enemies; the System AI generates tier-appropriate drops per the loot generation rule (System AI document).
- In **dungeon caches**, treasure rooms, and abandoned stockpiles.
- Through **trade with NPCs** in the Civic Fragment or post-tutorial settlements.

Players should not be flush with consumables. Healing Pills are a meaningful resource. The Reactive Buckler that saves a player's life in Phase 5 of the tutorial is supposed to be remembered. The single-use ranged relic that one-shots a tutorial mini-boss is supposed to be a story.

If the party is hoarding consumables and never spending them, the GM is being too generous with drops. If the party is constantly out and dying for want of a Lesser Healing Pill, the GM is being too stingy. Calibrate to encounter density.

---

## Future Expansion

This chapter covers F-Grade items only. Deferred for later development:

- **Crafted equipment and named weapons.** Once the Professions system is designed, players can craft, refine, and name their own gear.
- **Principle-attuned items.** Weapons and tools that resonate with specific Principles and grant attunement bonuses.
- **Set bonuses and equipment synergies.** Multi-piece kits with cumulative effects.
- **E-Grade and higher item tiers.** When the campaign scales, the same six categories scale ×10 per Grade.
- **Bespoke artifacts.** Story-tier items with unique mechanical and narrative weight, generated by the System AI and the GM in collaboration.
