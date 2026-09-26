/**
 * What each person at the table receives. The GM sees the whole record. A player sees their
 * own characters' interfaces as What Can Be Seen lists them ("Your Own Interface"), and the
 * notices about those characters; nothing about the Hidden Vector Engine, the Saturation band
 * (the GM narrates it), System points still to be placed, or anyone else's sheet. The party
 * frame arrives with the party itself.
 */
import type { CampaignRecord, Effect, Envelope, Sheet } from "@gradebreaker/record";

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

export function interfaceSheet(s: Sheet): InterfaceSheet {
  return {
    id: s.id,
    name: s.name,
    background: s.background,
    raw: s.raw,
    force: s.force,
    hp: s.hp,
    maxHp: s.maxHp,
    downed: s.downed,
    aether: s.aether,
    maxAether: s.maxAether,
    surgeCost: s.surgeCost,
    storedVe: s.storedVe,
    tolerance: s.tolerance,
    level: s.level,
    grade: s.grade,
    refinedVe: s.refinedVe,
    veToNextLevel: s.veToNextLevel,
    freePoints: s.freePoints,
  };
}

export function viewFor(
  record: CampaignRecord,
  campaign: CampaignInfo,
  members: Member[],
  who: { userId: string; role: Role },
): View {
  const seq = record.log.length;
  const sheets = [...record.sheets().values()];
  if (who.role === "gm") {
    return {
      role: "gm",
      campaign,
      members,
      seq,
      characters: sheets,
      rejected: record.rejected.map((r) => ({ id: r.envelope.id, seq: r.envelope.seq, reason: r.reason })),
    };
  }
  return {
    role: "player",
    campaign,
    members,
    characters: sheets.filter((s) => s.playerId === who.userId).map(interfaceSheet),
  };
}

/** Effects a player is shown: those about their own characters, less the ones only the GM reads. */
const GM_ONLY: ReadonlySet<Effect["kind"]> = new Set(["saturation", "voided"]);

export function noticesFor(effects: Effect[], ownCharacterIds: ReadonlySet<string>): Effect[] {
  return effects.filter((e) => !GM_ONLY.has(e.kind) && "characterId" in e && ownCharacterIds.has(e.characterId));
}

/** What the live channel sends after an append. */
export type LiveMessage =
  | { type: "state"; view: View }
  | { type: "appended"; envelope: Envelope; effects: Effect[]; view: GmView }
  | { type: "update"; notices: Effect[]; view: PlayerView }
  | { type: "error"; error: string };
