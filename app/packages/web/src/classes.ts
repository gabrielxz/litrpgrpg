/**
 * A class package in the table's words, for the GM's Classes section and the player's interface
 * alike: the profile, the technique's cost, and the permission, as Classes states each entry's
 * mechanics beside the System's notice.
 */
import type { Engine } from "@gradebreaker/engine";
import type { ClassPackage, TechniqueHook } from "@gradebreaker/record";
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

/** A character's class technique as the fight's forms offer it. */
export interface TechniqueOffer {
  name: string;
  hook?: TechniqueHook;
  /** "5 Aether", "once per fight", "10 Health or Exposed". */
  cost: string;
  /** The Clash sides it can be declared with; empty for a technique used on its own. */
  sides: ("attack" | "defense")[];
  noBeat: boolean;
  /** Set when the player chooses the drawback. */
  chooseDrawback: boolean;
  /** Why it cannot be used now, or null. */
  blocked: string | null;
}

/** What the held class's technique can do now: its Clash sides, its cost, and whether it can be paid. */
export function techniqueOffer(
  engine: Engine | null,
  k: Pick<ClassPackage, "technique"> & { grade?: string },
  state: { aether: number; usedThisFight?: boolean; inFight: boolean },
): TechniqueOffer {
  const t = k.technique;
  const aetherCost = engine ? engine.classTechniqueCost(k.grade ?? "F") : null;
  const cost = t.cost === "Aether" ? `${aetherCost ?? ""} Aether`.trim() : t.cost === "Frequency" ? "once per fight" : t.drawback === "exposed" ? "Exposed until the next turn" : t.drawback === "health" ? "10 Health" : "10 Health or Exposed";
  const sides: TechniqueOffer["sides"] =
    t.hook?.kind === "clash" ? (t.hook.side === "either" ? ["attack", "defense"] : [t.hook.side]) : t.hook?.kind === "heal" ? [] : ["attack"];
  const blocked =
    t.cost === "Aether" && aetherCost !== null && state.aether < aetherCost
      ? `${aetherCost} Aether needed, ${state.aether} held`
      : t.cost === "Frequency" && !state.inFight
        ? "used in a fight"
        : t.cost === "Frequency" && state.usedThisFight
          ? "used this fight"
          : null;
  return { name: t.name, ...(t.hook ? { hook: t.hook } : {}), cost, sides, noBeat: Boolean(t.noBeat), chooseDrawback: t.cost === "Drawback" && !t.drawback, blocked };
}
