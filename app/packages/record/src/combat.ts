/**
 * The combat tracker's record (Core Mechanics, "Combat"): one fight at a time, its sides and
 * combatants, the Momentum Roll and Seize Momentum, the Decisive Tactical Reversal, rounds in
 * which each side takes its turn and each combatant spends their Beats before the next acts,
 * and HP. Characters in a fight are the record's characters, so their HP is their sheet's;
 * creatures and NPCs carry their own numbers, entered when they join.
 *
 * Momentum dice are rolled on the server (`rollCombatDice`) and recorded in the action.
 * A tie rolls again: on Initial Momentum as the book says, and on Seize Momentum because
 * Seize is a Momentum Roll too.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Envelope } from "./actions.ts";
import type { D100 } from "./dice.ts";
import { rollD100s } from "./dice.ts";
import { type CharacterState, type Effect, Rejected, type World, maxHpOf, rawStats } from "./fold.ts";

// --------------------------------------------------------------- actions ---

/** Who joins a fight: a character in the record, or a creature or NPC with its own numbers. */
export interface CombatantSpec {
  combatantId: string;
  sideId: string;
  characterId?: string;
  /** For a creature or NPC. */
  name?: string;
  /** The Bestiary entry it came from, if any. */
  creature?: string;
  grade?: string;
  maxHp?: number;
  /** The higher of its HRT and PER Force. */
  momentumForce?: number;
  /** Beats per turn; the book's default when absent. */
  beats?: number;
}

export interface StartCombat {
  type: "combat.start";
  encounterId: string;
  name: string;
  sides: { id: string; name: string }[];
  combatants: CombatantSpec[];
}

export interface AddCombatant {
  type: "combat.add";
  combatant: CombatantSpec;
}

export interface RemoveCombatant {
  type: "combat.remove";
  combatantId: string;
  note?: string;
}

/** Every Momentum die cast, in order, with the Force it added: the table's record of the rolls. */
export interface MomentumRollRecord {
  combatantId: string;
  natural: number[];
  force: number;
  total: number;
  label: "Momentum" | "Seize Momentum" | "Momentum answer";
}

/** One side's roll in a Momentum attempt: its roller and the dice. */
export interface MomentumDie {
  sideId: string;
  combatantId: string;
  natural: number[];
}

/**
 * Initial Momentum. Each side's roller is its combatant with the highest HRT or PER Force.
 * `attempts` holds every attempt in order: each but the last tied and was rolled again.
 */
export interface RollMomentum {
  type: "combat.momentum";
  attempts?: MomentumDie[][];
}

/** Seize Momentum: one Beat, the seizer's Momentum Roll against the holding side's best. */
export interface SeizeMomentum {
  type: "combat.seize";
  combatantId: string;
  attempts?: { seizer: number[]; holder: number[]; holderCombatantId: string }[];
}

/** A Decisive Tactical Reversal: Momentum shifts to this side at the start of the next round. */
export interface Reversal {
  type: "combat.reversal";
  sideId: string;
  note?: string;
}

/** A combatant on the acting side takes their activation; whoever was acting finishes. */
export interface Act {
  type: "combat.act";
  combatantId: string;
}

/** The acting combatant spends a Beat. `what` names it: an attack, a move, a check. */
export interface SpendBeat {
  type: "combat.beat";
  combatantId: string;
  what: string;
}

/** The acting combatant finishes; Beats left unspent are gone. */
export interface Done {
  type: "combat.done";
  combatantId: string;
}

/** The next round: any pending Momentum shift lands and every combatant's Beats return. */
export interface NextRound {
  type: "combat.round";
}

/** Damage (negative) or healing (positive) to a combatant. */
export interface CombatHp {
  type: "combat.hp";
  combatantId: string;
  delta: number;
}

export interface EndCombat {
  type: "combat.end";
}

export type CombatAction =
  | StartCombat
  | AddCombatant
  | RemoveCombatant
  | RollMomentum
  | SeizeMomentum
  | Reversal
  | Act
  | SpendBeat
  | Done
  | NextRound
  | CombatHp
  | EndCombat;

// ----------------------------------------------------------------- state ---

export interface Combatant {
  id: string;
  sideId: string;
  name: string;
  grade: string;
  characterId?: string;
  creature?: string;
  /** A creature's own HP; a character's lives on their sheet. */
  hp?: number;
  maxHp?: number;
  /** A creature's entered value; a character's is read from the sheet when it rolls. */
  momentumForce?: number;
  beatsPerTurn: number;
  beats: number;
  acted: boolean;
  /** Out of the fight: fled, dead, or otherwise gone. */
  out: boolean;
  /** Each Beat spent this round, by name. */
  spent: string[];
}

