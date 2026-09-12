"""Render the book's rules tables from rules/*.yaml.

Each generated table sits between two markers in the chapter source:

    <!-- rules:table grade-table -->
    | **Grade** | ... |
    ...
    <!-- /rules:table -->

    python3 tools/render_tables.py            # regenerate every marked table in place
    python3 tools/render_tables.py --check    # exit 1 if any marked table is stale
    python3 tools/render_tables.py --install  # wrap the registered tables in markers (first-time setup; idempotent)

Pandoc drops HTML comments from the PDF and leaves them harmless in the EPUB.
The generators reproduce the book's wording; the numbers come from the data.
"""

from __future__ import annotations

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rules_engine as E  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = os.path.join(ROOT, "book")
OPEN = "<!-- rules:table {} -->"
CLOSE = "<!-- /rules:table -->"


def fmt(n) -> str:
    return f"{n:,}" if isinstance(n, int) else str(n)


def table(header: list[str], rows: list[list], bold: bool = True, align: str | None = None) -> list[str]:
    head = [f"**{h}**" if bold else h for h in header]
    sep = align or "|" + "---|" * len(header)
    return ["| " + " | ".join(head) + " |", sep] + ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]


# ------------------------------------------------------------ generators ---
# Each returns the table's lines. Registry entries: id -> (file, header line to find, preceding bold label or None, generator)

def g_grade_table():
    rows = [[g["name"], f"{fmt(g['raw_min'])}–{fmt(g['raw_max'])}", fmt(g["divisor"]), f"{g['force_min']}–{g['force_max']}", f"×{fmt(g['damage_multiplier'])}"]
            for g in E.load("grades")["grades"][:5]]
    return table(["Grade", "Raw Stat Range", "Divisor", "Force Range", "Damage Multiplier"], rows)


def g_resistance_card():
    return table(["Difficulty", "Resistance"], [[r["difficulty"], r["resistance"]] for r in E.load("resolution")["resistance_card"]])


def g_volatility():
    rows = [[g["name"], f"{g['volatility_threshold']}–100", f"{E.volatility_probability_percent(g['code'])}%"] for g in E.load("grades")["grades"]]
    return table(["Grade", "Explodes On (natural)", "Probability"], rows)


def g_modifier_budget():
    rows = []
    for m in E.load("resolution")["modifier_budget"]:
        size = f"+{m['size_min']} to +{m['size_max']}" if "size_min" in m else (f"+{m['size']}" if m["size"] > 0 else f"−{-m['size']}")
        rows.append([m["name"], size, ", ".join(m["examples"])])
    return table(["Modifier", "Size", "Examples"], rows)


def g_damage_table():
    rows = [[g["name"], f"Margin × {fmt(g['damage_multiplier'])}"] for g in E.load("grades")["grades"][:4]]
    return table(["Attacker's Grade", "Damage"], rows)


def g_grade_gap():
    per = E.load("grades")["cross_grade_adjustment_per_grade"]
    rows = [["Same Grade", "+0"], ["1 Grade higher", f"+{per}"], ["2 Grades higher", f"+{2*per}"], ["3+ Grades higher", f"+{3*per} or more"]]
    return table(["Grade Gap", "Higher-Grade Bonus"], rows)


def _app_costs(labels, domain_suffix):
    rows = []
    for row, label in zip(E.load("principles")["application_costs"], labels):
        if "per_round_sustained" in row:
            rows.append([label, f"{fmt(row['aether'])} + {fmt(row['per_round_sustained'])} per round {domain_suffix}"])
        else:
            rows.append([label, "none" if row["aether"] == 0 else fmt(row["aether"])])
    return table(["Granted at", "Aether Cost"], rows)


def g_application_costs_core():
    return _app_costs(["Seed Application", "Early Fragment Application", "Infusion (Mid Fragment)", "Domain (Peak Fragment)"], "sustained")


def g_application_costs_principles():
    return _app_costs(["Seed", "Early Fragment", "Infusion (Mid Fragment)", "Domain (Peak Fragment)"], "held")


def g_proficiency_tiers_core():
    t = {x["name"]: x for x in E.load("character")["proficiencies"]["tiers"]}
    rows = [["**Trained**", f"+{t['Trained']['bonus']} to Clashes and skill checks in the domain. Routine Mastery. Specialist Gating access."],
            ["**Seasoned**", f"+{t['Seasoned']['bonus']} (in place of the +{t['Trained']['bonus']})."],
            ["**Master**", f"+{t['Master']['bonus']}, and once on your turn your first action using the Proficiency costs no Beat. Requires an {t['Master']['requires_grade']}-Grade body."]]
    return table(["Tier", "Effect"], rows)


