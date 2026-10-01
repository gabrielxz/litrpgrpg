/**
 * The combat tracker's record (Core Mechanics, "Combat"): one fight at a time, its sides and
 * combatants, the Momentum Roll and Seize Momentum, the Decisive Tactical Reversal, rounds in
 * which each side takes its turn and each combatant spends their Beats before the next acts,
 * and HP. Characters in a fight are the record's characters, so their HP is their sheet's;
 * creatures and NPCs carry their own numbers, entered when they join.
 *
 * Momentum dice are rolled on the server (`rollCombatDice`) and recorded in the action.
 * A tie rolls again: on Initial Momentum as the book says, and on Seize Momentum because
 * Seize is a Momentum Roll too (Gabriel, 2026-09-26).
 *
 * A Clash (Core Mechanics, "The Clash") is three actions, so each declaration comes before
 * the dice that depend on it: the attack (with any Surge, Flanking, and whether the defender
 * is Cornered), the defense (posture and any Surge; the server rolls both sides here), and
 * the resolution, where the defender Yields once the Margin is known and before damage.
 * Damage, Driven Back, and a drive into another Zone follow from the Margin left after Yield.
 *
 * At 0 HP (Core Mechanics, "Downed and Death") a character or NPC is Downed and a creature
 * dies, and the GM may rule either way. Vital coherence starts at 3 and falls by one at the
 * end of each round, the round of Downing included; at 0 the character dies (Gabriel,
 * 2026-09-26). Stabilizing by bare hands needs the same Zone, like HP restoration (Gabriel,
 * 2026-09-26) and rolls `downed.stabilize_check.attribute`. A character's pills count
 * per Consolidation, in a fight or out of one (pills.ts). Aura Pressure's Will Save, Suppression, and the Surprise
 * Beat follow Core Mechanics; a defender may Yield against a Surprise Beat (Gabriel, 2026-09-26).
 */
import type { Engine } from "@gradebreaker/engine";
import type { Envelope } from "./actions.ts";
import { type D100, type Dice, rollD100s } from "./dice.ts";
import type { KillEntry, LootResult } from "./aftermath.ts";
import { type CharacterState, type Effect, Rejected, type World, maxAetherOf, maxHpOf, rawStats } from "./fold.ts";
import { take } from "./inventory.ts";
import { countPill, findPill, pillLimit } from "./pills.ts";
import { addMark, checkShape, proficiencyOf } from "./proficiency.ts";
import { count } from "./titles.ts";
import { questsOnLeave } from "./quests.ts";
import type { PermissionHook, UseTechnique } from "./classes.ts";

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
  /** At 0 HP a creature dies and an NPC is Downed. Absent: a creature if it names a Bestiary entry. */
  kind?: "creature" | "npc";
  grade?: string;
  maxHp?: number;
  /** The higher of its HRT and PER Force. */
  momentumForce?: number;
  /** Beats per turn; the book's default when absent. */
  beats?: number;
  /** A creature Yields only if its stat block says so; a character always can. */
  yields?: boolean;
  /** A creature's attacks and defenses from its stat block, offered when it Clashes. */
  offense?: ForceOption[];
  defense?: ForceOption[];
  zoneId?: string;
  /** Hunts by the System's reading rather than by sight, scent, or sound (Classes, No Life Here). */
  huntsByReading?: boolean;
}

/** One line of a stat block's offense or defense: its Force, the stat, what it is. */
export interface ForceOption {
  force: number;
  stat: string;
  means?: string;
}

/** One side of a Clash as declared, before the dice. */
export interface ClashSide {
  /** A character's Attribute; its Force is read from the sheet when the dice are rolled. */
  attribute?: string;
  /** A creature's or NPC's Force for this attack or defense. */
  force?: number;
  /** What it is: "bite", "dodge", "axe". */
  means?: string;
  /** Every other Tactical Modifier. Exposed, Flanking, and Surge are added from their own fields. */
  modifier: number;
  advantage?: boolean;
  /** Half of Maximum Aether for +5, declared before the roll. */
  surge?: boolean;
  /** The Surge paid in Health by a permission that allows it (Blood for Aether). */
  surgeHealth?: boolean;
  /** A character's weapon shape: its Proficiency bonus is added, and an explosion earns a Mark. */
  shape?: string;
  /** A character's class technique shapes this Clash: its cost is paid and its Clash hook's bonus added. */
  technique?: boolean;
}

