/**
 * The content packs beside the app (app/packs/): each loads as Prep items, and its setup replays
 * through the record without a refusal, so a rules change that breaks a pack fails the check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CampaignRecord, type PackData, actionSchema, packItems, packSetup, questTableVe } from "../src/index.ts";

const engine = new Engine(loadRules());
const PACKS = join(import.meta.dirname, "..", "..", "..", "packs");
const load = (name: string) => parse(readFileSync(join(PACKS, name), "utf8")) as PackData;

describe("the rehearsal pack", () => {
  const pack = load("rehearsal.yaml");
  it("loads as Prep items and replays its setup: four characters at Level 8, 90 VE toward Level 9", () => {
    const items = packItems(pack);
    expect(items.length).toBeGreaterThan(10);
    const rec = new CampaignRecord(engine);
    for (const s of packSetup(pack)) rec.append({ id: s.id, at: "2026-10-01T18:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: actionSchema.parse(s.action) as never });
    rec.append({ id: "prep", at: "2026-10-01T18:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: { type: "prep.save", items, pack: pack.pack } });
    const sheets = [...rec.sheets().values()];
    expect(sheets.map((s) => s.level)).toEqual([8, 8, 8, 8]);
    for (const s of sheets) {
      expect(s.pendingSystemLevels).toEqual([]);
      expect(s.freePoints).toBe(0);
      expect(s.storedVe).toBe(0);
      expect(s.maxHp).toBeGreaterThanOrEqual(30);
    }

    // The session's VE as the run sheet plans it: each character reaches Level 9 at the first rest
    // and Level 10 at the second, without the optional Alpha.
    let n = 0;
    const gm = (action: Parameters<typeof actionSchema.parse>[0]) =>
      rec.append({ id: `play-${++n}`, at: "2026-10-01T19:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: actionSchema.parse(action) as never });
    const everyone = (ve: number) => gm({ type: "ve.award", basis: { kind: "other", note: "plan" }, awards: sheets.map((s) => ({ characterId: s.id, ve })) });
    const kill = (tier: string) => (engine.rules.cultivation.awards.kill_tiers as { difficulty: string; ve: number }[]).find((k) => k.difficulty === tier)!.ve;
    const rest = (hours: number) => gm({ type: "consolidation.rest", highDensity: false, rests: sheets.map((s) => ({ characterId: s.id, hours })) });
    everyone(3 * kill("Moderate") + questTableVe(engine, "Routine", "Easy")!);
    rest(4);
    expect([...rec.sheets().values()].map((s) => s.level)).toEqual([9, 9, 9, 9]);
    everyone(kill("Hard") + questTableVe(engine, "Faction", "Severe")!);
    expect([...rec.sheets().values()].every((s) => s.storedVe > engine.rules.cultivation.tolerance.base)).toBe(true);
    rest(6);
    expect([...rec.sheets().values()].map((s) => s.level)).toEqual([10, 10, 10, 10]);
  });
});
