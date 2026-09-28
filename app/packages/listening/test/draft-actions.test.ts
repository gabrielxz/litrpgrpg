/**
 * The actions drafter against a scripted model: every script's expected bookkeeping, returned as
 * the model would return it, comes back as the same record actions and scores in full; what the
 * record refuses is dropped with the reason.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import type { Action } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import {
  ACTION_CATEGORIES,
  type DraftActionsOutput,
  type Drafter,
  type Script,
  actionDraftsOf,
  countersOf,
  draftActionsPrompt,
  draftActionsSchema,
  draftActionsSystem,
  evaluateActions,
  loadScripts,
  sceneOfScript,
  score,
} from "../src/index.ts";

const engine = new Engine(loadRules());
const scripts = loadScripts();
const byId = (id: string) => scripts.find((s) => s.id === id)!;

const empty = (): DraftActionsOutput => ({ items: [], quests: [], counters: [], cues: [] });

/** The script's expected bookkeeping, as the model would return it: one entry per item given. */
function perfectOutput(script: Script): DraftActionsOutput {
  const out = empty();
  const why = "as the script says";
  for (const x of script.expected.actions) {
    const a = x.action as Action;
    const lines = x.lines;
    if (a.type === "item.give") for (const s of a.items) out.items.push({ lines, kind: "give", from: null, to: a.to, name: s.name, count: s.count, why });
    else if (a.type === "item.move") out.items.push({ lines, kind: "move", from: a.from, to: a.to, name: a.name, count: a.count, why });
    else if (a.type === "item.remove") out.items.push({ lines, kind: "remove", from: a.from, to: null, name: a.name, count: a.count, why });
    else if (a.type === "quest.progress") continue; // the optional progress ticks: the completion stands for them
    else if (a.type === "quest.complete") out.quests.push({ lines, kind: "complete", questId: a.questId, by: null, why });
    else if (a.type === "quest.fail") out.quests.push({ lines, kind: "fail", questId: a.questId, by: null, why });
    else if (a.type === "counter.tick") out.counters.push({ lines, characterId: a.characterId, counter: a.counter as never, why });
  }
  for (const x of script.expected.suggestions) if (x.kind === "prep-cue") out.cues.push({ lines: x.lines, prepId: x.key, why });
  return out;
}

const scripted =
  (outputs: DraftActionsOutput[]): Drafter =>
  async <T>() =>
    outputs.shift() as T;

