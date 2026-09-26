/**
 * Node-side loading of the rules data. The browser never reads files: the server sends the
 * snapshot for a campaign's pinned rules version, and `new Engine(snapshot)` takes it from there.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { RulesSnapshot } from "./index.ts";

/** The repository's `rules/` directory. */
export const RULES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../rules");

/** Parse one YAML file the way PyYAML's safe_load does (YAML 1.1), so both engines read the same values. */
export function readYaml(path: string): unknown {
  return parse(readFileSync(path, "utf8"), { version: "1.1" });
}

/** Every top-level `rules/*.yaml` file, keyed by its name without the extension. */
export function loadRules(dir: string = RULES_DIR): RulesSnapshot {
  const snapshot: RulesSnapshot = {};
  for (const file of readdirSync(dir).sort()) {
    if (file.endsWith(".yaml")) snapshot[basename(file, ".yaml")] = readYaml(join(dir, file));
  }
  return snapshot;
}
