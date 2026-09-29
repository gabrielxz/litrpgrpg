/**
 * Offer fixtures: sweeps with the Personal Opportunity the book's rules call for (app/DESIGN.md,
 * "Testing the listening"). A fixture is a record set up in the record's own actions (characters,
 * events, Deep copied across, a sweep, titles, refusals), the character the offer is for, the
 * situation in the GM's words, and what the rules decide: affirm or test (Quests, "Personal
 * Opportunities") and the flavors that fit the pattern. The scorer checks those, and flags
 * player-facing text that names the behavioral axes or the sheet, uses the table's words, runs
 * past three lines of the System's message, or promises a proportional reward the quest does not pay,
 * and the GM's note when its hidden outcome runs long or prices a title. The prose itself is for Gabriel's read.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Engine } from "@gradebreaker/engine";
import { type Action, CampaignRecord, actionSchema } from "@gradebreaker/record";
import { z } from "zod";
import type { Drafter, Effort } from "./draft-events.ts";
import { HIDDEN_SENTENCES, HIDDEN_WORDS, type OpportunityDraft, draftOpportunity } from "./draft-opportunity.ts";
import { readYaml } from "@gradebreaker/engine/node";

export const OFFERS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../offers");

const flavor = z.enum(["combat", "social", "exploration"]);

export const offerFixtureSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** The book passage the expectation reads from. */
  source: z.string(),
  notes: z.string().optional(),
  setup: z.array(z.object({ id: z.string(), action: actionSchema })),
  characterId: z.string(),
  situation: z.string().default(""),
  expected: z.object({
    stance: z.enum(["affirm", "test"]),
    /** Every flavor that fits; a test may take any. */
    flavors: z.array(flavor).min(1),
    /** Whether the reward should be proportional (no fixed end) or the table's; absent, either. */
    proportional: z.boolean().optional(),
    why: z.string().optional(),
  }),
});

export type OfferFixture = z.infer<typeof offerFixtureSchema>;

export function loadOffers(dir: string = OFFERS_DIR): OfferFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => offerFixtureSchema.parse(readYaml(join(dir, f))));
}

/** The fixture's record: its setup replayed, every action the GM's. */
export function recordOf(engine: Engine, fixture: OfferFixture): CampaignRecord {
  const record = new CampaignRecord(engine);
  for (const s of fixture.setup) record.append({ id: s.id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: s.action as Action });
  const refused = record.state.rejected;
  if (refused.length) throw new Error(`${fixture.id}: the setup's ${refused[0]!.envelope.id} is refused: ${refused[0]!.reason}`);
  return record;
}

// ------------------------------------------------------------ flags ---

/** The table's words the System never says, read from `rules/system-ai.yaml` (`voice.units`, after "never"). */
export function tableWords(engine: Engine): string[] {
  const units = engine.rules["system-ai"].voice.units as string;
  const never = units.slice(units.indexOf("never") + "never".length);
  return never
    .split(/,|\bor\b/)
    .map((w) => w.trim())
    .filter(Boolean);
}

const SHEET_WORDS = ["HVE", "Hidden Vector", "tally", "tallies", "Deep", "Current", "sweep", "axis", "axes"];

/** What in the offer's player-facing text a reader would stop at: axis names, the sheet's words, the table's words, a long message. */
export function offerFlags(engine: Engine, draft: OpportunityDraft): string[] {
  const q = draft.quest;
  const shown = [q.title, q.objective, q.rewardText ?? "", draft.notice].join("\n");
  const poles = (engine.rules.hve.axes as { poles: { name: string }[] }[]).flatMap((a) => a.poles.map((p) => p.name));
  const found = (words: string[], flags: string) => words.filter((w) => new RegExp(`\\b${w}\\b`, flags).test(shown));
  const out: string[] = [];
  // Capitalized pole names read as the sheet's terms; "force" or "freedom" in a sentence is ordinary English.
  for (const w of found(poles, "")) out.push(`names ${w}`);
  for (const w of found(SHEET_WORDS, "")) out.push(`says ${w}`);
  for (const w of found(tableWords(engine), "i")) out.push(`table word: ${w}`);
  // The book allows one to three lines; a line holds several of the System's terse sentences.
  const lines = draft.notice.split("\n").filter((l) => l.trim()).length;
  if (lines > 3) out.push(`message runs ${lines} lines`);
  if (/proportional/i.test(draft.notice) && !q.scaled) out.push("message says proportional, the reward is fixed");
  // The GM's note: the hidden outcome stays short and leaves a title's numbers to the GM.
  const hidden = /Hidden outcome: (.*?) If refused:/s.exec(q.note ?? "")?.[1] ?? "";
  const sentences = hidden.split(/(?<=[.!?])\s+/).filter((x) => x.trim()).length;
  if (sentences > HIDDEN_SENTENCES) out.push(`hidden outcome runs ${sentences} sentences`);
  const words = hidden.split(/\s+/).filter(Boolean).length;
  if (words > HIDDEN_WORDS) out.push(`hidden outcome runs ${words} words`);
  if (/[+−-]\d|\bbonus\b/i.test(hidden)) out.push("hidden outcome prices a title");
  return out;
}

