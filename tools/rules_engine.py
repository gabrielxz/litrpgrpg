"""Reference calculator over the rules data in rules/.

A calculator, never a second expression of the rules: every function here
reads its constants from the YAML files and implements a procedure the book
states. Where the book is silent the function raises RulesGap, which is the
signal to write the answer into the book first.

Language-neutral by intent: the app's engine reimplements these signatures
against the same files, and the fixtures under rules/fixtures/ are the
contract both must satisfy.
"""

from __future__ import annotations

import math
import os
from functools import lru_cache

import yaml

RULES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "rules")


class RulesGap(Exception):
    """The book does not answer this; write it there before implementing."""


@lru_cache(maxsize=None)
def load(name: str) -> dict:
    with open(os.path.join(RULES_DIR, f"{name}.yaml"), encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def version() -> str:
    return load("version")["version"]


# ---------------------------------------------------------------- grades ---

def grade(code: str) -> dict:
    for g in load("grades")["grades"]:
        if g["code"] == code.upper():
            return g
    raise KeyError(f"no Grade {code}")


def grade_order(code: str) -> int:
    return grade(code)["order"]


def scale(code: str) -> int:
    """×10 per Grade above F."""
    return load("grades")["scale_per_grade"] ** grade_order(code)


def force(raw: int, code: str) -> int:
    """Raw divided by the Grade's divisor, fractions dropped. Lagging stats read the same way."""
    return raw // grade(code)["divisor"]


def damage_multiplier(code: str) -> int:
    return grade(code)["damage_multiplier"]


def stat_cap(code: str) -> int:
    return grade(code)["raw_max"]


def cross_grade_adjustment(higher: str, lower: str) -> int:
    gap = grade_order(higher) - grade_order(lower)
    if gap < 0:
        raise ValueError("higher must be the higher Grade")
    return gap * load("grades")["cross_grade_adjustment_per_grade"]


def volatility_threshold(code: str) -> int:
    return grade(code)["volatility_threshold"]


def volatility_probability_percent(code: str) -> int:
    return 101 - volatility_threshold(code)


def explode(natural_dice: list[int], code: str) -> dict:
    """Total a cascade of natural results. Every die but the last must have met the threshold."""
    t = volatility_threshold(code)
    for d in natural_dice[:-1]:
        if d < t:
            raise ValueError(f"die {d} did not meet the {code} threshold {t}, so it cannot have cascaded")
    extra = len(natural_dice) - 1
    return {
        "total": sum(natural_dice),
        "extra_dice": extra,
        "battle_memory": extra >= load("grades")["volatility"]["battle_memory_cascade_dice"],
    }


# ------------------------------------------------------------- character ---

def max_hp(raw_for: int) -> int:
    return raw_for * 2


def max_aether(raw_pow: int) -> int:
    return raw_pow


def surge_cost(max_aether_value: int) -> int:
    return math.ceil(max_aether_value / 2)


def points_by_level(level: int) -> int:
    """Total stat points from creation plus per-level budget at F-Grade (no class bonus, no titles or treasures)."""
    c = load("character")
    return c["point_buy"]["points"] + (level - 1) * c["leveling"]["points_per_level"]


def proficiency_bonus(tier: str) -> int:
    for t in load("character")["proficiencies"]["tiers"]:
        if t["name"] == tier:
            return t["bonus"]
    if tier.lower() == "untrained":
        return load("character")["proficiencies"]["untrained_bonus"]
    raise KeyError(tier)


def tier_for_marks(marks: int, body_grade: str = "F") -> str:
    """The tier a Proficiency has reached; Master needs an E-Grade body."""
    tiers = load("character")["proficiencies"]["tiers"]
    reached = tiers[0]["name"]
    for t in tiers[1:]:
        if marks >= t["marks_required"]:
            req = t.get("requires_grade")
            if req and grade_order(body_grade) < grade_order(req):
                break
            reached = t["name"]
    return reached


def pregen(name: str) -> dict:
    for p in load("character")["pregens"]:
        if p["name"].lower() == name.lower():
            return p
    raise KeyError(name)


def pregen_derived(name: str) -> dict:
    p = pregen(name)
    s = p["stats"]
    tol = tolerance(p["grade"])
    return {
        "points": sum(s.values()),
        "max_hp": max_hp(s["FOR"]),
        "max_aether": max_aether(s["POW"]),
        "tolerance": tol,
        "bands": saturation_thresholds(p["grade"]),
        "surge_cost": surge_cost(max_aether(s["POW"])),
    }


def momentum_value(dex_force: int, per_force: int) -> int:
    return max(dex_force, per_force)


# ------------------------------------------------------------ resolution ---

def resistance(difficulty: str) -> int:
    for row in load("resolution")["resistance_card"]:
        if row["difficulty"].lower() == difficulty.lower():
            return row["resistance"]
    raise KeyError(difficulty)


def effective_resistance(difficulty: str, obstacle_grade: str = "F", challenger_grade: str = "F") -> int:
    """The number the challenger's d100 + Force must meet. The Cross-Grade Adjustment lands on whichever side is higher."""
    base = resistance(difficulty)
    gap = grade_order(obstacle_grade) - grade_order(challenger_grade)
    return base + gap * load("grades")["cross_grade_adjustment_per_grade"]


def auto_success(force_value: int, difficulty: str, obstacle_grade: str = "F", challenger_grade: str = "F") -> bool:
    """Force alone (with the Adjustment) meets the Resistance: no roll. Two or more Grades above never rolls."""
    gap = grade_order(challenger_grade) - grade_order(obstacle_grade)
    if gap >= load("resolution")["auto_success"]["never_rolls_at_grade_gap"]:
        return True
    return force_value >= effective_resistance(difficulty, obstacle_grade, challenger_grade)


def skill_check_outcome(total: int, target: int, natural: int, code: str = "F") -> str:
    """success / exceptional / soft / hard / catastrophic, for skill checks."""
    r = load("resolution")
    cat = r["failure_tiers"]["catastrophic_natural"]
    if cat[0] <= natural <= cat[1]:
        return "catastrophic"
    exceptional = natural >= volatility_threshold(code)
    if total >= target:
        return "exceptional" if exceptional else "success"
    if exceptional:
        return "soft"                      # Exceptional on a failed total: Soft whatever the margin
    short = target - total
    return "hard" if short >= r["failure_tiers"]["hard"]["fail_by_min"] else "soft"


# ---------------------------------------------------------------- combat ---

def clash(att_die: int, att_force: int, def_die: int, def_force: int,
          att_grade: str = "F", def_grade: str = "F", att_mods: int = 0, def_mods: int = 0) -> dict:
    """One Clash. Dice are the totals after any explosion. The higher Grade adds the Adjustment; damage uses the attacker's multiplier."""
    gap = grade_order(att_grade) - grade_order(def_grade)
    adj = abs(gap) * load("grades")["cross_grade_adjustment_per_grade"]
    att_total = att_die + att_force + att_mods + (adj if gap > 0 else 0)
    def_total = def_die + def_force + def_mods + (adj if gap < 0 else 0)
    margin = att_total - def_total
    r40 = load("resolution")["rule_of_40"]
    attacker_wins = margin >= 0                      # a tie goes to the attacker
    damage = margin * damage_multiplier(att_grade) if attacker_wins and margin > 0 else 0
    return {
        "attacker_total": att_total,
        "defender_total": def_total,
        "margin": margin,
        "attacker_wins": attacker_wins,
        "damage": damage,
        "driven_back": attacker_wins and margin >= r40["driven_back_margin"],
        "turned_aside": (not attacker_wins) and (-margin) >= r40["turned_aside_margin"],
    }


def yield_margin(margin: int, beats: int, cornered: bool = False) -> int:
    y = load("combat")["yield"]
    cap = y["cornered_max_beats"] if cornered else y["max_beats"]
    if beats > cap:
        raise ValueError(f"only {cap} Beat(s) can be given up here")
    return max(0, margin - beats * y["margin_reduction_per_beat"])


def damage_after_yield(margin: int, beats: int, att_grade: str = "F", cornered: bool = False) -> int:
    return yield_margin(margin, beats, cornered) * damage_multiplier(att_grade)


def annihilated(damage: int, max_hp_value: int) -> bool:
    return damage >= load("combat")["downed"]["annihilation_multiple_of_max_hp"] * max_hp_value


def aura_save_total(die: int, hrt_force: int, for_force: int) -> int:
    return die + hrt_force + for_force // 2


def aura_resistance(flaring: bool = False) -> int:
    a = load("combat")["aura_pressure"]
    return a["resistance_flaring"] if flaring else a["resistance_calm"]


# ----------------------------------------------------------- cultivation ---

def tolerance(code: str = "F") -> int:
    return load("cultivation")["tolerance"]["base"] * scale(code)


def saturation_thresholds(code: str = "F") -> list[int]:
    t = tolerance(code)
    return [t * b["past_multiple"] for b in load("cultivation")["saturation"]["bands"]]


def saturation(stored_ve: int, code: str = "F") -> dict:
    """The band a stored total sits in. 'past' is strictly greater than."""
    t = tolerance(code)
    band_name, penalty, clock = "None", 0, False
    for b in load("cultivation")["saturation"]["bands"]:
        if stored_ve > t * b["past_multiple"]:
            band_name, penalty, clock = b["name"], b["penalty"], bool(b.get("collapse_clock"))
    return {"band": band_name, "penalty": penalty, "collapse_clock": clock}


def refine_rate(code: str = "F", high_density: bool = False) -> int:
    c = load("cultivation")["consolidation"]
    base = c["refine_per_hour_high_density"] if high_density else c["refine_per_hour"]
    return base * scale(code)


def refine_hours(stored_ve: int, code: str = "F", high_density: bool = False) -> int:
    """Full hours to refine a stored total. Minimum one hour."""
    if stored_ve <= 0:
        return load("cultivation")["consolidation"]["minimum_hours"]
    return max(load("cultivation")["consolidation"]["minimum_hours"], math.ceil(stored_ve / refine_rate(code, high_density)))


def level_cost(code: str = "F") -> int:
    return load("cultivation")["level_cost"]["base"] * scale(code)


def cumulative_ve_to_level(level: int) -> int:
    """VE refined from Level 1 to reach the given F-Grade level (the first level is free)."""
    if not 1 <= level <= load("grades")["levels_per_grade"]:
        raise RulesGap("cumulative cost past the F-Grade cap runs through a Breakthrough")
    return (level - 1) * level_cost("F")


def levels_from_ve(unrefined_ve: int, code: str = "F") -> int:
    return unrefined_ve // level_cost(code)


def kill_tier_multiple(tier: str) -> float:
    for row in load("cultivation")["awards"]["kill_tiers"]:
        if row["difficulty"].lower() == tier.lower():
            return row["multiple"]
    raise KeyError(tier)


def kill_ve(tier: str, killer_grade: str = "F", victim_grade: str = "F") -> int:
    """The victim's tier within its own Grade, as a multiple of the killer's Peer Kill, ×10 per Grade the victim sits above."""
    gap = grade_order(victim_grade) - grade_order(killer_grade)
    if gap < 0:
        raise RulesGap('sub-Grade kills "pay next to nothing" (Cultivation); the book gives no number')
    peer = load("cultivation")["awards"]["peer_kill"] * scale(killer_grade)
    return int(peer * kill_tier_multiple(tier) * load("grades")["scale_per_grade"] ** gap)


def quest_ve(category: str, difficulty: str) -> int | None:
    key = {"routine": "routine", "personal opportunity": "personal_opportunity", "hidden": "personal_opportunity",
           "mandate": "mandate", "faction": "faction"}[category.lower()]
    for row in load("quests")["ve_rewards"]:
        if row["difficulty"].lower() == difficulty.lower():
            return row[key]
    raise KeyError(difficulty)


# ---------------------------------------------------------- breakthrough ---

def overcharge_row(ratio: int) -> dict:
    for row in load("breakthrough")["overcharge"]:
        if row["ratio"] == ratio:
            return row
    raise KeyError(ratio)


def breakthrough_dc(overcharge_ratio: int = 1) -> int:
    return load("breakthrough")["check"]["dc"] + overcharge_row(overcharge_ratio)["dc_modifier"]


def overcharge_ve(overcharge_ratio: int, code: str = "F") -> int:
    return tolerance(code) * overcharge_ratio


def quality_tier(total: int, overcharge_ratio: int = 1, quality_enhancer: bool = False) -> dict:
    b = load("breakthrough")
    dc = breakthrough_dc(overcharge_ratio)
    margin = total - dc
    tiers = b["quality_tiers"]
    names = [t["tier"] for t in tiers]
    idx = 0
    for i, t in enumerate(tiers):
        lo = t["margin_min"] if t["margin_min"] is not None else -10**9
        hi = t["margin_max"] if t["margin_max"] is not None else 10**9
        if lo <= margin <= hi:
            idx = i
    if margin < 0:
        return {"dc": dc, "margin": margin, "tier": names[0], "success": False}
    idx += b["tier_adjustment"]["overcharge_steps"][overcharge_ratio - 1]
    if quality_enhancer:
        idx += b["tier_adjustment"]["quality_enhancer_steps"]
    idx = min(idx, len(names) - 1)
    return {"dc": dc, "margin": margin, "tier": names[idx], "success": True}


def anchor_bonus(margin: int) -> int:
    a = load("breakthrough")["anchor"]
    if margin < 0:
        return 0
    if margin >= 40:
        return a["bonus_at_margin_40"]
    if margin >= 20:
        return a["bonus_at_margin_20"]
    return a["bonus_on_success"]


def coherence(deep_leads: list[int]) -> dict:
    """deep_leads: for each axis, how far the leading side of Deep is ahead of the other."""
    th = load("hve")["coherence_thresholds"]
    leads = sorted((abs(x) for x in deep_leads), reverse=True)
    if leads and leads[0] >= th["singular"]:
        profile = "Singular"
    elif leads and (leads[0] >= th["defined"] or sum(1 for x in leads if x >= th["defined_two_sides"]) >= 2):
        profile = "Defined"
    elif leads and leads[0] >= th["leaning"]:
        profile = "Leaning"
    else:
        profile = "Scattered"
    return {"profile": profile, "bonus": load("breakthrough")["coherence_bonus"][profile]}


# ------------------------------------------------------------------- hve ---

def sweep_update(current: dict[str, int], deep: dict[str, int]) -> dict:
    """One axis. current and deep map the two pole names to tallies. Returns the new Deep and a wiped Current."""
    s = load("hve")["sweep"]["deep_update"]
    (a, ca), (b, cb) = list(current.items())
    new_deep = dict(deep)
    if ca - cb >= s["current_lead_required"]:
        new_deep[a] = new_deep.get(a, 0) + s["deep_tally_added"]
    elif cb - ca >= s["current_lead_required"]:
        new_deep[b] = new_deep.get(b, 0) + s["deep_tally_added"]
    return {"deep": new_deep, "current": {a: 0, b: 0}}


def structured_add(current: float, deep: float, intensity: float) -> dict:
    s = load("hve")["structured_logging"]
    return {"current": current + intensity * s["current_adds"], "deep": deep + intensity * s["deep_adds"]}


def structured_decay(current: float, deep: float) -> dict:
    s = load("hve")["structured_logging"]
    return {"current": current * (1 - s["current_decay_per_session"]), "deep": deep * (1 - s["deep_decay_per_session"])}


# ------------------------------------------------------------ principles ---

def principle_tier(ip: int) -> str | None:
    reached = None
    for row in load("principles")["ladder"]:
        if ip >= row["cumulative_ip"]:
            reached = row["tier"]
    return reached


def application_cost(granted_at: str) -> int:
    for row in load("principles")["application_costs"]:
        if row["granted_at"].lower().startswith(granted_at.lower()):
            return row["aether"]
    raise KeyError(granted_at)


def application_uses(max_aether_value: int, granted_at: str) -> int:
    cost = application_cost(granted_at)
    if cost == 0:
        raise RulesGap("Infusion costs nothing; uses are not a number")
    return max_aether_value // cost


def skill_cost_at_grade(cost_at_f: int, acquired_grade: str) -> int:
    return cost_at_f * scale(acquired_grade)


# ----------------------------------------------------------------- items ---

def pill_effect(listed_amount: int, pill_grade: str, body_grade: str) -> int:
    """A pill above the body's Grade does nothing; at the body's Grade it heals the listed amount ×10 per Grade."""
    if grade_order(pill_grade) > grade_order(body_grade):
        return 0
    if grade_order(pill_grade) < grade_order(body_grade):
        raise RulesGap("a lower-Grade pill in a higher-Grade body is not priced in the book")
    return listed_amount * scale(pill_grade)


def weapon_bonus(tier: str) -> int:
    return proficiency_bonus(tier)
