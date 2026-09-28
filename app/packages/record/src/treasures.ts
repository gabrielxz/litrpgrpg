/**
 * Attribute Treasures (Items, "Attribute Treasures"). Absorbing one raises a single Attribute's
 * Raw value permanently, by the treasure's points scaled ×10 per Grade, and the character
 * chooses which Attribute. It takes an hour spent defenseless, so it never happens in a
 * running fight. A treasure works only in a body of its own Grade; eaten by another, it does
 * nothing and is gone. Points past the Grade cap are lost. It never touches VE.
 *
 * The GM records it (the treasure's size is the GM's to know; the Attribute is the player's
 * choice, said at the table). When the treasure is carried, it comes out of the pack.
 */
import { ATTRIBUTES, type Engine } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected, type World, permanentStats } from "./fold.ts";
import { take } from "./inventory.ts";

export interface AbsorbTreasure {
  type: "treasure.absorb";
  characterId: string;
  /** The treasure's size, by its name in `items.yaml`: Lesser, Standard, or Greater. */
  treasure: string;
  /** The treasure's Grade. */
  grade: string;
  /** The Attribute the character chose. */
  attribute: string;
  /** The carried stack it comes from, when the pack holds it: one is taken. */
  item?: string;
}

/** A treasure absorbed, kept on the character: what landed on the sheet. */
export interface AbsorbedTreasure {
  id: string;
  name: string;
  attribute: string;
  points: number;
}

export interface TreasureSize {
  name: string;
  grade: string;
  raw_points: number;
}

export const treasureSizes = (engine: Engine): TreasureSize[] => engine.rules.items.attribute_treasures;

/** The Raw points a treasure of this size and Grade carries. */
export function treasurePoints(engine: Engine, size: string, grade: string): number {
  const row = treasureSizes(engine).find((t) => t.name.toLowerCase() === size.trim().toLowerCase());
  if (!row) throw new Rejected(`no Attribute Treasure called ${size}; the sizes are ${treasureSizes(engine).map((t) => t.name).join(", ")}`);
  // The table lists F-Grade values; values scale with the Grade (Items, "Values scale ×10 per Grade").
  return (row.raw_points * engine.scale(grade)) / engine.scale(row.grade);
}

/** Raw points from absorbed treasures, by Attribute. */
export function treasureStats(c: CharacterState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of c.treasures ?? []) out[t.attribute] = (out[t.attribute] ?? 0) + t.points;
  return out;
}

export function absorbTreasure(engine: Engine, world: World, a: AbsorbTreasure, id: string): Effect[] {
  const c = world.characters.get(a.characterId);
  if (!c) throw new Rejected(`no character ${a.characterId}`);
  if (c.dead) throw new Rejected(`${c.name} is dead`);
  if (c.hp === 0) throw new Rejected(`${c.name} is Downed and cannot absorb anything`);
  if (!(ATTRIBUTES as readonly string[]).includes(a.attribute)) throw new Rejected(`${a.attribute} is not an Attribute`);
  const e = world.encounter;
  if (e && !e.ended && e.combatants.some((x) => !x.out && x.characterId === c.id))
    throw new Rejected(`absorbing takes an hour spent defenseless: ${c.name} is in a running fight`);
  let grade: string;
  try {
    grade = engine.grade(a.grade).code;
  } catch {
    throw new Rejected(`no Grade ${a.grade}`);
  }
  const offered = treasurePoints(engine, a.treasure, grade);
  const size = treasureSizes(engine).find((t) => t.name.toLowerCase() === a.treasure.trim().toLowerCase())!.name;
  const name = a.item ? take(world, c.id, a.item, 1) : `${size} Attribute Treasure`;

  if (grade !== c.grade) return [{ kind: "treasure-absorbed", characterId: c.id, name, attribute: a.attribute, points: 0, noEffect: "grade" }];
  const now = permanentStats(c)[a.attribute]!;
  const points = Math.max(0, Math.min(offered, engine.statCap(c.grade) - now));
  const lost = offered - points;
  if (points) c.treasures = [...(c.treasures ?? []), { id, name, attribute: a.attribute, points }];
  return [{ kind: "treasure-absorbed", characterId: c.id, name, attribute: a.attribute, points, ...(lost ? { lost } : {}) }];
}
