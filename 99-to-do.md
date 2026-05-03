# Design Backlog

*Active items, deferred items, and recently resolved decisions for the LitRPG: RPG project. Not part of the published book.*

---

## Pending Design Decisions (Active Discussion)

- **DEX-keyed movement and cross-Grade speed scaling. (FRONT OF BACKLOG — solve before next playtest.)** Movement is currently uniform: 1 Zone per Beat for everyone, regardless of DEX. High-DEX builds get no mechanical speed advantage, which contradicts the genre's most basic build expectation. A within-Grade fix (Free Step at DEX Force 25+, Sprint Mastery at 75+) addresses peer combat but does not differentiate across Grades, since Force is always 1–99 within a Grade. A cross-Grade-aware solution likely requires movement bonuses keyed to Grade differential, scaling Beats with Grade, raw-DEX-derived speed, or a separate Speed stat. Each is its own design problem and none has been chosen. The DEX deal-breaker stands open until this lands.
- **Energy Density as a full subsystem:** The Breakthrough doc defines energy density tiers sufficient for Breakthroughs and Cultivation defines passive absorption rates, but the broader subsystem (affecting Principle resonance, monster spawning, territorial control, hex-level mapping) needs its own section.
- **Higher-Grade Breakthrough themes (D→C and beyond):** The universal blueprint and formula extend, but thematic trial content, failure severity, and Transcendent reward scales need development when the campaign reaches that point.
- **Bloodline interaction with Breakthroughs:** How does an active Bloodline modify the trial? Additional internal challenge, or a shortcut?
- **Ability/Spell interaction with the Clash system:** How do active skills modify Force, add Tactical bonuses, or create special Clash conditions? Stable Abilities are a tutorial-tier example; class-tier and Principle-tier interactions need a unified treatment.
- **Large-negative-margin outcomes and defensive explosion payoffs.** Volatility now applies symmetrically — defenders can explode the same as attackers, and a winning defender's exploded roll can drive the attacker's Margin sharply negative. Currently the rule is clean: a winning defender deals no damage from the Clash. Open question is whether large-negative-margin outcomes (whether driven by a defensive explosion or simply by a wide gulf in Force) should produce mechanical consequences beyond "no damage" — counter-damage, a forced Momentum shift, weapon-breakage, a free Beat, or pure narrative spectacle. Not yet ready to commit; needs playtesting before deciding.
- **Mechanical effects of sustained Volatility cascades.** Today, a Volatility cascade is "extra dice on this roll, narrate the spike." The probability of multi-die cascades is non-trivial at higher Grades (D = ~21% per die, so a 3-die chain happens roughly 1 in 110 rolls). Open design space: should sustained cascades trigger something systemic? Candidates: an Insight Point award, a brief "trance" upgrade window mid-battle, a Battle Memory trigger (already a partial fit — Principles doc mentions "landing an improbable Volatility cascade" as a Battle Memory trigger), a temporary Principle awakening, a free Beat, a permanent stat tickle for the character who survived being on the receiving end. Decide before B-Grade content — at S-Grade the cascade rate is high enough that this becomes a defining mechanic.

## Systems To Be Designed

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

## Content To Be Produced

- Playtest-ready Integration Protocol (post-reconciliation pass)
- Sample characters at F-Grade (with new starting stat ranges of 4–8)
- Additional F-Grade enemies as the campaign demands them (current bestiary: 12 entries)
- System AI prompt templates for class generation, loot generation, skill synthesis
- GM screen reference card (printable)
- **Starting-human stat reference table.** A per-stat archetype breakdown for values 1–10 across all seven Attributes (STR, DEX, FOR, HRT, POW, PER, CHA). Anchors what each value means for a freshly integrated human so players can interpret point-buy choices concretely. Natural home: `15-character-creation.md`, near the Sample Spreads. Calibrate so 10 is genuine peak human (e.g., for STR: strongest humans ever recorded), 8–9 are recognizable elite tiers, 5 is average, 3 is the deficiency floor.

## Production / Visual Design

