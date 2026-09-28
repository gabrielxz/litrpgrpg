/**
 * The suggestions drafter against a scripted model: every script's expected titles, cards, and
 * Hidden Achievements, returned as the model would return them, come back as suggestions with the
 * action accepting each records, and score in full; what the record refuses is dropped.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import {
  type DraftSuggestionsOutput,
  type Drafter,
  SUGGESTION_CATEGORIES,
  type Script,
  draftSuggestionsPrompt,
  draftSuggestionsSchema,
  draftSuggestionsSystem,
  evaluateSuggestions,
  fictionTitles,
  loadScripts,
  sceneOfScript,
  score,
  suggestionDraftsOf,
} from "../src/index.ts";

const engine = new Engine(loadRules());
const scripts = loadScripts();
const byId = (id: string) => scripts.find((s) => s.id === id)!;

const empty = (): DraftSuggestionsOutput => ({ titles: [], memories: [], hidden: [] });

/** The script's expected suggestions of the drafter's kinds, as the model would return them. */
function perfectOutput(script: Script): DraftSuggestionsOutput {
  const out = empty();
  const why = "as the script says";
  const fiction = new Set(fictionTitles(engine).map((t) => t.title));
  for (const x of script.expected.suggestions) {
    const characterId = x.characterId!;
    if (x.kind === "title" && fiction.has(x.key)) out.titles.push({ lines: x.lines, characterId, title: x.key, why });
    else if (x.kind === "battle-memory") out.memories.push({ lines: x.lines, characterId, moment: x.key, why });
    else if (x.kind === "hidden-achievement") out.hidden.push({ lines: x.lines, characterId, name: x.key, deed: "Triggered by the deed.", attribute: "HRT", bonus: 3, why });
  }
  return out;
}

const scripted =
  (outputs: DraftSuggestionsOutput[]): Drafter =>
  async <T>() =>
    outputs.shift() as T;

describe("the suggestions drafter", () => {
  it("keeps the instructions to the rules alone, and carries each character's titles and due cards in the request", () => {
    const system = draftSuggestionsSystem(engine);
    expect(system).toContain("- Gate-Runner (Achievement): First character through the tutorial gate.");
    expect(system).toContain("a Volatility cascade of two or more extra dice");
    expect(system).toContain("+3 to +5");
    expect(system).not.toContain("Ten-Slayer");
    const prompt = draftSuggestionsPrompt(sceneOfScript(engine, byId("gate-crossing")));
    expect(prompt).toContain("- andre: titles held: none; Battle Memory Cards due: none.");
    expect(prompt).toContain("[l27] Dana (GM): Joe, you're up.");
    expect(prompt).not.toMatch(/HVE|\bDeep\b/);
  });

  it("returns every script's expected suggestions with the action each records, in full", () => {
    for (const script of scripts) {
      const out = suggestionDraftsOf(engine, sceneOfScript(engine, script), draftSuggestionsSchema(engine).parse(perfectOutput(script)));
      expect(out.dropped, script.id).toEqual([]);
      const report = score(script, out.drafts, { categories: SUGGESTION_CATEGORIES });
      expect(report.missed, script.id).toEqual([]);
      expect(report.falsePositives, script.id).toEqual([]);
    }
  });

  it("records a title from the rules, a card with its moment, and a Hidden Achievement as written", () => {
    const gate = byId("gate-crossing");
    const out = suggestionDraftsOf(engine, sceneOfScript(engine, gate), {
      titles: [{ lines: ["l14", "l17"], characterId: "andre", title: "The One Who Stood", why: "the Sacrifice" }],
      memories: [{ lines: ["l30"], characterId: "kara", moment: "Through the gate at 1 HP, coat gone", why: "near zero" }],
      hidden: [{ lines: ["l06"], characterId: "joe", name: "Last in Line", deed: "Triggered by putting himself last in the queue.", attribute: "HRT", bonus: 4, why: "improbable" }],
    });
    expect(out.drafts.map((d) => d.accept)).toEqual([
      { type: "title.grant", characterId: "joe", title: { name: "Last in Line", category: "Hidden Achievement", bonus: { HRT: 4 }, effect: "Triggered by putting himself last in the queue." } },
      { type: "title.grant", characterId: "andre", title: { catalog: "The One Who Stood" } },
      { type: "memory.grant", characterId: "kara", text: "Through the gate at 1 HP, coat gone" },
    ]);
    expect(out.drafts.map((d) => d.suggestion)).toEqual([
      { kind: "hidden-achievement", key: "Last in Line", characterId: "joe" },
      { kind: "title", key: "The One Who Stood", characterId: "andre" },
      { kind: "battle-memory", key: "Through the gate at 1 HP, coat gone", characterId: "kara" },
    ]);
  });

  it("drops a title twice over, a character the record lacks, and a draft citing no line in the scene", () => {
    const gate = byId("gate-crossing");
    const out = suggestionDraftsOf(engine, sceneOfScript(engine, gate), {
      ...empty(),
      titles: [
        { lines: ["l14"], characterId: "andre", title: "The One Who Stood", why: "the Sacrifice" },
        { lines: ["l17"], characterId: "andre", title: "The One Who Stood", why: "again" },
        { lines: ["l10"], characterId: "ray", title: "Gate-Runner", why: "an NPC" },
        { lines: ["l99"], characterId: "kara", title: "Thin Margin", why: "no such line" },
      ],
    });
    expect(out.drafts).toHaveLength(1);
    expect(out.dropped.map((d) => d.why)).toEqual(["no character ray", "Andre already holds or has The One Who Stood suggested", "cites no line in the scene"]);
    expect(out.repaired).toEqual(["suggestion-4: dropped line ids the scene lacks (l99)"]);
  });

  it("scores a script through the harness", async () => {
    const gate = byId("gate-crossing");
    const e = await evaluateSuggestions(engine, gate, scripted([perfectOutput(gate), empty()]), 2);
    expect(e.summary.byCategory["suggestion:title"]).toEqual({ tp: 1, fp: 0, fn: 1 });
    expect(e.summary.byCategory["suggestion:battle-memory"]).toEqual({ tp: 1, fp: 0, fn: 0 });
    expect(e.summary.missed["s-one-who-stood"]).toBe(1);
  });
});
