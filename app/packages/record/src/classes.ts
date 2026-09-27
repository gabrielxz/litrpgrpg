/**
 * Classes (Classes; Progression, "Class Selection (Level 10)").
 *
 * At Level 10 the GM writes three offers, each the book's package: a name, the System's notice,
 * a growth profile in one of three shapes, one technique, and one standing permission. An offer
 * may be one of the book's classes as written (`rules/classes.yaml`) or written fresh for the
 * character. The offers reach the player when the GM records them, and they stand until the
 * player accepts one; they cannot be refused. Accepting adds the selection bonus to the lead
 * Attribute, then the profile places every held assigned point from Level 10 on, and places each
 * later level's at once. A profile's returned points arrive as free points.
 *
 * A profile point bound for a stat at the cap is lost, and so is selection bonus past it
 * (Gabriel, 2026-09-27: assigned points are never redirected; queued for Progression). A permission used once a day is ready again at the next dawn on
 * the in-game clock; without the clock the GM keeps the count.
 */
import { ATTRIBUTES, type Engine, type Stats } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected, type World, assignedEffect, landAssigned, permanentStats } from "./fold.ts";
import { MINUTES_PER_DAY } from "./clock.ts";

export type ProfileShape = "Fixed" | "Guided" | "Open";
export type CostShape = "Aether" | "Frequency" | "Drawback";

/**
 * What the app applies of a technique itself (`classes.yaml`, the technique's `hook`): a bonus to
 * a Clash on a named side when the technique is declared with it, or Health restored to a target
 * within reach. A technique without one has its cost paid and its effect applied by the GM.
 */
export type TechniqueHook = { kind: "clash"; bonus: number; side: "attack" | "defense" | "either" } | { kind: "heal"; amount: number; reach: "zone" | "adjacent" };

/** One class package as offered: the System's text and the mechanics the table runs. */
export interface ClassPackage {
  name: string;
  /** The System's notice, in-world units only. */
  notice: string;
  /** The book class it was taken from, when offered as written. */
  book?: string;
  /** The Attributes in order, the first named the lead; the points total the shape's assigned points. */
  profile: { shape: ProfileShape; points: { attribute: string; points: number }[] };
  technique: {
    name: string;
    cost: CostShape;
    effect: string;
    actionEconomy?: boolean;
    hook?: TechniqueHook;
    /** A Drawback technique's drawback; absent, the player chooses when using it. */
    drawback?: "health" | "exposed";
    /** A reaction, or a part of a Clash: it takes no Beat of its own. */
    noBeat?: boolean;
  };
  permission: { name: string; effect: string; actionEconomy?: boolean; onceADay?: boolean };
  /** Carries a power from the guarded list: the GM's to know, never shown to the player. */
  guarded?: boolean;
}

export interface HeldClass extends ClassPackage {
  /** The selection bonus that landed on the lead, and any lost past the cap. */
  bonus: number;
  lost?: number;
  /** The Grade it was acquired at: an Aether technique costs 5 at F, ×10 per Grade of acquisition. */
  grade: string;
}

export interface ClassState {
  /** The offers standing, until one is accepted. */
  offers?: ClassPackage[];
  held?: HeldClass;
  /** The dawn-to-dawn day on which the once-a-day permission was last used. */
  usedDay?: number;
}

/** The GM records the three offers. */
export interface OfferClasses {
  type: "class.offer";
  characterId: string;
  offers: ClassPackage[];
}

/** The player accepts one offer, by name; the GM may record it for a player away. */
export interface AcceptClass {
  type: "class.accept";
  characterId: string;
  name: string;
}

/** The character uses a once-a-day permission. */
export interface UseClassPermission {
  type: "class.use";
  characterId: string;
}

/**
 * The character uses the class technique on its own (combat.ts runs it): its cost paid, its Beat
 * spent in a fight unless it takes none, and a heal hook applied to the target. A technique that
 * shapes a Clash is declared on the Clash instead (`ClashSide.technique`).
 */
export interface UseTechnique {
  type: "class.technique";
  characterId: string;
  /** A heal's target: a combatant in the fight, or a character outside one. */
  targetId?: string;
  /** For a Drawback technique that names none: the player's choice. */
  drawback?: "health" | "exposed";
}

export type ClassAction = OfferClasses | AcceptClass | UseClassPermission | UseTechnique;

export function cloneClass(s: ClassState): ClassState {
  return {
    ...s,
    ...(s.offers ? { offers: s.offers.map(clonePackage) } : {}),
    ...(s.held ? { held: { ...clonePackage(s.held), bonus: s.held.bonus, grade: s.held.grade, ...(s.held.lost ? { lost: s.held.lost } : {}) } } : {}),
  };
}

