/**
 * The offer fixtures: each setup replays cleanly, the signals the request states (Current against
 * Deep, a title that makes offers tests) agree with every fixture's expected stance, and the
 * scorer checks stance and flavor and flags player-facing text that gives the sheet away.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import {
  type DraftOpportunityOutput,
  type Drafter,
  draftOpportunityPrompt,
  evaluateOffer,
  flavorsFor,
  formatOffer,
  loadOffers,
  offerFlags,
  opportunityOf,
  recordOf,
  stanceSignals,
  tableWords,
} from "../src/index.ts";

const engine = new Engine(loadRules());
const offers = loadOffers();
const byId = (id: string) => offers.find((o) => o.id === id)!;

const output = (o: Partial<DraftOpportunityOutput>): DraftOpportunityOutput => ({
  stance: "affirm",
  flavor: "combat",
  title: "The Wounded Beast",
  difficulty: "Moderate",
  objective: "A Glow-Stalker injured in your last engagement has retreated north. Eliminate it before it recovers.",
  count: null,
  countFixed: false,
  hours: 24,
  scaled: false,
  rewardHint: "1 minor core",
  hiddenOutcome: null,
  refusal: "Noted against combat.",
  notice: "Predator wounded: 1.2km north. Recovery imminent. Engagement recommended.",
  why: "Affirms the hunt.",
  ...o,
});

describe("the offer fixtures", () => {
  it("replay cleanly, and the request's signals give each fixture's expected stance", () => {
    expect(offers.length).toBeGreaterThanOrEqual(7);
    for (const f of offers) {
      const sheet = recordOf(engine, f).sheets().get(f.characterId)!;
      const { diverging, testedBy } = stanceSignals(engine, sheet);
      expect(diverging.length || testedBy.length ? "test" : "affirm", f.id).toBe(f.expected.stance);
      // Every expected flavor is still offered.
      expect(f.expected.flavors.filter((x) => !flavorsFor(engine, sheet).open.includes(x)), f.id).toEqual([]);
    }
  });

  it("state the affirm-or-test signal in the request", () => {
    const at = (id: string) => draftOpportunityPrompt(engine, recordOf(engine, byId(id)), byId(id).characterId, byId(id).situation);
    expect(at("drifting-divergent")).toContain("- Current and Deep lean different ways on Hunger ↔ Restraint: Current Restraint, Deep Hunger.");
    expect(at("salvaged-tested")).toContain("- Holds Salvaged: offers arrive as tests until it is released.");
    expect(at("apex-after-fight")).toContain("- Current and Deep lean the same way on every axis Current touches.");
    expect(at("fresh-no-sweep")).toContain("- No sweep yet: nothing recent to compare.");
    expect(at("combat-closed")).toContain("- combat: 6 refused, no longer offered");
  });

  it("score stance and flavor, and flag the sheet's words, the axes, and the table's words", async () => {
    const f = byId("apex-after-fight");
    const outs = [output({}), output({ stance: "test", flavor: "social", notice: "Your Force and Hunger lead your Deep tally. Roll well." })];
    const scripted: Drafter = async <T>() => outs.shift() as T;
    const e = await evaluateOffer(engine, f, scripted, 2);
    expect(e.summary).toMatchObject({ runs: 2, returned: 2, stance: 1, flavor: 1, flagged: 1 });
    expect(e.runs[1]!.flags).toEqual(["names Force", "names Hunger", "says tally", "says Deep", "table word: roll"]);
    expect(formatOffer(e)).toContain("run 1: affirm, combat, Moderate: The Wounded Beast");
    expect(tableWords(engine)).toEqual(["round", "Beat", "turn", "roll", "die", "Margin", "Resistance", "check"]);
  });

  it("flag a System message past three lines, and a proportional reward the quest does not pay", () => {
    const f = byId("apex-after-fight");
    const record = recordOf(engine, f);
    const flags = (o: Partial<DraftOpportunityOutput>) => {
      const d = opportunityOf(record, "joe", output(o));
      return "accept" in d ? offerFlags(engine, d) : d.refused;
    };
    expect(flags({ notice: "Predator wounded: 1.2km, 8°. Recovery imminent. Opportunity window: 24h. Engagement recommended." })).toEqual([]);
    expect(flags({ notice: "One.\nTwo.\nThree.\nFour." })).toEqual(["message runs 4 lines"]);
    expect(flags({ notice: "Reward proportional to precision." })).toEqual(["message says proportional, the reward is fixed"]);
    expect(flags({ notice: "Reward proportional to precision.", scaled: true })).toEqual([]);
  });
});
