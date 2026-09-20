# Gradebreaker — whole-book review

September 20, 2026 build. The source manuscript has not been edited.

**Keep the chapter structure.** The book has a coherent progression from resolution and character creation through advancement, GM systems, reference material, and the Tutorial. I found no compelling reason to rearrange it. The most valuable revision would make its procedures agree with one another, supply the missing operational details at the Tutorial’s climax, and remove repeated dramatic explanations after the useful information is already clear.

The distinctive voice is strongest in concrete details: salvaged places from dead worlds, the Kith’s marks and language barrier, brief survivor epigraphs, player dialogue, and impersonal System notices. These give the game character. Explanatory passages become weaker when they repeatedly insist that choices reveal identity, that the System is watching, or that a mechanic embodies a profound truth. Keep the specific detail and trust it to carry the atmosphere.

## Reading this review

- [Chapter change log](chapter-change-log.md): all 17 chapters, with 190 numbered voice recommendations, chapter-specific rules findings, and passages to preserve. Optional edits are labeled. Some language problems expose a rules decision; those replacements should not be applied automatically.
- [Voice standard](voice-standard.md): the editorial tests used, calibrated to the accessible examples in “AI Voice Change Log” and your requested threshold.

Page references below are **printed pages**; add nine for the PDF viewer page. The appended Table Kit uses **PDF page numbers** because its sheets lack the main book’s numbering. “Confirmed inconsistency” means the printed statements disagree; it does not mean I have decided which statement should become the rule. “Decision needed” means the text leaves materially different readings open. Optional design suggestions are identified separately.

## Fix these before polishing individual sentences

### 1. The two HVE procedures describe different games

**Confirmed inconsistency — pp. 119–123.** The paper procedure clears Current each session and adds one Deep tally to an axis side only when its Current lead is at least two. Structured logging instead adds half of every event to Deep, decays Deep by 10%, halves Current, and includes events below the paper procedure’s threshold. The text nevertheless says outputs read the same and tables can switch by copying totals.

These are consequential differences because Deep determines Coherence bands and informs titles, Principles, classes, and offers. Consider eight sessions, each with one intensity-two event on the same side of an otherwise empty axis. Paper tracking yields eight Deep tallies. If structured tracking applies the event and then the stated session-end decay, it yields about 5.13. That crosses different Coherence bands: Singular versus Defined, with +20 versus +10. Even another ordering of the decay would not make the algorithms equivalent. A quiet session also preserves paper Deep while reducing structured Deep.

**Smallest fix:** choose a canonical update algorithm and make both interfaces implement it. If the distinction is intentional, call structured logging a variant, calibrate its thresholds independently, and remove the claim that copying totals preserves behavior. Also specify when Personal Opportunities read Current before the paper sweep erases it.

### 2. The reference material changes important core rules

**Confirmed inconsistencies — pp. 15,28–29,144–145,252–254; PDF 281–282.** These are especially worth fixing because readers will use the aids after forgetting the main chapter.

| Subject | Conflicting statements | Smallest fix |
|---|---|---|
| Soft Failure | Core Mechanics defaults to a setback with a way forward and makes success at a cost optional. Quick Reference defaults to success at a cost; the GM screen repeats it. | Choose the default once and copy the same short definition into both aids. |
| Aether restoration | Core and summary language says only Consolidation restores Aether; Aether Pills and Pulse Shards explicitly restore it too. | Distinguish normal regeneration from consumable restoration. |
| Visible titles | The p. 144 table restricts peer visibility differently from the surrounding prose, particularly worn Bestowed and negative titles. | Make one canonical visibility matrix, including Grade gaps and exceptions. |
| Hidden information | Hidden Achievement privacy, high-Grade inspection, and Hidden Quest disclosure are described with incompatible absolutes across Chapters 8, 11, and 12. | State which exceptions override which privacy rules; distinguish the three Hidden Quest modes. |

The Table Kit also needs the untrained-to-Trained Marks step, clearer flanking wording, and the effects of Suppression. Update the kit after the canonical rules are settled so it does not preserve an older interpretation.

### 3. Correct the resource and damage examples

**Confirmed arithmetic problems — pp. 10,25–26,29,67.** FOR 120 gives 240 HP, as the later reference example correctly shows. A 130-damage hit against a character with 80 Max HP causes Downed under the written rule; annihilation requires a single hit of 800. The core example incorrectly calls this death. The example’s E-Grade offensive Force also needs an actual offensive Attribute instead of implicitly reusing FOR.

Surge costs half Max Aether rounded up, so a pool of five pays for one three-point Surge, not two. The global rounding rule should explicitly allow local exceptions. The healing promise also needs one: if each hourly amount rounds down, a 14-HP character heals two per hour, totaling ten after five hours, rather than necessarily reaching full HP. Choose cumulative rounding or an explicit full-recovery rule.