def g_proficiency_tiers_quickref():
    t = {x["name"]: x for x in E.load("character")["proficiencies"]["tiers"]}
    rows = [["Trained", f"+{t['Trained']['bonus']} to Clashes and skill checks in the domain. Routine Mastery (auto-succeed Trivial and Easy). Specialist Gating access."],
            ["Seasoned", f"+{t['Seasoned']['bonus']} in place of the +{t['Trained']['bonus']}. **{t['Seasoned']['marks_required']} Marks.**"],
            ["Master", f"+{t['Master']['bonus']}, and once on your turn your first action using it costs no Beat. **{t['Master']['marks_required']} Marks**, and an {t['Master']['requires_grade']}-Grade body."]]
    return table(["Tier", "Effect"], rows, bold=False)


def g_kill_tiers():
    rows = []
    for r in E.load("cultivation")["awards"]["kill_tiers"]:
        mult = r["multiple"]
        award = "Peer Kill" if mult == 1 else f"Peer Kill × {mult:g}"
        name = "Moderate (peer)" if r["difficulty"] == "Moderate" else r["difficulty"]
        rows.append([name, award, r["ve"]])
    return table(["Difficulty", "Award", "F-Grade VE"], rows)


def g_quickref_grades():
    rows = [[g["name"], f"{fmt(g['raw_min'])}–{fmt(g['raw_max'])}", f"{g['force_min']}–{g['force_max']}", f"×{fmt(g['damage_multiplier'])}"]
            for g in E.load("grades")["grades"][:4]]
    return table(["Grade", "Raw Stat Range", "Force Range", "Damage Multiplier"], rows)


def g_quickref_ve():
    c = E.load("cultivation")
    tiers = " / ".join(r["difficulty"] for r in c["awards"]["kill_tiers"])
    vals = " / ".join(str(r["ve"]) for r in c["awards"]["kill_tiers"])
    rows = [["A level", c["level_cost"]["base"]],
            [f"Kill, by tier: {tiers}", vals],
            ["Session survival", c["awards"]["session_survival"]],
            ["Cross-Grade kill", "the victim's tier read at its own Grade, ×10 per Grade above the killer; a victim below your Grade pays nothing"]]
    return table(["VE at F-Grade", "Amount"], rows)


def g_overcharge():
    words = {1: "One Tolerance", 2: "Twice Tolerance", 3: "Three times Tolerance", 4: "Four times Tolerance"}
    rows = []
    for r in E.load("breakthrough")["overcharge"]:
        dc = "Base difficulty" if r["dc_modifier"] == 0 else f"+{r['dc_modifier']} to Breakthrough DC"
        q = "+0" if r["quality_tiers"] == 0 else f"+{r['quality_tiers']} Tier" + ("s" if r["quality_tiers"] != 1 else "")
        rows.append([f"×{r['ratio']}.0 ({r['label']})", words[r["ratio"]], r["saturation"], dc, q])
    return table(["Overcharge Ratio", "VE Stored", "Saturation While Charging", "Trial Difficulty", "Quality Modifier"], rows, bold=False)


def g_overcharge_dc():
    ratios = [r["ratio"] for r in E.load("breakthrough")["overcharge"]]
    return table(["Overcharge Ratio"] + [f"×{r}.0" for r in ratios], [["Effective DC"] + [E.breakthrough_dc(r) for r in ratios]], bold=False)


def g_breakthrough_modifiers():
    rows = []
    for m in E.load("breakthrough")["modifiers"]:
        if "roll_modifier" in m:
            rows.append([f"{m['source']} consumed", f"no roll modifier (affects {'tier' if 'tier' in m['effect'] else 'failure severity'})"])
        else:
            rows.append([m["source"] + (" (see below)" if m["source"] in ("Location Energy Density", "HVE Coherence Bonus", "Party Support") else ""), f"+{m['min']} to +{m['max']}"])
    return table(["Source", "Modifier"], rows, bold=False)


def g_quality_tiers():
    rows = []
    for t in E.load("breakthrough")["quality_tiers"]:
        lo, hi = t["margin_min"], t["margin_max"]
        m = "Below 0" if lo is None else (f"{lo}+" if hi is None else f"{lo}–{hi}")
        rows.append([m, f"**{t['tier']}**", t["description"]])
    return table(["Margin", "Base Tier", "Description"], rows, bold=False)


