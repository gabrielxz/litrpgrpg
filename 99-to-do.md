# DEFIANCE OF THE FALL: TTRPG

## Design Backlog

---

### Pending Design Decisions (Active Discussion)

- **Energy Density as a full subsystem:** The Breakthrough doc defines energy density tiers sufficient for Breakthroughs and Cultivation defines passive absorption rates, but the broader subsystem (affecting Principle resonance, monster spawning, territorial control, hex-level mapping) needs its own section.
- **Higher-Grade Breakthrough themes (D→C and beyond):** The universal blueprint and formula extend, but thematic trial content, failure severity, and Transcendent reward scales need development when the campaign reaches that point.
- **Bloodline interaction with Breakthroughs:** How does an active Bloodline modify the trial? Additional internal challenge, or a shortcut?
- **Ability/Spell interaction with the Clash system:** How do active skills modify Force, add Tactical bonuses, or create special Clash conditions? Stable Abilities are a tutorial-tier example; class-tier and Principle-tier interactions need a unified treatment.

### Systems To Be Designed

- Aura system (detailed mechanics beyond the Aura Pressure save)
- Professions (crafting, alchemy, formations)
- Merchants and economy (currency formalized; reputation as numeric tracked stat)
- Planetary leadership mechanics
- Races
- The "System" and opaque rules (how much players know vs. discover)

- A rules-light quickstart version
- Epiphany Track (4–5 checkboxes tied to core Principle Concept)
- Principle Tiers and Active Nodes (changeable during Consolidation)
- Fracturing a node to avoid massive damage
- Grades progression (C-Grade through S-Grade and beyond)
- Bloodlines
- Secret starting benefits: Unique/Exclusive Skills, System Exploits, Specialized Builds, Unmatched Energy Pool/Regen, Superior Knowledge, Rapid Progression/Leveling
- Additional Grade Reference Cards (C-Grade and beyond)
- Class design framework (stat profile templates, Signature Skill shape, class evolution bonuses)
- Higher-Grade bestiary (E-Grade and beyond)
- E-Grade items, pills, and consumables (extends the F-Grade catalog ×10)

### Content To Be Produced

- Playtest-ready Integration Protocol (post-reconciliation pass)
- Sample characters at F-Grade (with new starting stat ranges of 4–8)
- Additional F-Grade enemies as the campaign demands them (current bestiary: 12 entries)
- System AI prompt templates for class generation, loot generation, skill synthesis
- GM screen reference card (printable)

---

### Recently Resolved

- **Tutorial rewritten end-to-end** (`07-tutorial.md` v2.0, ~850 lines). All seven phases reconciled with current rules. New: pre-tutorial setup checklist, mechanics introduction schedule (mapping each phase to which mechanics it teaches), expected mechanical outcomes (every player must hit specific milestones by tutorial end). Phase 1 probes mapped to specific HVE axes. Phase 2 micro-encounters use bestiary stat blocks and items.md references with explicit VE rewards and intensity logging. Phase 3 introduces the Quest UI formally (Q-001, Q-002). Phase 4 zones each demonstrate a specific mechanic (Volatility cascade, Aura Pressure save, Saturation, skill shard activation). Phase 5 events are framed as Personal Opportunities. Phase 6 opens with the first Mandate (M-00) and uses the Corrupted System Warden bestiary block. Phase 7 includes per-archetype summary templates, Stable Ability assignment, first Title delivery, Affinity Notices, Hidden Quest reveals, and the Stinger. Three new GM Reference appendices: Vector Logging Cheatsheet, Mechanics Introduction Tracker (checklist), Tutorial Reward Ledger (VE pacing by phase).

- **Titles system locked** (`12-titles.md`). Four categories (Achievement, Hidden Achievement, HVE-Resonant, Bestowed). Stacking unbounded except for HVE-Resonant axis-pair mutual exclusion. Bonus magnitudes calibrated for stacking — F-Grade flat bonuses +1 to +5, percent bonuses capped at +15% per title, percent stacking uncapped. HVE-Resonant titles evolve at Breakthrough; Achievement and Hidden Achievement titles persist statically. Inspection rules tied to Grade differential. Negative titles (Oathbroken, etc.) are public and require in-fiction action to shed. Sample F-Grade titles written for all four HVE archetypes.

