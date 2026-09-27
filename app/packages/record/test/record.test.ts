/**
 * The campaign record against the book's procedures. Where the book gives a worked example
 * (Joe's rest in Cultivation, the pregens in Character Creation) the test uses its numbers.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { beforeEach, describe, expect, it } from "vitest";
import { type Action, CampaignRecord, type Draft, RecordError, encounterAwards, hoursForGoal, flankingSuggested, killAwards, questForHolder, rollD100s, rollFor } from "../src/index.ts";

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

/** Level a character by whole levels, placing each level's assigned points in STR and spending free points in FOR. */
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

  it("lands a level mid-rest, with assigned points pending and free points held", () => {
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

  it("has the GM place exactly 3 assigned points for a pending level", () => {
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

  it("leaves Level 10's assigned points to the class", () => {
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

  it("damages a character's own HP and a creature's; a creature dies at 0", () => {
    rolled({ type: "combat.momentum" }, 60, 30);
    gm({ type: "combat.hp", combatantId: "kara", delta: -5 });
    expect(rec.sheet("kara")!.hp).toBe(9);
    const out = gm({ type: "combat.hp", combatantId: "rat", delta: -20 });
    expect(out.effects).toEqual([
      { kind: "combat-hp", encounterId: "e1", combatantId: "rat", from: 12, to: 0 },
      { kind: "combat-died", encounterId: "e1", combatantId: "rat", cause: "fell" },
    ]);
    expect(who("rat")).toMatchObject({ dead: true, out: true });
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

describe("the Clash in the tracker", () => {
  const ratSpec = { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1, zoneId: "treeline" };
  const enc = () => rec.state.encounter!;
  const who = (id: string) => enc().combatants.find((c) => c.id === id)!;
  const rolled = (action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action), () => dice.shift()!));
  const as = (actor: Draft["actor"], action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action, actor), () => dice.shift()!));
  /** Starts a fight with Momentum to `holder`: party (Joe PER 6 + 60 against the rat's 8 + 30) or hostiles. */
  function fight(holder: "party" | "hostiles", extra: object[] = []) {
    gm({
      type: "combat.start",
      encounterId: "e1",
      name: "Treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      zones: [
        { id: "treeline", name: "Treeline" },
        { id: "road", name: "Road" },
      ],
      combatants: [
        { combatantId: "kara", sideId: "party", characterId: "kara" },
        { combatantId: "joe", sideId: "party", characterId: "joe" },
        ratSpec,
        ...extra,
      ] as never,
    });
    rolled({ type: "combat.momentum" }, ...(holder === "party" ? [60, 30] : [30, 60]));
  }
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
  });

  it("costs a Beat, rolls both sides at the defense, and lands a 40 Margin as Driven Back", () => {
    fight("party");
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.attack", attackerId: "kara", defenderId: "rat", attack: { attribute: "STR", modifier: 0 }, label: "Axe" });
    expect(who("kara").beats).toBe(1);
    expect(enc().clash).toMatchObject({ stage: "defense" });
    expect(() => gm({ type: "combat.done", combatantId: "kara" })).toThrow(/Clash is waiting/);
    // Kara 70 + 8 = 78; the rat 30 + 8 = 38. The rat cannot Yield, so the Clash lands at once.
    const out = rolled({ type: "combat.defend", defense: { force: 8, means: "scampering", modifier: 0 } }, 70, 30);
    expect(out.effects.map((e) => e.kind)).toEqual(["clash", "clash-resolved", "combat-hp", "combat-downed"]);
    expect(enc().lastClash).toMatchObject({ margin: 40, damage: 40, drivenBack: true, drivable: true, yieldCap: 0 });
    expect(who("rat")).toMatchObject({ hp: 0, exposed: { started: false } });
    expect(enc().clash).toBeNull();
  });

  it("offers the defender Yield before damage, 20 Margin a Beat from their next turn", () => {
    fight("hostiles");
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.attack", attackerId: "rat", defenderId: "kara", attack: { force: 6, means: "bite", modifier: 0 } });
    // The rat 60 + 6 = 66; Kara dodges 30 + 5 = 35: Margin 31.
    as(P1, { type: "combat.defend", defense: { attribute: "DEX", modifier: 0 } }, 60, 30);
    expect(enc().clash).toMatchObject({ stage: "yield", result: { margin: 31, yieldCap: 2 } });
    expect(() => as(P2, { type: "combat.resolve", yield: 1 })).toThrow(/own character/);
    const out = as(P1, { type: "combat.resolve", yield: 1 });
    expect(out.effects[0]).toMatchObject({ kind: "clash-resolved", yielded: 1, damage: 11 });
    expect(rec.sheet("kara")!.hp).toBe(3);
    // Her turn this round is still to come: it has one Beat.
    expect(who("kara").beats).toBe(1);
  });

  it("takes a Yield after the defender's turn from next round's Beats, and drives on two", () => {
    fight("party");
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.done", combatantId: "kara" });
    gm({ type: "combat.act", combatantId: "joe" });
    gm({ type: "combat.done", combatantId: "joe" });
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.attack", attackerId: "rat", defenderId: "kara", attack: { force: 6, modifier: 0 } });
    rolled({ type: "combat.defend", defense: { attribute: "DEX", modifier: 0 } }, 60, 30);
    gm({ type: "combat.resolve", yield: 2 });
    expect(enc().lastClash).toMatchObject({ remaining: 0, damage: 0, drivable: true });
    expect(who("kara").debt).toBe(2);
    gm({ type: "combat.move", combatantId: "kara", zoneId: "road", forced: true });
    expect(who("kara").zoneId).toBe("road");
    gm({ type: "combat.done", combatantId: "rat" });
    gm({ type: "combat.round" });
    expect(who("kara").beats).toBe(0);
  });

  it("caps Yield at one Beat when Cornered", () => {
    fight("hostiles");
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.attack", attackerId: "rat", defenderId: "kara", attack: { force: 6, modifier: 0 }, cornered: true });
    rolled({ type: "combat.defend", defense: { attribute: "DEX", modifier: 0 } }, 60, 30);
    expect(enc().clash!.result!.yieldCap).toBe(1);
    expect(() => gm({ type: "combat.resolve", yield: 2 })).toThrow(/can give up 1 Beat here/);
  });

  it("leaves a Turned Aside attacker Exposed, at −10, until the end of their next turn", () => {
    fight("hostiles");
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.attack", attackerId: "rat", defenderId: "kara", attack: { force: 6, modifier: 0 } });
    // The rat 10 + 6 = 16; Kara 60 + 7 = 67 on FOR: Turned Aside.
    rolled({ type: "combat.defend", defense: { attribute: "FOR", modifier: 0 } }, 10, 60);
    expect(enc().lastClash).toMatchObject({ turnedAside: true, damage: 0 });
    expect(who("rat").exposed).toEqual({ started: false });
    gm({ type: "combat.done", combatantId: "rat" });
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.attack", attackerId: "kara", defenderId: "rat", attack: { attribute: "STR", modifier: 0 } });
    // Kara 40 + 8 = 48; the rat 45 + 8 − 10 = 43.
    rolled({ type: "combat.defend", defense: { force: 8, modifier: 0 } }, 40, 45);
    expect(enc().lastClash).toMatchObject({ margin: 5, defenseTotal: 43 });
    gm({ type: "combat.done", combatantId: "kara" });
    gm({ type: "combat.act", combatantId: "joe" });
    gm({ type: "combat.done", combatantId: "joe" });
    gm({ type: "combat.round" });
    gm({ type: "combat.act", combatantId: "rat" });
    expect(who("rat").exposed).toEqual({ started: true });
    gm({ type: "combat.done", combatantId: "rat" });
    expect(who("rat").exposed).toBeNull();
  });

  it("adds Flanking and a Surge to the totals, and suggests Flanking from the Zones", () => {
    fight("party", [{ ...ratSpec, combatantId: "rat2", name: "Frenzy Rat 2" }]);
    // Everyone starts in the Treeline, where both rats engage Kara.
    expect(flankingSuggested(enc(), "rat", "kara")).toBe(true);
    gm({ type: "combat.move", combatantId: "kara", zoneId: "road", forced: true });
    gm({ type: "combat.move", combatantId: "rat", zoneId: "road", forced: true });
    expect(flankingSuggested(enc(), "rat", "kara")).toBe(false);
    gm({ type: "combat.move", combatantId: "rat2", zoneId: "road", forced: true });
    expect(flankingSuggested(enc(), "rat", "kara")).toBe(true);
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.done", combatantId: "kara" });
    gm({ type: "combat.act", combatantId: "joe" });
    gm({ type: "combat.done", combatantId: "joe" });
    gm({ type: "combat.act", combatantId: "rat" });
    gm({ type: "combat.attack", attackerId: "rat", defenderId: "kara", attack: { force: 6, modifier: 0 }, flanking: true });
    rolled({ type: "combat.defend", defense: { attribute: "DEX", modifier: 0, surge: true } }, 50, 50);
    // The rat 50 + 6 + 10 = 66; Kara 50 + 5 + 5 = 60, and the Surge cost her 3 Aether.
    expect(enc().clash!.result).toMatchObject({ attackTotal: 66, defenseTotal: 60 });
    expect(rec.sheet("kara")!.aether).toBe(3);
  });

  it("moves for a Beat on the mover's turn, and lets players act only for their own characters", () => {
    fight("party");
    as(P1, { type: "combat.act", combatantId: "kara" });
    as(P1, { type: "combat.move", combatantId: "kara", zoneId: "road" });
    expect(who("kara")).toMatchObject({ zoneId: "road", beats: 1, spent: ["Move"] });
    expect(() => as(P1, { type: "combat.move", combatantId: "kara", zoneId: "treeline", forced: true })).toThrow(/forced move is the GM's/);
    expect(() => as(P2, { type: "combat.attack", attackerId: "kara", defenderId: "rat", attack: { attribute: "STR", modifier: 0 } })).toThrow(/own character/);
    as(P1, { type: "combat.attack", attackerId: "kara", defenderId: "rat", attack: { attribute: "STR", modifier: 0 } });
    expect(() => as(P1, { type: "combat.defend", defense: { force: 8, modifier: 0 } }, 50, 50)).toThrow(/own character/);
    expect(() => as(P1, { type: "combat.round" })).toThrow(/only the GM/);
  });
});

describe("Downed, pills, Aura Pressure, and the Surprise Beat", () => {
  const enc = () => rec.state.encounter!;
  const who = (id: string) => enc().combatants.find((c) => c.id === id)!;
  const as = (actor: Draft["actor"], action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action, actor), () => dice.shift()!));
  const rolled = (action: Action, ...dice: number[]) => as(GM, action, ...dice);
  const npc = { combatantId: "thug", sideId: "hostiles", name: "Thug", grade: "F", maxHp: 12, momentumForce: 8, beats: 2 };
  /** Kara and Joe (in a party) against `foes`, in the Treeline; Momentum to the party unless the foes' rolls win. */
  function fight(foes: object[], momentum: number[] = [60, 30]) {
    gm({
      type: "combat.start",
      encounterId: "e1",
      name: "Treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      zones: [
        { id: "treeline", name: "Treeline" },
        { id: "road", name: "Road" },
      ],
      combatants: [{ combatantId: "kara", sideId: "party", characterId: "kara" }, { combatantId: "joe", sideId: "party", characterId: "joe" }, ...foes] as never,
    });
    if (momentum.length) rolled({ type: "combat.momentum" }, ...momentum);
  }
  /** Finishes every remaining turn of the round without starting the next. */
  function nextRoundTo(_: string) {
    while (enc().turn < enc().order.length) {
      const c = enc().combatants.find((x) => x.sideId === enc().order[enc().turn] && !x.out && !x.downed && !x.acted)!;
      gm({ type: "combat.act", combatantId: c.id });
      gm({ type: "combat.done", combatantId: c.id });
    }
  }
  /** Ends every remaining turn of the round and starts the next. */
  function nextRound() {
    while (enc().turn < enc().order.length) {
      const c = enc().combatants.find((x) => x.sideId === enc().order[enc().turn] && !x.out && !x.downed && !x.acted)!;
      gm({ type: "combat.act", combatantId: c.id });
      gm({ type: "combat.done", combatantId: c.id });
    }
    return gm({ type: "combat.round" });
  }
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
    as(P1, { type: "party.invite", fromId: "kara", toId: "joe" });
    const inviteId = rec.state.invites[0]!.id;
    as(P2, { type: "party.answer", inviteId, accept: true });
  });

  it("Downs a character at 0 with vital coherence 3, falling each round from the round of Downing, and kills them at 0", () => {
    fight([npc]);
    const down = gm({ type: "combat.hp", combatantId: "kara", delta: -14 });
    expect(down.effects[1]).toEqual({ kind: "combat-downed", encounterId: "e1", combatantId: "kara", characterId: "kara", coherence: 3 });
    expect(who("kara")).toMatchObject({ beats: 0, downed: { coherence: 3, stabilized: false } });
    expect(() => gm({ type: "combat.act", combatantId: "kara" })).toThrow(/Downed/);
    expect(() => gm({ type: "combat.attack", attackerId: "thug", defenderId: "kara", attack: { force: 6, modifier: 0 } })).toThrow(/execution/);
    expect(nextRound().effects).toContainEqual({ kind: "vital-coherence", encounterId: "e1", combatantId: "kara", characterId: "kara", coherence: 2 });
    expect(who("kara").beats).toBe(0);
    nextRound();
    expect(() => gm({ type: "combat.end" })).toThrow(/Kara is dying/);
    const out = nextRound();
    expect(out.effects).toContainEqual({ kind: "combat-died", encounterId: "e1", combatantId: "kara", characterId: "kara", cause: "countdown" });
    // Death ends the party; a party of one is no party.
    expect(out.effects).toContainEqual({ kind: "party-member-died", characterId: "joe", memberId: "kara", memberName: "Kara" });
    expect(rec.state.parties.size).toBe(0);
    expect(rec.sheet("kara")).toMatchObject({ dead: true, downed: false });
    gm({ type: "combat.end" });
    expect(() => gm({ type: "combat.start", encounterId: "e2", name: "Again", sides: [{ id: "a", name: "A" }, { id: "b", name: "B" }], combatants: [{ combatantId: "kara", sideId: "a", characterId: "kara" }, { ...npc, sideId: "b" }] })).toThrow(/Kara is dead/);
  });

  it("annihilates on a single hit of ten times Max HP, with no Downed state", () => {
    fight([npc]);
    const out = gm({ type: "combat.hp", combatantId: "kara", delta: -140 });
    expect(out.effects.map((e) => e.kind)).toEqual(["combat-hp", "combat-died", "party-member-died", "party-disbanded"]);
    expect(out.effects[1]).toMatchObject({ cause: "annihilated" });
  });

  it("stabilizes by bare hands in the same Zone on a Moderate check, and wakes them at 1 HP when the fight ends", () => {
    fight([npc]);
    gm({ type: "combat.hp", combatantId: "kara", delta: -14 });
    gm({ type: "combat.move", combatantId: "joe", zoneId: "road", forced: true });
    as(P2, { type: "combat.act", combatantId: "joe" });
    expect(() => as(P2, { type: "combat.stabilize", combatantId: "joe", targetId: "kara" }, 90)).toThrow(/Kara's Zone/);
    gm({ type: "combat.move", combatantId: "joe", zoneId: "treeline", forced: true });
    // Joe the EMT rolls with Advantage: 40 and 88, keeps 88, + DEX 5 = 93 against 90.
    const out = as(P2, { type: "combat.stabilize", combatantId: "joe", targetId: "kara", advantage: true }, 40, 88);
    expect(out.effects).toEqual([
      expect.objectContaining({ kind: "combat-check", total: 93, resistance: 90, success: true }),
      { kind: "stabilized", encounterId: "e1", combatantId: "kara", characterId: "kara" },
    ]);
    expect(who("joe").beats).toBe(1);
    nextRound();
    nextRound();
    nextRound();
    expect(who("kara").downed).toEqual({ coherence: 3, stabilized: true });
    const end = gm({ type: "combat.end" });
    expect(end.effects).toContainEqual({ kind: "revived", encounterId: "e1", combatantId: "kara", characterId: "kara", hp: 1 });
    expect(end.effects).toContainEqual({ kind: "battle-memory-due", characterId: "kara", reason: "survived Downed" });
    expect(rec.sheet("kara")!.hp).toBe(1);
    // Woken at 1 HP after the fight is not still standing at its end.
    expect(rec.sheet("kara")!.counters).toEqual({ "survived-downed": 1 });
  });

  it("wakes a Downed character on a pill, and counts every pill against the recipient until a Consolidation's first full hour", () => {
    fight([npc]);
    gm({ type: "combat.hp", combatantId: "kara", delta: -14 });
    as(P2, { type: "combat.act", combatantId: "joe" });
    // A character gives only what they carry.
    expect(() => as(P2, { type: "combat.pill", combatantId: "joe", targetId: "kara", pill: "Stuttering Tincture" })).toThrow(/Joe holds 0/);
    gm({ type: "item.give", to: "joe", items: [{ name: "Stuttering Tincture", count: 2 }] });
    gm({ type: "item.give", to: "kara", items: [{ name: "stuttering tincture", count: 5 }, { name: "Sparkstone Tablet", count: 2 }] });
    const first = as(P2, { type: "combat.pill", combatantId: "joe", targetId: "kara", pill: "Stuttering Tincture" });
    expect(first.effects).toContainEqual({ kind: "revived", encounterId: "e1", combatantId: "kara", characterId: "kara", hp: 5 });
    expect(who("kara")).toMatchObject({ downed: null, beats: 2 });
    as(P2, { type: "combat.pill", combatantId: "joe", targetId: "kara", pill: "Stuttering Tincture" });
    expect(rec.sheet("kara")!.pillsTaken).toEqual({ healing: 2, aether: 0 });
    as(P2, { type: "combat.done", combatantId: "joe" });
    // Out of the fight a pill costs no Beat, and the tracker refuses it while she is in one.
    expect(() => as(P1, { type: "pill.take", characterId: "kara", targetId: "kara", pill: "Stuttering Tincture" })).toThrow(/costs a Beat/);
    as(P1, { type: "combat.act", combatantId: "kara" });
    as(P1, { type: "combat.pill", combatantId: "kara", targetId: "kara", pill: "Stuttering Tincture" });
    as(P1, { type: "combat.done", combatantId: "kara" });
    nextRoundTo("hostiles");
    gm({ type: "combat.end" });
    // Two more after the fight, the fourth and fifth, both work; the sixth does not.
    gm({ type: "hp.change", characterId: "kara", delta: -10 });
    as(P1, { type: "pill.take", characterId: "kara", targetId: "kara", pill: "Stuttering Tincture" });
    expect(as(P1, { type: "pill.take", characterId: "kara", targetId: "kara", pill: "Stuttering Tincture" }).effects[0]).toMatchObject({ pillKind: "healing", restored: 5 });
    gm({ type: "item.give", to: "kara", items: [{ name: "Stuttering Tincture", count: 1 }] });
    gm({ type: "hp.change", characterId: "kara", delta: -10 });
    expect(as(P1, { type: "pill.take", characterId: "kara", targetId: "kara", pill: "Stuttering Tincture" }).effects[0]).toMatchObject({ restored: 0, noEffect: "limit" });
    // Aether Pills count separately.
    gm({ type: "aether.change", characterId: "kara", delta: -6 });
    expect(as(P1, { type: "pill.take", characterId: "kara", targetId: "kara", pill: "Sparkstone Tablet" }).effects[0]).toMatchObject({ pillKind: "aether", restored: 6 });
    expect(rec.sheet("kara")!.pillsTaken).toEqual({ healing: 6, aether: 1 });
    // The first full hour of Consolidation starts the count over.
    gm({ type: "consolidation.rest", highDensity: false, rests: [{ characterId: "kara", hours: 1, interrupted: true }] });
    expect(rec.sheet("kara")!.pillsTaken).toEqual({ healing: 0, aether: 0 });
  });

  it("executes a Downed combatant for a Beat with no roll, and lets the GM rule a fate either way", () => {
    fight([npc, { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", creature: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1 }]);
    gm({ type: "combat.hp", combatantId: "thug", delta: -12 });
    expect(who("thug").downed).toEqual({ coherence: 3, stabilized: false });
    gm({ type: "combat.hp", combatantId: "rat", delta: -12 });
    expect(who("rat").dead).toBe(true);
    // The rat is left alive to be questioned.
    gm({ type: "combat.fate", combatantId: "rat", fate: "stabilized" });
    expect(who("rat")).toMatchObject({ dead: false, out: false, downed: { stabilized: true } });
    as(P1, { type: "combat.act", combatantId: "kara" });
    const out = as(P1, { type: "combat.execute", combatantId: "kara", targetId: "thug" });
    expect(out.effects).toEqual([{ kind: "combat-died", encounterId: "e1", combatantId: "thug", cause: "executed", byId: "kara", byCharacterId: "kara" }]);
    expect(who("kara").beats).toBe(1);
    expect(() => as(P1, { type: "combat.fate", combatantId: "rat", fate: "dead" })).toThrow(/only the GM/);
    gm({ type: "combat.fate", combatantId: "rat", fate: "dead" });
    expect(who("rat").dead).toBe(true);
  });

  it("makes lower-Grade characters save against Aura Pressure; failure Suppresses to 1 Beat until a fresh save succeeds", () => {
    const warden = { combatantId: "warden", sideId: "hostiles", name: "Warden", grade: "E", maxHp: 300, momentumForce: 20, beats: 2 };
    fight([warden], [60, 10]);
    // Kara (HRT 4) 50 + 4 = 54 against 90; Joe (HRT 5) 89 + 5 = 94.
    const out = rolled({ type: "combat.aura", entityId: "warden", flaring: false }, 50, 89);
    expect(out.effects.map((e) => e.kind === "combat-check" && [e.total, e.aura])).toEqual([
      [54, "suppressed"],
      [94, "steeled"],
    ]);
    expect(who("kara").beats).toBe(1);
    expect(() => rolled({ type: "combat.aura", entityId: "warden", flaring: false }, 50)).toThrow(/everyone below/);
    // Kara pushes back with a Principle Application: her one Beat, and the save again.
    as(P1, { type: "combat.act", combatantId: "kara" });
    const push = as(P1, { type: "combat.will", combatantId: "kara", reason: "principle" }, 30);
    expect(push.effects[0]).toMatchObject({ total: 34, success: false, aura: "suppressed" });
    expect(who("kara").beats).toBe(0);
    as(P1, { type: "combat.done", combatantId: "kara" });
    // Joe, steeled, shouts her through it.
    as(P2, { type: "combat.act", combatantId: "joe" });
    expect(() => as(P2, { type: "combat.will", combatantId: "kara", reason: "distracted" }, 90)).toThrow(/GM calls/);
    as(P2, { type: "combat.will", combatantId: "kara", reason: "intervention", helperId: "joe" }, 90);
    expect(who("kara").aura).toBe("steeled");
    as(P2, { type: "combat.done", combatantId: "joe" });
    // The Warden flares: a Beat on its turn, and a fresh save from everyone below it against 115.
    gm({ type: "combat.act", combatantId: "warden" });
    const flare = rolled({ type: "combat.aura", entityId: "warden", flaring: true, flare: true }, 90, 90);
    expect(flare.effects.map((e) => e.kind === "combat-check" && e.aura)).toEqual(["suppressed", "suppressed"]);
    expect(who("warden").beats).toBe(1);
    gm({ type: "combat.done", combatantId: "warden" });
    gm({ type: "combat.round" });
    expect([who("kara").beats, who("joe").beats]).toEqual([1, 1]);
    rolled({ type: "combat.will", combatantId: "joe", reason: "distracted" }, 95);
    // 95 + 5 = 100 against the flare's 115: still Suppressed.
    expect(who("joe").aura).toBe("suppressed");
    gm({ type: "combat.suppress", combatantId: "joe", suppressed: false });
    expect(who("joe").beats).toBe(2);
  });

  it("gives surprising combatants one Beat before Initial Momentum, and lets the defender Yield from their first turn", () => {
    fight([npc], []);
    expect(() => gm({ type: "combat.act", combatantId: "thug" })).toThrow(/roll Initial Momentum first/);
    gm({ type: "combat.surprise", combatantIds: ["thug"] });
    expect(() => gm({ type: "combat.act", combatantId: "kara" })).toThrow(/no Surprise Beat/);
    gm({ type: "combat.act", combatantId: "thug" });
    gm({ type: "combat.attack", attackerId: "thug", defenderId: "kara", attack: { force: 8, modifier: 0 } });
    // The thug 60 + 8 = 68; Kara 30 + 5 = 35: Margin 33, and she Yields a Beat from her first turn.
    as(P1, { type: "combat.defend", defense: { attribute: "DEX", modifier: 0 } }, 60, 30);
    expect(enc().clash!.result!.yieldCap).toBe(2);
    as(P1, { type: "combat.resolve", yield: 1 });
    expect(rec.sheet("kara")!.hp).toBe(1);
    expect(() => gm({ type: "combat.beat", combatantId: "thug", what: "Check" })).toThrow(/no Beats left/);
    rolled({ type: "combat.momentum" }, 60, 30);
    expect(enc().surprise).toBeNull();
    expect([who("kara").beats, who("joe").beats, who("thug").beats]).toEqual([1, 2, 2]);
  });
});

describe("the aftermath and the inventory", () => {
  const enc = () => rec.state.encounter!;
  const as = (actor: Draft["actor"], action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action, actor), () => dice.shift()!));
  const rat = (id: string, name: string) => ({ combatantId: id, sideId: "hostiles", name, creature: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1 });
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
    gm({
      type: "combat.start",
      encounterId: "e1",
      name: "Treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [{ combatantId: "kara", sideId: "party", characterId: "kara" }, { combatantId: "joe", sideId: "party", characterId: "joe" }, rat("r1", "Rat 1"), rat("r2", "Rat 2"), { combatantId: "boss", sideId: "hostiles", name: "Brood Mother", kind: "creature", grade: "F", maxHp: 40, momentumForce: 10, beats: 2 }],
    });
    as(GM, { type: "combat.momentum" }, 60, 30);
  });

  it("credits the finishing blow to the attacker whose hit killed", () => {
    gm({ type: "combat.act", combatantId: "kara" });
    gm({ type: "combat.attack", attackerId: "kara", defenderId: "r1", attack: { attribute: "STR", modifier: 0 } });
    const out = as(GM, { type: "combat.defend", defense: { force: 8, modifier: 0 } }, 90, 10);
    expect(out.effects).toContainEqual({ kind: "combat-died", encounterId: "e1", combatantId: "r1", cause: "fell", byId: "kara", byCharacterId: "kara" });
  });

  it("rolls loot once per kill, a boss one row higher, and settles VE, kills, and spoils as one action", () => {
    gm({ type: "combat.hp", combatantId: "r1", delta: -12 });
    gm({ type: "combat.hp", combatantId: "r2", delta: -12 });
    gm({ type: "combat.hp", combatantId: "boss", delta: -40 });
    expect(() => gm({ type: "encounter.settle", encounterId: "e1", participants: [], kills: [], awards: [], spoils: [] })).toThrow(/still running/);
    gm({ type: "combat.end" });
    // Rats are Trivial: nothing to roll. The Brood Mother, Moderate and a boss, reads Hard: 25% for a shard or equipment.
    const loot = as(GM, { type: "encounter.loot", encounterId: "e1", kills: [{ combatantId: "r1", tier: "Trivial" }, { combatantId: "boss", tier: "Moderate", boss: true }] }, 20);
    expect(loot.effects[0]).toMatchObject({
      kind: "loot",
      results: [
        { combatantId: "r1", row: "Trivial", die: null },
        { combatantId: "boss", row: "Hard", die: 20, drop: "One consumable, plus a skill shard or equipment" },
      ],
    });
    expect(() => as(GM, { type: "encounter.loot", encounterId: "e1", kills: [{ combatantId: "r2", tier: "Trivial" }] })).toThrow(/loot is rolled/);

    const kills = [
      { combatantId: "r1", tier: "Trivial", byId: "kara" },
      { combatantId: "r2", tier: "Trivial" },
      // The Brood Mother was Hard for Joe.
      { combatantId: "boss", tier: "Moderate", boss: true, byId: "joe", tiers: { joe: "Hard" } },
    ];
    const awards = encounterAwards(engine, enc(), [{ characterId: "kara", grade: "F" }, { characterId: "joe", grade: "F" }], kills);
    // Kara: 2 + 2 + 15 (10 × 1.5); Joe: 2 + 2 + 30.
    expect(awards).toEqual([
      { characterId: "kara", ve: 19 },
      { characterId: "joe", ve: 34 },
    ]);
    const out = gm({ type: "encounter.settle", encounterId: "e1", participants: ["kara", "joe"], kills, awards, spoils: [{ name: "Lesser Healing Pill", count: 2 }, { name: "Edge Shard", count: 1 }] });
    expect(out.effects.filter((e) => e.kind === "kill-confirmed")).toHaveLength(6);
    expect(out.effects).toContainEqual({ kind: "kill-confirmed", characterId: "joe", encounterId: "e1", victimId: "boss", victimGrade: "F", tier: "Hard" });
    expect(rec.sheet("kara")!.storedVe).toBe(19);
    expect(rec.sheet("joe")!.storedVe).toBe(34);
    expect(rec.state.inventory.get("spoils")).toEqual([
      { name: "Lesser Healing Pill", count: 2 },
      { name: "Edge Shard", count: 1 },
    ]);
    expect(enc()).toMatchObject({ settled: true });
    expect(() => gm({ type: "encounter.settle", encounterId: "e1", participants: [], kills: [], awards: [], spoils: [] })).toThrow(/already settled/);
  });

  it("refuses a kill that did not die and a participant who was not there", () => {
    gm({ type: "character.pregen", characterId: "andre", pregen: "Andre" });
    gm({ type: "combat.end" });
    expect(() => gm({ type: "encounter.settle", encounterId: "e1", participants: ["kara"], kills: [{ combatantId: "r1", tier: "Trivial" }], awards: [], spoils: [] })).toThrow(/did not die/);
    expect(() => gm({ type: "encounter.settle", encounterId: "e1", participants: ["andre"], kills: [], awards: [], spoils: [] })).toThrow(/Andre was not in Treeline/);
  });

  it("lets players claim from the spoils for their own character and hand their own items on", () => {
    gm({ type: "combat.end" });
    gm({ type: "encounter.settle", encounterId: "e1", participants: ["kara", "joe"], kills: [], awards: [], spoils: [{ name: "Lesser Healing Pill", count: 2 }] });
    expect(() => as(P1, { type: "item.move", from: "spoils", to: "joe", name: "Lesser Healing Pill", count: 1 })).toThrow(/claims from the spoils for them/);
    const got = as(P1, { type: "item.move", from: "spoils", to: "kara", name: "lesser healing pill", count: 2 });
    expect(got.effects).toEqual([{ kind: "item-received", characterId: "kara", name: "Lesser Healing Pill", count: 2 }]);
    as(P1, { type: "item.move", from: "kara", to: "joe", name: "Lesser Healing Pill", count: 1 });
    expect(() => as(P1, { type: "item.move", from: "joe", to: "kara", name: "Lesser Healing Pill", count: 1 })).toThrow(/their own character's items/);
    expect(() => as(P2, { type: "item.remove", from: "joe", name: "Lesser Healing Pill", count: 2 })).toThrow(/Joe holds 1/);
    as(P2, { type: "item.remove", from: "joe", name: "Lesser Healing Pill", count: 1, note: "used" });
    expect(() => as(P1, { type: "item.give", to: "kara", items: [{ name: "Shield", count: 1 }] })).toThrow(/only the GM grants/);
    expect([rec.state.inventory.get("kara"), rec.state.inventory.get("joe"), rec.state.inventory.get("spoils")]).toEqual([[{ name: "Lesser Healing Pill", count: 1 }], [], []]);
  });
});