export interface StartCombat {
  type: "combat.start";
  encounterId: string;
  name: string;
  sides: { id: string; name: string }[];
  /** The GM's Zones for the scene; everyone starts in the first unless placed. */
  zones?: { id: string; name: string }[];
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
  label: string;
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

/**
 * The acting combatant spends a Beat. `what` names it: an attack, a move, a check. `permission`:
 * a Disengage the class permission makes free costs none.
 */
export interface SpendBeat {
  type: "combat.beat";
  combatantId: string;
  what: string;
  permission?: boolean;
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

/**
 * An attack. It costs the acting attacker a Beat; a free strike (leaving a Zone without
 * Disengaging) costs none and needs no turn. `flanking` is the attacker's +10 when two or more
 * hostiles engage the defender; `cornered` means the defender has nowhere to be driven.
 */
export interface Attack {
  type: "combat.attack";
  attackerId: string;
  defenderId: string;
  attack: ClashSide;
  flanking?: boolean;
  cornered?: boolean;
  free?: boolean;
  label?: string;
  /** A Rush: the attacker moves into this Zone first, and the attack's Beat pays for both. */
  rush?: string;
  /** On someone else's turn for no Beat: the class's reaction, or a technique used as one. */
  reaction?: boolean;
}

/**
 * A class permission's cover (Take It): after an ally in the same Zone loses a Clash and before
 * the ally Yields, a Beat from the coverer's next turn cuts the Margin.
 */
export interface Cover {
  type: "combat.cover";
  combatantId: string;
}

/** The defender's answer to the pending attack. The server rolls both sides' dice here. */
export interface Defend {
  type: "combat.defend";
  defense: ClashSide;
  attackDice?: Dice;
  defenseDice?: Dice;
}

/** The defender gives up Beats from their next turn, 20 Margin each; then damage lands. */
export interface ResolveClash {
  type: "combat.resolve";
  yield: number;
}

/**
 * Into another Zone: for a Beat on the mover's turn, or forced (driven) at no Beat. `permission`:
 * a move the class permission makes free (Reach the Fallen) costs none.
 */
export interface Move {
  type: "combat.move";
  combatantId: string;
  zoneId: string;
  forced?: boolean;
  permission?: boolean;
}

/** Exposed from the fiction, or cleared: the GM's call. */
export interface SetExposed {
  type: "combat.exposed";
  combatantId: string;
  exposed: boolean;
}

/** The scene's Zones, renamed, added, or removed (an occupied Zone stays). */
export interface SetZones {
  type: "combat.zones";
  zones: { id: string; name: string }[];
}

/** A Downed combatant's fate by the GM's ruling: dead, or stabilized (a creature left alive, success at a cost). */
export interface Fate {
  type: "combat.fate";
  combatantId: string;
  fate: "dead" | "stabilized";
}

/** Bare hands: 1 Beat and a Moderate DEX check by someone in the Downed character's Zone. */
export interface Stabilize {
  type: "combat.stabilize";
  combatantId: string;
  targetId: string;
  /** A creature's or NPC's Force; a character rolls DEX. */
  force?: number;
  /** A medical Background rolls with Advantage. */
  advantage?: boolean;
  /** Absent when the helper's Force alone meets the Resistance. */
  dice?: Dice;
}

/** 1 Beat, no roll: a deliberate attack on a Downed combatant kills them. */
export interface Execute {
  type: "combat.execute";
  combatantId: string;
  targetId: string;
}

/** A pill from the Items tables, swallowed or given to someone in the same Zone, for 1 Beat. */
export interface TakePill {
  type: "combat.pill";
  combatantId: string;
  targetId: string;
  pill: string;
}

/**
 * Aura Pressure from a higher-Grade combatant. On arrival, every lower-Grade character who has
 * not yet faced it makes the Will Save. `flare` is the entity spending a Beat on its turn to
 * flare its aura, which forces a fresh save from every lower-Grade character.
 */
export interface AuraPressure {
  type: "combat.aura";
  entityId: string;
  flaring: boolean;
  flare?: boolean;
  saves?: { combatantId: string; dice?: Dice }[];
}

/**
 * A Suppressed character rolls the Will Save again: pushing back with a Principle Application
 * (their own Beat), an ally's intervention (the ally's Beat), or the entity hurt or distracted
 * (the GM's call, no Beat).
 */
export interface WillSave {
  type: "combat.will";
  combatantId: string;
  reason: "principle" | "intervention" | "distracted";
  helperId?: string;
  dice?: Dice;
}

/** Suppressed by the GM's ruling: a creature or NPC, or three or more Grades apart; or cleared. */
export interface Suppress {
  type: "combat.suppress";
  combatantId: string;
  suppressed: boolean;
}

/** Before Initial Momentum: each surprising combatant takes one free Beat. */
export interface Surprise {
  type: "combat.surprise";
  combatantIds: string[];
}

export type CombatAction =
  | StartCombat
  | Fate
  | Stabilize
  | Execute
  | TakePill
  | AuraPressure
  | WillSave
  | Suppress
  | Surprise
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
  | EndCombat
  | Attack
  | Defend
  | ResolveClash
  | Cover
  | Move
  | SetExposed
  | SetZones;

// ----------------------------------------------------------------- state ---

export interface Combatant {
  id: string;
  sideId: string;
  name: string;
  grade: string;
  characterId?: string;
  creature?: string;
  kind: "character" | "creature" | "npc";
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
  zoneId: string | null;
  /** Beats Yielded after this round's turn, taken from the next. */
  debt: number;
  /** Exposed until the end of their next turn; `started` once that turn has begun. */
  exposed: { started: boolean } | null;
  yields: boolean;
  offense?: ForceOption[];
  defense?: ForceOption[];
  /** At 0 HP and alive: vital coherence left, and whether the countdown has stopped. */
  downed: { coherence: number; stabilized: boolean } | null;
  dead: boolean;
  /** Downed at any point in this fight: a survivor is due a Battle Memory Card. */
  wasDowned: boolean;
  /** Whose hit Downed them: the finishing blow if the countdown or a ruling ends them. */
  downedBy?: string;
  /** Whose hit or execution killed them, when the record knows. */
  killedBy?: string;
  /** Aura Pressure: steeled for the encounter, or Suppressed to 1 Beat. */
  aura: "steeled" | "suppressed" | null;
  /** A creature's or NPC's pills this fight, by kind; a character's count lives on the character, per Consolidation. */
  pills: { healing: number; aether: number };
  /** A character's once-per-fight class technique, spent. */
  techniqueUsed?: boolean;
  /** Reactions the class permission has taken this fight. */
  reactionsUsed?: number;
  /** The round the class permission last covered an ally. */
  coveredRound?: number;
  /** No Life Here: a turn spent without a Beat, and nothing done since. Inspection reads nothing. */
  readAsDead?: boolean;
  huntsByReading?: boolean;
}

/** A Clash as it stands, from the attack to the resolution. */
export interface PendingClash {
  id: string;
  attackerId: string;
  defenderId: string;
  label?: string;
  attack: ClashSide;
  flanking: boolean;
  cornered: boolean;
  free: boolean;
  stage: "defense" | "yield";
  defense?: ClashSide;
  result?: ClashResult;
}

export interface ClashResult {
  attackerId: string;
  defenderId: string;
  label?: string;
  attackTotal: number;
  defenseTotal: number;
  /** Attacker's total minus defender's; a tie goes to the attacker. */
  margin: number;
  attackerWins: boolean;
  turnedAside: boolean;
  attackExploded: boolean;
  defenseExploded: boolean;
  /** The most Beats the defender can Yield: their next turn's, one if Cornered, none for a creature that does not. */
  yieldCap: number;
  /** Set once resolved. */
  yielded?: number;
  remaining?: number;
  damage?: number;
  drivenBack?: boolean;
  /** The attacker may drive the defender into an adjacent Zone: Driven Back, or two Beats Yielded. */
  drivable?: boolean;
  /** Allies' covers cutting the Margin before the Yield, each with its cut. */
  covers?: { combatantId: string; cut: number }[];
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
  zones: { id: string; name: string }[];
  clash: PendingClash | null;
  /** The last Clash resolved, for the drive and the tracker's line. */
  lastClash: ClashResult | null;
  /** Before Initial Momentum: the combatants with a Surprise Beat. */
  surprise: string[] | null;
  /** The last Aura Pressure: whose, and the Resistance a Suppressed character rolls against again. */
  aura: { entityId: string; resistance: number } | null;
  /** After the fight: the loot rolled, and the settlement recorded (app/packages/record/src/aftermath.ts). */
  loot?: LootResult[];
  settled?: boolean;
  kills?: KillEntry[];
  /** The combatant whose hit drew the fight's first damage (Titles, First Blood). */
  firstBlood?: string;
}

export function cloneEncounter(e: Encounter): Encounter {
  return {
    ...e,
    sides: e.sides.map((s) => ({ ...s })),
    combatants: e.combatants.map((c) => ({
      ...c,
      spent: [...c.spent],
      exposed: c.exposed && { ...c.exposed },
      downed: c.downed && { ...c.downed },
      pills: { ...c.pills },
    })),
    surprise: e.surprise && [...e.surprise],
    aura: e.aura && { ...e.aura },
    ...(e.loot ? { loot: e.loot.map((r) => ({ ...r })) } : {}),
    ...(e.kills ? { kills: e.kills.map((k) => ({ ...k })) } : {}),
    order: [...e.order],
    pending: e.pending && { ...e.pending },
    zones: e.zones.map((z) => ({ ...z })),
    clash: e.clash && { ...e.clash, ...(e.clash.result ? { result: cloneResult(e.clash.result) } : {}) },
    lastClash: e.lastClash && cloneResult(e.lastClash),
  };
}

const cloneResult = (r: ClashResult): ClashResult => ({ ...r, ...(r.covers ? { covers: r.covers.map((c) => ({ ...c })) } : {}) });

// --------------------------------------------------------------- helpers ---

/** The class permission's hook a character combatant holds, if any. */
function permissionOf(world: World, c: Combatant): PermissionHook | undefined {
  return c.characterId ? world.characters.get(c.characterId)?.classes?.held?.permission.hook : undefined;
}

function permissionName(world: World, c: Combatant): string {
  return (c.characterId && world.characters.get(c.characterId)?.classes?.held?.permission.name) || "the permission";
}

/** The combatant does something: No Life Here's reading ends. */
function stir(c: Combatant) {
  delete c.readAsDead;
}

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

/** In the fight and able to take a turn: a Downed combatant has no Beats and no defense. */
const canTurn = (c: Combatant) => !c.out && !c.downed;

/** The Beats a combatant's turn starts with before any Yield: 1 while Suppressed, none while Downed. */
function turnBeats(engine: Engine, c: Combatant): number {
  if (c.downed) return 0;
  if (c.aura === "suppressed") return Math.min(c.beatsPerTurn, engine.rules.combat.aura_pressure.suppressed_beats);
  return c.beatsPerTurn;
}

/** Their turn this round is still to come, so a change to their Beats lands on it. */
function turnStillToCome(e: Encounter, c: Combatant): boolean {
  if (e.round === 0) return false;
  return !c.acted && e.acting !== c.id && e.order.indexOf(c.sideId) >= e.turn;
}

const cid = (c: Combatant) => (c.characterId ? { characterId: c.characterId } : {});

/** The acting combatant spends a Beat on `what`. */
function spend(e: Encounter, c: Combatant, what: string) {
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  if (c.beats < 1) throw new Rejected(`${c.name} has no Beats left`);
  noClash(e);
  c.beats -= 1;
  c.spent.push(what);
  stir(c);
}

/** Both in the same Zone, or the scene has no Zones. */
function sameZone(a: Combatant, b: Combatant): boolean {
  return a.zoneId === null || b.zoneId === null || a.zoneId === b.zoneId;
}

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

function fresh(e: Encounter, s: CombatantSpec, yields: boolean) {
  let zoneId: string | null = e.zones[0]?.id ?? null;
  if (s.zoneId !== undefined) {
    if (!e.zones.some((z) => z.id === s.zoneId)) throw new Rejected(`no Zone ${s.zoneId}`);
    zoneId = s.zoneId;
  }
  return {
    beats: 0,
    acted: false,
    out: false,
    spent: [] as string[],
    zoneId,
    debt: 0,
    exposed: null,
    yields,
    downed: null,
    dead: false,
    wasDowned: false,
    aura: null,
    pills: { healing: 0, aether: 0 },
  };
}

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
    if (ch.dead) throw new Rejected(`${ch.name} is dead`);
    if (e.combatants.some((x) => x.characterId === ch.id && !x.out)) throw new Rejected(`${ch.name} is already in the fight`);
    c = { id: s.combatantId, sideId: s.sideId, name: ch.name, grade: ch.grade, characterId: ch.id, kind: "character", beatsPerTurn: beats, ...fresh(e, s, true) };
    // A character already at 0 HP joins Downed.
    if (ch.hp === 0) c.downed = { coherence: engine.rules.combat.downed.dies_at_end_of_round, stabilized: false };
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
    const kind = s.kind ?? (s.creature ? "creature" : "npc");
    c = { id: s.combatantId, sideId: s.sideId, name, grade, kind, hp: maxHp, maxHp, momentumForce: mf, beatsPerTurn: beats, ...fresh(e, s, s.yields ?? false) };
    if (s.creature) c.creature = s.creature;
    if (s.huntsByReading) c.huntsByReading = true;
    if (s.offense?.length) c.offense = s.offense.map((o) => ({ ...o }));
    if (s.defense?.length) c.defense = s.defense.map((o) => ({ ...o }));
  }
  // Joining mid-round: Beats now, to act if their side has not finished its turn.
  if (e.round > 0) c.beats = turnBeats(engine, c);
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
    zones: checkZones(a.zones ?? []),
    clash: null,
    lastClash: null,
    surprise: null,
    aura: null,
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
  if (e.clash && (e.clash.attackerId === c.id || e.clash.defenderId === c.id)) e.clash = null;
  advance(e);
  return [];
}

