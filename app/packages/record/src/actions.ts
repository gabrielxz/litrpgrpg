/**
 * The campaign record's actions. Every change to a campaign is one of these, wrapped in an
 * envelope and appended to the log; sheets are computed by replaying the log (fold.ts).
 *
 * An action records what the table decided, with the amounts it decided on: a VE award
 * carries the VE each character received, whatever the engine suggested, so a GM override
 * and the engine's number replay the same way under the campaign's pinned rules version.
 */
import type { Stats } from "@gradebreaker/engine";

export type ActorRole = "gm" | "player";

export interface Actor {
  role: ActorRole;
  /** The person at the table: a GM or player account id. */
  userId: string;
}

/** How the action reached the log. Only `manual` exists in M1; the others arrive with M2 to M4. */
export type Source = "manual" | "suggestion" | "voice" | "counter";

export interface Envelope<A extends Action = Action> {
  /** The idempotency key: appending the same id twice records the action once. */
  id: string;
  /** Assigned by the log on append: the action's position. */
  seq: number;
  /** Wall-clock time of the append, ISO 8601. The in-game clock is separate. */
  at: string;
  actor: Actor;
  source: Source;
  /** What caused it: an event id, a suggestion id, or a GM note. */
  cause?: string;
  action: A;
}

/** An envelope before the log assigns its position. */
export type Draft<A extends Action = Action> = Omit<Envelope<A>, "seq">;

// ------------------------------------------------------------ characters ---

/** Point buy: seven Attributes, each 3 to 10, summing to exactly 40 (Character Creation). */
export interface CreateCharacter {
  type: "character.create";
  characterId: string;
  name: string;
  /** The player who controls the character; absent for a GM-held character. */
  playerId?: string;
  stats: Stats;
  background: string;
}

/** One of the book's ready-made characters, stats and Background from `rules/character.yaml`. */
export interface CreatePregen {
  type: "character.pregen";
  characterId: string;
  pregen: string;
  playerId?: string;
}

// ------------------------------------------------------------------- VE ---

/** Why VE was awarded. Informational: the award's `ve` is what the character received. */
export type AwardBasis =
  | { kind: "kill"; creature?: string; tier: string; victimGrade: string }
  | { kind: "quest"; questId?: string }
  | { kind: "core"; core: string }
  | { kind: "ambient"; hours: number; density: string }
  | { kind: "hidden-achievement" }
  | { kind: "other"; note: string };

/**
 * VE into each listed character's stored pool. One action per occasion, so a fight's
 * award to the whole party is undone as one thing. Every participant collects the full
 * award for their own tier (Cultivation, "Combat Kills"); nothing is divided here.
 */
export interface AwardVe {
  type: "ve.award";
  basis: AwardBasis;
  awards: { characterId: string; ve: number }[];
}

// -------------------------------------------------------- Consolidation ---

/**
 * A Consolidation rest. Each character states a goal at the table and the GM enters the
 * full hours each one completed; a guard is simply not listed. `interrupted` marks a rest
 * cut short: the completed hours stand, and it does not count as a Consolidation completed
 * without interruption (which returns a collapse's temporary point).
 */
export interface Consolidate {
  type: "consolidation.rest";
  highDensity: boolean;
  rests: { characterId: string; hours: number; interrupted?: boolean }[];
}

/**
 * A collapse at Critical Saturation. The GM rolls the collapse clock and enters the collapse;
 * the record applies the cost (one temporary Raw point of FOR or POW, the player's choice)
 * and runs the involuntary Consolidation: until stored VE falls to Tolerance or below, or 5
 * full hours at the Level cap with the VE still stored (Cultivation, "The Pressure Gauge").
 */
export interface Collapse {
  type: "saturation.collapse";
  characterId: string;
  attribute: "FOR" | "POW";
  highDensity: boolean;
}

// ------------------------------------------------------------ level-ups ---

/** The GM places a level's System points from behavior (Progression, "Behavioral Stat Mapping"). */
export interface PlaceSystemPoints {
  type: "points.system";
  characterId: string;
  level: number;
  placement: Stats;
}

/** The player spends some or all of their unallocated free points. */
export interface SpendFreePoints {
  type: "points.free";
  characterId: string;
  placement: Stats;
}

// ------------------------------------------------- HP and Aether by hand ---

/** Damage and healing entered by hand, until the combat tracker records them. */
export interface ChangeHp {
  type: "hp.change";
  characterId: string;
  delta: number;
}

/** Aether spent or restored outside Consolidation (a technique, Surge, an Aether Pill). */
export interface ChangeAether {
  type: "aether.change";
  characterId: string;
  delta: number;
}

// ------------------------------------------------------------ the record ---

/**
 * Removes an earlier action from the record. `undo` is an ordinary take-back; `correction`
 * marks a mistake in the record, kept apart from awards so the history shows which was which.
 */
export interface VoidAction {
  type: "void";
  targetId: string;
  reason: "undo" | "correction";
  note?: string;
}

export type Action =
  | CreateCharacter
  | CreatePregen
  | AwardVe
  | Consolidate
  | Collapse
  | PlaceSystemPoints
  | SpendFreePoints
  | ChangeHp
  | ChangeAether
  | VoidAction;

export type ActionType = Action["type"];
