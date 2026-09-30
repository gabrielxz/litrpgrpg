/**
 * Drafting a Distillation (The Principle System, "Distillation", "The Quiet Path", "Running the
 * Track"): two readings of what the character has learned, each an articulation that passes the
 * test (Operational, Bounded, Testable) with a second phrasing for the Quiet Path, and the grant
 * each would bring at the tier Distillation reaches: an Application at Seed and Early Fragment
 * (its name and effect, priced inside the Modifier Budget, costing the tier's Aether), Infusion at
 * Mid Fragment, a Domain at Peak Fragment; Seed adds Attunements beyond the baseline. A Reshaping
 * draws a new identity instead. The readings come from the record, as the book's GM draws them:
 * the circled Defining moments, the moments on the family's side, the meditations' words and
 * visions, and what the player has said so far. The calibration is `rules/principles.yaml`
 * `family_samples`, one Principle per family worked to Seed.
 *
 * The drafts load into the Principles section's Distillation form, where the GM edits and records
 * them; unplugged, the GM writes the same fields there by hand.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CampaignRecord, memoryOf } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, section } from "./draft-events.ts";
import { voiceFlags } from "./draft-voice.ts";

export const DRAFT_DISTILLATION_FEATURE = "draft-distillation";

/** The readings a draft offers, as Joe's GM offers two. */
export const READINGS = 2;

interface Sample {
  family: string;
  principle: string;
  built_by: string;
  passive: string;
  seed: { name: string; effect: string };
  attunement: string;
}

export interface DistillationReading {
  articulation: string;
  /** The same truth in other words, for a Quiet Path offer. */
  phrasing: string;
  /** How the articulation meets each part of the test. */
  test: { operational: string; bounded: string; testable: string };
  /** The grant's name, and what it does in the table's words; a Reshaping's new identity is the name. */
  name: string;
  effect: string;
  /** Anything the GM should check: a table word in the articulation, a bonus past the budget. */
  flags: string[];
}

export interface DistillationDraft {
  family: string;
  /** The tier the Distillation reaches, or the tier held for a Reshaping. */
  tier: string;
  readings: DistillationReading[];
  /** Seed's Attunements beyond the baseline. */
  attunements?: string;
}

// ------------------------------------------------------------ rules ---

const familyOf = (engine: Engine, family: string) => (engine.rules.principles.families as { name: string; pole: string }[]).find((f) => f.name === family);
const samples = (engine: Engine) => engine.rules.principles.family_samples as Sample[];
const costOf = (engine: Engine, tier: string) =>
  (engine.rules.principles.application_costs as { granted_at: string; aether: number }[]).find((r) => r.granted_at === tier || r.granted_at.endsWith(`(${tier})`))?.aether;

/** What a Distillation to this tier grants: the kind and its line on the ladder. */
function grantAt(engine: Engine, tier: string): { kind: "Application" | "Infusion" | "Domain"; line: string } {
  const rung = (engine.rules.principles.ladder as { tier: string; grants: string }[]).find((r) => r.tier === tier);
  const kind = tier === "Mid Fragment" ? "Infusion" : tier === "Peak Fragment" ? "Domain" : "Application";
  return { kind, line: rung?.grants ?? "" };
}

// ----------------------------------------------------------- schema ---

export function draftDistillationSchema() {
  const reading = z.object({
    articulation: z.string().describe("The pattern, in one sentence the character could say: what they have learned in how they act or how the world behaves."),
    phrasing: z.string().describe("The same truth in other words, one sentence, for the player to choose between on the Quiet Path."),
    operational: z.string().describe("What specific thing it does, in a few words."),
    bounded: z.string().describe("Where it stops applying, in a few words."),
    testable: z.string().describe("What anyone at the table would see when it is used, in a few words."),
    name: z.string().describe("The grant's name, two or three plain words; for a Reshaping, the Principle's new name."),
    effect: z.string().describe("What the grant does, in the table's words: for an Application, its cost and its effect with any Clash bonus; for a Reshaping, how the Principle's Applications and Attunements shift."),
  });
  return z.object({
    readings: z.array(reading).describe(`Exactly ${READINGS} readings, different in what they claim.`),
    attunements: z.string().nullable().describe("At Seed: the Attunements beyond the baseline, one or two sentences of fictional capability with no roll. Otherwise null."),
  });
}