**Decision needed:** state whether characters with zero stored VE can Consolidate to regain resources, and what happens to refined VE at a Grade’s level cap. These are routine rest questions, not obscure edge cases.

### 4. Give the Tutorial climax a runnable setup

**Decision needed — pp. 231–239.** The causeway has a one-person-per-round queue, a Warden moving three Zones per turn, and a thirty-minute fictional countdown. It lacks enough initial positioning and timing to determine how those elements interact. Beats deliberately have no fixed duration, so the fictional countdown does not supply a combat-round deadline by itself.

Add a compact GM setup showing the gate, the queue, the Warden’s initial position, the relevant Zones, and a default number of rounds before the Purge reaches them. Give explicit adjustments for rescued NPCs and earned sector benefits. The illustrated map establishes atmosphere but does not provide this procedure. This is the largest missing piece of the Tutorial’s practical instructions; the underlying scene can remain intact.

The Warden also needs one complete state description, shared by pp. 157 and 234: behavior after 1–47 damage, the 48-damage hostility threshold, what a sacrificial attack overrides, Cornered immunity, and the Beat remaining when a three-Beat creature gives up two. Narrow claims that F-Grade characters cannot beat it to the intended starting-party situation unless invulnerability is an actual rule.

**Confirmed inconsistency — pp. 155,220:** the Bestiary gives ordinary physical attacks against the Wraith−10; the Tutorial describes them passing through. This changes which parties can overcome it. Choose the rule and identify which shards actually damage it.

Put the Tutorial’s no-accidental-PC-death exception from p. 239 in the preparation checklist. A GM needs it before running the first potentially lethal scene.

### 5. Rebuild the Tutorial reward ledger around actual routes

**Confirmed inconsistencies — pp. 211,223,228,242–243,247–248.** The current estimates mix guaranteed rewards, optional rewards, per-session rewards, stored VE, and final advancement.

- Two Easy Frenzy Rats pay ten VE, not the ledger’s two to four. The probe can pay ten optional VE despite Phase 1 listing none.
- A surveyed Arcane sector can pay forty VE without its optional fight. The text cannot guarantee 120 per sector using optional rewards or count the one-time Kith encounter toward both sectors.
- Survival VE varies with the number of sessions, so the two-session and four-session formats do not have identical totals.
- At 120 VE per level,265 total earned VE gives Level 3 plus 25/120 toward the next level. It is not a third of a level. The following page’s completion award then guarantees Level 4, changing the stated final result.
- Stored VE alone cannot establish a projected level without starting level and previously refined progress.

**Smallest fix:** use one ledger with explicit columns for earned VE, refined VE, stored VE, and completion top-up. Show a cautious route and a more complete route. If every character finishes at least Level 4, state that the completion award brings total earned VE to at least 360, with refinement handled under the chosen ending procedure. Remove guarantees about Mild Saturation or a first level at the intervening camp unless every supported route actually produces them.

## Other rules decisions to make explicitly

These are local clarifications. They do not require new subsystems.

**Principles — pp. 49–60,226,229.** Define whether IP totals remain cumulative; the “spent into Seed” example suggests otherwise. Initial Insight at three IP is automatic, so both the prose and the diagram should limit required Distillation to later tiers. Bring the one-use Battle Memory rule forward from the Tutorial/cards. Reconcile the Trapped Intelligence’s one-point meditation award with its later immediate award plus another meditation award. Add a complete example of an attack Application’s action and roll. For Infusion, Domains, and Fusion, specify enough limits and bookkeeping to resolve ordinary use. Attunement’s environmental comfort needs a boundary before anyone interprets comfort in a knife-storm as damage immunity.

**Combat — pp. 17–23,28.** State Yield’s budget under Suppression and third-Beat features, prevent spending the same future Beats repeatedly, and say whether the reduced Margin controls positional effects as well as damage. Clarify whether flanking normally also makes the target Exposed. Specify how multiple Momentum changes and multi-sided encounters are ordered. These questions occur during ordinary play, so short explicit answers would do more than additional combat philosophy.

**Titles — pp. 94–109.** Clarify removal or replacement of previously applied bonuses, conditional stat bonuses and derived resources, and the interaction with caps. A title granting a free attack needs to be an explicit exception to the claim that only Master proficiency grants a free action. Distinguish the two uses of “The Open Hand.” Complete the Tutorial title index; “Came Back Whole” leaves its bonus to the GM intentionally on the card, but that instruction should appear in its main entry too.