function momentum(engine: Engine, world: World, a: RollMomentum): Effect[] {
  const e = fight(world);
  if (e.round > 0) throw new Rejected("Initial Momentum is already rolled; a shift comes from Seize or a Reversal");
  noClash(e);
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
  newRound(engine, e);
  return [{ kind: "momentum", encounterId: e.id, holder: e.order[0]!, totals, rolls }];
}

function newRound(engine: Engine, e: Encounter) {
  e.round += 1;
  e.turn = 0;
  e.acting = null;
  e.lastClash = null;
  e.surprise = null;
  for (const c of e.combatants) {
    // Beats Yielded after last round's turn come out of this one.
    c.beats = Math.max(0, turnBeats(engine, c) - c.debt);
    c.debt = 0;
    c.acted = false;
    c.spent = [];
  }
  advance(e);
}

/** A combatant's turn ends: an Exposed that began before this turn ends with it. */
function finish(c: Combatant) {
  c.acted = true;
  if (c.exposed?.started) c.exposed = null;
}

/** A turn the combatant finished themselves: No Life Here reads a turn spent without a Beat as dead. */
function endTurn(world: World, e: Encounter, c: Combatant) {
  finish(c);
  if (e.round > 0 && !c.downed && c.spent.length === 0 && permissionOf(world, c)?.kind === "no-life") c.readAsDead = true;
}

function noClash(e: Encounter) {
  if (e.clash) throw new Rejected("a Clash is waiting: finish it first");
}

/** Moves past sides whose every active combatant has acted (or who have nobody left). */
function advance(e: Encounter) {
  while (e.turn < e.order.length) {
    const side = e.order[e.turn]!;
    if (e.combatants.some((c) => c.sideId === side && canTurn(c) && !c.acted)) return;
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
  const c = combatant(e, a.combatantId);
  if (c.out) throw new Rejected(`${c.name} is out of the fight`);
  if (c.downed) throw new Rejected(`${c.name} is Downed`);
  if (e.round === 0 && e.surprise) {
    // Before Initial Momentum only the surprising combatants act, each once, in any order.
    if (!e.surprise.includes(c.id)) throw new Rejected(`${c.name} has no Surprise Beat`);
  } else {
    const side = currentSide(e);
    if (c.sideId !== side) throw new Rejected(`${e.sides.find((s) => s.id === side)?.name} is taking its turn`);
  }
  if (c.acted) throw new Rejected(`${c.name} has acted${e.round ? " this round" : ""}`);
  noClash(e);
  if (e.acting && e.acting !== c.id) endTurn(world, e, combatant(e, e.acting));
  e.acting = c.id;
  if (c.exposed) c.exposed.started = true;
  return [];
}

function beat(world: World, a: SpendBeat): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  const what = a.what.trim() || "Beat";
  if (!a.permission) {
    spend(e, c, what);
    return [];
  }
  // A Disengage the permission makes free: the turn's act without its Beat.
  if (permissionOf(world, c)?.kind !== "free-disengage") throw new Rejected(`${c.name}'s class does not make that free`);
  if (what !== "Disengage") throw new Rejected(`${permissionName(world, c)} makes Disengaging free, not ${what}`);
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  noClash(e);
  c.spent.push(`Disengage (${permissionName(world, c)})`);
  stir(c);
  return [];
}

function done(world: World, a: Done): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  noClash(e);
  endTurn(world, e, c);
  e.acting = null;
  advance(e);
  return [];
}

function seize(engine: Engine, world: World, a: SeizeMomentum): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
  if (c.sideId === e.order[0]) throw new Rejected(`${c.name}'s side holds Momentum`);
  noClash(e);
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
  stir(c);
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

function round(engine: Engine, world: World): Effect[] {
  const e = fight(world);
  if (e.round === 0) throw new Rejected("roll Initial Momentum first");
  noClash(e);
  const out: Effect[] = [];
  // The round ends: every Downed combatant not stabilized loses one vital coherence; at 0 they die.
  for (const c of e.combatants) {
    if (!c.downed || c.downed.stabilized || c.dead) continue;
    c.downed.coherence -= 1;
    if (c.downed.coherence <= 0) out.push(...die(world, e, c, "countdown", c.downedBy));
    else out.push({ kind: "vital-coherence", encounterId: e.id, combatantId: c.id, ...cid(c), coherence: c.downed.coherence });
  }
  if (e.pending && e.pending.sideId !== e.order[0]) {
    // The new holder acts first; the other sides keep their order.
    e.order = [e.pending.sideId, ...e.order.filter((s) => s !== e.pending!.sideId)];
    out.push({ kind: "momentum-shifted", encounterId: e.id, holder: e.pending.sideId, by: e.pending.by });
  }
  // Sides that joined after the order was set take their turn last.
  for (const s of liveSides(e)) if (!e.order.includes(s)) e.order.push(s);
  e.pending = null;
  newRound(engine, e);
  return out;
}

function hp(engine: Engine, world: World, a: CombatHp): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (!Number.isInteger(a.delta) || a.delta === 0) throw new Rejected("HP changes by a whole number");
  return changeHp(engine, world, e, c, a.delta);
}

function changeHp(engine: Engine, world: World, e: Encounter, c: Combatant, delta: number, byId?: string): Effect[] {
  if (c.dead) throw new Rejected(`${c.name} is dead`);
  const before = hpOf(engine, world, c);
  // HP does not go below 0 or above Max HP (Core Mechanics, "Downed and Death").
  const after = Math.max(0, Math.min(before.maxHp, before.hp + delta));
  setHp(world, c, after);
  const out: Effect[] = [{ kind: "combat-hp", encounterId: e.id, combatantId: c.id, from: before.hp, to: after }];
  const dr = engine.rules.combat.downed;
  // Annihilation: a single hit of 10 × Max HP or more, with no Downed state and no countdown.
  if (delta < 0 && engine.annihilated(-delta, before.maxHp)) return [...out, ...die(world, e, c, "annihilated", byId)];
  if (after === 0 && before.hp > 0) {
    if (c.kind === "creature") return [...out, ...die(world, e, c, "fell", byId)];
    c.downed = { coherence: dr.dies_at_end_of_round, stabilized: false };
    c.wasDowned = true;
    if (byId) c.downedBy = byId;
    else delete c.downedBy;
    c.beats = 0;
    if (e.acting === c.id) {
      finish(c);
      e.acting = null;
    }
    advance(e);
    out.push({ kind: "combat-downed", encounterId: e.id, combatantId: c.id, ...cid(c), coherence: c.downed.coherence });
  } else if (after > 0 && c.downed) {
    // Any HP restoration returns a Downed character to consciousness at the restored HP.
    c.downed = null;
    if (turnStillToCome(e, c)) c.beats = Math.max(0, turnBeats(engine, c) - c.debt);
    out.push({ kind: "revived", encounterId: e.id, combatantId: c.id, ...cid(c), hp: after });
  }
  return out;
}

function setHp(world: World, c: Combatant, hp: number) {
  if (c.characterId) world.characters.get(c.characterId)!.hp = hp;
  else c.hp = hp;
}

/**
 * A combatant dies: out of the fight for good. A character's death is permanent at F-Grade and
 * ends their party membership (a party left with one member ends).
 */
