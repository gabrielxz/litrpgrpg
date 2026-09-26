/**
 * Replaying the log. `fold` walks the envelopes in order and returns every character's state,
 * the effects each action had (the raw material for notices), and the actions that could not
 * apply. An action rejected on replay stays in the log: after a correction removes an earlier
 * award, a later point placement for a level the character no longer reaches is reported here
 * for the GM to resolve, and the sheets are computed without it.
 */
import { ATTRIBUTES, type Engine, type Stats } from "@gradebreaker/engine";
import type {
  Action,
  AwardVe,
  ChangeAether,
  ChangeHp,
  Collapse,
  Consolidate,
  CreateCharacter,
  CreatePregen,
  Envelope,
  PlaceSystemPoints,
  SpendFreePoints,
} from "./actions.ts";

export interface CharacterState {
  id: string;
  name: string;
  playerId?: string;
  background: string;
  pregen?: string;
  grade: string;
  level: number;
  /** Point buy. */
  base: Stats;
  /** Every System and free point placed since creation. */
  placed: Stats;
  /** Temporary Raw losses from collapses, waiting on a Consolidation completed without interruption. */
  temporary: { attribute: "FOR" | "POW"; actionId: string }[];
  hp: number;
  aether: number;
  /** Unrefined VE in the tank. */
  storedVe: number;
  /** Refined VE toward the next level. */
  refinedVe: number;
  /** Levels whose System points the GM has not yet placed. */
  pendingSystemLevels: number[];
  /** Free points the player holds unallocated. */
  freePoints: number;
}

export type Effect =
  | { kind: "created"; characterId: string }
  | { kind: "ve-acquired"; characterId: string; ve: number }
  | { kind: "saturation"; characterId: string; from: string; to: string }
  | { kind: "aether-refilled"; characterId: string; hour: number }
  | { kind: "level"; characterId: string; level: number; hour?: number }
  | { kind: "healed-full"; characterId: string; hour: number }
  | { kind: "collapsed"; characterId: string; attribute: "FOR" | "POW"; hours: number }
  | { kind: "temporary-returned"; characterId: string; attribute: "FOR" | "POW" }
  | { kind: "points-placed"; characterId: string; placement: Stats; by: "system" | "free" }
  | { kind: "voided"; targetId: string; reason: string };

export interface Rejection {
  envelope: Envelope;
  reason: string;
}

export interface FoldResult {
  characters: Map<string, CharacterState>;
  /** Effects keyed by the id of the action that produced them. */
  effects: Map<string, Effect[]>;
  rejected: Rejection[];
  /** Ids removed from the record by a void. */
  voided: Set<string>;
}

/** Thrown inside an action's handler; becomes a Rejection. */
export class Rejected extends Error {
  override name = "Rejected";
}

const sum = (s: Stats) => Object.values(s).reduce((a, b) => a + b, 0);

// ------------------------------------------------------ derived values ---

/** Raw Attributes as they stand: point buy, placed points, and any temporary collapse loss. */
export function rawStats(c: CharacterState): Stats {
  const out: Stats = {};
  for (const a of ATTRIBUTES) out[a] = (c.base[a] ?? 0) + (c.placed[a] ?? 0);
  for (const t of c.temporary) out[t.attribute]! -= 1;
  return out;
}

/** Raw Attributes without temporary losses: what the Grade cap is checked against. */
function permanentStats(c: CharacterState): Stats {
  const out: Stats = {};
  for (const a of ATTRIBUTES) out[a] = (c.base[a] ?? 0) + (c.placed[a] ?? 0);
  return out;
}

export function maxHpOf(engine: Engine, c: CharacterState): number {
  return engine.maxHp(rawStats(c).FOR!);
}

export function maxAetherOf(engine: Engine, c: CharacterState): number {
  return engine.maxAether(rawStats(c).POW!);
}

/** The last level of the character's Grade: 25 at F. */
export function capLevel(engine: Engine, c: CharacterState): number {
  return engine.grade(c.grade).level_range[1];
}

// --------------------------------------------------------------- fold ---

