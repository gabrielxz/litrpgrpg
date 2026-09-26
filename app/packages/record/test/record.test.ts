/**
 * The campaign record against the book's procedures. Where the book gives a worked example
 * (Joe's rest in Cultivation, the pregens in Character Creation) the test uses its numbers.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { beforeEach, describe, expect, it } from "vitest";
import { type Action, CampaignRecord, type Draft, RecordError, hoursForGoal, killAwards, rollD100s, rollFor } from "../src/index.ts";

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
    expect(() => place({ STR: 3 }, 3)).toThrow(/no unplaced assigned points for Level 3/);
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

describe("who creates and holds a character", () => {
  it("lets a player create their own character and no one else's", () => {
    rec.append(draft({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" }, P1));
    expect(rec.sheet("kara")!.playerId).toBe("player-1");
    const mine = { STR: 10, DEX: 6, FOR: 8, HRT: 4, POW: 3, PER: 5, CHA: 4 };
    rec.append(draft({ type: "character.create", characterId: "b", name: "Bo", stats: mine, background: "Line cook", playerId: "player-2" }, P2));
    expect(() => rec.append(draft({ type: "character.pregen", characterId: "x", pregen: "Joe", playerId: "player-2" }, P1))).toThrow(
      /only their own character/,
    );
    expect(() => rec.append(draft({ type: "character.pregen", characterId: "y", pregen: "Joe" }, P1))).toThrow(/only their own character/);
  });

  it("lets the GM hand a character to another player or take it over", () => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    award("kara", 120);
    rest("kara", 6);
    const moved = gm({ type: "character.assign", characterId: "kara", playerId: "player-2" });
    expect(moved.effects).toEqual([{ kind: "reassigned", characterId: "kara", playerId: "player-2" }]);
    expect(() => rec.append(draft({ type: "points.free", characterId: "kara", placement: { STR: 1 } }, P1))).toThrow(/not this player's/);
    rec.append(draft({ type: "points.free", characterId: "kara", placement: { STR: 1 } }, P2));
    gm({ type: "character.assign", characterId: "kara" });
    expect(rec.sheet("kara")!.playerId).toBeUndefined();
    expect(() => gm({ type: "character.assign", characterId: "kara" })).toThrow(/already held by the GM/);
    expect(() => rec.append(draft({ type: "character.assign", characterId: "kara", playerId: "player-2" }, P2))).toThrow(/only the GM/);
  });
});

describe("the party", () => {
  const P3 = { role: "player", userId: "player-3" } as const;
  const as = (actor: Draft["actor"], action: Action, id?: string) => rec.append(draft(action, actor, id));
  const members = () => [...rec.state.parties.values()].map((p) => p.members);
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
    gm({ type: "character.pregen", characterId: "andre", pregen: "Andre", playerId: "player-3" });
  });

  it("forms a party when an invitation is accepted, and grows it with the next", () => {
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1");
    expect(rec.state.invites).toEqual([{ id: "inv-1", fromId: "kara", toId: "joe" }]);
    const formed = as(P2, { type: "party.answer", inviteId: "inv-1", accept: true }, "ans-1");
    expect(formed.effects.map((e) => e.kind)).toEqual(["party-formed", "party-formed"]);
    expect(members()).toEqual([["kara", "joe"]]);
    // Joe invites Andre into the party Kara formed.
    as(P2, { type: "party.invite", fromId: "joe", toId: "andre" }, "inv-2");
    const joined = as(P3, { type: "party.answer", inviteId: "inv-2", accept: true });
    expect(joined.effects.filter((e) => e.kind === "party-joined").map((e) => e.characterId)).toEqual(["kara", "joe", "andre"]);
    expect(members()).toEqual([["kara", "joe", "andre"]]);
    expect(rec.state.invites).toEqual([]);
  });

  it("tells the inviter of a refusal and keeps nothing open", () => {
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1");
    const no = as(P2, { type: "party.answer", inviteId: "inv-1", accept: false });
    expect(no.effects).toEqual([{ kind: "party-declined", characterId: "kara", byId: "joe", byName: "Joe" }]);
    expect(rec.state.invites).toEqual([]);
    expect(rec.state.parties.size).toBe(0);
  });

  it("lets each player act only for their own character", () => {
    expect(() => as(P2, { type: "party.invite", fromId: "kara", toId: "joe" })).toThrow(/not this player's character/);
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1");
    expect(() => as(P3, { type: "party.answer", inviteId: "inv-1", accept: true })).toThrow(/not this player's character/);
    expect(() => as(P1, { type: "party.disband", partyId: "x" })).toThrow(/only the GM/);
  });

  it("refuses a second party until the first is left, and disbands a party of one", () => {
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1");
    as(P2, { type: "party.answer", inviteId: "inv-1", accept: true });
    as(P3, { type: "party.invite", fromId: "andre", toId: "joe" }, "inv-2");
    expect(() => as(P2, { type: "party.answer", inviteId: "inv-2", accept: true })).toThrow(/leaves it before joining/);
    const left = as(P1, { type: "party.leave", characterId: "kara" });
    expect(left.effects.map((e) => e.kind)).toEqual(["party-left", "party-left", "party-disbanded"]);
    expect(rec.state.parties.size).toBe(0);
    as(P2, { type: "party.answer", inviteId: "inv-2", accept: true });
    expect(members()).toEqual([["andre", "joe"]]);
  });

  it("drops an invitation made moot when the invitee joins by another route", () => {
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1");
    as(P1, { type: "party.invite", fromId: "kara", toId: "andre" }, "inv-2");
    as(P2, { type: "party.invite", fromId: "joe", toId: "andre" }, "inv-3");
    as(P2, { type: "party.answer", inviteId: "inv-1", accept: true });
    as(P3, { type: "party.answer", inviteId: "inv-2", accept: true });
    expect(rec.state.invites).toEqual([]);
  });

  it("lets the GM disband a party, and an undo withdraws an invitation", () => {
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1");
    as(P1, { type: "void", targetId: "inv-1", reason: "undo" });
    expect(rec.state.invites).toEqual([]);
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-2");
    as(P2, { type: "party.answer", inviteId: "inv-2", accept: true });
    const partyId = [...rec.state.parties.keys()][0]!;
    const out = gm({ type: "party.disband", partyId });
    expect(out.effects.map((e) => ("characterId" in e ? e.characterId : null))).toEqual(["kara", "joe"]);
    expect(rec.state.parties.size).toBe(0);
  });
});

describe("System messages", () => {
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
  });

  it("delivers to each named character at once", () => {
    const out = gm({ type: "message.send", to: ["kara", "joe"], text: "Anomaly logged." }, "m1");
    expect(out.effects).toEqual([
      { kind: "message", characterId: "kara", messageId: "m1", text: "Anomaly logged." },
      { kind: "message", characterId: "joe", messageId: "m1", text: "Anomaly logged." },
    ]);
  });

  it("holds a message until the GM releases it, and an undo discards it", () => {
    const held = gm({ type: "message.send", to: ["kara"], text: "Quest available.", hold: true }, "m1");
    expect(held.effects).toEqual([{ kind: "message-held", messageId: "m1", to: ["kara"] }]);
    expect(rec.state.held).toEqual([{ id: "m1", to: ["kara"], text: "Quest available." }]);
    const out = gm({ type: "message.release", messageId: "m1" }, "r1");
    expect(out.effects.map((e) => e.kind)).toEqual(["message"]);
    expect(rec.state.held).toEqual([]);
    expect(() => gm({ type: "message.release", messageId: "m1" })).toThrow(/no held message/);
    gm({ type: "message.send", to: ["joe"], text: "Later.", hold: true }, "m2");
    gm({ type: "void", targetId: "m2", reason: "undo" });
    expect(rec.state.held).toEqual([]);
  });

  it("refuses an empty message, no recipients, and a player sender", () => {
    expect(() => gm({ type: "message.send", to: ["kara"], text: "  " })).toThrow(/needs text/);
    expect(() => gm({ type: "message.send", to: [], text: "x" })).toThrow(/at least one/);
    expect(() => gm({ type: "message.send", to: ["nobody"], text: "x" })).toThrow(/no character/);
    expect(() => rec.append(draft({ type: "message.send", to: ["kara"], text: "x" }, P1))).toThrow(/only the GM/);
  });
});

describe("dice", () => {
  const seq = (...xs: number[]) => () => xs.shift()!;
  const roll = (over: Partial<Extract<Action, { type: "dice.roll" }>>, actor: Draft["actor"] = GM) =>
    rec.append(
      draft({ type: "dice.roll", roller: { kind: "character", characterId: "kara", attribute: "STR" }, rollKind: "clash", modifier: 0, ...over } as Action, actor),
    );
  const rolled = (out: { effects: unknown[] }) => out.effects[0] as Extract<import("../src/index.ts").Effect, { kind: "rolled" }>;
  beforeEach(() => gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" }));

  it("explodes at the F-Grade threshold, and only the kept die under Advantage", () => {
    expect(rollD100s(96, {}, seq(40))).toEqual({ natural: [40] });
    expect(rollD100s(96, {}, seq(96, 100, 12))).toEqual({ natural: [96, 100, 12] });
    expect(rollD100s(96, { advantage: true }, seq(98, 30, 7))).toEqual({ natural: [98, 7], dropped: 30 });
    expect(rollD100s(96, { advantage: true }, seq(20, 99, 3))).toEqual({ natural: [99, 3], dropped: 20 });
    expect(rollD100s(96, { explodes: false }, seq(100))).toEqual({ natural: [100] });
  });

  it("totals the dice, the named Attribute's Force, and the modifiers", () => {
    const r = rolled(roll({ natural: [62], modifier: 10 }));
    expect(r).toMatchObject({ characterId: "kara", total: 62 + 8 + 10, diceTotal: 62, force: 8, exploded: false, battleMemory: false });
  });

  it("flags a cascade of two extra dice on a character's roll for a Battle Memory Card", () => {
    expect(rolled(roll({ natural: [97, 40] }))).toMatchObject({ exploded: true, extraDice: 1, battleMemory: false });
    expect(rolled(roll({ natural: [97, 99, 40] }))).toMatchObject({ total: 97 + 99 + 40 + 8, extraDice: 2, battleMemory: true });
    const creature = rolled(roll({ roller: { kind: "other", name: "Frenzy Rat", grade: "F" }, natural: [97, 99, 40], modifier: 6 }));
    expect(creature).toMatchObject({ total: 242, battleMemory: false });
    expect(creature).not.toHaveProperty("characterId");
  });

  it("refuses dice that could not have come up that way", () => {
    expect(() => roll({ natural: [90, 50] })).toThrow(/under the F-Grade threshold 96/);
    expect(() => roll({ natural: [99] })).toThrow(/explodes: roll another/);
    expect(() => roll({ natural: [101] })).toThrow(/1 to 100/);
    expect(() => roll({ advantage: true, natural: [40], dropped: 60 })).toThrow(/keeps the higher/);
    expect(() => roll({})).toThrow(/not rolled/);
    expect(() => roll({ rollKind: "table", natural: [100], advantage: true, dropped: 3 })).toThrow(/table/);
  });

  it("charges a Surge half of Maximum Aether for +5 on a Clash only", () => {
    const r = rolled(roll({ natural: [50], surge: true }));
    expect(r).toMatchObject({ total: 50 + 8 + 5, surgeCost: 3 });
    expect(rec.sheet("kara")!.aether).toBe(3);
    roll({ natural: [50], surge: true });
    expect(() => roll({ natural: [50], surge: true })).toThrow(/has 0 Aether and a Surge costs 3/);
    expect(() => roll({ rollKind: "check", natural: [50], surge: true })).toThrow(/Surge adds to a Clash/);
  });

  it("reads a check against an entered Resistance, Exceptional when the die explodes", () => {
    const check = { rollKind: "check" as const, roller: { kind: "character" as const, characterId: "kara", attribute: "PER" }, resistance: 90 };
    expect(rolled(roll({ ...check, natural: [85] })).outcome).toBe("success");
    expect(rolled(roll({ ...check, natural: [97, 10] })).outcome).toBe("exceptional");
    expect(rolled(roll({ ...check, natural: [60] })).outcome).toBe("soft");
    expect(rolled(roll({ ...check, natural: [40] })).outcome).toBe("hard");
    expect(rolled(roll({ ...check, natural: [3] })).outcome).toBe("catastrophic");
  });

  it("lets a player roll openly for their own character and never take a roll back", () => {
    const mine = roll({ natural: [30] }, P1);
    expect(() => roll({ natural: [30] }, P2)).toThrow(/not this player's character/);
    expect(() => roll({ natural: [30], private: true }, P1)).toThrow(/only the GM rolls privately/);
    expect(() => rec.append(draft({ type: "void", targetId: mine.envelope.id, reason: "undo" }, P1))).toThrow(/a roll stands/);
    gm({ type: "void", targetId: mine.envelope.id, reason: "undo" });
  });
});

describe("the combat tracker", () => {
  const rat = { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", creature: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1 };
  const enc = () => rec.state.encounter!;
  const who = (id: string) => enc().combatants.find((c) => c.id === id)!;
  /** Appends through rollFor, with the dice given in order. */
  const rolled = (action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action), () => dice.shift()!));
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
    gm({
      type: "combat.start",
      encounterId: "e1",
      name: "The treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [
        { combatantId: "kara", sideId: "party", characterId: "kara" },
        { combatantId: "joe", sideId: "party", characterId: "joe" },
        rat,
      ],
    });
  });

  it("sends each side's highest HRT or PER Force to roll Momentum, and rolls a tie again", () => {
    // Joe's PER 6 beats Kara's 5; the rat rolls on PER 8.
    const out = rolled({ type: "combat.momentum" }, 50, 48, 60, 30);
    const a = out.envelope.action as Extract<Action, { type: "combat.momentum" }>;
    expect(a.attempts).toEqual([
      [
        { sideId: "party", combatantId: "joe", natural: [50] },
        { sideId: "hostiles", combatantId: "rat", natural: [48] },
      ],
      [
        { sideId: "party", combatantId: "joe", natural: [60] },
        { sideId: "hostiles", combatantId: "rat", natural: [30] },
      ],
    ]);
    expect(out.effects[0]).toMatchObject({ kind: "momentum", holder: "party", totals: [{ total: 66 }, { total: 38 }] });
    expect(enc()).toMatchObject({ round: 1, order: ["party", "hostiles"], turn: 0 });
    expect(who("kara").beats).toBe(2);
    expect(who("rat").beats).toBe(1);
  });

  it("refuses a roller who is not the side's best, and a last attempt that ties", () => {
    const bad = [
      [
        { sideId: "party", combatantId: "kara", natural: [60] },
        { sideId: "hostiles", combatantId: "rat", natural: [30] },
      ],
    ];
    expect(() => gm({ type: "combat.momentum", attempts: bad })).toThrow(/Joe rolls for the side/);
    const tie = [
      [
        { sideId: "party", combatantId: "joe", natural: [50] },
        { sideId: "hostiles", combatantId: "rat", natural: [48] },
      ],
    ];
    expect(() => gm({ type: "combat.momentum", attempts: tie })).toThrow(/ties: roll again/);
  });

  it("runs a round: one combatant's Beats at a time, side by side, then the next round", () => {
    rolled({ type: "combat.momentum" }, 60, 30);
    expect(() => gm({ type: "combat.act", combatantId: "rat" })).toThrow(/The party is taking its turn/);
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.beat", combatantId: "kara", what: "Attack" });
    gm({ type: "combat.beat", combatantId: "kara", what: "Move" });
    expect(() => gm({ type: "combat.beat", combatantId: "kara", what: "Attack" })).toThrow(/no Beats left/);
    gm({ type: "combat.done", combatantId: "kara" });
    // Joe acts and leaves a Beat unspent; it is gone.
    gm({ type: "combat.act", combatantId: "joe" });
    gm({ type: "combat.beat", combatantId: "joe", what: "Attack" });
    gm({ type: "combat.done", combatantId: "joe" });
    expect(enc().turn).toBe(1);
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.done", combatantId: "rat" });
    expect(enc().turn).toBe(2);
    expect(() => gm({ type: "combat.act", combatantId: "kara" })).toThrow(/start the next round/);
    gm({ type: "combat.round" });
    expect(enc()).toMatchObject({ round: 2, turn: 0, order: ["party", "hostiles"] });
    expect(who("joe")).toMatchObject({ beats: 2, acted: false, spent: [] });
  });

  it("shifts Momentum at the next round on a won Seize, and the later of two shifts wins", () => {
    rolled({ type: "combat.momentum" }, 30, 60);
    expect(enc().order).toEqual(["hostiles", "party"]);
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.done", combatantId: "rat" });
    gm({ type: "combat.act", combatantId: "joe" });
    // Joe (PER 6) rolls 70 against the rat's answer (PER 8) of 40: 76 to 48.
    const s = rolled({ type: "combat.seize", combatantId: "joe" }, 70, 40);
    expect(s.effects[0]).toMatchObject({ kind: "seized", won: true, total: 76, against: 48 });
    expect(who("joe").beats).toBe(1);
    expect(enc().order).toEqual(["hostiles", "party"]);
    gm({ type: "combat.reversal", sideId: "hostiles" });
    gm({ type: "combat.round" });
    expect(enc().order).toEqual(["hostiles", "party"]);
    gm({ type: "combat.reversal", sideId: "party" });
    const r = gm({ type: "combat.round" });
    expect(r.effects).toEqual([{ kind: "momentum-shifted", encounterId: "e1", holder: "party", by: "reversal" }]);
    expect(enc().order).toEqual(["party", "hostiles"]);
  });

  it("spends the Seize's Beat when it fails, and refuses a Seize by the side holding Momentum", () => {
    rolled({ type: "combat.momentum" }, 60, 30);
    gm({ type: "combat.act", combatantId: "kara" });
    expect(() => rolled({ type: "combat.seize", combatantId: "kara" }, 50, 50)).toThrow(/holds Momentum/);
    gm({ type: "combat.done", combatantId: "kara" });
    gm({ type: "combat.act", combatantId: "joe" });
    gm({ type: "combat.done", combatantId: "joe" });
    gm({ type: "combat.act", combatantId: "rat" });
    const s = rolled({ type: "combat.seize", combatantId: "rat" }, 10, 90);
    expect(s.effects[0]).toMatchObject({ won: false });
    expect(who("rat").beats).toBe(0);
    gm({ type: "combat.round" });
    expect(enc().order).toEqual(["party", "hostiles"]);
  });

  it("damages a character's own HP and a creature's, down to 0 and Downed", () => {
    rolled({ type: "combat.momentum" }, 60, 30);
    gm({ type: "combat.hp", combatantId: "kara", delta: -5 });
    expect(rec.sheet("kara")!.hp).toBe(9);
    const out = gm({ type: "combat.hp", combatantId: "rat", delta: -20 });
    expect(out.effects).toEqual([
      { kind: "combat-hp", encounterId: "e1", combatantId: "rat", from: 12, to: 0 },
      { kind: "combat-downed", encounterId: "e1", combatantId: "rat" },
    ]);
  });

  it("brings in a combatant mid-fight and skips a side with nobody left", () => {
    rolled({ type: "combat.momentum" }, 60, 30);
    gm({ type: "combat.add", combatant: { ...rat, combatantId: "rat2" } });
    expect(who("rat2").beats).toBe(1);
    gm({ type: "combat.remove", combatantId: "rat" });
    gm({ type: "combat.remove", combatantId: "rat2" });
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.done", combatantId: "kara" });
    gm({ type: "combat.act", combatantId: "joe" });
    gm({ type: "combat.done", combatantId: "joe" });
    expect(enc().turn).toBe(2);
    gm({ type: "combat.end" });
    expect(enc().ended).toBe(true);
    expect(() => gm({ type: "combat.round" })).toThrow(/no fight is running/);
  });

  it("keeps the fight the GM's to record", () => {
    expect(() => rec.append(draft({ type: "combat.round" }, P1))).toThrow(/only the GM/);
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
