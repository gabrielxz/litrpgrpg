#!/usr/bin/env python3
"""Monte Carlo over the F-Grade Clash engine for a classed party, Levels 10 to 25.

Builds on tools/combat_sim.py (the die, the Clash, the creature loader) and adds what a
classed party brings: the four worked characters from Classes (Kara the Breaching Vanguard,
Nia the Battle Medic, Oona the Kindler, and Wendell the Standing Surety), grown by their
profiles from Level 10 to 25 with every free point where the chapter's runs put it, the
Downed countdown and deaths, Exposed from Driven Back and Turned Aside, and the class
techniques the table would actually use.

Assumptions, stated so the numbers can be argued with:
  - No Zones. Everyone is in reach of everyone; Rush and Reach the Fallen cost nothing here.
  - Kara opens with Breach (+10, a win Drives Back whatever the Margin), then attacks.
  - Nia Triages a Downed ally first (they wake at 10 Health with their Beats), then an ally
    at half Health or less, and otherwise attacks with an untrained weapon; out of Aether she
    stabilizes bare-handed (1 Beat, Moderate 90, DEX plus Trained field medicine).
  - Oona Casts Fire on POW while Aether lasts, then swings an untrained weapon. Tinder: after
    her first hit the enemy's ground burns, −10 to every creature and to the melee characters
    standing in it (Kara and Wendell), never to Oona or to Nia, who heals from the next Zone.
  - Wendell attacks with STR, and Takes It (one next-turn Beat for −40 on an ally's incoming
    Margin, declared before the ally's own Yield) on every hit of 20 or more while he has a Beat
    to give; the "rescue" variant waits until the ally would otherwise go Downed. Hold Fast
    (once per encounter) only matters when Cornered.
  - Surge, when switched on, is used by Kara and Wendell on every attack while Aether lasts.
  - Yield as in combat_sim: the fewest Beats that avoid Downed; creatures only if they Yield.
  - No pills, no Principle Applications, no Master free actions, no executions: a Downed
    character dies at the end of their third round Downed unless stabilized or healed.
  - The Bestiary's Severe and Peak tiers are generic here (the Fragment Wraith's Health, Force,
    and Yield; the Warden's Health, Force, three Beats, and its two-of-three Yield), without the
    Wraith's incorporeal rules or the Warden's modes.

    python3 tools/class_sim.py                 # the band rows
    python3 tools/class_sim.py --day           # Nia across three fights with no refill
    python3 tools/class_sim.py --trials 20000
"""
import argparse, random, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from combat_sim import creature, d100, YIELD_CUT, YIELD_MAX, YIELD_CORNERED, TRAINED  # noqa: E402

CAP = 99
TECH = 5          # the class price at F
TRIAGE = 10       # Triage heals 10, fixed
TAKE_IT = 40      # Take It cuts the Margin by 40 (rules 0.1.11)
BREACH = 10
EXPOSED = -10
BURNING = -10
STAB_DC = 90
DEATH_ROUNDS = 3

# ----------------------------------------------------------------- party ---

def grow(stats, per_level, levels):
    out = dict(stats)
    for k, v in per_level.items():
        out[k] = min(CAP, out[k] + v * levels)
    return out

# Level 10 lines are the chapter's (after the selection bonus and Level 10's points).
# per_level = the profile's System points plus the two free points where the run puts them.
BUILDS = {
    "Kara":    {"cls": "Vanguard", "l10": dict(STR=35, DEX=5, FOR=17, HRT=10, POW=18, PER=5, CHA=5),
                "per": dict(STR=4, FOR=1), "trained": True},
    "Nia":     {"cls": "Medic",    "l10": dict(STR=4, DEX=8, FOR=15, HRT=17, POW=32, PER=8, CHA=11),
                "per": dict(POW=3, DEX=1, HRT=1), "trained": False},
    "Oona":    {"cls": "Kindler",  "l10": dict(STR=3, DEX=8, FOR=12, HRT=12, POW=38, PER=17, CHA=5),
                "per": dict(POW=4, PER=1), "trained": False},
    # Wendell: Level 1 6/4/8/7/4/5/6; eight pre-class levels read Restraint (FOR, HRT) with free
    # points to STR and FOR; +10 FOR at selection; from Level 10 his free points go 1 STR, 1 POW.
    "Wendell": {"cls": "Surety",   "l10": dict(STR=14, DEX=4, FOR=42, HRT=15, POW=4, PER=5, CHA=6),
                "per": dict(FOR=2, HRT=1, STR=1, POW=1), "trained": True},
}
# The same party with the two low-FOR characters putting their free points into FOR instead.
SAFER = {"Nia": dict(POW=1, DEX=1, HRT=1, FOR=2), "Oona": dict(POW=2, PER=1, FOR=2)}

