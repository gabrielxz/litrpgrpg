/**
 * What the server sends the browser: each person's view of a campaign and the live channel's
 * messages. The server builds them (server/src/views.ts); the web client reads them.
 */
import type { Effect, HeldMessage, Party, PartyInvite } from "./fold.ts";
import type { Stack } from "./inventory.ts";
import type { Quest } from "./quests.ts";
import type { Combatant, Encounter } from "./combat.ts";
import type { Envelope } from "./actions.ts";
import type { Sheet, SheetDiff } from "./sheet.ts";

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
}

export interface EncounterView extends Omit<Encounter, "combatants"> {
  combatants: CombatantView[];
}

/**
 * The fight as a player sees it: the table's shape (round, turn order, who holds Momentum,
 * who is acting, a shift called for next round) and each character's Beats. No creature's
 * Health or Beats, and no character's Health beyond what the party frame shows.
 */
/** A Clash as the table sees it: names, the totals once rolled, and what the defender may Yield. */
export interface PlayerClash {
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  label?: string;
  stage: "defense" | "yield" | "resolved";
  cornered?: boolean;
  attackTotal?: number;
  defenseTotal?: number;
  margin?: number;
  attackerWins?: boolean;
  /** For a character defender: the most Beats they can Yield. */
  yieldCap?: number;
  /** The attacker's Grade damage multiplier, for showing what each Yield leaves. */
  damageMultiplier?: number;
  yielded?: number;
  damage?: number;
  drivenBack?: boolean;
  turnedAside?: boolean;
}

export interface PlayerCombat {
  name: string;
  round: number;
  zones: { id: string; name: string }[];
  clash: PlayerClash | null;
  lastClash: PlayerClash | null;
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
    zoneId: string | null;
    exposed: boolean;
    /** At 0 HP and alive; whether the countdown has stopped is what the table can see. */
    downed: boolean;
    stabilized: boolean;
    suppressed: boolean;
    /** Holds a Surprise Beat before Initial Momentum. */
    surprise: boolean;
    /** Characters only. */
    beats?: number;
    beatsPerTurn?: number;
    characterId?: string;
    /** Pills taken this encounter, by kind: characters only. */
    pills?: { healing: number; aether: number };
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
  dead: boolean;
  /** While Downed in a fight: the System's reading, 3 falling to 1. */
  vitalCoherence: number | null;
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
  /** What the character carries. */
  items: Stack[];
  proficiencies: Sheet["proficiencies"];
  /** Pills taken since the last Consolidation, by kind. */
  pillsTaken: Sheet["pillsTaken"];
  /** Every title the character holds, hidden ones included; Echoed and released ones in the history. */
  titles: Sheet["titles"];
  /** The quest log: offered, active, and closed quests as this character's log shows them. */
  quests: PlayerQuest[];
}

export interface GmView {
  role: "gm";
  campaign: CampaignInfo;
  /** The rules version new campaigns start on; this campaign moves to it when the GM says so. */
  currentRules: string;
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
  /** The last fight, ended and waiting to be settled: kills, loot, VE, spoils. */
  aftermath: EncounterView | null;
  /** Item stacks by holder: each character's id, and `spoils`. */
  inventory: Record<string, Stack[]>;
  /** Every quest issued, newest first. */
  quests: Quest[];
}

/** A quest on one character's log: hidden content obscured, and their own answer as its status. */
export interface PlayerQuest extends Omit<Quest, "holders" | "refusedBy" | "sharedIn"> {
  shared: boolean;
  /** A Routine or Faction quest the character can share with their party now. */
  sharable: boolean;
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
  /** What the party has not divided yet. */
  spoils: Stack[];
}

export type View = GmView | PlayerView;

/** What moving a campaign to the current rules would do: the whole log replayed under them. */
export interface RulesMove {
  from: string;
  to: string;
  changes: SheetDiff[];
  /** Actions that apply under the pinned rules and would stop applying. */
  newlyRejected: { id: string; seq: number; reason: string }[];
}

/** What the live channel sends after an append. */
export type LiveMessage =
  | { type: "state"; view: View }
  | { type: "appended"; envelope: Envelope; effects: Effect[]; view: GmView }
  | { type: "update"; view: PlayerView }
  | { type: "error"; error: string };
