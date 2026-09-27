/**
 * Replaying the log. `fold` walks the envelopes in order and returns every character's state,
 * the effects each action had (the raw material for notices), and the actions that could not
 * apply. An action rejected on replay stays in the log: after a correction removes an earlier
 * award, a later point placement for a level the character no longer reaches is reported here
 * for the GM to resolve, and the sheets are computed without it.
 */
import { ATTRIBUTES, type Engine, type Stats } from "@gradebreaker/engine";
import type {
  Action,
  AnswerPartyInvite,
  AwardVe,
  ChangeAether,
  ChangeHp,
  Collapse,
  Consolidate,
  CreateCharacter,
  CreatePregen,
  DisbandParty,
  Envelope,
  InviteToParty,
  LeaveParty,
  PlaceSystemPoints,
  ReleaseMessage,
  RollDice,
  SendMessage,
  SpendFreePoints,
} from "./actions.ts";
import { type LootResult, applyAftermath } from "./aftermath.ts";
import { type DeathCause, type Encounter, type MomentumRollRecord, applyCombat, authorizeCombatPlayer, cloneEncounter } from "./combat.ts";
import { type Stack, applyItems, authorizeItemsPlayer } from "./inventory.ts";
import { addMark, checkShape, proficiencyOf } from "./proficiency.ts";
import { type Title, applyTitles, count, titleStats } from "./titles.ts";
import { authorizePillPlayer, takePillOutside } from "./pills.ts";
import { type HveState, applyHve, cloneHve } from "./hve.ts";
import { type CampaignEvent, applyEvents, cloneEvent } from "./events.ts";
import { type CampaignSession, applySessions, cloneSession } from "./sessions.ts";
import { type Clock, applyClock } from "./clock.ts";
import { type PrincipleState, applyPrinciples, clonePrinciples, collectDue } from "./principles.ts";
import { type Quest, type QuestNoticeKind, applyQuests, authorizeQuestPlayer, cloneQuest, questsOnJoin, questsOnLeave } from "./quests.ts";

export interface CharacterState {
  id: string;
  name: string;
  playerId?: string;
  background: string;
  pregen?: string;
  grade: string;
  level: number;
  /** Point buy. */
  base: Stats;
  /** Every System and free point placed since creation. */
  placed: Stats;
  /** Temporary Raw losses from collapses, waiting on a Consolidation completed without interruption. */
  temporary: { attribute: "FOR" | "POW"; actionId: string }[];
  hp: number;
  aether: number;
  /** Unrefined VE in the tank. */
  storedVe: number;
  /** Refined VE toward the next level. */
  refinedVe: number;
  /** Levels whose assigned points the GM has not yet placed. */
  pendingSystemLevels: number[];
  /** Free points the player holds unallocated. */
  freePoints: number;
  /** Death is permanent at F-Grade. */
  dead?: boolean;
  /** Marks by weapon shape; a shape's Proficiency tier is read from its count. */
  marks?: Record<string, number>;
  /** Every title held, Echoed, or released, in the order granted. */
  titles?: Title[];
  /** Counts toward Achievement titles, by counter. */
  counters?: Record<string, number>;
  /** Due catalog titles the GM passed on. */
  dismissedTitles?: string[];
  /** Personal Opportunities refused, by flavor. */
  refusals?: Record<string, number>;
  /** Pills taken since the last Consolidation's first full hour, by kind. */
  pillsTaken?: { healing: number; aether: number };
  /** The Hidden Vector Engine's sheet: Deep, and every sweep's moments. */
  hve?: HveState;
  /** Battle Memory Cards, Insight by family, and the Principles held. */
  principles?: PrincipleState;
}

/** A formal party: its members' character ids in the order they joined. */
export interface Party {
  id: string;
  members: string[];
}

/** An invitation waiting on the invitee's answer; its id is the id of the action that made it. */
export interface PartyInvite {
  id: string;
  fromId: string;
  toId: string;
}

/** A System message recorded and held for the GM to release; its id is the id of its send. */
export interface HeldMessage {
  id: string;
  to: string[];
  text: string;
}

