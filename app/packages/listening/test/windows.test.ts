import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import { draftEventsPrompt, eventDraftsOf } from "../src/draft-events.ts";
import { loadScripts } from "../src/harness.ts";
import { inWindows, markOf, repeats, windowScenes, windowsOf } from "../src/windows.ts";

const engine = new Engine(loadRules());
const scripts = loadScripts();

describe("drafting in windows", () => {
  it("cuts lines into windows, each with the lines before it", () => {
    const w = windowsOf([1, 2, 3, 4, 5, 6, 7], 3, 2);
    expect(w).toEqual([
      { lines: [1, 2, 3], earlier: [] },
      { lines: [4, 5, 6], earlier: [2, 3] },
      { lines: [7], earlier: [5, 6] },
    ]);
  });

  it("gives every window of every script a record the rules take, and each recorded action once", () => {
    for (const script of scripts) {
      const scenes = windowScenes(engine, script, 20, 10);
      expect(scenes.flatMap((s) => s.lines.map((l) => l.id))).toEqual(script.lines.map((l) => l.id));
      // Each recorded action once after the window's own lines, and again as context after the earlier ones.
      expect(scenes.flatMap((s) => s.recorded.filter((r) => s.lines.some((l) => l.id === r.after))).length).toBe(script.recorded.length);
      for (const [k, s] of scenes.entries()) if (k) expect(s.earlier!.length).toBe(10);
    }
  });

  it("shows the earlier talk ahead of the transcript and drops a draft citing only it", () => {
    const script = scripts.find((s) => s.lines.length > 30)!;
    const scene = windowScenes(engine, script, 20, 10)[1]!;
    const prompt = draftEventsPrompt(scene);
    expect(prompt.indexOf("# Earlier talk")).toBeLessThan(prompt.indexOf("# Transcript"));
    const character = [...scene.record.sheets().keys()][0]!;
    const entry = { characterId: character, why: "w", pole: "Force", intensity: 1, intent: null, outcome: null, secondary: null, coercion: false };
    const event = (lines: string[]) => ({ lines, summary: "s", context: null, participants: [character], entries: [entry] });
    const out = eventDraftsOf(engine, scene, { events: [event([scene.earlier![0]!.id]), event([scene.earlier![0]!.id, scene.lines[0]!.id])] } as never);
    expect(out.dropped.map((d) => d.why)).toContain("cites only earlier talk, drafted in an earlier pass");
    expect(out.drafts.map((d) => d.lines)).toEqual([[scene.earlier![0]!.id, scene.lines[0]!.id]]);
  });

  it("drops a draft that repeats an earlier window's: the same kind, a line and a subject in common", async () => {
    const kara = { characterId: "kara", primary: { axis: "will", pole: "Force", intensity: 1 } };
    const ev = (lines: string[], who = kara) => ({ id: "event-1", lines, action: { type: "event.log", summary: "s", participants: [who.characterId], entries: [who] } }) as never;
    expect(repeats([markOf(ev(["a", "b"]))], markOf(ev(["b", "c"])))).toBe(true);
    expect(repeats([markOf(ev(["a", "b"]))], markOf(ev(["c"])))).toBe(false);
    expect(repeats([markOf(ev(["a", "b"]))], markOf(ev(["b"], { ...kara, characterId: "joe" })))).toBe(false);
    const scenes = [{}, {}] as never[];
    const out = await inWindows(scenes, async () => ({ drafts: [ev(["b"])] as { id: string; lines: string[]; action: never }[], dropped: [] as { draft: unknown; why: string }[], repaired: [] as string[] }));
    expect(out.drafts.map((d) => d.id)).toEqual(["w1-event-1"]);
    expect(out.dropped.map((d) => d.why)).toEqual(["repeats a draft from an earlier window"]);
  });
});
