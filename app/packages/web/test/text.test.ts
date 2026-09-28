/**
 * The System's notices speak in-world units only (The System AI, "The Voice of the System";
 * rules/system-ai.yaml): never the table's words for its approximation of the world.
 */
import type { Effect } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { noticeLine, tableWordsIn } from "../src/text.ts";

// The composer's list (text.ts) and the table's other words for its bookkeeping.
const TABLE_WORDS = /\b(rounds?|beats?|turns?|rolls?|rolled|dice|die|margins?|resistance|checks?|dc|hour 1|tier|band)\b/i;

/** The effect of one kind, including a kind shared under a union (the quest notices). */
type Of<K extends Effect["kind"]> = Effect extends infer E ? (E extends { kind: infer EK } ? (K extends EK ? E & { kind: K } : never) : never) : never;
/** One sample or more of every kind of effect: a new kind fails the typecheck until it has one here. */
type Samples = { [K in Effect["kind"]]: [Of<K>, ...Of<K>[]] };

const rolls = [{ combatantId: "k", natural: [97, 40], force: 30, total: 167, label: "STR" }];

const samples: Samples = {
  prepared: [{ kind: "prepared", count: 3, pack: "tutorial" }],
  classification: [{ kind: "classification", characterId: "k", text: "Level 10. Classification available. Three offers follow. One will be accepted; the others close.", offers: [{ name: "Battle Medic", heading: "Battle Medic", notice: "Mend in motion." }] }],
  "class-accepted": [{ kind: "class-accepted", characterId: "k", name: "Battle Medic", lead: "POW", bonus: 10 }],
  "class-used": [{ kind: "class-used", characterId: "k", name: "Battle Medic" }],
  "technique-used": [{ kind: "technique-used", characterId: "k", name: "Triage" }],
  "memory-granted": [{ kind: "memory-granted", characterId: "k", memoryId: "m" }],
  vision: [{ kind: "vision", characterId: "k", text: "The slab falls slower. The mountain kneels. A door that was never there." }],
  resonance: [{ kind: "resonance", characterId: "k", family: "Impact", ip: 2, of: 3 }],
  insight: [{ kind: "insight", characterId: "k", line: "Weight 8/10" }],
  "principle-crystallized": [{ kind: "principle-crystallized", characterId: "k", name: "Weight" }],
  "distillation-offered": [{ kind: "distillation-offered", characterId: "k", name: "Weight" }],
  distilled: [
    { kind: "distilled", characterId: "k", name: "Weight", tier: "Seed", grantKind: "application", grant: "Falling Star" },
    { kind: "distilled", characterId: "k", name: "Weight", tier: "Mid Fragment", grantKind: "infusion", grant: "Everything I swing" },
    { kind: "distilled", characterId: "k", name: "Weight", tier: "Peak Fragment", grantKind: "domain", grant: "Where I stand, things fall" },
    { kind: "distilled", characterId: "k", name: "Weight", tier: "Early Fragment", grantKind: "application" },
  ],
  "principle-refined": [{ kind: "principle-refined", characterId: "k", from: "Fire", name: "Consuming Flame" }],
  clock: [{ kind: "clock", from: 0, to: 360 }],
  dawn: [{ kind: "dawn", count: 1 }],
  "quest-due": [{ kind: "quest-due", questId: "q", code: "Q-002" }],
  "session-started": [{ kind: "session-started", sessionId: "s", name: "Session 1" }],
  "session-ended": [{ kind: "session-ended", sessionId: "s", name: "Session 1" }],
  "event-logged": [{ kind: "event-logged", eventId: "e", summary: "Kara held the slab" }],
  "hve-swept": [{ kind: "hve-swept", characterId: "k", current: { Force: 2 }, added: ["Force"] }],
  "hve-copied": [{ kind: "hve-copied", characterId: "k" }],
  created: [{ kind: "created", characterId: "k" }],
  reassigned: [{ kind: "reassigned", characterId: "k", playerId: null }],
  "ve-acquired": [{ kind: "ve-acquired", characterId: "k", ve: 90 }],
  saturation: [{ kind: "saturation", characterId: "k", from: "None", to: "Mild" }],
  "aether-refilled": [{ kind: "aether-refilled", characterId: "k", hour: 1 }],
  level: [
    { kind: "level", characterId: "k", level: 2, hour: 6 },
    { kind: "level", characterId: "k", level: 3 },
  ],
  "healed-full": [{ kind: "healed-full", characterId: "k", hour: 5 }],
  collapsed: [{ kind: "collapsed", characterId: "k", attribute: "FOR", hours: 11 }],
  "temporary-returned": [{ kind: "temporary-returned", characterId: "k", attribute: "POW" }],
  "points-placed": [
    { kind: "points-placed", characterId: "k", placement: { STR: 2, FOR: 1 }, by: "system" },
    { kind: "points-placed", characterId: "k", placement: { DEX: 2 }, by: "free" },
    { kind: "points-placed", characterId: "k", placement: { STR: 0 }, by: "system", lost: { STR: 2 } },
  ],
  "party-invited": [{ kind: "party-invited", characterId: "k", inviteId: "i", fromId: "j", fromName: "Joe" }],
  "party-declined": [{ kind: "party-declined", characterId: "k", byId: "j", byName: "Joe" }],
  "party-formed": [{ kind: "party-formed", characterId: "k", partyId: "p", withNames: ["Joe"] }],
  "party-joined": [
    { kind: "party-joined", characterId: "k", partyId: "p", memberId: "a", memberName: "Andre" },
    { kind: "party-joined", characterId: "k", partyId: "p", memberId: "k", memberName: "Kara" },
  ],
  "party-left": [
    { kind: "party-left", characterId: "k", memberId: "a", memberName: "Andre" },
    { kind: "party-left", characterId: "k", memberId: "k", memberName: "Kara" },
  ],
  "party-disbanded": [{ kind: "party-disbanded", characterId: "k", partyId: "p" }],
  message: [{ kind: "message", characterId: "k", messageId: "m", text: "Anomaly logged." }],
  "message-held": [{ kind: "message-held", messageId: "m", to: ["k"] }],
  rolled: [{ kind: "rolled", characterId: "k", total: 167, diceTotal: 137, force: 30, exploded: true, extraDice: 1, battleMemory: false }],
  "combat-started": [{ kind: "combat-started", encounterId: "x" }],
  momentum: [{ kind: "momentum", encounterId: "x", holder: "a", totals: [{ sideId: "a", total: 60 }], rolls }],
  seized: [{ kind: "seized", encounterId: "x", combatantId: "k", won: true, total: 70, against: 60, rolls }],
  "momentum-shifted": [{ kind: "momentum-shifted", encounterId: "x", holder: "b", by: "seize" }],
  "combat-hp": [{ kind: "combat-hp", encounterId: "x", combatantId: "k", from: 14, to: 6 }],
  "combat-downed": [{ kind: "combat-downed", encounterId: "x", combatantId: "k", characterId: "k", coherence: 3 }],
  "vital-coherence": [{ kind: "vital-coherence", encounterId: "x", combatantId: "k", characterId: "k", coherence: 2 }],
  stabilized: [{ kind: "stabilized", encounterId: "x", combatantId: "k", characterId: "k" }],
  revived: [{ kind: "revived", encounterId: "x", combatantId: "k", characterId: "k", hp: 1 }],
  "combat-died": [{ kind: "combat-died", encounterId: "x", combatantId: "k", characterId: "k", cause: "countdown" }],
  "party-member-died": [{ kind: "party-member-died", characterId: "a", memberId: "k", memberName: "Kara" }],
  "battle-memory-due": [{ kind: "battle-memory-due", characterId: "k", reason: "survived Downed" }],
  "item-received": [
    { kind: "item-received", characterId: "k", name: "Healing Pill", count: 1 },
    { kind: "item-received", characterId: "k", name: "Healing Pill", count: 3 },
  ],
  loot: [{ kind: "loot", encounterId: "x", results: [{ combatantId: "c", row: "Moderate", die: 7, drop: "Healing Pill" }] }],
  "kill-confirmed": [{ kind: "kill-confirmed", characterId: "k", encounterId: "x", victimId: "c", victimGrade: "F", tier: "Moderate" }],
  "encounter-settled": [{ kind: "encounter-settled", encounterId: "x" }],
  "spoils-added": [{ kind: "spoils-added", encounterId: "x", items: [{ name: "Healing Pill", count: 2 }] }],
  "quest-offered": [{ kind: "quest-offered", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" }],
  "quest-issued": [{ kind: "quest-issued", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" }],
  "quest-accepted": [{ kind: "quest-accepted", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" }],
  "quest-refused": [{ kind: "quest-refused", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" }],
  "quest-shared": [
    { kind: "quest-shared", characterId: "k", questId: "q", line: "[Q-002] Sector Survey", done: 1, of: 3 },
    { kind: "quest-shared", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" },
  ],
  "quest-progress": [{ kind: "quest-progress", characterId: "k", questId: "q", line: "[Q-002] Sector Survey", done: 2, of: 3 }],
  "quest-revealed": [{ kind: "quest-revealed", characterId: "k", questId: "q", line: "Let It Finish" }],
  "quest-completed": [{ kind: "quest-completed", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" }],
  "quest-failed": [{ kind: "quest-failed", characterId: "k", questId: "q", line: "[Q-002] Sector Survey" }],
  "title-conferred": [{ kind: "title-conferred", characterId: "k", titleId: "t", name: "First Blood", negative: false }],
  "title-echoed": [{ kind: "title-echoed", characterId: "k", titleId: "t", name: "Unbroken" }],
  "title-released": [{ kind: "title-released", characterId: "k", titleId: "t", name: "Oathbreaker" }],
  mark: [
    { kind: "mark", characterId: "k", shape: "blades", marks: 1, tier: "Trained", advanced: true, nextAt: 3 },
    { kind: "mark", characterId: "k", shape: "blades", marks: 2, tier: "Trained", nextAt: 3 },
    { kind: "mark", characterId: "k", shape: "blades", marks: 3, tier: "Seasoned", advanced: true, nextAt: 10 },
    { kind: "mark", characterId: "k", shape: "blades", marks: 11, tier: "Seasoned" },
  ],
  "combat-check": [{ kind: "combat-check", encounterId: "x", combatantId: "k", label: "Will Save", total: 95, resistance: 90, success: true, aura: "steeled", rolls }],
  "treasure-absorbed": [
    { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 5 },
    { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 3, lost: 2 },
    { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 0, lost: 5 },
    { kind: "treasure-absorbed", characterId: "k", name: "Snarljaw Heart", attribute: "STR", points: 0, noEffect: "grade" },
  ],
  pill: [
    { kind: "pill", encounterId: "x", combatantId: "a", targetId: "k", characterId: "k", pill: "Healing Pill", pillKind: "healing", restored: 20 },
    { kind: "pill", combatantId: "k", targetId: "k", characterId: "k", pill: "Aether Pill", pillKind: "aether", restored: 10 },
    { kind: "pill", combatantId: "k", targetId: "k", characterId: "k", pill: "Healing Pill", pillKind: "healing", restored: 0, noEffect: "grade" },
    { kind: "pill", combatantId: "k", targetId: "k", characterId: "k", pill: "Healing Pill", pillKind: "healing", restored: 0, noEffect: "limit" },
  ],
  "combat-ended": [{ kind: "combat-ended", encounterId: "x" }],
  clash: [{ kind: "clash", encounterId: "x", attackerId: "k", defenderId: "c", margin: 20, attackTotal: 120, defenseTotal: 100, rolls, battleMemory: [] }],
  "clash-resolved": [{ kind: "clash-resolved", encounterId: "x", defenderId: "c", yielded: 0, damage: 40, drivenBack: false, turnedAside: false }],
  voided: [{ kind: "voided", targetId: "x", reason: "undo" }],
};

/** Kinds the System never announces: the table's bookkeeping, the GM's tracker, and Saturation, which the GM narrates. */
const SILENT = new Set<Effect["kind"]>([
  "prepared", "class-used", "technique-used", "clock", "dawn", "quest-due", "session-started", "session-ended",
  "event-logged", "hve-swept", "hve-copied", "created", "reassigned", "saturation", "message-held", "rolled",
  "combat-started", "momentum", "seized", "momentum-shifted", "combat-hp", "combat-died", "battle-memory-due",
  "loot", "encounter-settled", "spoils-added", "combat-check", "combat-ended", "clash", "clash-resolved", "voided",
]);

const every: Effect[] = Object.values(samples).flat();

describe("the System's notices", () => {
  it("use in-world words only, for every kind of effect", () => {
    for (const e of every) {
      const line = noticeLine(e);
      if (line) expect(line, e.kind).not.toMatch(TABLE_WORDS);
    }
  });

  it("announce every kind but the silent ones, and those never", () => {
    for (const [kind, list] of Object.entries(samples) as [Effect["kind"], Effect[]][]) {
      const lines = list.map(noticeLine);
      if (SILENT.has(kind)) expect(lines.every((l) => l === null), kind).toBe(true);
      else expect(lines.some((l) => l !== null), kind).toBe(true);
    }
  });

  it("stay silent when a pill or a treasure does nothing", () => {
    for (const e of [...samples.pill, ...samples["treasure-absorbed"]].filter((x) => x.noEffect)) expect(noticeLine(e)).toBeNull();
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
