/**
 * Drafting the suggestion panel's kinds from table talk (app/DESIGN.md, M2, "Suggestion panel"):
 * the titles only the fiction earns (the tutorial's, whose deeds no count tracks), Battle Memory
 * Cards the GM grants for a moment of extreme stress, and Hidden Achievements for an improbable
 * deed. What the record makes due by itself (a cascade's card, a Downing survived, a count that
 * reached its title) is already on the GM's list and is not drafted.
 *
 * Each draft is a suggestion with the action accepting it records (a `title.grant` or a
 * `memory.grant`), which the GM accepts, edits, or dismisses; granting by hand makes the same
 * record. A third request beside the moments and the bookkeeping, judged on its own numbers.
 */
import { ATTRIBUTES, type Engine } from "@gradebreaker/engine";
import { type Action, CampaignRecord, type Draft, type Sheet } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, type Scene, cited, earlierOf, lineOrder, rosterOf, section, transcriptOf } from "./draft-events.ts";
import type { Drafted } from "./script.ts";

export const DRAFT_SUGGESTIONS_FEATURE = "draft-suggestions";

/** The categories this drafter drafts, as the scorer names them. */
export const SUGGESTION_CATEGORIES = ["suggestion:title", "suggestion:battle-memory", "suggestion:hidden-achievement"];

/** A drafted suggestion, with the action accepting it records and the model's reason for the GM. */
export type SuggestionDraft = Extract<Drafted, { suggestion: unknown }> & { id: string; why: string; accept: Action };

export interface SuggestionDrafts {
  drafts: SuggestionDraft[];
  dropped: { draft: unknown; why: string }[];
  repaired: string[];
}

// ------------------------------------------------------------ rules ---

interface FictionTitle {
  title: string;
  category: string;
  earned_by: string;
  effect: string;
  counter?: string;
}

/** Titles whose deed no count tracks: the GM confers them from the fiction. */
export function fictionTitles(engine: Engine): FictionTitle[] {
  return (engine.rules.titles.tutorial_titles as FictionTitle[]).filter((t) => !t.counter);
}

const hiddenBonus = (engine: Engine): { min: number; max: number } => {
  const row = (engine.rules.titles.bonus_magnitudes as { class: string; f_grade: string }[]).find((r) => r.class === "Hidden Achievement")!;
  const [min, max] = row.f_grade.match(/\d+/g)!.map(Number) as [number, number];
  return { min, max };
};

// ----------------------------------------------------------- schema ---

export function draftSuggestionsSchema(engine: Engine) {
  const titles = fictionTitles(engine).map((t) => t.title) as [string, ...string[]];
  const { min, max } = hiddenBonus(engine);
  const lines = z.array(z.string()).describe("The ids of the lines that show it happened.");
  const why = z.string().describe("One sentence for the GM: what happened in the lines that earns it.");
  return z.object({
    titles: z.array(z.object({ lines, characterId: z.string(), title: z.enum(titles), why })),
    memories: z.array(
      z.object({
        lines,
        characterId: z.string(),
        moment: z.string().describe("What the card records, in one line from the character's side: the moment, not its meaning, in the world's words (Health, not HP; no rolls or rounds)."),
        why,
      }),
    ),
    hidden: z.array(
      z.object({
        lines,
        characterId: z.string(),
        name: z.string().describe("A short title name, two or three words."),
        deed: z.string().describe("The trigger, written as the deed: 'Triggered by ...'."),
        attribute: z.enum(ATTRIBUTES),
        bonus: z.number().int().min(min).max(max),
        why,
      }),
    ),
  });
}

export type DraftSuggestionsOutput = z.infer<ReturnType<typeof draftSuggestionsSchema>>;

// ----------------------------------------------------- instructions ---

export function draftSuggestionsSystem(engine: Engine): string {
  const p = engine.rules.principles.battle_memory_triggers as { automatic: string[]; gm_granted: string };
  const hidden = (engine.rules.titles.categories as { name: string; shape: string }[]).find((c) => c.name === "Hidden Achievement")!;
  const { min, max } = hiddenBonus(engine);
  const titles = fictionTitles(engine)
    .map((t) => `- ${t.title} (${t.category}): ${t.earned_by}.`)
    .join("\n");
  return `You read the transcript of a scene from a tabletop game of Gradebreaker, a LitRPG roleplaying game, and point the Game Master (GM) to rewards the fiction has earned that the app cannot see for itself. Your suggestions go to the GM alone, who accepts, edits, or dismisses each one. These rewards are rare by design: a suggestion the GM dismisses costs attention at the table, so suggest only what the lines plainly show, and expect most scenes to earn nothing.

Other readers draft the moments of character and the bookkeeping (items, quests, counts toward the catalog's titles). You suggest only the three kinds below.

# Titles the fiction earns

These titles have no count behind them; each is earned by a deed. Suggest one when a player character does the deed in these lines, for that character. A character who already holds the title (see "Titles and cards") does not earn it again.

${titles}

A deed that only an NPC does earns nobody the title. The GM may say the title is delivered later; suggest it where the deed happens.

# Battle Memory Cards

The GM grants a card for ${p.gm_granted}: surviving at near-zero Health, witnessing something beyond comprehension, an outcome that should not have happened. Suggest a card for the player character who lived the moment, with the moment in one line.

The app makes these due by itself; never suggest them: ${p.automatic.join("; ")}. "Titles and cards" lists the cards already due. Routine, risk-free activity earns no card, and neither does a hard fight that went as fights go.

# Hidden Achievements

${hidden.shape} Surviving an encounter the character should have died in, solving a problem in a way nobody intended, completing an objective under a constraint they set themselves, an outcome the System did not predict. Suggest one only for a deed the table would remember; a strong play is not one.

Write it in three parts: a short name (two or three words, a title a character would carry), the deed as its trigger ("Triggered by surviving an encounter against an enemy a full Grade above you"), and a bonus of +${min} to +${max} to the one Attribute the deed showed.

# What produces nothing

- Players talking about the game as themselves: rules questions, jokes, hypotheticals ("what if we all fought it?"), plans for later.
- Life around the table: food, work, a phone call, side conversations.
- A choice taken back before it stood: only what stood counts.
- The GM reading out what the app recorded: rolls, damage, a Clash. Lines marked "app" are what the table already recorded, with its results.
- Talk about another game, or a recap of an earlier session.

# Output

Cite the lines that show each thing happened. Write each reason in one sentence. When nothing in the scene earns a reward, return empty lists.`;
}