export type Effect =
  | { kind: "memory-granted"; characterId: string; memoryId: string }
  | { kind: "vision"; characterId: string; text: string }
  | { kind: "resonance"; characterId: string; family: string; ip: number; of: number }
  | { kind: "insight"; characterId: string; line: string }
  | { kind: "principle-crystallized"; characterId: string; name: string }
  | { kind: "distillation-offered"; characterId: string; name: string }
  | { kind: "distilled"; characterId: string; name: string; tier: string; grantKind: "application" | "infusion" | "domain"; grant?: string }
  | { kind: "principle-refined"; characterId: string; from: string; name: string }
  | { kind: "clock"; from: number | null; to: number }
  | { kind: "dawn"; count: number }
  | { kind: "quest-due"; questId: string }
  | { kind: "session-started"; sessionId: string; name: string }
  | { kind: "session-ended"; sessionId: string; name: string }
  | { kind: "event-logged"; eventId: string; summary: string }
  | { kind: "hve-swept"; characterId: string; current: Record<string, number>; added: string[] }
  | { kind: "hve-copied"; characterId: string }
  | { kind: "created"; characterId: string }
  | { kind: "reassigned"; characterId: string; playerId: string | null }
  | { kind: "ve-acquired"; characterId: string; ve: number }
  | { kind: "saturation"; characterId: string; from: string; to: string }
  | { kind: "aether-refilled"; characterId: string; hour: number }
  | { kind: "level"; characterId: string; level: number; hour?: number }
  | { kind: "healed-full"; characterId: string; hour: number }
  | { kind: "collapsed"; characterId: string; attribute: "FOR" | "POW"; hours: number }
  | { kind: "temporary-returned"; characterId: string; attribute: "FOR" | "POW" }
  | { kind: "points-placed"; characterId: string; placement: Stats; by: "system" | "free" }
  | { kind: "party-invited"; characterId: string; inviteId: string; fromId: string; fromName: string }
  | { kind: "party-declined"; characterId: string; byId: string; byName: string }
  | { kind: "party-formed"; characterId: string; partyId: string; withNames: string[] }
  | { kind: "party-joined"; characterId: string; partyId: string; memberId: string; memberName: string }
  | { kind: "party-left"; characterId: string; memberId: string; memberName: string }
  | { kind: "party-disbanded"; characterId: string; partyId: string }
  | { kind: "message"; characterId: string; messageId: string; text: string }
  | { kind: "message-held"; messageId: string; to: string[] }
  | {
      kind: "rolled";
      /** Absent for a roller outside the record. */
      characterId?: string;
      total: number;
      /** The dice added to the total: the kept die and its explosion. */
      diceTotal: number;
      /** The character's Force in the rolled Attribute, if one was named. */
      force: number;
      exploded: boolean;
      extraDice: number;
      /** A cascade on a character's roll that grants a Battle Memory Card. */
      battleMemory: boolean;
      surgeCost?: number;
      /** A check against an entered Resistance: success, exceptional, soft, hard, or catastrophic. */
      outcome?: string;
      /** The Proficiency bonus the named weapon shape added. */
      proficiency?: number;
    }
  | { kind: "combat-started"; encounterId: string }
  | { kind: "momentum"; encounterId: string; holder: string; totals: { sideId: string; total: number }[]; rolls: MomentumRollRecord[] }
  | {
      kind: "seized";
      encounterId: string;
      combatantId: string;
      won: boolean;
      total: number;
      against: number;
      rolls: MomentumRollRecord[];
    }
  | { kind: "momentum-shifted"; encounterId: string; holder: string; by: "seize" | "reversal" }
  | { kind: "combat-hp"; encounterId: string; combatantId: string; from: number; to: number }
  | { kind: "combat-downed"; encounterId: string; combatantId: string; characterId?: string; coherence: number }
  | { kind: "vital-coherence"; encounterId: string; combatantId: string; characterId?: string; coherence: number }
  | { kind: "stabilized"; encounterId: string; combatantId: string; characterId?: string }
  | { kind: "revived"; encounterId: string; combatantId: string; characterId?: string; hp: number }
  | { kind: "combat-died"; encounterId: string; combatantId: string; characterId?: string; cause: DeathCause; byId?: string; byCharacterId?: string }
  | { kind: "party-member-died"; characterId: string; memberId: string; memberName: string }
  | { kind: "battle-memory-due"; characterId: string; reason: string }
  | { kind: "item-received"; characterId: string; name: string; count: number }
  | { kind: "loot"; encounterId: string; results: LootResult[] }
  | { kind: "kill-confirmed"; characterId: string; encounterId: string; victimId: string; victimGrade: string; tier: string }
  | { kind: "encounter-settled"; encounterId: string }
  | { kind: "spoils-added"; encounterId: string; items: Stack[] }
  | { kind: QuestNoticeKind; characterId: string; questId: string; line: string; done?: number; of?: number }
  | { kind: "title-conferred"; characterId: string; titleId: string; name: string; negative: boolean }
  | { kind: "title-echoed"; characterId: string; titleId: string; name: string }
  | { kind: "title-released"; characterId: string; titleId: string; name: string }
  | {
      kind: "mark";
      characterId: string;
      shape: string;
      marks: number;
      tier: string;
      /** This Mark reached a new tier. */
      advanced?: boolean;
      /** The count the next tier needs, if one is left. */
      nextAt?: number;
    }
  | {
      kind: "combat-check";
      encounterId: string;
      combatantId: string;
      label: string;
      total: number;
      resistance: number;
      success: boolean;
      /** A Will Save's result: steeled for the encounter, or Suppressed. */
      aura?: "steeled" | "suppressed";
      /** Empty when the Force alone met the Resistance. */
      rolls: MomentumRollRecord[];
    }
  | {
      kind: "pill";
      /** Absent for a pill taken outside a fight. */
      encounterId?: string;
      /** Who gave it; the recipient is `targetId`. */
      combatantId: string;
      targetId: string;
      characterId?: string;
      pill: string;
      pillKind: "healing" | "aether";
      restored: number;
      /** A pill of another Grade, or the third of its kind in this encounter. */
      noEffect?: "grade" | "limit";
    }
  | { kind: "combat-ended"; encounterId: string }
  | {
      kind: "clash";
      encounterId: string;
      attackerId: string;
      defenderId: string;
      margin: number;
      attackTotal: number;
      defenseTotal: number;
      rolls: MomentumRollRecord[];
      /** Characters whose roll cascaded far enough for a Battle Memory Card. */
      battleMemory: string[];
    }
  | { kind: "clash-resolved"; encounterId: string; defenderId: string; yielded: number; damage: number; drivenBack: boolean; turnedAside: boolean }
  | { kind: "voided"; targetId: string; reason: string };

export interface Rejection {
  envelope: Envelope;
  reason: string;
}

export interface FoldResult {
  characters: Map<string, CharacterState>;
  parties: Map<string, Party>;
  /** Invitations still waiting, oldest first. */
  invites: PartyInvite[];
  /** Messages recorded and held, oldest first. */
  held: HeldMessage[];
  /** The fight running now, or the last one (ended). */
  encounter: Encounter | null;
  /** Item stacks by holder: a character's id, or the spoils. */
  inventory: Map<string, Stack[]>;
  /** Every quest issued, by log code. */
  quests: Map<string, Quest>;
  /** Every event logged, by id, oldest first. */
  events: Map<string, CampaignEvent>;
  /** Every session, by id, oldest first; the last one runs until it ends. */
  sessions: Map<string, CampaignSession>;
  /** The in-game clock, once the GM sets it. */
  clock: Clock | null;
  /** Effects keyed by the id of the action that produced them. */
  effects: Map<string, Effect[]>;
  rejected: Rejection[];
  /** Ids removed from the record by a void. */
  voided: Set<string>;
}

