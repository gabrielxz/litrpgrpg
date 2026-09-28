/**
 * Drafting a Personal Opportunity at the sweep (Quests, "Personal Opportunity Generation"; The
 * Hidden Vector Engine: "Draft the offer at the sweep, from Current before it is erased and from
 * Deep after it is updated"). The request fills the book's template from the record: the
 * character's Grade and level, the Deep leads, the last sweep's Current and its biggest moments,
 * the circled margin notes, titles, refusals by flavor, and the situation (the GM's words, the
 * last session's summary, the latest events, the party). The draft is a `quest.issue` the GM
 * edits and issues from the Quests form; its VE is the Reward Reference Table's, which the record
 * fills in, and the hidden outcome and what a refusal closes go in the GM's note. Unplugged, the
 * GM fills the same template by hand in the same form.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type CampaignRecord, type Draft, type QuestSpec, type Sheet, nextQuestCode } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, section } from "./draft-events.ts";

export const DRAFT_OPPORTUNITY_FEATURE = "draft-opportunity";

const FLAVORS = ["combat", "social", "exploration"] as const;
type Flavor = (typeof FLAVORS)[number];

export interface OpportunityDraft {
  quest: QuestSpec;
  /** The action accepting it records: the offer to this character alone. */
  accept: Extract<Action, { type: "quest.issue" }>;
  /** Whether the offer affirms the character's pattern or tests against it. */
  stance: "affirm" | "test";
  /** The System's words that come with the offer, one to three lines. */
  notice: string;
  /** For the GM: the pattern it reads and why the offer takes this shape. */
  why: string;
}

// ------------------------------------------------------------ rules ---

/** The difficulties a Personal Opportunity pays at, from the Reward Reference Table. */
const difficultiesOf = (engine: Engine): string[] =>
  (engine.rules.quests.ve_rewards as { difficulty: string; personal_opportunity: number | null }[]).filter((r) => r.personal_opportunity !== null).map((r) => r.difficulty);

/** The flavors still offered, and the ones offered half as often, from the character's refusals. */
export function flavorsFor(engine: Engine, sheet: Sheet): { open: Flavor[]; halved: Flavor[] } {
  const r = engine.rules.quests.refusal.repeated_personal_opportunity as { half_frequency_after: number; stops_after: number };
  const n = (f: Flavor) => sheet.refusals[f] ?? 0;
  return { open: FLAVORS.filter((f) => n(f) < r.stops_after), halved: FLAVORS.filter((f) => n(f) >= r.half_frequency_after && n(f) < r.stops_after) };
}

// ----------------------------------------------------------- schema ---

export function draftOpportunitySchema(engine: Engine, flavors: Flavor[]) {
  const difficulties = difficultiesOf(engine) as [string, ...string[]];
  return z.object({
    stance: z.enum(["affirm", "test"]),
    flavor: z.enum(flavors as [Flavor, ...Flavor[]]),
    title: z.string().describe("Short, evocative, in the System's voice."),
    difficulty: z.enum(difficulties),
    objective: z.string().describe("Specific and actionable, in the world's words."),
    count: z.number().int().min(1).nullable().describe("A counted objective's count, or null."),
    countFixed: z.boolean().describe("True when the count cannot scale: reach a place, protect a person, recover a thing."),
    hours: z.number().int().min(1).nullable().describe("The time limit in hours, or null for none."),
    scaled: z.boolean().describe("True when the reward is proportional to how it is done, set by the GM at completion."),
    rewardHint: z.string().nullable().describe("The item or title hint beside the VE, in words, or null."),
    hiddenOutcome: z.string().nullable().describe("A different reward for a non-obvious or counter-pattern approach, for the GM only, or null."),
    refusal: z.string().describe("What the System closes off if the offer is refused, for the GM only."),
    notice: z.string().describe("The System's message with the offer: one to three terse lines."),
    why: z.string().describe("One or two sentences for the GM: the pattern the offer reads, and whether it affirms or tests it."),
  });
}

export type DraftOpportunityOutput = z.infer<ReturnType<typeof draftOpportunitySchema>>;

// ----------------------------------------------------- instructions ---

