![Quick Reference](./assets/quick_reference.png)

# Quick Reference

## The Clash

**Roll d100 + Force + Tactics. High wins.**

- **vs. Active opponent:** Both roll d100 + Force + Tactics. Higher total wins. Margin = Winner − Loser.
- **vs. Passive obstacle:** Beat the Resistance (from the Grade Reference Card).
- **Auto-success:** If Force ≥ Resistance, no roll needed.
- **Volatility:** In combat, if the **natural d100** (before any modifiers) meets the Grade threshold, roll again and add. Each cascade die also checks its own natural result. Applies to every d100 rolled in combat — attacker, defender, opposed, contested, or save.
- **Elevated:** +10 to roll. **Exposed:** −10 to roll. **Flanking:** +10 to roll.

**The Clash Formula:**

- **Attacker:** d100 + Offensive Force (STR/DEX/POW based on weapon) + Tactics
- **Defender:** d100 + Defensive Force (DEX to dodge, FOR to tank, HRT vs. mental, PER vs. illusion) + Tactics
- **Damage:** Margin × Grade Multiplier (append zeroes)

**Offensive Force by Weapon Type:**

- Heavy melee (axe, greatsword): STR Force
- Finesse melee (rapier, daggers): DEX Force
- Ranged (bows, thrown): DEX Force
- Spells and abilities: POW Force

**Defensive Force by Attack Type:**

- Physical (dodged): DEX Force
- Physical (absorbed): FOR Force
- Mental / spiritual / coercive: HRT Force
- Illusion / sensory deception: PER Force

**Grade Multipliers:** F-Grade: ×1 | E-Grade: ×10 | D-Grade: ×100 | C-Grade: ×1,000

**Volatility Thresholds (Combat Only, Natural Die):** F: 96+ | E: 90+ | D: 80+ | C: 70+ | B: 55+ | S: 40+

**Cross-Grade Adjustment:** The higher-Grade side gains +100 per Grade of difference. In Opposed Rolls, the higher-Grade combatant adds +100 to their total per Grade above the opponent. In Resistance Rolls, add +100 per Grade of difference to whichever side is higher (the challenger's roll if challenging a lower-Grade obstacle, the obstacle's Resistance if challenging a higher-Grade obstacle). Same Grade, no adjustment.

**HP** = Raw FOR × 2. **Energy** = Raw POW. Energy refills only on Consolidation (no in-combat or passive regen).

**Principle / Skill Energy Costs (F-Grade baseline):** Seed App: 10 | Early Fragment App: 15 | Infusion: free | Domain: 30 + 5/round. Multiply cost by Grade Magnitude (×10 / ×100 / ×1,000) for skills learned at E / D / C respectively. Cost is permanently fixed to the skill's origin Grade.

**Aura Pressure Save:** d100 + HRT Force + (FOR Force / 2) vs. Aura Resistance.

---

## Grade Reference Card

| **Difficulty** | **Resistance** |
|---|---|
| Trivial | 40 |
| Easy | 65 |
| Moderate | 90 |
| Hard | 115 |
| Severe | 140 |
| Peak | 165 |

Resistance is read straight off the card for same-Grade encounters. For Cross-Grade, apply the +100/Grade adjustment to whichever side is higher (see above).

| **Grade** | **Raw Stat Range** | **Force Range** | **Damage Multiplier** |
|---|---|---|---|
| F-Grade | 1–99 | 1–99 | ×1 |
| E-Grade | 100–999 | 10–99 | ×10 |
| D-Grade | 1,000–9,999 | 10–99 | ×100 |
| C-Grade | 10,000–99,999 | 10–99 | ×1,000 |

---

## Worked Examples

**1. F-Grade Peer Clash:**

Attacker: STR 55 (Force 55). Defender: FOR 40 (Force 40), HP 80.

- Attacker rolls 60 + 55 = 115. Defender rolls 50 + 40 = 90.
- Margin = 25. F-Grade adds 0 zeroes. **Damage = 25.**
- Defender drops from 80 HP to 55. Roughly a third of their health gone in one hit. Three or four solid exchanges before either side falls — decisive, but not instant.

**2. D-Grade Peer Clash (Volatility Cascade):**

Attacker: STR 8,500 (D-Grade, Force 85). Defender: FOR 7,000 (D-Grade, Force 70), HP 14,000.

- Attacker rolls a natural 82. D-Grade explodes on natural 80+. Rolls again: natural 40 (no further cascade). Total die = 122. Clash = 122 + 85 = 207.
- Defender rolls a natural 75 (no explosion). Clash = 75 + 70 = 145.
- Margin = 62. D-Grade adds 2 zeroes. **Damage = 6,200.**
- Defender drops from 14,000 to 7,800 HP. Half their health gone from a single explosive exchange. One more like that and they fall — but they still have a turn to respond.

**3. Cross-Grade: F-Grade Peak vs. E-Grade Initiate:**

F-Peak: STR 99 (Force 99), HP 198. E-Initiate: FOR 120 (Force 12, +100 Grade bonus = 112), HP 240.

F attacks E:

- F-Peak rolls brilliantly: 85 + 99 = 184. E-Initiate rolls poorly: 20 + 112 = 132.
- Margin = 52. F-Grade multiplier: ×1. **Damage = 52.** About a fifth of the E-Grade's HP — meaningful, but the E-Grade is still standing.

E attacks F:

- E-Initiate rolls average: 50 + 112 = 162. F-Peak rolls average: 50 + 99 = 149.
- Margin = 13. E-Grade multiplier: ×10. **Damage = 130.** F-Peak has 198 HP. Drops to 68 — two-thirds gone from a glancing blow. Cross-Grade is still brutal, but no longer instant death.
