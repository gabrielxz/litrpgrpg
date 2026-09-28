/**
 * The Personal Opportunity drafter against a scripted model: the request fills the book's
 * template from the record, the flavors a character has refused six times are not offered, and
 * the offer comes back as the quest the GM issues, its VE from the table and its hidden outcome
 * in the GM's note.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { type Action, CampaignRecord } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { type DraftOpportunityOutput, type Drafter, draftOpportunity, draftOpportunityPrompt, draftOpportunitySystem, flavorsFor, opportunityOf } from "../src/index.ts";

const engine = new Engine(loadRules());

function table(): CampaignRecord {
  const record = new CampaignRecord(engine);
  let n = 0;
  const gm = (action: Action) => record.append({ id: `a${++n}`, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action });
  gm({ type: "character.pregen", characterId: "kara", pregen: "Kara" });
  gm({ type: "character.pregen", characterId: "joe", pregen: "Joe" });
  gm({ type: "event.log", summary: "Kara held the slab while Joe crawled clear.", participants: ["kara", "joe"], entries: [{ characterId: "kara", pole: "Restraint", intensity: 3, intent: "Get Joe out" }] });
  const eventId = `a${n}`;
  gm({
    type: "hve.sweep",
    label: "Session 3",
    sheets: [{ characterId: "kara", moments: [{ pole: "Restraint", weight: 3, note: "held the slab for Joe", eventId }, { pole: "Force", weight: 1 }] }],
  });
  return record;
}

const offer: DraftOpportunityOutput = {
  stance: "affirm",
  flavor: "exploration",
  title: "Load-Bearing",
  difficulty: "Moderate",
  objective: "A support column in the east gallery is failing. Brace it before it gives.",
  count: null,
  countFixed: false,
  hours: 6,
  scaled: false,
  rewardHint: "A sensory tool",
  hiddenOutcome: "Leave it and lead the others out: +1 IP toward Preservation.",
  refusal: "Noted against exploration.",
  notice: "Structural failure imminent: east gallery. Window: 6h.",
  why: "Affirms her pattern of carrying the weight for others.",
};

describe("the Personal Opportunity drafter", () => {
  it("fills the book's template from the record and the GM's words, and keeps the axes out of what the player sees", () => {
    const record = table();
    const prompt = draftOpportunityPrompt(engine, record, "kara", "The east gallery, after the cave-in.");
    expect(prompt).toContain("- Kara, F-Grade, Level 1.");
    expect(prompt).toMatch(/Restraint leads by 1 tally/);
    expect(prompt).toContain("Current at the last sweep (Session 3), before it was erased");
    expect(prompt).toContain('- Restraint ×3: Kara held the slab while Joe crawled clear. (note: held the slab for Joe)');
    expect(prompt).toContain('# Defining moments (the circled margin notes)\n\n- "held the slab for Joe"');
    expect(prompt).toContain("The east gallery, after the cave-in.");
    const system = draftOpportunitySystem(engine);
    expect(system).toContain("Moderate 30");
    expect(system).toContain("at 3 refusals of one flavor it comes half as often, and at 6 it stops");
    expect(system).toMatch(/never name the behavioral axes or their sides \(Force, Method,/);
  });

  it("offers only the flavors not refused six times", () => {
    const record = table();
    const sheet = { ...record.sheets().get("kara")!, refusals: { combat: 6, social: 3 } };
    expect(flavorsFor(engine, sheet)).toEqual({ open: ["social", "exploration"], halved: ["social"] });
  });

  it("returns the quest the GM issues: the next code, the table's VE, the limit in words without a clock, the notes for the GM", async () => {
    const record = table();
    const drafter: Drafter = async <T>() => offer as T;
    const out = await draftOpportunity(engine, drafter, record, "kara");
    expect(out).toMatchObject({
      stance: "affirm",
      notice: "Structural failure imminent: east gallery. Window: 6h.",
      accept: {
        type: "quest.issue",
        to: ["kara"],
        quest: {
          id: "Q-101",
          category: "Personal Opportunity",
          grade: "F",
          difficulty: "Moderate",
          flavor: "exploration",
          time: "within 6 hours",
          rewardText: "A sensory tool",
          note: "Hidden outcome: Leave it and lead the others out: +1 IP toward Preservation. If refused: Noted against exploration. Drafted to affirm.",
        },
      },
    });
    expect("accept" in out && out.accept.quest.ve).toBeUndefined();
    const issued = record.preview({ id: "x", at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "suggestion", action: (out as { accept: Action }).accept });
    expect(issued.accepted).toBe(true);
  });

  it("drafts nothing for the dead, and says what the record refuses", async () => {
    const record = table();
    expect(opportunityOf(record, "kara", { ...offer, difficulty: "Nonsense" })).toEqual({ refused: expect.stringMatching(/the record refuses it/) });
    const never: Drafter = async () => {
      throw new Error("not asked");
    };
    await expect(draftOpportunity(engine, never, record, "nobody")).resolves.toEqual({ refused: "no character nobody" });
  });
});