describe("Proficiencies and Marks", () => {
  const enc = () => rec.state.encounter!;
  const as = (actor: Draft["actor"], action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action, actor), () => dice.shift()!));
  const prof = (id: string, shape: string) => rec.sheet(id)!.proficiencies.find((p) => p.shape === shape);
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
  });

  it("starts with none; an exploding Clash with a weapon shape earns the first Mark and Trained", () => {
    expect(rec.sheet("kara")!.proficiencies).toEqual([]);
    gm({
      type: "combat.start",
      encounterId: "e1",
      name: "Treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [{ combatantId: "kara", sideId: "party", characterId: "kara" }, { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", grade: "F", maxHp: 400, momentumForce: 1, beats: 1 }],
    });
    as(GM, { type: "combat.momentum" }, 60, 30);
    as(P1, { type: "combat.act", combatantId: "kara" });
    as(P1, { type: "combat.attack", attackerId: "kara", defenderId: "rat", attack: { attribute: "STR", modifier: 0, shape: "axes and hammers" } });
    // Kara 97 + 20 (explodes) + STR 8 = 125, and the Mark is hers: the first grants Trained.
    const out = as(GM, { type: "combat.defend", defense: { force: 8, modifier: 0 } }, 97, 20, 10);
    expect(out.effects).toContainEqual({ kind: "mark", characterId: "kara", shape: "axes and hammers", marks: 1, tier: "Trained", advanced: true, nextAt: 3 });
    expect(prof("kara", "axes and hammers")).toEqual({ shape: "axes and hammers", marks: 1, tier: "Trained", bonus: 5 });
    // The next swing with an axe adds +5; a creature's training is in its Force.
    as(P1, { type: "combat.done", combatantId: "kara" });
    gm({ type: "combat.act", combatantId: "rat" });
    expect(() => gm({ type: "combat.attack", attackerId: "rat", defenderId: "kara", attack: { force: 6, modifier: 0, shape: "blades" } })).toThrow(/training is in its Force/);
    gm({ type: "combat.done", combatantId: "rat" });
    gm({ type: "combat.round" });
    as(P1, { type: "combat.act", combatantId: "kara" });
    as(P1, { type: "combat.attack", attackerId: "kara", defenderId: "rat", attack: { attribute: "STR", modifier: 0, shape: "axes and hammers" } });
    as(GM, { type: "combat.defend", defense: { force: 8, modifier: 0 } }, 50, 50);
    expect(enc().clash?.result?.attackTotal ?? enc().lastClash!.attackTotal).toBe(63);
  });

  it("makes Seasoned at 3 Marks and banks Marks past 10 in an F-Grade body", () => {
    const roll = () => as(P1, { type: "dice.roll", roller: { kind: "character", characterId: "kara", attribute: "DEX" }, rollKind: "clash", modifier: 0, shape: "blades" }, 99, 1);
    roll();
    expect(roll().effects[1]).toMatchObject({ kind: "mark", marks: 2, tier: "Trained", nextAt: 3 });
    const third = roll();
    expect(third.effects[1]).toEqual({ kind: "mark", characterId: "kara", shape: "blades", marks: 3, tier: "Seasoned", advanced: true, nextAt: 10 });
    for (let i = 0; i < 8; i++) roll();
    expect(prof("kara", "blades")).toEqual({ shape: "blades", marks: 11, tier: "Seasoned", bonus: 10 });
    // A roll that does not explode earns nothing; the bonus is in the total.
    const plain = as(P1, { type: "dice.roll", roller: { kind: "character", characterId: "kara", attribute: "DEX" }, rollKind: "clash", modifier: 0, shape: "blades" }, 40);
    expect(plain.effects).toEqual([expect.objectContaining({ kind: "rolled", total: 55, proficiency: 10 })]);
  });

  it("lets the GM record a Mark by hand, and nobody else", () => {
    expect(() => as(P1, { type: "proficiency.mark", characterId: "kara", shape: "firearms" })).toThrow(/only the GM/);
    expect(() => gm({ type: "proficiency.mark", characterId: "kara", shape: "lasers" })).toThrow(/not a weapon shape/);
    gm({ type: "proficiency.mark", characterId: "kara", shape: "firearms" });
    expect(prof("kara", "firearms")).toMatchObject({ marks: 1, tier: "Trained" });
  });
});

