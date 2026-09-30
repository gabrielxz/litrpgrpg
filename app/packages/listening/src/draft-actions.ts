/**
 * Drafting the table's bookkeeping from table talk (app/DESIGN.md, M2): items found, handed over,
 * claimed, used up, or lost; quests advanced, completed, or failed; VE the GM grants aloud that
 * no other record pays; party invitations and their answers; the counts only the fiction knows,
 * toward Achievement titles; and the GM's prepared items whose cue the table has reached.
 * A separate request from the events drafter, so each set of instructions is judged on its own.
 *
 * Each draft is a record action (or, for a Prep cue, a suggestion naming the prepared item) that
 * the GM accepts, edits, or dismisses; recording it by hand makes the same record. The standing
 * instructions come from the rules alone and cache; the campaign's items, quests, and Prep go in
 * the request.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, CampaignRecord, type Draft, type Quest, type PrepItem, tickedCounters } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, type Scene, cited, earlierOf, lineOrder, rosterOf, section, transcriptOf } from "./draft-events.ts";
import type { Drafted } from "./script.ts";

export const DRAFT_ACTIONS_FEATURE = "draft-actions";

/** The categories this drafter drafts, as the scorer names them. */
export const ACTION_CATEGORIES = [
  "item.give",
  "item.move",
  "item.remove",
  "quest.progress",
  "quest.complete",
  "quest.fail",
  "ve.award",
  "party.invite",
  "party.answer",
  "counter.tick",
  "suggestion:prep-cue",
];

/** A drafted action or Prep cue, with the model's reason for the GM. */
export type ActionDraft = Drafted & { id: string; why: string };

export interface ActionDrafts {
  drafts: ActionDraft[];
  dropped: { draft: unknown; why: string }[];
  repaired: string[];
}

// ------------------------------------------------------------ rules ---

interface CatalogRow {
  title: string;
  trigger: string;
  counter?: string;
}

/** Each count the GM ticks by hand, with the deed that counts, from the Achievement catalog. */
export function countersOf(engine: Engine): { counter: string; deed: string }[] {
  const t = engine.rules.titles;
  const rows = [...(Object.values(t.achievement_catalog) as CatalogRow[][]).flat(), ...(t.tutorial_titles as CatalogRow[])];
  return tickedCounters(engine).map((counter) => ({ counter, deed: rows.find((r) => r.counter === counter)!.trigger }));
}

// ----------------------------------------------------------- schema ---

export function draftActionsSchema(engine: Engine) {
  const counters = tickedCounters(engine) as [string, ...string[]];
  const lines = z.array(z.string()).describe("The ids of the lines that show it happened.");
  const why = z.string().describe("One sentence for the GM: what happened in the lines that this records.");
  return z.object({
    items: z.array(
      z.object({
        lines,
        kind: z.enum(["give", "move", "remove"]),
        from: z.string().nullable().describe("move and remove: a character id, or spoils."),
        to: z.string().nullable().describe("give and move: a character id, or spoils."),
        name: z.string().describe("The item's name; a held item's name exactly as held."),
        count: z.number().int().min(1),
        why,
      }),
    ),
    quests: z.array(
      z.object({
        lines,
        kind: z.enum(["progress", "complete", "fail"]),
        questId: z.string().describe("The quest's id from the Quests list."),
        by: z.number().int().min(1).nullable().describe("progress: how far the count moved."),
        why,
      }),
    ),
    ve: z.array(
      z.object({
        lines,
        kind: z.enum(["core", "other"]),
        core: z.string().nullable().describe("core: the Core's name."),
        note: z.string().nullable().describe("other: what the VE is for, in a few words."),
        awards: z.array(z.object({ characterId: z.string(), ve: z.number().int().min(1) })),
        why,
      }),
    ),
    parties: z.array(
      z.object({
        lines,
        kind: z.enum(["invite", "answer"]),
        fromId: z.string().describe("The character who invites."),
        toId: z.string().describe("The character invited."),
        accept: z.boolean().nullable().describe("answer: whether the invited character joins."),
        why,
      }),
    ),
    counters: z.array(z.object({ lines, characterId: z.string(), counter: z.enum(counters), why })),
    cues: z.array(z.object({ lines, prepId: z.string().describe("The prepared item's id from the Prep list."), why })),
  });
}

export type DraftActionsOutput = z.infer<ReturnType<typeof draftActionsSchema>>;

// ----------------------------------------------------- instructions ---

