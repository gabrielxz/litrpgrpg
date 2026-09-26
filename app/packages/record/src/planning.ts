/**
 * Planning helpers the GM view offers before a rest or an award is recorded. They compute
 * and suggest; the table decides, and the action records what it decided.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Sheet } from "./sheet.ts";

/**
 * A Consolidation goal as the player states it (Cultivation, "Consolidation"): process
 * everything, process until the next level, or process a specific amount.
 */
export type RestGoal = { kind: "everything" } | { kind: "next-level" } | { kind: "amount"; ve: number };

export interface RestPlan {
  hours: number;
  /** Set when the goal cannot be met as stated, such as a next level with too little stored. */
  note?: string;
}

/** Full hours a goal needs. Every rest takes at least the minimum, even with nothing stored. */
export function hoursForGoal(engine: Engine, s: Sheet, goal: RestGoal, highDensity = false): RestPlan {
  const min = engine.rules.cultivation.consolidation.minimum_hours;
  const rate = engine.refineRate(s.grade, highDensity);
  const hoursFor = (ve: number) => Math.max(min, Math.ceil(ve / rate));
  if (s.atCap) return { hours: min, note: "at the Level cap Consolidation refines nothing" };
  switch (goal.kind) {
    case "everything":
      return { hours: hoursFor(s.storedVe) };
    case "amount":
      if (goal.ve > s.storedVe) return { hours: hoursFor(s.storedVe), note: `only ${s.storedVe} VE is stored` };
      return { hours: hoursFor(goal.ve) };
    case "next-level": {
      const need = s.veToNextLevel!;
      if (need > s.storedVe)
        return { hours: hoursFor(s.storedVe), note: `the next level needs ${need} VE and ${s.storedVe} is stored` };
      return { hours: hoursFor(need) };
    }
  }
}

/**
 * The kill award each participant collects at their own tier (Cultivation, "Combat Kills").
 * The GM may override any amount, and a boss may pay 1.5× at the GM's discretion; the action
 * records what was awarded.
 */
export function killAwards(
  engine: Engine,
  victimGrade: string,
  participants: { characterId: string; grade: string; tier: string }[],
): { characterId: string; ve: number }[] {
  return participants.map((p) => ({ characterId: p.characterId, ve: engine.killVe(p.tier, p.grade, victimGrade) }));
}
