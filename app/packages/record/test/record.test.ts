/**
 * The campaign record against the book's procedures. Where the book gives a worked example
 * (Joe's rest in Cultivation, the pregens in Character Creation) the test uses its numbers.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { beforeEach, describe, expect, it } from "vitest";
import { type Action, CampaignRecord, type Draft, RecordError, hoursForGoal, killAwards } from "../src/index.ts";

const engine = new Engine(loadRules());
const GM = { role: "gm", userId: "gm-1" } as const;
const P1 = { role: "player", userId: "player-1" } as const;
const P2 = { role: "player", userId: "player-2" } as const;

let n = 0;
function draft(action: Action, actor: Draft["actor"] = GM, id = `a${++n}`): Draft {
  return { id, at: "2026-09-25T20:00:00Z", actor, source: "manual", action };
}

let rec: CampaignRecord;
const gm = (action: Action, id?: string) => rec.append(draft(action, GM, id));
const award = (characterId: string, ve: number) =>
  gm({ type: "ve.award", basis: { kind: "other", note: "test" }, awards: [{ characterId, ve }] });
const rest = (characterId: string, hours: number, interrupted = false) =>
  gm({ type: "consolidation.rest", highDensity: false, rests: [{ characterId, hours, interrupted }] });

/** Level a character by whole levels, placing each level's System points in STR and spending free points in FOR. */
function levelTo(characterId: string, level: number) {
  while (rec.sheet(characterId)!.level < level) {
    award(characterId, 120);
    rest(characterId, 6);
    const s = rec.sheet(characterId)!;
    for (const lv of s.pendingSystemLevels) {
      if (lv >= 10) continue;
      const str = s.raw.STR!;
      gm({ type: "points.system", characterId, level: lv, placement: str + 3 <= 99 ? { STR: 3 } : { PER: 3 } });
    }
    const t = rec.sheet(characterId)!;
    if (t.freePoints) gm({ type: "points.free", characterId, placement: { FOR: t.freePoints } });
  }
}

beforeEach(() => {
  rec = new CampaignRecord(engine);
  n = 0;
});

describe("character creation", () => {
  it("builds the pregens with the book's derived values", () => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "joe" });
    gm({ type: "character.pregen", characterId: "andre", pregen: "Andre" });
    const kara = rec.sheet("kara")!;
    expect(kara).toMatchObject({ name: "Kara", level: 1, grade: "F", maxHp: 14, hp: 14, maxAether: 6, aether: 6, tolerance: 80, storedVe: 0, surgeCost: 3 });
    expect(kara.raw).toEqual({ STR: 8, DEX: 5, FOR: 7, HRT: 4, POW: 6, PER: 5, CHA: 5 });
    expect(kara.force.STR).toBe(8);
    expect(rec.sheet("joe")).toMatchObject({ maxHp: 14, maxAether: 4 });
    expect(rec.sheet("andre")).toMatchObject({ maxHp: 10, maxAether: 5 });
  });

  it("holds point buy to 40 points, 3 to 10 each, and requires a Background", () => {
    const brawler = { STR: 10, DEX: 6, FOR: 8, HRT: 4, POW: 3, PER: 5, CHA: 4 };
    gm({ type: "character.create", characterId: "b", name: "Brawler", stats: brawler, background: "Line cook" });
    expect(rec.sheet("b")).toMatchObject({ maxHp: 16, maxAether: 3 });
    const create = (stats: Record<string, number>, background = "Locksmith") =>
      gm({ type: "character.create", characterId: "x", name: "X", stats, background });
    expect(() => create({ ...brawler, STR: 11, DEX: 5 })).toThrow(/STR 11 is outside 3 to 10/);
    expect(() => create({ ...brawler, CHA: 5 })).toThrow(/total 41/);
    expect(() => create(brawler, "  ")).toThrow(/Background/);
    expect(() => gm({ type: "character.pregen", characterId: "b", pregen: "Joe" })).toThrow(/already exists/);
  });
});