def g_energy_density():
    rows = [[f"**{t['tier']}**", f"+{t['bonus']}", t["phenomena"], t["examples"]] for t in E.load("breakthrough")["energy_density"]]
    return table(["Tier", "Breakthrough Bonus", "Phenomena Intensity", "Example Locations"], rows, bold=False)


def g_coherence():
    rows = [[b["profile"], b["rule"], f"+{b['bonus']}"] for b in E.load("hve")["coherence_bands"]]
    return table(["Profile", "Deep tallies", "Coherence Bonus"], rows)


def g_sweep_weights():
    rows = []
    for w in E.load("hve")["sweep"]["weights"]:
        n = w["tallies"]
        label = "No tally" if n == 0 else (f"{n} tally ({w['name'].lower()})" if n == 1 else (f"{n} tallies ({w['name'].lower()})" if n == 2 else f"{n} tallies, circled ({w['name'].replace(' (surprised the player)', ': surprised the player themselves')})"))
        rows.append([label, w["qualifies"], w["example"]])
    return table(["Weight", "What qualifies", "Example"], rows)


def g_principle_ladder():
    grants = {"Initial Insight": "The Principle crystallizes and is named; minor passive (e.g., +5 to defensive Clashes against fire)"}
    rows = [[r["tier"], r["cumulative_ip"], grants.get(r["tier"], r["grants"])] for r in E.load("principles")["ladder"]]
    return table(["Tier", "Cumulative IP", "Grants"], rows)


def g_ip_sources():
    rows = []
    for r in E.load("principles")["ip_sources"]:
        ip = str(r["ip_min"]) if r["ip_min"] == r["ip_max"] else f"{r['ip_min']}–{r['ip_max']}"
        if r["source"].startswith("Battle Memory"):
            ip += ", by the memory's intensity"
        rows.append([r["source"], ip])
    return table(["Source", "IP Awarded"], rows)


def g_bonus_magnitudes():
    rows = [[m["class"], m["f_grade"], m["e_grade"], m["d_grade"]] for m in E.load("titles")["bonus_magnitudes"]]
    return table(["Title Class", "F-Grade Bonus", "E-Grade Bonus", "D-Grade Bonus"], rows)


def _catalog(group):
    return lambda: table(["Title", "Trigger", "Bonus"], [[t["title"], t["trigger"], t["bonus"]] for t in E.load("titles")["achievement_catalog"][group]])


def g_tutorial_titles():
    rows = [[f"**{t['title']}**", t["category"], t["earned_by"], t["effect"]] for t in E.load("titles")["tutorial_titles"]]
    return table(["Title", "Category", "Earned by", "Effect"], rows)


def _stack(arch):
    return lambda: table(["Title", "Class", "Effect"], [[f"**{t['title']}**", t["class"], t["effect"]] for t in E.load("titles")["sample_stacks"][arch]])


def g_quest_ve():
    rows = [[r["difficulty"], r["routine"], r["personal_opportunity"], "none" if r["mandate"] is None else r["mandate"], r["faction"]] for r in E.load("quests")["ve_rewards"]]
    return table(["Difficulty", "Routine VE", "Personal Opportunity VE", "Mandate VE", "Faction VE"], rows)


def g_quest_items():
    return table(["Difficulty", "Typical Item Reward"], [[r["difficulty"], r["typical"]] for r in E.load("quests")["item_rewards"]])


def g_refusal():
    return table(["Quest Type", "Consequence of Refusing One"], [[r["type"], r["consequence"]] for r in E.load("quests")["refusal"]["single"]])


def g_loot():
    return table(["Enemy tier", "Default drop (F-Grade)"], [[r["tier"], r["drop"]] for r in E.load("system-ai")["loot_table"]])


def g_healing_pills():
    return table(["Pill", "Grade", "HP Restored"], [[p["name"], p["grade"], p["hp"]] for p in E.load("items")["healing_pills"]])


def g_aether_pills():
    return table(["Pill", "Grade", "Aether Restored"], [[p["name"], p["grade"], p["aether"]] for p in E.load("items")["aether_pills"]])


def g_foundation_pills():
    return table(["Pill", "Grade", "Breakthrough Bonus"], [[p["name"], p["grade"], f"+{p['breakthrough_bonus']}"] for p in E.load("items")["foundation_pills"]])


