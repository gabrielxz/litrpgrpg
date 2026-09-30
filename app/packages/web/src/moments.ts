import type { Effect } from "@gradebreaker/record";

/**
 * The moments (Decisions, "the makeover"): the notices that mark a character's advancement, and
 * Downed. Motion is spent on these and nowhere else; each is framed as a moment in the notices.
 */
export type Moment = "level" | "title" | "technique" | "class" | "distillation" | "quest" | "downed";

export function momentOf(e: Effect): Moment | null {
  switch (e.kind) {
    case "level":
      return "level";
    case "title-conferred":
      return "title";
    case "mark":
      return e.marks === 1 || e.advanced ? "technique" : null;
    case "classification":
    case "class-accepted":
      return "class";
    case "distilled":
      return "distillation";
    case "quest-offered":
    case "quest-completed":
      return "quest";
    case "combat-downed":
    case "vital-coherence":
      return "downed";
    default:
      return null;
  }
}