function die(world: World, e: Encounter, c: Combatant, cause: DeathCause, byId?: string): Effect[] {
  c.dead = true;
  c.out = true;
  c.downed = null;
  if (byId) c.killedBy = byId;
  c.beats = 0;
  if (e.acting === c.id) e.acting = null;
  if (e.clash && (e.clash.attackerId === c.id || e.clash.defenderId === c.id)) e.clash = null;
  e.surprise = e.surprise && e.surprise.filter((x) => x !== c.id);
  const by = byId ? e.combatants.find((x) => x.id === byId) : undefined;
  const out: Effect[] = [
    {
      kind: "combat-died",
      encounterId: e.id,
      combatantId: c.id,
      ...cid(c),
      cause,
      ...(byId ? { byId } : {}),
      // A player character's execution weighs heavily in the Hidden Vector Engine.
      ...(by?.characterId ? { byCharacterId: by.characterId } : {}),
    },
  ];
  if (c.characterId) {
    const ch = world.characters.get(c.characterId)!;
    ch.dead = true;
    out.push(...partyAfterDeath(world, ch.id, ch.name));
  }
  advance(e);
  return out;
}

export type DeathCause = "countdown" | "annihilated" | "executed" | "fell" | "ruling";

function partyAfterDeath(world: World, characterId: string, name: string): Effect[] {
  const p = [...world.parties.values()].find((x) => x.members.includes(characterId));
  if (!p) return [];
  p.members = p.members.filter((m) => m !== characterId);
  questsOnLeave(world, p.id, characterId);
  const out: Effect[] = p.members.map((m) => ({ kind: "party-member-died", characterId: m, memberId: characterId, memberName: name }) as const);
  if (p.members.length < 2) {
    world.parties.delete(p.id);
    for (const q of world.quests.values()) if (q.sharedIn === p.id) delete q.sharedIn;
    out.push(...p.members.map((m) => ({ kind: "party-disbanded", characterId: m, partyId: p.id }) as const));
  }
  world.invites = world.invites.filter((i) => i.fromId !== characterId && i.toId !== characterId);
  return out;
}

function end(engine: Engine, world: World): Effect[] {
  const e = fight(world);
  noClash(e);
  const dying = e.combatants.filter((c) => c.characterId && c.downed && !c.downed.stabilized);
  if (dying.length)
    throw new Rejected(`${dying.map((c) => c.name).join(" and ")} ${dying.length === 1 ? "is" : "are"} dying: stabilize them or run the rounds out`);
  // The counts behind Achievement titles, read before a stabilized character wakes: still
  // standing means on their feet when the fight ends, not woken at 1 HP afterward.
  for (const c of e.combatants) {
    const ch = c.characterId ? world.characters.get(c.characterId) : undefined;
    if (!ch || c.dead) continue;
    if (c.wasDowned) count(ch, "survived-downed");
    if (!c.downed && !c.out && ch.hp > 0 && ch.hp * 2 < maxHpOf(engine, ch)) count(ch, "fights-ended-below-half");
    if (e.firstBlood === c.id) count(ch, "first-blood");
  }
  const out: Effect[] = [];
  for (const c of e.combatants) {
    // A stabilized character wakes at 1 HP when the scene ends.
    if (c.downed?.stabilized && !c.dead) {
      setHp(world, c, 1);
      c.downed = null;
      out.push({ kind: "revived", encounterId: e.id, combatantId: c.id, ...cid(c), hp: 1 });
    }
    if (c.characterId && c.wasDowned && !c.dead) out.push({ kind: "battle-memory-due", characterId: c.characterId, reason: "survived Downed" });
  }
  e.ended = true;
  e.acting = null;
  e.surprise = null;
  // No Life Here reads a still turn; outside a fight there are no turns to read.
  for (const c of e.combatants) stir(c);
  return [{ kind: "combat-ended", encounterId: e.id }, ...out];
}

// ------------------------------------------------------ Downed and death ---

function fate(engine: Engine, world: World, a: Fate): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (hpOf(engine, world, c).hp !== 0) throw new Rejected(`${c.name} is not at 0 HP`);
  if (a.fate === "dead") {
    if (c.dead) throw new Rejected(`${c.name} is already dead`);
    return die(world, e, c, "ruling", c.downedBy);
  }
  if (c.dead) {
    // A creature that died at 0 by default, left alive instead (to be questioned).
    if (c.characterId) throw new Rejected("death is permanent; undo the action that killed them if it was a mistake");
    c.dead = false;
    c.out = false;
    c.downed = { coherence: engine.rules.combat.downed.dies_at_end_of_round, stabilized: true };
    c.wasDowned = true;
  } else if (!c.downed) throw new Rejected(`${c.name} is not Downed`);
  else if (c.downed.stabilized) throw new Rejected(`${c.name} is already stabilized`);
  else c.downed.stabilized = true;
  return [{ kind: "stabilized", encounterId: e.id, combatantId: c.id, ...cid(c) }];
}

/** The d100 against a Resistance, or none when the Force alone meets it. */
function checkRoll(engine: Engine, grade: string, force: number, resistance: number, dice: Dice | undefined, advantage: boolean) {
  if (force >= resistance) {
    if (dice) throw new Rejected("the Force alone meets the Resistance: no roll");
    return { total: force, success: true, auto: true, natural: [] as number[] };
  }
  checkDice(engine, grade, dice, advantage);
  const total = sum(dice!.natural) + force;
  const outcome = engine.checkOutcome(total, resistance, dice!.natural[0]!, grade);
  return { total, success: outcome === "success" || outcome === "exceptional", auto: false, natural: dice!.natural };
}

/** The Force a helper brings to a check: a character's Attribute, or the Force entered for a creature or NPC. */
function helperForce(engine: Engine, world: World, c: Combatant, attribute: string | undefined, force: number | undefined): number {
  if (c.characterId) {
    if (!attribute) throw new Rejected(`name the Attribute ${c.name} uses`);
    const raw = rawStats(world.characters.get(c.characterId)!)[attribute];
    if (raw === undefined) throw new Rejected(`${attribute} is not an Attribute`);
    return engine.force(raw, c.grade);
  }
  if (force === undefined || !Number.isInteger(force) || force < 0) throw new Rejected(`enter ${c.name}'s Force`);
  return force;
}

/** The bare-hands stabilizing check: the Attribute it rolls and the Resistance it meets. */
export function stabilizeCheck(engine: Engine): { attribute: string; difficulty: string; resistance: number } {
  const s = engine.rules.combat.downed.stabilize_check;
  return { attribute: s.attribute, difficulty: s.difficulty, resistance: s.resistance };
}

export function stabilizeAttribute(engine: Engine): string {
  return stabilizeCheck(engine).attribute;
}

function stabilize(engine: Engine, world: World, a: Stabilize): Effect[] {
  const e = fight(world);
  const helper = combatant(e, a.combatantId);
  const target = combatant(e, a.targetId);
  if (helper.id === target.id) throw new Rejected("a Downed character cannot stabilize themselves");
  if (!target.downed || target.dead) throw new Rejected(`${target.name} is not Downed`);
  if (target.downed.stabilized) throw new Rejected(`${target.name} is already stabilized`);
  if (!sameZone(helper, target)) throw new Rejected(`${helper.name} must be in ${target.name}'s Zone`);
  const force = helperForce(engine, world, helper, stabilizeAttribute(engine), a.force);
  spend(e, helper, `Stabilize ${target.name}`);
  const resistance = engine.rules.combat.downed.stabilize_check.resistance;
  const r = checkRoll(engine, helper.grade, force, resistance, a.dice, Boolean(a.advantage));
  if (r.success) target.downed.stabilized = true;
  const out: Effect[] = [
    {
      kind: "combat-check",
      encounterId: e.id,
      combatantId: helper.id,
      label: `Stabilize ${target.name}`,
      total: r.total,
      resistance,
      success: r.success,
      rolls: r.auto ? [] : [{ combatantId: helper.id, natural: r.natural, force, total: r.total, label: `Stabilize ${target.name}` }],
    },
  ];
  if (r.success) out.push({ kind: "stabilized", encounterId: e.id, combatantId: target.id, ...cid(target) });
  return out;
}

function execute(world: World, a: Execute): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  const target = combatant(e, a.targetId);
  if (!target.downed || target.dead) throw new Rejected(`${target.name} is not Downed`);
  spend(e, c, `Execute ${target.name}`);
  return die(world, e, target, "executed", c.id);
}

// ----------------------------------------------------------------- pills ---