/** Thrown inside an action's handler; becomes a Rejection. */
export class Rejected extends Error {
  override name = "Rejected";
}

const sum = (s: Stats) => Object.values(s).reduce((a, b) => a + b, 0);

// ------------------------------------------------------ derived values ---

/** Raw Attributes as they stand: point buy, placed points, titles' flat bonuses, and any temporary collapse loss. */
export function rawStats(c: CharacterState): Stats {
  const out = permanentStats(c);
  for (const t of c.temporary) out[t.attribute]! -= 1;
  return out;
}

/** Raw Attributes without temporary losses: what the Grade cap is checked against. */
export function permanentStats(c: CharacterState): Stats {
  const out: Stats = {};
  const titles = titleStats(c);
  for (const a of ATTRIBUTES) out[a] = (c.base[a] ?? 0) + (c.placed[a] ?? 0) + (titles[a] ?? 0);
  return out;
}

export function maxHpOf(engine: Engine, c: CharacterState): number {
  return engine.maxHp(rawStats(c).FOR!);
}

export function maxAetherOf(engine: Engine, c: CharacterState): number {
  return engine.maxAether(rawStats(c).POW!);
}

/** The last level of the character's Grade: 25 at F. */
export function capLevel(engine: Engine, c: CharacterState): number {
  return engine.grade(c.grade).level_range[1];
}

// --------------------------------------------------------------- fold ---

/** Everything an action can change. Each action works on a copy (see `fold`). */
export interface World {
  characters: Map<string, CharacterState>;
  parties: Map<string, Party>;
  invites: PartyInvite[];
  held: Map<string, HeldMessage>;
  encounter: Encounter | null;
  inventory: Map<string, Stack[]>;
  quests: Map<string, Quest>;
  events: Map<string, CampaignEvent>;
  sessions: Map<string, CampaignSession>;
  clock: Clock | null;
}

function cloneWorld(w: World): World {
  return {
    characters: new Map([...w.characters].map(([k, v]) => [k, cloneState(v)])),
    parties: new Map([...w.parties].map(([k, v]) => [k, { id: v.id, members: [...v.members] }])),
    invites: [...w.invites],
    held: new Map(w.held),
    encounter: w.encounter && cloneEncounter(w.encounter),
    inventory: new Map([...w.inventory].map(([k, v]) => [k, v.map((s) => ({ ...s }))])),
    quests: new Map([...w.quests].map(([k, v]) => [k, cloneQuest(v)])),
    events: new Map([...w.events].map(([k, v]) => [k, cloneEvent(v)])),
    sessions: new Map([...w.sessions].map(([k, v]) => [k, cloneSession(v)])),
    clock: w.clock && { ...w.clock },
  };
}

export function emptyWorld(): World {
  return { characters: new Map(), parties: new Map(), invites: [], held: new Map(), encounter: null, inventory: new Map(), quests: new Map(), events: new Map(), sessions: new Map(), clock: null };
}

/** The world as the fold leaves it: what `rollFor` rolls against. */
export function worldOf(r: FoldResult): World {
  return {
    characters: r.characters,
    parties: r.parties,
    invites: r.invites,
    held: new Map(r.held.map((m) => [m.id, m])),
    encounter: r.encounter,
    inventory: r.inventory,
    quests: r.quests,
    events: r.events,
    sessions: r.sessions,
    clock: r.clock,
  };
}

export function fold(engine: Engine, log: readonly Envelope[]): FoldResult {
  const voided = collectVoids(log);
  let world: World = emptyWorld();
  const effects = new Map<string, Effect[]>();
  const rejected: Rejection[] = [...voided.rejected];
  const rejectedIds = new Set(rejected.map((r) => r.envelope.id));

  for (const env of log) {
    if (rejectedIds.has(env.id)) continue;
    if (env.action.type === "void") {
      effects.set(env.id, [{ kind: "voided", targetId: env.action.targetId, reason: env.action.reason }]);
      continue;
    }
    if (voided.ids.has(env.id)) continue;
    // Each action works on a copy, so a rejected action leaves no partial change behind.
    const scratch = cloneWorld(world);
    try {
      const out = apply(engine, scratch, env);
      collectDue(engine, scratch, env, out);
      world = scratch;
      effects.set(env.id, out);
    } catch (e) {
      if (!(e instanceof Rejected)) throw e;
      rejected.push({ envelope: env, reason: e.message });
    }
  }
  return {
    characters: world.characters,
    parties: world.parties,
    invites: world.invites,
    held: [...world.held.values()],
    encounter: world.encounter,
    inventory: world.inventory,
    quests: world.quests,
    events: world.events,
    sessions: world.sessions,
    clock: world.clock,
    effects,
    rejected,
    voided: voided.ids,
  };
}

function cloneState(c: CharacterState): CharacterState {
  return {
    ...c,
    base: { ...c.base },
    placed: { ...c.placed },
    temporary: [...c.temporary],
    pendingSystemLevels: [...c.pendingSystemLevels],
    ...(c.marks ? { marks: { ...c.marks } } : {}),
    ...(c.titles ? { titles: c.titles.map((t) => ({ ...t, bonus: { ...t.bonus }, ...(t.lost ? { lost: { ...t.lost } } : {}) })) } : {}),
    ...(c.counters ? { counters: { ...c.counters } } : {}),
    ...(c.dismissedTitles ? { dismissedTitles: [...c.dismissedTitles] } : {}),
    ...(c.refusals ? { refusals: { ...c.refusals } } : {}),
    ...(c.pillsTaken ? { pillsTaken: { ...c.pillsTaken } } : {}),
    ...(c.hve ? { hve: cloneHve(c.hve) } : {}),
    ...(c.principles ? { principles: clonePrinciples(c.principles) } : {}),
  };
}

