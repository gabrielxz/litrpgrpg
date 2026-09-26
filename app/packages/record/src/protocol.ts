/**
 * What the server sends the browser: each person's view of a campaign and the live channel's
 * messages. The server builds them (server/src/views.ts); the web client reads them.
 */
import type { Effect } from "./fold.ts";
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
}

export interface GmView {
  role: "gm";
  campaign: CampaignInfo;
  members: Member[];
  /** The log's length: where a client's copy of the log stands. Players do not receive it. */
  seq: number;
  characters: Sheet[];
  rejected: { id: string; seq: number; reason: string }[];
}

export interface PlayerView {
  role: "player";
  campaign: CampaignInfo;
  members: Member[];
  characters: InterfaceSheet[];
}

export type View = GmView | PlayerView;

/** What the live channel sends after an append. */
export type LiveMessage =
  | { type: "state"; view: View }
  | { type: "appended"; envelope: Envelope; effects: Effect[]; view: GmView }
  | { type: "update"; notices: Effect[]; view: PlayerView }
  | { type: "error"; error: string };