- **System Quests system locked** (`13-quests.md`). Five quest categories (Mandates, Personal Opportunities, Routine, Hidden, Faction). Quest UI is a shared digital log with structured entries; embraces the video-gamey System interface. Quest VE policy: action VE accumulates normally during a quest *and* completion VE is awarded on top — quest VE is a multiplier on activity, not a substitute. Reward Reference Table calibrates VE, items, titles, and narrative rewards by category and difficulty. Refusal-consequence taxonomy formalized — single-quest, repeated-type, faction, Mandate. Personal Opportunity generation uses a structured System AI prompt template. Hidden Quest UI conventions: Fully Obscured, Partial Reveal, Post-Completion Only.

- **F-Grade content pack for prototype play.** Bestiary (`09-bestiary.md`, 12 stat blocks across Trivial through Peak), Stable Abilities catalog (`10-stable-abilities.md`, 12 tutorial-tier abilities mapped to HVE axes), and items/consumables/Volatile Artifacts (`11-items.md`, healing pills, energy pills, foundation pills, weapons, skill shards, reactive buckler, single-use ranged relic). VE Reward Table added to `04-cultivation.md` covering combat, quest, survival, and environmental sources at F-Grade with ×10/Grade scaling.

- **Grade Length locked at 25 levels per Grade.** F-Grade spans Levels 1–25; E-Grade spans its own 1–25; and so on. The exponential VE curve repeats identically at every Grade, scaled by the Grade Multiplier. Updated `04-cultivation.md`.

- **Starting Principle Access rule (Step 5 of Character Creation).** Freshly integrated characters cannot start with active Principle Applications. At creation they may have at most Initial Insight (passive only) toward one Principle Concept. Active Applications (Seed and above) are unlocked through play via Insight Points. Solves the Energy trap for low-POW caster archetypes — by the time a Seed unlocks naturally through play, POW has grown enough to support the cost.

- **Tutorial Multi-Level Allocation note** added to `02a-character-creation.md`: GM can compress per-level stat allocation when the tutorial awards multiple levels at once.

- **Grade Breakthrough mechanic locked** (`08-breakthroughs.md`). Four-beat structure (Preparation → Ignition → Trial → Recognition). Roll formula: d100 + POW Force + HRT Force vs. Severe DC of target Grade. Five quality tiers (Cracked/Stable/Polished/Pristine/Transcendent) determined by margin. Overcharge Ratio is the player-controlled risk dial. Six item categories defined. Energy Density tiers established. HVE Coherence bonus rewards behavioral consistency. Party support is lightweight (Anchor action + phenomenon defense). Stat model on ascension: cap lifts + class evolution infusion (50–100 points at E-Grade, class-directed); no stat multiplication. Dump stats can lag behind Grade floor by design. F→E and E→D themes written; higher Grades deliberately deferred.

- **Heart (HRT) stat added as 7th attribute** (v1.6). Governs defense against mental/spiritual/coercive attacks and Aura Pressure. PER retains illusion/sensory defense role.
- **VE Tolerance formula locked** as (Raw FOR + Raw POW) / 2 × 10. Symmetric POW/FOR contribution; both builds consolidate at the same rate.
- **VE Processing Rate locked** as (Raw FOR + Raw POW) per hour of Consolidation.
- **Level chart locked** at 100 × 1.2^(Level-in-Grade − 1) × Grade Multiplier.
- **Stat cap rule locked:** stats cannot exceed Grade maximum (99 at F-Grade, 999 at E-Grade, etc.). Excess points from any source are lost. Breakthrough is the only way past.
- **F-Grade stat range expanded** to 1–99 (was 10–99), accommodating starting characters with stats in the 4–8 range.
- **Energy system locked** (v1.7). Max Energy = Raw POW (scales with Grade via stat cap). Regeneration is Consolidation-only — full refill at the start of any rest, no in-combat, post-combat, or passive regen. Principle/skill Energy costs are fixed at the skill's origin Grade and scale ×10 per Grade via Grade Magnitude. Old skills remain cheap forever; new Grade-appropriate skills cost full, giving every Breakthrough the "my old tricks last forever now, but real power comes from new-tier skills" feel.
- **Character creation locked.** 40-point buy across 7 attributes (floor 3, cap 10), 3 Proficiencies chosen at creation. Per-level budget locked at 5 points (3 GM-assigned via Behavioral Stat Mapping + 2 free). Pre-class allocation (Levels 2–9) uses GM behavioral read; post-class (Level 10+) uses class stat profile. HVE-to-stat mapping table established in `02a-character-creation.md`.
