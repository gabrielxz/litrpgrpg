#!/usr/bin/env python3
"""Monte Carlo over the F-Grade Clash engine, for the Bestiary's encounter guidance.

Reads creatures from rules/bestiary.yaml and the combat constants from rules/combat.yaml
and rules/grades.yaml. A party of four Level-1 pregens (Kara, Joe, Andre, and Dana from the
tutorial's arrival example) fights a scenario to the end: every creature dead, or every
player character Downed. Player characters attack the lowest-HP creature with every Beat
they have; creatures attack a random standing player character. Yield is used only to
avoid being Downed, with the fewest Beats that do it; a creature Yields the same way if
its stat block says so. Momentum is rolled once, on the higher of HRT and PER Force for a player
character and for a creature alike; every stat block prints both (rules 0.1.7). No stabilization, no pills,
no Surge.

    python3 tools/combat_sim.py            # the standard scenarios
    python3 tools/combat_sim.py --trials 50000
"""
import argparse, random, sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
RULES = ROOT / "rules"

def load(name):
    return yaml.safe_load(open(RULES / f"{name}.yaml", encoding="utf-8"))

COMBAT = load("combat")
GRADES = load("grades")
BESTIARY = load("bestiary")

THRESHOLD = 96  # F-Grade Volatility Threshold
for g in GRADES.get("grades", []):
    if isinstance(g, dict) and g.get("name") == "F" and "volatility_threshold" in g:
        THRESHOLD = g["volatility_threshold"]
YIELD_CUT = COMBAT["yield"]["margin_reduction_per_beat"]
YIELD_MAX = COMBAT["yield"]["max_beats"]
YIELD_CORNERED = COMBAT["yield"]["cornered_max_beats"]
BEATS = 2
TRAINED = 5

def creature(name):
    def walk(o):
        if isinstance(o, dict):
            if o.get("name") == name and "hp" in o:
                return o
            for v in o.values():
                r = walk(v)
                if r: return r
        elif isinstance(o, list):
            for v in o:
                r = walk(v)
                if r: return r
    c = walk(BESTIARY)
    if not c:
        sys.exit(f"no creature named {name} in rules/bestiary.yaml")
    return {"name": name, "hp": c["hp"], "beats": c["beats"],
            "off": max(x["force"] for x in c["offense"]),
            "de": max(x["force"] for x in c["defense"]),
            "yields": bool(c.get("yields")), "pc": False, "mom": max(c["hrt"], c["per"])}

def pregens(level=1):
    # Kara STR 8 / DEX 5 / FOR 7 / HRT 4 / PER 5; Joe 8 / 5 / 7 / 5 / 6; Andre 4 / 7 / 5 / 6 / 9 (Character Creation);
    # Dana DEX 6 / FOR 6 (the tutorial's arrival example; HRT and PER unstated, taken as 5).
    base = [("Kara", 8, 5, 7, 4, 5), ("Joe", 8, 5, 7, 5, 6), ("Andre", 4, 7, 5, 6, 9), ("Dana", 5, 6, 6, 5, 5)]
    out = []
    for name, s, d, f, h, pe in base:
        ups = level - 1
        off = max(s, d) + 2 * ups          # two points a level into the attack stat
        f2 = f + ups                       # one point a level into FOR
        out.append({"name": name, "hp": 2 * f2, "beats": BEATS, "off": off + TRAINED,
                    "de": max(d, f2), "yields": True, "pc": True, "mom": max(h, pe)})
    return out

def d100():
    total = 0
    while True:
        r = random.randint(1, 100)
        total += r
        if r < THRESHOLD:
            return total

def clash(att, de):
    while True:
        a = d100() + att; b = d100() + de
        if a != b:
            return a - b

class Fighter:
    def __init__(self, spec):
        self.__dict__.update(spec)
        self.cur = self.hp
        self.debt = 0
        self.downed = False
    def beats_now(self):
        b = max(0, self.beats - self.debt)
        self.debt = 0
        return b
    def yield_beats(self, margin, cornered):
        if not self.yields:
            return 0
        cap = YIELD_CORNERED if cornered else min(YIELD_MAX, self.beats)
        cap = max(0, min(cap, self.beats - self.debt))
        for n in range(0, cap + 1):
            if margin - n * YIELD_CUT < self.cur:
                return n
        return 0