/** A void is valid when its target came earlier, is not itself a void, and was not voided already. */
function collectVoids(log: readonly Envelope[]) {
  const seen = new Map<string, Envelope>();
  const ids = new Set<string>();
  const rejected: Rejection[] = [];
  for (const env of log) {
    const a = env.action;
    if (a.type === "void") {
      const target = seen.get(a.targetId);
      let reason: string | undefined;
      if (!target) reason = `no earlier action ${a.targetId}`;
      else if (target.action.type === "void") reason = "a void cannot be voided; record the action again instead";
      else if (ids.has(a.targetId)) reason = `${a.targetId} is already voided`;
      else if (env.actor.role === "player" && target.actor.userId !== env.actor.userId)
        reason = "a player can undo only their own actions";
      else if (env.actor.role === "player" && target.action.type === "dice.roll")
        reason = "a roll stands; the GM can undo one made by mistake";
      if (reason) rejected.push({ envelope: env, reason });
      else ids.add(a.targetId);
    }
    seen.set(env.id, env);
  }
  return { ids, rejected };
}

function apply(engine: Engine, world: World, env: Envelope): Effect[] {
  const a = env.action;
  const chars = world.characters;
  authorize(world, env);
  switch (a.type) {
    case "character.create":
      return createCharacter(engine, chars, a);
    case "character.pregen":
      return createPregen(engine, chars, a);
    case "character.assign":
      return assign(need(chars, a.characterId), a.playerId);
    case "ve.award":
      return awardVe(engine, chars, a);
    case "consolidation.rest":
      return consolidate(engine, chars, a);
    case "saturation.collapse":
      return collapse(engine, chars, a, env.id);
    case "points.system":
      return placeSystem(engine, need(chars, a.characterId), a);
    case "points.free":
      return spendFree(engine, need(chars, a.characterId), a);
    case "hp.change":
      return changeHp(engine, need(chars, a.characterId), a);
    case "aether.change":
      return changeAether(engine, need(chars, a.characterId), a);
    case "party.invite":
      return inviteToParty(world, a, env.id);
    case "party.answer":
      return answerInvite(world, a, env.id);
    case "party.leave":
      return leaveParty(world, a);
    case "party.disband":
      return disband(world, a);
    case "message.send":
      return sendMessage(world, a, env.id);
    case "message.release":
      return releaseMessage(world, a);
    case "dice.roll":
      return rollDice(engine, world, a);
    case "combat.start":
    case "combat.add":
    case "combat.remove":
    case "combat.momentum":
    case "combat.seize":
    case "combat.reversal":
    case "combat.act":
    case "combat.beat":
    case "combat.done":
    case "combat.round":
    case "combat.hp":
    case "combat.end":
    case "combat.attack":
    case "combat.defend":
    case "combat.resolve":
    case "combat.move":
    case "combat.exposed":
    case "combat.zones":
    case "combat.fate":
    case "combat.stabilize":
    case "combat.execute":
    case "combat.pill":
    case "combat.aura":
    case "combat.will":
    case "combat.suppress":
    case "combat.surprise":
      return applyCombat(engine, world, a, env);
    case "encounter.loot":
    case "encounter.settle":
      return applyAftermath(engine, world, a);
    case "item.give":
    case "item.move":
    case "item.remove":
      return applyItems(world, a);
    case "proficiency.mark":
      return [addMark(engine, need(chars, a.characterId), a.shape)];
    case "title.grant":
    case "title.choose":
    case "title.wear":
    case "title.reveal":
    case "title.release":
    case "title.dismiss":
    case "counter.tick":
      return applyTitles(engine, need(chars, a.characterId), a, env.id);
    case "quest.issue":
    case "quest.answer":
    case "quest.share":
    case "quest.progress":
    case "quest.reveal":
    case "quest.complete":
    case "quest.fail":
    case "quest.withdraw":
      return applyQuests(engine, world, a);
    case "pill.take":
      return takePillOutside(engine, world, a);
    case "hve.sweep":
    case "hve.deep":
      return applyHve(engine, world, a, env.id);
    case "event.log":
      return applyEvents(engine, world, a, env);
    case "session.start":
    case "session.attend":
    case "session.end":
    case "session.summary":
      return applySessions(world, a, env);
    case "clock.set":
    case "clock.advance":
      return applyClock(engine, world, a);
    case "memory.grant":
    case "memory.pass":
    case "memory.choose":
    case "memory.meditate":
    case "insight.award":
    case "principle.name":
    case "principle.distill":
    case "principle.answer":
      return applyPrinciples(engine, world, a, env);
    case "void":
      throw new Error("voids are handled before apply");
  }
}

/**
 * The GM records anything. A player records the choices the book gives the player, for their
 * own character: creating it, spending its free points, and its party invitations, answers,
 * and leaving (app/DESIGN.md, "The player-choice rule").
 */
function authorize(world: World, env: Envelope) {
  if (env.actor.role === "gm") return;
  const a: Action = env.action;
  const me = env.actor.userId;
  const mine = (characterId: string) => {
    const c = world.characters.get(characterId);
    if (c && c.playerId !== me) throw new Rejected(`${c.name} is not this player's character`);
  };
  switch (a.type) {
    case "character.create":
    case "character.pregen":
      if (a.playerId !== me) throw new Rejected("a player creates only their own character");
      return;
    case "points.free":
    case "party.leave":
    case "title.choose":
    case "title.wear":
    case "title.reveal":
    case "memory.choose":
    case "principle.answer":
      return mine(a.characterId);
    case "party.invite":
      return mine(a.fromId);
    case "party.answer": {
      const inv = world.invites.find((i) => i.id === a.inviteId);
      if (inv) mine(inv.toId);
      return;
    }
    case "combat.act":
    case "combat.beat":
    case "combat.done":
    case "combat.seize":
    case "combat.move":
    case "combat.attack":
    case "combat.defend":
    case "combat.resolve":
    case "combat.stabilize":
    case "combat.execute":
    case "combat.pill":
    case "combat.will":
      return authorizeCombatPlayer(world, a, me);
    case "item.give":
    case "item.move":
    case "item.remove":
      return authorizeItemsPlayer(world, a, me);
    case "quest.answer":
    case "quest.share":
      return authorizeQuestPlayer(world, a, me);
    case "pill.take":
      return authorizePillPlayer(world, a, me);
    case "dice.roll":
      if (a.roller.kind !== "character") throw new Rejected("a player rolls for their own character");
      if (a.private) throw new Rejected("only the GM rolls privately");
      return mine(a.roller.characterId);
    default:
      throw new Rejected(`only the GM records ${a.type}`);
  }
}

