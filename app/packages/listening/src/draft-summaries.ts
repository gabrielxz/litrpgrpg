/**
 * Summaries (app/DESIGN.md, M2, "Summaries"). Two drafts, each returned to the GM's form and never
 * stored on its own:
 *
 * - The session's summary: the three sentences the standing context carries into the next session
 *   (The System AI, "Last session: [three-sentence summary]"), in the GM's plain prose, from what
 *   the record holds for that session: the events logged, kills, quests, titles, levels, Downings,
 *   deaths, cards, classes, and Principles.
 * - A character's System summary, on the tutorial's template (The Tutorial, Phase 6, "The
 *   Individual Summary"): the record fills every line it can (the resonance or Principle, the
 *   Marks, the titles, the hidden quests, the level and the VE), and the model writes only the
 *   two or three clinical lines of observation, from what the character did. With `integration`,
 *   the template's banner frames it; without, it is a summary at any point in a campaign.
 *
 * Neither request carries the Hidden Vector Engine's sheet: an observation reads acts.
 */
import type { Engine } from "@gradebreaker/engine";
import type { CampaignRecord, Effect, Envelope, Sheet } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, section } from "./draft-events.ts";
import { voiceFlags, voiceInstructions } from "./draft-voice.ts";

export const DRAFT_SESSION_SUMMARY_FEATURE = "draft-session-summary";
export const DRAFT_CHARACTER_SUMMARY_FEATURE = "draft-character-summary";

/** The standing context's "Last session" line runs three sentences. */
export const SESSION_SENTENCES = 3;
/** The template's observation: two to three lines, clinical. */
export const OBSERVATION_LINES = 3;

// ----------------------------------------------------------- record ---

/** The session's actions: from its start to its end, or to now while it runs; voided and refused ones left out. */
function sessionLog(record: CampaignRecord, sessionId: string): Envelope[] {
  const state = record.state;
  const refused = new Set(state.rejected.map((r) => r.envelope.id));
  const start = record.log.findIndex((e) => e.id === sessionId);
  if (start < 0) return [];
  const end = record.log.findIndex((e, i) => i > start && (state.effects.get(e.id) ?? []).some((x) => x.kind === "session-ended" && (x as { sessionId: string }).sessionId === sessionId));
  return record.log.slice(start, end < 0 ? undefined : end + 1).filter((e) => !state.voided.has(e.id) && !refused.has(e.id));
}