describe("VE and Consolidation", () => {
  beforeEach(() => gm({ type: "character.pregen", characterId: "joe", pregen: "Joe" }));

  it("runs Joe's rest from Cultivation: 90 VE, Mild, five hours, Aether at the first", () => {
    award("joe", 60);
    const push = award("joe", 30);
    expect(push.effects).toContainEqual({ kind: "saturation", characterId: "joe", from: "None", to: "Mild" });
    expect(rec.sheet("joe")!.saturation).toEqual({ band: "Mild", penalty: -10, collapseClock: false });
    gm({ type: "hp.change", characterId: "joe", delta: -11 });
    gm({ type: "aether.change", characterId: "joe", delta: -4 });

    const plan = hoursForGoal(engine, rec.sheet("joe")!, { kind: "everything" });
    expect(plan.hours).toBe(5);
    const preview = rec.preview(draft({ type: "consolidation.rest", highDensity: false, rests: [{ characterId: "joe", hours: 5 }] }));
    expect(preview.accepted).toBe(true);
    expect(preview.effects).toContainEqual({ kind: "aether-refilled", characterId: "joe", hour: 1 });
    expect(rec.sheet("joe")!.storedVe).toBe(90); // a preview records nothing

    rest("joe", 5);
    expect(rec.sheet("joe")).toMatchObject({ storedVe: 0, refinedVe: 90, level: 1, hp: 14, aether: 4, veToNextLevel: 30 });
    expect(rec.sheet("joe")!.saturation.band).toBe("None");
  });

  it("heals a fifth of Max HP an hour, fractions dropped, and the rest at the fifth", () => {
    gm({ type: "hp.change", characterId: "joe", delta: -14 });
    expect(rec.sheet("joe")!.downed).toBe(true);
    rest("joe", 1);
    expect(rec.sheet("joe")!.hp).toBe(2);
    rest("joe", 4);
    expect(rec.sheet("joe")!.hp).toBe(10); // each rest counts its own hours
    rest("joe", 5);
    expect(rec.sheet("joe")!.hp).toBe(14);
  });

  it("lands a level mid-rest, with System points pending and free points held", () => {
    award("joe", 130);
    const out = rest("joe", 7);
    expect(out.effects).toContainEqual({ kind: "level", characterId: "joe", level: 2, hour: 6 });
    expect(rec.sheet("joe")).toMatchObject({ level: 2, refinedVe: 10, storedVe: 0, pendingSystemLevels: [2], freePoints: 2 });
  });

  it("keeps completed hours when a rest is interrupted", () => {
    award("joe", 100);
    rest("joe", 2, true);
    expect(rec.sheet("joe")).toMatchObject({ storedVe: 60, refinedVe: 40 });
    expect(() => rest("joe", 0)).toThrow(/at least 1 hour/);
    rest("joe", 0, true); // roused before the first hour completed: nothing changes
    expect(rec.sheet("joe")).toMatchObject({ storedVe: 60, refinedVe: 40 });
  });

  it("refines 40 an hour at a High density site", () => {
    award("joe", 120);
    expect(hoursForGoal(engine, rec.sheet("joe")!, { kind: "next-level" }, true).hours).toBe(3);
    gm({ type: "consolidation.rest", highDensity: true, rests: [{ characterId: "joe", hours: 3 }] });
    expect(rec.sheet("joe")!.level).toBe(2);
  });

  it("plans each stated goal", () => {
    award("joe", 150);
    const s = rec.sheet("joe")!;
    expect(hoursForGoal(engine, s, { kind: "everything" }).hours).toBe(8);
    expect(hoursForGoal(engine, s, { kind: "next-level" }).hours).toBe(6);
    expect(hoursForGoal(engine, s, { kind: "amount", ve: 50 }).hours).toBe(3);
    expect(hoursForGoal(engine, s, { kind: "amount", ve: 500 })).toMatchObject({ hours: 8, note: "only 150 VE is stored" });
  });
});