export interface Encounter {
  id: string;
  name: string;
  sides: { id: string; name: string }[];
  combatants: Combatant[];
  /** 0 until Initial Momentum is rolled. */
  round: number;
  /** Sides in turn order for this round; the first holds Momentum. */
  order: string[];
  /** Index into `order` of the side taking its turn; `order.length` when every side has acted. */
  turn: number;
  acting: string | null;
  /** A shift waiting for the start of the next round. */
  pending: { sideId: string; by: "seize" | "reversal" } | null;
  ended: boolean;
}

export function cloneEncounter(e: Encounter): Encounter {
  return {
    ...e,
    sides: e.sides.map((s) => ({ ...s })),
    combatants: e.combatants.map((c) => ({ ...c, spent: [...c.spent] })),
    order: [...e.order],
    pending: e.pending && { ...e.pending },
  };
}

// --------------------------------------------------------------- helpers ---

function fight(world: World): Encounter {
  const e = world.encounter;
  if (!e || e.ended) throw new Rejected("no fight is running");
  return e;
}

function combatant(e: Encounter, id: string): Combatant {
  const c = e.combatants.find((x) => x.id === id);
  if (!c) throw new Rejected(`no combatant ${id} in this fight`);
  return c;
}

const active = (e: Encounter) => e.combatants.filter((c) => !c.out);

/** The higher of HRT and PER Force: a character's from the sheet, a creature's as entered. */
export function momentumForceOf(engine: Engine, world: World, c: Combatant): number {
  if (c.characterId) {
    const ch = world.characters.get(c.characterId);
    if (!ch) return 0;
    const raw = rawStats(ch);
    return engine.momentumValue(engine.force(raw.HRT!, ch.grade), engine.force(raw.PER!, ch.grade));
  }
  return c.momentumForce ?? 0;
}

/** A side's Momentum roller: its active combatant with the highest value (the first listed on a tie). */
export function momentumRoller(engine: Engine, world: World, e: Encounter, sideId: string): Combatant | undefined {
  let best: Combatant | undefined;
  for (const c of active(e).filter((x) => x.sideId === sideId)) {
    if (!best || momentumForceOf(engine, world, c) > momentumForceOf(engine, world, best)) best = c;
  }
  return best;
}

/** Sides with anyone still in the fight, in the order the fight lists them. */
const liveSides = (e: Encounter) => e.sides.filter((s) => active(e).some((c) => c.sideId === s.id)).map((s) => s.id);

