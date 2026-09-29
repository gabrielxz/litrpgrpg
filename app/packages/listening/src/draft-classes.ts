/**
 * Drafting a character's three class offers (Classes, "Building a Class for a Specific Human";
 * app/DESIGN.md, M2, "Class offers"). The standing instructions are the book's own AI-Assisted
 * prompt (`rules/templates/class-generation.txt`, named in `rules/system-ai.yaml`), with the
 * System's voice, the notice vocabulary, the three cost shapes, and three of the book's classes
 * as calibration, all read from the rules data. The request is the record the book lists in step
 * 1: stats, level, Background, Proficiencies, the Principle, titles, the Deep reads, the circled
 * Defining moments, and what the player keeps doing, in the GM's words. The guarded list is
 * offered to the model only when the GM asks for it.
 *
 * Each offer comes back as the record's `ClassPackage`, checked by `packageProblems` and
 * `packageWarnings` as the GM's own would be, its notice by `voiceFlags`. An offer that names a
 * book class is that class as written. The GM edits all three in the Classes writer and records
 * them there; writing them by hand makes the same record.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ATTRIBUTES, type Engine } from "@gradebreaker/engine";
import { RULES_DIR } from "@gradebreaker/engine/node";
import { type CampaignRecord, type ClassPackage, type Sheet, bookClasses, packageProblems, packageWarnings } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, section } from "./draft-events.ts";
import { voiceFlags, voiceInstructions } from "./draft-voice.ts";

export const DRAFT_CLASSES_FEATURE = "draft-classes";

/** The book classes shown to the model as calibration: one per cost shape. */
const CALIBRATION = ["Battle Medic", "Breaching Vanguard", "Counterpuncher"];

export interface ClassOfferDraft {
  offer: ClassPackage;
  /** For the GM: the role the offer makes reliable, and the part of the record it weighs. */
  role: string;
  weighs: string;
  /** The book's rules the offer breaks; an offer with any cannot be recorded until edited. */
  problems: string[];
  /** The book's advice it crosses, and the voice flags on its notice. */
  warnings: string[];
}

export interface ClassOffersDraft {
  offers: ClassOfferDraft[];
  /** Across the three: the same name twice, a guarded power the GM did not ask for. */
  problems: string[];
}

// ------------------------------------------------------------ rules ---

/** The book's prompt for AI-Assisted class generation, read from `rules/`. */
export function classTemplate(engine: Engine): string {
  const fn = (engine.rules["system-ai"].functions as { name: string; template?: string }[]).find((f) => f.name.startsWith("Class Generation"))!;
  return readFileSync(join(RULES_DIR, fn.template!), "utf8").trim();
}

// ----------------------------------------------------------- schema ---

