import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { type Action, CampaignRecord } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { type Drafter, draftDistillation, draftDistillationPrompt, draftDistillationSystem } from "../src/index.ts";

const engine = new Engine(loadRules());

function joe() {
  const record = new CampaignRecord(engine);
  let n = 0;
  const gm = (action: Action) => record.append({ id: `a${++n}`, at: "2026-09-30T20:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action });
  gm({ type: "character.pregen", characterId: "joe", pregen: "Joe" });
  gm({ type: "insight.award", characterId: "joe", source: "Any other Principle-aligned experience, GM's call", family: "Preservation", ip: 3 });
  gm({ type: "principle.name", characterId: "joe", family: "Preservation", name: "Shielding" });
  return { record, gm };
}

describe("drafting a Distillation", () => {
  it("instructs from the book's test and the family samples, and carries the record and the player's words", () => {
    const system = draftDistillationSystem(engine);
    expect(system).toContain("Operational, Bounded, Testable");
    expect(system).toContain("Fulcrum");
    const { record, gm } = joe();
    gm({ type: "insight.award", characterId: "joe", source: "Any other Principle-aligned experience, GM's call", family: "Preservation", ip: 3, note: "x" });
    gm({ type: "insight.award", characterId: "joe", source: "Any other Principle-aligned experience, GM's call", family: "Preservation", ip: 3, note: "y" });
    gm({ type: "insight.award", characterId: "joe", source: "Any other Principle-aligned experience, GM's call", family: "Preservation", ip: 1, note: "z" });
    const prompt = draftDistillationPrompt(engine, record, "joe", "Preservation", { words: "I stand in front of people?" });
    expect(prompt).toContain("Shielding (Preservation), at Initial Insight with 10 Insight.");
    expect(prompt).toContain("Distillation to Seed, which grants: First Application; Attunements. The Application costs 10 Aether.");
    expect(prompt).toContain("I stand in front of people?");
  });

  it("returns two readings with their flags, and Seed's Attunements", async () => {
    const { record, gm } = joe();
    for (const ip of [3, 3, 1]) gm({ type: "insight.award", characterId: "joe", source: "Any other Principle-aligned experience, GM's call", family: "Preservation", ip });
    const drafter: Drafter = async <T>() =>
      ({
        readings: [
          { articulation: "Whatever comes for those behind me comes to me.", phrasing: "I am where the blow lands.", operational: "turns an attack", bounded: "my Zone, one turn", testable: "the enemy turns", name: "Draw Fire", effect: "1 Beat, 10 Aether: an enemy in your Zone attacking an ally must first win a Clash, HRT against yours, or attack you." },
          { articulation: "A line I hold, Restraint keeps.", phrasing: "Held ground stays held.", operational: "stops a push", bounded: "my Zone", testable: "nobody passes", name: "Hold", effect: "Part of a defense: +25 to the Clash." },
        ],
        attunements: "He knows at a glance who is in the most danger.",
      }) as T;
    const out = await draftDistillation(engine, drafter, record, "joe", "Preservation");
    expect(out.tier).toBe("Seed");
    expect(out.attunements).toBe("He knows at a glance who is in the most danger.");
    expect(out.readings[0]!.flags).toEqual([]);
    expect(out.readings[1]!.flags).toEqual(["names Restraint, a side of the Hidden Vector Engine", "a bonus of +25 is past the Modifier Budget's +20"]);
    await expect(draftDistillation(engine, drafter, joe().record, "joe", "Preservation")).rejects.toThrow(/not ready to Distill/);
  });
});