function checkCascade(engine: Engine, grade: string, dice: number[]) {
  if (!dice.length) throw new Rejected("the dice were not rolled");
  const t = engine.volatilityThreshold(grade);
  dice.forEach((d, i) => {
    if (!Number.isInteger(d) || d < 1 || d > 100) throw new Rejected(`a d100 reads 1 to 100, not ${d}`);
    if (i < dice.length - 1 && d < t) throw new Rejected(`${d} is under the threshold ${t}, so it did not explode`);
  });
  if (dice[dice.length - 1]! >= t) throw new Rejected("the last die explodes: roll another");
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function hpOf(engine: Engine, world: World, c: Combatant): { hp: number; maxHp: number } {
  if (c.characterId) {
    const ch = world.characters.get(c.characterId)!;
    return { hp: ch.hp, maxHp: maxHpOf(engine, ch) };
  }
  return { hp: c.hp ?? 0, maxHp: c.maxHp ?? 0 };
}

// -------------------------------------------------------------- handlers ---

function build(engine: Engine, world: World, e: Encounter, s: CombatantSpec): Combatant {
  if (!s.combatantId.trim()) throw new Rejected("a combatant needs an id");
  if (e.combatants.some((c) => c.id === s.combatantId)) throw new Rejected(`${s.combatantId} is already in the fight`);
  if (!e.sides.some((x) => x.id === s.sideId)) throw new Rejected(`no side ${s.sideId}`);
  const beats = s.beats ?? engine.rules.combat.beats_per_turn;
  if (!Number.isInteger(beats) || beats < 0) throw new Rejected("Beats per turn is a whole number");
  let c: Combatant;
  if (s.characterId) {
    const ch: CharacterState | undefined = world.characters.get(s.characterId);
    if (!ch) throw new Rejected(`no character ${s.characterId}`);
    if (e.combatants.some((x) => x.characterId === ch.id && !x.out)) throw new Rejected(`${ch.name} is already in the fight`);
    c = { id: s.combatantId, sideId: s.sideId, name: ch.name, grade: ch.grade, characterId: ch.id, beatsPerTurn: beats, beats: 0, acted: false, out: false, spent: [] };
  } else {
    const name = s.name?.trim();
    if (!name) throw new Rejected("a creature or NPC needs a name");
    const grade = s.grade ?? "F";
    try {
      engine.grade(grade);
    } catch {
      throw new Rejected(`no Grade ${grade}`);
    }
    const maxHp = s.maxHp ?? 0;
    if (!Number.isInteger(maxHp) || maxHp < 1) throw new Rejected(`${name} needs its HP`);
    const mf = s.momentumForce ?? 0;
    if (!Number.isInteger(mf) || mf < 0) throw new Rejected("Momentum Force is a whole number");
    c = { id: s.combatantId, sideId: s.sideId, name, grade, hp: maxHp, maxHp, momentumForce: mf, beatsPerTurn: beats, beats: 0, acted: false, out: false, spent: [] };
    if (s.creature) c.creature = s.creature;
  }
  // Joining mid-round: Beats now, to act if their side has not finished its turn.
  if (e.round > 0) c.beats = c.beatsPerTurn;
  return c;
}

function start(engine: Engine, world: World, a: StartCombat): Effect[] {
  if (world.encounter && !world.encounter.ended) throw new Rejected(`${world.encounter.name} is still running; end it first`);
  if (a.sides.length < 2) throw new Rejected("a fight has at least two sides");
  if (new Set(a.sides.map((s) => s.id)).size !== a.sides.length) throw new Rejected("two sides share an id");
  const e: Encounter = {
    id: a.encounterId,
    name: a.name.trim() || "Fight",
    sides: a.sides.map((s) => ({ id: s.id, name: s.name.trim() || s.id })),
    combatants: [],
    round: 0,
    order: [],
    turn: 0,
    acting: null,
    pending: null,
    ended: false,
  };
  for (const s of a.combatants) e.combatants.push(build(engine, world, e, s));
  world.encounter = e;
  return [{ kind: "combat-started", encounterId: e.id }];
}

function add(engine: Engine, world: World, a: AddCombatant): Effect[] {
  const e = fight(world);
  e.combatants.push(build(engine, world, e, a.combatant));
  return [];
}

function remove(world: World, a: RemoveCombatant): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (c.out) throw new Rejected(`${c.name} is already out of the fight`);
  c.out = true;
  if (e.acting === c.id) e.acting = null;
  advance(e);
  return [];
}

function momentum(engine: Engine, world: World, a: RollMomentum): Effect[] {
  const e = fight(world);
  if (e.round > 0) throw new Rejected("Initial Momentum is already rolled; a shift comes from Seize or a Reversal");
  const sides = liveSides(e);
  if (sides.length < 2) throw new Rejected("Momentum needs two sides with someone in the fight");
  const attempts = a.attempts;
  if (!attempts?.length) throw new Rejected("the dice were not rolled");
  let totals: { sideId: string; total: number }[] = [];
  const rolls: MomentumRollRecord[] = [];
  attempts.forEach((attempt, i) => {
    if (attempt.length !== sides.length || !sides.every((s) => attempt.some((d) => d.sideId === s)))
      throw new Rejected("each side with someone in the fight rolls once per attempt");
    totals = attempt.map((d) => {
      const roller = momentumRoller(engine, world, e, d.sideId)!;
      const c = combatant(e, d.combatantId);
      if (c.sideId !== d.sideId || c.out) throw new Rejected(`${c.name} does not roll for that side`);
      if (momentumForceOf(engine, world, c) < momentumForceOf(engine, world, roller))
        throw new Rejected(`${roller.name} rolls for the side: the highest HRT or PER Force`);
      checkCascade(engine, c.grade, d.natural);
      const force = momentumForceOf(engine, world, c);
      const total = sum(d.natural) + force;
      rolls.push({ combatantId: c.id, natural: d.natural, force, total, label: "Momentum" });
      return { sideId: d.sideId, total };
    });
    const tied = new Set(totals.map((t) => t.total)).size !== totals.length;
    if (tied !== i < attempts.length - 1) throw new Rejected(i < attempts.length - 1 ? "only a tie is rolled again" : "the last attempt ties: roll again");
  });
  e.order = [...totals].sort((x, y) => y.total - x.total).map((t) => t.sideId);
  newRound(e);
  return [{ kind: "momentum", encounterId: e.id, holder: e.order[0]!, totals, rolls }];
}