export function draftClassesSchema(engine: Engine) {
  const shapes = (engine.rules.classes.profile.shapes as { shape: string }[]).map((s) => s.shape) as [string, ...string[]];
  const costs = (engine.rules.classes.technique.cost_shapes as { shape: string }[]).map((s) => s.shape) as [string, ...string[]];
  const books = bookClasses(engine).map((c) => c.name) as [string, ...string[]];
  const cap = engine.rules.classes.technique.bonus_cap as number;
  const offer = z.object({
    book: z.enum(books).nullable().describe("A book class offered exactly as written, by name; its package replaces the rest of this offer. Null for a class written for this character."),
    name: z.string(),
    notice: z.string().describe("The System's notice, in the voice and the world's units, ending with the selection and growth lines as the book's classes do."),
    role: z.string().describe("For the GM: the role this offer makes reliable, in a few words."),
    weighs: z.string().describe("For the GM: the part of the record this offer weighs, in one sentence."),
    profile: z.object({
      shape: z.enum(shapes),
      points: z.array(z.object({ attribute: z.enum(ATTRIBUTES), points: z.number().int().min(1) })).describe("The Attributes in order, the lead first."),
    }),
    technique: z.object({
      name: z.string(),
      cost: z.enum(costs),
      effect: z.string().describe("The mechanics the table runs, in the table's words."),
      drawback: z.enum(["health", "exposed"]).nullable().describe("A Drawback technique's drawback, or null to let the player choose; null for the other costs."),
      reaction: z.boolean().describe("Used on someone else's turn: once per encounter, and it counts as the class's action-economy effect."),
      noBeat: z.boolean().describe("Takes no Beat of its own (part of a Clash already rolled, or a reaction)."),
      actionEconomy: z.boolean().describe("Changes the action economy: a Rush, a free Disengage, a free move, or a reaction."),
      clash: z.object({ bonus: z.number().int().min(1).max(cap), side: z.enum(["attack", "defense", "either"]) }).nullable().describe("When the technique adds a bonus to a Clash the character rolls, declared with it; else null."),
      heal: z.object({ amount: z.number().int().min(1), reach: z.enum(["zone", "adjacent"]) }).nullable().describe("When the technique restores Health to an ally; else null."),
    }),
    permission: z.object({
      name: z.string(),
      effect: z.string(),
      actionEconomy: z.boolean(),
      onceADay: z.boolean(),
    }),
    guarded: z.boolean().describe("Carries a power from the guarded list."),
  });
  const n = engine.rules.classes.selection.offers as number;
  return z.object({ offers: z.array(offer).describe(`Exactly ${n} offers.`) });
}

export type DraftClassesOutput = z.infer<ReturnType<typeof draftClassesSchema>>;

// ----------------------------------------------------- instructions ---

function packageLines(c: ClassPackage): string {
  const profile = c.profile.points.map((p) => `${p.points} ${p.attribute}`).join(", ");
  return [
    `${c.name} (${c.profile.shape}: ${profile})`,
    `  Notice: ${c.notice}`,
    `  Technique: ${c.technique.name} (${c.technique.cost}): ${c.technique.effect}`,
    `  Permission: ${c.permission.name}: ${c.permission.effect}`,
  ].join("\n");
}

export function draftClassesSystem(engine: Engine): string {
  const rules = engine.rules.classes;
  const vocabulary = (rules.notice_vocabulary as { system: string; table: string }[]).map((v) => `- "${v.system}" for ${v.table}`).join("\n");
  const costs = (rules.technique.cost_shapes as { shape: string; cost: string; for: string }[]).map((c) => `- ${c.shape}: ${c.cost}. For ${c.for.toLowerCase()}.`).join("\n");
  const shapes = (rules.profile.shapes as { shape: string; system: number; returned: number }[]).map((s) => `${s.shape} (${s.system} assigned, ${s.returned} returned)`).join(", ");
  const book = bookClasses(engine);
  const calibration = book.filter((c) => CALIBRATION.includes(c.name)).map(packageLines).join("\n\n");
  const poles = (rules.classes as { name: string; poles: string[] }[]).map((c) => `${c.name} (${c.poles.join(", ")})`).join("; ");
  const bonus = rules.selection.lead_attribute_bonus as number;
  return `You draft class offers for the Game Master (GM) of Gradebreaker, a LitRPG tabletop roleplaying game. The GM reads your three offers, edits them, and sends them to the player, who accepts one.

# The book's instructions

${classTemplate(engine)}

# How the book writes a class

Profiles come in three shapes: ${shapes}. The first Attribute named is the lead, and choosing the class adds ${bonus} to it at once.

The technique's cost is exactly one of:
${costs}

The notice is the System's text and the effect is the table's. The notice carries a table quantity as a world quantity:
${vocabulary}

Three of the book's classes, as calibration:

${calibration}

The book's other classes, with the two sides of the Hidden Vector Engine each was built for: ${poles}. One offer may be a book class the record plainly fits, offered as written by its name; the other offers are written for this character.

The offers differ in role and in which part of the record they weigh. One may amplify the dominant pattern, one formalize the secondary pattern, one combine them; any three the record supports are right.

${voiceInstructions(engine)}

# Output

Three offers. For each, mark what the app applies itself: a Clash bonus the technique adds (and on which side), or Health it restores (and its reach); leave both null for anything else, which the GM runs. Say for the GM the role each makes reliable and the part of the record it weighs.`;
}

