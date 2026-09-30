import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { type Action, CampaignRecord } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { ALL_EVENTS_UNDER, MATCHED_EVENTS, type Drafter, campaignContext, draftMemory, draftMemoryPrompt, eventsFor } from "../src/index.ts";

const engine = new Engine(loadRules());

function table() {
  const record = new CampaignRecord(engine);
  let n = 0;
  const gm = (action: Action) => record.append({ id: `a${++n}`, at: "2026-09-30T20:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action });
  gm({ type: "character.pregen", characterId: "kara", pregen: "Kara" });
  gm({ type: "character.pregen", characterId: "joe", pregen: "Joe" });
  return { record, gm };
}

describe("campaign memory", () => {
  it("carries the paragraph, the last session, and chronicles into a request", () => {
    const { record, gm } = table();
    expect(campaignContext(record)).toEqual([]);
    const one = gm({ type: "session.start", present: ["kara", "joe"] }).envelope.id;
    gm({ type: "session.memory", sessionId: one, campaign: "The valley fell.", chronicles: [{ characterId: "joe", text: "Gave up the pill." }] });
    gm({ type: "session.end", summary: "They reached the Node." });
    const ctx = campaignContext(record).join("\n\n");
    expect(ctx).toContain("# The campaign\n\nThe valley fell.");
    expect(ctx).toContain("# Last session\n\nThey reached the Node.");
    expect(ctx).toContain("- Joe: Gave up the pill.");
    expect(campaignContext(record, ["kara"]).join("\n")).not.toContain("Joe:");
  });

  it("carries every event while the campaign is young, then this session's and the earlier ones the talk calls back to", () => {
    const { record, gm } = table();
    const log = (summary: string) => gm({ type: "event.log", summary, participants: ["kara"], entries: [] });
    gm({ type: "session.start", present: ["kara"] });
    log("Kara spared the Warden's hound at the gate.");
    for (let i = 0; i < ALL_EVENTS_UNDER; i++) log(`Kara counted the crates, number ${i}.`);
    gm({ type: "session.end" });
    gm({ type: "session.start", present: ["kara"] });
    log("Kara opened the depot door.");
    const kept = eventsFor(record, "The hound is back at the gate, limping.").map((e) => e.summary);
    expect(kept).toContain("Kara spared the Warden's hound at the gate.");
    expect(kept).toContain("Kara opened the depot door.");
    expect(kept.length).toBeLessThanOrEqual(MATCHED_EVENTS + 1);
  });

  it("drafts the rewrite from the memory before the session, keeping only chronicles of those present", async () => {
    const { record, gm } = table();
    const one = gm({ type: "session.start", present: ["kara", "joe"] }).envelope.id;
    gm({ type: "session.memory", sessionId: one, campaign: "The valley fell.", chronicles: [{ characterId: "kara", text: "Took the pill." }] });
    gm({ type: "session.end" });
    const two = gm({ type: "session.start", present: ["kara"] }).envelope.id;
    gm({ type: "event.log", summary: "Kara carried Ray to the Node.", participants: ["kara"], entries: [] });
    const prompt = draftMemoryPrompt(record, two);
    expect(prompt).toContain("The valley fell.");
    expect(prompt).toContain("- kara (Kara): Took the pill.");
    expect(prompt).toContain("Kara carried Ray to the Node.");
    const drafter: Drafter = async <T>() =>
      ({ campaign: "The valley fell.\nKara carries Ray.", chronicles: [{ characterId: "kara", text: "Took the pill; carried Ray." }, { characterId: "joe", text: "Not here." }] }) as T;
    expect(await draftMemory(drafter, record, two)).toEqual({ campaign: "The valley fell. Kara carries Ray.", chronicles: [{ characterId: "kara", text: "Took the pill; carried Ray." }] });
  });
});
