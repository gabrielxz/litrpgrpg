/**
 * What the server sends the browser: each person's view of a campaign and the live channel's
 * messages. The server builds them (server/src/views.ts); the web client reads them.
 */
import type { Effect, HeldMessage, Party, PartyInvite } from "./fold.ts";
import type { Stack } from "./inventory.ts";
import type { Quest } from "./quests.ts";
import type { CampaignEvent } from "./events.ts";
import type { CampaignSession } from "./sessions.ts";
import type { Clock } from "./clock.ts";
import type { InterfacePrinciples } from "./principles.ts";
import type { ClassPackage } from "./classes.ts";
import type { TitleRead } from "./titles.ts";
import type { PrepItem } from "./prep.ts";
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
}

export interface EncounterView extends Omit<Encounter, "combatants"> {
  combatants: CombatantView[];
  /** While a lost Clash waits on its Yield: the defender's allies who can cover them now (Take It). */
  coverIds?: string[];
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
  /** Margin already cut by allies' covers, before the Yield. */
  cut?: number;
  /** Combatants who can cover the defender now (Take It). */
  coverIds?: string[];
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
    /** The once-per-fight class technique spent: characters only. */
    techniqueUsed?: boolean;
    /** Reactions the class permission has taken this fight: characters only. */
    reactionsUsed?: number;
    /** No Life Here reads them as dead: shown on their own player's screen only. */
    readAsDead?: boolean;
    /** Current Health, read by a class permission (What Is Left): creatures in the holder's Zone only. */
    hp?: number;
    maxHp?: number;
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
  /** The Principle, the Battle Memory Cards held, and a Quiet Path offer. */
  principle: InterfacePrinciples;
  /** The quest log: offered, active, and closed quests as this character's log shows them. */
  quests: PlayerQuest[];
  /** The class held, in both descriptions: the System's notice and the mechanics the table runs. */
  class: PlayerClass | null;
  /** Offers standing until one is accepted. */
  classOffers: PlayerClass[];
  /** What this character reads of each being it can inspect: the other players' characters, and everyone in the fight. */
  inspection: InspectRead[];
}

/** One inspection (What Can Be Seen, "What You See of Others"): the titles the Grade gap reads, or nothing at all. */
export interface InspectRead {
  id: string;
  name: string;
  /** False when the target is a Grade or more above: "you look, and it does not resolve". */
  resolves: boolean;
  /** Read as dead (No Life Here): inspection returns nothing, titles included. */
  nothing?: boolean;
  titles: TitleRead[];
}

/** A class as its holder sees it: the guarded mark and the book's name are the GM's alone. */
export interface PlayerClass extends Omit<ClassPackage, "guarded" | "book"> {
  /** The Grade it was acquired at, which prices an Aether technique. */
  grade?: string;
  /** The selection bonus that landed on the lead Attribute. */
  bonus?: number;
  /** A once-a-day permission spent since dawn; null when the table keeps no clock. */
  usedSinceDawn?: boolean | null;
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
  /** The last fight, ended and waiting to be settled: kills, loot, VE, spoils. */
  aftermath: EncounterView | null;
  /** Item stacks by holder: each character's id, and `spoils`. */
  inventory: Record<string, Stack[]>;
  /** Every quest issued, newest first. */
  quests: Quest[];
  /** Every event logged, newest first. */
  events: CampaignEvent[];
  /** Every session, newest first; a running session has no end. */
  sessions: CampaignSession[];
  /** The in-game clock, once set. */
  clock: Clock | null;
  /** Fights, quests, and notices prepared to fire, in the order saved. */
  prep: PrepItem[];
}

/** A quest on one character's log: hidden content obscured, and their own answer as its status. */
export interface PlayerQuest extends Omit<Quest, "holders" | "refusedBy" | "sharedIn" | "due"> {
  /** Whole hours left on a time limit, 0 once it has run out. */
  hoursLeft?: number;
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

// ------------------------------------------------------- listening ---

export type ListeningMode = "off" | "listening" | "paused";

/** What one person's microphone is doing, as the GM's panel shows it. */
/** `not-transcribed`: audio arrives, but the speech service refused or dropped the stream and it is retried. */
export type StreamState = "live" | "muted" | "silent" | "no-microphone" | "not-connected" | "not-transcribed";

export interface StreamStatus {
  userId: string;
  displayName: string;
  role: Role;
  consented: boolean;
  state: StreamState;
  /** The last half second's loudness, 0 to 1. */
  level: number;
  /** Whether a test recording keeps this person's audio now. */
  recorded?: boolean;
  /** Why the stream is not transcribed, in words for the GM. */
  failure?: string;
}

/** What each tab is told. `stopped`, `streams`, and `missing` go to the GM only. */
export interface ListeningStatus {
  mode: ListeningMode;
  /** Why listening stopped last, while it is off. The GM's only. */
  stopped?: string;
  /** Whether this person has consented. */
  consented: boolean;
  /** Whether this socket is the one this person captures with. */
  capturing: boolean;
  /** Whether this person is present, so their tab is asked to capture. */
  present: boolean;
  streams?: StreamStatus[];
  /** Present people who have not consented: listening cannot start until they do. */
  missing?: string[];
  /** Whether this person has consented to test recordings. */
  recordingConsented?: boolean;
  /** Whether a test recording keeps this person's audio now, so their tab says so. */
  recorded?: boolean;
  /** The GM's: whether a test recording is running, and the present people it cannot keep for want of consent. */
  recording?: { on: boolean; unconsented: string[] };
}

/** A final stretch of one person's speech, as the listening heard it. The GM's only. */
export interface HeardLine {
  id: string;
  userId: string;
  /** The session running when it was said. */
  sessionId: string | null;
  startedAt: string;
  endedAt: string;
  text: string;
}

/** What the live channel sends after an append, the listening status to a tab that asked for it, and to the GM what was heard. */
export type LiveMessage =
  | { type: "listening"; status: ListeningStatus }
  | { type: "heard"; lines: HeardLine[] }
  /** The GM's drafts changed on the server (a window of heard lines started drafting or finished): fetch them again. */
  | { type: "drafts" }
  | { type: "state"; view: View }
  | { type: "appended"; envelope: Envelope; effects: Effect[]; view: GmView }
  | { type: "update"; view: PlayerView }
  | { type: "error"; error: string };