describe("titles and achievement counts", () => {
  const as = (actor: Draft["actor"], action: Action, ...dice: number[]) => rec.append(rollFor(rec, draft(action, actor), () => dice.shift()!));
  const titles = (id: string) => rec.sheet(id)!.titles;
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
  });

  it("grants a catalog title with its flat bonus once, and refuses holding it twice", () => {
    const out = gm({ type: "title.grant", characterId: "kara", title: { catalog: "Ten-Slayer" } });
    expect(out.effects).toEqual([expect.objectContaining({ kind: "title-conferred", characterId: "kara", name: "Ten-Slayer", negative: false })]);
    expect(rec.sheet("kara")!.raw.STR).toBe(9);
    expect(titles("kara")[0]).toMatchObject({ name: "Ten-Slayer", category: "Achievement", bonus: { STR: 1 }, status: "active" });
    expect(() => gm({ type: "title.grant", characterId: "kara", title: { catalog: "ten-slayer" } })).toThrow(/holds Ten-Slayer already/);
  });

  it("lets the player choose the stat for a player's-choice bonus", () => {
    const t = gm({ type: "title.grant", characterId: "kara", title: { catalog: "Week One" } });
    const id = (t.effects[0] as { titleId: string }).titleId;
    expect(titles("kara")[0]).toMatchObject({ choice: 1, bonus: {} });
    expect(() => as(P2, { type: "title.choose", characterId: "kara", titleId: id, attribute: "DEX" })).toThrow(/not this player's character/);
    as(P1, { type: "title.choose", characterId: "kara", titleId: id, attribute: "DEX" });
    expect(rec.sheet("kara")!.raw.DEX).toBe(6);
    expect(() => as(P1, { type: "title.choose", characterId: "kara", titleId: id, attribute: "STR" })).toThrow(/no stat left/);
  });

  it("Echoes an HVE-Resonant title on the same axis pair, keeping its flat bonus", () => {
    gm({ type: "title.grant", characterId: "kara", title: { name: "The Hungering Edge", category: "HVE-Resonant", axisPair: "Hunger + Force", bonus: { STR: 3, DEX: 2 }, effect: "Once per encounter, when you reduce a foe to 0 HP, gain 1 Beat next turn." } });
    const out = gm({ type: "title.grant", characterId: "kara", title: { name: "The Devouring Edge", category: "HVE-Resonant", axisPair: "Force + Hunger", bonus: { STR: 2 } } });
    expect(out.effects.map((e) => e.kind)).toEqual(["title-conferred", "title-echoed"]);
    expect(titles("kara").map((t) => [t.name, t.status, t.axisPair])).toEqual([
      ["The Hungering Edge", "echoed", "Force + Hunger"],
      ["The Devouring Edge", "active", "Force + Hunger"],
    ]);
    expect(rec.sheet("kara")!.raw.STR).toBe(8 + 3 + 2);
    expect(() => gm({ type: "title.grant", characterId: "kara", title: { name: "Bad", category: "HVE-Resonant", axisPair: "Force + Method" } })).toThrow(/one pole from each of two axes/);
  });

  it("holds a negative title's penalty until release, and converts it on release", () => {
    const t = gm({ type: "title.grant", characterId: "kara", title: { catalog: "Salvaged" } });
    const id = (t.effects[0] as { titleId: string }).titleId;
    expect(titles("kara")[0]).toMatchObject({ category: "Bestowed", negative: true, bonus: { HRT: -2 }, worn: true, release: "last out of a collapsing, closing, or pursued situation, under their own power" });
    expect(rec.sheet("kara")!.raw.HRT).toBe(2);
    expect(() => as(P1, { type: "title.wear", characterId: "kara", titleId: id, worn: false })).toThrow(/cannot be hidden/);
    const out = gm({ type: "title.release", characterId: "kara", titleId: id, replacement: { catalog: "Came Back Whole" } });
    expect(out.effects.map((e) => e.kind)).toEqual(["title-released", "title-conferred"]);
    expect(rec.sheet("kara")!.raw.HRT).toBe(5);
  });

  it("lets the holder wear or hide a Bestowed title and reveal a Hidden Achievement once", () => {
    const b = gm({ type: "title.grant", characterId: "kara", title: { name: "Hand of the Iron Court", category: "Bestowed", effect: "+5 to social Clashes invoking lawful authority." } });
    const h = gm({ type: "title.grant", characterId: "kara", title: { name: "Cornerless", category: "Hidden Achievement", effect: "At a quarter of Max HP or less, +5 STR and +5 DEX." } });
    as(P1, { type: "title.wear", characterId: "kara", titleId: (b.effects[0] as { titleId: string }).titleId, worn: false });
    as(P1, { type: "title.reveal", characterId: "kara", titleId: (h.effects[0] as { titleId: string }).titleId });
    expect(titles("kara").map((t) => [t.worn, t.revealed])).toEqual([
      [false, undefined],
      [undefined, true],
    ]);
    expect(() => as(P1, { type: "title.reveal", characterId: "kara", titleId: (h.effects[0] as { titleId: string }).titleId })).toThrow(/revealed already/);
    expect(() => as(P1, { type: "title.grant", characterId: "kara", title: { catalog: "Ten-Slayer" } })).toThrow(/only the GM/);
  });

  it("loses points past the stat cap", () => {
    gm({ type: "character.create", characterId: "max", name: "Max", background: "x", stats: { STR: 10, DEX: 5, FOR: 5, HRT: 5, POW: 5, PER: 5, CHA: 5 } });
    const cap = engine.statCap("F");
    gm({ type: "title.grant", characterId: "max", title: { name: "Huge", category: "Bestowed", bonus: { STR: cap } } });
    expect(rec.sheet("max")!.raw.STR).toBe(cap);
    expect(titles("max")[0]).toMatchObject({ bonus: { STR: cap - 10 }, lost: { STR: 10 } });
  });

  it("counts Consolidations and GM ticks, and puts a catalog title on the due list without granting it", () => {
    for (let i = 0; i < 20; i++) gm({ type: "consolidation.rest", highDensity: false, rests: [{ characterId: "kara", hours: 1, interrupted: true }] });
    expect(rec.sheet("kara")!.counters.consolidations).toBe(20);
    expect(rec.sheet("kara")!.titlesDue).toEqual(["Deep Breather"]);
    expect(() => gm({ type: "counter.tick", characterId: "kara", counter: "consolidations", count: 1 })).toThrow(/counts that itself/);
    gm({ type: "counter.tick", characterId: "kara", counter: "locks-picked", count: 5 });
    expect(rec.sheet("kara")!.titlesDue).toEqual(["Lockbreaker", "Deep Breather"]);
    gm({ type: "title.dismiss", characterId: "kara", catalog: "Lockbreaker" });
    gm({ type: "title.grant", characterId: "kara", title: { catalog: "Deep Breather" } });
    expect(rec.sheet("kara")!.titlesDue).toEqual([]);
  });

  it("counts confirmed kills from the aftermath's finishing blows, and the fights a character ends below half HP", () => {
    const rat = (id: string, name: string) => ({ combatantId: id, sideId: "hostiles", name, creature: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1 });
    gm({
      type: "combat.start",
      encounterId: "e1",
      name: "Nest",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [{ combatantId: "kara", sideId: "party", characterId: "kara" }, rat("r1", "Rat 1"), rat("r2", "Rat 2"), rat("r3", "Rat 3")],
    });
    as(GM, { type: "combat.momentum" }, 60, 30);
    as(P1, { type: "combat.act", combatantId: "kara" });
    as(P1, { type: "combat.attack", attackerId: "kara", defenderId: "r1", attack: { attribute: "STR", modifier: 0 } });
    as(GM, { type: "combat.defend", defense: { force: 8, modifier: 0 } }, 90, 10);
    for (const r of ["r2", "r3"]) gm({ type: "combat.hp", combatantId: r, delta: -12 });
    gm({ type: "combat.hp", combatantId: "kara", delta: -8 });
    gm({ type: "combat.end" });
    gm({
      type: "encounter.settle",
      encounterId: "e1",
      participants: ["kara"],
      kills: [
        { combatantId: "r1", tier: "Trivial", byId: "kara" },
        { combatantId: "r2", tier: "Trivial", byId: "kara" },
        { combatantId: "r3", tier: "Severe", byId: "kara" },
      ],
      awards: [],
      spoils: [],
    });
    expect(rec.sheet("kara")!.counters).toMatchObject({ "confirmed-kills": 3, "most-kills-in-a-fight": 3, "severe-or-peak-kills": 1, "fights-ended-below-half": 1, "first-blood": 1 });
    expect(rec.sheet("kara")!.titlesDue).toEqual(["Pack-Breaker", "Giant-Feller"]);
  });
});