function pill(engine: Engine, world: World, a: TakePill): Effect[] {
  const e = fight(world);
  const giver = combatant(e, a.combatantId);
  const target = combatant(e, a.targetId);
  if (target.dead || target.out) throw new Rejected(`${target.name} is out of the fight`);
  if (giver.id !== target.id && !sameZone(giver, target)) throw new Rejected(`${giver.name} must be in ${target.name}'s Zone`);
  const p = findPill(engine, a.pill);
  const kind = p.kind;
  if (kind === "aether" && !target.characterId) throw new Rejected(`the tracker keeps no Aether for ${target.name}`);
  // A character gives from what they carry; a creature's or NPC's pill is the GM's to say.
  if (giver.characterId) take(world, giver.characterId, p.name, 1);
  spend(e, giver, `${p.name}${giver.id === target.id ? "" : ` to ${target.name}`}`);
  // The recipient's count, never the giver's; the pill is taken whether or not it works.
  let noEffect: "grade" | "limit" | undefined;
  if (target.characterId) noEffect = countPill(engine, world.characters.get(target.characterId)!, kind, p.grade);
  else {
    const taken = target.pills[kind];
    target.pills[kind] += 1;
    noEffect = p.grade !== target.grade ? "grade" : taken >= pillLimit(engine) ? "limit" : undefined;
  }
  const out: Effect[] = [];
  let restored = 0;
  if (!noEffect && kind === "healing") {
    const hp = changeHp(engine, world, e, target, p.amount);
    const change = hp[0] as { from: number; to: number };
    restored = change.to - change.from;
    out.push(...hp);
  } else if (!noEffect) {
    const ch = world.characters.get(target.characterId!)!;
    const before = ch.aether;
    ch.aether = Math.min(maxAetherOf(engine, ch), ch.aether + p.amount);
    restored = ch.aether - before;
  }
  return [
    { kind: "pill", encounterId: e.id, combatantId: giver.id, targetId: target.id, ...cid(target), pill: p.name, pillKind: kind, restored, ...(noEffect ? { noEffect } : {}) },
    ...out,
  ];
}

// ---------------------------------------------------------- Aura Pressure ---

/** Characters below the entity's Grade who make the Will Save: all of them on a flare, else those who have not faced it. */
export function auraSavers(engine: Engine, e: Encounter, entityId: string, flare: boolean): Combatant[] {
  const entity = e.combatants.find((c) => c.id === entityId);
  if (!entity) return [];
  const rank = engine.gradeOrder(entity.grade);
  return e.combatants.filter(
    (c) => c.characterId && canTurn(c) && c.id !== entity.id && engine.gradeOrder(c.grade) < rank && (flare || c.aura === null),
  );
}

/** Suppressed turns 2 Beats to 1; a turn still to come this round gains or loses the difference now. */
function setAura(engine: Engine, e: Encounter, c: Combatant, next: Combatant["aura"]) {
  const before = turnBeats(engine, c);
  c.aura = next;
  if (turnStillToCome(e, c)) c.beats = Math.max(0, c.beats + turnBeats(engine, c) - before);
}

function willSave(engine: Engine, world: World, e: Encounter, c: Combatant, resistance: number, dice: Dice | undefined, label: string): Effect {
  const force = hrtForce(engine, world, c);
  const r = checkRoll(engine, c.grade, force, resistance, dice, false);
  setAura(engine, e, c, r.success ? "steeled" : "suppressed");
  return {
    kind: "combat-check",
    encounterId: e.id,
    combatantId: c.id,
    label,
    total: r.total,
    resistance,
    success: r.success,
    aura: c.aura!,
    rolls: r.auto ? [] : [{ combatantId: c.id, natural: r.natural, force, total: r.total, label }],
  };
}

function hrtForce(engine: Engine, world: World, c: Combatant): number {
  const ch = world.characters.get(c.characterId!)!;
  return engine.force(rawStats(ch).HRT!, ch.grade);
}

function aura(engine: Engine, world: World, a: AuraPressure): Effect[] {
  const e = fight(world);
  const entity = combatant(e, a.entityId);
  if (!canTurn(entity)) throw new Rejected(`${entity.name} is out of the fight`);
  const flare = Boolean(a.flare);
  const savers = auraSavers(engine, e, entity.id, flare);
  if (!savers.length) throw new Rejected(flare ? `nobody in the fight is below ${entity.name}'s Grade` : `everyone below ${entity.name}'s Grade has faced it`);
  if (flare) spend(e, entity, "Flare aura");
  const saves = a.saves ?? [];
  if (saves.length !== savers.length || !savers.every((c) => saves.some((s) => s.combatantId === c.id)))
    throw new Rejected(`the Will Save is made by ${savers.map((c) => c.name).join(", ")}`);
  const resistance = engine.auraResistance(a.flaring);
  e.aura = { entityId: entity.id, resistance };
  return savers.map((c) => willSave(engine, world, e, c, resistance, saves.find((s) => s.combatantId === c.id)!.dice, "Will Save"));
}

function will(engine: Engine, world: World, a: WillSave): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (!c.characterId) throw new Rejected("a creature's or NPC's Suppression is the GM's ruling");
  if (c.aura !== "suppressed" || !e.aura) throw new Rejected(`${c.name} is not Suppressed`);
  if (a.reason === "principle") spend(e, c, "Push back (Application)");
  else if (a.reason === "intervention") {
    const helper = combatant(e, a.helperId ?? "");
    if (helper.id === c.id) throw new Rejected("an intervention comes from an ally");
    if (helper.aura === "suppressed") throw new Rejected(`${helper.name} is Suppressed too`);
    spend(e, helper, `Intervene for ${c.name}`);
  }
  return [willSave(engine, world, e, c, e.aura.resistance, a.dice, "Will Save again")];
}

function suppress(engine: Engine, world: World, a: Suppress): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (!canTurn(c)) throw new Rejected(`${c.name} is out of the fight`);
  setAura(engine, e, c, a.suppressed ? "suppressed" : null);
  return [];
}

// -------------------------------------------------------------- surprise ---

function surprise(engine: Engine, world: World, a: Surprise): Effect[] {
  const e = fight(world);
  if (e.round > 0) throw new Rejected("the Surprise Beat comes before Initial Momentum");
  if (e.combatants.some((c) => c.acted) || e.acting || e.clash) throw new Rejected("the surprise is under way");
  if (!a.combatantIds.length) throw new Rejected("name who has the surprise");
  const ids = [...new Set(a.combatantIds)];
  for (const id of ids) if (!canTurn(combatant(e, id))) throw new Rejected(`${combatant(e, id).name} cannot act`);
  e.surprise = ids;
  for (const c of e.combatants) c.beats = ids.includes(c.id) ? engine.rules.combat.surprise_beat : 0;
  return [];
}

// ----------------------------------------------------------------- Zones ---

function checkZones(zones: { id: string; name: string }[]) {
  if (new Set(zones.map((z) => z.id)).size !== zones.length) throw new Rejected("two Zones share an id");
  return zones.map((z) => ({ id: z.id, name: z.name.trim() || z.id }));
}

function setZones(world: World, a: SetZones): Effect[] {
  const e = fight(world);
  const zones = checkZones(a.zones);
  for (const c of active(e))
    if (c.zoneId && !zones.some((z) => z.id === c.zoneId)) throw new Rejected(`${c.name} is in a Zone that would be removed`);
  e.zones = zones;
  return [];
}

function move(world: World, a: Move): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  if (c.out) throw new Rejected(`${c.name} is out of the fight`);
  if (!e.zones.some((z) => z.id === a.zoneId)) throw new Rejected(`no Zone ${a.zoneId}`);
  if (c.zoneId === a.zoneId) throw new Rejected(`${c.name} is already there`);
  if (a.forced && a.permission) throw new Rejected("a forced move costs no Beat already");
  if (a.permission) {
    // A move the class permission makes free: on the mover's turn, without its Beat.
    const hook = permissionOf(world, c);
    if (hook?.kind !== "free-move") throw new Rejected(`${c.name}'s class does not make a move free`);
    if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting`);
    noClash(e);
    if (hook.into === "downed-ally" && !e.combatants.some((x) => x.sideId === c.sideId && x.id !== c.id && x.downed && !x.dead && x.zoneId === a.zoneId))
      throw new Rejected(`${permissionName(world, c)} is a move into a Zone holding a Downed ally`);
    c.spent.push(`Move (${permissionName(world, c)})`);
    stir(c);
  } else if (!a.forced) {
    if (e.acting !== c.id) throw new Rejected(`${c.name} is not acting; a move on someone else's turn is forced`);
    if (c.beats < 1) throw new Rejected(`${c.name} has no Beats left`);
    noClash(e);
    c.beats -= 1;
    c.spent.push("Move");
    stir(c);
  }
  c.zoneId = a.zoneId;
  return [];
}

function setExposed(world: World, a: SetExposed): Effect[] {
  const e = fight(world);
  const c = combatant(e, a.combatantId);
  // Exposed from now until the end of the combatant's next turn.
  c.exposed = a.exposed ? { started: false } : null;
  return [];
}

// ----------------------------------------------------------------- Clash ---