export function fold(engine: Engine, log: readonly Envelope[]): FoldResult {
  const voided = collectVoids(log);
  const characters = new Map<string, CharacterState>();
  const effects = new Map<string, Effect[]>();
  const rejected: Rejection[] = [...voided.rejected];
  const rejectedIds = new Set(rejected.map((r) => r.envelope.id));

  for (const env of log) {
    if (rejectedIds.has(env.id)) continue;
    if (env.action.type === "void") {
      effects.set(env.id, [{ kind: "voided", targetId: env.action.targetId, reason: env.action.reason }]);
      continue;
    }
    if (voided.ids.has(env.id)) continue;
    // Each action works on copies, so a rejected action leaves no partial change behind.
    const scratch = new Map([...characters].map(([k, v]) => [k, cloneState(v)]));
    try {
      const out = apply(engine, scratch, env);
      characters.clear();
      for (const [k, v] of scratch) characters.set(k, v);
      effects.set(env.id, out);
    } catch (e) {
      if (!(e instanceof Rejected)) throw e;
      rejected.push({ envelope: env, reason: e.message });
    }
  }
  return { characters, effects, rejected, voided: voided.ids };
}

function cloneState(c: CharacterState): CharacterState {
  return {
    ...c,
    base: { ...c.base },
    placed: { ...c.placed },
    temporary: [...c.temporary],
    pendingSystemLevels: [...c.pendingSystemLevels],
  };
}

/** A void is valid when its target came earlier, is not itself a void, and was not voided already. */
function collectVoids(log: readonly Envelope[]) {
  const seen = new Map<string, Envelope>();
  const ids = new Set<string>();
  const rejected: Rejection[] = [];
  for (const env of log) {
    const a = env.action;
    if (a.type === "void") {
      const target = seen.get(a.targetId);
      let reason: string | undefined;
      if (!target) reason = `no earlier action ${a.targetId}`;
      else if (target.action.type === "void") reason = "a void cannot be voided; record the action again instead";
      else if (ids.has(a.targetId)) reason = `${a.targetId} is already voided`;
      else if (env.actor.role === "player" && target.actor.userId !== env.actor.userId)
        reason = "a player can undo only their own actions";
      if (reason) rejected.push({ envelope: env, reason });
      else ids.add(a.targetId);
    }
    seen.set(env.id, env);
  }
  return { ids, rejected };
}

function apply(engine: Engine, chars: Map<string, CharacterState>, env: Envelope): Effect[] {
  const a = env.action;
  authorize(chars, env);
  switch (a.type) {
    case "character.create":
      return createCharacter(engine, chars, a);
    case "character.pregen":
      return createPregen(engine, chars, a);
    case "ve.award":
      return awardVe(engine, chars, a);
    case "consolidation.rest":
      return consolidate(engine, chars, a);
    case "saturation.collapse":
      return collapse(engine, chars, a, env.id);
    case "points.system":
      return placeSystem(engine, need(chars, a.characterId), a);
    case "points.free":
      return spendFree(engine, need(chars, a.characterId), a);
    case "hp.change":
      return changeHp(engine, need(chars, a.characterId), a);
    case "aether.change":
      return changeAether(engine, need(chars, a.characterId), a);
    case "void":
      throw new Error("voids are handled before apply");
  }
}

/** The GM records anything. A player spends their own character's free points, nothing else. */
function authorize(chars: Map<string, CharacterState>, env: Envelope) {
  if (env.actor.role === "gm") return;
  const a: Action = env.action;
  if (a.type !== "points.free") throw new Rejected(`only the GM records ${a.type}`);
  const c = chars.get(a.characterId);
  if (c && c.playerId !== env.actor.userId) throw new Rejected(`${c.name} is not this player's character`);
}

function need(chars: Map<string, CharacterState>, id: string): CharacterState {
  const c = chars.get(id);
  if (!c) throw new Rejected(`no character ${id}`);
  return c;
}

// --------------------------------------------------------- creation ---

