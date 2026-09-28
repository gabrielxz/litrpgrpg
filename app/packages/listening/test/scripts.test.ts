/**
 * Every script replays through the campaign record, and the scorer reads a perfect draft as
 * perfect and each kind of mistake as that mistake.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import type { Action } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { type Drafted, type Script, loadScript, replay, score, scriptProblems } from "../src/index.ts";

const engine = new Engine(loadRules());
const dir = join(dirname(fileURLToPath(import.meta.url)), "../scripts");
const scripts = readdirSync(dir)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => loadScript(join(dir, f)));

/** The expected record, drafted back exactly. */
const perfect = (s: Script): Drafted[] => [
  ...s.expected.actions.map((x) => ({ id: x.id, lines: x.lines, action: x.action as Action })),
  ...s.expected.suggestions.map((x) => ({ lines: x.lines, suggestion: { kind: x.kind, key: x.key, characterId: x.characterId } })),
];

describe.each(scripts.map((s) => [s.id, s] as const))("script %s", (_, script) => {
  it("names only speakers, lines, and ids it has", () => {
    expect(scriptProblems(script)).toEqual([]);
  });

  it("replays its expected record under the current rules", () => {
    expect(() => replay(engine, script)).not.toThrow();
  });

  it("scores its own expected record as perfect", () => {
    const r = score(script, perfect(script));
    expect(r.overall).toMatchObject({ precision: 1, recall: 1 });
    expect(r.entries).toMatchObject({ precision: 1, recall: 1, off: [] });
    expect(r.entries.exact).toBe(r.entries.tp);
  });
});

describe("the Martial Remnant", () => {
  const script = scripts.find((s) => s.id === "tutorial-martial-remnant")!;

  it("replays the fight the GM reads out: Joe's Mark, the drive, Andre's bare-handed kill", () => {
    const rec = replay(engine, script);
    const clashes = rec.log.filter((e) => e.action.type === "combat.defend").map((e) => rec.state.effects.get(e.id)!.find((x) => x.kind === "clash") as { margin: number });
    expect(clashes.map((c) => c.margin)).toEqual([8, 41, -27, 44]);
    expect(rec.sheet("joe")!.proficiencies).toEqual([expect.objectContaining({ shape: "spears and staves", tier: "Trained", marks: 1 })]);
    expect(rec.character("kara")!.counters).toEqual({ "first-into-a-hostile-site": 1 });
    expect(rec.character("andre")!.counters).toMatchObject({ "empty-handed-wins": 1, "confirmed-kills": 1 });
    for (const id of ["kara", "joe", "andre"]) expect(rec.sheet(id)!.storedVe).toBe(50);
    expect(rec.state.inventory.get("kara")?.map((x) => x.name)).toContain("Battle Axe");
  });

  it("names a draft of what the tracker holds as already recorded", () => {
    const drafts: Drafted[] = [
      { lines: ["l16"], action: { type: "combat.move", combatantId: "sentry", zoneId: "racks", forced: true } },
      { lines: ["l10"], action: { type: "proficiency.mark", characterId: "joe", shape: "spears and staves" } },
    ];
    expect(score(script, drafts).falsePositives.map((f) => f.why)).toEqual(["already-recorded", "already-recorded"]);
  });
});