function need(chars: Map<string, CharacterState>, id: string): CharacterState {
  const c = chars.get(id);
  if (!c) throw new Rejected(`no character ${id}`);
  return c;
}

// --------------------------------------------------------- creation ---

function newCharacter(
  engine: Engine,
  id: string,
  name: string,
  stats: Stats,
  background: string,
  playerId?: string,
  pregen?: string,
): CharacterState {
  const d = engine.rules.character.derived;
  const c: CharacterState = {
    id,
    name,
    background,
    grade: d.starting_grade,
    level: d.starting_level,
    base: Object.fromEntries(ATTRIBUTES.map((a) => [a, stats[a]!])),
    placed: Object.fromEntries(ATTRIBUTES.map((a) => [a, 0])),
    temporary: [],
    hp: 0,
    aether: 0,
    storedVe: d.starting_ve,
    refinedVe: 0,
    pendingSystemLevels: [],
    freePoints: 0,
  };
  if (playerId !== undefined) c.playerId = playerId;
  if (pregen !== undefined) c.pregen = pregen;
  c.hp = maxHpOf(engine, c);
  c.aether = maxAetherOf(engine, c);
  return c;
}

/** Point-buy rules from `rules/character.yaml`. Returns the problems; empty means legal. */
export function pointBuyProblems(engine: Engine, stats: Stats): string[] {
  const pb = engine.rules.character.point_buy;
  const problems: string[] = [];
  for (const k of Object.keys(stats)) {
    if (!(ATTRIBUTES as readonly string[]).includes(k)) problems.push(`${k} is not an Attribute`);
  }
  for (const a of ATTRIBUTES) {
    const v = stats[a];
    if (v === undefined || !Number.isInteger(v)) problems.push(`${a} needs a whole number`);
    else if (v < pb.min_per_stat || v > pb.max_per_stat)
      problems.push(`${a} ${v} is outside ${pb.min_per_stat} to ${pb.max_per_stat}`);
  }
  const total = sum(stats);
  if (total !== pb.points) problems.push(`the stats total ${total}; point buy spends exactly ${pb.points}`);
  return problems;
}

function createCharacter(engine: Engine, chars: Map<string, CharacterState>, a: CreateCharacter): Effect[] {
  if (chars.has(a.characterId)) throw new Rejected(`character ${a.characterId} already exists`);
  const problems = pointBuyProblems(engine, a.stats);
  if (problems.length) throw new Rejected(problems.join("; "));
  if (!a.background.trim()) throw new Rejected("a character needs a Background");
  chars.set(a.characterId, newCharacter(engine, a.characterId, a.name, a.stats, a.background, a.playerId));
  return [{ kind: "created", characterId: a.characterId }];
}

function createPregen(engine: Engine, chars: Map<string, CharacterState>, a: CreatePregen): Effect[] {
  if (chars.has(a.characterId)) throw new Rejected(`character ${a.characterId} already exists`);
  let p;
  try {
    p = engine.pregen(a.pregen);
  } catch {
    throw new Rejected(`no ready-made character named ${a.pregen}`);
  }
  chars.set(a.characterId, newCharacter(engine, a.characterId, p.name, p.stats, p.background, a.playerId, p.name));
  return [{ kind: "created", characterId: a.characterId }];
}

function assign(c: CharacterState, playerId: string | undefined): Effect[] {
  if ((c.playerId ?? null) === (playerId ?? null)) throw new Rejected(`${c.name} is already ${playerId ? "that player's" : "held by the GM"}`);
  if (playerId === undefined) delete c.playerId;
  else c.playerId = playerId;
  return [{ kind: "reassigned", characterId: c.id, playerId: playerId ?? null }];
}

// --------------------------------------------------------------- VE ---

function awardVe(engine: Engine, chars: Map<string, CharacterState>, a: AwardVe): Effect[] {
  if (a.awards.length === 0) throw new Rejected("an award names at least one character");
  const ids = new Set<string>();
  const out: Effect[] = [];
  for (const { characterId, ve } of a.awards) {
    if (ids.has(characterId)) throw new Rejected(`${characterId} is listed twice in one award`);
    ids.add(characterId);
    if (!Number.isInteger(ve) || ve < 0) throw new Rejected(`an award is a whole number of VE, not ${ve}`);
    out.push(...storeVe(engine, need(chars, characterId), ve));
  }
  return out;
}

/** VE into a character's stored pool, with the Saturation band it crosses into. */
export function storeVe(engine: Engine, c: CharacterState, ve: number): Effect[] {
  const before = engine.saturation(c.storedVe, c.grade).band;
  c.storedVe += ve;
  const out: Effect[] = [{ kind: "ve-acquired", characterId: c.id, ve }];
  const after = engine.saturation(c.storedVe, c.grade).band;
  if (after !== before) out.push({ kind: "saturation", characterId: c.id, from: before, to: after });
  return out;
}

// ---------------------------------------------------- Consolidation ---