function newCharacter(
  engine: Engine,
  id: string,
  name: string,
  stats: Stats,
  background: string,
  playerId?: string,
  pregen?: string,
): CharacterState {
  const d = engine.rules.character.derived;
  const c: CharacterState = {
    id,
    name,
    background,
    grade: d.starting_grade,
    level: d.starting_level,
    base: Object.fromEntries(ATTRIBUTES.map((a) => [a, stats[a]!])),
    placed: Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])),
    temporary: [],
    hp: 0,
    aether: 0,
    storedVe: d.starting_ve,
    refinedVe: 0,
    pendingSystemLevels: [],
    freePoints: 0,
  };
  if (playerId !== undefined) c.playerId = playerId;
  if (pregen !== undefined) c.pregen = pregen;
  c.hp = maxHpOf(engine, c);
  c.aether = maxAetherOf(engine, c);
  return c;
}

/** Point-buy rules from `rules/character.yaml`. Returns the problems; empty means legal. */
export function pointBuyProblems(engine: Engine, stats: Stats): string[] {
  const pb = engine.rules.character.point_buy;
  const problems: string[] = [];
  for (const k of Object.keys(stats)) {
    if (!(ATTRIBUTES as readonly string[]).includes(k)) problems.push(`${k} is not an Attribute`);
  }
  for (const a of ATTRIBUTES) {
    const v = stats[a];
    if (v === undefined || !Number.isInteger(v)) problems.push(`${a} needs a whole number`);
    else if (v < pb.min_per_stat || v > pb.max_per_stat)
      problems.push(`${a} ${v} is outside ${pb.min_per_stat} to ${pb.max_per_stat}`);
  }
  const total = sum(stats);
  if (total !== pb.points) problems.push(`the stats total ${total}; point buy spends exactly ${pb.points}`);
  return problems;
}

function createCharacter(engine: Engine, chars: Map<string, CharacterState>, a: CreateCharacter): Effect[] {
  if (chars.has(a.characterId)) throw new Rejected(`character ${a.characterId} already exists`);
  const problems = pointBuyProblems(engine, a.stats);
  if (problems.length) throw new Rejected(problems.join("; "));
  if (!a.background.trim()) throw new Rejected("a character needs a Background");
  chars.set(a.characterId, newCharacter(engine, a.characterId, a.name, a.stats, a.background, a.playerId));
  return [{ kind: "created", characterId: a.characterId }];
}

function createPregen(engine: Engine, chars: Map<string, CharacterState>, a: CreatePregen): Effect[] {
  if (chars.has(a.characterId)) throw new Rejected(`character ${a.characterId} already exists`);
  let p;
  try {
    p = engine.pregen(a.pregen);
  } catch {
    throw new Rejected(`no ready-made character named ${a.pregen}`);
  }
  chars.set(a.characterId, newCharacter(engine, a.characterId, p.name, p.stats, p.background, a.playerId, p.name));
  return [{ kind: "created", characterId: a.characterId }];
}

// --------------------------------------------------------------- VE ---

function awardVe(engine: Engine, chars: Map<string, CharacterState>, a: AwardVe): Effect[] {
  if (a.awards.length === 0) throw new Rejected("an award names at least one character");
  const ids = new Set<string>();
  const out: Effect[] = [];
  for (const { characterId, ve } of a.awards) {
    if (ids.has(characterId)) throw new Rejected(`${characterId} is listed twice in one award`);
    ids.add(characterId);
    if (!Number.isInteger(ve) || ve < 0) throw new Rejected(`an award is a whole number of VE, not ${ve}`);
    const c = need(chars, characterId);
    const before = engine.saturation(c.storedVe, c.grade).band;
    c.storedVe += ve;
    out.push({ kind: "ve-acquired", characterId, ve });
    const after = engine.saturation(c.storedVe, c.grade).band;
    if (after !== before) out.push({ kind: "saturation", characterId, from: before, to: after });
  }
  return out;
}

// ---------------------------------------------------- Consolidation ---

/**
 * Run full hours of Consolidation (Cultivation, "Consolidation (Structured Rest)"). Each hour
 * refines up to the rate, and a level lands the moment refined VE reaches its cost; each hour
 * restores a fifth of Max HP (fractions dropped) and the fifth restores the rest; the first
 * full hour refills Aether. At the Level cap nothing refines and the stockpile waits.
 */
