/**
 * Runtime shapes of the actions, for anything that arrives from outside the process (an HTTP
 * body, a stored row from an older build). The record's rules still decide whether an action
 * applies; these only guarantee it has the fields the rules read.
 */
import { z } from "zod";
import type { Action } from "./actions.ts";

const id = z.string().min(1).max(100);
const whole = z.number().int();
const stats = z.record(z.string(), whole);

const dice = z.array(whole).max(50);
const rolledDice = z.object({ natural: dice, dropped: whole.optional() });
const forceOption = z.object({ force: whole, stat: z.string().max(10), means: z.string().max(60).optional() });
const clashSide = z.object({
  attribute: z.string().max(10).optional(),
  force: whole.optional(),
  means: z.string().max(60).optional(),
  modifier: whole,
  advantage: z.boolean().optional(),
  surge: z.boolean().optional(),
  shape: z.string().max(40).optional(),
});
const zone = z.object({ id, name: z.string().max(60) });
const stack = z.object({ name: z.string().max(80), count: whole });
const combatant = z.object({
  combatantId: id,
  sideId: id,
  characterId: id.optional(),
  name: z.string().max(100).optional(),
  creature: z.string().max(100).optional(),
  kind: z.enum(["creature", "npc"]).optional(),
  grade: z.string().max(4).optional(),
  maxHp: whole.optional(),
  momentumForce: whole.optional(),
  beats: whole.optional(),
  yields: z.boolean().optional(),
  offense: z.array(forceOption).max(10).optional(),
  defense: z.array(forceOption).max(10).optional(),
  zoneId: id.optional(),
});