describe("the actions drafter", () => {
  it("keeps the instructions to the rules alone, and carries the campaign's items, quests, and Prep in the request", () => {
    const system = draftActionsSystem(engine);
    expect(system).toContain("first-into-a-hostile-site: First of the party into a hostile site, ten times");
    expect(system).not.toContain("confirmed-kills");
    const prompt = draftActionsPrompt(sceneOfScript(engine, byId("tutorial-node-scarcity")));
    expect(prompt).toMatch(/# Prep\n\n- tutorial-/);
    expect(prompt).toContain("tutorial-party-formation: Party formation (Phase 3: The Recycling Node). Cue: The moment Q-001 completes");
    expect(prompt).toMatch(/- q-kara: .*\(Q-001\), active, held by kara/);
    expect(prompt).not.toMatch(/HVE|\bDeep\b/);
  });

  it("returns every script's expected bookkeeping as the record's own actions, in full and in order", () => {
    for (const script of scripts) {
      const out = actionDraftsOf(engine, sceneOfScript(engine, script), draftActionsSchema(engine).parse(perfectOutput(script)));
      expect(out.dropped, script.id).toEqual([]);
      const report = score(script, out.drafts, { categories: ACTION_CATEGORIES });
      expect(report.missed, script.id).toEqual([]);
      expect(report.falsePositives, script.id).toEqual([]);
    }
  });

  it("merges things taken together by one holder into one give", () => {
    const apex = byId("kith-apex");
    const out = actionDraftsOf(engine, sceneOfScript(engine, apex), perfectOutput(apex));
    const shards = out.drafts.find((d) => d.action?.type === "item.give" && d.action.to === "joe")!;
    expect(shards.action).toMatchObject({ items: [{ name: "Edge Shard" }, { name: "Anchor Shard" }] });
  });

  it("completes a quest for each holder at its stated VE, and drops what the record refuses", () => {
    const node = byId("tutorial-node-scarcity");
    const scene = sceneOfScript(engine, node);
    const out = actionDraftsOf(engine, scene, {
      ...empty(),
      quests: [{ lines: ["l02"], kind: "complete", questId: "q-kara", by: null, why: "done" }, { lines: ["l02"], kind: "complete", questId: "q-nobody", by: null, why: "?" }],
      items: [{ lines: ["l20"], kind: "move", from: "joe", to: "kara", name: "Nothing Joe Holds", count: 1, why: "?" }],
      cues: [{ lines: ["zz"], prepId: "tutorial-party-formation", why: "?" }, { lines: ["l03"], prepId: "made-up", why: "?" }],
      counters: [],
    });
    expect(out.drafts.map((d) => d.action ?? d.suggestion)).toEqual([{ type: "quest.complete", questId: "q-kara", awards: [{ characterId: "kara", ve: 10 }] }]);
    expect(out.dropped.map((d) => d.why)).toEqual([
      "no quest q-nobody",
      "no prepared item made-up",
      "the record refuses it: Joe holds 0 Nothing Joe Holds",
      "cites no line in the scene",
    ]);
  });

  it("reads a thing passing through someone's hands as one change of hands", () => {
    const camp = byId("camp-coercion");
    const out = actionDraftsOf(engine, sceneOfScript(engine, camp), {
      ...empty(),
      items: [
        { lines: ["l02"], kind: "move", from: "spoils", to: "andre", name: "Anchor Shard", count: 1, why: "pocketed" },
        { lines: ["l13"], kind: "move", from: "andre", to: "joe", name: "Anchor Shard", count: 1, why: "handed over" },
        { lines: ["l16"], kind: "move", from: "joe", to: "kara", name: "Anchor Shard", count: 1, why: "taken from Joe" },
        { lines: ["l16"], kind: "move", from: "kara", to: "spoils", name: "anchor shard", count: 1, why: "set on the tarp" },
      ],
    });
    expect(out.drafts.map((d) => d.action)).toEqual([
      { type: "item.move", from: "spoils", to: "andre", name: "Anchor Shard", count: 1 },
      { type: "item.move", from: "andre", to: "joe", name: "Anchor Shard", count: 1 },
      { type: "item.move", from: "joe", to: "spoils", name: "Anchor Shard", count: 1 },
    ]);
  });

  it("reads progress that fills a quest's count as its completion", () => {
    const node = byId("tutorial-node-scarcity");
    const scene = sceneOfScript(engine, node);
    const out = actionDraftsOf(engine, scene, {
      ...empty(),
      quests: [
        { lines: ["l02"], kind: "progress", questId: "q-kara", by: 2, why: "both disabled" },
        { lines: ["l02"], kind: "progress", questId: "q-joe", by: 1, why: "one disabled" },
      ],
    });
    expect(out.drafts.map((d) => d.action)).toEqual([
      { type: "quest.complete", questId: "q-kara", awards: [{ characterId: "kara", ve: 10 }] },
      { type: "quest.progress", questId: "q-joe", by: 1 },
    ]);
  });

  it("scores a script through the harness", async () => {
    const node = byId("tutorial-node-scarcity");
    const e = await evaluateActions(engine, node, scripted([perfectOutput(node), empty()]), 2);
    expect(e.summary.byCategory["suggestion:prep-cue"]).toEqual({ tp: 3, fp: 0, fn: 3 });
    expect(e.summary.byCategory["quest.complete"]).toEqual({ tp: 3, fp: 0, fn: 3 });
    expect(e.summary.missed["s-formation"]).toBe(1);
  });

  it("names a count for every counter the GM ticks", () => {
    expect(countersOf(engine).map((c) => c.counter)).toContain("empty-handed-wins");
  });
});
