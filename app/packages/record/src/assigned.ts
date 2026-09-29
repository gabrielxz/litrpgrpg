/**
 * The assigned points a level brings before the class, proposed from the Hidden Vector Engine
 * (Progression, "Behavioral Stat Mapping"): each row of the table is one side of an axis
 * (`rules/character.yaml`, `side`), and the character's HVE entries since the last placement say
 * which rows they lived. The proposal is the GM's to take, edit, or ignore; the form places the
 * points either way.
 *
 * The shape follows the book's reading of the table: one side, lived hard and alone, takes all
 * three on its primary; a side that leads takes two on its primary and one on its secondary; a
 * close second takes the third point on its own primary; three sides level at the top take one
 * each. "Leads" is the sweep's own test, a lead of `current_lead_required` (the lead a session's
 * Current needs to move Deep); "hard" is the Defining weight.
 */
import type { Engine, Stats } from "@gradebreaker/engine";
import type { CharacterState } from "./fold.ts";
import { weights } from "./hve.ts";

/** An HVE entry counted toward the next placement. */
export interface SinceAssigned {
  eventId: string;
  pole: string;
  intensity: number;
  secondary?: string;
}

export interface AssignedProposal {
  /** Each side's total since the last placement, highest first. */
  tally: { side: string; total: number }[];
  /** The events read. */
  events: number;
  /** The rows the proposal uses, by side. */
  sides: string[];
  /** In Raw points at the character's Grade. */
  placement: Stats;
  shape: "all-in" | "lead" | "second" | "even";
}

interface Row {
  behavior: string;
  primary: string;
  secondary: string;
  side: string;
}

export const mappingRows = (engine: Engine) => engine.rules.character.behavioral_stat_mapping as Row[];

/** The entry at one weight lower, for a secondary side: 3 reads 2, 2 reads 1, 1 and a reminder read nothing. */
function lower(engine: Engine, intensity: number): number {
  const w = weights(engine).map((x) => x.tallies);
  const i = w.indexOf(intensity);
  return i > 0 ? w[i - 1]! : 0;
}

export function assignedProposal(engine: Engine, c: CharacterState): AssignedProposal | null {
  const since = c.sinceAssigned ?? [];
  if (!since.length) return null;
  const total = new Map<string, number>();
  const last = new Map<string, number>();
  since.forEach((x, i) => {
    total.set(x.pole, (total.get(x.pole) ?? 0) + x.intensity);
    last.set(x.pole, i);
    if (x.secondary) {
      const w = lower(engine, x.intensity);
      if (w) {
        total.set(x.secondary, (total.get(x.secondary) ?? 0) + w);
        last.set(x.secondary, i);
      }
    }
  });
  // Highest first; a tie goes to the side lived most recently.
  const tally = [...total].map(([side, n]) => ({ side, total: n })).sort((a, b) => b.total - a.total || last.get(b.side)! - last.get(a.side)!);
  const rows = new Map(mappingRows(engine).map((r) => [r.side, r]));
  const scale = engine.scale(c.grade);
  const each = engine.rules.character.leveling.system_assigned as number;
  const leadNeeded = engine.rules.hve.sweep.deep_update.current_lead_required as number;
  const defining = weights(engine).at(-1)!.tallies;
  const place: Stats = {};
  const add = (attr: string, n: number) => (place[attr] = (place[attr] ?? 0) + n * scale);

  const [first, second, third] = tally;
  const top = rows.get(first!.side)!;
  let shape: AssignedProposal["shape"];
  let sides: string[];
  if (!second && first!.total >= defining) {
    shape = "all-in";
    sides = [first!.side];
    add(top.primary, each);
  } else if (!second || first!.total - second.total >= leadNeeded) {
    shape = "lead";
    sides = [first!.side];
    add(top.primary, each - 1);
    add(top.secondary, 1);
  } else if (third && third.total === first!.total && each === 3) {
    shape = "even";
    sides = [first!.side, second.side, third.side];
    for (const s of sides) add(rows.get(s)!.primary, 1);
  } else {
    shape = "second";
    sides = [first!.side, second.side];
    add(top.primary, each - 1);
    add(rows.get(second.side)!.primary, 1);
  }
  return { tally, events: new Set(since.map((x) => x.eventId)).size, sides, placement: place, shape };
}