export type DraftDistillationOutput = z.infer<ReturnType<typeof draftDistillationSchema>>;

// ----------------------------------------------------- instructions ---

export function draftDistillationSystem(engine: Engine): string {
  const test = (engine.rules.principles.distillation_test as string[]).join(", ");
  const calibration = samples(engine)
    .map((s) => `- ${s.principle} (${s.family}, built by ${s.built_by}). Passive: ${s.passive}. Seed Application: ${s.seed.name}: ${s.seed.effect} Attunement: ${s.attunement}`)
    .join("\n");
  return `You help the Game Master (GM) of Gradebreaker, a LitRPG tabletop roleplaying game, run a Distillation: the moment a character's Principle climbs a tier because the player names what the character has learned. The GM presents your readings to the player, who picks one, reworks it, or vetoes both. On the Quiet Path the GM offers one reading in two phrasings and the player picks a phrasing.

# The readings

Draw ${READINGS} readings from the record below: the circled Defining moments, the moments on the family's side, the meditations' words and visions, and what the player has said. Give the moment, not the meaning: each reading names a pattern the character has actually shown, in plain words. The two readings claim different things, as "a line you hold can't be crossed" and "whatever comes for the people behind you comes to you instead" do.

Each articulation must be ${test}: it does something specific, it does not apply everywhere, and its use produces something the table can see. "Fury" is a mood and fails; "Fire consumes and spreads" passes. Pick the plainer word.

# The grant

The request says the tier and what it grants. An Application is an active technique: 1 Beat plus the tier's Aether, or part of an attack (the attack's Beat, the Aether, one Clash roll). A bonus sits inside the Modifier Budget: +5 minor, +10 standard, +15 to +20 peak and rare. A world quantity (Health restored, a distance, flat damage) is stated for the body's Grade. Write the effect in the table's words, as a sheet states it: Beats, Zones, Clashes, Health, Aether, turns. At Seed, the Attunements are fictional capability with no roll, Beat, or Aether; anything that would need a Clash is an Application.

These are the book's Principles worked to Seed, one per family, for calibration:

${calibration}

# What to leave out

Say nothing about how the Game Master or the System reads the character's behavior, and name no side of a behavioral axis in the articulation or the name.`;
}

// ----------------------------------------------------------- prompt ---

export function draftDistillationPrompt(engine: Engine, record: CampaignRecord, characterId: string, family: string, opts: { words?: string; refine?: boolean } = {}): string {
  const c = record.sheets().get(characterId)!;
  const x = c.principles.principles.find((p) => p.family === family)!;
  const pole = familyOf(engine, family)?.pole;
  const tier = opts.refine ? x.tier : x.next!.tier;
  const g = grantAt(engine, tier);
  const cost = costOf(engine, tier);
  const events = record.state.events;
  const circled = c.hve.sweeps.flatMap((s) => s.moments.filter((m) => m.weight >= 3).map((m) => `- ${m.note ?? events.get(m.eventId ?? "")?.summary ?? "a Defining moment"}`));
  const onSide = [...events.values()].filter((e) => e.entries.some((en) => en.characterId === characterId && en.pole === pole)).slice(-8).map((e) => `- ${e.summary}`);
  const meditations = c.principles.memories
    .filter((m) => m.meditation?.family === family)
    .map((m) => `- ${m.text}${m.meditation!.words ? `. The player: "${m.meditation!.words}"` : ""}${m.meditation!.vision ? `. The vision: ${m.meditation!.vision}` : ""}`);
  const grants = x.grants.filter((gr) => gr.name).map((gr) => `- ${gr.tier}: ${gr.name}${gr.text ? `: ${gr.text}` : ""}`);
  const chronicle = memoryOf(record.state).chronicles.get(characterId)?.text;
  return [
    section("Character", [`- ${c.name}, ${c.grade}-Grade, Level ${c.level}. Background: ${c.background.replace(/\.$/, "")}.${c.class ? ` Class: ${c.class.name}.` : ""}`]),
    section("The Principle", [
      `- ${x.name} (${family}), at ${x.tier} with ${x.ip} Insight.${x.passive ? ` Passive: ${x.passive}.` : ""}`,
      opts.refine
        ? `- A Reshaping at ${x.tier}: the same slot, tier, and Insight under a shifted identity. Draft a new name for each reading, and how its grants shift.`
        : `- Distillation to ${tier}, which grants: ${g.line}.${g.kind === "Application" && cost !== undefined ? ` The Application costs ${cost} Aether.` : ""}`,
    ]),
    section("Grants held", grants),
    section("Their chronicle", chronicle ? [chronicle] : []),
    section("Defining moments (circled at the sweeps)", circled),
    section("Moments on the family's side", onSide),
    section("Meditations toward this family", meditations),
    section("What the player has said", opts.words?.trim() ? [opts.words.trim()] : ["- nothing yet"]),
  ].join("\n\n");
}

