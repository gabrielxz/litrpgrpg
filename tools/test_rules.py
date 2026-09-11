"""Run the book's worked examples (rules/fixtures/*.yaml) against the reference engine.

Each fixture case names the engine function, its arguments, and the expected
result, and says which chapter and section the example came from, so a
failure points straight at the prose that is now stale.

    python3 tools/test_rules.py            # run everything
    python3 tools/test_rules.py -v         # list every case
"""

from __future__ import annotations

import glob
import os
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rules_engine as E  # noqa: E402

FIXTURE_DIR = os.path.join(E.RULES_DIR, "fixtures")


def matches(expected, actual) -> bool:
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and matches(v, actual[k]) for k, v in expected.items())
    if isinstance(expected, float) or isinstance(actual, float):
        return abs(float(expected) - float(actual)) < 1e-9
    return expected == actual


def run(verbose: bool = False) -> int:
    failures, total = [], 0
    for path in sorted(glob.glob(os.path.join(FIXTURE_DIR, "*.yaml"))):
        with open(path, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        for case in doc["cases"]:
            total += 1
            fn = getattr(E, case["fn"])
            args = case.get("args", {})
            try:
                actual = fn(**args) if isinstance(args, dict) else fn(*args)
                ok = matches(case["expect"], actual)
            except Exception as exc:  # noqa: BLE001
                actual, ok = f"{type(exc).__name__}: {exc}", False
                if case.get("expect_error") and type(exc).__name__ == case["expect_error"]:
                    ok = True
            label = f"{os.path.basename(path)} :: {case['name']}"
            if verbose or not ok:
                print(("ok   " if ok else "FAIL ") + label)
            if not ok:
                failures.append((label, case.get("source", ""), case.get("expect"), actual))
    print(f"\n{total - len(failures)} of {total} worked examples agree with rules {E.version()}")
    for label, source, expected, actual in failures:
        print(f"\n  {label}\n    source:   {source}\n    expected: {expected}\n    actual:   {actual}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run(verbose="-v" in sys.argv))
