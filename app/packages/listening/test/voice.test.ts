/**
 * The System's voice: every fixture's setup replays, the prompts carry what the drafts need and
 * nothing of the Hidden Vector Engine, and the flags catch what the voice rules forbid.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import {
  type Drafter,
  draftMessage,
  draftMessagePrompt,
  draftMessageSystem,
  draftVision,
  draftVisionPrompt,
  draftVisionSystem,
  loadVoiceFixtures,
  memoryIdOf,
  voiceFlags,
  voiceRecordOf,
} from "../src/index.ts";

const engine = new Engine(loadRules());
const fixtures = loadVoiceFixtures();

describe.each(fixtures.map((f) => [f.id, f] as const))("voice fixture %s", (_, f) => {
  it("replays its setup and names what it asks about", () => {
    const record = voiceRecordOf(engine, f);
    if (f.kind === "message") {
      for (const id of f.to) expect(record.sheets().has(id)).toBe(true);
      const registers = Object.keys(engine.rules["system-ai"].voice.registers);
      for (const r of f.expected.registers) expect(registers).toContain(r);
    } else {
      expect(memoryIdOf(record, f)).toBe(f.memory);
      expect((engine.rules.principles.families as { name: string }[]).map((x) => x.name)).toContain(f.family);
    }
  });
});

describe("the voice", () => {
  it("builds its standing instructions from the rules data, one rule to a line", () => {
    const system = draftMessageSystem(engine);
    expect(system).toContain("- Never persuades, apologizes, or encourages.");
    expect(system).toContain("Title conferred: Thin Margin.");
    expect(draftVisionSystem(engine)).toContain("A mountain hangs from a thread.");
  });

  it("flags the table's words, the System speaking of itself, mannerisms, and names it must not say", () => {
    expect(voiceFlags(engine, "Threat neutralized. Volatile Energy acquired: 15.")).toEqual([]);
    expect(voiceFlags(engine, "Great job! I measured your check at 90.", { names: ["Impact"] })).toEqual([
      "table word: check",
      "speaks of itself: I",
      "mannerism: great job",
      "exclaims",
    ]);
    expect(voiceFlags(engine, "Sorry. **Request denied.**")).toEqual(["mannerism: sorry", "brackets or bold"]);
    expect(voiceFlags(engine, "The weight of Impact.", { names: ["Impact", "Weight"] })).toEqual(["names Impact", "names Weight"]);
    expect(voiceFlags(engine, "Acquisition method: coercion. Hemorrhage control applied.", { poles: ["Method", "Control"] })).toEqual([]);
    expect(voiceFlags(engine, "Method preferred. Control asserted.", { poles: ["Method", "Control"] })).toEqual(["names Method", "names Control"]);
    expect(voiceFlags(engine, "One.\nTwo.\nThree.", { maxLines: 2 })).toEqual(["runs 3 lines"]);
  });

  it("asks without the Hidden Vector Engine's sheet, and with earlier visions to avoid", () => {
    const f = fixtures.find((x) => x.id === "v-second-vision")!;
    if (f.kind !== "vision") throw new Error("a vision fixture");
    const record = voiceRecordOf(engine, f);
    const prompt = draftVisionPrompt(engine, record, f.characterId, memoryIdOf(record, f), f.family, f.words);
    expect(prompt).toContain("A map folds itself.");
    expect(prompt).toContain("The family Architecture, not yet crystallized");
    const m = fixtures.find((x) => x.id === "m-trait-bait")!;
    if (m.kind !== "message") throw new Error("a message fixture");
    const asked = draftMessagePrompt(voiceRecordOf(engine, m), m.to, m.gist);
    expect(asked).not.toMatch(/Deep|Current|Hunger|tall(y|ies)/);
  });

  it("returns the draft with its flags: a message's lines trimmed, a vision as one paragraph", async () => {
    const f = fixtures.find((x) => x.id === "v-weight-crystallized")!;
    if (f.kind !== "vision") throw new Error("a vision fixture");
    const record = voiceRecordOf(engine, f);
    const answer = (output: unknown): Drafter => (async () => output) as Drafter;
    const message = await draftMessage(engine, answer({ text: "  Threat neutralized.\n\n Volatile Energy acquired: 15. ", register: "notification", added: [] }), record, ["kara"], "15 VE");
    expect(message).toEqual({ text: "Threat neutralized.\nVolatile Energy acquired: 15.", register: "notification", added: [], flags: [] });
    const vision = await draftVision(engine, answer({ vision: "A gantry, weightless.\nWeight waits. Heat in the iron.", ip: 3, why: "x" }), record, "kara", f.memory, "Impact", f.words);
    expect(vision.vision).toBe("A gantry, weightless. Weight waits. Heat in the iron.");
    expect(vision.flags).toEqual(["names Weight", "says the affinity Heat"]);
  });
});
