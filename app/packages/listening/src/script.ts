/**
 * Scripted sessions (app/DESIGN.md, "Testing the listening"). A script is a timeline of lines and
 * the record it should produce: the actions a listener or a drafting model should propose, the
 * suggestions it should raise, and the lines that must produce nothing.
 *
 * The expected actions are the record's own actions, so a script is checked by replaying it:
 * `setup` and then every expected action, in the order of the first line each cites, through a
 * real `CampaignRecord`. An expected record the rules refuse is a broken script.
 */
import type { Engine } from "@gradebreaker/engine";
import { readYaml } from "@gradebreaker/engine/node";
import { type Action, CampaignRecord, type HveEntry, actionSchema } from "@gradebreaker/record";
import { z } from "zod";

/**
 * What a suggestion is about. `prep-cue` is a prepared item whose cue the table has reached (the
 * key is its Prep id, `rules/tutorial.yaml` for the tutorial); the rest are M2's suggestion panel,
 * keyed by the title's name, the quest's code, or the card's subject.
 */
export const SUGGESTION_KINDS = ["prep-cue", "battle-memory", "title", "hidden-achievement", "personal-opportunity", "quest"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

/** Why a line must produce nothing. A draft that cites only such lines is a false positive of that kind. */
export const QUIET_REASONS = ["rules-question", "joke", "hypothetical", "retracted", "npc-speech", "state-read-aloud", "off-topic", "crosstalk", "planning"] as const;

const lineId = z.string().regex(/^[A-Za-z0-9_-]+$/);

const suggestionSchema = z.object({
  kind: z.enum(SUGGESTION_KINDS),
  key: z.string().min(1),
  characterId: z.string().optional(),
});

const entrySchema = z.object({
  characterId: z.string(),
  pole: z.string(),
  intensity: z.number(),
  secondary: z.string().optional(),
});

const expectedAction = z.object({
  id: z.string(),
  /** The lines that evidence it; a draft matches only if it cites one of them. */
  lines: z.array(lineId).min(1),
  action: actionSchema,
  /** Not required: a draft that finds it counts, one that misses it costs nothing. */
  optional: z.boolean().optional(),
  /** For an event: other HVE entries that are also a right reading. */
  also: z.array(entrySchema).optional(),
  note: z.string().optional(),
});

const expectedSuggestion = suggestionSchema.extend({
  id: z.string(),
  lines: z.array(lineId).min(1),
  optional: z.boolean().optional(),
  note: z.string().optional(),
});

export const scriptSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Where the scene comes from: a chapter and heading, or a session played. */
  source: z.string(),
  /** The rules version the expected record was written against. */
  rules: z.string(),
  notes: z.string().optional(),
  speakers: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(["gm", "player"]),
        name: z.string(),
        /** The characters this player holds. */
        characters: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  /** The record before the first line, appended in order by the GM. */
  setup: z.array(z.object({ id: z.string(), action: actionSchema })),
  lines: z
    .array(
      z.object({
        id: lineId,
        speaker: z.string(),
        text: z.string().min(1),
        /** Spoken in character: a character id, or an NPC's name. Absent, the speaker talks as themselves. */
        as: z.string().optional(),
        /** Seconds from the start, for real-time runs; absent, lines play at speaking pace. */
        t: z.number().optional(),
      }),
    )
    .min(1),
  expected: z.object({
    actions: z.array(expectedAction).default([]),
    suggestions: z.array(expectedSuggestion).default([]),
    quiet: z.array(z.object({ lines: z.array(lineId).min(1), why: z.enum(QUIET_REASONS) })).default([]),
  }),
});

export type Script = z.infer<typeof scriptSchema>;
export type ExpectedAction = Script["expected"]["actions"][number];
export type ExpectedSuggestion = Script["expected"]["suggestions"][number];
export type Suggestion = z.infer<typeof suggestionSchema>;
export type Entry = z.infer<typeof entrySchema>;

/**
 * What a listener or a drafting model proposes: an action or a suggestion, with the lines it drew on.
 * `id` lets one draft name another (an answer names its invite).
 */
export type Drafted = { id?: string; lines: string[] } & ({ action: Action; suggestion?: never } | { suggestion: Suggestion; action?: never });

export function loadScript(path: string): Script {
  return scriptSchema.parse(readYaml(path));
}

/** Problems with a script's references: unknown speakers, lines, and repeated ids. */
export function scriptProblems(script: Script): string[] {
  const out: string[] = [];
  const speakers = new Map(script.speakers.map((s) => [s.id, s]));
  const lines = new Set<string>();
  for (const l of script.lines) {
    if (lines.has(l.id)) out.push(`line ${l.id} is repeated`);
    lines.add(l.id);
    if (!speakers.has(l.speaker)) out.push(`line ${l.id}: no speaker ${l.speaker}`);
  }
  if (script.speakers.filter((s) => s.role === "gm").length !== 1) out.push("a script has one GM");
  const ids = new Set<string>();
  const items = [...script.setup, ...script.expected.actions, ...script.expected.suggestions];
  for (const x of items) {
    if (ids.has(x.id)) out.push(`id ${x.id} is repeated`);
    ids.add(x.id);
  }
  const cited = [...script.expected.actions, ...script.expected.suggestions, ...script.expected.quiet];
  for (const x of cited) for (const l of x.lines) if (!lines.has(l)) out.push(`${"id" in x ? x.id : "quiet"}: no line ${l}`);
  const quiet = new Set(script.expected.quiet.flatMap((q) => q.lines));
  for (const x of [...script.expected.actions, ...script.expected.suggestions]) {
    if (x.lines.every((l) => quiet.has(l))) out.push(`${x.id} cites only quiet lines`);
  }
  return out;
}

const order = (script: Script) => new Map(script.lines.map((l, i) => [l.id, i]));

/** The expected actions in the order the table reached them: by the earliest line each cites. */
export function inLineOrder<T extends { lines: string[] }>(script: Script, items: T[]): T[] {
  const at = order(script);
  const first = (x: T) => Math.min(...x.lines.map((l) => at.get(l) ?? Infinity));
  return [...items].sort((a, b) => first(a) - first(b));
}

/**
 * Replays the script's record: setup, then every expected action in line order, each under its
 * own id, as the GM. Throws the record's reason at the first action the rules refuse.
 */
export function replay(engine: Engine, script: Script): CampaignRecord {
  const rec = new CampaignRecord(engine);
  const gm = { role: "gm" as const, userId: script.speakers.find((s) => s.role === "gm")!.id };
  const at = "2026-01-01T00:00:00Z";
  for (const s of script.setup) rec.append({ id: s.id, at, actor: gm, source: "manual", action: s.action as Action });
  for (const x of inLineOrder(script, script.expected.actions)) {
    try {
      rec.append({ id: x.id, at, actor: gm, source: "voice", cause: x.lines.join(","), action: x.action as Action });
    } catch (err) {
      throw new Error(`${script.id}: expected action ${x.id} is refused: ${(err as Error).message}`);
    }
  }
  return rec;
}

/** The HVE entries an expected event carries, and the ones it also accepts. */
export function entriesOf(x: ExpectedAction): { entries: HveEntry[]; also: Entry[] } {
  const a = x.action as Action;
  return { entries: a.type === "event.log" ? (a.entries ?? []) : [], also: x.also ?? [] };
}
