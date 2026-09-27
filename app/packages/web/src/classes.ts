/**
 * A class package in the table's words, for the GM's Classes section and the player's interface
 * alike: the profile, the technique's cost, and the permission, as Classes states each entry's
 * mechanics beside the System's notice.
 */
import type { Engine } from "@gradebreaker/engine";
import type { ClassPackage } from "@gradebreaker/record";
import { ATTRIBUTE_NAMES } from "./text.ts";

type Package = Pick<ClassPackage, "profile" | "technique" | "permission">;

/** Points the profile returns to the player each level. */
export function returnedOf(engine: Engine | null, p: Package): number | null {
  if (!engine) return null;
  const perLevel = engine.rules.classes.profile.system_points_per_level as number;
  return perLevel - p.profile.points.reduce((s, x) => s + x.points, 0);
}

/** "Fixed. 1 POW, 1 DEX, 1 HRT. Lead POW." */
export function profileLine(engine: Engine | null, p: Package): string {
  const parts = p.profile.points.map((x) => `${x.points} ${x.attribute}`);
  const back = returnedOf(engine, p);
  if (back) parts.push(`${back} returned`);
  const lead = p.profile.points[0]?.attribute;
  return `${p.profile.shape}. ${parts.join(", ")}.${lead ? ` Lead ${lead}.` : ""}`;
}

/** The technique's cost as the rules state it: "5 Aether, usable while Aether lasts". */
export function costLine(engine: Engine | null, p: Package): string {
  const row = (engine?.rules.classes.technique.cost_shapes as { shape: string; cost: string }[] | undefined)?.find((c) => c.shape === p.technique.cost);
  return row ? row.cost : p.technique.cost;
}

/** What selection adds to the lead: "Power +10". */
export function selectionLine(engine: Engine | null, p: Package, bonus?: number): string | null {
  const lead = p.profile.points[0]?.attribute;
  const n = bonus ?? (engine?.rules.classes.selection.lead_attribute_bonus as number | undefined);
  return lead && n !== undefined ? `${ATTRIBUTE_NAMES[lead] ?? lead} +${n}` : null;
}