function newRound(e: Encounter) {
  e.round += 1;
  e.turn = 0;
  e.acting = null;
  for (const c of e.combatants) {
    c.beats = c.beatsPerTurn;
    c.acted = false;
    c.spent = [];
  }
  advance(e);
}

/** Moves past sides whose every active combatant has acted (or who have nobody left). */
function advance(e: Encounter) {
  while (e.turn < e.order.length) {
    const side = e.order[e.turn]!;
    if (active(e).some((c) => c.sideId === side && !c.acted)) return;
    e.turn += 1;
  }
}

function currentSide(e: Encounter): string {
  if (e.round === 0) throw new Rejected("roll Initial Momentum first");
  const side = e.order[e.turn];
  if (!side) throw new Rejected("every side has acted this round: start the next round");
  return side;
}

function act(world: World, a: Act): Effect[] {
  const e = fight(world);
  const side = currentSide(e);
  const c = combatant(e, a.combatantId);
  if (c.out) throw new Rejected(`${c.name} is out of the fight`);
  if (c.sideId !== side) throw new Rejected(`${e.sides.find((s) => s.id === side)?.name} is taking its turn`);
  if (c.acted) throw new Rejected(`${c.name} has acted this round`);
  if (e.acting && e.acting !== c.id) combatant(e, e.acting).acted = true;
  e.acting = c.id;
  return [];
}

function beat(world: World, a: SpendBeat): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  if (c.beats < 1) throw new Rejected(`${c.name} has no Beats left`);
  c.beats -= 1;
  c.spent.push(a.what.trim() || "Beat");
  return [];
}

function done(world: World, a: Done): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  c.acted = true;
  e.acting = null;
  advance(e);
  return [];
}

function seize(engine: Engine, world: World, a: SeizeMomentum): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  if (c.sideId === e.order[0]) throw new Rejected(`${c.name}'s side holds Momentum`);
  if (c.beats < 1) throw new Rejected(`${c.name} has no Beat to spend`);
  const holderSide = e.order[0]!;
  const holder = momentumRoller(engine, world, e, holderSide);
  if (!holder) throw new Rejected("the side holding Momentum has nobody left to answer");
  const attempts = a.attempts;
  if (!attempts?.length) throw new Rejected("the dice were not rolled");
  let mine = 0;
  let theirs = 0;
  const rolls: MomentumRollRecord[] = [];
  attempts.forEach((t, i) => {
    const h = combatant(e, t.holderCombatantId);
    if (h.sideId !== holderSide || h.out) throw new Rejected(`${h.name} does not answer for the side holding Momentum`);
    if (momentumForceOf(engine, world, h) < momentumForceOf(engine, world, holder))
      throw new Rejected(`${holder.name} answers: the side's highest HRT or PER Force`);
    checkCascade(engine, c.grade, t.seizer);
    checkCascade(engine, h.grade, t.holder);
    const mf = momentumForceOf(engine, world, c);
    const hf = momentumForceOf(engine, world, h);
    mine = sum(t.seizer) + mf;
    theirs = sum(t.holder) + hf;
    rolls.push({ combatantId: c.id, natural: t.seizer, force: mf, total: mine, label: "Seize Momentum" });
    rolls.push({ combatantId: h.id, natural: t.holder, force: hf, total: theirs, label: "Momentum answer" });
    if ((mine === theirs) !== i < attempts.length - 1)
      throw new Rejected(i < attempts.length - 1 ? "only a tie is rolled again" : "the last attempt ties: roll again");
  });
  c.beats -= 1;
  c.spent.push("Seize Momentum");
  const won = mine > theirs;
  if (won) e.pending = { sideId: c.sideId, by: "seize" };
  return [{ kind: "seized", encounterId: e.id, combatantId: c.id, won, total: mine, against: theirs, rolls }];
}

function reversal(world: World, a: Reversal): Effect[] {
  const e = fight(world);
  if (e.round === 0) throw new Rejected("roll Initial Momentum first");
  if (!e.sides.some((s) => s.id === a.sideId)) throw new Rejected(`no side ${a.sideId}`);
  e.pending = { sideId: a.sideId, by: "reversal" };
  return [];
}