// ------------------------------------------------------------ runs ---

export interface OfferRun {
  run: number;
  draft?: OpportunityDraft;
  refused?: string;
  error?: string;
  stanceOk?: boolean;
  flavorOk?: boolean;
  /** Set when the fixture expects a proportional reward or the table's. */
  proportionalOk?: boolean;
  flags?: string[];
}

export interface OfferEvaluation {
  fixtureId: string;
  expected: OfferFixture["expected"];
  runs: OfferRun[];
  summary: { runs: number; returned: number; stance: number; flavor: number; scaled: number; proportional?: number; flagged: number; flags: Record<string, number> };
}

export function scoreOffer(engine: Engine, fixture: OfferFixture, draft: OpportunityDraft): Pick<OfferRun, "stanceOk" | "flavorOk" | "proportionalOk" | "flags"> {
  const want = fixture.expected.proportional;
  return {
    stanceOk: draft.stance === fixture.expected.stance,
    flavorOk: fixture.expected.flavors.includes(draft.quest.flavor!),
    ...(want === undefined ? {} : { proportionalOk: Boolean(draft.quest.scaled) === want }),
    flags: offerFlags(engine, draft),
  };
}

/** Drafts the fixture's offer `runs` times, one request after another, and scores each. */
export async function evaluateOffer(engine: Engine, fixture: OfferFixture, drafter: Drafter, runs: number, opts: { effort?: Effort } = {}): Promise<OfferEvaluation> {
  const out: OfferRun[] = [];
  for (let run = 1; run <= runs; run++) {
    try {
      const got = await draftOpportunity(engine, drafter, recordOf(engine, fixture), fixture.characterId, { situation: fixture.situation, ...opts });
      out.push("refused" in got ? { run, refused: got.refused } : { run, draft: got, ...scoreOffer(engine, fixture, got) });
    } catch (err) {
      out.push({ run, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const ok = out.filter((r) => r.draft);
  const flags: Record<string, number> = {};
  for (const f of ok.flatMap((r) => r.flags ?? [])) flags[f] = (flags[f] ?? 0) + 1;
  return {
    fixtureId: fixture.id,
    expected: fixture.expected,
    runs: out,
    summary: {
      runs: out.length,
      returned: ok.length,
      stance: ok.filter((r) => r.stanceOk).length,
      flavor: ok.filter((r) => r.flavorOk).length,
      scaled: ok.filter((r) => r.draft!.quest.scaled).length,
      ...(fixture.expected.proportional === undefined ? {} : { proportional: ok.filter((r) => r.proportionalOk).length }),
      flagged: ok.filter((r) => r.flags?.length).length,
      flags,
    },
  };
}

/** The scores, then each offer as the player would read it, for Gabriel's read. */
export function formatOffer(e: OfferEvaluation): string {
  const s = e.summary;
  const rows = [
    `${e.fixtureId}: ${s.returned} of ${s.runs} runs returned; expected ${e.expected.stance}, ${e.expected.flavors.join(" or ")}${e.expected.proportional === undefined ? "" : e.expected.proportional ? ", proportional" : ", the table's VE"}`,
    `  stance ${s.stance}/${s.returned}, flavor ${s.flavor}/${s.returned}, proportional ${s.scaled}/${s.returned}${s.proportional === undefined ? "" : ` (as expected ${s.proportional}/${s.returned})`}, flagged ${s.flagged}/${s.returned}${Object.keys(s.flags).length ? ` (${Object.entries(s.flags).map(([k, n]) => `${k} ×${n}`).join(", ")})` : ""}`,
  ];
  for (const r of e.runs) {
    if (r.error || r.refused) {
      rows.push(`  run ${r.run}: ${r.error ?? r.refused}`);
      continue;
    }
    const q = r.draft!.quest;
    rows.push(`  run ${r.run}: ${r.draft!.stance}, ${q.flavor}, ${q.difficulty}: ${q.title}`);
    rows.push(`    ${q.objective}${q.rewardText ? ` Reward: ${q.rewardText}.` : ""}${q.time ? ` (${q.time})` : q.hours ? ` (${q.hours} hours)` : ""}`);
    rows.push(`    System: ${r.draft!.notice.replace(/\n/g, " / ")}`);
    rows.push(`    GM: ${q.note}`);
  }
  return rows.join("\n");
}