- **Verify the title page cover treatment.** Eisvogel's `titlepage-background` overlays the default title/author/date text on top of the cover image. If the existing `assets/cover.png` already has the title baked in, the result will double up. Check the rendered title page; if doubled, set `titlepage-text-color` to match the background or move the title elsewhere.
- **Generate chapter header art for the five chapters that lack it.** Currently missing: Stable Abilities (`35`), Titles (`40`), Quests (`55`), Bestiary (`60`), Items (`65`). Generate art per the art style guide so the visual rhythm matches the existing chapters. The pipeline picks new PNGs up automatically once they land in `assets/`.
- **Decide what to do with `assets/proficiencies_skills.png`.** Proficiencies merged into Core Mechanics during the structure pass; the standalone art is now orphaned. Either repurpose for the Core Mechanics chapter art (which already has `core_mechanics.png`), keep as a section-opener within Core Mechanics, or retire.
- **Refine callout box styling toward stencil/sumi-e aesthetic.** The current `systemvoice`, `statblock`, and `questcard` environments use generic cyan/gray defaults. The art style guide calls for a heavier, more handcrafted look — frantic black brushwork, distressed textures, neon "System Pop" accents only on System UI. Retune colors, rules, and texture in `pipeline/preamble.tex` once the visual identity is locked.
- **Consider splitting the heading font.** Alegreya Black is currently used for all section levels. If it reads as too aggressive for sub-section headings, split it: Alegreya Black for chapter titles only, regular Alegreya (Bold or Medium weight) for `section` and below. Single-line preamble change.
- **Apply callout boxes to existing content.** The `systemvoice`, `statblock`, and `questcard` environments are defined and one demo is in place (Phase 1 of the tutorial). Existing patterns that would benefit: System voice quotes throughout the tutorial, all bestiary entries in `60-bestiary.md`, all Quest UI entries (`[Q-XXX]` blocks) across the docs.

---

## Recently Resolved

- **Structural reorganization pass.** All source files renamed to a gap-of-5 numbering scheme (05, 10, 15, ... 70) to allow new chapters to slot in without renumbering. Tutorial moved to the end (`70-tutorial.md`), Bestiary and Items moved to reference appendix slots (`60`, `65`). The 02 / 02a awkwardness resolved: Proficiencies merged into Core Mechanics (`10`) as a "Proficiencies and Skill Checks" subsection under Core Resolution; Character Creation became `15-character-creation.md`. Boilerplate `# LitRPG: RPG` H1 removed from every source file — chapter titles are now the actual H1. All manual heading numbering stripped (`§3a`, `Step 1`, `Part I/II`, Roman numerals, lettered subsections). Pandoc `--number-sections` now auto-numbers everything in the TOC consistently (1, 2, 2.1, 2.1.1, ...). All cross-references between files updated to new filenames and section names. Build pipeline updated: dropped `--shift-heading-level-by=-1`, added `numbersections: true` and `secnumdepth: 3` to metadata.

- **Project renamed to "LitRPG: RPG."** The legacy "Defiance of the Fall: TTRPG" boilerplate H1 was replaced with `# LitRPG: RPG` across all 16 source markdown files. Makefile updated (header comment, pre-processing comment, sed pattern). The genre-influence reference to the *Defiance of the Fall* novel series in `CLAUDE.md` was preserved — that names a real source novel, not the project.

- **Tutorial rewritten end-to-end** (`70-tutorial.md` v2.0, ~850 lines). All seven phases reconciled with current rules. New: pre-tutorial setup checklist, mechanics introduction schedule (mapping each phase to which mechanics it teaches), expected mechanical outcomes (every player must hit specific milestones by tutorial end). Phase 1 probes mapped to specific HVE axes. Phase 2 micro-encounters use bestiary stat blocks and items.md references with explicit VE rewards and intensity logging. Phase 3 introduces the Quest UI formally (Q-001, Q-002). Phase 4 zones each demonstrate a specific mechanic (Volatility cascade, Aura Pressure save, Saturation, skill shard activation). Phase 5 events are framed as Personal Opportunities. Phase 6 opens with the first Mandate (M-00) and uses the Corrupted System Warden bestiary block. Phase 7 includes per-archetype summary templates, Stable Ability assignment, first Title delivery, Affinity Notices, Hidden Quest reveals, and the Stinger. Three new GM Reference appendices: Vector Logging Cheatsheet, Mechanics Introduction Tracker (checklist), Tutorial Reward Ledger (VE pacing by phase).

- **Titles system locked** (`40-titles.md`). Four categories (Achievement, Hidden Achievement, HVE-Resonant, Bestowed). Stacking unbounded except for HVE-Resonant axis-pair mutual exclusion. Bonus magnitudes calibrated for stacking — F-Grade flat bonuses +1 to +5, percent bonuses capped at +15% per title, percent stacking uncapped. HVE-Resonant titles evolve at Breakthrough; Achievement and Hidden Achievement titles persist statically. Inspection rules tied to Grade differential. Negative titles (Oathbroken, etc.) are public and require in-fiction action to shed. Sample F-Grade titles written for all four HVE archetypes.