def g_treasures():
    return table(["Treasure", "Grade", "Raw Points"], [[t["name"], t["grade"], f"+{t['raw_points']}"] for t in E.load("items")["attribute_treasures"]])


def g_weapons():
    return table(["Weapon", "Governing Force", "Proficiency", "Notes"], [[w["name"], w["force"], w["proficiency"], w["notes"]] for w in E.load("items")["weapons"]])


def g_shards():
    s = E.load("items")["skill_shards"]
    lo, hi = s["backfire_natural"]
    return table(["Shard Type", "Effect", f"Backfire (on natural {lo:02d}–{hi:02d})"], [[t["name"], t["effect"], t["backfire"]] for t in s["types"]])


def g_encounter_sizing():
    return table(["Party Level", "Easy Fight", "Standard Fight", "Hard Fight"], [[r["party_level"], r["easy"], r["standard"], r["hard"]] for r in E.load("bestiary")["encounter_sizing"]], bold=False)


def g_sample_spreads():
    codes = ["STR", "DEX", "FOR", "HRT", "POW", "PER", "CHA"]
    rows = [[s["archetype"]] + [s[c] for c in codes] + [sum(s[c] for c in codes)] for s in E.load("character")["sample_spreads"]]
    return table(["Archetype"] + codes + ["Total"], rows, bold=False)


def g_stat_anchors():
    a = E.load("character")["stat_anchors"]
    header = ["Attribute"] + [f"{s} ({l})" for s, l in zip(a["scores"], a["labels"])]
    rows = [[c] + a[c] for c in ["STR", "DEX", "FOR", "HRT", "POW", "PER", "CHA"]]
    return table(header, rows)


def g_behavioral_mapping():
    return table(["Behavior Pattern", "Primary Stat", "Secondary Stat"], [[m["behavior"], m["primary"], m["secondary"]] for m in E.load("character")["behavioral_stat_mapping"]], bold=False)


def g_nine_levels():
    p = E.load("character")["leveling"]["points_by_level_9"]
    rows = [["Point buy (creation)", p["point_buy"]], ["System-assigned (3 × 8 levels)", p["system_assigned"]], ["Free allocation (2 × 8 levels)", p["free"]], ["**Total at Level 9**", f"**{p['total']}**"]]
    return table(["Source", "Points"], rows, bold=False)


def _proficiency_group(group):
    return lambda: table(["Proficiency", "Covers"], [[p["name"], p["covers"]] for p in E.load("character")["sample_proficiencies"][group]])