describe("the Node scene", () => {
  const script = scripts.find((s) => s.id === "tutorial-node-scarcity")!;

  it("ends with a party of three, the pile divided, and Q-001 paid", () => {
    const rec = replay(engine, script);
    const parties = [...rec.state.parties.values()];
    expect(parties).toHaveLength(1);
    expect([...parties[0]!.members].sort()).toEqual(["andre", "joe", "kara"]);
    expect(rec.state.inventory.get("spoils") ?? []).toEqual([]);
    expect(rec.sheet("kara")).toMatchObject({ hp: 6, storedVe: 10 });
    expect(rec.state.inventory.get("andre")?.map((x) => x.name).sort()).toEqual(["Resonance Glass", "Resonance Shard", "Veil Shard"]);
  });

  it("names a draft on a trap line by the trap", () => {
    const drafts: Drafted[] = [
      { lines: ["l20"], action: { type: "item.move", from: "spoils", to: "joe", name: "Reactive Buckler", count: 1 } },
      { lines: ["l16"], action: { type: "hp.change", characterId: "kara", delta: -8 } },
      { lines: ["l14", "l15"], action: { type: "event.log", summary: "Andre threatens to run with the pile", participants: ["andre"], entries: [{ characterId: "andre", pole: "Hunger", intensity: 1 }] } },
    ];
    const r = score(script, drafts);
    expect(r.falsePositives.map((f) => f.why)).toEqual(["retracted", "state-read-aloud", "hypothetical"]);
    expect(r.entries.fp).toBe(1);
    expect(r.overall.tp).toBe(0);
  });

  it("accepts an alternate reading and flags an intensity off the script", () => {
    const pill = script.expected.actions.find((x) => x.id === "x-ev-pill")!;
    const division = script.expected.actions.find((x) => x.id === "x-ev-division")!;
    const drafts: Drafted[] = [
      { lines: ["l17"], action: { type: "event.log", summary: "Kara gives up the pill", participants: ["kara"], entries: [{ characterId: "kara", pole: "Restraint", intensity: 1 }] } },
      { lines: ["l13"], action: { type: "event.log", summary: "Joe proposes a fair split", participants: ["joe"], entries: [{ characterId: "joe", pole: "Control", intensity: 3 }] } },
    ];
    const r = score(script, drafts, { categories: ["event.log"] });
    expect(r.byCategory["event.log"]).toMatchObject({ tp: 2, fp: 0 });
    expect(r.entries).toMatchObject({ tp: 2, exact: 0, accepted: 1 });
    expect(r.entries.off).toEqual([{ expected: division.id, characterId: "joe", wanted: expect.objectContaining({ intensity: 1 }), drafted: expect.objectContaining({ intensity: 3 }) }]);
    expect(r.missed).not.toContain(pill.id);
  });

  it("reads a wrong pole as a miss and a false entry", () => {
    const r = score(script, [{ lines: ["l22"], action: { type: "event.log", summary: "Andre takes the shard", participants: ["andre"], entries: [{ characterId: "andre", pole: "Method", intensity: 1 }] } }], { categories: ["event.log"] });
    expect(r.byCategory["event.log"]!.tp).toBe(1);
    expect(r.entries).toMatchObject({ tp: 0, fp: 1 });
  });

  it("matches an answer to the drafter's own invite by who invited whom", () => {
    const drafts: Drafted[] = [
      { id: "d1", lines: ["l06"], action: { type: "party.invite", fromId: "kara", toId: "joe" } },
      { lines: ["l07"], action: { type: "party.answer", inviteId: "d1", accept: true } },
    ];
    const r = score(script, drafts, { categories: ["party.invite", "party.answer"] });
    expect(r.overall).toMatchObject({ tp: 2, fp: 0, fn: 2 });
    expect(r.missed).toEqual(["x-invite-andre", "x-andre-joins"]);
  });

  it("leaves optional items out of recall", () => {
    const r = score(script, [], { categories: ["quest.progress"] });
    expect(r.overall).toMatchObject({ fn: 0, recall: 1 });
  });
});

describe("the four Kith tables", () => {
  const tables = { "kith-apex": "The Apex Predator", "kith-architect": "The System Architect", "kith-adjudicator": "The Iron Adjudicator", "kith-thief": "The Phantom Thief" };
  const archetypes = engine.rules.hve.archetypes as { name: string; poles: string[] }[];
  const sides = (s: Script) =>
    s.expected.actions.flatMap((x) => {
      const a = x.action as Action;
      return a.type === "event.log" ? (a.entries ?? []).flatMap((e) => [`${e.characterId}:${e.pole}`, ...(e.secondary ? [`${e.characterId}:${e.secondary}`] : [])]) : [];
    });

  it("each read on its own archetype's sides, every reading the script accepts included", () => {
    for (const [id, name] of Object.entries(tables)) {
      const script = scripts.find((s) => s.id === id)!;
      const poles = archetypes.find((a) => a.name === name)!.poles;
      const read = [...sides(script), ...script.expected.actions.flatMap((x) => (x.also ?? []).map((e) => `${e.characterId}:${e.pole}`))];
      for (const side of read) expect(poles, `${id} ${side}`).toContain(side.split(":")[1]);
    }
  });

  it("give each character a different record at every table", () => {
    const records = Object.keys(tables).map((id) => sides(scripts.find((s) => s.id === id)!).sort().join(","));
    expect(new Set(records).size).toBe(4);
    for (const c of ["kara", "joe", "andre"]) {
      const theirs = Object.keys(tables).map((id) => sides(scripts.find((s) => s.id === id)!).filter((x) => x.startsWith(`${c}:`)).sort().join(","));
      expect(new Set(theirs).size, c).toBe(4);
    }
  });
});