export function draftActionsSystem(engine: Engine): string {
  const counters = countersOf(engine)
    .map((c) => `- ${c.counter}: ${c.deed}`)
    .join("\n");
  return `You read the transcript of a scene from a tabletop game of Gradebreaker, a LitRPG roleplaying game, and draft the bookkeeping the Game Master (GM) would otherwise enter by hand in the app. Your drafts go to the GM alone. The GM accepts, edits, or dismisses each one, and can record anything you missed by hand, so a wrong draft costs more than a missed one: draft only what the lines show happened.

Another reader drafts the moments of character (who chose what under pressure). You draft only what changes the record: items, quests, counts, and the GM's prepared material.

# Items

The party's items are named stacks held by a character or left unclaimed in the spoils (the pile the party has not divided). Holders are character ids, or spoils. Use a held item's name exactly as the "Items held" list gives it.

- give: something enters the party's hands from the world. Found, looted from a body or a cache, taken from or handed over by someone outside the party. It goes to the character who took it, or to spoils when it is set down for the party.
- move: something changes hands inside the party. From one character to another, claimed from the spoils, or put back on the pile.
- remove: something leaves the party. Eaten, used up, broken, lost, or given to someone outside the party.

Draft each change of hands on its own and in order, even when a later one undoes an earlier one: the record replays them one by one. When the GM lists what is found and a character claims a piece afterward, the find goes to spoils and the claim is a move from spoils. A found item of the same kind as one a character holds takes the held name.

Items are what a character sheet would list: gear, weapons, pills, shards, rations, and other named finds. Water drunk, a meal eaten on the spot, and scraps nobody would write down are not items. A Core the GM says is absorbed the moment it is held is Volatile Energy, not an item; draft nothing for it.

The app records some of this itself; never draft these: a pill taken in a fight (the combat tracker), loot a fight drops, and a quest's reward items at completion.

# Quests

Use the quest ids from the Quests list; only an active quest moves.

- progress: a counted objective advanced in the fiction. by is how far.
- complete: the objective is met. The GM saying so, or the lines plainly showing it done, is enough. A counted objective that reaches its count completes; draft the completion, not the progress to it.
- fail: the objective can no longer be met, or the GM says it failed.

# Volatile Energy

Draft an award when the GM grants VE aloud that nothing else in the record pays: a Core absorbed (core, with its name), or VE for something the fiction achieved (other, with a note saying what for). Use the amount the GM states, for each character it goes to; "sixty each" is each character the grant covers, and a character who left the scene is not one of them.

Never draft VE for a kill (the fight's aftermath pays it), a quest's completion (its reward pays it), or a rest.

# Party invitations

- invite: one character asks another, in the fiction, to join them or group up.
- answer: the invited character accepts or declines. It answers an invitation drafted before it in these lines or one in the "Invitations waiting" list.

Players agreeing out of character to play together is not an invitation.

# Counts toward titles

The app counts kills, Downed survivals, and rests itself. These counts only the fiction knows; draft one each time the deed happens, for the character who did it:

${counters}

Each line gives the whole title's trigger; one occurrence of the deed is one count ("ten times" is where the title comes, not what one count needs). The combat tracker records a fight's blows, not these deeds, so a fight the app recorded still brings the count its deed earns: the first into a den or an arena, a fight won with no weapon and no Aether spent. A standoff inside the party is not a fight: weapons drawn between party members and put away again count toward nothing.

# Prepared material

The Prep list holds what the GM prepared: System notices, quests, and fights, each with a cue that says when it fires. Draft a cue when the table reaches the moment the cue describes, citing the lines where it arrives. The GM fires it; you only point to it. A cue the table is only near, or has already passed before these lines, is not drafted.

# What produces nothing

- Players talking about the game as themselves: rules questions, jokes, hypotheticals ("what if we just took it?"), plans for later.
- Life around the table: food, work, a phone call, side conversations.
- A choice taken back before it stood ("no, wait, scratch that"): only what stood counts.
- An offer or a plan: an item offered and not taken has not moved.
- Lines marked "app": what the table already recorded, with its results.

# Output

Cite the lines that show each thing happened. Write each reason in one sentence. When nothing in the scene changes the record, return empty lists.`;
}

// ------------------------------------------------------------ scene ---

const questLine = (q: Quest) =>
  `- ${q.id}: ${q.title} (${q.code}), ${q.status}, held by ${q.holders.join(", ")}: ${q.objective}${q.count ? ` ${q.count.done} of ${q.count.of}.` : ""}`;

