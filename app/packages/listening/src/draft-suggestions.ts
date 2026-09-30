/**
 * Drafting the suggestion panel's kinds from table talk (app/DESIGN.md, M2, "Suggestion panel"):
 * the titles only the fiction earns (the tutorial's, whose deeds no count tracks), Battle Memory
 * Cards the GM grants for a moment of extreme stress, Hidden Achievements for an improbable deed,
 * and quests (Quests, "Quest Categories"): a Routine quest the System would post for a threat or
 * a find the scene establishes, a Faction quest an NPC asks for, a Hidden quest for a pattern a
 * character has begun, and the partial reveal of a Hidden quest whose pattern repeats. What the
 * record makes due by itself (a cascade's card, a Downing survived, a count that reached its
 * title) is already on the GM's list and is not drafted; Mandates are the GM's story, and
 * Personal Opportunities are drafted at the sweep.
 *
 * Each draft is a suggestion with the action accepting it records (a `title.grant`, a
 * `memory.grant`, a `quest.issue` opened in the Quests form, or a `quest.reveal`), which the GM
 * accepts, edits, or dismisses; recording it by hand makes the same record. A Hidden Achievement
 * may carry a second reading (another Attribute the deed showed) for the GM to choose. A third
 * request beside the moments and the bookkeeping, judged on its own numbers.
 */
import { ATTRIBUTES, type Engine } from "@gradebreaker/engine";
import { type Action, CampaignRecord, type Draft, type Quest, type QuestSpec, type Sheet, nextQuestCode } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, type Scene, cited, earlierOf, lineOrder, rosterOf, section, transcriptOf } from "./draft-events.ts";
import type { Drafted } from "./script.ts";
import { campaignContext } from "./memory.ts";

export const DRAFT_SUGGESTIONS_FEATURE = "draft-suggestions";

/** The categories this drafter drafts, as the scorer names them. */
export const SUGGESTION_CATEGORIES = ["suggestion:title", "suggestion:battle-memory", "suggestion:hidden-achievement", "suggestion:quest"];

/** Another reading of the same deed, which the GM may take instead: its label, why, and what accepting it records. */
export interface Alternative {
  label: string;
  why: string;
  accept: Action;
}

/** A drafted suggestion, with the action accepting it records and the model's reason for the GM. */
export type SuggestionDraft = Extract<Drafted, { suggestion: unknown }> & { id: string; why: string; accept: Action; alternatives?: Alternative[] };

/** The quest categories drafted from talk: Mandates are the GM's story, Personal Opportunities come at the sweep. */
export const DRAFTED_QUESTS = ["Routine", "Faction", "Hidden"] as const;

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