def party(level, safer=False, wendell_pow=None):
    out = []
    for name, b in BUILDS.items():
        per = SAFER.get(name, b["per"]) if safer else b["per"]
        s = grow(b["l10"], per, level - 10)
        if name == "Wendell" and wendell_pow is not None:
            s["POW"] = wendell_pow
        off = {"Kara": s["STR"], "Wendell": s["STR"], "Nia": s["DEX"], "Oona": s["DEX"]}[name]
        out.append({"name": name, "cls": b["cls"], "stats": s, "hp": 2 * s["FOR"], "beats": 2,
                    "off": off + (TRAINED if b["trained"] else 0), "de": max(s["DEX"], s["FOR"]),
                    "yields": True, "pc": True, "mom": max(s["HRT"], s["PER"]),
                    "max_aether": s["POW"], "melee": name in ("Kara", "Wendell")})
    return out

# -------------------------------------------------------------- creatures ---

def tier(name):
    """Generic tier creatures for the sizing table, from the Bestiary's numbers."""
    if name == "Severe":
        w = creature("Fragment Wraith")
        return dict(w, name="Severe (Wraith's numbers)")
    if name == "Peak":
        w = creature("Corrupted System Warden")
        return dict(w, name="Peak (Warden's numbers)")
    return creature(name)

# ------------------------------------------------------------------ fight ---