const prepLine = (p: PrepItem) => {
  const what =
    p.kind === "notice"
      ? `System notice: ${p.text.replace(/\s+/g, " ")}`
      : p.kind === "quest"
        ? `quest: ${p.quest.objective}`
        : p.kind === "loot"
          ? `loot: ${p.loot.map((x) => `${x.name} ×${x.count}`).join(", ")}`
          : p.kind === "encounter"
            ? `fight: ${p.encounter.name}`
            : `NPC: ${p.npc.who}`;
  return `- ${p.id}: ${p.title}${p.group ? ` (${p.group})` : ""}. Cue: ${p.note?.replace(/\.$/, "") ?? "none written"}. ${what}`;
};

export function draftActionsPrompt(scene: Scene): string {
  const state = scene.record.state;
  const nameOf = new Map([...scene.record.sheets().values()].map((s) => [s.id, s.name]));
  const parties = [...state.parties.values()].map((p) => `- ${p.members.map((m) => nameOf.get(m) ?? m).join(", ")}`);
  const items = [...state.inventory]
    .filter(([, stacks]) => stacks.length)
    .map(([holder, stacks]) => `- ${holder}: ${stacks.map((x) => `${x.name} ×${x.count}`).join(", ")}`);
  const quests = [...state.quests.values()].filter((q) => q.status === "active").map(questLine);
  const prep = [...state.prep.values()].map(prepLine);
  const invites = state.invites.map((i) => `- ${i.fromId} invited ${i.toId}`);
  return [
    section("Roster", rosterOf(scene)),
    section("Parties", parties),
    section("Invitations waiting", invites),
    section("Items held", items),
    section("Quests", quests),
    section("Prep", prep),
    ...earlierOf(scene),
    `# Transcript\n\n${transcriptOf(scene).join("\n")}`,
  ].join("\n\n");
}

// ----------------------------------------------------------- drafts ---

type Out = DraftActionsOutput;
type Raw =
  | (Out["items"][number] & { cat: "items" })
  | (Out["quests"][number] & { cat: "quests" })
  | (Out["ve"][number] & { cat: "ve" })
  | (Out["parties"][number] & { cat: "parties" })
  | (Out["counters"][number] & { cat: "counters" })
  | (Out["cues"][number] & { cat: "cues" });

function actionOf(r: Raw, record: CampaignRecord): Action | string {
  switch (r.cat) {
    case "items":
      if (r.kind === "give") {
        const also = "also" in r ? (r.also as { name: string; count: number }[]) : [];
        return r.to ? { type: "item.give", to: r.to, items: [{ name: r.name, count: r.count }, ...also] } : "a give names who takes it";
      }
      if (r.kind === "move") return r.from && r.to ? { type: "item.move", from: r.from, to: r.to, name: r.name, count: r.count } : "a move names both holders";
      return r.from ? { type: "item.remove", from: r.from, name: r.name, count: r.count } : "a removal names the holder";
    case "quests": {
      const q = record.state.quests.get(r.questId);
      if (!q) return `no quest ${r.questId}`;
      // Progress that fills the count is the completion (the record does not complete a quest on its count).
      if (r.kind === "progress" && !(q.count && q.count.done + (r.by ?? 1) >= q.count.of)) return { type: "quest.progress", questId: q.id, by: r.by ?? 1 };
      if (r.kind === "fail") return { type: "quest.fail", questId: q.id };
      // The quest's stated VE for each holder; the GM sets a scaled quest's payout on the card.
      return { type: "quest.complete", questId: q.id, awards: q.holders.map((h) => ({ characterId: h, ve: q.ve ?? 0 })) };
    }
    case "ve": {
      const awards = r.awards.filter((w) => w.ve > 0);
      if (!awards.length) return "an award names who receives VE";
      const basis = r.kind === "core" && r.core?.trim() ? { kind: "core" as const, core: r.core.trim() } : { kind: "other" as const, note: (r.note ?? r.core ?? "").trim() || "Granted at the table" };
      return { type: "ve.award", basis, awards };
    }
    case "parties": {
      if (r.kind === "invite") return { type: "party.invite", fromId: r.fromId, toId: r.toId };
      // The invitation it answers: one waiting in the record, or one drafted before it.
      const invite = record.state.invites.find((i) => i.fromId === r.fromId && i.toId === r.toId);
      if (!invite) return `no invitation from ${r.fromId} to ${r.toId} waits`;
      return { type: "party.answer", inviteId: invite.id, accept: r.accept ?? true };
    }
    case "counters":
      return { type: "counter.tick", characterId: r.characterId, counter: r.counter, count: 1 };
    case "cues":
      return "a cue is a suggestion";
  }
}

/**
 * The model's output as drafts, in the order the table reached them. Each action is checked
 * against the record as the drafts before it leave it (a shard claimed, then handed on), and one
 * the record refuses is dropped with the reason; a cue must name a prepared item.
 */