function clonePackage(p: ClassPackage): ClassPackage {
  return {
    ...p,
    profile: { shape: p.profile.shape, points: p.profile.points.map((x) => ({ ...x })) },
    technique: { ...p.technique, ...(p.technique.hook ? { hook: { ...p.technique.hook } } : {}) },
    permission: { ...p.permission },
  };
}

/** The class's lead Attribute: the first its profile names. */
export const leadOf = (p: ClassPackage) => p.profile.points[0]!.attribute;

/** The book's classes as packages, ready to offer as written. */
export function bookClasses(engine: Engine): ClassPackage[] {
  return (engine.rules.classes.classes as any[]).map((c) => {
    const pkg: ClassPackage = {
      name: c.name,
      notice: c.notice,
      book: c.name,
      profile: { shape: c.profile.shape, points: Object.entries(c.profile.points as Stats).map(([attribute, points]) => ({ attribute, points })) },
      technique: { name: c.technique.name, cost: c.technique.cost, effect: c.technique.effect },
      permission: { name: c.permission.name, effect: c.permission.effect },
    };
    // The class's one action-economy effect is marked on whichever part carries it.
    if (c.permission.action_economy) pkg.permission.actionEconomy = true;
    if (c.permission.once_a_day) pkg.permission.onceADay = true;
    if (c.technique.reaction) pkg.technique.actionEconomy = true;
    if (c.technique.reaction || c.technique.no_own_beat) pkg.technique.noBeat = true;
    if (c.technique.drawback) pkg.technique.drawback = c.technique.drawback;
    const h = c.technique.hook;
    if (h?.clash !== undefined) pkg.technique.hook = { kind: "clash", bonus: h.clash, side: h.side };
    else if (h?.heal !== undefined) pkg.technique.hook = { kind: "heal", amount: h.heal, reach: h.reach };
    if (c.guarded) pkg.guarded = true;
    return pkg;
  });
}

/** The package's own problems against the book's rules; empty means it can be offered. */
export function packageProblems(engine: Engine, p: ClassPackage): string[] {
  const rules = engine.rules.classes;
  const out: string[] = [];
  const label = p.name.trim() || "an offer";
  if (!p.name.trim()) out.push("an offer needs a name");
  if (!p.notice.trim()) out.push(`${label} needs the System's notice`);
  const shape = (rules.profile.shapes as { shape: string; system: number }[]).find((s) => s.shape === p.profile.shape);
  if (!shape) out.push(`${label}: the profile is Fixed, Guided, or Open, not ${p.profile.shape}`);
  const seen = new Set<string>();
  let total = 0;
  for (const { attribute, points } of p.profile.points) {
    if (!(ATTRIBUTES as readonly string[]).includes(attribute)) out.push(`${label}: ${attribute} is not an Attribute`);
    else if (seen.has(attribute)) out.push(`${label}: the profile names ${attribute} twice`);
    seen.add(attribute);
    if (!Number.isInteger(points) || points < 1) out.push(`${label}: each Attribute in the profile takes a whole number of points from 1`);
    else total += points;
  }
  if (p.profile.points.length === 0) out.push(`${label}: the profile names at least its lead Attribute`);
  else if (shape && total !== shape.system)
    out.push(`${label}: a ${shape.shape} profile assigns ${shape.system} point${shape.system === 1 ? "" : "s"}, not ${total}`);
  const costs = (rules.technique.cost_shapes as { shape: string }[]).map((c) => c.shape);
  if (!costs.includes(p.technique.cost)) out.push(`${label}: the technique costs Aether, Frequency, or Drawback, not ${p.technique.cost}`);
  if (!p.technique.name.trim() || !p.technique.effect.trim()) out.push(`${label}: the technique needs a name and what it does`);
  if (!p.permission.name.trim() || !p.permission.effect.trim()) out.push(`${label}: the permission needs a name and what it does`);
  const h = p.technique.hook;
  const cap = rules.technique.bonus_cap as number;
  if (h?.kind === "clash" && (!Number.isInteger(h.bonus) || h.bonus < 1 || h.bonus > cap))
    out.push(`${label}: a technique's Clash bonus runs 1 to ${cap}, the Modifier Budget's peak`);
  if (h?.kind === "clash" && !["attack", "defense", "either"].includes(h.side)) out.push(`${label}: the bonus goes on an attack, a defense, or either`);
  if (h?.kind === "heal" && (!Number.isInteger(h.amount) || h.amount < 1)) out.push(`${label}: a heal restores a whole number of Health from 1`);
  if (h?.kind === "heal" && !["zone", "adjacent"].includes(h.reach)) out.push(`${label}: a heal reaches the Zone or the next one`);
  if (p.technique.drawback && p.technique.cost !== "Drawback") out.push(`${label}: only a Drawback technique names a drawback`);
  return out;
}

