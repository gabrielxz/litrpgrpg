/**
 * Proficiencies and Marks (Core Mechanics, "Proficiencies"; Character Creation, "Proficiency").
 * A character starts with none. An attack or defense names the weapon shape it is made with;
 * the character's tier in that shape adds its bonus to the Clash, and when the die explodes
 * the character earns one Mark in it, however many dice the explosion adds. The first Mark
 * grants Trained, 3 make Seasoned, and 10 make Master in an E-Grade body; an F-Grade character
 * banks Marks past 10 and advances at the Breakthrough. Where the shape was unclear at the
 * roll, the GM records the Mark by hand.
 *
 * The Master's free action waits for Breakthrough in the app: no F-Grade body reaches Master.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected } from "./fold.ts";

/** The GM records a Mark the table earned where the roll did not name the shape. */
export interface MarkByHand {
  type: "proficiency.mark";
  characterId: string;
  shape: string;
}

export interface Proficiency {
  shape: string;
  marks: number;
  /** Trained, Seasoned, or Master; "untrained" before the first Mark. */
  tier: string;
  bonus: number;
}

export function shapes(engine: Engine): string[] {
  return engine.rules.character.fighting_domains;
}

export function checkShape(engine: Engine, shape: string) {
  if (!shapes(engine).includes(shape)) throw new Rejected(`${shape} is not a weapon shape`);
}

export function proficiencyOf(engine: Engine, c: CharacterState, shape: string): Proficiency {
  const marks = c.marks?.[shape] ?? 0;
  const tier = engine.tierForMarks(marks, c.grade);
  return { shape, marks, tier, bonus: engine.proficiencyBonus(tier) };
}

/** Every shape the character has a Mark in, in the book's order. */
export function proficienciesOf(engine: Engine, c: CharacterState): Proficiency[] {
  return shapes(engine)
    .filter((s) => (c.marks?.[s] ?? 0) > 0)
    .map((s) => proficiencyOf(engine, c, s));
}

/** One Mark in a shape, and the tier it reaches. */
export function addMark(engine: Engine, c: CharacterState, shape: string): Effect {
  checkShape(engine, shape);
  const before = proficiencyOf(engine, c, shape);
  c.marks = { ...(c.marks ?? {}), [shape]: before.marks + 1 };
  const after = proficiencyOf(engine, c, shape);
  const next = engine.rules.character.proficiencies.tiers.find((t: { marks_required: number }) => t.marks_required > after.marks);
  const effect: Effect = { kind: "mark", characterId: c.id, shape, marks: after.marks, tier: after.tier };
  if (after.tier !== before.tier) effect.advanced = true;
  if (next) effect.nextAt = next.marks_required;
  return effect;
}