function runHours(engine: Engine, c: CharacterState, hours: number, highDensity: boolean, from = 1): Effect[] {
  const out: Effect[] = [];
  const cons = engine.rules.cultivation.consolidation;
  const rate = engine.refineRate(c.grade, highDensity);
  const cost = engine.levelCost(c.grade);
  const cap = capLevel(engine, c);
  for (let h = from; h < from + hours; h++) {
    const bandBefore = engine.saturation(c.storedVe, c.grade).band;
    if (c.level < cap) {
      const r = Math.min(rate, c.storedVe);
      c.storedVe -= r;
      c.refinedVe += r;
      while (c.refinedVe >= cost && c.level < cap) {
        c.refinedVe -= cost;
        levelUp(engine, c);
        out.push({ kind: "level", characterId: c.id, level: c.level, hour: h });
      }
      if (c.level >= cap && c.refinedVe > 0) {
        // Refined past the cap within the hour: it waits in the tank with the rest.
        c.storedVe += c.refinedVe;
        c.refinedVe = 0;
      }
    }
    const bandAfter = engine.saturation(c.storedVe, c.grade).band;
    if (bandAfter !== bandBefore) out.push({ kind: "saturation", characterId: c.id, from: bandBefore, to: bandAfter });
    const maxHp = maxHpOf(engine, c);
    if (h >= cons.hp_full_at_hour) {
      if (c.hp < maxHp) out.push({ kind: "healed-full", characterId: c.id, hour: h });
      c.hp = maxHp;
    } else {
      c.hp = Math.min(maxHp, c.hp + Math.floor(maxHp / 5));
    }
    if (h === cons.aether_refills_at_full_hour) {
      c.aether = maxAetherOf(engine, c);
      out.push({ kind: "aether-refilled", characterId: c.id, hour: h });
    }
  }
  return out;
}

function levelUp(engine: Engine, c: CharacterState) {
  const lv = engine.rules.character.leveling;
  c.level += 1;
  c.pendingSystemLevels.push(c.level);
  c.freePoints += lv.free * engine.scale(c.grade);
}

function consolidate(engine: Engine, chars: Map<string, CharacterState>, a: Consolidate): Effect[] {
  if (a.rests.length === 0) throw new Rejected("a Consolidation names at least one character");
  const min = engine.rules.cultivation.consolidation.minimum_hours;
  const ids = new Set<string>();
  const out: Effect[] = [];
  for (const r of a.rests) {
    if (ids.has(r.characterId)) throw new Rejected(`${r.characterId} is listed twice in one rest`);
    ids.add(r.characterId);
    const c = need(chars, r.characterId);
    if (!Number.isInteger(r.hours) || r.hours < 0) throw new Rejected(`hours are whole and not negative, not ${r.hours}`);
    // A rest interrupted before its first hour completes changes nothing; an uninterrupted one takes at least the minimum.
    if (!r.interrupted && r.hours < min) throw new Rejected(`a completed Consolidation takes at least ${min} hour`);
    out.push(...runHours(engine, c, r.hours, a.highDensity));
    if (!r.interrupted) {
      for (const t of c.temporary) out.push({ kind: "temporary-returned", characterId: c.id, attribute: t.attribute });
      c.temporary = [];
    }
  }
  return out;
}

/** Full hours a rest must run to refine `storedVe` down to `target` or below. */
function hoursToRefineTo(engine: Engine, c: CharacterState, target: number, highDensity: boolean): number {
  return Math.max(1, Math.ceil((c.storedVe - target) / engine.refineRate(c.grade, highDensity)));
}