REGISTRY = {
    # id: (file, header line, preceding bold label or None, generator)
    "grade-table":              ("10-core-mechanics.md", "| **Grade** | **Raw Stat Range** | **Divisor** | **Force Range** | **Damage Multiplier** |", None, g_grade_table),
    "resistance-card":          ("10-core-mechanics.md", "| **Difficulty** | **Resistance** |", None, g_resistance_card),
    "proficiency-tiers":        ("10-core-mechanics.md", "| **Tier** | **Effect** |", None, g_proficiency_tiers_core),
    "volatility":               ("10-core-mechanics.md", "| **Grade** | **Explodes On (natural)** | **Probability** |", None, g_volatility),
    "modifier-budget":          ("10-core-mechanics.md", "| **Modifier** | **Size** | **Examples** |", None, g_modifier_budget),
    "damage-table":             ("10-core-mechanics.md", "| **Attacker's Grade** | **Damage** |", None, g_damage_table),
    "grade-gap":                ("10-core-mechanics.md", "| **Grade Gap** | **Higher-Grade Bonus** |", None, g_grade_gap),
    "application-costs-core":   ("10-core-mechanics.md", "| **Granted at** | **Aether Cost** |", None, g_application_costs_core),
    "sample-spreads":           ("15-character-creation.md", "| Archetype | STR | DEX | FOR | HRT | POW | PER | CHA | Total |", None, g_sample_spreads),
    "stat-anchors":             ("15-character-creation.md", "| **Attribute** | **3 (deficiency)** | **5 (average)** | **7 (gifted)** | **9 (elite)** | **10 (peak human)** |", None, g_stat_anchors),
    "proficiencies-fighting":   ("15-character-creation.md", "| **Proficiency** | **Covers** |", "**Fighting**", _proficiency_group("Fighting")),
    "proficiencies-outdoors":   ("15-character-creation.md", "| **Proficiency** | **Covers** |", "**Living Outdoors**", _proficiency_group("Living Outdoors")),
    "proficiencies-people":     ("15-character-creation.md", "| **Proficiency** | **Covers** |", "**People**", _proficiency_group("People")),
    "proficiencies-knowledge":  ("15-character-creation.md", "| **Proficiency** | **Covers** |", "**Knowledge**", _proficiency_group("Knowledge")),
    "proficiencies-making":     ("15-character-creation.md", "| **Proficiency** | **Covers** |", "**Making and Breaking**", _proficiency_group("Making and Breaking")),
    "behavioral-mapping":       ("17-progression.md", "| Behavior Pattern | Primary Stat | Secondary Stat |", None, g_behavioral_mapping),
    "nine-levels":              ("17-progression.md", "| Source | Points |", None, g_nine_levels),
    "principle-ladder":         ("20-principles.md", "| **Tier** | **Cumulative IP** | **Grants** |", None, g_principle_ladder),
    "ip-sources":               ("20-principles.md", "| **Source** | **IP Awarded** |", None, g_ip_sources),
    "application-costs":        ("20-principles.md", "| **Granted at** | **Aether Cost** |", None, g_application_costs_principles),
    "kill-tiers":               ("25-cultivation.md", "| **Difficulty** | **Award** | **F-Grade VE** |", None, g_kill_tiers),
    "overcharge":               ("30-breakthroughs.md", "| Overcharge Ratio | VE Stored | Saturation While Charging | Trial Difficulty | Quality Modifier |", None, g_overcharge),
    "overcharge-dc":            ("30-breakthroughs.md", "| Overcharge Ratio | ×1.0 | ×2.0 | ×3.0 | ×4.0 |", None, g_overcharge_dc),
    "breakthrough-modifiers":   ("30-breakthroughs.md", "| Source | Modifier |", None, g_breakthrough_modifiers),
    "quality-tiers":            ("30-breakthroughs.md", "| Margin | Base Tier | Description |", None, g_quality_tiers),
    "energy-density":           ("30-breakthroughs.md", "| Tier | Breakthrough Bonus | Phenomena Intensity | Example Locations |", None, g_energy_density),
    "bonus-magnitudes":         ("40-titles.md", "| **Title Class** | **F-Grade Bonus** | **E-Grade Bonus** | **D-Grade Bonus** |", None, g_bonus_magnitudes),
    "catalog-slaughter":        ("40-titles.md", "| **Title** | **Trigger** | **Bonus** |", "**Slaughter**", _catalog("Slaughter")),
    "catalog-survival":         ("40-titles.md", "| **Title** | **Trigger** | **Bonus** |", "**Survival**", _catalog("Survival")),
    "catalog-craft":            ("40-titles.md", "| **Title** | **Trigger** | **Bonus** |", "**Craft and Ground**", _catalog("Craft and Ground")),
    "catalog-word":             ("40-titles.md", "| **Title** | **Trigger** | **Bonus** |", "**Word and Bond**", _catalog("Word and Bond")),
    "tutorial-titles":          ("40-titles.md", "| **Title** | **Category** | **Earned by** | **Effect** |", "### The Tutorial's Titles", g_tutorial_titles),
    "stack-apex":               ("40-titles.md", "| **Title** | **Class** | **Effect** |", "### The Apex Predator (Force + Hunger + Will + Freedom)", _stack("The Apex Predator")),
    "stack-architect":          ("40-titles.md", "| **Title** | **Class** | **Effect** |", "### The System Architect (Method + Restraint + Accord + Control)", _stack("The System Architect")),
    "stack-adjudicator":        ("40-titles.md", "| **Title** | **Class** | **Effect** |", "### The Iron Adjudicator (Force + Restraint + Will + Control)", _stack("The Iron Adjudicator")),
    "stack-thief":              ("40-titles.md", "| **Title** | **Class** | **Effect** |", "### The Phantom Thief (Method + Hunger + Accord + Freedom)", _stack("The Phantom Thief")),
    "loot":                     ("45-system-ai.md", "| **Enemy tier** | **Default drop (F-Grade)** |", None, g_loot),
    "sweep-weights":            ("50-hidden-vector-engine.md", "| **Weight** | **What qualifies** | **Example** |", None, g_sweep_weights),
    "coherence":                ("50-hidden-vector-engine.md", "| **Profile** | **Deep tallies** | **Coherence Bonus** |", None, g_coherence),
    "refusal":                  ("55-quests.md", "| **Quest Type** | **Consequence of Refusing One** |", None, g_refusal),
    "quest-ve":                 ("55-quests.md", "| **Difficulty** | **Routine VE** | **Personal Opportunity VE** | **Mandate VE** | **Faction VE** |", None, g_quest_ve),
    "quest-items":              ("55-quests.md", "| **Difficulty** | **Typical Item Reward** |", None, g_quest_items),
    "encounter-sizing":         ("60-bestiary.md", "| Party Level | Easy Fight | Standard Fight | Hard Fight |", None, g_encounter_sizing),
    "healing-pills":            ("65-items.md", "| **Pill** | **Grade** | **HP Restored** |", None, g_healing_pills),
    "aether-pills":             ("65-items.md", "| **Pill** | **Grade** | **Aether Restored** |", None, g_aether_pills),
    "foundation-pills":         ("65-items.md", "| **Pill** | **Grade** | **Breakthrough Bonus** |", None, g_foundation_pills),
    "treasures":                ("65-items.md", "| **Treasure** | **Grade** | **Raw Points** |", None, g_treasures),
    "weapons":                  ("65-items.md", "| **Weapon** | **Governing Force** | **Proficiency** | **Notes** |", None, g_weapons),
    "shards":                   ("65-items.md", "| **Shard Type** | **Effect** | **Backfire (on natural 01–05)** |", None, g_shards),
    "quickref-proficiency":     ("75-quick-reference.md", "| Tier | Effect |", None, g_proficiency_tiers_quickref),
    "quickref-resistance":      ("75-quick-reference.md", "| **Difficulty** | **Resistance** |", None, g_resistance_card),
    "quickref-grades":          ("75-quick-reference.md", "| **Grade** | **Raw Stat Range** | **Force Range** | **Damage Multiplier** |", None, g_quickref_grades),
    "quickref-ve":              ("75-quick-reference.md", "| **VE at F-Grade** | **Amount** |", None, g_quickref_ve),
}


