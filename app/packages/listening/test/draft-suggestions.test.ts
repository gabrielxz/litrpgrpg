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

const empty = (): DraftSuggestionsOutput => ({ titles: [], memories: [], hidden: [], quests: [], reveals: [] });

/** The script's expected suggestions of the drafter's kinds, as the model would return them. */
function perfectOutput(script: Script): DraftSuggestionsOutput {
  const out = empty();
  const why = "as the script says";
  const fiction = new Set(fictionTitles(engine).map((t) => t.title));
  for (const x of script.expected.suggestions) {
    const characterId = x.characterId!;
    if (x.kind === "title" && fiction.has(x.key)) out.titles.push({ lines: x.lines, characterId, title: x.key, why });
    else if (x.kind === "battle-memory") out.memories.push({ lines: x.lines, characterId, moment: x.key, why });
    else if (x.kind === "hidden-achievement") out.hidden.push({ lines: x.lines, characterId, name: x.key, deed: "Triggered by the deed.", attribute: "HRT", bonus: 3, why, alternative: null });
    // A quest matches on its kind, character, and lines; its category and wording are the drafter's.
    else if (x.kind === "quest") out.quests.push({ lines: x.lines, characterId, category: "Routine", title: x.key, issuer: null, difficulty: "Easy", objective: x.key, count: null, countFixed: false, why });
  }
  return out;
}

const scripted =
  (outputs: DraftSuggestionsOutput[]): Drafter =>
  async <T>() =>
    outputs.shift() as T;

describe("the suggestions drafter", () => {
  it("drafts quests to issue, the partial reveal of an obscured Hidden quest, and a Hidden Achievement's second reading", () => {
    const scene = sceneOfScript(engine, byId("gate-crossing"));
    scene.record.append({
      id: "hq",
      at: "2026-01-01T00:00:00Z",
      actor: { role: "gm", userId: "gm" },
      source: "manual",
      action: { type: "quest.issue", quest: { id: "Q-101", category: "Hidden", title: "Stayed Hand", difficulty: "Moderate", objective: "Spare what yields", hidden: "obscured" }, to: ["joe"] },
    });
    expect(draftSuggestionsPrompt(scene)).toContain("- hq: [Q-101] Hidden (obscured): Stayed Hand. Spare what yields. Held by Joe.");
    const out = suggestionDraftsOf(engine, scene, {
      ...empty(),
      hidden: [{ lines: ["l06"], characterId: "joe", name: "Last in Line", deed: "Triggered by going last.", attribute: "HRT", bonus: 4, why: "improbable", alternative: { attribute: "CHA", why: "he talked the line into order" } }],
      quests: [
        { lines: ["l14"], characterId: "andre", category: "Faction", title: "The Lost Crew", issuer: "the co-op", difficulty: "Hard", objective: "Find the missing scavengers", count: 3, countFixed: true, why: "asked" },
        { lines: ["l17"], characterId: "kara", category: "Routine", title: "Nest Clearance", issuer: "ignored", difficulty: "Easy", objective: "Clear the nests", count: null, countFixed: false, why: "a threat" },
        { lines: ["l20"], characterId: "joe", category: "Hidden", title: "Last Out", issuer: null, difficulty: "Moderate", objective: "Leave last", count: null, countFixed: false, why: "a pattern" },
      ],
      reveals: [{ lines: ["l30"], questId: "hq", name: "Let Them Go", why: "spared again" }],
    });
    expect(out.dropped).toEqual([]);
    const byKey = new Map(out.drafts.map((d) => [d.suggestion.key, d]));
    expect(byKey.get("The Lost Crew")!.accept).toEqual({
      type: "quest.issue",
      quest: { id: "Q-102", category: "Faction", title: "The Lost Crew", issuer: "the co-op", grade: "F", difficulty: "Hard", objective: "Find the missing scavengers", count: 3, countFixed: true },
      to: ["andre"],
    });
    expect(byKey.get("Nest Clearance")!.accept).toMatchObject({ quest: { id: "Q-103", category: "Routine" } });
    expect((byKey.get("Nest Clearance")!.accept as { quest: object }).quest).not.toHaveProperty("issuer");
    expect(byKey.get("Last Out")!.accept).toMatchObject({ quest: { category: "Hidden", hidden: "obscured" }, to: ["joe"] });
    expect(byKey.get("Q-101")).toMatchObject({ suggestion: { kind: "quest", characterId: "joe" }, accept: { type: "quest.reveal", questId: "hq", name: "Let Them Go" } });
    expect(byKey.get("Last in Line")!.alternatives).toEqual([
      { label: "+4 CHA", why: "he talked the line into order", accept: { type: "title.grant", characterId: "joe", title: { name: "Last in Line", category: "Hidden Achievement", bonus: { CHA: 4 }, effect: "Triggered by going last." } } },
    ]);
    const again = suggestionDraftsOf(engine, scene, { ...empty(), quests: [{ lines: ["l14"], characterId: "joe", category: "Hidden", title: "stayed hand", issuer: null, difficulty: "Easy", objective: "x", count: null, countFixed: false, why: "y" }] });
    expect(again.dropped.map((d) => d.why)).toEqual(["Joe already holds stayed hand"]);
  });

  it("keeps the instructions to the rules alone, and carries each character's titles and due cards in the request", () => {
    const system = draftSuggestionsSystem(engine);
    expect(system).toContain("- Gate-Runner (Achievement): First character through the tutorial gate.");
    expect(system).toContain("a Volatility cascade of two or more extra dice");
    expect(system).toContain("+3 to +5");
    expect(system).not.toContain("Ten-Slayer");
    expect(system).toContain("one to three in a campaign arc");
    expect(system).toContain("names the title and never the trigger");
    const scene = sceneOfScript(engine, byId("gate-crossing"));
    const prompt = draftSuggestionsPrompt(scene);
    expect(prompt).toContain("- andre: titles held: none; Hidden Achievements earned: none; Battle Memory Cards due: none.");
    expect(prompt).toContain("[l27] Dana (GM): Joe, you're up.");
    expect(prompt).not.toMatch(/HVE|\bDeep\b/);
    scene.record.append({
      id: "ha",
      at: "2026-01-01T00:00:00Z",
      actor: { role: "gm", userId: "gm" },
      source: "manual",
      action: { type: "title.grant", characterId: "andre", title: { name: "Answered in Kind", category: "Hidden Achievement", bonus: { CHA: 4 }, effect: "Triggered by turning a hostile beast aside without striking it." } },
    });
    expect(draftSuggestionsPrompt(scene)).toContain("- andre: titles held: Answered in Kind; Hidden Achievements earned: 1 (Answered in Kind);");
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
      hidden: [{ lines: ["l06"], characterId: "joe", name: "Last in Line", deed: "Triggered by putting himself last in the queue.", attribute: "HRT", bonus: 4, why: "improbable", alternative: null }],
      quests: [],
      reveals: [],
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