const basis = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kill"), creature: z.string().optional(), tier: z.string(), victimGrade: z.string() }),
  z.object({ kind: z.literal("quest"), questId: z.string().optional() }),
  z.object({ kind: z.literal("core"), core: z.string() }),
  z.object({ kind: z.literal("ambient"), hours: whole, density: z.string() }),
  z.object({ kind: z.literal("hidden-achievement") }),
  z.object({ kind: z.literal("other"), note: z.string() }),
]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("character.create"),
    characterId: id,
    name: z.string().min(1).max(100),
    playerId: id.optional(),
    stats,
    background: z.string().max(500),
  }),
  z.object({ type: z.literal("character.pregen"), characterId: id, pregen: z.string(), playerId: id.optional() }),
  z.object({ type: z.literal("character.assign"), characterId: id, playerId: id.optional() }),
  z.object({
    type: z.literal("ve.award"),
    basis,
    awards: z.array(z.object({ characterId: id, ve: whole })),
  }),
  z.object({
    type: z.literal("consolidation.rest"),
    highDensity: z.boolean(),
    rests: z.array(z.object({ characterId: id, hours: whole, interrupted: z.boolean().optional() })),
  }),
  z.object({
    type: z.literal("saturation.collapse"),
    characterId: id,
    attribute: z.enum(["FOR", "POW"]),
    highDensity: z.boolean(),
  }),
  z.object({ type: z.literal("points.system"), characterId: id, level: whole, placement: stats }),
  z.object({ type: z.literal("points.free"), characterId: id, placement: stats }),
  z.object({ type: z.literal("hp.change"), characterId: id, delta: whole }),
  z.object({ type: z.literal("aether.change"), characterId: id, delta: whole }),
  z.object({ type: z.literal("party.invite"), fromId: id, toId: id }),
  z.object({ type: z.literal("party.answer"), inviteId: id, accept: z.boolean() }),
  z.object({ type: z.literal("party.leave"), characterId: id }),
  z.object({ type: z.literal("party.disband"), partyId: id }),
  z.object({
    type: z.literal("message.send"),
    to: z.array(id).max(50),
    text: z.string().max(2000),
    hold: z.boolean().optional(),
  }),
  z.object({ type: z.literal("message.release"), messageId: id }),
  z.object({
    type: z.literal("dice.roll"),
    roller: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("character"), characterId: id, attribute: z.string().max(10).optional() }),
      z.object({ kind: z.literal("other"), name: z.string().max(100), grade: z.string().max(4) }),
    ]),
    rollKind: z.enum(["clash", "check", "table"]),
    label: z.string().max(200).optional(),
    modifier: whole,
    advantage: z.boolean().optional(),
    surge: z.boolean().optional(),
    shape: z.string().max(40).optional(),
    private: z.boolean().optional(),
    resistance: whole.optional(),
    natural: z.array(whole).max(50).optional(),
    dropped: whole.optional(),
    entered: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("combat.start"),
    encounterId: id,
    name: z.string().max(100),
    sides: z.array(z.object({ id, name: z.string().max(60) })).max(8),
    zones: z.array(zone).max(20).optional(),
    combatants: z.array(combatant).max(60),
  }),
  z.object({ type: z.literal("combat.add"), combatant }),
  z.object({ type: z.literal("combat.remove"), combatantId: id, note: z.string().max(200).optional() }),
  z.object({
    type: z.literal("combat.momentum"),
    attempts: z.array(z.array(z.object({ sideId: id, combatantId: id, natural: dice }))).max(50).optional(),
  }),
  z.object({
    type: z.literal("combat.seize"),
    combatantId: id,
    attempts: z.array(z.object({ seizer: dice, holder: dice, holderCombatantId: id })).max(50).optional(),
  }),
  z.object({ type: z.literal("combat.reversal"), sideId: id, note: z.string().max(200).optional() }),
  z.object({ type: z.literal("combat.act"), combatantId: id }),
  z.object({ type: z.literal("combat.beat"), combatantId: id, what: z.string().max(60) }),
  z.object({ type: z.literal("combat.done"), combatantId: id }),
  z.object({ type: z.literal("combat.round") }),
  z.object({ type: z.literal("combat.hp"), combatantId: id, delta: whole }),
  z.object({ type: z.literal("combat.end") }),
  z.object({
    type: z.literal("combat.attack"),
    attackerId: id,
    defenderId: id,
    attack: clashSide,
    flanking: z.boolean().optional(),
    cornered: z.boolean().optional(),
    free: z.boolean().optional(),
    label: z.string().max(60).optional(),
  }),
  z.object({ type: z.literal("combat.defend"), defense: clashSide, attackDice: rolledDice.optional(), defenseDice: rolledDice.optional() }),
  z.object({ type: z.literal("combat.resolve"), yield: whole }),
  z.object({ type: z.literal("combat.move"), combatantId: id, zoneId: id, forced: z.boolean().optional() }),
  z.object({ type: z.literal("combat.exposed"), combatantId: id, exposed: z.boolean() }),
  z.object({ type: z.literal("combat.zones"), zones: z.array(zone).max(20) }),
  z.object({ type: z.literal("combat.fate"), combatantId: id, fate: z.enum(["dead", "stabilized"]) }),
  z.object({
    type: z.literal("combat.stabilize"),
    combatantId: id,
    targetId: id,
    force: whole.optional(),
    advantage: z.boolean().optional(),
    dice: rolledDice.optional(),
  }),
  z.object({ type: z.literal("combat.execute"), combatantId: id, targetId: id }),
  z.object({ type: z.literal("combat.pill"), combatantId: id, targetId: id, pill: z.string().max(60) }),
  z.object({
    type: z.literal("combat.aura"),
    entityId: id,
    flaring: z.boolean(),
    flare: z.boolean().optional(),
    saves: z.array(z.object({ combatantId: id, dice: rolledDice.optional() })).max(60).optional(),
  }),
  z.object({
    type: z.literal("combat.will"),
    combatantId: id,
    reason: z.enum(["principle", "intervention", "distracted"]),
    helperId: id.optional(),
    dice: rolledDice.optional(),
  }),
  z.object({ type: z.literal("combat.suppress"), combatantId: id, suppressed: z.boolean() }),
  z.object({ type: z.literal("combat.surprise"), combatantIds: z.array(id).min(1).max(60) }),
  z.object({
    type: z.literal("encounter.loot"),
    encounterId: id,
    kills: z.array(z.object({ combatantId: id, tier: z.string().max(20), boss: z.boolean().optional() })).max(60),
    dice: z.array(whole.nullable()).max(60).optional(),
  }),
  z.object({
    type: z.literal("encounter.settle"),
    encounterId: id,
    participants: z.array(id).max(20),
    kills: z
      .array(
        z.object({
          combatantId: id,
          tier: z.string().max(20),
          boss: z.boolean().optional(),
          byId: id.optional(),
          tiers: z.record(z.string(), z.string().max(20)).optional(),
        }),
      )
      .max(60),
    awards: z.array(z.object({ characterId: id, ve: whole })).max(20),
    spoils: z.array(stack).max(60),
  }),
  z.object({ type: z.literal("item.give"), to: id, items: z.array(stack).min(1).max(60) }),
  z.object({ type: z.literal("proficiency.mark"), characterId: id, shape: z.string().max(40) }),
  z.object({ type: z.literal("item.move"), from: id, to: id, name: z.string().max(80), count: whole }),
  z.object({ type: z.literal("item.remove"), from: id, name: z.string().max(80), count: whole, note: z.string().max(200).optional() }),
  z.object({
    type: z.literal("void"),
    targetId: id,
    reason: z.enum(["undo", "correction"]),
    note: z.string().max(500).optional(),
  }),
]);

/** What a client submits: the action and its idempotency key. The server supplies actor and time. */
export const submissionSchema = z.object({
  id,
  source: z.enum(["manual", "suggestion", "voice", "counter"]).default("manual"),
  cause: z.string().max(200).optional(),
  action: actionSchema,
});

export type Submission = z.infer<typeof submissionSchema>;

// The schema and the Action type must describe the same thing.
type Parsed = z.infer<typeof actionSchema>;
const _toAction = (p: Parsed): Action => p;
const _toParsed = (a: Action): Parsed => a;
void _toAction;
void _toParsed;
