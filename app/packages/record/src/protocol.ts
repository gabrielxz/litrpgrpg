/**
 * What the server sends the browser: each person's view of a campaign and the live channel's
 * messages. The server builds them (server/src/views.ts); the web client reads them.
 */
import type { Effect, HeldMessage, Party, PartyInvite } from "./fold.ts";
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
}

export type View = GmView | PlayerView;

/** What the live channel sends after an append. */
export type LiveMessage =
  | { type: "state"; view: View }
  | { type: "appended"; envelope: Envelope; effects: Effect[]; view: GmView }
  | { type: "update"; view: PlayerView }
  | { type: "error"; error: string };