def attack(att, tgt, cornered, stats):
    m = clash(att.off, tgt.de)
    if m <= 0:
        return
    n = tgt.yield_beats(m, cornered)
    if n:
        tgt.debt += n
        stats["yield_beats"] += n
        m -= n * YIELD_CUT
    if m <= 0:
        return
    tgt.cur -= m
    if tgt.cur <= 0:
        tgt.cur = 0
        tgt.downed = True

def fight(party_specs, creature_specs, cornered=False, max_rounds=25):
    party = [Fighter(dict(p)) for p in party_specs]
    foes = [Fighter(dict(c)) for c in creature_specs]
    stats = {"yield_beats": 0}
    pm = d100() + max(p.mom for p in party); cm = d100() + max(c.mom for c in foes)
    order = [party, foes] if pm >= cm else [foes, party]
    rounds = 0
    while rounds < max_rounds:
        rounds += 1
        for side in order:
            for f in side:
                if f.downed:
                    continue
                for _ in range(f.beats_now()):
                    if f.pc:
                        live = [c for c in foes if not c.downed]
                        if not live: break
                        attack(f, min(live, key=lambda c: c.cur), cornered, stats)
                    else:
                        live = [p for p in party if not p.downed]
                        if not live: break
                        attack(f, random.choice(live), cornered, stats)
            if all(c.downed for c in foes) or all(p.downed for p in party):
                break
        if all(c.downed for c in foes) or all(p.downed for p in party):
            break
    return {"tpk": all(p.downed for p in party), "any_down": any(p.downed for p in party),
            "rounds": rounds, "downs": sum(p.downed for p in party)}

def run(name, party, foes, trials, cornered=False):
    tpk = anyd = rounds = downs = 0
    for _ in range(trials):
        r = fight(party, foes, cornered)
        tpk += r["tpk"]; anyd += r["any_down"]; rounds += r["rounds"]; downs += r["downs"]
    return (name, 100 * tpk / trials, 100 * anyd / trials, rounds / trials, downs / trials)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=20000)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    random.seed(a.seed)
    L1, L3, L5 = pregens(1), pregens(3), pregens(5)
    brig, crawl = creature("Pre-System Brigand"), creature("Husk Crawler")
    snarl, alpha, sentinel = creature("Snarljaw"), creature("Alpha Snarljaw"), creature("Husk Sentinel")
    no_yield_sentinel = dict(sentinel, yields=False)
    rows = [
        run("L1 standard: Brigand + Crawler", L1, [brig, crawl], a.trials),
        run("  same, Cornered (Yield 1 Beat)", L1, [brig, crawl], a.trials, cornered=True),
        run("L1: 1 Brigand (a peer)", L1, [brig], a.trials),
        run("L1: 2 Brigands", L1, [brig, brig], a.trials),
        run("  2 Brigands, Cornered", L1, [brig, brig], a.trials, cornered=True),
        run("L1: 4 Brigands (four peers)", L1, [brig] * 4, a.trials),
        run("  4 Brigands, Cornered", L1, [brig] * 4, a.trials, cornered=True),
        run("L3: 2 Snarljaws (Moderate)", L3, [snarl, snarl], a.trials),
        run("L3: 4 Snarljaws", L3, [snarl] * 4, a.trials),
        run("L3: Husk Sentinel (Hard, Yields)", L3, [sentinel], a.trials),
        run("  Sentinel without Yield", L3, [no_yield_sentinel], a.trials),
        run("L5 hard: Alpha Snarljaw", L5, [alpha], a.trials),
        run("  Alpha, Cornered", L5, [alpha], a.trials, cornered=True),
        run("L5: 2 Alphas", L5, [alpha, alpha], a.trials),
    ]
    print(f"{'scenario':38} {'TPK%':>6} {'any down%':>10} {'rounds':>7} {'downs':>6}")
    for name, tpk, anyd, rounds, downs in rows:
        print(f"{name:38} {tpk:6.1f} {anyd:10.1f} {rounds:7.2f} {downs:6.2f}")

if __name__ == "__main__":
    main()
