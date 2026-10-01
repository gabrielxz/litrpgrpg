/**
 * A class package in the table's words, for the GM's Classes section and the player's interface
 * alike: the profile, the technique's cost, and the permission, as Classes states each entry's
 * mechanics beside the System's notice.
 */
import type { Engine } from "@gradebreaker/engine";
import type { ClassPackage, PermissionHook, TechniqueHook } from "@gradebreaker/record";
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

/** "10 Health": what a Drawback technique's Health cost reads as, from the rules. */
export function healthCost(engine: Engine | null): string {
  return engine ? `${engine.rules.classes.technique.drawback_health as number} Health` : "Health";
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
  /** The Health a Drawback technique costs, as it reads: "10 Health". */
  healthCost: string;
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
  const cost = t.cost === "Aether" ? `${aetherCost ?? ""} Aether`.trim() : t.cost === "Frequency" ? "once per fight" : t.drawback === "exposed" ? "Exposed until the next turn" : t.drawback === "health" ? healthCost(engine) : `${healthCost(engine)} or Exposed`;
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
  return { name: t.name, ...(t.hook ? { hook: t.hook } : {}), cost, sides, noBeat: Boolean(t.noBeat), chooseDrawback: t.cost === "Drawback" && !t.drawback, healthCost: healthCost(engine), blocked };
}

/** What a held class's permission adds to the Clash forms: a Surge paid in Health, or cheaper against a higher Grade. */
export function permissionClash(k: Pick<ClassPackage, "permission"> | null | undefined): { surgeHealth?: number; surgeUp?: number } {
  const h = k?.permission.hook;
  if (h?.kind === "surge-health") return { surgeHealth: h.health };
  if (h?.kind === "surge-up") return { surgeUp: h.cost };
  return {};
}

/** The reactions a character can take now, on someone else's turn: the permission's and a technique used as one. */
export function reactionsOffered(
  engine: Engine | null,
  k: Pick<ClassPackage, "permission" | "technique"> | null | undefined,
  state: { reactionsUsed: number; technique: TechniqueOffer | null },
): { name: string; technique: boolean }[] {
  if (!k) return [];
  const out: { name: string; technique: boolean }[] = [];
  const max = (engine?.rules.classes.permission.reactions_per_encounter as number | undefined) ?? 1;
  if (k.permission.hook?.kind === "reaction" && state.reactionsUsed < max) out.push({ name: k.permission.name, technique: false });
  if (k.technique.reaction && state.technique && !state.technique.blocked) out.push({ name: k.technique.name, technique: true });
  return out;
}

/** What the app runs of a permission, in the table's words; null when the table applies it. */
export function permissionHookLine(h: PermissionHook | undefined): string | null {
  switch (h?.kind) {
    case "rush":
      return "The app offers moving into another Zone and attacking there for the attack's one Beat.";
    case "free-move":
      return h.into === "downed-ally" ? "The app offers a move into a Zone holding a Downed ally for no Beat." : "The app offers a move for no Beat when the table agrees the condition holds.";
    case "free-disengage":
      return "The app offers Disengaging for no Beat.";
    case "reaction":
      return "The app offers a Clash on someone else's turn for no Beat, once per fight.";
    case "cover":
      return `The app offers cutting an ally's lost Margin by ${h.cut} for a Beat from the next turn, once per round.`;
    case "no-life":
      return "The app reads a turn spent without a Beat as dead until the character acts: inspection shows nothing.";
    case "surge-health":
      return `The app lets ${h.health} Health pay for a Surge.`;
    case "surge-up":
      return `The app charges ${h.cost} Aether for a Surge against a higher Grade, when that is less.`;
    case "read-health":
      return "The app shows the holder the Health of every creature in their Zone.";
    default:
      return null;
  }
}
