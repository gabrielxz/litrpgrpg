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
  it("loads as Prep items and replays its setup: four characters at Level 9, 100 VE toward Level 10", () => {
    const items = packItems(pack);
    expect(items.length).toBeGreaterThanOrEqual(5);
    const rec = new CampaignRecord(engine);
    for (const s of packSetup(pack)) rec.append({ id: s.id, at: "2026-10-01T18:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: actionSchema.parse(s.action) as never });
    rec.append({ id: "prep", at: "2026-10-01T18:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: { type: "prep.save", items, pack: pack.pack } });
    const sheets = [...rec.sheets().values()];
    expect(sheets.map((s) => s.level)).toEqual([9, 9, 9, 9]);
    for (const s of sheets) {
      expect(s.pendingSystemLevels).toEqual([]);
      expect(s.freePoints).toBe(0);
      expect(s.storedVe).toBe(0);
      expect(s.maxHp).toBeGreaterThanOrEqual(30);
      expect(s.veToNextLevel).toBe(20);
    }

    // The hour's VE as the run sheet plans it: the fence and Mara's quest carry everyone past Level 10
    // at the one rest, and still would with two Snarljaws fled; the class offers come due.
    let n = 0;
    const gm = (action: Parameters<typeof actionSchema.parse>[0]) =>
      rec.append({ id: `play-${++n}`, at: "2026-10-01T19:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: actionSchema.parse(action) as never });
    const everyone = (ve: number) => gm({ type: "ve.award", basis: { kind: "other", note: "plan" }, awards: sheets.map((s) => ({ characterId: s.id, ve })) });
    const kill = (tier: string) => (engine.rules.cultivation.awards.kill_tiers as { difficulty: string; ve: number }[]).find((k) => k.difficulty === tier)!.ve;
    const rest = (hours: number) => gm({ type: "consolidation.rest", highDensity: false, rests: sheets.map((s) => ({ characterId: s.id, hours })) });
    expect(kill("Moderate") + questTableVe(engine, "Faction", "Easy")!).toBeGreaterThanOrEqual(20);
    everyone(3 * kill("Moderate") + questTableVe(engine, "Routine", "Easy")! + questTableVe(engine, "Faction", "Easy")!);
    expect([...rec.sheets().values()].every((s) => s.storedVe <= engine.rules.cultivation.tolerance.base)).toBe(true);
    rest(6);
    expect([...rec.sheets().values()].map((s) => s.level)).toEqual([10, 10, 10, 10]);
  });
});
