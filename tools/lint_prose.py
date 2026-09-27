"""Prose lint: the automated form of "sweep by noun."

Two checks over the chapter sources, the kit, and the pipeline, and two warning passes:

1. Retired values and names (rules/retired.yaml) must not appear anywhere.
2. Cross-references of the form  Chapter Name, "Section Title"  must point
   at a heading that exists in that chapter. The book's rule: never cite a
   section that has not been written.
3. Voice warnings: literal phrases from CLAUDE.md's "Say it literally" list.
   They print but never fail the build; fiction can use them on purpose.
4. Negation stacks: a sentence with three or more negations (no, not, never,
   nothing, none, nobody, without, cannot, neither, nor, -n't) prints a warning.
   Negation is allowed; stacking it is the tic. A sentence that needs its
   negations goes in tools/negation_ok.txt (one opening fragment per line), so
   the warning stays a signal. Never fails the build.
5. Class notices: each class's `notice` in rules/classes.yaml, and the Level 10
   opening line, must match the systemvoice box in Classes word for word. The
   app shows the data's copy, so the two cannot drift.
6. Encounter sizing: each row's `mix` and `force` in rules/bestiary.yaml must say
   what its rendered text cells say.

    python3 tools/lint_prose.py
"""

from __future__ import annotations

import glob
import os
import re
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = os.path.join(ROOT, "book")
CHAPTERS = sorted(glob.glob(os.path.join(BOOK, "[0-8][0-9]-*.md")))

# CLAUDE.md, "Say it literally" (2026-09-24 Core Mechanics read-through).
VOICE_WARNINGS = [
    (r"\bfloors at\b", "code register: say the value does not go below"),
    (r"\breads? off (the |a |their )?(character|body|Grade)", "code register: name the rule"),
    (r"\b(die|dice) (runs?|ran) hot\b", "living dice: name the Volatility Threshold"),
    (r"\bdie could swing\b", "living dice: say what the roll can reach"),
    (r"\bknows the clock\b", "cut the closer"),
    (r"\bbuys the retry\b", "maxim: state the rule"),
    (r"\bacts? not at all\b", "coy: say the turn is lost"),
    (r"\bleaves? (a )?marks?\b", "collides with the game term Mark"),
    (r"\bthe System marks\b", "the table acts in procedure: the player adds a Mark"),
]
EXTRA = [os.path.join(BOOK, "kit", "table-kit.html"), os.path.join(BOOK, "pipeline", "metadata.yaml")]
NEGATION = re.compile(r"\b(no|not|never|nothing|none|nobody|without|cannot|neither|nor)\b|n't\b", re.I)
NEGATION_OK = os.path.join(ROOT, "tools", "negation_ok.txt")


def negation_stacks() -> list[str]:
    """Sentences with three or more negations, minus the ones kept on purpose."""
    keep = []
    if os.path.exists(NEGATION_OK):
        with open(NEGATION_OK, encoding="utf-8") as fh:
            keep = [l.strip() for l in fh if l.strip() and not l.startswith("#")]
    out = []
    for path in CHAPTERS:
        with open(path, encoding="utf-8") as fh:
            for n, line in enumerate(fh, 1):
                if line.startswith(("|", "#", "!", ":::", "<!--", "    ")):
                    continue
                for sent in re.split(r"(?<=[.!?])\s+", line.strip()):
                    if len(NEGATION.findall(sent)) >= 3 and not any(k in sent for k in keep):
                        out.append(f"{os.path.relpath(path, ROOT)}:{n}: {sent[:150]}")
    return out


def headings(path: str) -> set[str]:
    """Section headings plus bold run-in labels (**The Domain gate.**), which the book also cites."""
    out = set()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"^#{1,4}\s+(.*?)\s*$", line)
            if m:
                title = re.sub(r"\s*\{.*\}\s*$", "", m.group(1))
                out.add(title.strip())
            for lab in re.findall(r"^\*\*([^*]+?)[.:]?\*\*", line):
                out.add(lab.strip())
    return out


def cited(section: str, heads: set[str]) -> bool:
    section = section.strip().rstrip(",.;:")
    if section in heads:
        return True
    return any(h.startswith(section + " (") for h in heads)