export function actionDraftsOf(engine: Engine, scene: Scene, out: DraftActionsOutput): ActionDrafts {
  const order = lineOrder(scene);
  const result: ActionDrafts = { drafts: [], dropped: [], repaired: [] };
  const raws: Raw[] = [
    ...out.items.map((x) => ({ ...x, cat: "items" as const })),
    ...out.quests.map((x) => ({ ...x, cat: "quests" as const })),
    ...out.ve.map((x) => ({ ...x, cat: "ve" as const })),
    ...out.parties.map((x) => ({ ...x, cat: "parties" as const })),
    ...out.counters.map((x) => ({ ...x, cat: "counters" as const })),
    ...out.cues.map((x) => ({ ...x, cat: "cues" as const })),
  ];
  const first = (r: Raw) => Math.min(...r.lines.map((l) => order.get(l) ?? Infinity));
  raws.sort((a, b) => first(a) - first(b));
  // Things found together and taken by one holder are one give ("a bag of shards"): gives to the
  // same holder that start on the same line merge.
  const gives = new Map<string, Raw & { cat: "items"; also: { name: string; count: number }[] }>();
  const merged: Raw[] = [];
  for (const r of raws) {
    if (r.cat !== "items" || r.kind !== "give" || !r.to) {
      merged.push(r);
      continue;
    }
    const key = `${r.to}|${first(r)}`;
    const into = gives.get(key);
    if (into) {
      into.also.push({ name: r.name, count: r.count });
      into.lines = [...new Set([...into.lines, ...r.lines])];
      into.why = `${into.why} ${r.why}`;
      continue;
    }
    const g = { ...r, also: [] as { name: string; count: number }[] };
    gives.set(key, g);
    merged.push(g);
  }
  // A thing that passes through someone's hands on its way (taken from Joe and set on the pile,
  // taken from the pile and handed to someone outside the party) is one change of hands: a move
  // followed, on a line they share, by the same item leaving its new holder merges into one.
  const through: Raw[] = [];
  for (const r of merged) {
    const prev = through.at(-1);
    const passes =
      prev?.cat === "items" &&
      prev.kind === "move" &&
      r.cat === "items" &&
      (r.kind === "move" || r.kind === "remove") &&
      r.from === prev.to &&
      r.name.trim().toLowerCase() === prev.name.trim().toLowerCase() &&
      r.lines.some((l) => prev.lines.includes(l));
    if (!passes) {
      through.push(r);
      continue;
    }
    const lines = [...new Set([...prev.lines, ...r.lines])];
    const why = `${prev.why} ${r.why}`;
    through[through.length - 1] =
      r.kind === "remove" ? { ...r, from: prev.from, lines, why } : { ...prev, to: r.to, lines, why };
    // Handed straight back where it started: nothing changed hands.
    const last = through.at(-1)!;
    if (last.cat === "items" && last.kind === "move" && last.from === last.to) through.pop();
  }
  raws.splice(0, raws.length, ...through);
  const check = new CampaignRecord(engine, scene.record.log);
  let n = 0;
  for (const r of raws) {
    const id = `action-${++n}`;
    const c = cited(scene, r.lines);
    const lines = c.kept;
    if (c.unknown.length) result.repaired.push(`${id}: dropped line ids the scene lacks (${c.unknown.join(", ")})`);
    if (c.drop) {
      result.dropped.push({ draft: r, why: c.drop });
      continue;
    }
    if (r.cat === "cues") {
      if (!check.state.prep.has(r.prepId)) {
        result.dropped.push({ draft: r, why: `no prepared item ${r.prepId}` });
        continue;
      }
      result.drafts.push({ id, lines, suggestion: { kind: "prep-cue", key: r.prepId }, why: r.why });
      continue;
    }
    const action = actionOf(r, check);
    if (typeof action === "string") {
      result.dropped.push({ draft: r, why: action });
      continue;
    }
    const env: Draft = { id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "drafter" }, source: "suggestion", cause: lines.join(","), action };
    const preview = check.preview(env);
    if (!preview.accepted) {
      result.dropped.push({ draft: r, why: `the record refuses it: ${preview.reason}` });
      continue;
    }
    check.append(env);
    result.drafts.push({ id, lines, action, why: r.why });
  }
  return result;
}

export async function draftActions(engine: Engine, drafter: Drafter, scene: Scene, opts: { effort?: Effort } = {}): Promise<ActionDrafts> {
  const out = await drafter({
    system: draftActionsSystem(engine),
    prompt: draftActionsPrompt(scene),
    schema: draftActionsSchema(engine),
    effort: opts.effort ?? "medium",
  });
  return actionDraftsOf(engine, scene, out);
}