describe("the collapse", () => {
  beforeEach(() => gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" }));

  it("refuses a collapse below Critical", () => {
    award("kara", 240);
    expect(rec.sheet("kara")!.saturation.band).toBe("Heavy");
    expect(() => gm({ type: "saturation.collapse", characterId: "kara", attribute: "FOR", highDensity: false })).toThrow(/not at Critical/);
  });

  it("costs a temporary point and runs involuntary Consolidation down to Tolerance", () => {
    award("kara", 300);
    const out = gm({ type: "saturation.collapse", characterId: "kara", attribute: "FOR", highDensity: false });
    expect(out.effects[0]).toEqual({ kind: "collapsed", characterId: "kara", attribute: "FOR", hours: 11 });
    // 220 refined: Level 2 at the sixth hour, 100 toward Level 3.
    expect(rec.sheet("kara")).toMatchObject({ storedVe: 80, level: 2, refinedVe: 100, maxHp: 12, hp: 12, temporary: ["FOR"] });
    expect(rec.sheet("kara")!.raw.FOR).toBe(6);

    rest("kara", 2, true); // an interrupted rest does not return the point
    expect(rec.sheet("kara")!.temporary).toEqual(["FOR"]);
    const back = rest("kara", 1);
    expect(back.effects).toContainEqual({ kind: "temporary-returned", characterId: "kara", attribute: "FOR" });
    expect(rec.sheet("kara")).toMatchObject({ temporary: [], maxHp: 14 });
  });

  it("lasts 5 full hours at the Level cap and leaves the stockpile", () => {
    levelTo("kara", 25);
    expect(rec.sheet("kara")).toMatchObject({ level: 25, atCap: true, veToNextLevel: null });
    award("kara", 300);
    rest("kara", 3);
    expect(rec.sheet("kara")!.storedVe).toBe(300); // Consolidation at the cap refines nothing
    const out = gm({ type: "saturation.collapse", characterId: "kara", attribute: "POW", highDensity: false });
    expect(out.effects[0]).toMatchObject({ kind: "collapsed", hours: 5 });
    expect(rec.sheet("kara")!.storedVe).toBe(300);
  });
});

describe("level-ups", () => {
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
    award("kara", 120);
    rest("kara", 6);
  });

  it("has the GM place exactly 3 System points for a pending level", () => {
    const place = (placement: Record<string, number>, level = 2) =>
      gm({ type: "points.system", characterId: "kara", level, placement });
    expect(() => place({ STR: 2 })).toThrow(/exactly 3/);
    expect(() => place({ STR: 3 }, 3)).toThrow(/no unplaced System points for Level 3/);
    expect(() => rec.append(draft({ type: "points.system", characterId: "kara", level: 2, placement: { STR: 3 } }, P1))).toThrow(/only the GM/);
    place({ STR: 2, FOR: 1 });
    expect(rec.sheet("kara")).toMatchObject({ pendingSystemLevels: [], maxHp: 16 });
    expect(rec.sheet("kara")!.raw.STR).toBe(10);
  });

  it("lets the player hold and spend free points on their own character only", () => {
    const spend = (actor: Draft["actor"], characterId: string, placement: Record<string, number>) =>
      rec.append(draft({ type: "points.free", characterId, placement }, actor));
    expect(() => spend(P2, "kara", { STR: 1 })).toThrow(/not this player's character/);
    expect(() => spend(P1, "kara", { STR: 3 })).toThrow(/holds 2 free points/);
    spend(P1, "kara", { DEX: 1 });
    expect(rec.sheet("kara")).toMatchObject({ freePoints: 1 });
    spend(P1, "kara", { DEX: 1 });
    expect(rec.sheet("kara")!.raw.DEX).toBe(7);
  });

  it("never places points into a stat past the Grade cap", () => {
    // No character reaches 99 before class selection, so this runs against a cap of 12.
    const rules = structuredClone(loadRules());
    rules.grades.grades[0].raw_max = 12;
    rec = new CampaignRecord(new Engine(rules));
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    award("kara", 120);
    rest("kara", 6);
    expect(() => gm({ type: "points.system", characterId: "kara", level: 2, placement: { STR: 5 } })).toThrow(/STR is 8 and the F-Grade cap is 12/);
    gm({ type: "points.system", characterId: "kara", level: 2, placement: { STR: 3 } });
    expect(() => rec.append(draft({ type: "points.free", characterId: "kara", placement: { STR: 2 } }, P1))).toThrow(/STR is 11 and the F-Grade cap is 12/);
    rec.append(draft({ type: "points.free", characterId: "kara", placement: { STR: 1, DEX: 1 } }, P1));
    expect(rec.sheet("kara")!.raw.STR).toBe(12);
  });

  it("leaves Level 10's System points to the class", () => {
    levelTo("kara", 10);
    expect(rec.sheet("kara")!.pendingSystemLevels).toEqual([10]);
    expect(() => gm({ type: "points.system", characterId: "kara", level: 10, placement: { STR: 3 } })).toThrow(/class profile/);
  });
});