def sizing_drift() -> list[str]:
    with open(os.path.join(ROOT, "rules", "bestiary.yaml"), encoding="utf-8") as fh:
        rows = yaml.safe_load(fh)["encounter_sizing"]
    out = []
    for r in rows:
        for col in ("easy", "standard", "hard"):
            text = r[col]
            if "mix" in r:
                alts = []
                for alt in text.split(" or "):
                    tiers = []
                    for part in alt.split(" + "):
                        n, tier = part.split(" ", 1)
                        tiers += [tier] * int(n)
                    alts.append(sorted(tiers))
                if sorted(alts) != sorted(sorted(a) for a in r["mix"][col]):
                    out.append(f"rules/bestiary.yaml: {r['party_level']} {col}: mix differs from \"{text}\"")
            elif f"Force {r['force'][col]}" not in text:
                out.append(f"rules/bestiary.yaml: {r['party_level']} {col}: force {r['force'][col]} differs from \"{text}\"")
    return out


def class_notice_drift() -> list[str]:
    path = os.path.join(BOOK, "18-classes.md")
    with open(path, encoding="utf-8") as fh:
        book = fh.read()
    with open(os.path.join(ROOT, "rules", "classes.yaml"), encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    sel = data["selection"]
    boxes = []
    for section in re.split(r"^### ", book, flags=re.M):
        heading = section.split("\n", 1)[0].strip()
        for m in re.finditer(r"::: systemvoice\n(.*?)\n:::", section, re.S):
            boxes.append((heading, [p.strip().strip("*") for p in m.group(1).strip().split("\n\n")]))
    out = []
    if not any(paras == [sel["opening_notice"]] for _, paras in boxes):
        out.append("rules/classes.yaml: selection.opening_notice matches no systemvoice box in Classes")
    by_heading = {h: paras for h, paras in boxes}
    for c in data["classes"]:
        want = [sel["offer_notice"].format(name=c["name"]), c.get("notice", "")]
        got = by_heading.get(c["name"])
        if got is None or [got[0], " ".join(got[1:])] != want:
            out.append(f"rules/classes.yaml: {c['name']}'s notice differs from its box in Classes; the book's box wins, copy it into the data")
    return out


def main() -> int:
    with open(os.path.join(ROOT, "rules", "retired.yaml"), encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)
    problems = []

    # 1. retired values
    compiled = [(re.compile(p["pattern"]), p) for p in cfg["patterns"]]
    for path in CHAPTERS + EXTRA:
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as fh:
            for n, line in enumerate(fh, 1):
                for rx, p in compiled:
                    if rx.search(line):
                        problems.append(f"{os.path.relpath(path, ROOT)}:{n}: retired `{p['pattern']}` (now: {p['replaced_by']}, since {p['since']})\n    {line.strip()[:140]}")

    # 2. cross-references
    chapter_files = {name: os.path.join(BOOK, f) for name, f in cfg["chapters"].items()}
    heads = {name: headings(f) for name, f in chapter_files.items() if os.path.exists(f)}
    names = "|".join(re.escape(n) for n in sorted(chapter_files, key=len, reverse=True))
    ref = re.compile(rf'(?<![\w-])({names})(?: chapter)?, ["“]([^"”]+)["”]')
    for path in CHAPTERS:
        with open(path, encoding="utf-8") as fh:
            for n, line in enumerate(fh, 1):
                for m in ref.finditer(line):
                    chapter, section = m.group(1), m.group(2).strip()
                    if chapter in heads and not cited(section, heads[chapter]):
                        problems.append(f"{os.path.relpath(path, ROOT)}:{n}: cites {chapter}, \"{section}\" but that heading does not exist")

    # 5. class notices match the book's boxes
    problems.extend(class_notice_drift())
    problems.extend(sizing_drift())

    # 3. voice warnings (never fail)
    warnings = []
    voice = [(re.compile(rx, re.I), why) for rx, why in VOICE_WARNINGS]
    for path in CHAPTERS:
        with open(path, encoding="utf-8") as fh:
            for n, line in enumerate(fh, 1):
                for rx, why in voice:
                    m = rx.search(line)
                    if m:
                        warnings.append(f"{os.path.relpath(path, ROOT)}:{n}: \"{m.group(0)}\" ({why})")
    if warnings:
        print("\n".join(warnings))
        print(f"{len(warnings)} voice warning(s); not failures\n")

    # 4. negation stacks (never fail)
    stacks = negation_stacks()
    if stacks:
        print("\n".join(stacks))
        print(f"{len(stacks)} negation stack(s); rewrite, or keep in tools/negation_ok.txt; not failures\n")

    if problems:
        print("\n".join(problems))
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("prose lint clean: no retired values, every cited section exists")
    return 0


if __name__ == "__main__":
    sys.exit(main())
