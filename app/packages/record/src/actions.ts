/**
 * The campaign record's actions. Every change to a campaign is one of these, wrapped in an
 * envelope and appended to the log; sheets are computed by replaying the log (fold.ts).
 *
 * An action records what the table decided, with the amounts it decided on: a VE award
 * carries the VE each character received, whatever the engine suggested, so a GM override
 * and the engine's number replay the same way under the campaign's pinned rules version.
 */
import type { Stats } from "@gradebreaker/engine";
import type { AftermathAction } from "./aftermath.ts";
import type { CombatAction } from "./combat.ts";
import type { ItemAction } from "./inventory.ts";
import type { MarkByHand } from "./proficiency.ts";
import type { TitleAction } from "./titles.ts";
import type { QuestAction } from "./quests.ts";
import type { TakePillOutside } from "./pills.ts";
import type { HveAction } from "./hve.ts";
import type { EventAction } from "./events.ts";

export type { CombatAction, CombatantSpec } from "./combat.ts";

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

/**
 * One of the book's ready-made characters, stats and Background from `rules/character.yaml`.
 * The GM creates characters for anyone; a player creates only their own (`playerId` is theirs).
 */
export interface CreatePregen {
  type: "character.pregen";
  characterId: string;
  pregen: string;
  playerId?: string;
}

/** Hands a character to a player, or to the GM when `playerId` is absent. GM only. */
export interface AssignCharacter {
  type: "character.assign";
  characterId: string;
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

/**
 * The GM places a level's assigned points from behavior (Progression, "Behavioral Stat Mapping").
 */
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

// ---------------------------------------------------------------- party ---

/**
 * One character invites another to a formal party (System Quests, "The Party"). The invitation
 * waits until the invitee answers; the inviting player withdraws it with an undo. Its id is the
 * envelope's id. The player of `fromId` records it, or the GM.
 */
export interface InviteToParty {
  type: "party.invite";
  fromId: string;
  toId: string;
}

/**
 * The invitee's answer. Accepting joins the inviter's party as it stands when the answer is
 * given, or forms a party of the two. The player of the invitee records it, or the GM.
 */
export interface AnswerPartyInvite {
  type: "party.answer";
  inviteId: string;
  accept: boolean;
}

/** A member leaves. A party left with one member disbands. The member's player records it, or the GM. */
export interface LeaveParty {
  type: "party.leave";
  characterId: string;
}

/** The party ends for every member. GM only. */
export interface DisbandParty {
  type: "party.disband";
  partyId: string;
}

// -------------------------------------------------------------- messages ---

/**
 * A System message the GM composed, to one character or several (the party is expanded to
 * its members when the GM sends, so replay reaches the same people). A held message is
 * recorded and reaches nobody until it is released; undoing the send discards it. GM only.
 */
export interface SendMessage {
  type: "message.send";
  to: string[];
  text: string;
  hold?: boolean;
}

/** Delivers a held message, named by the id of its `message.send`. GM only. */
export interface ReleaseMessage {
  type: "message.release";
  messageId: string;
}

// ------------------------------------------------------------------ dice ---

/** Who rolls: a character in the record, or anyone else the GM names (a creature, an NPC). */
export type Roller =
  | { kind: "character"; characterId: string; attribute?: string }
  | { kind: "other"; name: string; grade: string };

/**
 * A d100 roll (Core Mechanics, "Core Resolution"). A Clash or a check explodes at the roller's
 * Volatility Threshold; a roll read against a table (an effect table, the collapse clock) does
 * not. The total is the dice, the character's Force in `attribute`, and `modifier` (every other
 * bonus; for a roller outside the record, their Force too).
 *
 * The server rolls the dice when `natural` is absent and records them, so replay reads the
 * same dice. `entered` marks dice the table rolled by hand and typed in.
 */
export interface RollDice {
  type: "dice.roll";
  roller: Roller;
  rollKind: "clash" | "check" | "table";
  label?: string;
  modifier: number;
  /** Two d100, keep the higher; only the kept die explodes. */
  advantage?: boolean;
  /** Half of Maximum Aether for +5 on a Clash, declared before the roll (Core Mechanics, "Surge"). */
  surge?: boolean;
  /** A character's Clash made with this weapon shape: its Proficiency bonus, and a Mark if the die explodes. */
  shape?: string;
  /** The GM's roll, seen by the GM only. */
  private?: boolean;
  /** A check's Resistance, when the GM enters it: the outcome is computed. */
  resistance?: number;
  /** The kept die and every die it exploded into, in order. */
  natural?: number[];
  /** With Advantage, the lower die, set aside. */
  dropped?: number;
  entered?: boolean;
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
  | AssignCharacter
  | AwardVe
  | Consolidate
  | Collapse
  | PlaceSystemPoints
  | SpendFreePoints
  | ChangeHp
  | ChangeAether
  | InviteToParty
  | AnswerPartyInvite
  | LeaveParty
  | DisbandParty
  | SendMessage
  | ReleaseMessage
  | RollDice
  | CombatAction
  | AftermathAction
  | ItemAction
  | MarkByHand
  | TitleAction
  | QuestAction
  | TakePillOutside
  | HveAction
  | EventAction
  | VoidAction;

export type ActionType = Action["type"];
