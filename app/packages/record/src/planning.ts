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

/** A creature as the sizing table reads it: its tier, its Grade, its Forces, and its Beats. */
export interface SizedCreature {
  name: string;
  tier?: string;
  grade: string;
  offense: number[];
  defense: number[];
  beats?: number;
}

export interface Sizing {
  /** The row's label, "L8–12". */
  row: string;
  /** easy, standard, hard, below, or above; null when the table does not size these creatures. */
  column: string | null;
  /** From Level 8: the encounter's Force and the row's columns sized for the party. */
  force?: number;
  columns?: Record<string, number>;
  /** Why the table stops short, or what it leaves out. */
  notes: string[];
}

/**
 * Where a fight sits in the Bestiary's sizing table for a party (Bestiary, "GM Reference:
 * Encounter Building"): at Levels 1 to 7 by the creatures' tiers, from Level 8 by creature Force,
 * each column shifted for a party other than four. The table sizes creatures of the party's own
 * Grade with two Beats each; from Level 8 a second creature adds 20 Force and each one past it 10
 * (tested to four). Past that it says so.
 */
export function sizeEncounter(engine: Engine, partyLevel: number, partySize: number, partyGrade: string, creatures: SizedCreature[]): Sizing {
  const row = engine.sizingRow(partyLevel);
  const out: Sizing = { row: row.party_level, column: null, notes: [] };
  if (!creatures.length) return out;
  const other = creatures.filter((c) => c.grade !== partyGrade);
  if (other.length) {
    out.notes.push(`${other.map((c) => c.name).join(", ")} ${other.length === 1 ? "is" : "are"} not ${partyGrade}-Grade: the Cross-Grade Adjustment applies and the table does not size it.`);
    return out;
  }
  if (row.mix) {
    const tiers = creatures.map((c) => c.tier);
    if (tiers.some((t) => !t)) {
      out.notes.push("A creature entered by hand has no tier: size it by the Difficulty Card.");
      return out;
    }
    out.column = engine.encounterColumnMix(partyLevel, partySize, tiers as string[]);
    if (out.column === null) out.notes.push("These creatures are no cell of the row: size the fight by the Difficulty Card, or step a cell by one creature of its lowest tier.");
    return out;
  }
  out.columns = Object.fromEntries(SIZING.map((c) => [c, engine.sizedForce(row.force[c], partySize)]));
  if (creatures.some((c) => !c.offense.length && !c.defense.length)) {
    out.notes.push("A creature entered by hand has no Forces: size it by the Difficulty Card.");
    return out;
  }
  const forces = creatures.map((c) => engine.creatureSizingForce(c.offense, c.defense));
  out.force = engine.encounterForce(forces);
  out.column = engine.encounterColumnForce(partyLevel, partySize, out.force);
  const beats = creatures.filter((c) => c.beats !== undefined && c.beats !== 2);
  if (beats.length) out.notes.push(`The rows assume two Beats; ${beats.map((c) => `${c.name} takes ${c.beats}`).join(", ")}.`);
  if (creatures.length > 4) out.notes.push("The step past the second creature is tested to four; five or more keep stepping at 10 Force each.");
  return out;
}

const SIZING = ["easy", "standard", "hard"] as const;

/** The party level the sizing table reads: the party's average level, rounded down. */
export function partyLevelOf(levels: number[]): number {
  return levels.length ? Math.floor(levels.reduce((a, b) => a + b, 0) / levels.length) : 1;
}
