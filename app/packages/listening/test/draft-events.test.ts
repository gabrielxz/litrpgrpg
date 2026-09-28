/**
 * The events drafter against a scripted model: what the prompt carries and what it keeps out,
 * the model's output read back as record actions, and the harness's numbers.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import type { LogEvent } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import {
  type DraftEventsOutput,
  type Drafter,
  type Script,
  draftEventsPrompt,
  draftEventsSchema,
  draftEventsSystem,
  eventDraftsOf,
  evaluateEvents,
  loadScripts,
  sceneOfScript,
} from "../src/index.ts";

const engine = new Engine(loadRules());
const scripts = loadScripts();
const node = scripts.find((s) => s.id === "tutorial-node-scarcity")!;

/** The script's expected events, as the model would return them. */
function perfectOutput(script: Script): DraftEventsOutput {
  const events = script.expected.actions.filter((x) => x.action.type === "event.log");
  return {
    events: events.map((x) => {
      const a = x.action as LogEvent;
      return {
        lines: x.lines,
        summary: a.summary,
        context: a.context ?? null,
        participants: a.participants,
        entries: (a.entries ?? []).map((e) => ({
          characterId: e.characterId,
          why: "",
          pole: e.pole,
          intensity: e.intensity as never,
          intent: e.intent ?? null,
          outcome: e.outcome ?? null,
          secondary: (e.secondary ?? null) as never,
          coercion: e.coercion ?? false,
        })),
      };
    }),
  };
}

const scripted =
  (outputs: (DraftEventsOutput | Error)[]): Drafter =>
  async <T>() => {
    const next = outputs.shift();
    if (!next) throw new Error("the scripted model ran out");
    if (next instanceof Error) throw next;
    return next as T;
  };

describe.each(scripts.map((s) => [s.id, s] as const))("drafting %s", (_, script) => {
  const scene = sceneOfScript(engine, script);
  const prompt = draftEventsPrompt(scene);

  it("gives the model every line and nothing of the expected record", () => {
    for (const l of script.lines) expect(prompt).toContain(`[${l.id}] `);
    for (const x of script.expected.actions) if (x.action.type === "event.log") expect(prompt).not.toContain((x.action as LogEvent).summary);
    // The hyphenated reason labels; plain words such as "away" occur in table talk.
    for (const q of script.expected.quiet) if (q.why.includes("-")) expect(prompt).not.toContain(q.why);
    if (script.notes) expect(prompt).not.toContain(script.notes.slice(0, 40));
  });

  it("shows what the app recorded after the line it follows", () => {
    for (const r of script.recorded) expect(prompt).toContain(`app: ${JSON.stringify(r.action)}`);
  });

  it("scores the expected events, returned by the model, as perfect", async () => {
    const [run] = (await evaluateEvents(engine, script, scripted([perfectOutput(script)]), 1)).runs;
    expect(run!.drafts!.dropped).toEqual([]);
    expect(run!.report!.byCategory["event.log"]).toMatchObject({ precision: 1, recall: 1 });
    expect(run!.report!.entries).toMatchObject({ precision: 1, recall: 1, off: [] });
  });
});

describe("the standing instructions", () => {
  it("are the same text for every scene, built from the rules, and name no scene", () => {
    const system = draftEventsSystem(engine);
    expect(draftEventsSystem(engine)).toBe(system);
    for (const pole of ["Force", "Method", "Hunger", "Restraint", "Will", "Accord", "Control", "Freedom"]) expect(system).toContain(`- ${pole} (`);
    expect(system).toContain("Taking the pill while the others argue");
    for (const s of scripts) for (const l of s.lines) expect(system).not.toContain(l.text);
    expect(system).not.toMatch(/—/);
  });

  it("hold the model to the rules' sides and intensities", () => {
    const schema = draftEventsSchema(engine);
    const entry = { characterId: "kara", why: "", pole: "Restraint", intensity: 2, intent: null, outcome: null, secondary: null, coercion: false };
    const event = { lines: ["l17"], summary: "s", context: null, participants: ["kara"], entries: [entry] };
    expect(schema.safeParse({ events: [event] }).success).toBe(true);
    expect(schema.safeParse({ events: [{ ...event, entries: [{ ...entry, intensity: 1.5 }] }] }).success).toBe(false);
    expect(schema.safeParse({ events: [{ ...event, entries: [{ ...entry, pole: "Greed" }] }] }).success).toBe(false);
  });
});

describe("reading the model's events", () => {
  const scene = sceneOfScript(engine, node);
  const entry = (over: object = {}) => ({ characterId: "kara", why: "gave up the pill", pole: "Restraint", intensity: 1 as never, intent: null, outcome: null, secondary: null, coercion: false, ...over });
  const event = (over: object = {}) => ({ lines: ["l17"], summary: "Kara gives the pill to Ray.", context: null, participants: ["kara"], entries: [entry()], ...over });

  it("repairs what a GM would not fix by hand", () => {
    const out = eventDraftsOf(engine, scene, {
      events: [event({ lines: ["l17", "l99"], participants: [], entries: [entry({ secondary: "Accord", intent: " Put Ray first " })] })],
    });
    expect(out.dropped).toEqual([]);
    expect(out.drafts[0]).toMatchObject({ lines: ["l17"], action: { participants: ["kara"], entries: [{ characterId: "kara", pole: "Restraint", intensity: 1, intent: "Put Ray first" }] } });
    expect(out.drafts[0]!.action.entries![0]).not.toHaveProperty("secondary");
    expect(out.drafts[0]!.reasons).toEqual([{ characterId: "kara", why: "gave up the pill" }]);
    expect(out.repaired).toHaveLength(3);
  });

  it("keeps a secondary on an entry of two, and one entry per character", () => {
    const out = eventDraftsOf(engine, scene, { events: [event({ entries: [entry({ intensity: 2, secondary: "Accord" }), entry({ pole: "Hunger" })] })] });
    expect(out.drafts[0]!.action.entries).toEqual([{ characterId: "kara", pole: "Restraint", intensity: 2, secondary: "Accord" }]);
  });

  it("drops what cites nothing, carries nothing, or the record refuses", () => {
    const out = eventDraftsOf(engine, scene, {
      events: [event({ lines: ["l99"] }), event({ entries: [] }), event({ participants: ["ray"], entries: [entry({ characterId: "ray" })] }), event({ entries: [entry({ pole: "Will", coercion: true })] })],
    });
    expect(out.drafts).toEqual([]);
    expect(out.dropped.map((d) => d.why)).toEqual([
      "cites no line in the scene",
      "carries no entry",
      "the record refuses it: no character ray",
      "the record refuses it: coercion aimed at another player character is at least 2 tallies of Will",
    ]);
  });
});

describe("the harness", () => {
  it("counts a failed request and summarizes the runs that returned", async () => {
    const perfect = perfectOutput(node);
    const halfway: DraftEventsOutput = { events: perfect.events.slice(0, 2) };
    const e = await evaluateEvents(engine, node, scripted([perfect, new Error("the provider is limiting requests"), halfway]), 3);
    expect(e.runs.map((r) => r.error ?? "ok")).toEqual(["ok", "the provider is limiting requests", "ok"]);
    expect(e.summary).toMatchObject({ runs: 3, failed: 1, events: { precision: 1 } });
    expect(e.summary.events.recall).toBeCloseTo((1 + 2 / 4) / 2);
    expect(e.summary.missed).toEqual({ "x-ev-pill": 1, "x-ev-shard": 1 });
  });
});