/** Advice the book gives, which the GM may overrule: shown beside the offer, never a block. */
export function packageWarnings(engine: Engine, p: ClassPackage): string[] {
  const out: string[] = [];
  const max = engine.rules.classes.permission.action_economy_effects_max as number;
  const effects = Number(Boolean(p.technique.actionEconomy)) + Number(Boolean(p.permission.actionEconomy));
  if (effects > max) out.push(`${p.name}: ${effects} action-economy effects; the book allows ${max} per class`);
  return out;
}

const dayIndex = (at: number, dawn: number) => Math.floor((at - dawn * 60) / MINUTES_PER_DAY);

/** Whether the once-a-day permission is spent until the next dawn; null without the clock. */
export function usedSinceDawn(world: Pick<World, "clock">, c: CharacterState): boolean | null {
  if (!world.clock) return null;
  return c.classes?.usedDay === dayIndex(world.clock.at, world.clock.dawn);
}

/**
 * Places one level's assigned points by the class profile; points bound for a stat at the cap
 * are lost. The profile's returned points arrive as free points.
 */
export function placeByProfile(engine: Engine, c: CharacterState): Effect[] {
  const held = c.classes!.held!;
  const scale = engine.scale(c.grade);
  const want: Stats = Object.fromEntries(held.profile.points.map((x) => [x.attribute, x.points * scale]));
  const { placed, lost } = landAssigned(engine, c, want);
  const system = held.profile.points.reduce((s, x) => s + x.points, 0);
  c.freePoints += (engine.rules.classes.profile.system_points_per_level - system) * scale;
  return assignedEffect(c, placed, lost);
}

function need(world: World, id: string): CharacterState {
  const c = world.characters.get(id);
  if (!c) throw new Rejected(`no character ${id}`);
  return c;
}

export function applyClasses(engine: Engine, world: World, a: ClassAction): Effect[] {
  const c = need(world, a.characterId);
  const sel = engine.rules.classes.selection;
  if (c.dead) throw new Rejected(`${c.name} is dead`);
  switch (a.type) {
    case "class.offer": {
      if (c.level < sel.level) throw new Rejected(`${c.name} is Level ${c.level}; the offers come at Level ${sel.level}`);
      if (c.classes?.held) throw new Rejected(`${c.name} holds ${c.classes.held.name}; new offers come at the F→E Breakthrough`);
      if (c.classes?.offers) throw new Rejected(`${c.name}'s offers stand until one is accepted; undo them to write others`);
      if (a.offers.length !== sel.offers) throw new Rejected(`the System offers ${sel.offers} classes, not ${a.offers.length}`);
      const problems = a.offers.flatMap((p) => packageProblems(engine, p));
      const names = a.offers.map((p) => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) problems.push("the offers need different names");
      if (problems.length) throw new Rejected(problems.join("; "));
      c.classes = { ...(c.classes ?? {}), offers: a.offers.map((p) => clonePackage({ ...p, name: p.name.trim() })) };
      // One notice, so the feed reads it in the book's order.
      const offers = a.offers.map((p) => ({ name: p.name.trim(), heading: sel.offer_notice.replace("{name}", p.name.trim()), notice: p.notice }));
      return [{ kind: "classification", characterId: c.id, text: sel.opening_notice, offers }];
    }
    case "class.accept": {
      const offer = c.classes?.offers?.find((p) => p.name === a.name);
      if (!offer) throw new Rejected(`${c.name} holds no offer named ${a.name}`);
      const lead = leadOf(offer);
      const want = engine.rules.classes.selection.lead_attribute_bonus as number;
      const bonus = Math.max(0, Math.min(want, engine.statCap(c.grade) - permanentStats(c)[lead]!));
      const held: HeldClass = { ...clonePackage(offer), bonus, grade: c.grade };
      if (want > bonus) held.lost = want - bonus;
      c.classes = { held };
      const out: Effect[] = [{ kind: "class-accepted", characterId: c.id, name: offer.name, lead, bonus }];
      // The bonus lands first, then every held level from Level 10 is placed by the profile.
      const classLevel = engine.rules.character.leveling.class_level as number;
      const waiting = c.pendingSystemLevels.filter((l) => l >= classLevel).sort((x, y) => x - y);
      c.pendingSystemLevels = c.pendingSystemLevels.filter((l) => l < classLevel);
      for (const _ of waiting) out.push(...placeByProfile(engine, c));
      return out;
    }
    case "class.technique":
      throw new Error("class.technique is run by the combat module");
    case "class.use": {
      const held = c.classes?.held;
      if (!held) throw new Rejected(`${c.name} holds no class`);
      if (!held.permission.onceADay) throw new Rejected(`${held.permission.name} is not limited to once a day`);
      const used: Effect[] = [{ kind: "class-used", characterId: c.id, name: held.permission.name }];
      if (!world.clock) return used;
      const day = dayIndex(world.clock.at, world.clock.dawn);
      if (c.classes!.usedDay === day) throw new Rejected(`${c.name} has used ${held.permission.name} since dawn`);
      c.classes!.usedDay = day;
      return used;
    }
  }
}