export function draftOpportunitySystem(engine: Engine): string {
  const items = (engine.rules.quests.item_rewards as { difficulty: string; typical: string }[]).map((r) => `- ${r.difficulty}: ${r.typical}`).join("\n");
  const ve = (engine.rules.quests.ve_rewards as { difficulty: string; personal_opportunity: number | null }[])
    .filter((r) => r.personal_opportunity !== null)
    .map((r) => `${r.difficulty} ${r.personal_opportunity}`)
    .join(", ");
  const units = engine.rules["system-ai"].voice.units as string;
  const refusal = engine.rules.quests.refusal.repeated_personal_opportunity as { half_frequency_after: number; stops_after: number };
  const poles = (engine.rules.hve.axes as { poles: { name: string }[] }[]).flatMap((a) => a.poles.map((x) => x.name)).join(", ");
  return `You are the System of Gradebreaker, a LitRPG tabletop roleplaying game, drafting a Personal Opportunity for one character at the end of a session. The Game Master (GM) revises your draft to fit the table before the player sees it, and may discard it.

# What a Personal Opportunity is

The System notices something specific about a character and offers a tailored quest, from their behavior (the sheet below), their recent moments, and the immediate situation. The same situation brings different offers to different characters: a character who meets things head-on might be offered "Hostile detected within 100 meters. Eliminate within 6 hours. Reward proportional to threat."; one who works by method, "Unstable formation detected. Stabilize before collapse: reward proportional to elegance of solution."

The offer is also how the System nudges or tests. By default it affirms, following the character's recent behavior. It tests against the pattern when recent behavior (Current, the last sweep) and long-term identity (Deep) lean different ways, and occasionally for no visible reason. A character holding Salvaged receives tests until it is released. When in doubt, affirm.

Each offer has one flavor: combat, social, or exploration. Only the flavors listed as open may be offered; a flavor offered half as often should be chosen only when it fits far better than the others.

# Calibration

- Grade: the character's own. Difficulty: set by what the objective asks of a character at their level.
- VE is paid by the Reward Reference Table at the difficulty (${ve} at F-Grade, ×10 per Grade); you do not write the VE.
- Item rewards by difficulty, as a hint beside the VE, weighted to the character's pattern (a character who meets things head-on leans toward weapons and kill-empowering consumables; one who works by method toward sensory tools and resonance items):
${items}
- A time limit is usual and should be short enough to matter.

# What the player sees

The title, the objective, the reward hint, and the System's message reach the player. They follow the System's units: ${units}. They never name the behavioral axes or their sides (${poles}, as behavior), the sheet, tallies, or the engine that keeps them; the System shows what it noticed, never how it keeps count. The System's voice is clinical, confident, and terse; it never jokes. Its message is one to three short lines, for example: "Predator wounded: 1.2km, 8°. Recovery imminent. Opportunity window: 24h. Engagement recommended."

The hidden alternative outcome and the refusal consequence are for the GM alone. A refusal is noted against the offer's flavor: at ${refusal.half_frequency_after} refusals of one flavor it comes half as often, and at ${refusal.stops_after} it stops. Beyond that, a refusal may close a minor path; keep it subtle.

# Output

One offer. The reason for the GM names the pattern the offer reads and whether it affirms or tests it.`;
}

// ------------------------------------------------------------ scene ---

const pct = (n: number) => (n === 1 ? "1 tally" : `${n} tallies`);