**Examples and terminology.** Either carry one consistent Kara through the Principle and HVE examples or label alternative versions. Distinguish a Consumption-family void-like effect from the Void Axiom, which the Principle chapter says behavior cannot produce. Make the difference between qualitative visions of a character and numerical HVE inspection explicit for both mirrors. These details matter because readers learn the setting’s limits from examples.

## Tutorial continuity and player experience

The Tutorial has useful teaching scenes, specific NPC consequences, and a strong translation payoff. Keep its sequence. Repair the following connections locally:

- **Time:** the introduction promises three sessions; the Tutorial defaults to two long or four short sessions. The probe also has conflicting time limits. The ending returns everyone on day three, allows a full day or more of rest, then still places the stinger three days after disappearance.
- **Kith history and language:** decide whether nineteen days means time since entry or time living in the Civic Remnant before leaving three days ago, and account for the short tally marks. Explain why people from an old Integrated world lack Interpretation until this accession. Place the first translated speech once, or clearly offer alternative placements.
- **Queue membership:** the NPC table and later scenes disagree about which surviving Node strangers appear at the gate. Use one criterion, since the queue changes a consequential choice.
- **Information before choices:** the Resonance Shard’s broad purpose should be discoverable if the choice is meant to test immediate equipment against delayed advancement. Preserve secret exact rewards, but give enough information to understand the kind of consequence. Likewise, identify unusually persistent Suppression before an irreversible teaching choice if players are meant to choose knowingly.

**Optional design consideration:** the separate arrival lessons can leave four players waiting through roughly an hour of other players’ scenes. Private choices may justify this; make the time commitment explicit and offer individual pre-session scenes as an alternative. Similarly, use the existing post-fight explanation of Yield when a character wins cleanly rather than manufacturing enough pressure to force that lesson. The outcome checklist should distinguish understanding a mechanic from having been compelled to use it.

## Scope and organization

The book’s promises sometimes exceed its supplied procedures. Chapter 4 says class generation is unfinished, while Chapter 9 does contain a minimum class worksheet. The fix is not to claim there is no class system: identify the worksheet as the current method, add one fully worked class example, and say which later-Grade material is provisional. The bestiary and equipment support are centered on F-Grade even though the book explains later progression.

Likewise, describe the planned companion app consistently. Chapter 10 calls it future work, while earlier descriptions can sound like present functionality. Requiring a digital quest log also sits awkwardly beside the claim that paper is always sufficient; supply a paper equivalent if that promise is intended.

I recommend three small navigation changes:

1. Add Progression and What Can Be Seen to the GM’s preparation route, with Quick Reference as a table aid.
2. Put essential exceptions beside their first relevant procedure, with short forward references to full explanations.
3. Give each repeated rule one canonical table or definition, then copy its wording into summaries and cards.

**Optional:** retain only the design-intent sections that explain a real tradeoff. The repeated manifestos in Principles, HVE, quests, and the Tutorial often restate the same premise. Trimming those paragraphs would make the existing organization feel lighter without moving chapters.

The memory-only HVE sweep is another deliberate tradeoff, not an automatic defect. It reduces live bookkeeping but can favor memorable, louder scenes. If that is intentional, acknowledge it. Permitting brief reminder notes would be a design change, so I have not silently built it into voice replacements.

## Production corrections

- **p. 174 / PDF 183:** body text extends below the footer and off the page. The next page starts a new section, so the missing end of the bullet is unavailable in this build. Restore it from the manuscript and repair the layout.
- **p. 137 / PDF 146:** an AI prompt prints “-13 lines”; confirm whether the intended instruction is “1–3 lines.”
- **p. 242 / PDF 251:** decorative separator lines run into the summary title and final VE field. Restore the line breaks.
- **p. 49 / PDF 58:** correct the Principle diagram’s three-IP Distillation implication alongside the prose.

## Recommended revision order

Settle the HVE algorithm and core-rule contradictions first. Then repair the Tutorial’s climax procedure, reward ledger, and continuity. Apply the voice edits with optional entries chosen individually, preserving the System’s intentional register and concrete imagery. Finally synchronize the references and cards, rebuild the PDF, and check the affected pages.

The review covers the complete extracted text of all 17 chapters and the appended kit. I also inspected thumbnail contact sheets spanning all 282 PDF pages and enlarged the relevant diagrams, map, handout, screen, and suspect layout pages. Thumbnail inspection is not a typography proof of every page; the missing text on p. 174 could not be reviewed. The findings come from reading, cross-references, and targeted arithmetic checks, not a completed table playtest. The full separate artifact mentioned in “AI Voice Change Log” was unavailable; its accessible discussion and examples informed the voice standard without being presented as its exact original list.
