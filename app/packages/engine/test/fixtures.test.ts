/**
 * The book's worked examples (rules/fixtures/*.yaml) against the TypeScript engine: the same
 * cases tools/test_rules.py runs against the Python one, compared the same way.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Engine, SIGNATURES } from "../src/index.ts";
import { RULES_DIR, loadRules, readYaml } from "../src/node.ts";

type Case = {
  name: string;
  source?: string;
  fn: string;
  args?: Record<string, unknown> | unknown[];
  expect?: unknown;
  expect_error?: string;
};

const engine = new Engine(loadRules());
const camel = (snake: string) => snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** tools/test_rules.py `matches`: an expected mapping is a subset; numbers compare within 1e-9. */
function matches(expected: unknown, actual: unknown): boolean {
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const a = actual as Record<string, unknown>;
    return Object.entries(expected).every(([k, v]) => k in a && matches(v, a[k]));
  }
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => matches(v, actual[i]));
  }
  if (typeof expected === "number" && typeof actual === "number") return Math.abs(expected - actual) < 1e-9;
  return expected === actual;
}

function call(c: Case): unknown {
  const params = SIGNATURES[c.fn];
  if (!params) throw new Error(`the Python engine has no function ${c.fn}`);
  const method = (engine as unknown as Record<string, (...a: unknown[]) => unknown>)[camel(c.fn)];
  if (typeof method !== "function") throw new Error(`the TypeScript engine has no method ${camel(c.fn)}`);
  const args = c.args ?? {};
  const positional = Array.isArray(args) ? args : params.map((p) => args[p]);
  return method.apply(engine, positional);
}

it("has a method for every function in the Python engine", () => {
  const missing = Object.keys(SIGNATURES).filter(
    (fn) => typeof (engine as unknown as Record<string, unknown>)[camel(fn)] !== "function",
  );
  expect(missing).toEqual([]);
});

const fixtureDir = join(RULES_DIR, "fixtures");
for (const file of readdirSync(fixtureDir).filter((f) => f.endsWith(".yaml")).sort()) {
  const doc = readYaml(join(fixtureDir, file)) as { cases: Case[] };
  describe(file, () => {
    for (const c of doc.cases) {
      it(c.name, () => {
        const where = `${c.source ?? ""}`;
        if (c.expect_error) {
          expect(() => call(c), where).toThrowError(expect.objectContaining({ name: c.expect_error }));
          return;
        }
        const actual = call(c);
        expect(matches(c.expect, actual), `${where}\nexpected ${JSON.stringify(c.expect)}\nactual   ${JSON.stringify(actual)}`).toBe(true);
      });
    }
  });
}