/** Flanking applies when two or more hostiles engage the defender: here, share its Zone. */
export function flankingSuggested(e: Encounter, attackerId: string, defenderId: string): boolean {
  const a = e.combatants.find((c) => c.id === attackerId);
  const d = e.combatants.find((c) => c.id === defenderId);
  if (!a || !d || !d.zoneId) return false;
  const hostiles = active(e).filter((c) => c.sideId !== d.sideId && c.zoneId === d.zoneId && c.id !== a.id);
  return hostiles.length >= 1;
}

function sideForce(engine: Engine, world: World, c: Combatant, s: ClashSide, role: string): number {
  if (s.shape !== undefined) {
    if (!c.characterId) throw new Rejected(`${c.name}'s training is in its Force`);
    checkShape(engine, s.shape);
  }
  if (c.characterId) {
    if (!s.attribute) throw new Rejected(`name the Attribute ${c.name} ${role} with`);
    const raw = rawStats(world.characters.get(c.characterId)!)[s.attribute];
    if (raw === undefined) throw new Rejected(`${s.attribute} is not an Attribute`);
    return engine.force(raw, c.grade);
  }
  if (s.force === undefined || !Number.isInteger(s.force) || s.force < 0) throw new Rejected(`enter ${c.name}'s Force`);
  return s.force;
}

// ------------------------------------------------------ class techniques ---

function heldTechnique(world: World, characterId: string | undefined, who: string) {
  const ch = characterId ? world.characters.get(characterId) : undefined;
  const held = ch?.classes?.held;
  if (!ch || !held) throw new Rejected(`${who} holds no class`);
  return { ch, held, t: held.technique };
}

/**
 * Pays a class technique's cost (Classes, "One technique"): 5 Aether at F (×10 per Grade of
 * acquisition), or once per fight, or 10 Health or Exposed until the next turn.
 */
function payTechnique(
  engine: Engine,
  world: World,
  e: Encounter | null,
  cb: Combatant | null,
  characterId: string,
  choice?: "health" | "exposed",
): Effect[] {
  const { ch, held, t } = heldTechnique(world, characterId, world.characters.get(characterId)?.name ?? characterId);
  const out: Effect[] = [{ kind: "technique-used", characterId, name: t.name }];
  if (t.cost === "Aether") {
    const cost = engine.classTechniqueCost(held.grade);
    if (ch.aether < cost) throw new Rejected(`${ch.name} has ${ch.aether} Aether and ${t.name} costs ${cost}`);
    ch.aether -= cost;
  } else if (t.cost === "Frequency") {
    if (!e || !cb) throw new Rejected(`${t.name} is once per fight: it is used in one`);
    if (cb.techniqueUsed) throw new Rejected(`${ch.name} has used ${t.name} this fight`);
    cb.techniqueUsed = true;
  } else {
    const kind = t.drawback ?? choice ?? "health";
    if (kind === "exposed") {
      if (!cb) throw new Rejected(`Exposed is a fight's state: outside one, ${t.name} costs 10 Health`);
      cb.exposed = { started: false };
    } else {
      const hurt = engine.rules.classes.technique.drawback_health as number;
      if (e && cb) out.push(...changeHp(engine, world, e, cb, -hurt));
      else ch.hp = Math.max(0, ch.hp - hurt);
    }
  }
  return out;
}

/** A technique's Clash hook bonus on this side, or 0; rejects a technique that cannot shape it. */
function techniqueBonus(world: World, c: Combatant, s: ClashSide, role: "attack" | "defense"): number {
  if (!s.technique) return 0;
  const { t } = heldTechnique(world, c.characterId, c.name);
  const h = t.hook;
  if (h?.kind === "heal") throw new Rejected(`${t.name} heals; it does not shape a Clash`);
  if (h?.kind === "clash") {
    if (h.side !== "either" && h.side !== role) throw new Rejected(`${t.name} goes with ${h.side === "attack" ? "an attack" : "a defense"}`);
    return h.bonus;
  }
  if (role === "defense") throw new Rejected(`${t.name} does not shape a defense`);
  return 0;
}

/** A class technique on its own: the cost, its Beat in a fight, and a heal hook's Health. */
export function useTechnique(engine: Engine, world: World, a: UseTechnique): Effect[] {
  const who = world.characters.get(a.characterId);
  if (!who) throw new Rejected(`no character ${a.characterId}`);
  if (who.dead) throw new Rejected(`${who.name} is dead`);
  const { t } = heldTechnique(world, a.characterId, who.name);
  if (t.hook?.kind === "clash") throw new Rejected(`${t.name} is part of a Clash: declare it with the attack${t.hook.side === "attack" ? "" : " or the defense"}`);
  const e = world.encounter && !world.encounter.ended ? world.encounter : null;
  const cb = e?.combatants.find((c) => c.characterId === a.characterId && !c.out) ?? null;
  const out: Effect[] = [];
  if (e && cb) {
    if (cb.downed) throw new Rejected(`${cb.name} is Downed`);
    if (!t.noBeat) spend(e, cb, t.name);
  }
  if (t.hook?.kind === "heal") {
    if (!a.targetId) throw new Rejected(`${t.name} restores Health to someone: name them`);
    if (e && cb) {
      const target = combatant(e, a.targetId);
      if (target.dead || target.out) throw new Rejected(`${target.name} is out of the fight`);
      if (t.hook.reach === "zone" && !sameZone(cb, target)) throw new Rejected(`${target.name} is not in ${cb.name}'s Zone`);
      out.push(...payTechnique(engine, world, e, cb, a.characterId, a.drawback));
      out.push(...changeHp(engine, world, e, target, t.hook.amount));
      return out;
    }
    const target = world.characters.get(a.targetId);
    if (!target || target.dead) throw new Rejected("name a living character to heal");
    // Outside a fight the heal reaches the user or their party (Gabriel, 2026-10-01).
    const party = [...world.parties.values()].find((p) => p.members.includes(a.characterId));
    if (target.id !== a.characterId && !party?.members.includes(target.id)) throw new Rejected(`${target.name} is not in ${world.characters.get(a.characterId)!.name}'s party`);
    out.push(...payTechnique(engine, world, null, null, a.characterId, a.drawback));
    target.hp = Math.min(maxHpOf(engine, target), target.hp + t.hook.amount);
    return out;
  }
  return [...out, ...payTechnique(engine, world, e && cb ? e : null, cb, a.characterId, a.drawback)];
}

/**
 * Pays a declared Surge: half of Maximum Aether, or less against a higher-Grade opponent when the
 * class permission says so (Above You), or in Health when it allows that (Blood for Aether).
 */
function paySurge(engine: Engine, world: World, e: Encounter, c: Combatant, s: ClashSide, against: Combatant): Effect[] {
  if (!s.surge) {
    if (s.surgeHealth) throw new Rejected("Health pays for a Surge only when one is declared");
    return [];
  }
  if (!c.characterId) throw new Rejected("record a creature's Surge in its modifier");
  const ch = world.characters.get(c.characterId)!;
  const hook = permissionOf(world, c);
  if (s.surgeHealth) {
    if (hook?.kind !== "surge-health") throw new Rejected(`${ch.name} pays a Surge in Aether`);
    return changeHp(engine, world, e, c, -hook.health);
  }
  const cost = surgeCostAgainst(engine, world, c, against);
  if (ch.aether < cost) throw new Rejected(`${ch.name} has ${ch.aether} Aether and a Surge costs ${cost}`);
  ch.aether -= cost;
  return [];
}

/** What a character's Surge costs against this opponent. */
export function surgeCostAgainst(engine: Engine, world: World, c: Combatant, against: Combatant | undefined): number {
  const ch = world.characters.get(c.characterId!)!;
  const cost = engine.surgeCost(maxAetherOf(engine, ch));
  const hook = permissionOf(world, c);
  if (hook?.kind === "surge-up" && against && engine.gradeOrder(against.grade) > engine.gradeOrder(c.grade)) return Math.min(cost, hook.cost);
  return cost;
}

/** The Beats of the defender's next turn: this round's if it is still to come, else next round's. */
function nextTurnBeats(engine: Engine, e: Encounter, c: Combatant): { beats: number; thisRound: boolean } {
  return turnStillToCome(e, c) ? { beats: c.beats, thisRound: true } : { beats: Math.max(0, turnBeats(engine, c) - c.debt), thisRound: false };
}