/** What happened, in the record's order, one line each, in the table's plain words. */
export function happenings(record: CampaignRecord, envelopes: readonly Envelope[], only?: string): string[] {
  const state = record.state;
  const sheets = record.sheets();
  const name = (id?: string) => (id ? (sheets.get(id)?.name ?? id) : "someone");
  const out: string[] = [];
  const seen = new Set<string>();
  const once = (key: string, line: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
  };
  const mine = (x: Effect & { characterId?: string }) => !only || x.characterId === only;
  for (const env of envelopes) {
    // Every participant is told of each kill; the settlement names who made it.
    if (env.action.type === "encounter.settle")
      for (const k of env.action.kills ?? []) if (k.byId && (!only || k.byId === only)) out.push(`- ${name(k.byId)} killed a ${k.tier} enemy.`);
    for (const x of (state.effects.get(env.id) ?? []) as (Effect & Record<string, any>)[]) {
      switch (x.kind) {
        case "event-logged": {
          const e = state.events.get(x.eventId);
          if (!e || (only && !e.participants.includes(only))) break;
          // For one character, an event where they carry no entry is one they were present for, not their act.
          const present = only && !e.entries.some((x) => x.characterId === only);
          out.push(`- ${e.summary} (${present ? `${name(only)} present; the act was another's` : e.participants.map(name).join(", ")})`);
          break;
        }
        case "combat-downed":
          if (x.characterId && mine(x)) out.push(`- ${name(x.characterId)} was Downed.`);
          break;
        case "combat-died":
          if (x.characterId && mine(x)) out.push(`- ${name(x.characterId)} died.`);
          break;
        case "quest-completed":
        case "quest-failed":
        case "quest-issued":
        case "quest-offered":
        case "quest-refused":
          if (mine(x)) once(`${x.kind}:${x.questId}`, `- ${x.line}: ${x.kind.slice(6)}${only ? "" : ` (${name(x.characterId)})`}.`);
          break;
        case "title-conferred":
          if (mine(x)) out.push(`- ${name(x.characterId)} earned the title ${x.name}.`);
          break;
        case "level":
          if (mine(x)) out.push(`- ${name(x.characterId)} reached Level ${x.level}.`);
          break;
        case "memory-granted":
          if (mine(x)) out.push(`- ${name(x.characterId)} gained a Battle Memory Card.`);
          break;
        case "class-accepted":
          if (mine(x)) out.push(`- ${name(x.characterId)} accepted the class ${x.name}.`);
          break;
        case "principle-crystallized":
          if (mine(x)) out.push(`- ${name(x.characterId)}'s Principle crystallized: ${x.name}.`);
          break;
        case "party-formed":
          if (mine(x)) once(`party:${x.partyId}`, `- A party formed: ${[name(x.characterId), ...x.withNames].join(", ")}.`);
          break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------- session ---

export function draftSessionSummarySchema() {
  return z.object({ summary: z.string().describe(`The session in ${SESSION_SENTENCES} sentences.`) });
}

export function draftSessionSummarySystem(): string {
  return `You write the summary of one session of Gradebreaker, a LitRPG tabletop roleplaying game, for the Game Master (GM). The GM edits it and keeps it in the campaign's notes, and it is carried into the next session as "Last session", so a reader who missed the session knows where the story stands.

Write ${SESSION_SENTENCES} sentences of plain past-tense prose, in the order things happened: where the party went and what they faced, what the characters chose and what it cost, and where the session left them. Name the characters. Lead with the choices and turns of the story over the numbers; a level or a title belongs in a sentence only when it mattered to the story.

Use only what the record below says. Say nothing about how the Game Master or the System reads the characters' behavior.`;
}

export function draftSessionSummaryPrompt(record: CampaignRecord, sessionId: string): string {
  const s = record.state.sessions.get(sessionId)!;
  const sheets = record.sheets();
  const lines = happenings(record, sessionLog(record, sessionId));
  const earlier = [...record.state.sessions.values()].filter((x) => x.number < s.number && x.summary).at(-1);
  return [
    section("The session", [`- Session ${s.number}${s.label ? `, ${s.label}` : ""}. Present: ${s.present.map((id) => sheets.get(id)?.name ?? id).join(", ") || "no one recorded"}.`]),
    section("The session before", earlier ? [`- ${earlier.summary}`] : []),
    section("What the record holds, in order", lines),
  ].join("\n\n");
}

export async function draftSessionSummary(drafter: Drafter, record: CampaignRecord, sessionId: string, opts: { effort?: Effort } = {}): Promise<{ summary: string }> {
  if (!record.state.sessions.has(sessionId)) throw new Error(`no session ${sessionId}`);
  const out = await drafter({ system: draftSessionSummarySystem(), prompt: draftSessionSummaryPrompt(record, sessionId), schema: draftSessionSummarySchema(), effort: opts.effort ?? "low" });
  return { summary: out.summary.replace(/\s*\n+\s*/g, " ").trim() };
}

// -------------------------------------------------------- character ---

export interface CharacterSummaryDraft {
  /** The whole message as the composer takes it. */
  text: string;
  /** The drafted lines, for the flags. */
  observation: string;
  flags: string[];
}

/** The lines the record fills: the resonance or Principle, the Marks, the titles, the hidden quests, the level and the VE. */
export function recordLines(engine: Engine, record: CampaignRecord, c: Sheet): string[] {
  const out: string[] = [];
  const principle = c.principles.principles[0];
  const leading = Object.entries(c.principles.insight).sort((a, b) => b[1] - a[1])[0];
  if (principle) out.push(`Principle: ${principle.name}. ${principle.tier}.`);
  else if (leading && leading[1] > 0) out.push(`Resonance detected: ${leading[0].toUpperCase()}. Monitoring.`);
  for (const p of c.proficiencies) out.push(`${p.shape.replace(/\b\w/g, (m) => m.toUpperCase()).replace(/ And /g, " and ")}: ${p.marks} ${p.marks === 1 ? "Mark" : "Marks"}. ${p.tier}.`);
  for (const t of c.titles.filter((t) => t.status === "active")) out.push(`Title granted: ${t.name}.`);
  for (const q of record.state.quests.values())
    if (q.category === "Hidden" && q.holders.includes(c.id) && q.status === "completed") out.push(`Hidden quest complete: [${q.code}] ${q.title}.`);
  const cost = engine.levelCost(c.grade);
  const cap = (engine.rules.grades.grades as { code: string; level_range: [number, number] }[]).find((g) => g.code === c.grade)!.level_range[1];
  const projected = Math.min(cap, c.level + Math.floor((c.refinedVe + c.storedVe) / cost));
  out.push(`Level ${c.level}. VE awaiting refinement: ${c.storedVe}.${projected > c.level ? ` Projected advancement: Level ${projected}.` : ""}`);
  return out;
}

export function draftCharacterSummarySchema() {
  return z.object({ observation: z.string().describe(`The System's observation: two or three short lines, each on its own line.`) });
}

export function draftCharacterSummarySystem(engine: Engine): string {
  return `You write the observation that opens a character's private System summary in Gradebreaker, a LitRPG tabletop roleplaying game. The Game Master (GM) edits it and sends it to that character's player. The record fills the rest of the summary (the Principle, the Marks, the titles, the level); you write only the observation.

${voiceInstructions(engine)}

# The observation

Two or three short lines, clinical and diagnostic, based on two or three things the character actually did (the record below). An event marked as another's act is one the character was present for: it may show what they witnessed, never what they did. The System states what it measured: counts, frequencies, thresholds ("Front-line engagement in every fight. Pain tolerance: above baseline."). Every act and every count it states is in the record below: it never says a character took, used, or did what the record does not show them doing. It may draw a wrong inference from a right observation, which is in character for it. It names no trait as a judgment of the person, and it never names the sides of the Hidden Vector Engine or says how it keeps count.

Samples from the book, for the shape only:
- Front-line engagement in every fight. Pain tolerance: above baseline. Resource prioritization: self-first. Pattern intensifying.
- Threat avoidance preferred over threat elimination, three times of three. Trail found before the fight. Pattern fixation detected.`;
}

export function draftCharacterSummaryPrompt(record: CampaignRecord, characterId: string): string {
  const c = record.sheets().get(characterId)!;
  const lines = happenings(record, record.log, characterId);
  const counts = Object.entries(c.counters)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `- ${k.replace(/-/g, " ")}: ${n}`);
  return [
    section("Character", [`- ${c.name}, ${c.grade}-Grade, Level ${c.level}. Background: ${c.background.replace(/\.$/, "")}.`]),
    section("What the record holds of the character, in order", lines.slice(-20)),
    section("Counts the System keeps", counts),
  ].join("\n\n");
}

export async function draftCharacterSummary(
  engine: Engine,
  drafter: Drafter,
  record: CampaignRecord,
  characterId: string,
  opts: { integration?: boolean; effort?: Effort } = {},
): Promise<CharacterSummaryDraft> {
  const c = record.sheets().get(characterId);
  if (!c) throw new Error(`no character ${characterId}`);
  const out = await drafter({ system: draftCharacterSummarySystem(engine), prompt: draftCharacterSummaryPrompt(record, characterId), schema: draftCharacterSummarySchema(), effort: opts.effort ?? "medium" });
  const observation = out.observation
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  const rule = "==========================================";
  const body = [observation, ...recordLines(engine, record, c)];
  const text = (opts.integration ? [rule, `INTEGRATION COMPLETE: INITIATE ${c.name.toUpperCase()}`, rule, ...body, rule] : body).join("\n");
  const poles = (engine.rules.hve.axes as { poles: { name: string }[] }[]).flatMap((a) => a.poles.map((p) => p.name));
  return { text, observation, flags: voiceFlags(engine, observation, { names: poles, maxLines: OBSERVATION_LINES }) };
}
