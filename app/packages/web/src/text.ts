/**
 * Words for the record. `describe` and `effectLine` are the GM's register: plain bookkeeping.
 * `noticeLine` is the System's register for the player interface: clinical, in-world units
 * only (never round, roll, or check), set in bare italics by the caller. The notice wording
 * is a first draft for Gabriel's voice pass (The System AI, "The Voice of the System").
 */
import type { Action, Change, Effect } from "@gradebreaker/record";

export const ATTRIBUTES = ["STR", "DEX", "FOR", "HRT", "POW", "PER", "CHA"] as const;

export const ATTRIBUTE_NAMES: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  FOR: "Fortitude",
  HRT: "Heart",
  POW: "Power",
  PER: "Perception",
  CHA: "Charisma",
};

export type Names = (characterId: string) => string;

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const placement = (p: Record<string, number>) =>
  Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${signed(v)}`)
    .join(", ");

/** One line for the GM's log. */
export function describe(
  a: Action,
  name: Names,
  seqOf: (id: string) => number | undefined,
  person: (userId: string) => string = () => "a player",
): string {
  switch (a.type) {
    case "character.create":
      return `Created ${a.name} (point buy)`;
    case "character.pregen":
      return `Created ${a.pregen} (ready-made)`;
    case "character.assign":
      return `${name(a.characterId)} handed to ${a.playerId ? person(a.playerId) : "the GM"}`;
    case "ve.award": {
      const who = a.awards.map((w) => `${name(w.characterId)} ${w.ve}`).join(", ");
      const b = a.basis;
      const why =
        b.kind === "kill"
          ? `kill${b.creature ? `: ${b.creature}` : ""}`
          : b.kind === "quest"
            ? `quest${b.questId ? ` ${b.questId}` : ""}`
            : b.kind === "core"
              ? b.core
              : b.kind === "ambient"
                ? `ambient, ${b.hours} h`
                : b.kind === "hidden-achievement"
                  ? "Hidden Achievement"
                  : b.note;
      return `VE: ${who} (${why})`;
    }
    case "consolidation.rest":
      return `Consolidation${a.highDensity ? " (high density)" : ""}: ${a.rests
        .map((r) => `${name(r.characterId)} ${r.hours} h${r.interrupted ? ", interrupted" : ""}`)
        .join("; ")}`;
    case "saturation.collapse":
      return `Collapse: ${name(a.characterId)} (${a.attribute})`;
    case "points.system":
      return `Assigned points, Level ${a.level}: ${name(a.characterId)} ${placement(a.placement)}`;
    case "points.free":
      return `Free points: ${name(a.characterId)} ${placement(a.placement)}`;
    case "hp.change":
      return `HP: ${name(a.characterId)} ${signed(a.delta)}`;
    case "aether.change":
      return `Aether: ${name(a.characterId)} ${signed(a.delta)}`;
    case "void": {
      const seq = seqOf(a.targetId);
      const target = seq === undefined ? "an action" : `#${seq + 1}`;
      return `${a.reason === "correction" ? "Corrected" : "Undid"} ${target}${a.note ? `: ${a.note}` : ""}`;
    }
  }
}

/** One line for a preview or the GM's feed. */
export function effectLine(e: Effect, name: Names): string | null {
  switch (e.kind) {
    case "created":
      return null; // the preview's sheet changes already show the new character
    case "reassigned":
      return `${name(e.characterId)} goes ${e.playerId ? "to a new player" : "to the GM"}`;
    case "ve-acquired":
      return `${name(e.characterId)} stores ${e.ve} VE`;
    case "saturation":
      return `${name(e.characterId)}: Saturation ${e.from} → ${e.to} (narrate the symptoms; the System sends no notice)`;
    case "aether-refilled":
      return `${name(e.characterId)}: Aether refills at hour ${e.hour}`;
    case "level":
      return `${name(e.characterId)} reaches Level ${e.level}${e.hour ? ` at hour ${e.hour}` : ""}`;
    case "healed-full":
      return `${name(e.characterId)}: HP full at hour ${e.hour}`;
    case "collapsed":
      return `${name(e.characterId)} collapses: loses 1 ${e.attribute} until a clean Consolidation; ${e.hours} h of involuntary Consolidation`;
    case "temporary-returned":
      return `${name(e.characterId)}: the lost ${e.attribute} point returns`;
    case "points-placed":
      return `${name(e.characterId)}: ${e.by === "system" ? "assigned" : "free"} points ${placement(e.placement)}`;
    case "voided":
      return null;
  }
}

/** The System's notice on a player's interface, or null for effects the System does not announce. */
export function noticeLine(e: Effect): string | null {
  switch (e.kind) {
    case "ve-acquired":
      return `Volatile Energy absorbed: ${e.ve}.`;
    case "level":
      return `Level ${e.level} attained.`;
    case "aether-refilled":
      return "Aether restored.";
    case "healed-full":
      return "Health restored.";
    case "collapsed":
      return `Consolidation enforced: ${e.hours} hours. ${ATTRIBUTE_NAMES[e.attribute]} reduced.`;
    case "temporary-returned":
      return `${ATTRIBUTE_NAMES[e.attribute]} restored.`;
    case "points-placed": {
      const parts = Object.entries(e.placement)
        .filter(([, v]) => v)
        .map(([k, v]) => `${ATTRIBUTE_NAMES[k]} +${v}`)
        .join(", ");
      return `${e.by === "system" ? "Attributes allocated" : "Allocation recorded"}: ${parts}.`;
    }
    default:
      return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  level: "Level",
  storedVe: "Stored VE",
  refinedVe: "Refined VE",
  veToNextLevel: "VE to next level",
  hp: "HP",
  maxHp: "Max HP",
  aether: "Aether",
  maxAether: "Max Aether",
  "saturation.band": "Saturation",
  pendingSystemLevels: "Assigned points due",
  freePoints: "Free points",
  temporary: "Temporary loss",
  downed: "Downed",
};

/** A sheet change as the GM reads it, or null for derived fields that repeat another. */
export function changeLine(c: Change): string | null {
  const label = c.field.startsWith("raw.") ? c.field.slice(4) : FIELD_LABELS[c.field];
  if (!label) return null;
  const show = (v: unknown) =>
    Array.isArray(v) ? (v.length ? v.join(", ") : "none") : v === null || v === undefined ? "none" : String(v);
  return `${label}: ${show(c.before)} → ${show(c.after)}`;
}