function round(world: World): Effect[] {
  const e = fight(world);
  if (e.round === 0) throw new Rejected("roll Initial Momentum first");
  const out: Effect[] = [];
  if (e.pending && e.pending.sideId !== e.order[0]) {
    // The new holder acts first; the other sides keep their order.
    e.order = [e.pending.sideId, ...e.order.filter((s) => s !== e.pending!.sideId)];
    out.push({ kind: "momentum-shifted", encounterId: e.id, holder: e.pending.sideId, by: e.pending.by });
  }
  // Sides that joined after the order was set take their turn last.
  for (const s of liveSides(e)) if (!e.order.includes(s)) e.order.push(s);
  e.pending = null;
  newRound(e);
  return out;
}

function hp(engine: Engine, world: World, a: CombatHp): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (!Number.isInteger(a.delta) || a.delta === 0) throw new Rejected("HP changes by a whole number");
  const before = hpOf(engine, world, c);
  // HP does not go below 0 or above Max HP (Core Mechanics, "Downed and Death").
  const after = Math.max(0, Math.min(before.maxHp, before.hp + a.delta));
  if (c.characterId) world.characters.get(c.characterId)!.hp = after;
  else c.hp = after;
  const out: Effect[] = [{ kind: "combat-hp", encounterId: e.id, combatantId: c.id, from: before.hp, to: after }];
  if (after === 0 && before.hp > 0) out.push({ kind: "combat-downed", encounterId: e.id, combatantId: c.id });
  return out;
}

function end(world: World): Effect[] {
  const e = fight(world);
  e.ended = true;
  e.acting = null;
  return [{ kind: "combat-ended", encounterId: e.id }];
}

export function applyCombat(engine: Engine, world: World, a: CombatAction, _env: Envelope): Effect[] {
  switch (a.type) {
    case "combat.start":
      return start(engine, world, a);
    case "combat.add":
      return add(engine, world, a);
    case "combat.remove":
      return remove(world, a);
    case "combat.momentum":
      return momentum(engine, world, a);
    case "combat.seize":
      return seize(engine, world, a);
    case "combat.reversal":
      return reversal(world, a);
    case "combat.act":
      return act(world, a);
    case "combat.beat":
      return beat(world, a);
    case "combat.done":
      return done(world, a);
    case "combat.round":
      return round(world);
    case "combat.hp":
      return hp(engine, world, a);
    case "combat.end":
      return end(world);
  }
}

// ------------------------------------------------------------------ dice ---

/**
 * Rolls a Momentum Roll or a Seize for an action that arrives without dice, against the
 * record as it stands; a tie rolls again. Returns the action with its dice, or the action
 * unchanged if it cannot be rolled (the record then refuses it with the reason).
 */
export function rollCombatDice(engine: Engine, world: World, a: RollMomentum | SeizeMomentum, d100: D100): RollMomentum | SeizeMomentum {
  const e = world.encounter;
  if (!e || e.ended || a.attempts) return a;
  const cascade = (grade: string) => rollD100s(engine.volatilityThreshold(grade), {}, d100).natural;
  // A tie is rare; the cap only guards against a broken random source.
  if (a.type === "combat.momentum") {
    const rollers = liveSides(e)
      .map((s) => momentumRoller(engine, world, e, s))
      .filter((c): c is Combatant => Boolean(c));
    const attempts: MomentumDie[][] = [];
    for (let i = 0; i < 50; i++) {
      const attempt = rollers.map((c) => ({ sideId: c.sideId, combatantId: c.id, natural: cascade(c.grade) }));
      attempts.push(attempt);
      const totals = attempt.map((d, j) => sum(d.natural) + momentumForceOf(engine, world, rollers[j]!));
      if (new Set(totals).size === totals.length) break;
    }
    return { ...a, attempts };
  }
  const c = e.combatants.find((x) => x.id === a.combatantId);
  const holder = e.order[0] ? momentumRoller(engine, world, e, e.order[0]) : undefined;
  if (!c || !holder) return a;
  const attempts: NonNullable<SeizeMomentum["attempts"]> = [];
  for (let i = 0; i < 50; i++) {
    const t = { seizer: cascade(c.grade), holder: cascade(holder.grade), holderCombatantId: holder.id };
    attempts.push(t);
    if (sum(t.seizer) + momentumForceOf(engine, world, c) !== sum(t.holder) + momentumForceOf(engine, world, holder)) break;
  }
  return { ...a, attempts };
}