function attack(engine: Engine, world: World, a: Attack, id: string): Effect[] {
  const e = fight(world);
  if (e.round === 0 && !(e.surprise && e.acting === a.attackerId && !a.free)) throw new Rejected("roll Initial Momentum first");
  noClash(e);
  const att = combatant(e, a.attackerId);
  const def = combatant(e, a.defenderId);
  if (att.out || def.out) throw new Rejected("both must be in the fight");
  if (att.downed) throw new Rejected(`${att.name} is Downed`);
  if (def.downed) throw new Rejected(`${def.name} is Downed: an attack on them is an execution`);
  if (att.sideId === def.sideId) throw new Rejected(`${def.name} is on ${att.name}'s side`);
  if (!Number.isInteger(a.attack.modifier)) throw new Rejected("modifiers are whole numbers");
  sideForce(engine, world, att, a.attack, "attacks");
  if (a.free && (a.rush || a.reaction)) throw new Rejected("a free strike is neither a Rush nor a reaction");
  if (a.rush && a.reaction) throw new Rejected("a Rush comes on the attacker's own turn");
  if (a.reaction) {
    // On someone else's turn for no Beat: a technique used as a reaction, or the permission's.
    if (e.acting === att.id) throw new Rejected(`${att.name} is acting; a reaction comes on someone else's turn`);
    if (a.attack.technique) {
      const { t } = heldTechnique(world, att.characterId, att.name);
      if (!t.reaction) throw new Rejected(`${t.name} is not used on someone else's turn`);
    } else {
      if (permissionOf(world, att)?.kind !== "reaction") throw new Rejected(`${att.name}'s class grants no reaction`);
      const max = engine.rules.classes.permission.reactions_per_encounter as number;
      if ((att.reactionsUsed ?? 0) >= max) throw new Rejected(`${att.name} has used ${permissionName(world, att)} this fight`);
      att.reactionsUsed = (att.reactionsUsed ?? 0) + 1;
    }
  } else if (!a.free) {
    if (e.acting !== att.id) throw new Rejected(`${att.name} is not acting; an attack off-turn is a free strike`);
    if (att.beats < 1) throw new Rejected(`${att.name} has no Beats left`);
    if (a.rush) {
      // Rush: into the Zone and the attack there, for the attack's one Beat.
      if (permissionOf(world, att)?.kind !== "rush") throw new Rejected(`${att.name}'s class grants no Rush`);
      if (!e.zones.some((z) => z.id === a.rush)) throw new Rejected(`no Zone ${a.rush}`);
      if (att.zoneId === a.rush) throw new Rejected(`${att.name} is already there: an attack in the same Zone is an ordinary attack`);
      if (def.zoneId && def.zoneId !== a.rush) throw new Rejected(`${def.name} is not in that Zone`);
      att.zoneId = a.rush;
    }
    att.beats -= 1;
    att.spent.push(`${a.rush ? `${permissionName(world, att)}: ` : ""}${a.label?.trim() || "Attack"}`);
  }
  stir(att);
  if (att.huntsByReading && def.readAsDead) throw new Rejected(`${att.name} hunts by the System's reading and finds no life in ${def.name}`);
  const surged = paySurge(engine, world, e, att, a.attack, def);
  techniqueBonus(world, att, a.attack, "attack");
  const paid = [...surged, ...(a.attack.technique ? payTechnique(engine, world, e, att, att.characterId!) : [])];
  e.clash = {
    id,
    attackerId: att.id,
    defenderId: def.id,
    attack: { ...a.attack },
    flanking: Boolean(a.flanking),
    cornered: Boolean(a.cornered),
    free: Boolean(a.free),
    stage: "defense",
  };
  if (a.label?.trim()) e.clash.label = a.label.trim();
  return paid;
}

function checkDice(engine: Engine, grade: string, d: Dice | undefined, advantage: boolean) {
  if (!d) throw new Rejected("the dice were not rolled");
  checkCascade(engine, grade, d.natural);
  if (advantage) {
    if (d.dropped === undefined || d.dropped > d.natural[0]!) throw new Rejected("Advantage keeps the higher of two dice");
  } else if (d.dropped !== undefined) throw new Rejected("only Advantage sets a die aside");
}

function defend(engine: Engine, world: World, a: Defend): Effect[] {
  const e = fight(world);
  const cl = e.clash;
  if (!cl || cl.stage !== "defense") throw new Rejected("no attack is waiting on a defense");
  const att = combatant(e, cl.attackerId);
  const def = combatant(e, cl.defenderId);
  if (!Number.isInteger(a.defense.modifier)) throw new Rejected("modifiers are whole numbers");
  const attForce = sideForce(engine, world, att, cl.attack, "attacks");
  const defForce = sideForce(engine, world, def, a.defense, "defends");
  checkDice(engine, att.grade, a.attackDice, Boolean(cl.attack.advantage));
  checkDice(engine, def.grade, a.defenseDice, Boolean(a.defense.advantage));
  const surged = paySurge(engine, world, e, def, a.defense, att);
  techniqueBonus(world, def, a.defense, "defense");
  const paid = [...surged, ...(a.defense.technique ? payTechnique(engine, world, e, def, def.characterId!) : [])];

  const r = engine.rules;
  const prof = (c: Combatant, s: ClashSide) =>
    s.shape !== undefined && c.characterId ? proficiencyOf(engine, world.characters.get(c.characterId)!, s.shape).bonus : 0;
  const mods = (c: Combatant, s: ClashSide, flank: boolean) =>
    s.modifier +
    prof(c, s) +
    techniqueBonus(world, c, s, c.id === att.id ? "attack" : "defense") +
    (s.surge ? r.combat.surge.bonus : 0) +
    (flank ? r.resolution.flanking_bonus : 0) +
    (c.exposed ? r.resolution.exposed : 0);
  const attMods = mods(att, cl.attack, cl.flanking);
  const defMods = mods(def, a.defense, false);
  const attDice = sum(a.attackDice!.natural);
  const defDice = sum(a.defenseDice!.natural);
  const out = engine.clash(attDice, attForce, defDice, defForce, att.grade, def.grade, attMods, defMods);

  const next = nextTurnBeats(engine, e, def);
  let yieldCap = def.yields ? next.beats : 0;
  if (cl.cornered) yieldCap = Math.min(yieldCap, r.combat.yield.cornered_max_beats);
  const result: ClashResult = {
    attackerId: att.id,
    defenderId: def.id,
    attackTotal: out.attacker_total,
    defenseTotal: out.defender_total,
    margin: out.margin,
    attackerWins: out.attacker_wins,
    turnedAside: out.turned_aside,
    attackExploded: a.attackDice!.natural.length > 1,
    defenseExploded: a.defenseDice!.natural.length > 1,
    yieldCap,
  };
  if (cl.label) result.label = cl.label;
  cl.defense = { ...a.defense };
  cl.result = result;

  const cascade = r.grades.volatility.battle_memory_cascade_dice;
  const rolls: MomentumRollRecord[] = [
    { combatantId: att.id, natural: a.attackDice!.natural, force: attForce, total: out.attacker_total, label: cl.label ?? "Attack" },
    { combatantId: def.id, natural: a.defenseDice!.natural, force: defForce, total: out.defender_total, label: "Defense" },
  ];
  const battleMemory = [
    ...(att.characterId && a.attackDice!.natural.length - 1 >= cascade ? [att.characterId] : []),
    ...(def.characterId && a.defenseDice!.natural.length - 1 >= cascade ? [def.characterId] : []),
  ];
  const effects: Effect[] = [
    ...paid,
    { kind: "clash", encounterId: e.id, attackerId: att.id, defenderId: def.id, margin: out.margin, attackTotal: out.attacker_total, defenseTotal: out.defender_total, rolls, battleMemory },
  ];
  // One Mark per exploding roll made with a weapon shape.
  for (const [c, s, d] of [
    [att, cl.attack, a.attackDice!],
    [def, a.defense, a.defenseDice!],
  ] as const) {
    if (c.characterId && s.shape !== undefined && d.natural.length > 1) effects.push(addMark(engine, world.characters.get(c.characterId)!, s.shape));
  }

  // The Clash waits while the defender can Yield or an ally can cover them.
  if (out.attacker_wins && out.margin > 0 && (yieldCap > 0 || coverers(engine, world, e, def).length > 0)) {
    cl.stage = "yield";
    return effects;
  }
  // Nothing to Yield (the defender won, a tie, or no Beat to give): the Clash resolves now.
  return [...effects, ...land(engine, world, e, 0)];
}