# ------------------------------------------------------------- plumbing ---

def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read().split("\n")


def write(path, lines):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def install():
    """Wrap each registered table in markers. Finds the header line (after the preceding label, if any)."""
    by_file = {}
    for tid, (f, header, label, _) in REGISTRY.items():
        by_file.setdefault(f, []).append((tid, header, label))
    for f, entries in by_file.items():
        path = os.path.join(BOOK, f)
        lines = read(path)
        for tid, header, label in entries:
            if OPEN.format(tid) in lines:
                continue
            start = 0
            if label:
                start = next(i for i, l in enumerate(lines) if l.strip() == label)
            i = next(i for i in range(start, len(lines)) if lines[i].strip() == header)
            j = i
            while j < len(lines) and lines[j].startswith("|"):
                j += 1
            lines[i:j] = [OPEN.format(tid)] + lines[i:j] + [CLOSE]
        write(path, lines)
        print(f"installed markers in {f}")


def render(check: bool = False) -> int:
    stale = []
    by_file = {}
    for tid, (f, _, _, gen) in REGISTRY.items():
        by_file.setdefault(f, {})[tid] = gen
    for f, gens in by_file.items():
        path = os.path.join(BOOK, f)
        lines = read(path)
        out, i, changed = [], 0, False
        while i < len(lines):
            m = re.match(r"^<!-- rules:table (\S+) -->$", lines[i])
            if m and m.group(1) in gens:
                tid = m.group(1)
                j = lines.index(CLOSE, i)
                current, generated = lines[i + 1:j], gens[tid]()
                if current != generated:
                    changed = True
                    stale.append(f"{f}: {tid}")
                out += [lines[i]] + generated + [CLOSE]
                i = j + 1
            else:
                out.append(lines[i])
                i += 1
        if changed and not check:
            write(path, out)
    missing = [f"{f}: {tid} (no markers; run --install)" for tid, (f, _, _, _) in REGISTRY.items()
               if OPEN.format(tid) not in read(os.path.join(BOOK, f))]
    if check:
        for s in stale + missing:
            print("stale: " + s)
        print(f"{len(REGISTRY) - len(stale) - len(missing)} of {len(REGISTRY)} tables match the rules data")
        return 1 if (stale or missing) else 0
    for s in stale:
        print("regenerated: " + s)
    print(f"{len(REGISTRY)} tables rendered, {len(stale)} changed")
    return 0


if __name__ == "__main__":
    if "--install" in sys.argv:
        install()
    sys.exit(render(check="--check" in sys.argv))