- **System Quests system locked** (`55-quests.md`). Five quest categories (Mandates, Personal Opportunities, Routine, Hidden, Faction). Quest UI is a shared digital log with structured entries; embraces the video-gamey System interface. Quest VE policy: action VE accumulates normally during a quest *and* completion VE is awarded on top — quest VE is a multiplier on activity, not a substitute. Reward Reference Table calibrates VE, items, titles, and narrative rewards by category and difficulty. Refusal-consequence taxonomy formalized — single-quest, repeated-type, faction, Mandate. Personal Opportunity generation uses a structured System AI prompt template. Hidden Quest UI conventions: Fully Obscured, Partial Reveal, Post-Completion Only.

- **F-Grade content pack for prototype play.** Bestiary (`60-bestiary.md`, 12 stat blocks across Trivial through Peak), Stable Abilities catalog (`35-stable-abilities.md`, 12 tutorial-tier abilities mapped to HVE axes), and items/consumables/Volatile Artifacts (`65-items.md`, healing pills, energy pills, foundation pills, weapons, skill shards, reactive buckler, single-use ranged relic). VE Reward Table added to `25-cultivation.md` covering combat, quest, survival, and environmental sources at F-Grade with ×10/Grade scaling.

- **Grade Length locked at 25 levels per Grade.** F-Grade spans Levels 1–25; E-Grade spans its own 1–25; and so on. The exponential VE curve repeats identically at every Grade, scaled by the Grade Multiplier. Updated `25-cultivation.md`.

- **Starting Principle Access rule (Step 5 of Character Creation).** Freshly integrated characters cannot start with active Principle Applications. At creation they may have at most Initial Insight (passive only) toward one Principle Concept. Active Applications (Seed and above) are unlocked through play via Insight Points. Solves the Energy trap for low-POW caster archetypes — by the time a Seed unlocks naturally through play, POW has grown enough to support the cost.

- **Tutorial Multi-Level Allocation note** added to `15-character-creation.md`: GM can compress per-level stat allocation when the tutorial awards multiple levels at once.

- **Grade Breakthrough mechanic locked** (`30-breakthroughs.md`). Four-beat structure (Preparation → Ignition → Trial → Recognition). Roll formula: d100 + POW Force + HRT Force vs. Severe DC of target Grade. Five quality tiers (Cracked/Stable/Polished/Pristine/Transcendent) determined by margin. Overcharge Ratio is the player-controlled risk dial. Six item categories defined. Energy Density tiers established. HVE Coherence bonus rewards behavioral consistency. Party support is lightweight (Anchor action + phenomenon defense). Stat model on ascension: cap lifts + class evolution infusion (50–100 points at E-Grade, class-directed); no stat multiplication. Dump stats can lag behind Grade floor by design. F→E and E→D themes written; higher Grades deliberately deferred.

- **Heart (HRT) stat added as 7th attribute** (v1.6). Governs defense against mental/spiritual/coercive attacks and Aura Pressure. PER retains illusion/sensory defense role.
- **VE Tolerance formula locked** as (Raw FOR + Raw POW) / 2 × 10. Symmetric POW/FOR contribution; both builds consolidate at the same rate.
- **VE Processing Rate locked** as (Raw FOR + Raw POW) per hour of Consolidation.
- **Level chart locked** at 100 × 1.2^(Level-in-Grade − 1) × Grade Multiplier.
- **Stat cap rule locked:** stats cannot exceed Grade maximum (99 at F-Grade, 999 at E-Grade, etc.). Excess points from any source are lost. Breakthrough is the only way past.
- **F-Grade stat range expanded** to 1–99 (was 10–99), accommodating starting characters with stats in the 4–8 range.
- **Energy system locked** (v1.7). Max Energy = Raw POW (scales with Grade via stat cap). Regeneration is Consolidation-only — full refill at the start of any rest, no in-combat, post-combat, or passive regen. Principle/skill Energy costs are fixed at the skill's origin Grade and scale ×10 per Grade via Grade Magnitude. Old skills remain cheap forever; new Grade-appropriate skills cost full, giving every Breakthrough the "my old tricks last forever now, but real power comes from new-tier skills" feel.
- **Character creation locked.** 40-point buy across 7 attributes (floor 3, cap 10), 3 Proficiencies chosen at creation. Per-level budget locked at 5 points (3 GM-assigned via Behavioral Stat Mapping + 2 free). Pre-class allocation (Levels 2–9) uses GM behavioral read; post-class (Level 10+) uses class stat profile. HVE-to-stat mapping table established in `15-character-creation.md`.