/**
 * Run full hours of Consolidation (Cultivation, "Consolidation (Structured Rest)"). Each hour
 * refines up to the rate, and a level lands the moment refined VE reaches its cost; each hour
 * restores a fifth of Max HP (fractions dropped) and the fifth restores the rest; the first
 * full hour refills Aether. At the Level cap nothing refines and the stockpile waits.
 */
function runHours(engine: Engine, c: CharacterState, hours: number, highDensity: boolean, from = 1): Effect[] {
  const out: Effect[] = [];
  const cons = engine.rules.cultivation.consolidation;
  const rate = engine.refineRate(c.grade, highDensity);
  const cost = engine.levelCost(c.grade);
  const cap = capLevel(engine, c);
  for (let h = from; h < from + hours; h++) {
    const bandBefore = engine.saturation(c.storedVe, c.grade).band;
    if (c.level < cap) {
      const r = Math.min(rate, c.storedVe);
      c.storedVe -= r;
      c.refinedVe += r;
      while (c.refinedVe >= cost && c.level < cap) {
        c.refinedVe -= cost;
        levelUp(engine, c);
        out.push({ kind: "level", characterId: c.id, level: c.level, hour: h });
      }
      if (c.level >= cap && c.refinedVe > 0) {
        // Refined past the cap within the hour: it waits in the tank with the rest.
        c.storedVe += c.refinedVe;
        c.refinedVe = 0;
      }
    }
    const bandAfter = engine.saturation(c.storedVe, c.grade).band;
    if (bandAfter !== bandBefore) out.push({ kind: "saturation", characterId: c.id, from: bandBefore, to: bandAfter });
    const maxHp = maxHpOf(engine, c);
    if (h >= cons.hp_full_at_hour) {
      if (c.hp < maxHp) out.push({ kind: "healed-full", characterId: c.id, hour: h });
      c.hp = maxHp;
    } else {
      c.hp = Math.min(maxHp, c.hp + Math.floor(maxHp / 5));
    }
    if (h === cons.aether_refills_at_full_hour) {
      c.aether = maxAetherOf(engine, c);
      // The pill count starts over when Aether refills (Items).
      delete c.pillsTaken;
      out.push({ kind: "aether-refilled", characterId: c.id, hour: h });
    }
  }
  return out;
}

function levelUp(engine: Engine, c: CharacterState) {
  const lv = engine.rules.character.leveling;
  c.level += 1;
  c.pendingSystemLevels.push(c.level);
  c.freePoints += lv.free * engine.scale(c.grade);
}

function consolidate(engine: Engine, chars: Map<string, CharacterState>, a: Consolidate): Effect[] {
  if (a.rests.length === 0) throw new Rejected("a Consolidation names at least one character");
  const min = engine.rules.cultivation.consolidation.minimum_hours;
  const ids = new Set<string>();
  const out: Effect[] = [];
  for (const r of a.rests) {
    if (ids.has(r.characterId)) throw new Rejected(`${r.characterId} is listed twice in one rest`);
    ids.add(r.characterId);
    const c = need(chars, r.characterId);
    if (!Number.isInteger(r.hours) || r.hours < 0) throw new Rejected(`hours are whole and not negative, not ${r.hours}`);
    // A rest interrupted before its first hour completes changes nothing; an uninterrupted one takes at least the minimum.
    if (!r.interrupted && r.hours < min) throw new Rejected(`a completed Consolidation takes at least ${min} hour`);
    out.push(...runHours(engine, c, r.hours, a.highDensity));
    // A Consolidation counts as completed once its first full hour is done, interrupted or not (Titles, Deep Breather).
    if (r.hours >= 1) count(c, "consolidations");
    if (!r.interrupted) {
      for (const t of c.temporary) out.push({ kind: "temporary-returned", characterId: c.id, attribute: t.attribute });
      c.temporary = [];
    }
  }
  return out;
}

/** Full hours a rest must run to refine `storedVe` down to `target` or below. */
function hoursToRefineTo(engine: Engine, c: CharacterState, target: number, highDensity: boolean): number {
  return Math.max(1, Math.ceil((c.storedVe - target) / engine.refineRate(c.grade, highDensity)));
}

function collapse(engine: Engine, chars: Map<string, CharacterState>, a: Collapse, actionId: string): Effect[] {
  const c = need(chars, a.characterId);
  const sat = engine.saturation(c.storedVe, c.grade);
  if (!sat.collapse_clock) throw new Rejected(`${c.name} is not at Critical Saturation (stored ${c.storedVe} VE)`);
  c.temporary.push({ attribute: a.attribute, actionId });
  c.hp = Math.min(c.hp, maxHpOf(engine, c));
  c.aether = Math.min(c.aether, maxAetherOf(engine, c));

  const tolerance = engine.tolerance(c.grade);
  const capHours = engine.rules.cultivation.saturation.collapse_clock.at_level_cap_hours;
  const out: Effect[] = [];
  let hours = 0;
  // Unwakeable until stored VE falls to Tolerance or below; at the Level cap, 5 full hours.
  while (true) {
    const atCap = c.level >= capLevel(engine, c);
    const step = atCap ? capHours - hours : hoursToRefineTo(engine, c, tolerance, a.highDensity);
    if (step <= 0) break;
    out.push(...runHours(engine, c, step, a.highDensity, hours + 1));
    hours += step;
    if (c.storedVe <= tolerance) break;
  }
  return [{ kind: "collapsed", characterId: c.id, attribute: a.attribute, hours }, ...out];
}

// --------------------------------------------------------- level-ups ---

function checkPlacement(engine: Engine, c: CharacterState, placement: Stats): number {
  const cap = engine.statCap(c.grade);
  const now = permanentStats(c);
  for (const [attr, pts] of Object.entries(placement)) {
    if (!(ATTRIBUTES as readonly string[]).includes(attr)) throw new Rejected(`${attr} is not an Attribute`);
    if (!Number.isInteger(pts) || pts < 0) throw new Rejected(`points are whole and not negative, not ${pts}`);
    if (pts > 0 && now[attr]! + pts > cap)
      throw new Rejected(`${attr} is ${now[attr]} and the ${c.grade}-Grade cap is ${cap}: place these points elsewhere`);
  }
  return sum(placement);
}