// ----------------------------------------------------------- drafts ---

/** The model's readings, each with the flags the GM should see before presenting it. */
export function distillationOf(engine: Engine, record: CampaignRecord, characterId: string, family: string, out: DraftDistillationOutput, opts: { refine?: boolean } = {}): DistillationDraft {
  const c = record.sheets().get(characterId)!;
  const x = c.principles.principles.find((p) => p.family === family)!;
  const tier = opts.refine ? x.tier : x.next!.tier;
  const poles = (engine.rules.hve.axes as { poles: { name: string }[] }[]).flatMap((a) => a.poles.map((p) => p.name));
  const flat = (s: string) => s.replace(/\s*\n+\s*/g, " ").trim();
  const readings = out.readings.slice(0, READINGS).map((r): DistillationReading => {
    // The articulation is the character's own truth, so only the table's words are out of place in it.
    const flags = voiceFlags(engine, `${r.articulation} ${r.phrasing}`)
      .filter((f) => f.startsWith("table word"))
      .map((f) => `the articulation: ${f}`);
    for (const p of poles) if (new RegExp(`\\b${p}\\b`).test(`${r.articulation} ${r.phrasing} ${r.name}`)) flags.push(`names ${p}, a side of the Hidden Vector Engine`);
    for (const m of r.effect.matchAll(/\+(\d+)/g)) if (Number(m[1]) > 20) flags.push(`a bonus of +${m[1]} is past the Modifier Budget's +20`);
    return {
      articulation: flat(r.articulation),
      phrasing: flat(r.phrasing),
      test: { operational: flat(r.operational), bounded: flat(r.bounded), testable: flat(r.testable) },
      name: flat(r.name),
      effect: flat(r.effect),
      flags,
    };
  });
  return { family, tier, readings, ...(tier === "Seed" && !opts.refine && out.attunements?.trim() ? { attunements: flat(out.attunements) } : {}) };
}

export async function draftDistillation(
  engine: Engine,
  drafter: Drafter,
  record: CampaignRecord,
  characterId: string,
  family: string,
  opts: { words?: string; refine?: boolean; effort?: Effort } = {},
): Promise<DistillationDraft> {
  const c = record.sheets().get(characterId);
  const x = c?.principles.principles.find((p) => p.family === family);
  if (!c || !x) throw new Error(`${c?.name ?? characterId} holds no ${family} Principle`);
  if (!opts.refine && !x.distillable) throw new Error(`${x.name} is not ready to Distill`);
  const out = await drafter({
    system: draftDistillationSystem(engine),
    prompt: draftDistillationPrompt(engine, record, characterId, family, opts),
    schema: draftDistillationSchema(),
    effort: opts.effort ?? "medium",
  });
  return distillationOf(engine, record, characterId, family, out, opts);
}
