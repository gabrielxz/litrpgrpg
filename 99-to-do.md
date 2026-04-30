# DEFIANCE OF THE FALL: TTRPG

## Design Backlog

---

### Pending Design Decisions (Active Discussion)


- **Energy Density as a full subsystem:** The Breakthrough doc defines energy density tiers sufficient for Breakthroughs, but the broader subsystem (affecting Consolidation efficiency, Principle resonance, monster spawning, territorial control, hex-level mapping) needs its own section.
- **Higher-Grade Breakthrough themes (D→C and beyond):** The universal blueprint and formula extend, but thematic trial content, failure severity, and Transcendent reward scales need development when the campaign reaches that point.
- **Bloodline interaction with Breakthroughs:** How does an active Bloodline modify the trial? Additional internal challenge, or a shortcut?
- **Ability/Spell interaction with the Clash system:** How do active skills modify Force, add Tactical bonuses, or create special Clash conditions?

### Systems To Be Designed

- Aura system (detailed mechanics beyond the Aura Pressure save)
- Potions and Pills (expanded: grades, HP values, Toxin costs)
- Professions (crafting, alchemy, formations)
- Merchants and economy
- Planetary leadership mechanics
- Races
- The "System" and opaque rules (how much players know vs. discover)
- Titles (mechanical and narrative effects)

- A rules-light quickstart version
- Epiphany Track (4–5 checkboxes tied to core Principle Concept)
- Principle Tiers and Active Nodes (changeable during Consolidation)
- VE reward tables (how much VE does each monster / quest / environmental source give?)
- Fracturing a node to avoid massive damage
- Grades progression (C-Grade through S-Grade and beyond)
- Bloodlines
- Secret starting benefits: Unique/Exclusive Skills, System Exploits, Specialized Builds, Unmatched Energy Pool/Regen, Superior Knowledge, Rapid Progression/Leveling
- Additional Grade Reference Cards (C-Grade and beyond)
- Weapon and skill catalog (Skill bonuses, Governing Stats)
- Class design framework (stat profile templates, Signature Skill shape, class evolution bonuses)

### Content To Be Produced

- Starting tutorial scenario (playtest-ready version of the Integration Protocol)
- Sample characters at F-Grade (with new starting stat ranges of 4–8)
- Sample monsters/enemies at F-Grade with stat blocks and VE rewards
- System AI prompt templates for class generation, loot generation, skill synthesis
- GM screen reference card (printable)

---

### Recently Resolved

- **Grade Breakthrough mechanic locked** (08-breakthroughs.md). Four-beat structure (Preparation → Ignition → Trial → Recognition). Roll formula: d100 + POW Force + HRT Force vs. Severe DC of target Grade. Five quality tiers (Cracked/Stable/Polished/Pristine/Transcendent) determined by margin. Overcharge Ratio is the player-controlled risk dial. Six item categories defined. Energy Density tiers established. HVE Coherence bonus rewards behavioral consistency. Party support is lightweight (Anchor action + phenomenon defense). Stat model on ascension: cap lifts + class evolution infusion (50–100 points at E-Grade, class-directed); no stat multiplication. Dump stats can lag behind Grade floor by design. F→E and E→D themes written; higher Grades deliberately deferred.

- **Heart (HRT) stat added as 7th attribute** (v1.6). Governs defense against mental/spiritual/coercive attacks and Aura Pressure. PER retains illusion/sensory defense role.
- **VE Tolerance formula locked** as (Raw FOR + Raw POW) / 2 × 10. Symmetric POW/FOR contribution; both builds consolidate at the same rate.
- **VE Processing Rate locked** as (Raw FOR + Raw POW) per hour of Consolidation.
- **Level chart locked** at 100 × 1.2^(Level-in-Grade − 1) × Grade Multiplier.
- **Stat cap rule locked:** stats cannot exceed Grade maximum (99 at F-Grade, 999 at E-Grade, etc.). Excess points from any source are lost. Breakthrough is the only way past.
- **F-Grade stat range expanded** to 1–99 (was 10–99), accommodating starting characters with stats in the 4–8 range.
- **Energy system locked** (v1.7). Max Energy = Raw POW (scales with Grade via stat cap). Regeneration is Consolidation-only — full refill at the start of any rest, no in-combat, post-combat, or passive regen. Principle/skill Energy costs are fixed at the skill's origin Grade and scale ×10 per Grade via Grade Magnitude. Old skills remain cheap forever; new Grade-appropriate skills cost full, giving every Breakthrough the "my old tricks last forever now, but real power comes from new-tier skills" feel.
- **Character creation locked.** 40-point buy across 7 attributes (floor 3, cap 10), 3 Proficiencies chosen at creation. Per-level budget locked at 5 points (3 GM-assigned via Behavioral Stat Mapping + 2 free). Pre-class allocation (Levels 2–9) uses GM behavioral read; post-class (Level 10+) uses class stat profile. HVE-to-stat mapping table established in `02a-character-creation.md`.
