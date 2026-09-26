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