/** The difficulties a quest pays at, from the Reward Reference Table. */
const difficulties = (engine: Engine) => (engine.rules.quests.ve_rewards as { difficulty: string }[]).map((r) => r.difficulty) as [string, ...string[]];

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
        alternative: z
          .object({ attribute: z.enum(ATTRIBUTES), why: z.string().describe("One sentence: what in the deed shows this Attribute instead.") })
          .nullable()
          .describe("When the deed shows a second Attribute as plainly as the first, that reading; else null."),
      }),
    ),
    quests: z.array(
      z.object({
        lines,
        characterId: z.string().describe("The character the quest goes to: the one the NPC asked, the one who began the pattern, or the one present when the System posts it."),
        category: z.enum(DRAFTED_QUESTS),
        title: z.string().describe("The log's title, a few words in the System's register (a Faction quest's, in its issuer's)."),
        issuer: z.string().nullable().describe("A Faction quest's issuer: the NPC or group who asked. Null for the System's."),
        difficulty: z.enum(difficulties(engine)),
        objective: z.string().describe("The objective as the log states it, in the world's words."),
        count: z.number().int().min(2).nullable().describe("A counted objective's target ('eliminate three'); else null."),
        countFixed: z.boolean().describe("True when the count cannot grow with the party: a place reached, a person protected, a thing recovered."),
        why,
      }),
    ),
    reveals: z.array(
      z.object({
        lines,
        questId: z.string().describe("The fully obscured Hidden quest's id, from Quests."),
        name: z.string().describe("The suggestive name the log shows, a few words in quotation-free form: Let It Finish."),
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
  return `You read the transcript of a scene from a tabletop game of Gradebreaker, a LitRPG roleplaying game, and point the Game Master (GM) to rewards the fiction has earned, and quests it has opened, that the app cannot see for itself. Your suggestions go to the GM alone, who accepts, edits, or dismisses each one. These rewards are rare by design: a suggestion the GM dismisses costs attention at the table, so suggest only what the lines plainly show, and expect most scenes to earn nothing.

Other readers draft the moments of character and the bookkeeping (items, quests, counts toward the catalog's titles). You suggest only the kinds below.

# Titles the fiction earns

These titles have no count behind them; each is earned by a deed. Suggest one when a player character does the deed in these lines, for that character. A character who already holds the title (see "Titles and cards") does not earn it again.

${titles}

A deed that only an NPC does earns nobody the title. The GM may say the title is delivered later; suggest it where the deed happens.

# Battle Memory Cards

The GM grants a card for ${p.gm_granted}: surviving at near-zero Health, witnessing something beyond comprehension, an outcome that should not have happened. Suggest a card for the player character who lived the moment, with the moment in one line.

The app makes these due by itself; never suggest them: ${p.automatic.join("; ")}. "Titles and cards" lists the cards already due. Routine, risk-free activity earns no card, and neither does a hard fight that went as fights go.

# Hidden Achievements

${hidden.shape} Surviving an encounter the character should have died in, solving a problem in a way nobody intended, completing an objective under a constraint they set themselves, an outcome the System did not predict. Suggest one only for a deed the table would remember; a strong play is not one.

Write it in three parts: a short name (two or three words, a title a character would carry), the deed as its trigger ("Triggered by surviving an encounter against an enemy a full Grade above you"), and a bonus of +${min} to +${max} to the one Attribute the deed showed. When the deed shows a second Attribute as plainly, name it as the alternative, and the GM chooses.

# Quests

The System posts quests, and NPCs ask for things; either way the quest log records them. Suggest a quest only when the lines establish it and no quest in "Quests" already covers it. Three kinds:

- Routine: the scene establishes a local threat, a resource, or ground to scout that the System would post as a task (a nest past the fence, creatures reported on the road, a cache to recover). Objective counted where the fiction gives a number.
- Faction: an NPC or a group asks a character to do something for them and names it (find the missing crew, carry a message, hold the gate). The issuer is the one who asked. A plan the two sides make together is not a request, and a request the character refuses aloud earns nothing.
- Hidden: a pattern the System would watch without saying so (sparing what they could kill, going back for someone, keeping a promise at a cost). A pattern is the same kind of choice made at least twice by the same character, both times in these lines, or once here and once in "Earlier talk". One choice, however costly, is not a pattern: the other readers log it as a moment, and a singular deed may earn a Hidden Achievement. The log shows the quest fully obscured; its title and objective are the GM's to know.

When a character repeats the pattern of a Hidden quest in "Quests" that is still fully obscured, suggest its partial reveal instead: a suggestive name, a few words, that points at the pattern without stating the condition.

A scene opens one quest for a character at most, and most scenes open none. Difficulty follows the stakes the lines show: Trivial for an errand, Hard for a real danger to the party, Severe or Peak only for a threat above it. Mandates and Personal Opportunities are never drafted here.

# What produces nothing

- Players talking about the game as themselves: rules questions, jokes, hypotheticals ("what if we all fought it?"), plans for later.
- Life around the table: food, work, a phone call, side conversations.
- A choice taken back before it stood: only what stood counts.
- The GM reading out what the app recorded: rolls, damage, a Clash. Lines marked "app" are what the table already recorded, with its results.
- Talk about another game, or a recap of an earlier session.

# Output

Cite the lines that show each thing happened. Write each reason in one sentence. When nothing in the scene earns a reward or opens a quest, return empty lists.`;
}

// ------------------------------------------------------------ scene ---

const heldLine = (s: Sheet) => {
  const titles = s.titles.filter((t) => t.status === "active").map((t) => t.name);
  const due = s.principles.due.map((d) => d.label);
  return `- ${s.id}: titles held: ${titles.length ? titles.join(", ") : "none"}; Battle Memory Cards due: ${due.length ? due.join("; ") : "none"}.`;
};

/** A quest as the drafter reads it: open quests only, a Hidden quest with its mode. */
const questLine = (q: Quest, nameOf: (id: string) => string) =>
  `- ${q.id}: [${q.code}] ${q.category}${q.hidden ? ` (${q.hidden}${q.hiddenName ? `: "${q.hiddenName}"` : ""})` : ""}: ${q.title}. ${q.objective}${q.count ? ` (${q.count.done}/${q.count.of})` : ""}. Held by ${q.holders.map(nameOf).join(", ") || "nobody"}${q.status === "offered" ? " (offered)" : ""}.`;

export function draftSuggestionsPrompt(scene: Scene): string {
  const sheets = [...scene.record.sheets().values()];
  const nameOf = (id: string) => scene.record.sheets().get(id)?.name ?? id;
  const quests = [...scene.record.state.quests.values()].filter((q) => q.status === "active" || q.status === "offered").map((q) => questLine(q, nameOf));
  return [
    ...campaignContext(scene.record),
    section("Roster", rosterOf(scene)),
    section("Titles and cards", sheets.map(heldLine)),
    section("Quests", quests.length ? quests : ["- none open"]),
    ...earlierOf(scene),
    `# Transcript\n\n${transcriptOf(scene).join("\n")}`,
  ].join("\n\n");
}

// ----------------------------------------------------------- drafts ---

type Out = DraftSuggestionsOutput;
type Raw =
  | (Out["titles"][number] & { cat: "titles" })
  | (Out["memories"][number] & { cat: "memories" })
  | (Out["hidden"][number] & { cat: "hidden" })
  | (Out["quests"][number] & { cat: "quests"; code: string; grade: string })
  | (Out["reveals"][number] & { cat: "reveals"; characterId: string; code: string });

const hiddenGrant = (r: Out["hidden"][number], attribute: string): Action => ({
  type: "title.grant",
  characterId: r.characterId,
  title: { name: r.name.trim(), category: "Hidden Achievement", bonus: { [attribute]: r.bonus }, effect: r.deed.trim() },
});

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
      return { suggestion: { kind: "hidden-achievement", key: r.name.trim(), characterId: r.characterId }, accept: hiddenGrant(r, r.attribute) };
    case "quests": {
      const quest: QuestSpec = { id: r.code, category: r.category, title: r.title.trim(), grade: r.grade, difficulty: r.difficulty, objective: r.objective.trim() };
      if (r.category === "Faction" && r.issuer?.trim()) quest.issuer = r.issuer.trim();
      if (r.count) quest.count = r.count;
      if (r.count && r.countFixed) quest.countFixed = true;
      if (r.category === "Hidden") quest.hidden = "obscured";
      return { suggestion: { kind: "quest", key: r.title.trim(), characterId: r.characterId }, accept: { type: "quest.issue", quest, to: [r.characterId] } };
    }
    case "reveals":
      return { suggestion: { kind: "quest", key: r.code, characterId: r.characterId }, accept: { type: "quest.reveal", questId: r.questId, name: r.name.trim() } };
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
  // New quests take the next free codes, in the order drafted; a reveal names the quest's holder.
  const codes: { code: string }[] = [...scene.record.state.quests.values()];
  const quests = scene.record.state.quests;
  const raws: Raw[] = [
    ...out.titles.map((x) => ({ ...x, cat: "titles" as const })),
    ...out.memories.map((x) => ({ ...x, cat: "memories" as const })),
    ...out.hidden.map((x) => ({ ...x, cat: "hidden" as const })),
    ...out.quests.map((x) => {
      const code = nextQuestCode(codes, x.category);
      codes.push({ code });
      return { ...x, cat: "quests" as const, code, grade: scene.record.sheets().get(x.characterId)?.grade ?? "F" };
    }),
    ...out.reveals.flatMap((x) => {
      const q = quests.get(x.questId);
      if (!q?.holders[0]) {
        result.dropped.push({ draft: x, why: q ? `${q.code} has no holder` : `no quest ${x.questId}` });
        return [];
      }
      return [{ ...x, cat: "reveals" as const, characterId: q.holders[0], code: q.code }];
    }),
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
    if (r.cat === "quests") {
      // A quest by the same title already open for the character is the same quest.
      const open = [...quests.values()].some((q) => (q.status === "active" || q.status === "offered") && q.holders.includes(r.characterId) && q.title.toLowerCase() === r.title.trim().toLowerCase());
      if (open) {
        result.dropped.push({ draft: r, why: `${sheet.name} already holds ${r.title.trim()}` });
        continue;
      }
    } else if (suggestion.kind !== "battle-memory") {
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
    const draft: SuggestionDraft = { id, lines, suggestion, accept, why: r.why };
    if (r.cat === "hidden" && r.alternative && r.alternative.attribute !== r.attribute)
      draft.alternatives = [{ label: `+${r.bonus} ${r.alternative.attribute}`, why: r.alternative.why, accept: hiddenGrant(r, r.alternative.attribute) }];
    result.drafts.push(draft);
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
