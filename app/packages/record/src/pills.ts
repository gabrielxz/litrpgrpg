/**
 * Healing and Aether Pills (Items). A pill works only in a body of its own Grade. A character's
 * first pills of each kind, up to `pill_use.per_consolidation_limit_per_kind`, work in full; past
 * it, pills of that kind do nothing until a Consolidation's first full hour completes, the moment
 * Aether refills. Every pill counts, in a fight or out of one, and the recipient's count is the
 * one that fills (Gabriel, 2026-09-26). In a fight a pill costs a Beat
 * through the tracker (`combat.pill`); outside one, `pill.take` records it.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected, type World, maxAetherOf, maxHpOf } from "./fold.ts";
import { take } from "./inventory.ts";

export type PillKind = "healing" | "aether";

/** A pill taken outside a fight: from what the giver carries, to the giver or anyone else. */
export interface TakePillOutside {
  type: "pill.take";
  characterId: string;
  targetId: string;
  pill: string;
}

/** Pills of one kind that work between Consolidations. */
export function pillLimit(engine: Engine): number {
  return engine.rules.items.pill_use.per_consolidation_limit_per_kind;
}

export function findPill(engine: Engine, name: string): { name: string; grade: string; kind: PillKind; amount: number } {
  const items = engine.rules.items;
  const key = name.trim().toLowerCase();
  const h = (items.healing_pills as { name: string; grade: string; hp: number }[]).find((p) => p.name.toLowerCase() === key);
  if (h) return { name: h.name, grade: h.grade, kind: "healing", amount: h.hp };
  const a = (items.aether_pills as { name: string; grade: string; aether: number }[]).find((p) => p.name.toLowerCase() === key);
  if (a) return { name: a.name, grade: a.grade, kind: "aether", amount: a.aether };
  throw new Rejected(`no pill called ${name}`);
}

/**
 * Counts a pill against a character and says whether it works: a pill of another Grade does
 * nothing, and so does one past the limit. The pill is taken either way.
 */
export function countPill(engine: Engine, c: CharacterState, kind: PillKind, grade: string): "grade" | "limit" | undefined {
  const taken = c.pillsTaken?.[kind] ?? 0;
  c.pillsTaken = { healing: 0, aether: 0, ...(c.pillsTaken ?? {}), [kind]: taken + 1 };
  if (grade !== c.grade) return "grade";
  if (taken >= pillLimit(engine)) return "limit";
  return undefined;
}

export function takePillOutside(engine: Engine, world: World, a: TakePillOutside): Effect[] {
  const giver = world.characters.get(a.characterId);
  const target = world.characters.get(a.targetId);
  if (!giver || !target) throw new Rejected("name who gives the pill and who takes it");
  if (giver.dead || target.dead) throw new Rejected(`${giver.dead ? giver.name : target.name} is dead`);
  const e = world.encounter;
  if (e && !e.ended && e.combatants.some((c) => !c.out && (c.characterId === target.id || c.characterId === giver.id)))
    throw new Rejected("in a fight a pill costs a Beat: record it on the tracker");
  const p = findPill(engine, a.pill);
  take(world, giver.id, p.name, 1);
  const noEffect = countPill(engine, target, p.kind, p.grade);
  let restored = 0;
  if (!noEffect) {
    if (p.kind === "healing") {
      const before = target.hp;
      target.hp = Math.min(maxHpOf(engine, target), target.hp + p.amount);
      restored = target.hp - before;
    } else {
      const before = target.aether;
      target.aether = Math.min(maxAetherOf(engine, target), target.aether + p.amount);
      restored = target.aether - before;
    }
  }
  return [{ kind: "pill", combatantId: giver.id, targetId: target.id, characterId: target.id, pill: p.name, pillKind: p.kind, restored, ...(noEffect ? { noEffect } : {}) }];
}

/** A player gives only from what their own character carries. */
export function authorizePillPlayer(world: World, a: TakePillOutside, userId: string) {
  if (world.characters.get(a.characterId)?.playerId !== userId) throw new Rejected("a player gives only from their own character's pack");
}
