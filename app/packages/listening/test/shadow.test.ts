import type { Action, Envelope } from "@gradebreaker/record";
import { describe, expect, it } from "vitest";
import { SHADOW_LEAD_MS, compareShadow } from "../src/shadow.ts";

const T = Date.parse("2026-09-29T20:00:00Z");
const event = (characterId: string, pole: string): Action => ({ type: "event.log", summary: "s", participants: [characterId], entries: [{ characterId, pole, intensity: 1 }] });
const logged = (id: string, at: number, action: Action): Envelope => ({ id, seq: 0, at: new Date(at).toISOString(), actor: { role: "gm", userId: "gm" }, source: "manual", action });
const draft = (itemId: string, saidAt: number, action: Action) => ({ runId: "r", itemId, saidAt, action });

describe("shadow mode's comparison", () => {
  it("matches each draft to the nearest record of the same thing at or after its moment", () => {
    const report = compareShadow(
      [
        draft("d1", T, event("kara", "Hunger")),
        draft("d2", T + 60_000, event("kara", "Restraint")),
        draft("d3", T, { type: "title.grant", characterId: "joe", title: { catalog: "First Blood" } }),
        draft("d4", T, { type: "item.give", to: "andre", items: [{ name: "Edge Shard", count: 1 }] }),
      ],
      [
        logged("e1", T + 30_000, event("kara", "Hunger")),
        logged("e2", T + 90_000, event("kara", "Accord")),
        logged("e3", T - SHADOW_LEAD_MS - 1, { type: "title.grant", characterId: "joe", title: { catalog: "First Blood" } }),
        logged("e4", T + 5_000, event("joe", "Force")),
      ],
    );
    expect(report.both.map((m) => [m.draft.itemId, m.logged.id, m.sameSide])).toEqual([
      ["d1", "e1", true],
      ["d2", "e2", false],
    ]);
    // A title recorded before the moment is another moment's; an item nobody recorded is the listener's alone.
    expect(report.listenerOnly.map((d) => d.itemId)).toEqual(["d3", "d4"]);
    expect(report.gmOnly.map((e) => e.id)).toEqual(["e3", "e4"]);
    expect(report.byType["event.log"]).toEqual({ both: 2, gmOnly: 1, listenerOnly: 0 });
  });
});