// ------------------------------------------------------------ record ---

export function draftClassesPrompt(engine: Engine, record: CampaignRecord, characterId: string, opts: { keepsDoing?: string; guarded?: boolean } = {}): string {
  const sheets = record.sheets();
  const c = sheets.get(characterId)!;
  const state = record.state;
  const weights = engine.rules.hve.sweep.weights as { tallies: number; circled?: boolean }[];
  const circledAt = weights.find((w) => w.circled)!.tallies;
  const event = (id?: string) => (id ? state.events.get(id)?.summary : undefined);
  const moments = c.hve.sweeps.flatMap((s) => s.moments.map((m) => ({ ...m, label: s.label })));
  const circled = moments.filter((m) => m.weight >= circledAt).map((m) => `- ${m.pole}: ${m.note ?? event(m.eventId) ?? ""}${m.label ? ` (${m.label})` : ""}`);
  const biggest = [...moments]
    .filter((m) => m.weight < circledAt)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((m) => `- ${m.pole} ×${m.weight}${event(m.eventId) ? `: ${event(m.eventId)}` : ""}`);
  const principle = c.principles.principles[0];
  const insight = Object.entries(c.principles.insight).filter(([, n]) => n > 0);
  const carried = (state.inventory.get(characterId) ?? []).map((s) => s.name);
  const held = [...sheets.values()].filter((x) => x.id !== characterId && (x.class || x.classOffers.length)).map((x) => (x.class ? `- ${x.name}: ${x.class.name}${x.class.guarded ? " (guarded)" : ""}` : `- ${x.name}: offered ${x.classOffers.map((o) => o.name).join(", ")}`));
  const guardedList = (engine.rules.classes.guarded.list as { power: string; changes: string }[]).map((g) => `- ${g.power} (changes ${g.changes})`);
  return [
    section("Character", [
      `- ${c.name}, ${c.grade}-Grade, Level ${c.level}.`,
      `- Attributes: ${ATTRIBUTES.map((a) => `${a} ${c.raw[a]}`).join(", ")}.`,
      `- Health ${c.maxHp}, Aether ${c.maxAether}.`,
      `- Background: ${c.background.replace(/\.$/, "")}.`,
      `- Proficiencies: ${c.proficiencies.length ? c.proficiencies.map((p) => `${p.shape} ${p.tier}`).join(", ") : "none"}.`,
      `- Carries: ${carried.length ? carried.join(", ") : "nothing recorded"}.`,
      `- Principle: ${principle ? `${principle.name} (${principle.family}), ${principle.tier}` : insight.length ? `none crystallized; Insight toward ${insight.map(([f, n]) => `${f} ${n}`).join(", ")}` : "none"}.`,
      `- Titles: ${c.titles.filter((t) => t.status === "active").map((t) => `${t.name} (${t.category})`).join(", ") || "none"}.`,
    ]),
    section("Deep (the long-term record)", [
      ...c.hve.leads.map((l) => (l.pole ? `- ${l.axis}: ${l.pole} leads by ${l.by}` : `- ${l.axis}: even`)),
      `- Coherence: ${c.hve.coherence.profile}${c.hve.archetype ? `; archetype ${c.hve.archetype}` : ""}.`,
    ]),
    section("Defining moments (circled at the sweeps)", circled),
    section("Other large moments", biggest),
    section("What the player keeps doing, from the GM", opts.keepsDoing?.trim() ? [opts.keepsDoing.trim()] : []),
    section("Classes elsewhere in the campaign", held),
    section(
      "The guarded list",
      opts.guarded
        ? ["The GM asks for a guarded power: one offer may carry one of these, marked guarded.", ...guardedList]
        : ["The GM has not asked for one: no offer carries a guarded power, and no offer changes Aether in combat or the Cross-Grade Adjustment."],
    ),
  ].join("\n\n");
}