// ------------------------------------------------------------ scene ---

const heldLine = (s: Sheet) => {
  const titles = s.titles.filter((t) => t.status === "active").map((t) => t.name);
  const due = s.principles.due.map((d) => d.label);
  return `- ${s.id}: titles held: ${titles.length ? titles.join(", ") : "none"}; Battle Memory Cards due: ${due.length ? due.join("; ") : "none"}.`;
};

export function draftSuggestionsPrompt(scene: Scene): string {
  const sheets = [...scene.record.sheets().values()];
  return [section("Roster", rosterOf(scene)), section("Titles and cards", sheets.map(heldLine)), ...earlierOf(scene), `# Transcript\n\n${transcriptOf(scene).join("\n")}`].join("\n\n");
}

// ----------------------------------------------------------- drafts ---

type Out = DraftSuggestionsOutput;
type Raw = (Out["titles"][number] & { cat: "titles" }) | (Out["memories"][number] & { cat: "memories" }) | (Out["hidden"][number] & { cat: "hidden" });

function suggestionOf(r: Raw): { suggestion: SuggestionDraft["suggestion"]; accept: Action } {
  switch (r.cat) {
    case "titles":
      return {
        suggestion: { kind: "title", key: r.title, characterId: r.characterId },
        accept: { type: "title.grant", characterId: r.characterId, title: { catalog: r.title } },
      };
    case "memories":
      return {
        suggestion: { kind: "battle-memory", key: r.moment.trim(), characterId: r.characterId },
        accept: { type: "memory.grant", characterId: r.characterId, text: r.moment.trim() },
      };
    case "hidden":
      return {
        suggestion: { kind: "hidden-achievement", key: r.name.trim(), characterId: r.characterId },
        accept: {
          type: "title.grant",
          characterId: r.characterId,
          title: { name: r.name.trim(), category: "Hidden Achievement", bonus: { [r.attribute]: r.bonus }, effect: r.deed.trim() },
        },
      };
  }
}

/**
 * The model's output as suggestions, in the order the table reached them. Each is checked against
 * the record (a living character, a title not already held); two for one character and one title
 * merge, and a card for a character whose card for these lines is already due is dropped.
 */
export function suggestionDraftsOf(engine: Engine, scene: Scene, out: DraftSuggestionsOutput): SuggestionDrafts {
  const order = lineOrder(scene);
  const result: SuggestionDrafts = { drafts: [], dropped: [], repaired: [] };
  const raws: Raw[] = [
    ...out.titles.map((x) => ({ ...x, cat: "titles" as const })),
    ...out.memories.map((x) => ({ ...x, cat: "memories" as const })),
    ...out.hidden.map((x) => ({ ...x, cat: "hidden" as const })),
  ];
  const first = (r: Raw) => Math.min(...r.lines.map((l) => order.get(l) ?? Infinity));
  raws.sort((a, b) => first(a) - first(b));
  const check = new CampaignRecord(engine, scene.record.log);
  const titled = new Set<string>();
  let n = 0;
  for (const r of raws) {
    const id = `suggestion-${++n}`;
    const c = cited(scene, r.lines);
    const lines = c.kept;
    if (c.unknown.length) result.repaired.push(`${id}: dropped line ids the scene lacks (${c.unknown.join(", ")})`);
    if (c.drop) {
      result.dropped.push({ draft: r, why: c.drop });
      continue;
    }
    const sheet = check.sheets().get(r.characterId);
    if (!sheet || sheet.dead) {
      result.dropped.push({ draft: r, why: sheet ? `${sheet.name} is dead` : `no character ${r.characterId}` });
      continue;
    }
    const { suggestion, accept } = suggestionOf(r);
    if (suggestion.kind !== "battle-memory") {
      const key = `${r.characterId}|${suggestion.key.toLowerCase()}`;
      if (titled.has(key) || sheet.titles.some((t) => t.name.toLowerCase() === suggestion.key.toLowerCase())) {
        result.dropped.push({ draft: r, why: `${sheet.name} already holds or has ${suggestion.key} suggested` });
        continue;
      }
      titled.add(key);
    }
    const env: Draft = { id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "drafter" }, source: "suggestion", cause: lines.join(","), action: accept };
    const preview = check.preview(env);
    if (!preview.accepted) {
      result.dropped.push({ draft: r, why: `the record refuses it: ${preview.reason}` });
      continue;
    }
    result.drafts.push({ id, lines, suggestion, accept, why: r.why });
  }
  return result;
}

export async function draftSuggestions(engine: Engine, drafter: Drafter, scene: Scene, opts: { effort?: Effort } = {}): Promise<SuggestionDrafts> {
  const out = await drafter({
    system: draftSuggestionsSystem(engine),
    prompt: draftSuggestionsPrompt(scene),
    schema: draftSuggestionsSchema(engine),
    effort: opts.effort ?? "medium",
  });
  return suggestionDraftsOf(engine, scene, out);
}