describe("the log", () => {
  beforeEach(() => gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" }));

  it("records an id once, and refuses the same id with different content", () => {
    const d = draft({ type: "ve.award", basis: { kind: "core", core: "minor core" }, awards: [{ characterId: "kara", ve: 5 }] }, GM, "award-1");
    expect(rec.append(d).duplicate).toBe(false);
    expect(rec.append(d).duplicate).toBe(true);
    expect(rec.sheet("kara")!.storedVe).toBe(5);
    const other = { ...d, action: { ...d.action, awards: [{ characterId: "kara", ve: 15 }] } } as Draft;
    expect(() => rec.append(other)).toThrow(RecordError);
  });

  it("previews a correction and shows what stops applying, then applies it", () => {
    const a = gm({ type: "ve.award", basis: { kind: "quest", questId: "Q-001" }, awards: [{ characterId: "kara", ve: 120 }] });
    rest("kara", 6);
    const placed = gm({ type: "points.system", characterId: "kara", level: 2, placement: { STR: 3 } });
    const spent = rec.append(draft({ type: "points.free", characterId: "kara", placement: { FOR: 2 } }, P1));

    const correction = draft({ type: "void", targetId: a.envelope.id, reason: "correction", note: "Q-001 was not complete" });
    const p = rec.preview(correction);
    expect(p.accepted).toBe(true);
    const kara = p.changes.find((c) => c.characterId === "kara")!;
    expect(kara.changes).toContainEqual({ field: "level", before: 2, after: 1 });
    expect(kara.changes).toContainEqual({ field: "raw.STR", before: 11, after: 8 });
    expect(p.newlyRejected.map((r) => r.envelope.id)).toEqual([placed.envelope.id, spent.envelope.id]);

    rec.append(correction);
    expect(rec.sheet("kara")).toMatchObject({ level: 1, refinedVe: 0, storedVe: 0, maxHp: 14 });
    expect(rec.rejected.map((r) => r.envelope.id)).toEqual([placed.envelope.id, spent.envelope.id]);
    expect(rec.log).toHaveLength(6); // nothing leaves the log
  });

  it("lets a player undo their own action and nobody else's", () => {
    const a = award("kara", 120);
    rest("kara", 6);
    const spent = rec.append(draft({ type: "points.free", characterId: "kara", placement: { STR: 2 } }, P1));
    expect(() => rec.append(draft({ type: "void", targetId: a.envelope.id, reason: "undo" }, P1))).toThrow(/only their own/);
    rec.append(draft({ type: "void", targetId: spent.envelope.id, reason: "undo" }, P1));
    expect(rec.sheet("kara")).toMatchObject({ freePoints: 2 });
    expect(() => gm({ type: "void", targetId: spent.envelope.id, reason: "undo" })).toThrow(/already voided/);
  });

  it("resumes from a stored log to the same sheets", () => {
    award("kara", 200);
    rest("kara", 4, true);
    const again = new CampaignRecord(engine, JSON.parse(JSON.stringify(rec.log)));
    expect(again.sheets()).toEqual(rec.sheets());
  });
});

describe("planning helpers", () => {
  it("pays each participant the kill award for their own tier", () => {
    const awards = killAwards(engine, "F", [
      { characterId: "kara", grade: "F", tier: "Moderate" },
      { characterId: "newcomer", grade: "F", tier: "Hard" },
    ]);
    expect(awards).toEqual([
      { characterId: "kara", ve: 10 },
      { characterId: "newcomer", ve: 20 },
    ]);
    expect(killAwards(engine, "E", [{ characterId: "kara", grade: "F", tier: "Moderate" }])[0]!.ve).toBe(100);
  });
});