// ----------------------------------------------------------- drafts ---

/**
 * A profile naming an Attribute twice, as the notice's growth line does ("Strength, Strength,
 * Fortitude"), is one entry with the points summed, in the order first named.
 */
function mergedPoints(points: { attribute: string; points: number }[]): { attribute: string; points: number }[] {
  const out: { attribute: string; points: number }[] = [];
  for (const p of points) {
    const seen = out.find((x) => x.attribute === p.attribute);
    if (seen) seen.points += p.points;
    else out.push({ ...p });
  }
  return out;
}

/** The model's offers as packages, each checked as the GM's own would be. */
export function classOffersOf(engine: Engine, out: DraftClassesOutput, opts: { guarded?: boolean } = {}): ClassOffersDraft {
  const book = new Map(bookClasses(engine).map((c) => [c.name, c]));
  const offers = out.offers.map((o): ClassOfferDraft => {
    const asWritten = o.book ? book.get(o.book) : undefined;
    let offer: ClassPackage;
    if (asWritten) offer = structuredClone(asWritten);
    else {
      const t = o.technique;
      offer = {
        name: o.name.trim(),
        notice: o.notice.trim(),
        profile: { shape: o.profile.shape as ClassPackage["profile"]["shape"], points: mergedPoints(o.profile.points) },
        technique: { name: t.name.trim(), cost: t.cost as ClassPackage["technique"]["cost"], effect: t.effect.trim() },
        permission: { name: o.permission.name.trim(), effect: o.permission.effect.trim() },
      };
      if (t.actionEconomy || t.reaction) offer.technique.actionEconomy = true;
      if (t.noBeat || t.reaction) offer.technique.noBeat = true;
      if (t.cost === "Drawback" && t.drawback) offer.technique.drawback = t.drawback;
      if (t.clash) offer.technique.hook = { kind: "clash", bonus: t.clash.bonus, side: t.clash.side };
      else if (t.heal) offer.technique.hook = { kind: "heal", amount: t.heal.amount, reach: t.heal.reach };
      if (o.permission.actionEconomy) offer.permission.actionEconomy = true;
      if (o.permission.onceADay) offer.permission.onceADay = true;
      if (o.guarded) offer.guarded = true;
    }
    const warnings = [...packageWarnings(engine, offer), ...voiceFlags(engine, offer.notice).map((f) => `${offer.name}'s notice: ${f}`)];
    return { offer, role: o.role.trim(), weighs: o.weighs.trim(), problems: packageProblems(engine, offer), warnings };
  });
  const problems: string[] = [];
  const n = engine.rules.classes.selection.offers as number;
  if (offers.length !== n) problems.push(`${offers.length} offers drafted; the System offers ${n}`);
  const names = offers.map((o) => o.offer.name.toLowerCase());
  if (new Set(names).size !== names.length) problems.push("two offers share a name");
  if (!opts.guarded) for (const o of offers.filter((x) => x.offer.guarded)) problems.push(`${o.offer.name} carries a guarded power the GM did not ask for`);
  return { offers, problems };
}

export async function draftClasses(
  engine: Engine,
  drafter: Drafter,
  record: CampaignRecord,
  characterId: string,
  opts: { keepsDoing?: string; guarded?: boolean; effort?: Effort } = {},
): Promise<ClassOffersDraft> {
  const out = await drafter({
    system: draftClassesSystem(engine),
    prompt: draftClassesPrompt(engine, record, characterId, opts),
    schema: draftClassesSchema(engine),
    effort: opts.effort ?? "medium",
  });
  return classOffersOf(engine, out, opts);
}

/** Whether the character is due offers: Level 10 or above, no class, none standing. */
export function dueOffers(engine: Engine, c: Sheet): boolean {
  return c.level >= (engine.rules.classes.selection.level as number) && !c.class && !c.classOffers.length && !c.dead;
}