describe("System Quests", () => {
  const as = (actor: Draft["actor"], action: Action) => rec.append(draft(action, actor));
  const q181 = { id: "Q-181", category: "Routine", title: "Glow-Mote Cluster Containment", difficulty: "Trivial", objective: "Eliminate Glow-Mote swarms reported near the eastern perimeter.", count: 3, items: [{ name: "Stuttering Tincture", count: 1 }] } as const;
  const P3 = { role: "player", userId: "player-3" } as const;
  beforeEach(() => {
    gm({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: "player-1" });
    gm({ type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: "player-2" });
    gm({ type: "character.pregen", characterId: "andre", pregen: "Andre", playerId: "player-3" });
  });
  const party = (...ids: string[]) => {
    for (const id of ids.slice(1)) {
      as({ role: "player", userId: rec.character(ids[0]!)!.playerId! }, { type: "party.invite", fromId: ids[0]!, toId: id });
      const inv = rec.state.invites.find((i) => i.toId === id)!;
      as({ role: "player", userId: rec.character(id)!.playerId! }, { type: "party.answer", inviteId: inv.id, accept: true });
    }
  };
  const q = (id: string) => rec.state.quests.get(id)!;

  it("offers a Routine quest with the table's VE, and the player accepts it on their own screen", () => {
    const out = gm({ type: "quest.issue", quest: { ...q181, items: [...q181.items] }, to: ["kara"] });
    expect(out.effects).toEqual([{ kind: "quest-offered", characterId: "kara", questId: "Q-181", line: "[Q-181] Glow-Mote Cluster Containment" }]);
    expect(q("Q-181")).toMatchObject({ status: "offered", issuer: "System", grade: "F", ve: 3, count: { done: 0, of: 3 } });
    expect(() => as(P2, { type: "quest.answer", questId: "Q-181", characterId: "kara", accept: true })).toThrow(/their own character/);
    as(P1, { type: "quest.answer", questId: "Q-181", characterId: "kara", accept: true });
    expect(q("Q-181").status).toBe("active");
  });

  it("multiplies a shared count by the holders at that moment; a leaver keeps nothing and a joiner takes the current count", () => {
    party("kara", "joe", "andre");
    gm({ type: "quest.issue", quest: { ...q181, items: [...q181.items] }, to: ["kara"] });
    as(P1, { type: "quest.answer", questId: "Q-181", characterId: "kara", accept: true });
    const out = as(P1, { type: "quest.share", questId: "Q-181", characterId: "kara" });
    expect(out.effects).toHaveLength(3);
    expect(q("Q-181")).toMatchObject({ holders: ["kara", "joe", "andre"], count: { done: 0, of: 9 } });
    gm({ type: "quest.progress", questId: "Q-181", by: 2 });
    as(P3, { type: "party.leave", characterId: "andre" });
    expect(q("Q-181").holders).toEqual(["kara", "joe"]);
    party("kara", "andre");
    expect(q("Q-181")).toMatchObject({ holders: ["kara", "joe", "andre"], count: { done: 2, of: 9 } });
    expect(() => as(P3, { type: "quest.share", questId: "Q-181", characterId: "andre" })).toThrow(/shared already/);
    // When the party ends, the quest stays with whoever still holds it, no longer shared.
    as(P3, { type: "party.leave", characterId: "andre" });
    as(P2, { type: "party.leave", characterId: "joe" });
    expect(q("Q-181")).toMatchObject({ holders: ["kara"], count: { done: 2, of: 9 } });
    expect(q("Q-181").sharedIn).toBeUndefined();
  });

  it("pays every participating holder on completion and sends the items to the spoils or a holder", () => {
    party("kara", "joe");
    gm({ type: "quest.issue", quest: { ...q181, items: [...q181.items] }, to: ["kara"] });
    as(P1, { type: "quest.answer", questId: "Q-181", characterId: "kara", accept: true });
    as(P1, { type: "quest.share", questId: "Q-181", characterId: "kara" });
    const out = gm({ type: "quest.complete", questId: "Q-181", awards: [{ characterId: "kara", ve: 3 }, { characterId: "joe", ve: 3 }], itemsTo: "joe" });
    expect(out.effects.filter((e) => e.kind === "quest-completed")).toHaveLength(2);
    expect([rec.sheet("kara")!.storedVe, rec.sheet("joe")!.storedVe]).toEqual([3, 3]);
    expect(rec.state.inventory.get("joe")).toEqual([{ name: "Stuttering Tincture", count: 1 }]);
    expect(() => gm({ type: "quest.complete", questId: "Q-181", awards: [] })).toThrow(/not active/);
  });

  it("binds a Mandate at once, refuses sharing it, and lets one character refuse it", () => {
    gm({ type: "quest.issue", quest: { id: "M-04", category: "Mandate", title: "Report to Sector 7", difficulty: "Hard", objective: "Report to coordinates [4.7, -12.1] within 72 hours.", time: "72 hours" }, to: ["kara", "joe"] });
    expect(q("M-04")).toMatchObject({ status: "active", ve: 125, holders: ["kara", "joe"] });
    expect(() => as(P1, { type: "quest.share", questId: "M-04", characterId: "kara" })).toThrow(/cannot be shared/);
    expect(() => as(P1, { type: "quest.answer", questId: "M-04", characterId: "kara", accept: true })).toThrow(/binds already/);
    as(P2, { type: "quest.answer", questId: "M-04", characterId: "joe", accept: false });
    expect(q("M-04")).toMatchObject({ status: "active", holders: ["kara"], refusedBy: ["joe"] });
  });

  it("counts refused Personal Opportunities by flavor", () => {
    for (let i = 1; i <= 3; i++) {
      gm({ type: "quest.issue", quest: { id: `PO-${i}`, category: "Personal Opportunity", title: "Hostile detected", difficulty: "Moderate", objective: "Eliminate within 6 hours.", flavor: "combat", scaled: true }, to: ["kara"] });
      as(P1, { type: "quest.answer", questId: `PO-${i}`, characterId: "kara", accept: false });
    }
    expect(rec.character("kara")!.refusals).toEqual({ combat: 3 });
    expect(q("PO-1")).toMatchObject({ status: "refused", ve: null });
  });

  it("shows a hidden quest's holder only what its mode allows, down to the notices", () => {
    const out = gm({ type: "quest.issue", quest: { id: "Q-HID-014", category: "Hidden", title: "Let It Finish", difficulty: "Hard", objective: "Spare a surrendered foe three times.", hidden: "obscured" }, to: ["kara"] });
    expect(out.effects).toEqual([{ kind: "quest-issued", characterId: "kara", questId: "Q-???", line: "[Q-???] Hidden Objective: ???" }]);
    expect(questForHolder(q("Q-HID-014"))).toMatchObject({ id: "Q-???", objective: "", ve: null });
    gm({ type: "quest.reveal", questId: "Q-HID-014", name: "Let It Finish" });
    expect(questForHolder(q("Q-HID-014"))).toMatchObject({ title: 'Hidden Objective: "Let It Finish"', objective: "Conditions: Unclear." });
    const done = gm({ type: "quest.complete", questId: "Q-HID-014", awards: [{ characterId: "kara", ve: 60 }] });
    expect(done.effects[0]).toMatchObject({ kind: "quest-completed", questId: "Q-HID-014", line: "[Q-HID-014] Let It Finish" });
    // A post-completion quest is silent until it is complete.
    expect(gm({ type: "quest.issue", quest: { id: "Q-HID-015", category: "Hidden", title: "Stayed", difficulty: "Easy", objective: "x", hidden: "post-completion" }, to: ["kara"] }).effects).toEqual([]);
    expect(questForHolder(q("Q-HID-015"))).toBeNull();
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