function collapse(engine: Engine, chars: Map<string, CharacterState>, a: Collapse, actionId: string): Effect[] {
  const c = need(chars, a.characterId);
  const sat = engine.saturation(c.storedVe, c.grade);
  if (!sat.collapse_clock) throw new Rejected(`${c.name} is not at Critical Saturation (stored ${c.storedVe} VE)`);
  c.temporary.push({ attribute: a.attribute, actionId });
  c.hp = Math.min(c.hp, maxHpOf(engine, c));
  c.aether = Math.min(c.aether, maxAetherOf(engine, c));

  const tolerance = engine.tolerance(c.grade);
  const capHours = engine.rules.cultivation.saturation.collapse_clock.at_level_cap_hours;
  const out: Effect[] = [];
  let hours = 0;
  // Unwakeable until stored VE falls to Tolerance or below; at the Level cap, 5 full hours.
  while (true) {
    const atCap = c.level >= capLevel(engine, c);
    const step = atCap ? capHours - hours : hoursToRefineTo(engine, c, tolerance, a.highDensity);
    if (step <= 0) break;
    out.push(...runHours(engine, c, step, a.highDensity, hours + 1));
    hours += step;
    if (c.storedVe <= tolerance) break;
  }
  return [{ kind: "collapsed", characterId: c.id, attribute: a.attribute, hours }, ...out];
}

// --------------------------------------------------------- level-ups ---

function checkPlacement(engine: Engine, c: CharacterState, placement: Stats): number {
  const cap = engine.statCap(c.grade);
  const now = permanentStats(c);
  for (const [attr, pts] of Object.entries(placement)) {
    if (!(ATTRIBUTES as readonly string[]).includes(attr)) throw new Rejected(`${attr} is not an Attribute`);
    if (!Number.isInteger(pts) || pts < 0) throw new Rejected(`points are whole and not negative, not ${pts}`);
    if (pts > 0 && now[attr]! + pts > cap)
      throw new Rejected(`${attr} is ${now[attr]} and the ${c.grade}-Grade cap is ${cap}: place these points elsewhere`);
  }
  return sum(placement);
}

function placeSystem(engine: Engine, c: CharacterState, a: PlaceSystemPoints): Effect[] {
  const lv = engine.rules.character.leveling;
  const i = c.pendingSystemLevels.indexOf(a.level);
  if (i < 0) throw new Rejected(`${c.name} has no unplaced System points for Level ${a.level}`);
  if (a.level >= lv.class_level)
    throw new Rejected(`from Level ${lv.class_level} the class profile places System points; class selection is not in the app yet`);
  const due = lv.system_assigned * engine.scale(c.grade);
  const total = checkPlacement(engine, c, a.placement);
  if (total !== due) throw new Rejected(`Level ${a.level} places exactly ${due} System points, not ${total}`);
  for (const [attr, pts] of Object.entries(a.placement)) c.placed[attr] = (c.placed[attr] ?? 0) + pts;
  c.pendingSystemLevels.splice(i, 1);
  return [{ kind: "points-placed", characterId: c.id, placement: a.placement, by: "system" }];
}

function spendFree(engine: Engine, c: CharacterState, a: SpendFreePoints): Effect[] {
  const total = checkPlacement(engine, c, a.placement);
  if (total === 0) throw new Rejected("spend at least one point");
  if (total > c.freePoints) throw new Rejected(`${c.name} holds ${c.freePoints} free points, not ${total}`);
  for (const [attr, pts] of Object.entries(a.placement)) c.placed[attr] = (c.placed[attr] ?? 0) + pts;
  c.freePoints -= total;
  return [{ kind: "points-placed", characterId: c.id, placement: a.placement, by: "free" }];
}

// ------------------------------------------------------ HP and Aether ---

function changeHp(engine: Engine, c: CharacterState, a: ChangeHp): Effect[] {
  if (!Number.isInteger(a.delta)) throw new Rejected("HP changes by whole numbers");
  // HP does not go below 0 or above Max HP (Core Mechanics, "Downed and Death").
  c.hp = Math.max(0, Math.min(maxHpOf(engine, c), c.hp + a.delta));
  return [];
}

function changeAether(engine: Engine, c: CharacterState, a: ChangeAether): Effect[] {
  if (!Number.isInteger(a.delta)) throw new Rejected("Aether changes by whole numbers");
  if (c.aether + a.delta < 0) throw new Rejected(`${c.name} has ${c.aether} Aether, not ${-a.delta}`);
  c.aether = Math.min(maxAetherOf(engine, c), c.aether + a.delta);
  return [];
}
