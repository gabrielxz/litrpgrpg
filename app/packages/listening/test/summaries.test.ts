/**
 * Summaries: the record's account of a session names who made each kill, the character summary's
 * lines come from the record, and neither request carries the Hidden Vector Engine's sheet.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import { type Drafter, SUMMARY_SCRIPTS, draftCharacterSummary, draftCharacterSummaryPrompt, draftSessionSummary, draftSessionSummaryPrompt, loadScripts, recordLines, sessionRecordOf } from "../src/index.ts";

const engine = new Engine(loadRules());
const scripts = loadScripts();
const den = () => sessionRecordOf(engine, scripts.find((s) => s.id === "wild-den")!);

describe("summaries", () => {
  it("replays every summary script inside one session", () => {
    for (const s of scripts.filter((x) => SUMMARY_SCRIPTS.includes(x.id))) expect(sessionRecordOf(engine, s).record.state.sessions.size).toBe(1);
  });

  it("tells the session in the record's order, each kill by the one who made it, and nothing of the HVE", () => {
    const { record, sessionId } = den();
    const prompt = draftSessionSummaryPrompt(record, sessionId);
    expect(prompt).toContain("- Joe was Downed.");
    expect(prompt).toContain("- Kara killed a Moderate enemy.");
    expect(prompt).not.toContain("Joe killed");
    expect(prompt.indexOf("Joe was Downed")).toBeLessThan(prompt.indexOf("Kara kills the smallest young Snarljaw"));
    expect(prompt).not.toMatch(/Force|Hunger|Restraint|tally|tallies/);
    expect(draftCharacterSummaryPrompt(record, "kara")).not.toMatch(/Force|Hunger|Restraint|tally|tallies/);
  });

  it("fills the summary's lines from the record, and frames it as the Integration Complete summary when asked", async () => {
    const { record, sessionId } = den();
    expect(recordLines(engine, record, record.sheets().get("kara")!)).toEqual(["Axes and Hammers: 1 Mark. Trained.", "Level 1. VE awaiting refinement: 10."]);
    const answer = (output: unknown): Drafter => (async () => output) as Drafter;
    const d = await draftCharacterSummary(engine, answer({ observation: "Front-line engagement: first in.\n\nResource prioritization: self-first." }), record, "kara", { integration: true });
    expect(d.text.split("\n")).toEqual([
      "==========================================",
      "INTEGRATION COMPLETE: INITIATE KARA",
      "==========================================",
      "Front-line engagement: first in.",
      "Resource prioritization: self-first.",
      "Axes and Hammers: 1 Mark. Trained.",
      "Level 1. VE awaiting refinement: 10.",
      "==========================================",
    ]);
    expect(d.flags).toEqual([]);
    const s = await draftSessionSummary(answer({ summary: "One.\nTwo. Three." }), record, sessionId);
    expect(s.summary).toBe("One. Two. Three.");
  });
});
