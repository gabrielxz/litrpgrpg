/**
 * The System's notices speak in-world units only (The System AI, "The Voice of the System";
 * rules/system-ai.yaml): never the table's words for its approximation of the world.
 */
import type { Effect } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { noticeLine, tableWordsIn } from "../src/text.ts";

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
  { kind: "party-invited", characterId: "k", inviteId: "i", fromId: "j", fromName: "Joe" },
  { kind: "party-declined", characterId: "k", byId: "j", byName: "Joe" },
  { kind: "party-formed", characterId: "k", partyId: "p", withNames: ["Joe"] },
  { kind: "party-joined", characterId: "k", partyId: "p", memberId: "a", memberName: "Andre" },
  { kind: "party-joined", characterId: "k", partyId: "p", memberId: "k", memberName: "Kara" },
  { kind: "party-left", characterId: "k", memberId: "a", memberName: "Andre" },
  { kind: "party-left", characterId: "k", memberId: "k", memberName: "Kara" },
  { kind: "party-disbanded", characterId: "k", partyId: "p" },
  { kind: "message-held", messageId: "m", to: ["k"] },
  { kind: "voided", targetId: "x", reason: "undo" },
  { kind: "memory-granted", characterId: "k", memoryId: "m" },
  { kind: "resonance", characterId: "k", family: "Impact", ip: 2, of: 3 },
  { kind: "insight", characterId: "k", line: "Weight 8/10" },
  { kind: "principle-crystallized", characterId: "k", name: "Weight" },
  { kind: "distillation-offered", characterId: "k", name: "Weight" },
  { kind: "distilled", characterId: "k", name: "Weight", tier: "Seed", grantKind: "application", grant: "Falling Star" },
  { kind: "distilled", characterId: "k", name: "Weight", tier: "Mid Fragment", grantKind: "infusion", grant: "Everything I swing" },
  { kind: "principle-refined", characterId: "k", from: "Fire", name: "Consuming Flame" },
  { kind: "classification", characterId: "k", text: "Level 10. Classification available. Three offers follow. One will be accepted; the others close.", offers: [] },
  { kind: "class-accepted", characterId: "k", name: "Battle Medic", lead: "POW", bonus: 10 },
  { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 5 },
  { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 3, lost: 2 },
  { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 0, lost: 5 },
  { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 0, noEffect: "grade" },
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
    expect(noticeLine({ kind: "message-held", messageId: "m", to: ["k"] })).toBeNull();
  });

  it("carry the GM's message as written", () => {
    expect(noticeLine({ kind: "message", characterId: "k", messageId: "m", text: "Anomaly logged." })).toBe("Anomaly logged.");
  });

  it("warn the composer about the table's words and pass in-world text", () => {
    expect(tableWordsIn("Roll for it next round, then check the DC.")).toEqual(["roll", "round", "check", "dc"]);
    expect(tableWordsIn("Volatile Energy absorbed: 40. Level 3 attained.")).toEqual([]);
  });

  it("announce a treasure's gain and what the cap took, and stay silent when it did nothing", () => {
    expect(noticeLine({ kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 3, lost: 2 })).toBe(
      "Attribute Treasure absorbed. Strength +3. Excess lost: 2.",
    );
    expect(noticeLine({ kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 0, noEffect: "grade" })).toBeNull();
  });

  it("name Attributes in full", () => {
    expect(noticeLine({ kind: "points-placed", characterId: "k", placement: { STR: 2, FOR: 1 }, by: "system" })).toBe(
      "Attributes allocated: Strength +2, Fortitude +1.",
    );
  });
});