export function draftOpportunityPrompt(engine: Engine, record: CampaignRecord, characterId: string, situation: string): string {
  const state = record.state;
  const sheets = record.sheets();
  const c = sheets.get(characterId)!;
  const nameOf = (id: string) => sheets.get(id)?.name ?? id;
  const leads = c.hve.leads.map((l) => (l.pole ? `- ${l.axis}: ${l.pole} leads by ${pct(l.by)}` : `- ${l.axis}: even`));
  const last = c.hve.sweeps.at(-1);
  const current = last ? Object.entries(last.current).filter(([, n]) => n).map(([p, n]) => `- ${p}: ${n}`) : [];
  const event = (id?: string) => (id ? state.events.get(id)?.summary : undefined);
  const biggest = last ? [...last.moments].sort((a, b) => b.weight - a.weight).slice(0, 3).map((m) => `- ${m.pole} ×${m.weight}${event(m.eventId) ? `: ${event(m.eventId)}` : ""}${m.note ? ` (note: ${m.note})` : ""}`) : [];
  const circled = c.hve.sweeps.flatMap((s) => s.moments.filter((m) => m.weight >= 3 && m.note).map((m) => `- "${m.note}"`));
  const titles = c.titles.filter((t) => t.status === "active").map((t) => `- ${t.name} (${t.category}${t.negative ? ", negative" : ""})`);
  const { open, halved } = flavorsFor(engine, c);
  const refusals = FLAVORS.map((f) => `- ${f}: ${c.refusals[f] ?? 0} refused${open.includes(f) ? (halved.includes(f) ? ", offered half as often" : "") : ", no longer offered"}`);
  const party = [...state.parties.values()].find((p) => p.members.includes(characterId));
  const sessions = [...state.sessions.values()].filter((s) => s.summary);
  const events = [...state.events.values()].slice(-5).map((e) => `- ${e.summary} (${e.participants.map(nameOf).join(", ")})`);
  const quests = [...state.quests.values()].filter((q) => q.holders.includes(characterId) && (q.status === "active" || q.status === "offered")).map((q) => `- [${q.code}] ${q.title} (${q.category}, ${q.status}): ${q.objective}`);
  return [
    section("Character", [
      `- ${c.name}, ${c.grade}-Grade, Level ${c.level}. Background: ${c.background.replace(/\.$/, "")}.${c.class ? ` Class: ${c.class.name}.` : ""}`,
      `- Health ${c.hp} of ${c.maxHp}, Aether ${c.aether} of ${c.maxAether}.`,
    ]),
    section("Deep (long-term identity, after the last sweep)", leads),
    section(`Current at the last sweep${last?.label ? ` (${last.label})` : ""}, before it was erased`, current),
    section("The last sweep's biggest moments", biggest),
    section("Defining moments (the circled margin notes)", circled),
    section("Active titles", titles),
    section("Personal Opportunities refused, by flavor", refusals),
    section("Party", party ? [`- ${party.members.map(nameOf).join(", ")}`] : []),
    section("Quests held or offered", quests),
    section("The last session", sessions.length ? [`- ${sessions.at(-1)!.summary}`] : []),
    section("Recent events", events),
    section("The situation now, from the GM", situation.trim() ? [situation.trim()] : []),
  ].join("\n\n");
}

// ----------------------------------------------------------- drafts ---

/** The model's offer as the quest the GM issues, checked against the record. */
export function opportunityOf(record: CampaignRecord, characterId: string, out: DraftOpportunityOutput): OpportunityDraft | { refused: string } {
  const c = record.sheets().get(characterId)!;
  const quest: QuestSpec = {
    id: nextQuestCode(record.state.quests.values(), "Personal Opportunity"),
    category: "Personal Opportunity",
    title: out.title.trim(),
    grade: c.grade,
    difficulty: out.difficulty,
    objective: out.objective.trim(),
    flavor: out.flavor,
  };
  if (out.count) quest.count = out.count;
  if (out.count && out.countFixed) quest.countFixed = true;
  if (out.scaled) quest.scaled = true;
  if (out.rewardHint?.trim()) quest.rewardText = out.rewardHint.trim();
  // A limit in hours runs on the in-game clock; without one, the limit is said in words.
  if (out.hours && record.state.clock) quest.hours = out.hours;
  else if (out.hours) quest.time = `within ${out.hours} hours`;
  const note = [out.hiddenOutcome?.trim() && `Hidden outcome: ${out.hiddenOutcome.trim()}`, `If refused: ${out.refusal.trim()}`, `Drafted to ${out.stance}.`].filter(Boolean).join(" ");
  quest.note = note;
  const accept: OpportunityDraft["accept"] = { type: "quest.issue", quest, to: [characterId] };
  const env: Draft = { id: "opportunity", at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "drafter" }, source: "suggestion", action: accept };
  const preview = record.preview(env);
  if (!preview.accepted) return { refused: `the record refuses it: ${preview.reason}` };
  return { quest, accept, stance: out.stance, notice: out.notice.trim(), why: out.why.trim() };
}

export async function draftOpportunity(
  engine: Engine,
  drafter: Drafter,
  record: CampaignRecord,
  characterId: string,
  opts: { situation?: string; effort?: Effort } = {},
): Promise<OpportunityDraft | { refused: string }> {
  const c = record.sheets().get(characterId);
  if (!c) return { refused: `no character ${characterId}` };
  if (c.dead) return { refused: `${c.name} is dead` };
  const { open } = flavorsFor(engine, c);
  if (!open.length) return { refused: `${c.name} has refused every flavor six times; the System offers nothing more` };
  const out = await drafter({
    system: draftOpportunitySystem(engine),
    prompt: draftOpportunityPrompt(engine, record, characterId, opts.situation ?? ""),
    schema: draftOpportunitySchema(engine, open),
    effort: opts.effort ?? "medium",
  });
  return opportunityOf(record, characterId, out);
}