/** Applies the pending Clash's outcome with `y` Beats Yielded, and clears it. */
function land(engine: Engine, world: World, e: Encounter, y: number): Effect[] {
  const cl = e.clash!;
  const res = cl.result!;
  const att = combatant(e, cl.attackerId);
  const def = combatant(e, cl.defenderId);
  const r = engine.rules;
  const out: Effect[] = [];
  if (!res.attackerWins) {
    // Turned Aside: the defender won by 40 or more and the attacker is Exposed.
    if (res.turnedAside) att.exposed = { started: false };
    res.yielded = 0;
    res.remaining = 0;
    res.damage = 0;
    res.drivenBack = false;
    res.drivable = false;
  } else {
    if (y > 0) {
      const next = nextTurnBeats(engine, e, def);
      if (next.thisRound) def.beats -= y;
      else def.debt += y;
    }
    const cut = (res.covers ?? []).reduce((n, c) => n + c.cut, 0);
    const remaining = Math.max(0, res.margin - cut - y * r.combat.yield.margin_reduction_per_beat);
    const damage = remaining * engine.damageMultiplier(att.grade);
    const drivenBack = remaining >= r.resolution.rule_of_40.driven_back_margin;
    res.yielded = y;
    res.remaining = remaining;
    res.damage = damage;
    res.drivenBack = drivenBack;
    res.drivable = drivenBack || y >= r.combat.yield.max_beats;
    if (drivenBack) def.exposed = { started: false };
    if (damage > 0 && !e.firstBlood) e.firstBlood = att.id;
    if (damage > 0) out.push(...changeHp(engine, world, e, def, -damage, att.id));
  }
  e.lastClash = res;
  e.clash = null;
  return [{ kind: "clash-resolved", encounterId: e.id, defenderId: def.id, yielded: res.yielded!, damage: res.damage!, drivenBack: res.drivenBack!, turnedAside: res.turnedAside }, ...out];
}

function resolve(engine: Engine, world: World, a: ResolveClash): Effect[] {
  const e = fight(world);
  const cl = e.clash;
  if (!cl || cl.stage !== "yield") throw new Rejected("no Clash is waiting on a Yield");
  if (!Number.isInteger(a.yield) || a.yield < 0) throw new Rejected("Yield is a whole number of Beats");
  if (a.yield > cl.result!.yieldCap) {
    const def = combatant(e, cl.defenderId);
    throw new Rejected(`${def.name} can give up ${cl.result!.yieldCap} Beat${cl.result!.yieldCap === 1 ? "" : "s"} here`);
  }
  return land(engine, world, e, a.yield);
}

/** Allies who can cover the defender now: the permission held, in the Zone, a Beat to give, not yet this round. */
export function coverers(engine: Engine, world: World, e: Encounter, def: Combatant): Combatant[] {
  return e.combatants.filter(
    (c) =>
      canTurn(c) &&
      c.id !== def.id &&
      c.sideId === def.sideId &&
      sameZone(c, def) &&
      permissionOf(world, c)?.kind === "cover" &&
      c.coveredRound !== e.round &&
      nextTurnBeats(engine, e, c).beats >= 1,
  );
}

function cover(engine: Engine, world: World, a: Cover): Effect[] {
  const e = fight(world);
  const cl = e.clash;
  if (!cl || cl.stage !== "yield") throw new Rejected("no ally has lost a Clash still to land");
  const c = combatant(e, a.combatantId);
  const def = combatant(e, cl.defenderId);
  const hook = permissionOf(world, c);
  if (hook?.kind !== "cover") throw new Rejected(`${c.name}'s class does not cover an ally`);
  if (c.id === def.id) throw new Rejected(`${permissionName(world, c)} covers an ally, not ${c.name}`);
  if (!coverers(engine, world, e, def).includes(c)) {
    if (c.sideId !== def.sideId) throw new Rejected(`${def.name} is not ${c.name}'s ally`);
    if (!sameZone(c, def)) throw new Rejected(`${c.name} must be in ${def.name}'s Zone`);
    if (c.coveredRound === e.round) throw new Rejected(`${c.name} has used ${permissionName(world, c)} this round`);
    throw new Rejected(`${c.name} has no Beat to give from the next turn`);
  }
  // The Beat comes from the coverer's next turn, as a Yield does.
  const next = nextTurnBeats(engine, e, c);
  if (next.thisRound) c.beats -= 1;
  else c.debt += 1;
  c.coveredRound = e.round;
  stir(c);
  const res = cl.result!;
  res.covers = [...(res.covers ?? []), { combatantId: c.id, cut: hook.cut }];
  // With nothing left to Yield against, or no Yield to give, the Clash lands now.
  if (res.yieldCap === 0 || res.margin - res.covers.reduce((n, x) => n + x.cut, 0) <= 0) return land(engine, world, e, 0);
  return [];
}

/** What a player may record in a fight, for their own character; everything else is the GM's. */
export function authorizeCombatPlayer(world: World, a: CombatAction, userId: string): void {
  const e = world.encounter;
  const own = (combatantId: string | undefined) => {
    const c = e?.combatants.find((x) => x.id === combatantId);
    const ch = c?.characterId ? world.characters.get(c.characterId) : undefined;
    if (!ch || ch.playerId !== userId) throw new Rejected("a player acts only for their own character");
  };
  switch (a.type) {
    case "combat.act":
    case "combat.beat":
    case "combat.done":
    case "combat.seize":
      return own(a.combatantId);
    case "combat.move":
      if (a.forced) throw new Rejected("a forced move is the GM's");
      return own(a.combatantId);
    case "combat.attack":
      if (a.free) throw new Rejected("the GM calls a free strike");
      return own(a.attackerId);
    case "combat.defend":
    case "combat.resolve":
      return own(e?.clash?.defenderId);
    case "combat.cover":
      return own(a.combatantId);
    case "combat.stabilize":
    case "combat.execute":
    case "combat.pill":
      return own(a.combatantId);
    case "combat.will":
      if (a.reason === "principle") return own(a.combatantId);
      if (a.reason === "intervention") return own(a.helperId);
      throw new Rejected("the GM calls the entity hurt or distracted");
    default:
      throw new Rejected(`only the GM records ${a.type}`);
  }
}

export function applyCombat(engine: Engine, world: World, a: CombatAction, env: Envelope): Effect[] {
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
      return round(engine, world);
    case "combat.hp":
      return hp(engine, world, a);
    case "combat.end":
      return end(engine, world);
    case "combat.attack":
      return attack(engine, world, a, env.id);
    case "combat.defend":
      return defend(engine, world, a);
    case "combat.resolve":
      return resolve(engine, world, a);
    case "combat.cover":
      return cover(engine, world, a);
    case "combat.move":
      return move(world, a);
    case "combat.exposed":
      return setExposed(world, a);
    case "combat.zones":
      return setZones(world, a);
    case "combat.fate":
      return fate(engine, world, a);
    case "combat.stabilize":
      return stabilize(engine, world, a);
    case "combat.execute":
      return execute(world, a);
    case "combat.pill":
      return pill(engine, world, a);
    case "combat.aura":
      return aura(engine, world, a);
    case "combat.will":
      return will(engine, world, a);
    case "combat.suppress":
      return suppress(engine, world, a);
    case "combat.surprise":
      return surprise(engine, world, a);
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

/**
 * Rolls the checks slice 3 adds (stabilizing, the Will Save, Aura Pressure's saves) for an
 * action that arrives without dice. A roller whose Force alone meets the Resistance rolls
 * nothing. Returns the action unchanged when it cannot be rolled; the record then says why.
 */
export function rollCheckDice<A extends Stabilize | WillSave | AuraPressure>(engine: Engine, world: World, a: A, d100: D100): A {
  const e = world.encounter;
  if (!e || e.ended) return a;
  const who = (id: string | undefined) => e.combatants.find((c) => c.id === id);
  const roll = (c: Combatant, force: number, resistance: number, advantage = false): Dice | undefined =>
    force >= resistance ? undefined : rollD100s(engine.volatilityThreshold(c.grade), { advantage }, d100);
  try {
    if (a.type === "combat.stabilize") {
      if (a.dice) return a;
      const helper = who(a.combatantId);
      if (!helper) return a;
      const force = helperForce(engine, world, helper, stabilizeAttribute(engine), a.force);
      const dice = roll(helper, force, engine.rules.combat.downed.stabilize_check.resistance, Boolean(a.advantage));
      return dice ? { ...a, dice } : a;
    }
    if (a.type === "combat.will") {
      const c = who(a.combatantId);
      if (a.dice || !c?.characterId || !e.aura) return a;
      const dice = roll(c, hrtForce(engine, world, c), e.aura.resistance);
      return dice ? { ...a, dice } : a;
    }
    if (a.saves) return a;
    const resistance = engine.auraResistance(a.flaring);
    const saves = auraSavers(engine, e, a.entityId, Boolean(a.flare)).map((c) => {
      const dice = roll(c, hrtForce(engine, world, c), resistance);
      return dice ? { combatantId: c.id, dice } : { combatantId: c.id };
    });
    return { ...a, saves };
  } catch (err) {
    if (err instanceof Rejected) return a;
    throw err;
  }
}
