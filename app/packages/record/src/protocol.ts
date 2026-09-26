/**
 * What the server sends the browser: each person's view of a campaign and the live channel's
 * messages. The server builds them (server/src/views.ts); the web client reads them.
 */
import type { Effect, HeldMessage, Party, PartyInvite } from "./fold.ts";
import type { Combatant, Encounter } from "./combat.ts";
import type { Envelope } from "./actions.ts";
import type { Sheet } from "./sheet.ts";

export type Role = "gm" | "player";

export interface Member {
  userId: string;
  displayName: string;
  role: Role;
}

export interface CampaignInfo {
  id: string;
  name: string;
  rulesVersion: string;
}

/** One member as the party frame shows them (What Can Be Seen, "What a Party Shares"). */
export interface PartyFrameMember {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  aether: number;
  downed: boolean;
}

export interface PartyFrame {
  id: string;
  members: PartyFrameMember[];
}

/**
 * A roll as the table sees it. Dice are the table's, never the System's, so they sit apart
 * from the notice feed. A player sees every open roll without the GM's Resistance, outcome,
 * or the Battle Memory flag; the GM sees every roll, private ones included.
 */
export interface RollView {
  id: string;
  at: string;
  /** The person who rolled. */
  by: string;
  /** Who the roll is for: a character's name or the name the GM gave. */
  roller: string;
  characterId?: string;
  label?: string;
  rollKind: "clash" | "check" | "table";
  attribute?: string;
  natural: number[];
  dropped?: number;
  surge: boolean;
  force: number;
  modifier: number;
  total: number;
  exploded: boolean;
  entered: boolean;
  private: boolean;
  battleMemory?: boolean;
  resistance?: number;
  outcome?: string;
}

/** A combatant as the GM's tracker shows them: HP and Momentum Force read where they live. */
export interface CombatantView extends Omit<Combatant, "hp" | "maxHp" | "momentumForce"> {
  hp: number;
  maxHp: number;
  momentumForce: number;
  downed: boolean;
}

export interface EncounterView extends Omit<Encounter, "combatants"> {
  combatants: CombatantView[];
}

/**
 * The fight as a player sees it: the table's shape (round, turn order, who holds Momentum,
 * who is acting, a shift called for next round) and each character's Beats. No creature's
 * Health or Beats, and no character's Health beyond what the party frame shows.
 */
export interface PlayerCombat {
  name: string;
  round: number;
  /** Sides in turn order; the first holds Momentum. */
  order: { id: string; name: string }[];
  /** The side taking its turn; null between rounds. */
  turnSide: string | null;
  pendingShift: string | null;
  combatants: {
    id: string;
    name: string;
    sideId: string;
    acting: boolean;
    acted: boolean;
    out: boolean;
    /** Characters only. */
    beats?: number;
    beatsPerTurn?: number;
    characterId?: string;
  }[];
}

/** One System notice about one of the player's characters, rebuilt from the log on every view. */
export interface FeedItem {
  key: string;
  /** When the action that caused it was recorded. */
  at: string;
  characterId: string;
  effect: Effect;
}

/** A character's System interface: the fields the book lists, in its order. */
export interface InterfaceSheet {
  id: string;
  name: string;
  background: string;
  raw: Sheet["raw"];
  force: Sheet["force"];
  hp: number;
  maxHp: number;
  downed: boolean;
  aether: number;
  maxAether: number;
  surgeCost: number;
  storedVe: number;
  tolerance: number;
  level: number;
  grade: string;
  refinedVe: number;
  veToNextLevel: number | null;
  freePoints: number;
  party: PartyFrame | null;
  /** Invitations waiting on this character's answer. */
  invitations: { id: string; fromId: string; fromName: string }[];
  /** Invitations this character made that wait on an answer. */
  invited: { id: string; toId: string; toName: string }[];
}

export interface GmView {
  role: "gm";
  campaign: CampaignInfo;
  members: Member[];
  /** The log's length: where a client's copy of the log stands. Players do not receive it. */
  seq: number;
  characters: Sheet[];
  rejected: { id: string; seq: number; reason: string }[];
  parties: Party[];
  invites: PartyInvite[];
  held: HeldMessage[];
  /** The newest rolls first, private ones included. */
  rolls: RollView[];
  /** The fight running now. */
  encounter: EncounterView | null;
}

export interface PlayerView {
  role: "player";
  campaign: CampaignInfo;
  members: Member[];
  characters: InterfaceSheet[];
  /** The other characters players hold here, by name: whom this player can invite. */
  roster: { id: string; name: string }[];
  /** The System's notices to this player's characters, newest first. */
  feed: FeedItem[];
  /** The table's open rolls, newest first. */
  rolls: RollView[];
  combat: PlayerCombat | null;
}

export type View = GmView | PlayerView;

/** What the live channel sends after an append. */
export type LiveMessage =
  | { type: "state"; view: View }
  | { type: "appended"; envelope: Envelope; effects: Effect[]; view: GmView }
  | { type: "update"; view: PlayerView }
  | { type: "error"; error: string };