class F:
    def __init__(self, spec, carry=None):
        self.__dict__.update(spec)
        self.cur = self.hp
        self.aether = self.__dict__.get("max_aether", 0)
        self.debt = 0
        self.downed = self.dead = self.stabilized = False
        self.downed_rounds = 0
        self.exposed = 0
        self.breach_used = False
        self.hold_fast = False
        self.hold_fast_used = False
        if carry:
            self.cur, self.aether, self.dead = carry["cur"], carry["aether"], carry["dead"]
            if self.dead:
                self.downed = True
    def up(self):
        return not self.downed and not self.dead
    def beats_now(self):
        b = max(0, self.beats - self.debt)
        self.debt = 0
        return b
    def surge_cost(self):
        return max(1, self.max_aether // 2) if self.pc else 0
    def yield_beats(self, margin, cornered):
        if not self.yields:
            return 0
        cap = min(YIELD_MAX, self.beats) if (not cornered or self.hold_fast) else YIELD_CORNERED
        cap = max(0, min(cap, self.beats - self.debt))
        for n in range(0, cap + 1):
            if margin - n * YIELD_CUT < self.cur:
                return n
        return 0

def roll(f, burning):
    r = d100() + (EXPOSED if f.exposed else 0)
    if burning and (not f.pc or f.melee):
        r += BURNING
    return r

def mark_exposed(f, own_turn):
    f.exposed = 2 if own_turn else 1

def attack(att, tgt, st, bonus=0, surge=False):
    a = roll(att, st["burning"]) + att.off + bonus
    if surge and att.aether >= att.surge_cost() and att.surge_cost() > 0:
        att.aether -= att.surge_cost(); a += 5; st["surges"] += 1
    d = roll(tgt, st["burning"]) + tgt.de
    while a == d:
        a = roll(att, st["burning"]) + att.off + bonus; d = roll(tgt, st["burning"]) + tgt.de
    m = a - d
    if m <= 0:
        if -m >= 40:
            mark_exposed(att, True)
        return False
    driven = m >= 40 or bonus == BREACH
    w = st["wendell"]
    can_take = tgt.pc and w and w is not tgt and w.up() and st["take_it"] and w.debt < w.beats and not st["took_this_round"]
    if can_take and st["take_it_policy"] == "first" and m >= 20:
        # Take It before the ally's own Yield, so the ally keeps their Beats.
        w.debt += 1; st["took_this_round"] = True; st["take_its"] += 1; m -= TAKE_IT
        can_take = False
    if m <= 0:
        return True
    n = tgt.yield_beats(m, st["cornered"])
    if n:
        tgt.debt += n; st["yield_beats"] += n; m -= n * YIELD_CUT
    # Take It (rescue policy): after the ally's Yield, only when the hit would still Down them.
    if can_take and m >= tgt.cur:
        w.debt += 1; st["took_this_round"] = True; st["take_its"] += 1; m -= TAKE_IT
    if m <= 0:
        return True
    tgt.cur -= m
    if driven:
        mark_exposed(tgt, False)
    if tgt.cur <= 0:
        tgt.cur = 0; tgt.downed = True; tgt.downed_rounds = 0; tgt.stabilized = False
    return True

def pc_turn(p, party, foes, st, opts):
    for _ in range(p.beats_now()):
        live = [c for c in foes if c.up()]
        if not live:
            return
        tgt = min(live, key=lambda c: c.cur)
        if p.cls == "Medic":
            down = [q for q in party if q.downed and not q.dead]
            hurt = [q for q in party if q.up() and q.cur * 2 <= q.hp and q is not p]
            if down and p.aether >= TECH:
                q = min(down, key=lambda q: -q.downed_rounds)
                p.aether -= TECH; q.cur = TRIAGE; q.downed = False; q.stabilized = False; st["triages"] += 1
                continue
            if down and p.aether < TECH:
                q = [q for q in down if not q.stabilized]
                if q:
                    if d100() + p.stats["DEX"] + TRAINED >= STAB_DC:
                        q[0].stabilized = True; st["stabs"] += 1
                    continue
            if hurt and p.aether >= TECH:
                q = min(hurt, key=lambda q: q.cur)
                p.aether -= TECH; q.cur = min(q.hp, q.cur + TRIAGE); st["triages"] += 1
                continue
            attack(p, tgt, st)
        elif p.cls == "Kindler":
            if p.aether >= TECH:
                p.aether -= TECH; st["casts"] += 1
                # Cast Fire rolls on POW in place of the weapon Attribute.
                save = p.off; p.off = p.stats["POW"]
                hit = attack(p, tgt, st)
                p.off = save
                if hit and opts["tinder"]:
                    st["burning"] = True
            else:
                attack(p, tgt, st)
        elif p.cls == "Vanguard":
            bonus = 0
            if not p.breach_used:
                p.breach_used = True; bonus = BREACH; st["breaches"] += 1
            attack(p, tgt, st, bonus=bonus, surge=opts["surge"])
        else:  # Surety
            if st["cornered"] and not p.hold_fast and not p.hold_fast_used:
                p.hold_fast_used = True; st["hold_fasts"] += 1
                for q in party:
                    q.hold_fast = True
                continue
            attack(p, tgt, st, surge=opts["surge"])

def fight(party_specs, foe_specs, opts, carry=None):
    party = [F(dict(p), carry[i] if carry else None) for i, p in enumerate(party_specs)]
    foes = [F(dict(c)) for c in foe_specs]
    st = {"yield_beats": 0, "triages": 0, "stabs": 0, "casts": 0, "breaches": 0, "take_its": 0,
          "hold_fasts": 0, "surges": 0, "burning": False, "cornered": opts["cornered"],
          "take_it": opts["take_it"], "take_it_policy": opts.get("take_it_policy", "rescue"), "took_this_round": False,
          "wendell": next((p for p in party if p.cls == "Surety"), None)}
    pm = d100() + max(p.mom for p in party if not p.dead); cm = d100() + max(c.mom for c in foes)
    order = [party, foes] if pm >= cm else [foes, party]
    rounds = 0
    def over():
        return all(not c.up() for c in foes) or all(not p.up() for p in party)
    while rounds < opts["max_rounds"] and not over():
        rounds += 1
        st["took_this_round"] = False
        for side in order:
            for f in side:
                if not f.up():
                    continue
                if f.pc:
                    pc_turn(f, party, foes, st, opts)
                else:
                    for _ in range(f.beats_now()):
                        live = [p for p in party if p.up()]
                        if not live: break
                        attack(f, random.choice(live), st)
                if f.exposed:
                    f.exposed -= 1
                if f.pc and f.cls == "Surety":
                    for q in party: q.hold_fast = False
            if over():
                break
        for p in party:
            if p.downed and not p.dead and not p.stabilized:
                p.downed_rounds += 1
                if p.downed_rounds >= DEATH_ROUNDS:
                    p.dead = True
    return {"tpk": all(not p.up() for p in party), "any_down": any(p.downed or p.dead for p in party),
            "deaths": sum(p.dead for p in party), "downs": sum((p.downed or p.dead) for p in party),
            "rounds": rounds, "st": st,
            "carry": [{"cur": (1 if p.downed and not p.dead else p.cur), "aether": p.aether, "dead": p.dead} for p in party]}

def run(label, party_specs, foes, trials, **kw):
    opts = {"cornered": False, "take_it": True, "take_it_policy": "first", "tinder": True, "surge": False, "max_rounds": 25}
    opts.update(kw)
    acc = {"tpk": 0, "any_down": 0, "deaths": 0, "downs": 0, "rounds": 0, "triages": 0, "take_its": 0, "casts": 0}
    for _ in range(trials):
        r = fight(party_specs, foes, opts)
        for k in ("tpk", "any_down", "deaths", "downs", "rounds"):
            acc[k] += r[k]
        for k in ("triages", "take_its", "casts"):
            acc[k] += r["st"][k]
    t = trials
    return (label, 100 * acc["tpk"] / t, 100 * acc["any_down"] / t, acc["deaths"] / t, acc["downs"] / t,
            acc["rounds"] / t, acc["triages"] / t, acc["take_its"] / t)

def header():
    print(f"{'scenario':52} {'TPK%':>5} {'down%':>6} {'deaths':>6} {'downs':>5} {'rnds':>5} {'Triage':>6} {'TakeIt':>6}")

def show(row):
    label, tpk, anyd, deaths, downs, rounds, tri, ti = row
    print(f"{label:52} {tpk:5.1f} {anyd:6.1f} {deaths:6.2f} {downs:5.2f} {rounds:5.2f} {tri:6.2f} {ti:6.2f}")

def bands(trials):
    sent, alpha, snarl, brig = creature("Husk Sentinel"), creature("Alpha Snarljaw"), creature("Snarljaw"), creature("Pre-System Brigand")
    sev, peak = tier("Severe"), tier("Peak")
    # The printed sizing rows from Level 8 up (rules/bestiary.yaml), as generic creatures.
    std = {10: 40, 15: 50, 20: 60, 25: 70}
    table = {lvl: [(f"easy: one at Force {f-10}", [generic(f - 10)]),
                   (f"standard: one at Force {f}", [generic(f)]),
                   (f"standard: two at Force {f-20}", [generic(f - 20)] * 2),
                   (f"hard: one at Force {f+10}", [generic(f + 10)]),
                   (f"hard: two at Force {f-10}", [generic(f - 10)] * 2)] for lvl, f in std.items()}
    table[10].append(("the Bestiary's Sentinel + Snarljaw", [sent, snarl]))
    table[25].append(("the Bestiary's Warden alone", [peak]))
    for lvl, rows in table.items():
        P = party(lvl)
        print(f"\n== Level {lvl} party: " + ", ".join(f"{p['name']} HP {p['hp']} Off {p['off']} Def {p['de']} Ae {p['max_aether']}" for p in P))
        header()
        for label, foes in rows:
            show(run(f"L{lvl} {label}", P, foes, trials))
        one = rows[1][1]
        show(run(f"L{lvl}   standard, Cornered", P, one, trials, cornered=True))
        show(run(f"L{lvl}   standard, Wendell never Takes It", P, one, trials, take_it=False))
        show(run(f"L{lvl}   standard, Take It only to stop a fall", P, one, trials, take_it_policy="rescue"))
        show(run(f"L{lvl}   hard, Take It only to stop a fall", P, rows[3][1], trials, take_it_policy="rescue"))
        show(run(f"L{lvl}   hard, Wendell never Takes It", P, rows[3][1], trials, take_it=False))
        show(run(f"L{lvl}   standard, no Tinder", P, one, trials, tinder=False))
        show(run(f"L{lvl}   standard, Kara and Wendell Surge", P, one, trials, surge=True))
        show(run(f"L{lvl}   standard, Nia and Oona grow FOR", party(lvl, safer=True), one, trials))

def day(trials, level, foes_list, label):
    """Fights in a row with no Consolidation: Health, Aether, and deaths carry over."""
    opts = {"cornered": False, "take_it": True, "take_it_policy": "first", "tinder": True, "surge": False, "max_rounds": 25}
    P = party(level)
    n = len(foes_list)
    acc = [{"tpk": 0, "any_down": 0, "deaths": 0, "downs": 0, "triages": 0, "nia_ae": 0, "oona_ae": 0} for _ in range(n)]
    for _ in range(trials):
        carry = None
        for i, foes in enumerate(foes_list):
            if carry and all(c["dead"] for c in carry):
                acc[i]["tpk"] += 1; continue
            r = fight(P, foes, opts, carry)
            carry = r["carry"]
            acc[i]["tpk"] += r["tpk"]; acc[i]["any_down"] += r["any_down"]; acc[i]["deaths"] += r["deaths"]
            acc[i]["downs"] += r["downs"]; acc[i]["triages"] += r["st"]["triages"]
            acc[i]["nia_ae"] += carry[1]["aether"]; acc[i]["oona_ae"] += carry[2]["aether"]
            if r["tpk"]:
                carry = [dict(c, dead=True) for c in carry]
    print(f"\n== {label}: Level {level}, {n} fights, no refill (Nia starts at {P[1]['max_aether']} Aether, Oona at {P[2]['max_aether']})")
    print(f"{'fight':8} {'TPK%':>5} {'down%':>6} {'deaths':>6} {'downs':>5} {'Triage':>6} {'Nia Ae':>7} {'Oona Ae':>8}")
    for i, a in enumerate(acc):
        t = trials
        print(f"{i+1:<8} {100*a['tpk']/t:5.1f} {100*a['any_down']/t:6.1f} {a['deaths']/t:6.2f} {a['downs']/t:5.2f} {a['triages']/t:6.2f} {a['nia_ae']/t:7.1f} {a['oona_ae']/t:8.1f}")

def generic(force, hp=None, beats=2):
    """A creature with Force `force` on both sides and Health twice it (a FOR-built body)."""
    return {"name": f"Force {force}", "hp": hp or 2 * force, "beats": beats, "off": force, "de": force,
            "yields": True, "pc": False, "mom": force}

def sweep(trials, levels, forces, safer):
    """One and two generic creatures at each Force against each level's party."""
    for lvl in levels:
        P = party(lvl, safer=safer)
        print(f"\n== Level {lvl} party{' (Nia and Oona grow FOR)' if safer else ''}: "
              + ", ".join(f"{p['name']} HP {p['hp']} Off {p['off']} Def {p['de']}" for p in P))
        print(f"{'foe Force':>10} {'1 foe TPK%':>11} {'down%':>6} {'rnds':>5} {'2 foes TPK%':>12} {'down%':>6} {'rnds':>5}")
        for x in forces:
            one = run("", P, [generic(x)], trials); two = run("", P, [generic(x)] * 2, trials)
            print(f"{x:>10} {one[1]:11.1f} {one[2]:6.1f} {one[5]:5.2f} {two[1]:12.1f} {two[2]:6.1f} {two[5]:5.2f}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--day", action="store_true")
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--safer", action="store_true")
    a = ap.parse_args()
    random.seed(a.seed)
    if a.sweep:
        sweep(a.trials, [10, 15, 20, 25], [30, 40, 50, 60, 70, 80, 90, 100], a.safer)
    elif a.day:
        sent, snarl, sev = creature("Husk Sentinel"), creature("Snarljaw"), tier("Severe")
        day(a.trials, 10, [[sent, snarl]] * 3, "three standard fights")
        day(a.trials, 10, [[snarl, snarl], [sent, snarl], [sent, snarl]], "easy then two standard")
        day(a.trials, 15, [[sev, sent]] * 3, "three standard fights")
        day(a.trials, 25, [[tier("Peak"), sent]] * 3, "three standard fights")
    else:
        bands(a.trials)

if __name__ == "__main__":
    main()