function placeSystem(engine: Engine, c: CharacterState, a: PlaceSystemPoints): Effect[] {
  const lv = engine.rules.character.leveling;
  const i = c.pendingSystemLevels.indexOf(a.level);
  if (i < 0) throw new Rejected(`${c.name} has no unplaced assigned points for Level ${a.level}`);
  if (a.level >= lv.class_level)
    throw new Rejected(`from Level ${lv.class_level} the class profile places assigned points; class selection is not in the app yet`);
  const due = lv.system_assigned * engine.scale(c.grade);
  const total = checkPlacement(engine, c, a.placement);
  if (total !== due) throw new Rejected(`Level ${a.level} places exactly ${due} assigned points, not ${total}`);
  for (const [attr, pts] of Object.entries(a.placement)) c.placed[attr] = (c.placed[attr] ?? 0) + pts;
  c.pendingSystemLevels.splice(i, 1);
  return [{ kind: "points-placed", characterId: c.id, placement: a.placement, by: "system" }];
}

function spendFree(engine: Engine, c: CharacterState, a: SpendFreePoints): Effect[] {
  const total = checkPlacement(engine, c, a.placement);
  if (total === 0) throw new Rejected("spend at least one point");
  if (total > c.freePoints) throw new Rejected(`${c.name} holds ${c.freePoints} free points, not ${total}`);
  for (const [attr, pts] of Object.entries(a.placement)) c.placed[attr] = (c.placed[attr] ?? 0) + pts;
  c.freePoints -= total;
  return [{ kind: "points-placed", characterId: c.id, placement: a.placement, by: "free" }];
}

// ------------------------------------------------------ HP and Aether ---

function changeHp(engine: Engine, c: CharacterState, a: ChangeHp): Effect[] {
  if (!Number.isInteger(a.delta)) throw new Rejected("HP changes by whole numbers");
  // HP does not go below 0 or above Max HP (Core Mechanics, "Downed and Death").
  c.hp = Math.max(0, Math.min(maxHpOf(engine, c), c.hp + a.delta));
  return [];
}

function changeAether(engine: Engine, c: CharacterState, a: ChangeAether): Effect[] {
  if (!Number.isInteger(a.delta)) throw new Rejected("Aether changes by whole numbers");
  if (c.aether + a.delta < 0) throw new Rejected(`${c.name} has ${c.aether} Aether, not ${-a.delta}`);
  c.aether = Math.min(maxAetherOf(engine, c), c.aether + a.delta);
  return [];
}

// ------------------------------------------------------------- party ---

function partyOf(world: World, characterId: string): Party | undefined {
  for (const p of world.parties.values()) if (p.members.includes(characterId)) return p;
  return undefined;
}

/** Drops invitations that no longer mean anything: to someone already in the inviter's party. */
function pruneInvites(world: World) {
  world.invites = world.invites.filter((i) => {
    const p = partyOf(world, i.fromId);
    return !(p && p.members.includes(i.toId));
  });
}

function inviteToParty(world: World, a: InviteToParty, id: string): Effect[] {
  const from = need(world.characters, a.fromId);
  const to = need(world.characters, a.toId);
  if (from.id === to.id) throw new Rejected("a character cannot invite themselves");
  if (from.dead || to.dead) throw new Rejected(`${from.dead ? from.name : to.name} is dead`);
  const p = partyOf(world, from.id);
  if (p && p.members.includes(to.id)) throw new Rejected(`${to.name} is already in ${from.name}'s party`);
  if (world.invites.some((i) => i.fromId === from.id && i.toId === to.id))
    throw new Rejected(`${from.name} has already invited ${to.name}`);
  world.invites.push({ id, fromId: from.id, toId: to.id });
  return [{ kind: "party-invited", characterId: to.id, inviteId: id, fromId: from.id, fromName: from.name }];
}

function answerInvite(world: World, a: AnswerPartyInvite, id: string): Effect[] {
  const inv = world.invites.find((i) => i.id === a.inviteId);
  if (!inv) throw new Rejected("that invitation is no longer open");
  const from = need(world.characters, inv.fromId);
  const to = need(world.characters, inv.toId);
  world.invites = world.invites.filter((i) => i !== inv);
  if (!a.accept) return [{ kind: "party-declined", characterId: from.id, byId: to.id, byName: to.name }];

  if (partyOf(world, to.id)) throw new Rejected(`${to.name} is in a party already and leaves it before joining another`);
  const out: Effect[] = [];
  const existing = partyOf(world, from.id);
  if (existing) {
    existing.members.push(to.id);
    for (const m of existing.members)
      out.push({ kind: "party-joined", characterId: m, partyId: existing.id, memberId: to.id, memberName: to.name });
    // A joiner takes the party's shared quests at their current count.
    out.push(...questsOnJoin(world, existing.id, to.id));
  } else {
    const party = { id: `party-${id}`, members: [from.id, to.id] };
    world.parties.set(party.id, party);
    out.push({ kind: "party-formed", characterId: from.id, partyId: party.id, withNames: [to.name] });
    out.push({ kind: "party-formed", characterId: to.id, partyId: party.id, withNames: [from.name] });
  }
  pruneInvites(world);
  return out;
}

function endParty(world: World, p: Party): Effect[] {
  world.parties.delete(p.id);
  // The party's shared quests stay with their holders, no longer shared.
  for (const q of world.quests.values()) if (q.sharedIn === p.id) delete q.sharedIn;
  return p.members.map((m) => ({ kind: "party-disbanded", characterId: m, partyId: p.id }) as const);
}

