# Rules Data

The tabular rules of Gradebreaker as structured data, one file per domain. The book's tables render from these files and the app's engine imports them, so a number changes in one place.

## Two truths

- **Numbers.** These files are the truth. The book's tables are rendered from them (`make tables`), the reference engine computes from them, and the fixtures under `fixtures/` check the book's worked examples against that engine (`make test`).
- **Procedures and judgment.** The book's prose is the truth. The engine implements it and never extends it. A question the engine forces that the book does not answer is a gap in the book: write the answer there first, then implement.

## Layout

| File | Holds |
|---|---|
| `version.yaml` | The rules version. Campaigns pin to one and migrate when the GM says so. |
| `grades.yaml` | Grades, divisors, stat caps, damage multipliers, Volatility thresholds, the Cross-Grade Adjustment. |
| `resolution.yaml` | The Resistance card, failure tiers, the Rule of 40, the Modifier Budget, positional states, ties. |
| `combat.yaml` | Beats, Momentum, Zones, the Clash, Yield, Downed and Death, Aura Pressure, Surge. |
| `character.yaml` | Attributes, point buy, derived stats, per-level budget, Proficiencies and Marks, the pregens. |
| `cultivation.yaml` | Tolerance, Saturation, Consolidation, the level cost, VE awards. |
| `principles.yaml` | The Principle ladder, IP sources, Application costs, slots, Fusion, families and Axioms. |
| `breakthrough.yaml` | The Breakthrough Check, Overcharge, Quality Tiers, modifiers, energy density, failure by transition. |
| `hve.yaml` | The four axes, sweep weights, Deep update, structured logging, Coherence bands. |
| `titles.yaml` | Categories, pacing, stacking, bonus magnitudes, the F-Grade Achievement Catalog, sample stacks. |
| `quests.yaml` | Categories, the Party, reward tables, refusal consequences, Hidden Quest modes. |
| `system-ai.yaml` | The three run modes, the generative functions, the loot table. |
| `items.yaml` | Pills, treasures, weapons, shards, artifacts, field gear. |
| `bestiary.yaml` | The twelve F-Grade stat blocks and the encounter sizing table. |
| `templates/` | The prompt templates and System-message shapes, verbatim. |
| `fixtures/` | The book's worked examples as test cases, each naming the chapter it came from. |

## Conventions

- Every value is F-Grade unless the key says otherwise; the Grade scaling rule (×10 per Grade) lives in `grades.yaml` and applies to anything marked `scales_with_grade: true`.
- Fractions round down, always (`resolution.yaml`).
- A `source:` key names the chapter file and section the value was taken from, so a reader can go check the prose.
- An edit under `rules/` updates the affected worked examples in the book and the fixtures, then `make tables` and `make test` run before the commit.
