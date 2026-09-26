/**
 * The System's notices speak in-world units only (The System AI, "The Voice of the System";
 * rules/system-ai.yaml): never the table's words for its approximation of the world.
 */
import type { Effect } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { noticeLine } from "../src/text.ts";

const TABLE_WORDS = /\b(round|beat|turn|roll|die|dice|margin|dc|check|hour 1|tier|band)\b/i;

const every: Effect[] = [
  { kind: "created", characterId: "k" },
  { kind: "ve-acquired", characterId: "k", ve: 90 },
  { kind: "saturation", characterId: "k", from: "None", to: "Mild" },
  { kind: "aether-refilled", characterId: "k", hour: 1 },
  { kind: "level", characterId: "k", level: 2, hour: 6 },
  { kind: "healed-full", characterId: "k", hour: 5 },
  { kind: "collapsed", characterId: "k", attribute: "FOR", hours: 11 },
  { kind: "temporary-returned", characterId: "k", attribute: "POW" },
  { kind: "points-placed", characterId: "k", placement: { STR: 2, FOR: 1 }, by: "system" },
  { kind: "points-placed", characterId: "k", placement: { DEX: 2 }, by: "free" },
  { kind: "voided", targetId: "x", reason: "undo" },
];

describe("the System's notices", () => {
  it("use in-world words only", () => {
    for (const e of every) {
      const line = noticeLine(e);
      if (line) expect(line, e.kind).not.toMatch(TABLE_WORDS);
    }
  });

  it("stay silent on Saturation, which the GM narrates, and on the record's own bookkeeping", () => {
    expect(noticeLine({ kind: "saturation", characterId: "k", from: "None", to: "Mild" })).toBeNull();
    expect(noticeLine({ kind: "voided", targetId: "x", reason: "undo" })).toBeNull();
    expect(noticeLine({ kind: "created", characterId: "k" })).toBeNull();
  });

  it("name Attributes in full", () => {
    expect(noticeLine({ kind: "points-placed", characterId: "k", placement: { STR: 2, FOR: 1 }, by: "system" })).toBe(
      "Attributes allocated: Strength +2, Fortitude +1.",
    );
  });
});