function leaveParty(world: World, a: LeaveParty): Effect[] {
  const c = need(world.characters, a.characterId);
  const p = partyOf(world, c.id);
  if (!p) throw new Rejected(`${c.name} is not in a party`);
  const out: Effect[] = p.members.map((m) => ({ kind: "party-left", characterId: m, memberId: c.id, memberName: c.name }) as const);
  p.members = p.members.filter((m) => m !== c.id);
  // A holder who leaves keeps none of the party's shared quests.
  questsOnLeave(world, p.id, c.id);
  // A party of one is no party.
  if (p.members.length < 2) out.push(...endParty(world, p));
  return out;
}

function disband(world: World, a: DisbandParty): Effect[] {
  const p = world.parties.get(a.partyId);
  if (!p) throw new Rejected("no such party");
  return endParty(world, p);
}

// ---------------------------------------------------------- messages ---

function deliver(to: string[], messageId: string, text: string): Effect[] {
  return to.map((characterId) => ({ kind: "message", characterId, messageId, text }) as const);
}

function sendMessage(world: World, a: SendMessage, id: string): Effect[] {
  if (!a.text.trim()) throw new Rejected("a message needs text");
  if (a.to.length === 0) throw new Rejected("a message goes to at least one character");
  if (new Set(a.to).size !== a.to.length) throw new Rejected("a character is listed twice");
  for (const c of a.to) need(world.characters, c);
  if (a.hold) {
    world.held.set(id, { id, to: [...a.to], text: a.text });
    return [{ kind: "message-held", messageId: id, to: [...a.to] }];
  }
  return deliver(a.to, id, a.text);
}

function releaseMessage(world: World, a: ReleaseMessage): Effect[] {
  const m = world.held.get(a.messageId);
  if (!m) throw new Rejected("no held message with that id");
  world.held.delete(m.id);
  return deliver(m.to, m.id, m.text);
}

// ------------------------------------------------------------------ dice ---

function rollDice(engine: Engine, world: World, a: RollDice): Effect[] {
  const c = a.roller.kind === "character" ? need(world.characters, a.roller.characterId) : undefined;
  let grade: string;
  if (c) grade = c.grade;
  else {
    if (a.roller.kind !== "other" || !a.roller.name.trim()) throw new Rejected("name who rolls");
    grade = a.roller.grade;
  }
  let threshold: number;
  try {
    threshold = engine.volatilityThreshold(grade);
  } catch {
    throw new Rejected(`no Grade ${grade}`);
  }
  const dice = a.natural;
  if (!dice || dice.length === 0) throw new Rejected("the dice were not rolled");
  for (const d of [...dice, ...(a.dropped === undefined ? [] : [a.dropped])])
    if (!Number.isInteger(d) || d < 1 || d > 100) throw new Rejected(`a d100 reads 1 to 100, not ${d}`);
  const table = a.rollKind === "table";
  if (table && (a.advantage || a.surge || dice.length !== 1))
    throw new Rejected("a roll read against a table is one die, with no Advantage, no Surge, and no explosion");
  if (!table) {
    // Every die but the last met the threshold; the last did not, or the cascade is unfinished.
    dice.slice(0, -1).forEach((d) => {
      if (d < threshold) throw new Rejected(`${d} is under the ${grade}-Grade threshold ${threshold}, so it did not explode`);
    });
    if (dice[dice.length - 1]! >= threshold) throw new Rejected(`the last die, ${dice[dice.length - 1]}, explodes: roll another`);
  }
  if (a.advantage) {
    if (a.dropped === undefined) throw new Rejected("Advantage rolls two dice: enter the lower one too");
    if (a.dropped > dice[0]!) throw new Rejected("Advantage keeps the higher die");
  } else if (a.dropped !== undefined) throw new Rejected("only Advantage sets a die aside");
  if (!Number.isInteger(a.modifier)) throw new Rejected("modifiers are whole numbers");

  let force = 0;
  if (a.roller.kind === "character" && a.roller.attribute) {
    const raw = rawStats(c!)[a.roller.attribute];
    if (raw === undefined) throw new Rejected(`${a.roller.attribute} is not an Attribute`);
    force = engine.force(raw, grade);
  }
  // A Clash made with a weapon shape adds the character's tier in it, and an explosion earns a Mark.
  let proficiency = 0;
  if (a.shape !== undefined) {
    if (!c || a.rollKind !== "clash") throw new Rejected("a weapon shape goes with a character's Clash");
    checkShape(engine, a.shape);
    proficiency = proficiencyOf(engine, c, a.shape).bonus;
  }
  let surgeCost: number | undefined;
  if (a.surge) {
    if (!c) throw new Rejected("record a creature's Surge in its modifier");
    if (a.rollKind !== "clash") throw new Rejected("Surge adds to a Clash roll");
    surgeCost = engine.surgeCost(maxAetherOf(engine, c));
    if (c.aether < surgeCost) throw new Rejected(`${c.name} has ${c.aether} Aether and a Surge costs ${surgeCost}`);
    c.aether -= surgeCost;
  }
  const diceTotal = dice.reduce((x, y) => x + y, 0);
  const total = diceTotal + force + proficiency + a.modifier + (a.surge ? engine.rules.combat.surge.bonus : 0);
  const extraDice = dice.length - 1;
  const effect: Effect = {
    kind: "rolled",
    total,
    diceTotal,
    force,
    exploded: extraDice > 0,
    extraDice,
    battleMemory: Boolean(c) && extraDice >= engine.rules.grades.volatility.battle_memory_cascade_dice,
  };
  if (c) effect.characterId = c.id;
  if (surgeCost !== undefined) effect.surgeCost = surgeCost;
  if (a.rollKind === "check" && a.resistance !== undefined) effect.outcome = engine.checkOutcome(total, a.resistance, dice[0]!, grade);
  if (proficiency) effect.proficiency = proficiency;
  return a.shape !== undefined && extraDice > 0 ? [effect, addMark(engine, c!, a.shape)] : [effect];
}
