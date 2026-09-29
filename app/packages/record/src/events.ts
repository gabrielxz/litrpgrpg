/**
 * Events: what happened at the table, as the GM records it. The record M2's drafting and M3's
 * listening write into; the GM entering an event by hand makes the same record they will.
 *
 * An event is one thing that happened: a summary, the context, the characters in it, and the
 * GM's notes. It may carry one HVE entry per character, in the book's structured shape (The
 * Hidden Vector Engine, "Structured Event Logging"): the side, the intensity (1 remembered, 2
 * surprised the table, 3 Defining, and 0.5 for a moment below the sweep's threshold), the
 * character's intent, and the outcome. An entry is a draft for the sweep: the sweep form offers
 * each entry not yet swept, a 0.5 entry as a reminder the GM may raise to a full tally, and a
 * sweep moment that names its event marks that entry swept. Events are the GM's alone.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Envelope } from "./actions.ts";
import { type CharacterState, type Effect, Rejected, type World } from "./fold.ts";
import { checkSides, weights } from "./hve.ts";
import { runningSession } from "./sessions.ts";

/** One character's HVE entry on an event. */
export interface HveEntry {
  characterId: string;
  pole: string;
  /** 0.5, 1, 2, or 3 (`structured_logging.intensities`). */
  intensity: number;
  intent?: string;
  outcome?: string;
  /** A second axis the moment clearly reads on, tallied one weight lower at the sweep. */
  secondary?: string;
  /** Coercion aimed at another player character. */
  coercion?: boolean;
}

/** An event; its id is the id of the action that logs it. */
export interface LogEvent {
  type: "event.log";
  summary: string;
  context?: string;
  /** The characters in it. */
  participants: string[];
  /** The GM's own notes. */
  notes?: string;
  entries?: HveEntry[];
}

export type EventAction = LogEvent;

export interface CampaignEvent {
  id: string;
  /** When it was recorded (the envelope's time); the in-game clock is separate. */
  at: string;
  summary: string;
  context?: string;
  participants: string[];
  notes?: string;
  entries: (HveEntry & { sweptIn?: string })[];
  /** The session running when it was logged. */
  sessionId?: string;
  /** The in-game clock when it was logged. */
  clock?: number;
}

export function cloneEvent(e: CampaignEvent): CampaignEvent {
  return { ...e, participants: [...e.participants], entries: e.entries.map((x) => ({ ...x })) };
}

/** The intensities an entry can carry, from the rules: the sweep's weights and the reminder tier. */
export function intensities(engine: Engine): number[] {
  const below = engine.rules.hve.structured_logging.intensities.below_threshold as number;
  return [below, ...weights(engine).map((w) => w.tallies)];
}

/** The weight an entry carries into the sweep: a reminder counts only once the GM raises it to a full tally. */
export function sweepWeight(engine: Engine, intensity: number): number {
  return intensity === engine.rules.hve.structured_logging.intensities.below_threshold ? weights(engine)[0]!.tallies : intensity;
}

function checkEntry(engine: Engine, chars: Map<string, CharacterState>, participants: string[], x: HveEntry) {
  const c = chars.get(x.characterId);
  if (!c) throw new Rejected(`no character ${x.characterId}`);
  if (!participants.includes(x.characterId)) throw new Rejected(`${c.name} has an entry but is not in the event`);
  if (!intensities(engine).includes(x.intensity)) throw new Rejected(`an entry's intensity is ${intensities(engine).join(", ")}`);
  checkSides(engine, { ...x, weight: x.intensity });
}

export function applyEvents(engine: Engine, world: World, a: EventAction, env: Envelope): Effect[] {
  const summary = a.summary.trim();
  if (!summary) throw new Rejected("an event needs a summary");
  const participants = [...new Set(a.participants)];
  for (const id of participants) if (!world.characters.has(id)) throw new Rejected(`no character ${id}`);
  const entries = a.entries ?? [];
  const seen = new Set<string>();
  for (const x of entries) {
    if (seen.has(x.characterId)) throw new Rejected("one entry per character in an event");
    seen.add(x.characterId);
    checkEntry(engine, world.characters, participants, x);
  }
  const e: CampaignEvent = { id: env.id, at: env.at, summary, participants, entries: entries.map((x) => ({ ...x })) };
  if (a.context?.trim()) e.context = a.context.trim();
  if (a.notes?.trim()) e.notes = a.notes.trim();
  const session = runningSession(world);
  if (session) e.sessionId = session.id;
  if (world.clock) e.clock = world.clock.at;
  world.events.set(e.id, e);
  // Before a class, each entry counts toward the next assigned points (Progression, "Behavioral Stat Mapping").
  for (const x of e.entries) {
    const c = world.characters.get(x.characterId)!;
    if (c.classes?.held) continue;
    (c.sinceAssigned ??= []).push({ eventId: e.id, pole: x.pole, intensity: x.intensity, ...(x.secondary ? { secondary: x.secondary } : {}) });
  }
  return [{ kind: "event-logged", eventId: e.id, summary }];
}
